// node plugin/tools/test_raster.js [seconds per nest = 20] [dtf dir]
// MODULO 8 — DTF raster -> contour. No Illustrator: decoder, cleaning, tracing, mapping, offset, and a real
// wasm nest (same no-modules glue the worker uses) of 30 mixed copies on a 22" (558.8 mm) roll,
// silhouette vs trimmed bounding box vs whole canvas.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib'), os = require('os');
const CLIENT = path.join(__dirname, '..', 'client');
const R = require(path.join(CLIENT, 'js', 'raster.js'));
const G = require(path.join(CLIENT, 'js', 'geometry.js'));
const C = require(path.join(CLIENT, 'lib', 'clipper.js'));

const SECS = +(process.argv[2] || 20);
const DIR = process.argv[3] || path.join(__dirname, '..', '..', '..', 'Plugin', 'bench', 'real', 'dtf');
const MM = 72 / 25.4;
let failures = 0;
function check(ok, msg) { if (!ok) { failures++; console.log('  FAIL: ' + msg); } }

// ---------------------------------------------------------------- tiny PNG encoder (fixtures)
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); Buffer.from(data).copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
// px(x,y) -> array of channel values (0..2^depth-1); only depth 8/16
function encodePNG(w, h, ct, depth, px, { interlace = false, plte = null, trns = null } = {}) {
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], bpc = depth / 8;
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const rows = [];
  for (const [xs, ys, dx, dy] of passes) {
    const pw = Math.ceil((w - xs) / dx), ph = Math.ceil((h - ys) / dy);
    if (pw <= 0 || ph <= 0) continue;
    for (let y = 0; y < ph; y++) {
      const row = Buffer.alloc(1 + pw * ch * bpc); row[0] = 0;
      for (let x = 0; x < pw; x++) {
        const v = px(xs + x * dx, ys + y * dy);
        for (let c = 0; c < ch; c++) {
          if (bpc === 1) row[1 + x * ch + c] = v[c];
          else row.writeUInt16BE(v[c], 1 + (x * ch + c) * 2);
        }
      }
      rows.push(row);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = depth; ihdr[9] = ct; ihdr[12] = interlace ? 1 : 0;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (plte) parts.push(chunk('PLTE', plte));
  if (trns) parts.push(chunk('tRNS', trns));
  parts.push(chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------- 1. decoder
console.log('1. PNG decoder');
{
  const W = 37, H = 23, a = (x, y) => (x * 7 + y * 13) % 256;
  const ref = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ref[y * W + x] = a(x, y);
  const same = (img, exp) => img.alpha.every((v, i) => v === exp[i]);
  let img = R.decodePNG(encodePNG(W, H, 6, 8, (x, y) => [x, y, 0, a(x, y)]));
  check(same(img, ref) && img.hasAlpha, 'RGBA 8');
  img = R.decodePNG(encodePNG(W, H, 6, 8, (x, y) => [x, y, 0, a(x, y)], { interlace: true }));
  check(same(img, ref), 'RGBA 8 Adam7 interlaced');
  img = R.decodePNG(encodePNG(W, H, 6, 16, (x, y) => [x, y, 0, a(x, y) * 257]));
  check(same(img, ref), 'RGBA 16');
  img = R.decodePNG(encodePNG(W, H, 4, 8, (x, y) => [x, a(x, y)], { interlace: true }));
  check(same(img, ref), 'gray+alpha interlaced');
  img = R.decodePNG(encodePNG(W, H, 2, 8, (x, y) => [x, y, 5]));
  check(!img.hasAlpha && img.alpha.every((v) => v === 255), 'RGB without alpha');
  const keyed = R.decodePNG(encodePNG(W, H, 2, 8, (x, y) => (x < 10 ? [1, 2, 3] : [9, 9, 9]), { trns: Buffer.from([0, 1, 0, 2, 0, 3]) }));
  check(keyed.hasAlpha && keyed.alpha[0] === 0 && keyed.alpha[20] === 255, 'RGB + tRNS colour key');
  const pal = R.decodePNG(encodePNG(W, H, 3, 8, (x) => [x % 3], { plte: Buffer.alloc(9, 128), trns: Buffer.from([0, 200]) }));
  check(pal.alpha[0] === 0 && pal.alpha[1] === 200 && pal.alpha[2] === 255, 'palette + tRNS');
  let threw = false; try { R.decodePNG(Buffer.from('GIF89a......')); } catch (e) { threw = e.code === 'notPng'; }
  check(threw, 'non-PNG rejected with code notPng');
}

// ---------------------------------------------------------------- 2. cleaning, no transparency
console.log('2. cleaning / no-transparency');
{
  const W = 200, H = 160;
  const inSq = (x, y) => x >= 40 && x < 160 && y >= 30 && y < 130;
  const speck = (x, y) => (x >= 5 && x < 7 && y >= 5 && y < 7) || (x === 180 && y === 150);
  const pinhole = (x, y) => x >= 90 && x < 92 && y >= 70 && y < 72;          // tiny hole: filled
  const bigHole = (x, y) => x >= 60 && x < 80 && y >= 50 && y < 90;          // real hole: kept
  const img = R.decodePNG(encodePNG(W, H, 6, 8, (x, y) =>
    [0, 0, 0, (inSq(x, y) && !pinhole(x, y) && !bigHole(x, y)) || speck(x, y) ? 255 : 0]));
  const t = R.traceAlpha(img, {});
  check(t.outers.length === 1 && t.holes.length === 1, `square: expected 1 outer + 1 hole, got ${t.outers.length}+${t.holes.length}`);
  check(t.stats.specksRemoved === 2 && t.stats.holesFilled === 1, `specks ${t.stats.specksRemoved}/2, pinholes ${t.stats.holesFilled}/1`);
  const bb = t.bboxPx;
  check(bb[0] === 40 && bb[1] === 30 && bb[2] === 160 && bb[3] === 130, 'trimmed bbox ignores specks: ' + bb);
  // staircase: a hard-edged 45 degree diagonal must come out as ~1 straight edge, not a staircase
  const tri = R.decodePNG(encodePNG(W, H, 6, 8, (x, y) => [0, 0, 0, x >= 20 && y >= 20 && y < 140 && x - 20 < y - 20 ? 255 : 0]));
  const tt = R.traceAlpha(tri, {});
  check(tt.outers.length === 1 && tt.outers[0].length <= 8, `diagonal edge simplified to ${tt.outers[0].length} vertices (<= 8)`);
  const opaque = R.traceAlpha(R.decodePNG(encodePNG(W, H, 2, 8, () => [200, 10, 10])), {});
  check(opaque.mode === 'canvas' && opaque.warnings[0] === 'noAlpha', 'RGB image -> rectangle + noAlpha warning');
  const full = R.traceAlpha(R.decodePNG(encodePNG(W, H, 6, 8, () => [0, 0, 0, 255])), {});
  check(full.mode === 'canvas' && full.warnings[0] === 'noTransparency', 'fully opaque RGBA -> rectangle + noTransparency warning');
  let threw = false; try { R.traceAlpha(R.decodePNG(encodePNG(W, H, 6, 8, () => [0, 0, 0, 0])), {}); } catch (e) { threw = e.code === 'empty'; }
  check(threw, 'fully transparent -> error empty');
}

// ---------------------------------------------------------------- 3. real PNGs
console.log('3. real DTF PNGs (' + DIR + ')');
const DESIGNS = [                                   // print width in mm (typical DTF sizes)
  { file: 'dtf_donut_ring_hole.png', mm: 90, expHoles: 1 },
  { file: 'dtf_cat_silhouette.png', mm: 110 },
  { file: 'dtf_star_simple.png', mm: 80 },
  { file: 'dtf_butterfly.png', mm: 100 },
  { file: 'dtf_welcome_cursive_text.png', mm: 230 }
];
const X0 = 3000, Y0 = -1200;                        // pt, far from the origin like a real document
function cornersFor(img, mm, rotDeg = 0, mirror = false) {
  const wpt = mm * MM, hpt = wpt * img.height / img.width, a = rotDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const rot = ([x, y]) => [X0 + c * x - s * y, Y0 + s * x + c * y];
  const sx = mirror ? -1 : 1;                       // image x right, image y down -> doc -y
  return { tl: rot([0, 0]), tr: rot([sx * wpt, 0]), bl: rot([0, -hpt]), scale: wpt / img.width };
}
const table = [];
for (const d of DESIGNS) {
  const bytes = fs.readFileSync(path.join(DIR, d.file));
  const t0 = Date.now();
  const img = R.decodePNG(bytes);
  const cr = cornersFor(img, d.mm);
  const res = R.trace(img, cr, {});
  const ms = Date.now() - t0;
  const px = res.px, dev = R.deviation(px);
  const ratio = px.stats.contourPx / px.stats.bboxPx;
  const areaDoc = res.outers.reduce((s, r) => s + R.signedArea(r), 0) + res.holes.reduce((s, r) => s + R.signedArea(r), 0);
  const areaExp = px.stats.contourPx * cr.scale * cr.scale;
  check(Math.abs(areaDoc - areaExp) / areaExp < 1e-6, d.file + ' document area / orientation (outers CCW, holes CW)');
  check((d.expHoles || 0) === 0 || res.holes.length === d.expHoles, `${d.file}: expected ${d.expHoles} hole(s), got ${res.holes.length}`);
  check(dev.maxPx <= 1.5 && dev.maxBackPx <= 1.5, `${d.file}: deviation ${dev.maxPx.toFixed(2)} / ${dev.maxBackPx.toFixed(2)} px > 1.5`);
  check(Math.abs(px.stats.cleanPx / px.stats.contourPx - 1) < 0.03, `${d.file}: contour area vs mask area`);
  // rotated + mirrored placement: same area, holes preserved, CCW outers
  const rr = R.trace(img, cornersFor(img, d.mm, 30, true), {});
  const areaRot = rr.outers.reduce((s, r) => s + R.signedArea(r), 0) + rr.holes.reduce((s, r) => s + R.signedArea(r), 0);
  check(Math.abs(areaRot - areaDoc) / areaDoc < 1e-6 && rr.holes.length === res.holes.length, d.file + ' rotated+mirrored mapping');
  // outward offset (Clipper): area grows by about perimeter * offset
  const off = R.trace(img, cr, { offset: 6 * MM });
  const aOff = off.outers.reduce((s, r) => s + R.signedArea(r), 0) + off.holes.reduce((s, r) => s + R.signedArea(r), 0);
  check(aOff > areaDoc, d.file + ' offset grows the contour');
  table.push({ file: d.file, px: `${img.width}x${img.height}`, mm: `${d.mm}x${(d.mm * img.height / img.width).toFixed(0)}`,
    outers: res.outers.length, holes: res.holes.length, vertices: px.stats.vertices, ratio: (ratio * 100).toFixed(1) + '%',
    devMaxPx: dev.maxPx.toFixed(2), devMeanPx: dev.meanPx.toFixed(2), devBackPx: dev.maxBackPx.toFixed(2), ms });
  d.img = img; d.res = res; d.corners = cr;
}
console.table(table);

// prepareItems: temp PNG written by the host is read and deleted
{
  const tmp = path.join(os.tmpdir(), 'corvo_m8_test_' + process.pid + '.png');
  fs.copyFileSync(path.join(DIR, DESIGNS[0].file), tmp);
  const out = R.prepareItems([{ i: 0, name: 'donut', rings: [], raster: { path: tmp, temp: true, corners: DESIGNS[0].corners } },
                              { i: 1, name: 'vector', rings: [[[0, 0], [10, 0], [10, 10]]] }], {});
  check(!fs.existsSync(tmp), 'temp PNG deleted after reading');
  check(out.items[0].rings.length === 2 && out.items[0].rasterInfo.holes === 1 && out.items[1].rings.length === 1, 'prepareItems rings');
}

// ---------------------------------------------------------------- 4. wasm nest: silhouette vs bbox vs canvas
const glue = fs.readFileSync(path.join(CLIENT, 'lib', 'corvo.js'), 'utf8');
const ctx = { console, TextEncoder, TextDecoder, WebAssembly, performance, BigInt, Error, Symbol, Object, Array,
  Uint8Array, Float32Array, Int32Array, BigInt64Array, DataView, Math, Number, String, JSON, Function, Promise,
  queueMicrotask, setTimeout, Date, crypto: globalThis.crypto };
ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
const wb = vm.runInContext(glue + ';wasm_bindgen;', ctx);

const PRESET = R.PRESETS.dtf22, H = PRESET.rollMm * MM, GAP = PRESET.gapMm * MM, COPIES = 6;
const SAFETY = PRESET.safetyMm * MM;          // outward contour offset: Sparrow's separation can fall ~0.2 mm short
const ORIENT = G.rotationsFor('90');

function buildSet(mode) {
  return DESIGNS.map((d, k) => {
    const res = R.trace(d.img, d.corners, { mode, offset: SAFETY });
    const piece = G.buildPiece({ i: k, name: d.file, rings: res.rings }, { gap: GAP, flatness: 0.5 });
    if (piece.error) throw new Error(d.file + ': ' + piece.error);
    return { piece, rings: res.outers, trueArea: d.res.outers.reduce((s, r) => s + R.signedArea(r), 0) +
             d.res.holes.reduce((s, r) => s + R.signedArea(r), 0) };
  });
}
async function nest(set) {
  const instance = { name: 'corvo-dtf', strip_height: H, items: set.map(({ piece }) => ({ id: piece.id, demand: COPIES,
    allowed_orientations: ORIENT, shape: { type: 'simple_polygon', data: piece.polygon } })) };
  let best = null;
  wb.nest(JSON.stringify(instance), SECS * 0.8, SECS * 0.2, BigInt(7), GAP, (json) => {
    const r = JSON.parse(json); if (!best || r.strip_width <= best.strip_width) best = r;
  });
  return best;
}
// minimum distance between two sets of rings (vertex-to-segment, both ways)
function minDist(A, B) {
  let best = Infinity;
  const segD = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  for (const [P, Q] of [[A, B], [B, A]]) for (const rp of P) for (const p of rp) for (const rq of Q)
    for (let i = 0; i < rq.length; i++) best = Math.min(best, segD(p, rq[i], rq[(i + 1) % rq.length]));
  return best;
}
function overlapArea(A, B) {
  const S = 1000, toP = (rs) => rs.map((r) => r.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) })));
  const c = new C.Clipper(), out = new C.Paths();
  c.AddPaths(toP(A), C.PolyType.ptSubject, true); c.AddPaths(toP(B), C.PolyType.ptClip, true);
  c.Execute(C.ClipType.ctIntersection, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return out.reduce((s, p) => s + Math.abs(C.Clipper.Area(p)), 0) / (S * S);
}

(async () => {
  await wb({ module_or_path: new Uint8Array(fs.readFileSync(path.join(CLIENT, 'lib', 'corvo_bg.wasm'))) });
  console.log(`4. wasm nest: ${DESIGNS.length} designs x ${COPIES} copies on ${PRESET.label}, gap ${PRESET.gapMm} mm, safety offset ${PRESET.safetyMm} mm, ` +
              `rotations 0/90/180/270, ${SECS} s each`);
  const results = {};
  for (const mode of ['contour', 'bbox', 'canvas']) {
    const set = buildSet(mode);
    const t0 = Date.now();
    const best = await nest(set);
    const L = best.strip_width;
    const trueArea = set.reduce((s, x) => s + x.trueArea, 0) * COPIES;
    results[mode] = { L, placed: best.placements.length, density: trueArea / (L * H), ms: Date.now() - t0,
                      methods: set.map((x) => x.piece.method).join(',') };
    check(best.placements.length === DESIGNS.length * COPIES, `${mode}: placed ${best.placements.length}/${DESIGNS.length * COPIES}`);
    if (mode !== 'contour') continue;
    // verify the silhouette layout on the TRUE traced contours: inside roll, no overlap, spacing >= gap
    const placed = best.placements.map((pl) => {
      const x = set[pl.item_id], mv = G.placementToMove(pl, x.piece, [0, 0]);
      const rings = x.rings.map((r) => G.applyMove(r, mv));
      return { rings, bb: G.bbox([].concat(...rings)) };
    });
    let outside = 0, overl = 0, minSp = Infinity;
    for (const p of placed) if (p.bb[0] < -0.6 || p.bb[1] < -0.6 || p.bb[2] > L + 0.6 || p.bb[3] > H + 0.6) outside++;
    for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
      const A = placed[a], B = placed[b];
      if (A.bb[0] > B.bb[2] + 2 * GAP || B.bb[0] > A.bb[2] + 2 * GAP || A.bb[1] > B.bb[3] + 2 * GAP || B.bb[1] > A.bb[3] + 2 * GAP) continue;
      if (overlapArea(A.rings, B.rings) > 0.5) overl++;
      minSp = Math.min(minSp, minDist(A.rings, B.rings));
    }
    results[mode].minSpacingMm = minSp / MM;
    check(!outside, outside + ' pieces outside the roll');
    check(!overl, overl + ' overlapping pairs');
    check(minSp >= GAP - 0.1, `min spacing ${(minSp / MM).toFixed(2)} mm < ${PRESET.gapMm} mm`);
  }
  const rows = {};
  for (const [m, r] of Object.entries(results)) rows[m] = { lengthMm: +(r.L / MM).toFixed(1), placed: r.placed,
    density: (r.density * 100).toFixed(1) + '%', minSpacingMm: r.minSpacingMm ? +r.minSpacingMm.toFixed(2) : '', methods: r.methods };
  console.table(rows);
  const save = (1 - results.contour.L / results.bbox.L) * 100, saveC = (1 - results.contour.L / results.canvas.L) * 100;
  console.log(`saving silhouette vs trimmed bbox: ${save.toFixed(1)}% of roll length; vs untrimmed canvas: ${saveC.toFixed(1)}%`);
  check(results.contour.L < results.bbox.L, 'silhouette nest should be shorter than the bbox nest');
  console.log(failures ? `FAIL (${failures})` : 'PASS');
  process.exitCode = failures ? 1 : 0;
})().catch((e) => { console.log('FAIL: ' + (e && e.stack || e)); process.exitCode = 1; });
