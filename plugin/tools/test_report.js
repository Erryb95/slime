// node plugin/tools/test_report.js [seconds=6]
// Modulo 5: nests bench/suite/insegna48.json and lettering.json with the wasm engine (same no-modules glue
// as the worker), builds the material/cost report and checks that the numbers are consistent.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = path.join(__dirname, '..', 'client');
const G = require(path.join(CLIENT, 'js', 'geometry.js'));
const R = require(path.join(CLIENT, 'js', 'report.js'));

const SECS = +(process.argv[2] || 6);
const MM = 72 / 25.4, ROLL_MM = 600, GAP_MM = 2, ROT = '90';
const DOC_OFFSET = [2400, -1800];
let fails = 0;
function check(cond, msg) { if (!cond) { fails++; console.log('  FAIL: ' + msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-9) * Math.max(1, Math.abs(a), Math.abs(b));

// ---- pure unit checks (no wasm) ----
(function unit() {
  const W = 600;
  check(near(R.materialCost(2000, W, { price: 5 }).cost, 10), 'per metre: 2 m x 5 = 10');
  check(near(R.materialCost(2000, W, { price: 10, priceUnit: 'm2' }).cost, 12), 'per m2: 1.2 m2 x 10 = 12');
  const sh = R.materialCost(2100, W, { price: 7, priceUnit: 'sheet', sheetLengthMm: 1000 });
  check(sh.sheets === 3 && near(sh.cost, 21), 'sheets: ceil(2.1) x 7 = 21');
  check(R.materialCost(2000, W, { price: 7, priceUnit: 'sheet', sheetLengthMm: 1000 }).sheets === 2, 'exact sheets');
  check(near(R.materialCost(1000, W, { price: 10, wastePct: 10 }).cost, 11), 'allowance +10%');
  const m = R.normalizeMaterial({ price: 'abc', currency: 'GBP', priceUnit: 'x', wastePct: -5 });
  check(m.price === 0 && m.currency === 'EUR' && m.priceUnit === 'm' && m.wastePct === 0, 'normalizeMaterial guards');
  // shelf: 4 squares 100x100 pt on H=210, gap 10 -> 2 per shelf, 2 shelves -> 100+10+100 = 210
  const sq = (s) => [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]];
  const bl = R.shelfBaseline([0, 1, 2, 3].map((i) => ({ id: i, polygon: sq(100) })), 210, 10, [0]);
  check(bl && near(bl.lengthPt, 210) && bl.shelves === 2, 'shelf baseline squares ' + JSON.stringify(bl));
  // a 300x50 bar on H=200: without rotation it cannot stand up -> 300 along; with 90 still 300 (too tall)
  const bar = [{ id: 0, polygon: [[0, 0], [300, 0], [300, 50], [0, 50]] }];
  check(near(R.shelfBaseline(bar, 200, 0, [0, 90]).lengthPt, 300), 'bar cannot rotate into the roll');
  check(near(R.shelfBaseline(bar, 400, 0, [0, 90]).lengthPt, 50), 'bar rotated across');
  check(R.shelfBaseline(bar, 40, 0, [0]) === null, 'too wide -> null');
  // zero pieces / zero length: no NaN, no throw
  // module 1 data model: clustered pieces carry layers[] and box; degenerate-dropped pieces keep hostI
  {
    const sqp = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const pcs = [{ id: 0, hostI: 1, name: 'A', polygon: sqp, area: 10000 }, { id: 1, hostI: 2, name: 'B', polygon: sqp, area: 10000 }];
    const its = [{ i: 0, layers: ['X'], box: [0, 100, 100, 0] }, { i: 1, layers: ['Print', 'CUT'], box: [0, 100, 100, 0] },
                 { i: 2, layer: 'Solo', box: [200, 100, 300, 0] }];
    const lr = R.computeReport({ pieces: pcs, placements: [{ item_id: 0, rotation: 0, translation: [0, 0] }, { item_id: 1, rotation: 0, translation: [200, 0] }],
      stripLengthPt: 300, rollWidthPt: 600 * MM, gapPt: 0, items: its, material: { price: 1 } });
    check(lr.rows[0].layer === 'Print + CUT' && lr.rows[1].layer === 'Solo', 'layer column from clustered pieces (hostI, layers[]): ' + lr.rows.map((r) => r.layer));
    check(lr.initial && near(lr.initial.lengthMm, 100 / MM, 1e-9), "original length from piece box (300x100 pt turned)");
  }
  // MODULO 6: registration marks -> material = whole roll x (nest + margins); savings compare like with like
  {
    const sqp = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const base = { pieces: [{ id: 0, name: 'A', polygon: sqp, area: 10000 }], placements: [{ item_id: 0, rotation: 0, translation: [0, 0] }],
      stripLengthPt: 1000 * MM, rollWidthPt: 560 * MM, gapPt: 0, material: { price: 10 }, baseline: { lengthPt: 1200 * MM, shelves: 1, policy: 'x' } };
    const r0 = R.computeReport(base);
    const r1 = R.computeReport(Object.assign({}, base, { materialWidthPt: 600 * MM, materialLengthPt: 1100 * MM }));
    check(near(r1.lengthMm, 1100, 1e-9) && near(r1.rollWidthMm, 600, 1e-9) && near(r1.materialCost, 11, 1e-9), 'marks: cost on roll length incl. margins');
    check(near(r1.baseline.savedM, r0.baseline.savedM, 1e-9), 'marks: saving vs rectangles unchanged by the constant margins');
  }
  const empty = R.computeReport({ pieces: [], placements: [], stripLengthPt: 0, rollWidthPt: 600 * MM, gapPt: 0, material: { price: 5 } });
  check(empty.fillPct === 0 && empty.costPerPiece === 0 && isFinite(empty.totalCost), 'empty report finite');
  // CSV quoting / injection
  const csv = R.toCSV(Object.assign(empty, { job: 'Rossi; "insegna"', rows: [{ name: '=cmd()', layer: 'Livello 1', areaMm2: 1.5, rotation: 90, xMm: 0, yMm: 0, wMm: 1, hMm: 1 }] }), 'it');
  check(csv.charCodeAt(0) === 0xfeff, 'CSV BOM');
  check(csv.includes('"Rossi; ""insegna"""'), 'CSV quoting');
  check(csv.includes("'=cmd()"), 'CSV formula injection guard');
  check(csv.includes(';1,5;'), 'IT decimal comma');
  console.log('unit: ' + (fails ? fails + ' failure(s)' : 'ok'));
})();

// ---- wasm nest + report on the suites ----
const glue = fs.readFileSync(path.join(CLIENT, 'lib', 'corvo.js'), 'utf8');
const ctx = { console, TextEncoder, TextDecoder, WebAssembly, performance, BigInt, Error, Symbol, Object, Array,
  Uint8Array, Float32Array, Int32Array, BigInt64Array, DataView, Math, Number, String, JSON, Function, Promise,
  queueMicrotask, setTimeout, Date, crypto: globalThis.crypto };
ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
const wb = vm.runInContext(glue + ';wasm_bindgen;', ctx);

function loadSuite(name) {
  const suite = JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', 'suite', name + '.json'), 'utf8'));
  const toDoc = (r) => r.map(([x, y]) => [x * MM + DOC_OFFSET[0], y * MM + DOC_OFFSET[1]]);
  // lay the pieces out as they would sit on an artboard: rows that wrap at 580 mm (for the "original" length)
  let cx = 0, cy = 0, rowH = 0;
  return suite.items.map((it, k) => {
    const s = it.shape, rings = [];
    if (s.type === 'simple_polygon') rings.push(s.data);
    else { rings.push(s.data.outer); (s.data.inner || []).forEach((h) => rings.push(h)); }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    rings.forEach((r) => r.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }));
    if (cx > 0 && cx + (x1 - x0) > 580) { cx = 0; cy += rowH + 10; rowH = 0; }
    const dx = cx - x0, dy = cy - y0;
    cx += x1 - x0 + 10; rowH = Math.max(rowH, y1 - y0);
    return { i: k, name: 'pezzo ' + it.id, layer: k % 2 ? 'Taglio' : 'Livello 1',
      rings: rings.map((r) => toDoc(r.map(([x, y]) => [x + dx, y + dy]))) };
  });
}

async function run(name, material) {
  const items = loadSuite(name);
  const H = ROLL_MM * MM, gap = GAP_MM * MM, orient = G.rotationsFor(ROT);
  const pieces = G.buildPieces(items, { gap, flatness: 0.5 });
  const instance = G.buildInstance(pieces, H, orient);
  let best = null;
  const t0 = Date.now();
  wb.nest(JSON.stringify(instance), SECS * 0.8, SECS * 0.2, BigInt(1), gap, (json) => {
    const r = JSON.parse(json);
    if (!best || r.strip_width <= best.strip_width) best = r;
  });
  const rep = R.computeReport({ pieces, placements: best.placements, stripLengthPt: best.strip_width, rollWidthPt: H,
    gapPt: gap, orientations: orient, material, items, job: name, date: '2026-09-24' });

  console.log(`\n== ${name}: ${pieces.length} pieces, nest ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const areaSumMm2 = pieces.reduce((s, p) => s + p.area, 0) / (MM * MM);
  const rowSum = rep.rows.reduce((s, r) => s + r.areaMm2, 0);
  check(rep.pieces === pieces.length, 'all pieces in the report');
  check(near(rowSum, areaSumMm2, 1e-9), `row areas ${rowSum} = pieces area ${areaSumMm2}`);
  check(near(rep.piecesM2 * 1e6, areaSumMm2, 1e-9), 'piecesM2 = sum of areas');
  check(near(rep.lengthMm, best.strip_width / MM, 1e-12), 'length = strip width');
  check(near(rep.usedM2, rep.lengthM * ROLL_MM / 1000, 1e-12), 'used area = L x W');
  check(near(rep.fillPct, rep.piecesM2 / rep.usedM2 * 100, 1e-12), 'fill = pieces / used');
  check(near(rep.fillPct + rep.wastePct, 100, 1e-12) && near(rep.wasteM2, rep.usedM2 - rep.piecesM2, 1e-12), 'waste = used - pieces');
  check(rep.piecesM2 <= rep.usedM2 && rep.fillPct > 0 && rep.fillPct < 100, 'pieces <= used, 0 < fill < 100');
  const expCost = material.priceUnit === 'm2' ? rep.usedM2 * material.price : rep.lengthM * material.price;
  check(near(rep.materialCost, expCost * (1 + (material.wastePct || 0) / 100), 1e-12), 'cost = length x price');
  check(near(rep.costPerPiece * rep.pieces, rep.totalCost, 1e-12), 'cost per piece x n = total');
  check(rep.baseline && rep.baseline.lengthMm > rep.lengthMm, `rectangle baseline ${rep.baseline && rep.baseline.lengthMm.toFixed(0)} mm > nest ${rep.lengthMm.toFixed(0)} mm`);
  check(rep.baseline && rep.baseline.savedMoney > 0 && near(rep.baseline.savedM2, rep.baseline.savedM * ROLL_MM / 1000, 1e-12), 'baseline savings positive and consistent');
  check(rep.initial && rep.initial.lengthMm > rep.lengthMm, 'original layout (artboard rows, turned) longer than nest: ' + (rep.initial && rep.initial.lengthMm.toFixed(0)));
  // every piece bbox inside the strip (placed bbox of the simplified polygon, 1 mm tolerance)
  const out = rep.rows.filter((r) => r.xMm < -1 || r.yMm < -1 || r.xMm + r.wMm > rep.lengthMm + 1 || r.yMm + r.hMm > ROLL_MM + 1);
  check(!out.length, 'rows inside the strip: ' + out.map((r) => r.name).join(','));
  const csv = R.toCSV(rep, 'it');
  const lines = csv.replace(/^﻿/, '').trim().split(/\r\n/);
  check(lines.length === 4 + rep.rows.length, 'CSV lines = 2 summary + blank + header + rows');
  check(lines[0].split(';').length === lines[1].split(';').length, 'CSV summary header/values same width');
  return rep;
}

(async () => {
  await wb({ module_or_path: new Uint8Array(fs.readFileSync(path.join(CLIENT, 'lib', 'corvo_bg.wasm'))) });
  const r1 = await run('insegna48', { name: 'Oracal 651 nero', price: 4.5, priceUnit: 'm', currency: 'EUR', jobsPerMonth: 20 });
  console.log('\n' + R.toText(r1, 'it'));
  const r2 = await run('lettering', { name: 'Avery 700', price: 9.8, priceUnit: 'm2', wastePct: 5, currency: 'USD', laborRate: 40, weedMinPerM2: 12 });
  console.log('\n' + R.toText(r2, 'en'));
  const tot = R.combine([r1, r2]);
  check(near(tot.lengthMm, r1.lengthMm + r2.lengthMm, 1e-12) && near(tot.usedM2, r1.usedM2 + r2.usedM2, 1e-12), 'combine sums');
  check(near(tot.fillPct, tot.piecesM2 / tot.usedM2 * 100, 1e-12), 'combine fill recomputed');
  const csv = R.toCSV(r2, 'en').split('\r\n');
  console.log('\nCSV (lettering, en, first 6 lines):\n' + csv.slice(0, 6).join('\n'));
  console.log(fails ? `\nFAIL (${fails})` : '\nPASS');
  if (fails) process.exitCode = 1;
})().catch((e) => { console.log('FAIL: ' + (e && e.stack || e)); process.exitCode = 1; });
