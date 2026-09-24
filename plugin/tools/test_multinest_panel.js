// node plugin/tools/test_multinest_panel.js [secs=6]
// Smoke test of the PANEL glue of modules 4 + 7 (main.js "MODULO 4/7" block) without Illustrator: the real
// client scripts (index.html order) run in Node with a stub DOM, a stub CSInterface that answers like host/corvo.jsx
// (corvoExport from real SVG files, corvoGroup, corvoApply, corvoContainers, corvoFinish, corvoRevert) and the
// inline engine fallback (wasm in the same thread, no Web Worker in Node).
//   1. alphabet by colour (bench/real/color): 6 rolls stacked, every piece moved once, inside its roll, the
//      containers carry "Corvo — <colour> — L mm", report panel = 6 groups + TOTAL, CSV multi, Apply -> corvoFinish.
//   2. AgricolaInsert on 600x400 sheets (bench/real/laser): sheets drawn in a row, every piece inside the usable area
//      of one sheet, status = sheets vs lower bound. Then Cancel -> corvoRevert.
//   3. presets: save (name field), load, export JSON / import.
'use strict';
const fs = require('fs'), path = require('path');
const CLIENT = path.join(__dirname, '..', 'client');
const G = require(path.join(CLIENT, 'js', 'geometry.js'));
const { readSvg } = require('./svgparse.js');
const SECS = +(process.argv[2] || 6);
let REAL = path.join(__dirname, '..', '..', 'bench', 'real');
if (!fs.existsSync(path.join(REAL, 'color'))) REAL = path.join(__dirname, '..', '..', '..', 'Plugin', 'bench', 'real');
const MM = 72 / 25.4;
let fails = 0, checks = 0;
function check(ok, msg) { checks++; if (!ok) { fails++; console.log('  FAIL: ' + msg); } }

// ------------------------------------------------------------------ stub DOM seeded from index.html
const html = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8');
const els = {};
function stub(id) {
  const e = { id, value: '', checked: false, disabled: false, hidden: false, textContent: '', className: '', style: {}, children: [],
    listeners: {}, attrs: {}, files: null,
    set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; },
    appendChild(c) { this.children.push(c); return c; }, removeChild() {}, select() {}, click() { (this.listeners.click || []).forEach((f) => f({})); },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    querySelectorAll() { return []; },                         // MODULO 3: quantity-panel setEnabled
    closest() { return stub('label-of-' + id); } };
  return e;
}
function el(id) { if (!els[id]) els[id] = stub(id); return els[id]; }
for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
  const a = m[1], id = (a.match(/id="([^"]+)"/) || [])[1]; if (!id) continue;
  const e = el(id); e.value = (a.match(/value="([^"]*)"/) || [])[1] || ''; e.checked = /\schecked\b/.test(a);
}
for (const m of html.matchAll(/<select id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
  const opts = [...m[2].matchAll(/<option value="([^"]*)"([^>]*)>/g)];
  el(m[1]).value = (opts.find((o) => /selected/.test(o[2])) || opts[0] || [])[1] || '';
}
const mn7 = [el('mn7a'), el('mn7b')];
const store = {};
Object.assign(globalThis, {
  window: globalThis, require,
  location: { protocol: 'file:', pathname: '/' + CLIENT.replace(/\\/g, '/') + '/index.html' },
  document: {
    getElementById: el, documentElement: {}, currentScript: null, body: { appendChild() {}, removeChild() {} },
    querySelector: () => null,                                   // MODULO 9: no <footer> -> licence UI not built (no disk store)
    querySelectorAll: (q) => (q === '[data-mn7]' ? mn7 : []), createElement: (t) => stub('new-' + t), execCommand: () => true
  },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  addEventListener() {},
  __adobe_cep__: {}
});

// ------------------------------------------------------------------ stub host (host/corvo.jsx + host/multinest.jsx)
const host = { items: [], groups: null, moves: {}, containers: null, calls: {}, exportOpts: null };
function hostAnswer(script) {
  let m = script.match(/^(\w+)\((.*)\)$/s), fn, arg;
  if (m) { fn = m[1]; arg = m[2] ? JSON.parse(JSON.parse(m[2])) : undefined; }
  else if ((m = script.match(/return (\w+)\((".*")\);\}\)\(\)$/s))) { fn = m[1]; arg = JSON.parse(JSON.parse(m[2])); }
  else return '{}';
  host.calls[fn] = (host.calls[fn] || 0) + 1;
  switch (fn) {
    case 'corvoExport': host.exportOpts = arg;
      return JSON.stringify({ doc: { name: 'test.ai', abLeft: 0, abTop: 800, abRight: 1000, abBottom: 0, artboards: [[0, 800, 1000, 0]] },
        items: host.items.map((it) => (arg.paint ? it : Object.assign({}, it, { paint: undefined }))), excluded: [], lockedCuts: [], processCuts: [] });
    case 'corvoGroup': host.groups = arg; return '{"ok":true}';
    case 'corvoApply': arg.forEach((mv) => { host.moves[mv.i] = mv; }); return '{"ok":true}';
    case 'corvoContainers': host.containers = arg; return JSON.stringify({ ok: true, n: arg.list.length });
    case 'corvoRoll': return '{"ok":true}';
    case 'corvoFinish': return '{"ok":true,"undo":"single"}';
    case 'corvoRevert': host.moves = {}; host.containers = null; return '{"ok":true}';
    default: return '{"ok":true}';
  }
}
globalThis.CSInterface = function () { this.evalScript = (s, cb) => setTimeout(() => cb(hostAnswer(s)), 0); };

// ------------------------------------------------------------------ load the panel scripts in index.html order
const vm = require('vm');
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  if (/CSInterface\.js$/.test(m[1])) continue;                 // stubbed above
  vm.runInThisContext(fs.readFileSync(path.join(CLIENT, m[1]), 'utf8'), { filename: m[1] });
}
window.CorvoSeed = 7;
const origWarn = console.warn; console.warn = () => {};           // "worker failed, running inline" is expected here

// ------------------------------------------------------------------ helpers
function colorItems(file, widthMm) {
  const r = readSvg(file), all = r.shapes.map((s) => s.rings).flat(2), b = G.bbox(all), k = widthMm * MM / (b[2] - b[0]);
  return r.shapes.map((s, i) => {
    const rings = s.rings.map((ring) => ring.map(([x, y]) => [(x - b[0]) * k, 800 - (y - b[1]) * k]));
    const bb = G.bbox([].concat(...rings)), box = [bb[0], bb[3], bb[2], bb[1]], col = s.fill || s.stroke;
    return { i, name: (s.id || s.tag) + '#' + i, type: 'PathItem', layer: s.groupIds[s.groupIds.length - 1] || 'Layer 1', rings,
      rg: rings.map(() => 0), bounds: box, box, paint: col ? [{ c: { t: 'rgb', v: col }, a: Math.abs(G.signedArea(rings[0])) }] : [] };
  });
}
function laserItems(file) {
  const r = readSvg(file), byG = new Map();
  r.shapes.forEach((s) => { const g = s.groupIds[s.groupIds.length - 1] || 'x'; if (!byG.has(g)) byG.set(g, []); byG.get(g).push(...s.rings); });
  return [...byG].map(([gid, rs], i) => {
    const rings = rs.map((ring) => ring.map(([x, y]) => [x * MM, 800 - y * MM])), bb = G.bbox([].concat(...rings));
    const box = [bb[0], bb[3], bb[2], bb[1]];
    return { i, name: gid, type: 'GroupItem', layer: 'Layer 1', rings, rg: rings.map((_, q) => q), bounds: box, box };
  });
}
const P = () => window.CorvoPanel.state();
function waitState(want, maxS) {
  const t0 = Date.now();
  return new Promise((res, rej) => {
    const iv = setInterval(() => {
      const st = P().state;
      if (want.indexOf(st) >= 0) { clearInterval(iv); setTimeout(() => res(st), 400); }   // let the final push reach the host
      else if (Date.now() - t0 > maxS * 1000) { clearInterval(iv); rej(new Error('timeout waiting for ' + want + ' (state ' + st + ', status ' + el('status').textContent + ')')); }
    }, 100);
  });
}
/* moved artwork of every piece (host moves applied to all members) -> {k: bbox [minx,miny,maxx,maxy]} */
function movedBoxes() {
  const out = {};
  host.groups.forEach((members, k) => {
    const mv = host.moves[k]; if (!mv) return;
    const pts = [].concat(...members.map((i) => host.items[i].rings.map((r) => G.applyMove(r, mv)).flat()));
    out[k] = G.bbox(pts);
  });
  return out;
}
const inside = (b, c, tol) => b[0] >= c.ox - tol && b[1] >= c.oy - tol && b[2] <= c.ox + c.w + tol && b[3] <= c.oy + c.h + tol;

(async function main() {
  // ---------------------------------------------------------------- 1. by colour
  console.log('== panel: alphabet by fill colour');
  host.items = colorItems(path.join(REAL, 'color', 'openclipart_alphabet_bojarkski_colorful.svg'), 900);
  el('groupBy').value = 'color'; el('time').value = String(SECS); el('rollWidth').value = '600';
  el('btnNest').click();
  await waitState(['review', 'idle'], 120);
  const S1 = P();
  check(S1.state === 'review', 'colour run ends in review: ' + el('status').textContent);
  check(host.exportOpts && host.exportOpts.paint === true, 'corvoExport asked for paint');
  check(!host.calls.corvoRoll, 'no single roll drawn in multi mode');
  const nGroups = S1.mn ? S1.mn.results.length : 0;
  check(nGroups === 6, `6 colour rolls (got ${nGroups})`);
  const cont = host.containers ? host.containers.list : [];
  check(cont.length === nGroups, `${cont.length} containers drawn`);
  check(cont.every((c) => /^Corvo — .+ — \d+ mm$/.test(c.label)), 'labels "Corvo — <colour> — L mm": ' + cont.map((c) => c.label).join(' | '));
  for (let k = 1; k < cont.length; k++) check(cont[k].oy + cont[k].h < cont[k - 1].oy, 'rolls stacked downwards without overlap');
  check(cont.length && cont[0].oy + cont[0].h <= 0 - 20 * MM + 0.01, 'first roll 20 mm below the artboard');
  const boxes = movedBoxes();
  check(Object.keys(boxes).length === host.groups.length, `every piece moved (${Object.keys(boxes).length}/${host.groups.length})`);
  // each piece inside the roll of its colour
  S1.mn.results.forEach((r, gi) => {
    const c = cont[gi], ids = new Set(r.units.map((u) => (u.hostI !== undefined ? u.hostI : (u.srcId !== undefined ? u.srcId : u.id))));
    const bad = [...ids].filter((k) => boxes[k] && !inside(boxes[k], c, 0.6));
    check(!bad.length, `${r.label}: ${bad.length} pieces outside their roll`);
  });
  const rep = window.CorvoReportPanel.report();
  check(rep && rep.multi && rep.multi.length === nGroups, 'report panel: one report per colour');
  if (rep && rep.multi) {
    const sumL = rep.multi.reduce((s, r) => s + r.lengthMm, 0);
    check(Math.abs(rep.lengthMm - sumL) < 1e-6, 'report TOTAL length = sum of the colours');
    const csv = window.CorvoReport.toCSVMulti(rep.multi, 'it');
    const lines = csv.split('\r\n');
    check(lines.length > nGroups + 3 && /TOTALE/.test(lines[nGroups + 1]) && /^gruppo;n;nome/.test(lines[nGroups + 3]), 'CSV: one row per colour + TOTALE, pieces with gruppo');
    console.log('  ' + rep.multi.map((r) => r.color + ' ' + r.lengthMm.toFixed(0) + ' mm').join(', ') + ` -> total ${rep.lengthMm.toFixed(0)} mm, fill ${rep.fillPct.toFixed(1)} %`);
  }
  console.log('  status: ' + el('status').textContent);
  el('btnApply').click();
  await waitState(['idle'], 30);
  check(host.calls.corvoFinish === 1, 'Apply -> corvoFinish');

  // ---------------------------------------------------------------- 2. sheets
  console.log('\n== panel: AgricolaInsert on 600x400 sheets');
  host.items = laserItems(path.join(REAL, 'laser', 'AgricolaInsert.svg'));
  host.moves = {}; host.containers = null;
  el('groupBy').value = 'none'; el('container').value = 'sheets'; el('sheetPreset').value = '600x400'; el('sheetMargin').value = '10';
  el('time').value = String(SECS);
  el('btnNest').click();
  await waitState(['review', 'idle'], 600);
  const S2 = P();
  check(S2.state === 'review', 'sheets run ends in review: ' + el('status').textContent);
  const sc = host.containers ? host.containers.list : [];
  check(sc.length === S2.mn.sheetsN && sc.length >= 1, `${sc.length} sheets drawn (${S2.mn.sheetsN} planned, lower bound ${S2.mn.lowerBound})`);
  check(sc.every((c) => Math.abs(c.w - 600 * MM) < 0.01 && Math.abs(c.h - 400 * MM) < 0.01), 'sheet rectangles 600 x 400 mm');
  for (let k = 1; k < sc.length; k++) check(sc[k].ox > sc[k - 1].ox + sc[k - 1].w, 'sheets in a row without overlap');
  check(/Corvo — (Sheet|Foglio) \d+ — 600 × 400 mm/.test(sc[0] && sc[0].label), 'sheet label: ' + (sc[0] && sc[0].label));
  const b2 = movedBoxes(), mg = 10 * MM;
  check(Object.keys(b2).length === host.groups.length, `every piece moved (${Object.keys(b2).length}/${host.groups.length})`);
  const out = Object.keys(b2).filter((k) => !sc.some((c) => inside(b2[k], { ox: c.ox + mg, oy: c.oy + mg, w: c.w - 2 * mg, h: c.h - 2 * mg }, 0.05)));
  check(!out.length, `${out.length} pieces outside the usable area of every sheet`);
  console.log('  status: ' + el('status').textContent);
  el('btnCancel').click();
  await waitState(['idle'], 30);
  check(host.calls.corvoRevert >= 1 && !Object.keys(host.moves).length, 'Cancel -> corvoRevert');

  // ---------------------------------------------------------------- 2b. Stop during a colour sequence = finish quickly
  console.log('\n== panel: Stop during the colour sequence');
  host.items = colorItems(path.join(REAL, 'color', 'flag_south_africa.svg'), 450);
  host.moves = {}; host.containers = null;
  el('groupBy').value = 'color'; el('container').value = 'roll'; el('time').value = '30';
  const t0 = Date.now();
  el('btnNest').click();
  await new Promise((r) => setTimeout(r, 300));
  el('btnStop').click();
  await waitState(['review', 'idle'], 120);
  const S3 = P();
  check(S3.state === 'review' && S3.mn.hurry, 'Stop -> hurry, sequence completed: ' + el('status').textContent);
  check((Date.now() - t0) / 1000 < 25, `hurried sequence faster than the 30 s budget (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  check(Object.keys(movedBoxes()).length === host.groups.length, 'every piece placed after Stop');
  el('btnCancel').click();
  await waitState(['idle'], 30);

  // ---------------------------------------------------------------- 3. presets
  console.log('\n== panel: presets');
  el('gap').value = '3.5'; el('container').value = 'sheets'; el('sheetPreset').value = '1220x2440'; el('grain').checked = true;
  el('mnName').value = 'Test preset';
  el('mnSave').click();
  const saved = JSON.parse(store['corvo.presets'] || '{}')['Test preset'];
  check(saved && saved.gapMm === 3.5 && saved.sheet === '1220x2440' && saved.grain === true && saved.material, 'preset saved with material');
  el('gap').value = '1'; el('grain').checked = false; el('mnPreset').value = 'Test preset';
  (el('mnPreset').listeners.change || []).forEach((f) => f({}));
  check(el('gap').value === 3.5 || el('gap').value === '3.5', 'preset loaded (gap)');
  check(el('grain').checked === true && el('sheetW').value === 2440, 'preset loaded (grain, sheet 2440)');
  const json = window.CorvoMultinest.Presets.toJSON(JSON.parse(store['corvo.presets']));
  delete store['corvo.presets'];
  const st = el('status');
  // import through the panel code path (no CEP dialog in Node: the file input path is not reachable, use the API)
  const map = {}; const r = window.CorvoMultinest.Presets.fromJSON(json, map);
  check(r.added[0] === 'Test preset', 'exported JSON re-imports');
  console.log('  ' + st.textContent);

  // ---------------------------------------------------------------- 3b. MODULO 3 x 4: copies inside the colour rolls
  console.log('\n== panel: copies + mirrored copy nested by colour (merge 3/4-7/9)');
  host.items = colorItems(path.join(REAL, 'color', 'flag_south_africa.svg'), 450);
  host.moves = {}; host.containers = null; host.calls = {};
  el('groupBy').value = 'color'; el('container').value = 'roll'; el('time').value = '4'; el('grain').checked = false;
  const QP3 = window.CorvoQtyPanel, spec3 = QP3.spec;
  QP3.spec = () => ({ qty: { 0: 3 }, mirror: { 1: true }, keepClose: false, any: true });
  el('btnNest').click();
  await waitState(['review', 'idle'], 120);
  QP3.spec = spec3;
  const S5 = P(), base5 = host.groups ? host.groups.length : 0;
  check(S5.state === 'review' && S5.qx && S5.qx.extra === 3 && host.calls.corvoM3Ghosts === 1, 'colour run with 2 copies + 1 mirrored copy, ghosts created once: ' + el('status').textContent);
  if (S5.qx && S5.mn) {
    const grpOf = {};
    S5.mn.results.forEach((r, gi) => r.units.forEach((u) => { grpOf[u.hostI !== undefined ? u.hostI : u.id] = gi; }));
    const ghosts = S5.qx.pieces.filter((x) => x.copyOf !== undefined);
    check(ghosts.every((g) => host.moves[g.hostI] && g.hostI >= base5), `every ghost (host index >= ${base5}) moved by its job`);
    check(ghosts.every((g) => grpOf[g.hostI] !== undefined && grpOf[g.hostI] === grpOf[g.copyOf]), 'copies and the mirrored copy in the roll of their original colour');
    const cont5 = host.containers ? host.containers.list : [];
    const gBad = ghosts.filter((g) => {
      const mv = host.moves[g.hostI], c = cont5[grpOf[g.hostI]];
      const poly = g.polygon.map(([x, y]) => [x + g.ref[0], y + g.ref[1]]);
      return !c || !inside(G.bbox(G.applyMove(poly, mv)), c, 0.6);
    });
    check(!gBad.length, `ghost outlines inside their colour roll (${gBad.length} outside)`);
    check(S5.m9Count === S5.qx.pieces.length, 'Apply count = pieces incl. copies: ' + S5.m9Count);
  }
  el('btnCancel').click();
  await waitState(['idle'], 30);

  // ---------------------------------------------------------------- 4. MODULO 9: edition gating + Apply limit counting copies
  console.log('\n== panel: licence gating after the trial (merge 3/4-7/9)');
  const LIC = window.CorvoLicense;
  store['corvo.m9'] = JSON.stringify({ trialStart: Date.now() - 40 * 864e5, lastSeen: Date.now() });
  await LIC.init({ localStorage: globalThis.localStorage, file: null });   // file:null = nothing written to %APPDATA%
  check(LIC.state().mode === 'expired' && !LIC.has('colorNest') && !LIC.has('multiSheet') && LIC.has('quantity'), 'trial ended: colour / sheets locked, quantities free');
  host.items = colorItems(path.join(REAL, 'color', 'flag_south_africa.svg'), 450);
  host.moves = {}; host.containers = null; host.calls = {};
  el('groupBy').value = 'color'; el('container').value = 'roll'; el('time').value = '2';
  el('btnNest').click();
  await new Promise((r) => setTimeout(r, 300));
  check(P().state === 'idle' && !host.calls.corvoExport && /Pro/.test(el('status').textContent), 'Nest by colour refused before any export: ' + el('status').textContent);
  el('groupBy').value = 'none'; el('container').value = 'sheets';
  el('btnNest').click();
  await new Promise((r) => setTimeout(r, 300));
  check(P().state === 'idle' && !host.calls.corvoExport && /Pro/.test(el('status').textContent), 'Sheets refused before any export: ' + el('status').textContent);
  el('container').value = 'roll';
  // copies (module 3, Standard) are allowed, and the Apply limit counts them: 1 design x 12 = 11 extra pieces
  const QP = window.CorvoQtyPanel, origSpec = QP.spec;
  QP.spec = () => ({ qty: { 0: 12 }, mirror: {}, keepClose: false, any: true });
  el('btnNest').click();
  await waitState(['review', 'idle'], 60);
  const n0 = host.groups ? host.groups.length : 0, S4 = P();
  check(S4.state === 'review' && S4.m9Count === n0 + 11 && host.calls.corvoM3Ghosts === 1, `copies nested in the trial-ended edition: ${n0} pieces + 11 copies = ${S4.m9Count}`);
  el('btnApply').click();
  await new Promise((r) => setTimeout(r, 300));
  check(n0 <= 10 && S4.m9Count > 10 && !host.calls.corvoFinish && P().state === 'review' && /10/.test(el('status').textContent),
    `Apply refused only because of the copies (${n0} <= 10 < ${S4.m9Count}): ` + el('status').textContent);
  el('btnCancel').click();
  await waitState(['idle'], 30);
  QP.spec = origSpec;

  console.warn = origWarn;
  console.log(`\n${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
