// node plugin/tools/test_client.js [seconds=10] [suite.json]
// End-to-end test of the panel pipeline without Illustrator:
//   suite items (mm) -> fake corvoExport items (document pt, offset far from origin)
//   -> geometry.buildPieces -> Sparrow instance -> wasm nest (same no-modules glue, via vm)
//   -> placementToMove -> checks: all placed, inside the roll, no overlaps, density.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const CLIENT = path.join(__dirname, '..', 'client');
const G = require(path.join(CLIENT, 'js', 'geometry.js'));
const ClipperLib = require(path.join(CLIENT, 'lib', 'clipper.js'));

const SECS = +(process.argv[2] || 10);
const SUITE = process.argv[3] || path.join(__dirname, '..', '..', 'bench', 'suite', 'lettering.json');
const MM = 72 / 25.4;
const ROLL_MM = 600, GAP_MM = 2, ROT = '90';
const DOC_OFFSET = [2400, -1800];                 // pt, pieces are not near the origin in a real doc

function fail(msg) { console.log('FAIL: ' + msg); process.exitCode = 1; }

// ---- 1. fake corvoExport ------------------------------------------------------------------
const suite = JSON.parse(fs.readFileSync(SUITE, 'utf8'));
const toDoc = (r) => r.map(([x, y]) => [x * MM + DOC_OFFSET[0], y * MM + DOC_OFFSET[1]]);
const items = suite.items.map((it, k) => {
  const s = it.shape, rings = [];
  if (s.type === 'simple_polygon') rings.push(s.data);
  else if (s.type === 'polygon') { rings.push(s.data.outer); (s.data.inner || []).forEach((h) => rings.push(h)); }
  else throw new Error('unsupported shape ' + s.type);
  return { i: k, name: 'item' + it.id, rings: rings.map(toDoc) };
});
// synthetic multi-part pieces: an "i" (stem + dot 3 mm apart -> closing) and two far bars (-> hull)
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
let n = items.length;
items.push({ i: n++, name: 'synthetic-i', rings: [rect(0, 0, 20, 90), rect(0, 93, 20, 20)].map(toDoc) });
items.push({ i: n++, name: 'synthetic-far', rings: [rect(0, 0, 30, 30), rect(150, 0, 30, 30)].map(toDoc) });
// ring with a tiny sliver (< 0.5 pt^2) that must be discarded
items.push({ i: n++, name: 'synthetic-sliver', rings: [rect(0, 0, 50, 40), rect(80, 0, 0.1, 0.1)].map(toDoc) });

// ---- 2. geometry ----------------------------------------------------------------------------
const H = ROLL_MM * MM, gap = GAP_MM * MM, orient = G.rotationsFor(ROT);
let t0 = Date.now();
const pieces = G.buildPieces(items, { gap, flatness: 0.5 });
const geomMs = Date.now() - t0;
const bad = pieces.filter((p) => p.error);
if (bad.length) fail('pieces with errors: ' + JSON.stringify(bad));
const methods = {};
pieces.forEach((p) => { methods[p.method] = (methods[p.method] || 0) + 1; });
const maxV = Math.max(...pieces.map((p) => p.vertices));
const nonSimple = pieces.filter((p) => !G.isSimple(p.polygon));
if (nonSimple.length) fail('non-simple polygons: ' + nonSimple.map((p) => p.name));
const byName = Object.fromEntries(pieces.map((p) => [p.name, p]));
if (byName['synthetic-i'].method !== 'closed') fail('synthetic-i expected closed, got ' + byName['synthetic-i'].method);
if (!/hull/.test(byName['synthetic-far'].method)) fail('synthetic-far expected hull, got ' + byName['synthetic-far'].method);
if (byName['synthetic-sliver'].parts !== 1) fail('sliver not discarded');
for (const p of pieces) if (G.minExtent(p.polygon, orient) > H) fail(p.name + ' does not fit the roll');
console.log(`geometry: ${pieces.length} pieces in ${geomMs} ms, methods ${JSON.stringify(methods)}, max vertices ${maxV}`);

// ---- 3. wasm (same no-modules glue the worker uses) -----------------------------------------
const glue = fs.readFileSync(path.join(CLIENT, 'lib', 'corvo.js'), 'utf8');
const ctx = { console, TextEncoder, TextDecoder, WebAssembly, performance, BigInt, Error, Symbol, Object, Array,
  Uint8Array, Float32Array, Int32Array, BigInt64Array, DataView, Math, Number, String, JSON, Function, Promise,
  queueMicrotask, setTimeout, Date, crypto: globalThis.crypto };
ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
const wb = vm.runInContext(glue + ';wasm_bindgen;', ctx);

(async () => {
  await wb({ module_or_path: new Uint8Array(fs.readFileSync(path.join(CLIENT, 'lib', 'corvo_bg.wasm'))) });
  const instance = G.buildInstance(pieces, H, orient);
  let reports = 0, best = null, firstMs = null;
  t0 = Date.now();
  wb.nest(JSON.stringify(instance), SECS * 0.8, SECS * 0.2, BigInt(1), gap, (json) => {
    const r = JSON.parse(json); reports++;
    if (firstMs === null) firstMs = Date.now() - t0;
    if (!best || r.strip_width <= best.strip_width) best = r;
  });
  const wall = (Date.now() - t0) / 1000;

  // ---- 4. checks ---------------------------------------------------------------------------
  const L = best.strip_width;
  if (best.placements.length !== pieces.length) fail(`placed ${best.placements.length}/${pieces.length}`);
  const origin = [0, 0];
  const S = 1000, tolPt = 0.6;          // tolerance: simplification inflates/deflates <= flatness
  const polys = [];
  let outside = 0;
  for (const pl of best.placements) {
    const piece = pieces.find((p) => p.id === pl.item_id);
    const item = items[piece.id];
    const mv = G.placementToMove(pl, piece, origin);
    const rings = item.rings.map((r) => G.applyMove(r, mv));
    const b = G.bbox([].concat(...rings));
    if (b[0] < -tolPt || b[1] < -tolPt || b[2] > L + tolPt || b[3] > H + tolPt) {
      outside++; console.log('  outside roll:', piece.name, b.map((v) => v.toFixed(2)).join(','));
    }
    polys.push({ name: piece.name, paths: rings.map((r) => r.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }))) });
  }
  // pairwise overlap of the ORIGINAL artwork after the move (nonzero silhouettes)
  let overlaps = 0, maxOv = 0;
  for (let a = 0; a < polys.length; a++) for (let b = a + 1; b < polys.length; b++) {
    const c = new ClipperLib.Clipper(), out = new ClipperLib.Paths();
    c.AddPaths(polys[a].paths, ClipperLib.PolyType.ptSubject, true);
    c.AddPaths(polys[b].paths, ClipperLib.PolyType.ptClip, true);
    c.Execute(ClipperLib.ClipType.ctIntersection, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    const ov = out.reduce((s, p) => s + Math.abs(ClipperLib.Clipper.Area(p)), 0) / (S * S);
    if (ov > 1) { overlaps++; console.log(`  overlap ${polys[a].name} x ${polys[b].name}: ${ov.toFixed(2)} pt2`); }
    maxOv = Math.max(maxOv, ov);
  }
  if (outside) fail(outside + ' pieces outside the roll');
  if (overlaps) fail(overlaps + ' overlapping pairs');
  const areaSum = pieces.reduce((s, p) => s + p.area, 0);
  const density = areaSum / (L * H);
  console.log(`nest: ${SECS}s budget, wall ${wall.toFixed(1)} s, ${reports} feasible reports (first after ${firstMs} ms)`);
  console.log(`result: placed ${best.placements.length}/${pieces.length}, length ${(L / MM).toFixed(1)} mm on ${ROLL_MM} mm roll, ` +
    `density (true area) ${(density * 100).toFixed(1)}%, sparrow density ${(best.density * 100).toFixed(1)}%, ` +
    `max pairwise overlap ${maxOv.toFixed(3)} pt2`);
  if (!process.exitCode) console.log('PASS');
})().catch((e) => { fail(String(e && e.stack || e)); });
