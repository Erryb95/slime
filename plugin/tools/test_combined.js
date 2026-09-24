// node plugin/tools/test_combined.js [seconds=10]      (SEED=n env: engine seed, default 7)
// Merge of modules 1+2+5+6+8 (+ 3, 4, 9 in a second part: colour rolls with copies, edition gating): the panel pipeline of main.js, without Illustrator, on ONE mixed job:
//   - lettering (bench/suite/lettering.json, letters with counters, one compound path each) on layer "Lettering"
//   - small pieces (layer "Small") that should go inside the counters (module 2, holes ON)
//   - a print&cut sticker = background + CutContour ring as two overlapping objects (module 1 merge)
//   - a registration mark on layer "Reg" (module 1: excluded)
//   - DTF raster images (bench/real/dtf PNG, module 8) traced by raster.prepareItems BEFORE cluster.planPieces
//   - Graphtec registration marks (module 6): nest strip reduced, marks keep-out checked with regmarks.check
//   - material/cost report (module 5): expanded placements (children in holes), layer column, roll incl. marks
// Checks: plan (merge, reg mark excluded, rasters are cluster members), all pieces moved exactly once on their plan
// index, no overlap between moved artworks (group-aware fill: a child in a counter is not an overlap), everything
// inside the nest strip and outside the marks keep-out, report rows = pieces with layers, CSV consistent.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = path.join(__dirname, '..', 'client');
const G = require(path.join(CLIENT, 'js', 'geometry.js'));
const CLU = require(path.join(CLIENT, 'js', 'cluster.js'));
const HO = require(path.join(CLIENT, 'js', 'holes.js'));
const RM = require(path.join(CLIENT, 'js', 'regmarks.js'));
const RS = require(path.join(CLIENT, 'js', 'raster.js'));
const REP = require(path.join(CLIENT, 'js', 'report.js'));
const C = require(path.join(CLIENT, 'lib', 'clipper.js'));
const Q = require(path.join(CLIENT, 'js', 'quantity.js'));      // MODULO 3
const CG = require(path.join(CLIENT, 'js', 'colorgroups.js'));  // MODULO 4
const MN = require(path.join(CLIENT, 'js', 'multinest.js'));    // MODULI 4/7
const LIC = require(path.join(CLIENT, 'js', 'license.js'));     // MODULO 9

const SECS = +(process.argv[2] || 10), SEED = +(process.env.SEED || 7);
const MM = 72 / 25.4, ROLL_MM = 600, GAP_MM = 2, GAP = GAP_MM * MM, FLAT = 0.5, ROT = '90', SYS = 'graphtec';
let DTF = path.join(ROOT, 'bench', 'real', 'dtf');
if (!fs.existsSync(DTF)) DTF = path.join(ROOT, '..', 'Plugin', 'bench', 'real', 'dtf');   // worktree: bench/real e' gitignored
let fails = 0, checks = 0;
function check(ok, msg) { checks++; if (!ok) { fails++; console.log('  FAIL: ' + msg); } }

// ------------------------------------------------------------------ export-like items (corvoExport, module 1 format)
const exp = [];
function boxOf(rings) { const b = G.bbox([].concat(...rings)); return [b[0], b[3], b[2], b[1]]; }   // [l,t,r,b]
function add(o) {
  o.i = exp.length; o.type = o.type || 'PathItem';
  if (o.rings.length && !o.rg) o.rg = o.rings.map(() => 0);
  if (!o.box) o.box = boxOf(o.rings);
  o.bounds = o.bounds || o.box;
  exp.push(o); return o;
}
const DX = 1000, DY = -2000;                          // document offset, like a real file
const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const circle = (cx, cy, r, n = 24) => Array.from({ length: n }, (_, k) => [cx + r * Math.cos(2 * Math.PI * k / n), cy + r * Math.sin(2 * Math.PI * k / n)]);

// lettering (28 letters, outer + counters) scaled to 60 %, spread on a row
const suite = JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', 'suite', 'lettering.json'), 'utf8'));
let x = DX;
suite.items.forEach((it, k) => {
  const d = it.shape.data, sc = 0.6;
  const rings = (Array.isArray(d) ? [d] : [d.outer].concat(d.inner || [])).map((r) => r.map(([px, py]) => [x + px * sc, DY + py * sc]));
  add({ name: 'letter ' + k, layer: 'Lettering', rings });
  x += G.bbox(rings[0])[2] - G.bbox(rings[0])[0] + 20;
});
const nLetters = suite.items.length;
// small pieces (dots, squares) 3-5 mm
for (let k = 0; k < 14; k++) {
  const s = (3 + (k % 3)) * MM, px = DX + k * 40, py = DY - 300;
  add({ name: 'small ' + k, layer: 'Small', rings: [k % 2 ? circle(px, py, s / 2) : sq(px, py, s, s)] });
}
// print&cut sticker: background object + CutContour object overlapping it (merged by module 1)
const stk = add({ name: 'sticker print', layer: 'Print', rings: [sq(DX, DY - 600, 150, 100)] });
const stkCut = add({ name: 'sticker cut', layer: 'CUT', rings: [sq(DX - 6, DY - 606, 162, 112)], cut: [0], cutSpots: ['CutContour'] });
// a registration mark on its own layer
const reg = add({ name: 'reg', layer: 'Reg', rings: [circle(DX - 200, DY + 200, 7)] });
// DTF images (module 8): the host exports where the pixels are (corners), rings come from the panel
const DTF_FILES = [['dtf_star_simple.png', 70], ['dtf_cat_silhouette.png', 90], ['dtf_donut_ring_hole.png', 80]];
const rasterIdx = [];
DTF_FILES.forEach(([f, mm], k) => {
  const img = RS.decodePNG(fs.readFileSync(path.join(DTF, f)));
  const w = mm * MM, h = w * img.height / img.width, X = DX + 1500 + k * 400, Y = DY - 900;
  const corners = { tl: [X, Y + h], tr: [X + w, Y + h], bl: [X, Y] };
  const b = [X, Y + h, X + w, Y];
  rasterIdx.push(add({ name: f, layer: 'DTF', type: 'PlacedItem', rings: [], raster: { path: path.join(DTF, f), temp: false, kind: 'linked', corners }, box: b, bounds: b }).i);
});
const artboards = [[DX - 250, DY + 250, DX + 5000, DY - 1500]];

(async () => {
  const glue = fs.readFileSync(path.join(CLIENT, 'lib', 'corvo.js'), 'utf8');
  const ctx = { console, TextEncoder, TextDecoder, WebAssembly, performance, BigInt, Error, Symbol, Object, Array,
    Uint8Array, Float32Array, Int32Array, BigInt64Array, DataView, Math, Number, String, JSON, Function, Promise,
    queueMicrotask, setTimeout, Date, crypto: globalThis.crypto };
  ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
  const wb = vm.runInContext(glue + ';wasm_bindgen;', ctx);
  await wb({ module_or_path: new Uint8Array(fs.readFileSync(path.join(CLIENT, 'lib', 'corvo_bg.wasm'))) });

  // ---- main.js nest(): module 6 reserve -> module 8 raster -> module 1 plan -> pieces -> module 2 holes
  const rmRes = RM.reserve(SYS, ROLL_MM);
  check(rmRes.nestHeight > 0 && rmRes.nestHeight < ROLL_MM, 'graphtec reserve reduces the nest strip: ' + rmRes.nestHeight.toFixed(1) + ' mm');
  const H = rmRes.nestHeight * MM, orient = G.rotationsFor(ROT);
  const rr = RS.prepareItems(exp, { mode: 'contour', offset: RS.SAFETY_MM * MM });
  const items = rr.items;
  rasterIdx.forEach((i) => check(items[i].rings.length > 0 && items[i].rg.length === items[i].rings.length, 'raster traced with ring groups: ' + items[i].name));
  const plan = CLU.planPieces(items, { merge: true, shape: 'all', artboards, lockedCuts: [] });
  check(!plan.error, 'plan without error ' + JSON.stringify(plan.error || ''));
  check(plan.excluded.some((e) => e.i === reg.i && e.reason === 'regMark'), 'registration mark on layer Reg excluded');
  const stPiece = plan.pieces.find((p) => p.members.indexOf(stk.i) >= 0);
  check(stPiece && stPiece.members.indexOf(stkCut.i) >= 0 && stPiece.layers.join() === 'Print,CUT', 'sticker print + cut merged into one piece on both layers');
  rasterIdx.forEach((i) => check(plan.pieces.some((p) => p.members.length === 1 && p.members[0] === i), 'raster is a cluster member (own piece): ' + items[i].name));
  const members = [].concat(...plan.pieces.map((p) => p.members)).sort((a, b) => a - b);
  check(members.length === exp.length - 1 && new Set(members).size === members.length, 'every object in exactly one piece (except the reg mark)');

  let pieces = G.buildPieces(plan.pieces, { gap: GAP, flatness: FLAT });
  const bad = pieces.filter((p) => p.error);
  check(!bad.length, 'no degenerate pieces');
  pieces = pieces.filter((p) => !p.error); pieces.forEach((p, k) => { p.hostI = p.id; p.id = k; });
  check(!pieces.some((p) => G.minExtent(p.polygon, orient) > H - 1e-6), 'all pieces fit the reduced strip');

  const holes = HO.planHoles(plan.pieces, pieces, { gap: GAP, orientations: orient });
  const nestPieces = HO.nestPieces(pieces, holes);
  check(holes.children.length > 0, 'small pieces inside the letter counters: ' + holes.children.length);
  check(!holes.children.some((c) => stPiece && c.parent === pieces.findIndex((p) => p.hostI === stPiece.i)), 'nothing inside the sticker (no false hole)');

  const instance = G.buildInstance(nestPieces, H, orient);
  let best = null;
  wb.nest(JSON.stringify(instance), SECS * 0.8, SECS * 0.2, BigInt(SEED), GAP, (json) => {
    const r = JSON.parse(json); if (r.placements && r.placements.length === nestPieces.length && (!best || r.strip_width <= best.strip_width)) best = r;
  });
  check(!!best, 'engine found a complete layout');
  if (!best) { console.log(`\nFAIL (${fails}/${checks})`); process.exitCode = 1; return; }

  // ---- live moves (main.js movesFor): roll origin (0,0), nest strip origin = marks offset
  const rollOrigin = [0, 0], origin = [rmRes.offset[0] * MM, rmRes.offset[1] * MM];
  const moves = HO.movesFor(best.placements, nestPieces, origin, holes);
  const idx = moves.map((m) => m.i).sort((a, b) => a - b), want = pieces.map((p) => p.hostI).sort((a, b) => a - b);
  check(JSON.stringify(idx) === JSON.stringify(want), 'one move per plan piece (hostI indices)');

  // moved artwork of each plan piece: every member's rings, group-aware fill
  const S = 1000, toP = (r) => r.map(([px, py]) => ({ X: Math.round(px * S), Y: Math.round(py * S) }));
  function exec(type, subj, clip, fill) {
    const c = new C.Clipper(), out = new C.Paths();
    c.AddPaths(subj, C.PolyType.ptSubject, true); if (clip) c.AddPaths(clip, C.PolyType.ptClip, true);
    c.Execute(type, out, fill, fill); return out;
  }
  const area = (ps) => ps.reduce((s, p) => s + C.Clipper.Area(p), 0) / (S * S);
  const art = {}, docBox = {};
  for (const m of moves) {
    const pp = plan.pieces[m.i];
    const byG = {};
    pp.members.forEach((mi) => {
      const it = items[mi];
      it.rings.forEach((r, q) => { const k = mi + ':' + (it.rg ? it.rg[q] : q); (byG[k] = byG[k] || []).push(toP(G.applyMove(r, m))); });
    });
    const parts = [];
    Object.values(byG).forEach((g) => exec(C.ClipType.ctUnion, g, null, C.PolyFillType.pftEvenOdd).forEach((p) => parts.push(p)));
    art[m.i] = exec(C.ClipType.ctUnion, parts, null, C.PolyFillType.pftNonZero);
    const pts = [].concat(...art[m.i]).map((p) => [p.X / S, p.Y / S]);
    docBox[m.i] = G.bbox(pts);
  }
  let overlaps = 0; const ids = Object.keys(art);
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    const ov = Math.abs(area(exec(C.ClipType.ctIntersection, art[ids[a]], art[ids[b]], C.PolyFillType.pftNonZero)));
    if (ov > 1) { overlaps++; console.log(`  overlap ${plan.pieces[ids[a]].name} x ${plan.pieces[ids[b]].name}: ${ov.toFixed(2)} pt2`); }
  }
  check(!overlaps, 'no overlapping artworks (' + overlaps + ')');
  const tol = 0.6;
  const outside = ids.filter((i) => { const b = docBox[i];
    return b[0] < origin[0] - tol || b[1] < origin[1] - tol || b[2] > origin[0] + best.strip_width + tol || b[3] > origin[1] + H + tol; });
  check(!outside.length, 'every piece inside the nest strip: ' + outside.map((i) => plan.pieces[i].name).join(', '));

  // ---- module 6: marks layout on the final length, keep-out vs the moved pieces (roll mm coords)
  const L = RM.layout(SYS, ROLL_MM, best.strip_width / MM);
  const boxesMm = ids.map((i) => docBox[i].map((v, k) => (v - rollOrigin[k % 2]) / MM));
  const errs = RM.check(L, boxesMm);
  check(!errs.length, 'graphtec rules and keep-out: ' + errs.slice(0, 3).join('; '));
  const payload = RM.toDoc(L, rollOrigin);
  check(payload.marks.length === L.marks.length && payload.marks.length >= 4, 'marks payload for the host: ' + payload.marks.length);

  // ---- module 5: report on the whole roll, children included
  const repPl = HO.expandPlacements(best.placements, nestPieces, holes, pieces);
  const rep = REP.computeReport({ pieces, placements: repPl, stripLengthPt: best.strip_width, rollWidthPt: H, gapPt: GAP,
    orientations: orient, material: { name: 'Oracal 651', price: 4.5, priceUnit: 'm' }, items: plan.pieces,
    materialWidthPt: ROLL_MM * MM, materialLengthPt: L.rollLength * MM, job: 'combined' });
  check(rep.rows.length === pieces.length, `report rows ${rep.rows.length} = pieces ${pieces.length} (children included)`);
  check(rep.rows.every((r) => r.layer), 'layer column filled for every row');
  check(rep.rows.some((r) => r.layer === 'Print + CUT'), 'merged piece shows both layers');
  check(Math.abs(rep.lengthMm - L.rollLength) < 1e-6 && Math.abs(rep.rollWidthMm - ROLL_MM) < 1e-9, 'report on the whole roll incl. marks margins');
  const sumRows = rep.rows.reduce((s, r) => s + r.areaMm2, 0) / 1e6;
  check(Math.abs(sumRows - rep.piecesM2) < 1e-9, 'rows area = pieces area');
  check(Math.abs(rep.materialCost - L.rollLength / 1000 * 4.5) < 1e-6, 'material cost = roll length x price');
  const csv = REP.toCSV(rep, 'it').replace(/^﻿/, '').trim().split(/\r\n/);
  check(csv.length === 4 + rep.rows.length, 'CSV lines');

  // ================================================================== merge 3 + 4/7 + 9: quantities + colour groups + gating
  // main.js nest() with "Nest by colour" (module 4) + copies/mirrored pair (module 3) + holes per group (module 2):
  // plan per colour -> pieces -> Q.expand (virtual copies at host index base + k) -> MN.assignGroups (copies join
  // the group of their original) -> holes per group -> one Sparrow job per colour (MN.runJobs) on stacked rolls.
  const RED = { t: 'rgb', v: [220, 30, 30] }, BLUE = { t: 'cmyk', v: [100, 60, 0, 0] }, GREEN = { t: 'spot', name: 'Vinyl Green' };
  const itemsC = items.map((it) => Object.assign({}, it));
  itemsC.forEach((it) => {
    const b = it.box, a = b ? Math.abs((b[2] - b[0]) * (b[1] - b[3])) : 1;
    if (it.layer === 'Lettering') it.paint = [{ c: RED, a }];
    else if (it.layer === 'Small') it.paint = [{ c: BLUE, a }];
    else if (it.layer === 'Print' || it.layer === 'CUT') it.paint = [{ c: GREEN, a }];   // sticker: one vinyl, print + cut
    // DTF images and the reg mark: no paint -> group "none"
  });
  const planC = CG.planGroups(itemsC, { by: 'color', tol: CG.DEFAULT_TOL }, { merge: true, shape: 'all', artboards, lockedCuts: [] }, CLU);
  check(!planC.error, 'colour plan without error');
  const gKeys = planC.groups.map((g) => g.key);
  check(planC.groups.length === 4 && gKeys[gKeys.length - 1] === 'none', 'groups red / blue / green spot / none: ' + planC.groups.map((g) => g.label || g.key).join(', '));
  const stC = planC.pieces.find((p) => p.members.indexOf(stk.i) >= 0);
  check(stC && stC.members.indexOf(stkCut.i) >= 0, 'sticker print + cut still one piece inside its colour group');
  const piecesC = G.buildPieces(planC.pieces, { gap: GAP, flatness: FLAT }).filter((p) => !p.error);
  piecesC.forEach((p, k) => { p.hostI = p.id; p.id = k; });
  const letter0 = planC.pieces.find((p) => p.name === 'letter 0'), small0 = planC.pieces.find((p) => p.name === 'small 0');
  const spec = { qty: { [stC.i]: 3, [small0.i]: 2 }, mirror: { [letter0.i]: true }, any: true };
  const base = planC.pieces.length;
  const qx = Q.expand(planC.pieces, piecesC, spec, { base });
  check(qx.extra === 4 && qx.mirrored === 1, `copies: 2 sticker + 1 small + 1 mirrored letter (${qx.extra}, mirrored ${qx.mirrored})`);
  check(qx.pieces.filter((p) => p.copyOf !== undefined).every((p, k) => p.hostI === base + k), 'copies at host indices base + k (ghosts)');
  const mir = qx.pieces.find((p) => p.mirror), src0 = piecesC.find((p) => p.hostI === letter0.i);
  const polyArea = (P) => Math.abs(P.reduce((s, p, k) => { const q = P[(k + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  check(mir && Math.abs(polyArea(mir.polygon) - polyArea(src0.polygon)) < 1e-6 * polyArea(src0.polygon), 'mirrored letter keeps its area');
  const perG = MN.assignGroups(planC.groups, qx.pieces);
  check(perG.reduce((s, g) => s + g.length, 0) === qx.pieces.length, 'every piece (copies included) in exactly one colour group');
  const gOfPiece = {};
  perG.forEach((g, gi) => g.forEach((p) => { gOfPiece[p.hostI] = gi; }));
  check(qx.pieces.filter((p) => p.copyOf !== undefined).every((p) => gOfPiece[p.hostI] === gOfPiece[p.copyOf]), 'copies and mirrored copies nested with their original colour');
  // module 2 per group (a blue dot never goes into a red counter), as mnStart
  const holesC = { children: [], parents: {}, regions: 0, usedRegions: 0, emptyRegions: 0 };
  perG.forEach((g) => {
    const hp = HO.planHoles(qx.items, g, { gap: GAP, orientations: orient });
    holesC.children = holesC.children.concat(hp.children);
    Object.assign(holesC.parents, hp.parents);
  });
  check(holesC.children.length === 0, 'no cross-colour holes (small dots are blue, letters red): ' + holesC.children.length);
  const nestC = HO.nestPieces(qx.pieces, holesC);
  const unitOf = {};
  nestC.forEach((u) => { unitOf[u.srcId !== undefined ? u.srcId : u.id] = u; });
  const W = H, spacing = 20 * MM;
  const origins = MN.stackRolls(perG.length, W, 0, 0, spacing);
  const secs = MN.timeShares(perG.map((g) => MN.areaOf(g)), Math.max(8, SECS), 2);
  const jobs = perG.map((g, k) => ({ units: g.map((x) => unitOf[x.id]).filter(Boolean), H: W, orient, secs: secs[k], origin: origins[k] }));
  const runNest = (inst, s) => new Promise((resolve) => {
    let b = null;
    G.guardInstance(inst, GAP);                         // as main.js mnRunner (small-area group on a wide roll)
    wb.nest(JSON.stringify(inst), s * 0.8, s * 0.2, BigInt(SEED), GAP, (json) => {
      const r = JSON.parse(json); if (r.placements && r.placements.length === inst.items.length && (!b || r.strip_width <= b.strip_width)) b = r;
    });
    resolve(b);
  });
  await MN.runJobs(jobs, runNest, {});
  // engine guard: the blue group (15 dots of 3-5 mm) on the ~507 mm strip has area / height < gap -> jagua-rs panicked
  const blueJob = jobs.find((j) => j.units.every((u) => /^small/.test(u.name))), blueInst = MN.subsetInstance(blueJob.units, W, orient), blueH = blueInst.strip_height;
  G.guardInstance(blueInst, GAP);
  check(blueInst.strip_height < blueH && jobs.every((j) => j.report && j.placements.length === j.units.length),
    `small-area group: strip height lowered ${(blueH / MM).toFixed(0)} -> ${(blueInst.strip_height / MM).toFixed(1)} mm, every colour job nested`);
  const movesC = [].concat(...jobs.map((j) => HO.movesFor(j.placements, nestC, j.origin, holesC)));
  const mvIdx = movesC.map((m) => m.i).sort((a, b) => a - b), wantC = qx.pieces.map((p) => p.hostI).sort((a, b) => a - b);
  check(JSON.stringify(mvIdx) === JSON.stringify(wantC), `one move per piece and per ghost, job by job (${mvIdx.length} = ${wantC.length})`);
  let ovC = 0, outC = 0;
  jobs.forEach((j) => {
    const unitsOf = (pl) => nestC.find((u) => u.id === pl.item_id);
    const polys = j.placements.map((pl) => toP(MN.placedPoly(unitsOf(pl), pl)));
    j.placements.forEach((pl) => { const b = MN.placedBox(unitsOf(pl), pl);
      if (b[0] < -tol || b[1] < -tol || b[2] > j.report.strip_width + tol || b[3] > W + tol) outC++; });
    for (let a = 0; a < polys.length; a++) for (let b = a + 1; b < polys.length; b++) {
      const ov = Math.abs(area(exec(C.ClipType.ctIntersection, [polys[a]], [polys[b]], C.PolyFillType.pftNonZero)));
      if (ov > 1) ovC++;
    }
  });
  check(!ovC, 'no overlaps inside each colour roll (' + ovC + ')');
  check(!outC, 'every piece inside its colour roll (' + outC + ')');
  check(jobs.every((j, k) => k === 0 || j.origin[1] + W <= jobs[k - 1].origin[1] - spacing + 1e-6), 'colour rolls stacked downwards without overlapping');
  // module 5 multi (mnReport): rows over all groups = pieces incl. copies
  const repsC = jobs.map((j, k) => {
    const pls = HO.expandPlacements(j.placements, nestC, holesC, qx.pieces), ids = new Set(pls.map((p) => p.item_id));
    const pcs = qx.pieces.filter((x) => ids.has(x.id));
    return REP.computeReport({ pieces: pcs, placements: pls, stripLengthPt: j.report.strip_width, rollWidthPt: W, gapPt: GAP, orientations: orient,
      material: { name: 'Oracal 651', price: 4.5, priceUnit: 'm' }, items: pcs.map((x) => qx.items.find((it) => it.i === x.hostI)).filter(Boolean),
      materialWidthPt: W, materialLengthPt: j.report.strip_width, job: 'combined' });
  });
  check(repsC.reduce((s, r) => s + r.rows.length, 0) === qx.pieces.length, 'report rows over all colours = pieces incl. copies');

  // ---- module 9 gating (license.js FEATURES) + trial Apply limit counting the REAL host pieces incl. copies
  const m9Count = qx.pieces.length;                      // main.js: S.m9Count = pieces.length after Q.expand
  check(m9Count === piecesC.length + qx.extra && m9Count > LIC.LIMITS.freeApplyMax, 'Apply count includes the copies: ' + m9Count);
  const sExp = LIC.computeState(null, { expired: true, daysLeft: 0 });
  const sStd = LIC.computeState({ edition: 'standard' }, null), sPro = LIC.computeState({ edition: 'pro' }, null);
  const sTri = LIC.computeState(null, { expired: false, daysLeft: 5 });
  check(['holes', 'colorNest', 'multiSheet', 'costCsv'].every((f) => !LIC.hasIn(sExp, f) && !LIC.hasIn(sStd, f) && LIC.hasIn(sPro, f) && LIC.hasIn(sTri, f)),
    'modules 2 / 4 / 7 / 5-CSV: Pro (and trial), locked in Standard and after the trial');
  check(LIC.hasIn(sExp, 'quantity') && LIC.hasIn(sStd, 'quantity') && LIC.FEATURES.quantity.edition === 'standard', 'module 3 quantities: Standard');
  check(!LIC.canApplyIn(sExp, m9Count) && LIC.canApplyIn(sExp, LIC.LIMITS.freeApplyMax) && !LIC.canApplyIn(sExp, LIC.LIMITS.freeApplyMax + 1),
    'trial ended: Apply refused on this layout (copies counted), allowed up to 10 pieces');
  // 9 originals + 2 copies = 11 real pieces: refused although only 9 were selected
  check(!LIC.canApplyIn(sExp, 9 + 2) && LIC.canApplyIn(sExp, 9), 'trial ended: 9 designs + 2 copies = 11 pieces -> refused');
  check(LIC.canApplyIn(sStd, m9Count) && LIC.canApplyIn(sTri, m9Count), 'Standard / trial: Apply without piece limit');
  console.log(`colour groups: ${planC.groups.map((g, k) => (g.label || 'none') + ' ' + perG[k].length + ' pcs ' + (jobs[k].report.strip_width / MM).toFixed(0) + ' mm').join(' | ')}; ${qx.extra} copies (${qx.mirrored} mirrored), Apply count ${m9Count}`);

  console.log(`\nplan: ${plan.pieces.length} pieces (${nLetters} letters, 14 small, sticker, ${rasterIdx.length} DTF), ` +
    `${holes.children.length} in holes, ${nestPieces.length} sent to the engine`);
  console.log(`nest: strip ${rmRes.nestHeight.toFixed(1)} mm of ${ROLL_MM} mm, length ${(best.strip_width / MM).toFixed(1)} mm, roll with marks ${L.rollLength.toFixed(1)} mm, ${L.marks.length} marks`);
  console.log(`report: ${rep.rows.length} rows, fill ${rep.fillPct.toFixed(1)} %, cost ${rep.materialCost.toFixed(2)} ${rep.currency}`);
  console.log(fails ? `\nFAIL (${fails}/${checks})` : `\nPASS (${checks} checks)`);
  if (fails) process.exitCode = 1;
})().catch((e) => { console.log('FAIL: ' + (e && e.stack || e)); process.exitCode = 1; });
