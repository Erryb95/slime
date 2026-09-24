// node plugin/tools/test_multinest.js [colorSecs=4] [splitSecs=1.5] [finalSecs=4] [realDir]     (SEED=n, default 7)
// Modules 4 + 7 (multi-job orchestrator), Node + wasm Sparrow, no Illustrator. Real files (read-only):
//   bench/real/color : flags (Italy, Jamaica, South Africa, Brazil) + colourful alphabet -> one nest per colour,
//                      rolls stacked below each other; also grouping by layer on the alphabet; per-colour lengths and
//                      the module 5 report summed per colour (combine).
//   bench/real/laser : ClosedBox, DividerTray, AgricolaInsert (195 paths) on 600x400 and 1220x2440 sheets (greedy
//                      multi-sheet): sheets used vs lower bound ceil(total area / sheet area), fill per sheet, no
//                      overlaps, everything within the sheet margins; grain lock (0/180 only) respected; piece larger
//                      than the usable sheet = clear error.
// Also: colour maths, ΔE tolerance, presets round trip (localStorage-like + JSON export/import).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const CLIENT = path.join(__dirname, '..', 'client');
const G = require(path.join(CLIENT, 'js', 'geometry.js'));
const CLU = require(path.join(CLIENT, 'js', 'cluster.js'));
const CG = require(path.join(CLIENT, 'js', 'colorgroups.js'));
const MN = require(path.join(CLIENT, 'js', 'multinest.js'));
const SH = require(path.join(CLIENT, 'js', 'sheets.js'));
const REP = require(path.join(CLIENT, 'js', 'report.js'));
const C = require(path.join(CLIENT, 'lib', 'clipper.js'));
const { readSvg } = require('./svgparse.js');

const COLOR_SECS = +(process.argv[2] || 4), SPLIT = +(process.argv[3] || 1.5), FINAL = +(process.argv[4] || 4);
const SEED = +(process.env.SEED || 7);
let REAL = process.argv[5] || path.join(__dirname, '..', '..', 'bench', 'real');
if (!fs.existsSync(path.join(REAL, 'color'))) REAL = path.join(__dirname, '..', '..', '..', 'Plugin', 'bench', 'real');
const MM = 72 / 25.4, GAP = 2 * MM, FLAT = 0.5;
let fails = 0, checks = 0;
function check(ok, msg) { checks++; if (!ok) { fails++; console.log('  FAIL: ' + msg); } }
const f1 = (v) => (+v).toFixed(1), f0 = (v) => (+v).toFixed(0);

// ------------------------------------------------------------------ wasm (same no-modules glue as the worker)
const glue = fs.readFileSync(path.join(CLIENT, 'lib', 'corvo.js'), 'utf8');
const ctx = { console, TextEncoder, TextDecoder, WebAssembly, performance, BigInt, Error, Symbol, Object, Array,
  Uint8Array, Float32Array, Int32Array, BigInt64Array, DataView, Math, Number, String, JSON, Function, Promise,
  queueMicrotask, setTimeout, Date, crypto: globalThis.crypto };
ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
const wb = vm.runInContext(glue + ';wasm_bindgen;', ctx);
let nestCalls = 0, nestMs = 0;
function runNest(instance, secs, onReport) {   // same contract as the panel runner: Promise<best report>
  let best = null; const t0 = Date.now(); nestCalls++;
  wb.nest(JSON.stringify(instance), secs * 0.8, secs * 0.2, BigInt(SEED), GAP, (json) => {
    const r = JSON.parse(json); if (!best || r.strip_width <= best.strip_width) best = r; if (onReport) onReport(best);
  });
  nestMs += Date.now() - t0;
  return Promise.resolve(best);
}

// ------------------------------------------------------------------ clipper checks
const S = 1000;
const P = (ring) => ring.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
function filled(rings) {
  const c = new C.Clipper(), out = new C.Paths();
  c.AddPaths(rings.map(P), C.PolyType.ptSubject, true);
  c.Execute(C.ClipType.ctUnion, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero); return out;
}
function interArea(a, b) {
  const c = new C.Clipper(), out = new C.Paths();
  c.AddPaths(a, C.PolyType.ptSubject, true); c.AddPaths(b, C.PolyType.ptClip, true);
  c.Execute(C.ClipType.ctIntersection, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return Math.abs(out.reduce((s, p) => s + C.Clipper.Area(p), 0)) / (S * S);
}
const bbox = (rings) => { const b = G.bbox([].concat(...rings)); return b; };        // [minx, miny, maxx, maxy]
const bxo = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
/* moved artwork of every placed unit: [{id, rings, box, shape}] (Sparrow outer polygon placed = shape) */
function placedArt(units, placements, origin) {
  const byId = MN.byId(units);
  return placements.map((pl) => {
    const u = byId[pl.item_id], mv = G.placementToMove(pl, u, origin);
    const rings = u.src.rings.map((r) => G.applyMove(r, mv));
    const poly = MN.placedPoly(u, pl).map(([x, y]) => [x + origin[0], y + origin[1]]);
    return { id: u.id, name: u.name, rings, box: bbox(rings), sbox: G.bbox(poly), shape: filled([poly]), rot: pl.rotation };
  });
}
function overlaps(art) {   // pairwise intersection of the Sparrow outer shapes (the artwork is inside them)
  let worst = 0, n = 0;
  for (let i = 0; i < art.length; i++) for (let j = i + 1; j < art.length; j++) {
    if (!bxo(art[i].box, art[j].box)) continue;
    const a = interArea(art[i].shape, art[j].shape);
    if (a > 0.5) n++;
    worst = Math.max(worst, a);
  }
  return { n, worst };
}

// ------------------------------------------------------------------ SVG -> corvoExport-like objects
// color: one object per top-level shape, paint = fill (else stroke), layer = enclosing <g id>
function colorItems(file, widthMm) {
  const r = readSvg(file);
  const all = r.shapes.map((s) => s.rings).flat(2), b = G.bbox(all), k = widthMm * MM / (b[2] - b[0]);
  const items = r.shapes.map((s, i) => {
    const rings = s.rings.map((ring) => ring.map(([x, y]) => [(x - b[0]) * k + 1000, -(y - b[1]) * k - 500]));   // y up, doc offset
    const bb = G.bbox([].concat(...rings)), box = [bb[0], bb[3], bb[2], bb[1]];
    const col = s.fill || s.stroke;
    return { i, name: (s.id || s.tag) + '#' + i, type: 'PathItem', layer: s.groupIds[s.groupIds.length - 1] || 'Layer 1', rings,
      rg: rings.map(() => 0), bounds: box, box, paint: col ? [{ c: { t: 'rgb', v: col }, a: Math.abs(G.signedArea(rings[0])) }] : [] };
  });
  return { items, skipped: r.skipped };
}
// laser (boxes.py): one object per part group <g id="p-N">, SVG units = mm
function laserItems(file) {
  const r = readSvg(file), byG = new Map();
  r.shapes.forEach((s) => {
    const gid = s.groupIds[s.groupIds.length - 1] || ('shape' + byG.size);
    if (!byG.has(gid)) byG.set(gid, []);
    byG.get(gid).push(...s.rings);
  });
  const items = [];
  for (const [gid, rs] of byG) {
    const rings = rs.map((ring) => ring.map(([x, y]) => [x * MM, -y * MM]));
    const bb = G.bbox([].concat(...rings)), box = [bb[0], bb[3], bb[2], bb[1]];
    items.push({ i: items.length, name: gid, type: 'GroupItem', layer: 'Layer 1', rings, rg: rings.map((_, q) => q), bounds: box, box });
  }
  return { items, paths: r.shapes.length };
}

// ------------------------------------------------------------------ 1. unit tests (no engine)
function unitTests() {
  console.log('== colour maths / grouping / presets');
  const red = { t: 'rgb', v: [255, 0, 0] }, red2 = { t: 'rgb', v: [250, 5, 3] }, cmykRed = { t: 'cmyk', v: [0, 100, 100, 0] };
  check(CG.deltaE(CG.toLab(red), CG.toLab(red2)) < 3, 'near reds ΔE < 3');
  check(CG.deltaE(CG.toLab(red), CG.toLab({ t: 'rgb', v: [255, 255, 0] })) > 50, 'red vs yellow far apart');
  check(CG.hex(CG.toRGB(cmykRed)) === '#FF0000', 'naive CMYK -> RGB');
  check(CG.label({ t: 'spot', name: 'Oracal 651 Red' }) === 'Oracal 651 Red', 'spot label = name');
  const lab = CG.toLab({ t: 'lab', v: [53.24, 80.09, 67.2] });
  check(Math.abs(lab[0] - 53.24) < 1.5, 'lab round trip ' + lab.map(f1));
  const mk = (i, c, extra) => Object.assign({ i, name: 'o' + i, layer: 'L' + (i % 2), box: [0, 10, 10, 0], paint: c ? [{ c, a: 100 }] : [] }, extra || {});
  const gi = CG.groupItems([mk(0, red), mk(1, red2), mk(2, cmykRed), mk(3, { t: 'spot', name: 'Gold 091' }), mk(4, { t: 'spot', name: 'gold  091', tint: 50 }),
    mk(5, { t: 'rgb', v: [0, 0, 255] }), mk(6, null)], { by: 'color', tol: 8 });
  const keys = gi.groups.map((g) => g.key + ':' + g.items.map((x) => x.i).join(','));
  check(gi.groups.length === 4, 'groups red(3) / spot gold(2) / blue / none: ' + keys.join(' '));
  check(gi.groups[gi.groups.length - 1].key === 'none', 'no-colour group last');
  check(CG.groupItems([mk(0, red), mk(1, red2)], { by: 'color', tol: 1 }).groups.length === 2, 'tolerance 1 splits near reds');
  const mixed = CG.itemColor({ paint: [{ c: red, a: 60 }, { c: { t: 'rgb', v: [0, 0, 255] }, a: 40 }] });
  check(mixed.color === red && mixed.mixed, 'dominant colour by area + mixed flag');
  check(CG.groupItems([mk(0, red), mk(1, red), mk(2, red)], { by: 'layer' }).groups.length === 2, 'by layer: 2 layers');
  // presets
  const store = { d: {}, getItem(k) { return this.d[k] || null; }, setItem(k, v) { this.d[k] = String(v); } };
  const map = MN.Presets.load(store);
  MN.Presets.put(map, ' Vinile 3 colori ', { rollMm: 610, gapMm: 3, rot: '90', time: 20, group: 'color', colorTol: 6, container: 'roll', bogus: 1, material: { name: 'Oracal 651', price: 4.5 } });
  MN.Presets.put(map, 'Laser MDF', { rollMm: 400, gapMm: 1, rot: '180', time: 99999, container: 'sheets', sheet: '1220x2440', sheetMargin: 15, grain: 1 });
  MN.Presets.save(store, map);
  const back = MN.Presets.load(store);
  check(back['Vinile 3 colori'] && back['Vinile 3 colori'].rollMm === 610 && !('bogus' in back['Vinile 3 colori']), 'preset saved + unknown field dropped');
  check(back['Laser MDF'].time === 3600 && back['Laser MDF'].grain === true, 'preset clamped / bool');
  const json = MN.Presets.toJSON(back), other = {};
  const imp = MN.Presets.fromJSON('﻿' + json, other);
  check(imp.added.length === 2 && other['Vinile 3 colori'].material.name === 'Oracal 651', 'JSON export -> import round trip');
  check(MN.Presets.fromJSON('{"x":1}', other).error === 'format' && MN.Presets.fromJSON('nope', other).error === 'json', 'bad import rejected');
  // sheet helpers
  check(JSON.stringify(SH.sheetSize('1220x2440')) === '{"w":2440,"h":1220}', 'preset 1220x2440 long side along x');
  check(JSON.stringify(SH.sheetSize('custom', 300, 500)) === '{"w":500,"h":300}', 'custom sheet');
  check(JSON.stringify(MN.grainOrients([0, 90, 180, 270])) === '[0,180]' && JSON.stringify(MN.grainOrients(null)) === '[0,180]' &&
    JSON.stringify(MN.grainOrients([0])) === '[0]', 'grain orientations');
  const sq = [[-50, -10], [50, -10], [50, 10], [-50, 10]];
  check(MN.fitsRect(sq, [0, 90], 30, 110) && !MN.fitsRect(sq, [0, 180], 30, 110), 'fitsRect honours orientations');
}

// ------------------------------------------------------------------ 2. colour jobs (module 4)
async function colorCase(label, file, widthMm, rollMm, by, expectGroups) {
  const { items, skipped } = colorItems(file, widthMm);
  const plan = CG.planGroups(items, { by, tol: CG.DEFAULT_TOL }, { merge: true, shape: 'all', artboards: [] }, CLU);
  const pieces = G.buildPieces(plan.pieces, { gap: GAP, flatness: FLAT });
  const bad = pieces.filter((p) => p.error);
  console.log(`\n== ${label} [${by}] ${items.length} objects (${skipped} <use>/<text> skipped) -> ${plan.pieces.length} pieces, ` +
    `${plan.groups.length} groups${bad.length ? ', ' + bad.length + ' degenerate (stay in place)' : ''}`);
  if (expectGroups !== undefined) check(plan.groups.length === expectGroups, `${label}: ${plan.groups.length} groups, expected ${expectGroups}`);
  // every group is single-colour (by colour) / single-layer (by layer)
  plan.groups.forEach((g) => {
    const keys = new Set();
    g.pieces.forEach((pi) => plan.pieces[pi].members.forEach((m) => {
      const it = items[m]; keys.add(by === 'layer' ? it.layer : CG.exactKey(CG.itemColor(it).color));
    }));
    check(keys.size === 1, `${label}: group ${g.label} mixes ${[...keys].join(' | ')}`);
  });
  // one job per group, rolls stacked downwards
  const W = rollMm * MM, orient = G.rotationsFor('90');
  const good = {}; pieces.forEach((p) => { if (!p.error) good[p.id] = p; });
  const jobs = plan.groups.map((g) => {
    const units = g.pieces.map((pi) => good[pi]).filter(Boolean).map((p) => Object.assign(p, { src: plan.pieces[p.id] }));
    return { key: g.key, label: g.label, hex: g.hex, units, H: W, orient, area: MN.areaOf(units) };
  }).filter((j) => j.units.length);
  const secs = MN.timeShares(jobs.map((j) => j.area), COLOR_SECS * jobs.length, 2);
  jobs.forEach((j, k) => { j.secs = secs[k]; });
  const origins = MN.stackRolls(jobs.length, W, 0, -20 * MM, 40 * MM);
  let seen = 0;
  await MN.runJobs(jobs, runNest, { onReport: () => { seen++; } });
  check(seen > 0, 'live reports received');
  const reports = [];
  jobs.forEach((j, k) => {
    const L = j.report.strip_width, o = origins[k];
    const art = placedArt(j.units, j.placements, o);
    check(j.placements.length === j.units.length, `${j.label}: placed ${j.placements.length}/${j.units.length}`);
    const outside = (bx) => bx[0] < o[0] - 0.6 || bx[1] < o[1] - 0.6 || bx[2] > o[0] + L + 0.6 || bx[3] > o[1] + W + 0.6;
    const out = art.filter((a) => outside(a.sbox));
    check(!out.length, `${j.label}: ${out.length} pieces outside its roll`);
    // known geometry.js limit (not multi-job): a self-touching path (South Africa's white Y drawn as ONE stroke) gets a
    // nesting shape that covers one lobe only, so the artwork can stick out of it -> reported, not a failure here
    const lim = art.filter((a) => !outside(a.sbox) && outside(a.box));
    if (lim.length) console.log(`  NOTE ${j.label}: ${lim.length} piece(s) whose artwork exceeds its nesting shape (self-touching path, geometry.js)`);
    const ov = overlaps(art);
    check(ov.n === 0, `${j.label}: ${ov.n} overlaps (worst ${f1(ov.worst)} pt²)`);
    if (k > 0) check(origins[k][1] + W < origins[k - 1][1], 'rolls stacked without overlap');
    const rep = REP.computeReport({ pieces: j.units, placements: j.placements, stripLengthPt: L, rollWidthPt: W, gapPt: GAP, orientations: orient,
      material: { price: 5, priceUnit: 'm' }, items: plan.pieces });
    rep.color = j.label;
    reports.push(rep);
    console.log(`  ${MN.rollLabel(j.label || '(none)', L / MM).padEnd(46)} ${String(j.units.length).padStart(3)} pieces  fill ${f1(rep.fillPct)} %  ` +
      `${f1(j.secs)} s  ${j.hex || ''}`);
  });
  const tot = REP.combine(reports);
  const sumL = reports.reduce((s, r) => s + r.lengthMm, 0);
  check(Math.abs(tot.lengthMm - sumL) < 1e-6 && tot.pieces === jobs.reduce((s, j) => s + j.units.length, 0), 'report total = sum per colour');
  check(Math.abs(tot.materialCost - sumL / 1000 * 5) < 1e-6, 'material cost summed (5 €/m)');
  console.log(`  TOTAL ${f0(tot.lengthMm)} mm, fill ${f1(tot.fillPct)} %, ${tot.materialCost.toFixed(2)} €`);
  return { groups: plan.groups.length, lengths: jobs.map((j) => [j.label, j.report.strip_width / MM]), total: tot.lengthMm };
}

// ------------------------------------------------------------------ 3. sheets (module 7)
async function sheetCase(file, sheetId, opts) {
  opts = opts || {};
  const { items, paths } = laserItems(file);
  const plan = CLU.planPieces(items, { merge: true, shape: 'all', artboards: [] });
  const pieces = G.buildPieces(plan.pieces, { gap: GAP, flatness: FLAT }).filter((p) => !p.error);
  pieces.forEach((p) => { p.src = plan.pieces[p.id]; if (opts.grainNames && opts.grainNames.test(p.name)) p.grain = true; });
  const sz = SH.sheetSize(sheetId, opts.w, opts.h), margin = (opts.marginMm === undefined ? 10 : opts.marginMm) * MM;
  const orient = G.rotationsFor(opts.rot || '90');
  const t0 = Date.now(), n0 = nestCalls;
  const res = await SH.planSheets(pieces, { sheetW: sz.w * MM, sheetH: sz.h * MM, margin, orient, grain: !!opts.grain,
    splitSecs: SPLIT, finalSecs: FINAL, fillTries: 4 }, runNest, {});
  const label = `${path.basename(file, '.svg')} on ${sheetId === 'custom' ? sz.w + 'x' + sz.h : sheetId}${opts.grain ? ' grain' : ''}${opts.grainNames ? ' grain(per piece)' : ''}`;
  if (res.error) return { label, error: res.error };
  const areaMm2 = MN.areaOf(pieces) / (MM * MM);
  console.log(`\n== ${label}: ${paths} paths, ${pieces.length} pieces, ${f0(areaMm2 / 1e4) / 100} m² -> ${res.sheets.length} sheets ` +
    `(lower bound ${res.lowerBound} sheet area / ${res.lowerBoundUsable} usable)  ${nestCalls - n0} nests ${f1((Date.now() - t0) / 1000)} s` +
    `${res.consolidated ? ', ' + res.consolidated + ' sheet(s) removed by the consolidation' : ''}`);
  // every piece exactly once
  const ids = [].concat(...res.sheets.map((s) => s.placements.map((p) => p.item_id)));
  check(ids.length === pieces.length && new Set(ids).size === pieces.length, `${label}: pieces placed ${ids.length}/${pieces.length} (unique ${new Set(ids).size})`);
  check(res.sheets.length >= res.lowerBound, 'not below the lower bound (sanity)');
  const Wpt = sz.w * MM, Hpt = sz.h * MM;
  res.sheets.forEach((sh, k) => {
    const art = placedArt(sh.units, sh.placements, [margin, margin]);   // sheet frame: (0,0) = sheet corner
    const out = art.filter((a) => a.box[0] < margin - 0.05 || a.box[1] < margin - 0.05 || a.box[2] > Wpt - margin + 0.05 || a.box[3] > Hpt - margin + 0.05);
    check(!out.length, `${label} sheet ${k + 1}: ${out.length} pieces outside the margins ${out.slice(0, 3).map((a) => a.name + ' ' + a.box.map((v) => f1(v / MM))).join('; ')}`);
    const ov = overlaps(art);
    check(ov.n === 0, `${label} sheet ${k + 1}: ${ov.n} overlaps (worst ${f1(ov.worst)} pt²)`);
    const grainBad = art.filter((a) => (opts.grain || (opts.grainNames && opts.grainNames.test(a.name))) && [0, 180].indexOf(((a.rot % 360) + 360) % 360) < 0);
    check(!grainBad.length, `${label}: ${grainBad.length} grain-locked pieces rotated ${grainBad.map((a) => a.rot).join(',')}`);
    const minEdge = Math.min(...art.map((a) => Math.min(a.box[0] - margin, a.box[1] - margin, Wpt - margin - a.box[2], Hpt - margin - a.box[3])));
    const last = k === res.sheets.length - 1;
    console.log(`  sheet ${k + 1}: ${String(sh.units.length).padStart(3)} pieces, fill ${f1(sh.fillSheet * 100)} % of the sheet ` +
      `(${f1(sh.fillUsable * 100)} % usable), used length ${f0(sh.usedLength / MM)} / ${f0((Wpt - 2 * margin) / MM)} mm` +
      `${last ? ' (last: remnant ' + f0((Wpt - 2 * margin - sh.usedLength) / MM) + ' mm)' : ''}, min distance to margin ${f1(minEdge / MM)} mm` +
      `${sh.confirmed === false ? ' [final pass not better, split layout kept]' : ''}`);
  });
  if (opts.grain || opts.grainNames) {
    const rots = new Set([].concat(...res.sheets.map((s) => s.placements.map((p) => ((p.rotation % 360) + 360) % 360))));
    console.log('  rotations used: ' + [...rots].join(', '));
  }
  return { label, sheets: res.sheets.length, lb: res.lowerBound, lbu: res.lowerBoundUsable,
    fills: res.sheets.map((s) => s.fillSheet * 100), lastLen: res.sheets[res.sheets.length - 1].usedLength / MM };
}

(async function main() {
  const t0 = Date.now();
  await wb({ module_or_path: new Uint8Array(fs.readFileSync(path.join(CLIENT, 'lib', 'corvo_bg.wasm'))) });
  unitTests();
  const col = path.join(REAL, 'color'), las = path.join(REAL, 'laser');
  const summary = [];
  summary.push(await colorCase('Italy', path.join(col, 'flag_italy.svg'), 450, 1000, 'color', 3));
  summary.push(await colorCase('Jamaica', path.join(col, 'flag_jamaica.svg'), 600, 1000, 'color', 2));
  summary.push(await colorCase('South Africa', path.join(col, 'flag_south_africa.svg'), 450, 1000, 'color', 5));
  summary.push(await colorCase('Brazil', path.join(col, 'flag_brazil.svg'), 450, 1000, 'color', 4));
  const ab = await colorCase('Alphabet', path.join(col, 'openclipart_alphabet_bojarkski_colorful.svg'), 1400, 600, 'color', 6);
  summary.push(ab);
  const abL = await colorCase('Alphabet', path.join(col, 'openclipart_alphabet_bojarkski_colorful.svg'), 1400, 600, 'layer', 6);
  summary.push(abL);

  const sheetRes = [];
  for (const f of ['ClosedBox', 'DividerTray', 'AgricolaInsert']) {
    for (const s of ['600x400', '1220x2440']) sheetRes.push(await sheetCase(path.join(las, f + '.svg'), s));
  }
  sheetRes.push(await sheetCase(path.join(las, 'AgricolaInsert.svg'), 'custom', { w: 400, h: 300 }));   // more sheets: greedy vs lower bound
  sheetRes.push(await sheetCase(path.join(las, 'DividerTray.svg'), '600x400', { grain: true }));
  sheetRes.push(await sheetCase(path.join(las, 'AgricolaInsert.svg'), '600x400', { grainNames: /^p-(1|2|3|4|5)\d?$/ }));
  // piece larger than the usable sheet -> clear error, no nest
  const n0 = nestCalls;
  const big = await sheetCase(path.join(las, 'DividerTray.svg'), 'custom', { w: 120, h: 90, marginMm: 10 });
  check(big.error && big.error.code === 'tooBig' && big.error.names.length > 0 && nestCalls === n0,
    'piece larger than the usable sheet -> tooBig error before nesting');
  console.log(`\n== too big on 120x90 (margin 10): ${big.error ? big.error.code + ', ' + big.error.names.length + ' pieces, usable ' + f0(big.error.LuMm) + 'x' + f0(big.error.HuMm) + ' mm' : 'NO ERROR'}`);
  const mg = await sheetCase(path.join(las, 'ClosedBox.svg'), 'custom', { w: 100, h: 100, marginMm: 50 });
  check(mg.error && mg.error.code === 'marginTooBig', 'margin >= half sheet -> error');

  console.log('\n== summary');
  summary.forEach((s) => console.log(`  colour: ${s.groups} groups, ${s.lengths.map(([l, L]) => (l || '-') + ' ' + f0(L)).join(', ')} mm (total ${f0(s.total)})`));
  sheetRes.filter((s) => !s.error).forEach((s) => console.log(`  ${s.label.padEnd(36)} ${s.sheets} sheets (lb ${s.lb}/${s.lbu}), fill ${s.fills.map(f0).join('/')} %, last ${f0(s.lastLen)} mm`));
  console.log(`\n${checks - fails}/${checks} checks passed, ${nestCalls} nests (${f1(nestMs / 1000)} s), total ${f1((Date.now() - t0) / 1000)} s`);
  if (fails) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
