// node plugin/tools/test_robustness.js [secs=10] [sections=1,2,3,4,5,6,7]
//
// Engine-level robustness tests WITHOUT Illustrator: the failure modes users reported on other nesting tools
// (bench/real/cases/**, see bench/real/SOURCES.md "github/" and "forum/"), reproduced on Corvo's pipeline
//   input rings (document pt, y up) -> geometry.buildPieces -> Sparrow instance (+guardInstance) -> wasm nest
//   -> placementToMove -> checks on the ORIGINAL artwork moved by the placements.
// Every section runs in its own child process (a wasm panic or a hang cannot take the others down; memory per
// section is measured in isolation). Output: PASS / FAIL / INFO lines with numbers, exit code 1 on any FAIL.
// Findings and proposed fixes: docs/casi-reali-motore.md.
//
//  1 self-intersecting polygons (jagua-rs #78, 64 pieces + synthetic figure-8) + native sparrow.exe on the JSON
//  2 one huge compound path with 404 subpaths (Deepnest #12): geometry time / memory, no hang
//  3 gap correctness (SVGnest #27, gap 10 mm -> user got 3.5 mm) + contour fidelity (Hausdorff)
//  4 fine features (LightBurn earring snowflake, 0.5 mm details): area loss, min feature width
//  5 termination (deepnest-next #154 DXF, big + small pieces)
//  6 DXF scale / units (Deepnest #149, deepnest-next #149, Deepnest #10): $INSUNITS, bounds in mm
//  7 200+ pieces + mixed huge/tiny: time to first solution, wasm memory
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const CLIENT = path.join(__dirname, '..', 'client');
const CASES = path.join(ROOT, 'bench', 'real', 'cases');
const G = require(path.join(CLIENT, 'js', 'geometry.js'));
const C = require(path.join(CLIENT, 'lib', 'clipper.js'));
const SVG = require(path.join(__dirname, 'svgparse.js'));
const MM = 72 / 25.4, S = 1000;

// =============================================================================== shared helpers
const r2 = (v, d = 2) => (v === null || v === undefined || !isFinite(v)) ? String(v) : (+v).toFixed(d);
function bboxOf(rings) { return G.bbox([].concat(...rings)); }
function toPath(r) { return r.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) })); }
function fromPath(p) { return p.map((q) => [q.X / S, q.Y / S]); }
function pathsArea(ps) { return Math.abs(ps.reduce((s, p) => s + C.Clipper.Area(p), 0)) / (S * S); }
function clip(type, subj, clp, fill) {
  const c = new C.Clipper(), out = new C.Paths();
  c.AddPaths(subj, C.PolyType.ptSubject, true);
  if (clp) c.AddPaths(clp, C.PolyType.ptClip, true);
  c.Execute(type, out, fill, fill);
  return out;
}
const NZ = C.PolyFillType.pftNonZero, EO = C.PolyFillType.pftEvenOdd;
// region of a set of rings: fill rule nonzero with every ring forced CCW = silhouette (holes dropped)
function silhouettePaths(rings) {
  return clip(C.ClipType.ctUnion, rings.map((r) => toPath(G.signedArea(r) < 0 ? r.slice().reverse() : r)), null, NZ);
}
function regionPaths(rings, fill) { return clip(C.ClipType.ctUnion, rings.map(toPath), null, fill); }
function areaMinus(aPaths, bPaths) { return pathsArea(clip(C.ClipType.ctDifference, aPaths, bPaths, NZ)); }
function offsetPaths(paths, d) {
  const co = new C.ClipperOffset(2, 0.05 * S), out = new C.Paths();
  co.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
  co.Execute(out, d * S);
  return out;
}
// distance point-segment, segment-segment
function dPS(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px, ey = ay + t * dy - py; return Math.sqrt(ex * ex + ey * ey);
}
function segCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
function dSS(a, b, c, d) {
  if (segCross(a, b, c, d)) return 0;
  return Math.min(dPS(a[0], a[1], c[0], c[1], d[0], d[1]), dPS(b[0], b[1], c[0], c[1], d[0], d[1]),
    dPS(c[0], c[1], a[0], a[1], b[0], b[1]), dPS(d[0], d[1], a[0], a[1], b[0], b[1]));
}
// min distance between two sets of closed rings (0 if edges cross); skip if bboxes farther than `cut`
function ringsDistance(A, B, cut) {
  const ba = bboxOf(A), bb = bboxOf(B);
  const gx = Math.max(0, bb[0] - ba[2], ba[0] - bb[2]), gy = Math.max(0, bb[1] - ba[3], ba[1] - bb[3]);
  if (Math.hypot(gx, gy) > cut) return Infinity;
  let best = Infinity;
  for (const ra of A) for (const rb of B) {
    const rbb = G.bbox(rb), rab = G.bbox(ra);
    const hx = Math.max(0, rbb[0] - rab[2], rab[0] - rbb[2]), hy = Math.max(0, rbb[1] - rab[3], rab[1] - rbb[3]);
    if (Math.hypot(hx, hy) > Math.min(cut, best)) continue;
    for (let i = 0; i < ra.length; i++) {
      const a = ra[i], b = ra[(i + 1) % ra.length];
      const sx0 = Math.min(a[0], b[0]) - best, sx1 = Math.max(a[0], b[0]) + best;
      const sy0 = Math.min(a[1], b[1]) - best, sy1 = Math.max(a[1], b[1]) + best;
      if (sx1 < rbb[0] || sx0 > rbb[2] || sy1 < rbb[1] || sy0 > rbb[3]) continue;
      for (let j = 0; j < rb.length; j++) {
        const c = rb[j], d = rb[(j + 1) % rb.length];
        if (Math.max(c[0], d[0]) < sx0 || Math.min(c[0], d[0]) > sx1 || Math.max(c[1], d[1]) < sy0 || Math.min(c[1], d[1]) > sy1) continue;
        const v = dSS(a, b, c, d); if (v < best) best = v;
      }
    }
  }
  return best;
}
// directed Hausdorff from rings A to rings B (vertices of A densified to `step`)
function hausdorffDir(A, B, step) {
  let worst = 0;
  const segs = []; for (const r of B) for (let i = 0; i < r.length; i++) segs.push([r[i], r[(i + 1) % r.length]]);
  for (const r of A) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) {
      const px = a[0] + (b[0] - a[0]) * k / n, py = a[1] + (b[1] - a[1]) * k / n; let m = Infinity;
      for (const [c, d] of segs) { const v = dPS(px, py, c[0], c[1], d[0], d[1]); if (v < m) m = v; }
      if (m > worst) worst = m;
    }
  }
  return worst;
}
function hausdorff(A, B, step) { return Math.max(hausdorffDir(A, B, step), hausdorffDir(B, A, step)); }

// self-intersection report of a raw ring: duplicate vertices / crossing non-adjacent edges
function selfIntersections(ring) {
  const n = ring.length, seen = new Map(); let dups = 0, crossings = 0;
  for (const p of ring) { const k = p[0] + ',' + p[1]; if (seen.has(k)) dups++; seen.set(k, 1); }
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) crossings++;
  }
  return { dups, crossings };
}

// ---- wasm (the panel's no-modules glue, run in a vm; memory exposed for the measurements)
let WB = null;
async function wasm() {
  if (WB) return WB;
  let glue = fs.readFileSync(path.join(CLIENT, 'lib', 'corvo.js'), 'utf8');
  glue = glue.replace('return Object.assign(__wbg_init, { initSync }, exports);',
    'return Object.assign(__wbg_init, { initSync, __mem: function () { return wasm && wasm.memory; } }, exports);');
  const ctx = { console, TextEncoder, TextDecoder, WebAssembly, performance, BigInt, Error, Symbol, Object, Array,
    Uint8Array, Float32Array, Int32Array, BigInt64Array, DataView, Math, Number, String, JSON, Function, Promise,
    queueMicrotask, setTimeout, Date, crypto: globalThis.crypto };
  ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
  WB = vm.runInContext(glue + ';wasm_bindgen;', ctx);
  await WB({ module_or_path: new Uint8Array(fs.readFileSync(path.join(CLIENT, 'lib', 'corvo_bg.wasm'))) });
  return WB;
}
function wasmMB() { const m = WB && WB.__mem && WB.__mem(); return m ? m.buffer.byteLength / 1048576 : NaN; }

// nest exactly like main.js: guardInstance, explore 80 % / compress 20 %, best report kept
async function nest(instance, secs, gapPt, seed = 1) {
  const wb = await wasm();
  G.guardInstance(instance, gapPt);
  let best = null, first = null, reports = 0, err = null, final = null;
  const t0 = Date.now();
  try {
    final = JSON.parse(wb.nest(JSON.stringify(instance), secs * 0.8, secs * 0.2, BigInt(seed), gapPt, (json) => {
      const r = JSON.parse(json); reports++;
      if (first === null) first = (Date.now() - t0) / 1000;
      if (!best || r.strip_width <= best.strip_width) best = r;
    }));
  } catch (e) { err = String(e && e.message || e); }
  return { best: best || final, first, reports, wall: (Date.now() - t0) / 1000, err, wasmMB: wasmMB(),
           guarded: instance.guardedHeight || null, stripHeight: instance.strip_height };
}

// placed artwork: one entry per placement, original rings moved (placementToMove + applyMove, origin 0)
function placeAll(best, pieces, ringsOf) {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  return best.placements.map((pl, k) => {
    const piece = byId.get(pl.item_id), mv = G.placementToMove(pl, piece, [0, 0]);
    return { k, id: pl.item_id, name: piece.name, mv, rings: ringsOf(piece).map((r) => G.applyMove(r, mv)) };
  });
}
// like main.js: degenerate pieces stay in place, the others are renumbered 0..n-1 (Sparrow wants consecutive ids), hostI = item index
function usable(pieces) { return pieces.filter((p) => !p.error).map((p, k) => Object.assign({}, p, { id: k, hostI: p.id })); }
// pairwise overlap (nonzero silhouettes of the ORIGINAL art), min distance, outside the strip
function layoutChecks(placed, L, H, opts = {}) {
  const cut = opts.cut || 50, fill = opts.fill || NZ, tolPt = opts.tol || 0.6;
  const regs = placed.map((p) => ({ b: bboxOf(p.rings), paths: fill === 'sil' ? silhouettePaths(p.rings) : regionPaths(p.rings, fill) }));
  let overlaps = 0, maxOv = 0, minD = Infinity, minPair = null, outside = 0; const ovList = [];
  for (let a = 0; a < placed.length; a++) {
    const ba = regs[a].b;
    if (ba[0] < -tolPt || ba[1] < -tolPt || ba[2] > L + tolPt || ba[3] > H + tolPt) outside++;
    for (let b = a + 1; b < placed.length; b++) {
      const bb = regs[b].b;
      if (bb[0] > ba[2] + cut || ba[0] > bb[2] + cut || bb[1] > ba[3] + cut || ba[1] > bb[3] + cut) continue;
      if (!(bb[0] > ba[2] || ba[0] > bb[2] || bb[1] > ba[3] || ba[1] > bb[3])) {
        const ov = pathsArea(clip(C.ClipType.ctIntersection, regs[a].paths, regs[b].paths, NZ));
        if (ov > (opts.ovTol || 0.5)) { overlaps++; ovList.push([placed[a].name, placed[b].name, ov]); }
        if (ov > maxOv) maxOv = ov;
      }
      if (opts.distance !== false) {
        const d = ringsDistance(placed[a].rings, placed[b].rings, cut);
        if (d < minD) { minD = d; minPair = [placed[a].name, placed[b].name]; }
      }
    }
  }
  return { overlaps, maxOv, ovList: ovList.slice(0, 8), minD, minPair, outside };
}

// ---- SVG -> document items (pt, y up). unit = pt per SVG user unit
function svgInfo(file) {
  const head = fs.readFileSync(file, 'utf8').slice(0, 4000).match(/<svg\b[^>]*>/)[0];
  const at = (k) => (head.match(new RegExp('\\s' + k + '="([^"]*)"')) || [])[1];
  const vb = (at('viewBox') || '').split(/[\s,]+/).map(Number);
  const len = (s) => { if (!s) return null; const m = s.match(/^([\d.eE+-]+)\s*(mm|cm|in|pt|px)?$/); if (!m) return null;
    const u = { mm: MM, cm: 10 * MM, in: 72, pt: 1, px: 1 }[m[2] || 'px']; return { v: +m[1], pt: +m[1] * u, unit: m[2] || '(none)' }; };
  const w = len(at('width')), h = len(at('height'));
  const unit = w && vb.length === 4 && vb[2] > 0 ? w.pt / vb[2] : 1; // Illustrator: px / unitless = 1 pt
  return { width: w, height: h, viewBox: vb.length === 4 ? vb : null, unit };
}
function svgItems(file, off = [3000, -2000], scale) {
  const info = svgInfo(file), u = scale || info.unit, { shapes, skipped } = SVG.readSvg(file);
  const items = shapes.map((s, i) => ({ i, name: s.id || (s.tag + i),
    rings: s.rings.map((r) => r.map(([x, y]) => [x * u + off[0], -y * u + off[1]])) }));
  return { items, skipped, info, unit: u };
}

// ---- small DXF reader (LINE, ARC, CIRCLE, ELLIPSE, LWPOLYLINE/POLYLINE+VERTEX with bulges, SPLINE, INSERT)
const INSUNITS_MM = { 0: null, 1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 8: 2.54e-5, 9: 0.0254, 10: 914.4 };
function readDxf(file) {
  const lines = fs.readFileSync(file, 'latin1').split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
  const header = {}, blocks = {}, entities = [];
  let sec = null, i = 0;
  const readEntity = () => { // pairs[i] = [0, TYPE]
    const e = { type: pairs[i][1], g: [] }; i++;
    while (i < pairs.length && pairs[i][0] !== 0) { e.g.push(pairs[i]); i++; }
    return e;
  };
  while (i < pairs.length) {
    const [c, v] = pairs[i];
    if (c === 0 && v === 'SECTION') { sec = pairs[i + 1][1]; i += 2; continue; }
    if (c === 0 && v === 'ENDSEC') { sec = null; i++; continue; }
    if (sec === 'HEADER' && c === 9) {
      const name = v, vals = {}; i++;
      while (i < pairs.length && pairs[i][0] !== 9 && pairs[i][0] !== 0) { vals[pairs[i][0]] = pairs[i][1]; i++; }
      header[name] = vals; continue;
    }
    if ((sec === 'ENTITIES' || sec === 'BLOCKS') && c === 0) {
      if (sec === 'BLOCKS' && v === 'BLOCK') {
        const b = readEntity(), name = (b.g.find((q) => q[0] === 2) || [])[1];
        const bx = +((b.g.find((q) => q[0] === 10) || [])[1] || 0), by = +((b.g.find((q) => q[0] === 20) || [])[1] || 0);
        const list = [];
        while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1] === 'ENDBLK')) {
          if (pairs[i][0] === 0) list.push(readEntity()); else i++;
        }
        blocks[name] = { base: [bx, by], ents: groupPolylines(list) };
        continue;
      }
      entities.push(readEntity()); continue;
    }
    i++;
  }
  return { header, blocks, entities: groupPolylines(entities) };
}
function groupPolylines(list) { // POLYLINE + VERTEX* + SEQEND -> one entity with .verts
  const out = [];
  for (let k = 0; k < list.length; k++) {
    const e = list[k];
    if (e.type === 'POLYLINE') { e.verts = []; while (k + 1 < list.length && list[k + 1].type === 'VERTEX') e.verts.push(list[++k]); out.push(e); }
    else if (e.type !== 'SEQEND' && e.type !== 'VERTEX') out.push(e);
  }
  return out;
}
const gv = (e, code, d) => { const q = e.g.find((p) => p[0] === code); return q ? +q[1] : d; };
const gs = (e, code) => { const q = e.g.find((p) => p[0] === code); return q ? q[1] : undefined; };
function arcPts(cx, cy, r, a0, a1, segDeg = 3) { // degrees, CCW from a0 to a1
  while (a1 <= a0) a1 += 360;
  const n = Math.max(2, Math.ceil((a1 - a0) / segDeg)), out = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * Math.PI / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
function bulgePts(vs, closed) { // vs: [[x,y,bulge]]
  const out = [], n = vs.length, m = closed ? n : n - 1;
  for (let k = 0; k < m; k++) {
    const [x1, y1, b] = vs[k], [x2, y2] = vs[(k + 1) % n];
    out.push([x1, y1]);
    if (b && Math.abs(b) > 1e-9) {
      const th = 4 * Math.atan(b), dx = x2 - x1, dy = y2 - y1, ch = Math.hypot(dx, dy);
      if (ch < 1e-12) continue;
      const r = ch / (2 * Math.sin(Math.abs(th) / 2)), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const hd = r * Math.cos(Math.abs(th) / 2), sgn = b > 0 ? 1 : -1;
      const cx = mx - sgn * hd * dy / ch, cy = my + sgn * hd * dx / ch;
      const a0 = Math.atan2(y1 - cy, x1 - cx), nSeg = Math.max(2, Math.ceil(Math.abs(th) / (3 * Math.PI / 180)));
      for (let s = 1; s < nSeg; s++) { const a = a0 + th * s / nSeg; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    }
  }
  if (!closed) out.push([vs[n - 1][0], vs[n - 1][1]]);
  return out;
}
function splinePts(e) {
  const deg = gv(e, 71, 3), flags = gv(e, 70, 0);
  const knots = e.g.filter((q) => q[0] === 40).map((q) => +q[1]);
  const xs = e.g.filter((q) => q[0] === 10).map((q) => +q[1]), ys = e.g.filter((q) => q[0] === 20).map((q) => +q[1]);
  const ws = e.g.filter((q) => q[0] === 41).map((q) => +q[1]);
  const ctrl = xs.map((x, k) => [x, ys[k], ws.length === xs.length ? ws[k] : 1]);
  if (ctrl.length < 2 || knots.length !== ctrl.length + deg + 1) {   // fit points or broken knots: polyline fallback
    const fx = e.g.filter((q) => q[0] === 11).map((q) => +q[1]), fy = e.g.filter((q) => q[0] === 21).map((q) => +q[1]);
    const pts = fx.length >= 2 ? fx.map((x, k) => [x, fy[k]]) : ctrl.map((p) => [p[0], p[1]]);
    return { pts, closed: !!(flags & 1) };
  }
  const deBoor = (t) => {
    let s = deg; while (s < ctrl.length - 1 && t >= knots[s + 1]) s++;
    const d = []; for (let j = 0; j <= deg; j++) { const p = ctrl[s - deg + j]; d.push([p[0] * p[2], p[1] * p[2], p[2]]); }
    for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
      const i0 = s - deg + j, den = knots[i0 + deg - r + 1] - knots[i0], al = den ? (t - knots[i0]) / den : 0;
      for (let q = 0; q < 3; q++) d[j][q] = (1 - al) * d[j - 1][q] + al * d[j][q];
    }
    return [d[deg][0] / d[deg][2], d[deg][1] / d[deg][2]];
  };
  const t0 = knots[deg], t1 = knots[ctrl.length], n = Math.max(16, ctrl.length * 8), pts = [];
  for (let k = 0; k <= n; k++) pts.push(deBoor(k === n ? t1 - 1e-12 * (t1 - t0) : t0 + (t1 - t0) * k / n));
  return { pts, closed: !!(flags & 1) };
}
// entities -> polylines {pts, closed, layer} in drawing units (INSERT expanded)
function dxfPolylines(dxf) {
  const out = [], counts = {};
  const emit = (pts, closed, layer, M) => out.push({ pts: pts.map(([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]), closed, layer });
  const walk = (ents, M, depth) => {
    for (const e of ents) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      const layer = gs(e, 8) || '0', flip = gv(e, 230, 1) < 0;   // extrusion (0,0,-1) = mirrored OCS
      const Mo = flip ? [-M[0], -M[1], M[2], M[3], M[4], M[5]] : M;
      if (e.type === 'LINE') emit([[gv(e, 10), gv(e, 20)], [gv(e, 11), gv(e, 21)]], false, layer, M);
      else if (e.type === 'ARC') emit(arcPts(gv(e, 10), gv(e, 20), gv(e, 40), gv(e, 50, 0), gv(e, 51, 360)), false, layer, Mo);
      else if (e.type === 'CIRCLE') { const p = arcPts(gv(e, 10), gv(e, 20), gv(e, 40), 0, 360); p.pop(); emit(p, true, layer, Mo); }
      else if (e.type === 'ELLIPSE') {
        const cx = gv(e, 10), cy = gv(e, 20), mx = gv(e, 11), my = gv(e, 21), ra = gv(e, 40, 1);
        let p0 = gv(e, 41, 0), p1 = gv(e, 42, 2 * Math.PI); if (p1 <= p0) p1 += 2 * Math.PI;
        const n = Math.max(8, Math.ceil((p1 - p0) / (Math.PI / 60))), pts = [];
        for (let k = 0; k <= n; k++) { const t = p0 + (p1 - p0) * k / n, c = Math.cos(t), s = Math.sin(t);
          pts.push([cx + mx * c - my * ra * s, cy + my * c + mx * ra * s]); }
        const full = Math.abs(p1 - p0 - 2 * Math.PI) < 1e-6; if (full) pts.pop(); emit(pts, full, layer, Mo);
      } else if (e.type === 'LWPOLYLINE') {
        const vs = []; for (const [c, v] of e.g) { if (c === 10) vs.push([+v, 0, 0]); else if (c === 20) vs[vs.length - 1][1] = +v; else if (c === 42 && vs.length) vs[vs.length - 1][2] = +v; }
        const closed = !!(gv(e, 70, 0) & 1); if (vs.length >= 2) emit(bulgePts(vs, closed), closed, layer, Mo);
      } else if (e.type === 'POLYLINE') {
        const vs = e.verts.map((v) => [gv(v, 10), gv(v, 20), gv(v, 42, 0)]), closed = !!(gv(e, 70, 0) & 1);
        if (vs.length >= 2) emit(bulgePts(vs, closed), closed, layer, Mo);
      } else if (e.type === 'SPLINE') { const s = splinePts(e); if (s.pts.length >= 2) emit(s.pts, s.closed, layer, M); }
      else if (e.type === 'INSERT' && depth < 8) {
        const b = dxf.blocks[gs(e, 2)]; if (!b) continue;
        const sx = gv(e, 41, 1), sy = gv(e, 42, 1), a = gv(e, 50, 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        const tx = gv(e, 10, 0), ty = gv(e, 20, 0);
        // local p -> R * S * (p - base) + ins
        const L = [c * sx, s * sx, -s * sy, c * sy, 0, 0];
        L[4] = tx - (L[0] * b.base[0] + L[2] * b.base[1]); L[5] = ty - (L[1] * b.base[0] + L[3] * b.base[1]);
        const Mn = [M[0] * L[0] + M[2] * L[1], M[1] * L[0] + M[3] * L[1], M[0] * L[2] + M[2] * L[3], M[1] * L[2] + M[3] * L[3],
          M[0] * L[4] + M[2] * L[5] + M[4], M[1] * L[4] + M[3] * L[5] + M[5]];
        walk(b.ents, Mn, depth + 1);
      }
    }
  };
  walk(dxf.entities, [1, 0, 0, 1, 0, 0], 0);
  return { polylines: out, counts };
}
// chain open polylines by their end points into closed loops. tol: absolute, or null = relative to the drawing
// (2.5e-4 x diagonal, >= 1e-3): exploded R12 files (deepnest-next #154) have end-point gaps up to ~0.01 units
function chainLoops(polylines, tol) {
  if (!tol) { const all = [].concat(...polylines.map((p) => p.pts)), b = all.length ? G.bbox(all) : [0, 0, 1, 1];
    tol = Math.max(1e-3, 2.5e-4 * Math.hypot(b[2] - b[0], b[3] - b[1])); }
  const loops = [], open = [];
  for (const p of polylines) {
    if (p.closed) { loops.push(p.pts); continue; }
    const a = p.pts[0], b = p.pts[p.pts.length - 1];
    if (p.pts.length > 2 && Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol) { loops.push(p.pts.slice(0, -1)); continue; }
    open.push(p.pts);
  }
  const key = (q) => Math.round(q[0] / tol) + ',' + Math.round(q[1] / tol);
  const near = (q) => { const kx = Math.round(q[0] / tol), ky = Math.round(q[1] / tol), r = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) (idx.get((kx + dx) + ',' + (ky + dy)) || []).forEach((v) => r.push(v)); return r; };
  const idx = new Map(), used = new Uint8Array(open.length);
  open.forEach((pts, k) => { for (const end of [0, 1]) { const q = end ? pts[pts.length - 1] : pts[0], kk = key(q);
    if (!idx.has(kk)) idx.set(kk, []); idx.get(kk).push([k, end]); } });
  let dangling = 0;
  for (let k = 0; k < open.length; k++) {
    if (used[k]) continue; used[k] = 1;
    let chain = open[k].slice(), closed = false;
    for (let guard = 0; guard < open.length + 1; guard++) {
      const tail = chain[chain.length - 1], head = chain[0];
      if (chain.length > 2 && Math.hypot(tail[0] - head[0], tail[1] - head[1]) <= tol) { closed = true; chain.pop(); break; }
      const cand = near(tail).find(([j, end]) => !used[j] && Math.hypot((end ? open[j][open[j].length - 1] : open[j][0])[0] - tail[0],
        (end ? open[j][open[j].length - 1] : open[j][0])[1] - tail[1]) <= tol);
      if (!cand) break;
      used[cand[0]] = 1;
      const seg = cand[1] ? open[cand[0]].slice().reverse() : open[cand[0]];
      chain = chain.concat(seg.slice(1));
    }
    if (closed && chain.length >= 3) loops.push(chain); else dangling++;
  }
  return { loops, dangling };
}
// loops -> pieces: outermost loops with their direct holes; islands inside holes are new pieces
function loopsToPieces(loops) {
  const L = loops.map((r) => ({ r, a: G.area(r), b: G.bbox(r) })).filter((l) => l.a > 0).sort((x, y) => y.a - x.a);
  const pip = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; } return c; };
  L.forEach((l, k) => {
    l.parent = -1;
    for (let j = k - 1; j >= 0; j--) {   // smallest container = last larger loop that contains it
      const o = L[j];
      if (o.b[0] <= l.b[0] && o.b[1] <= l.b[1] && o.b[2] >= l.b[2] && o.b[3] >= l.b[3] && pip(l.r[0], o.r)) { l.parent = j; break; }
    }
    l.depth = l.parent < 0 ? 0 : L[l.parent].depth + 1;
  });
  const pieces = [];
  L.forEach((l, k) => { if (l.depth % 2 === 0) { l.piece = pieces.length; pieces.push({ rings: [l.r] }); } });
  L.forEach((l) => { if (l.depth % 2 === 1) pieces[L[l.parent].piece].rings.push(l.r); });
  return pieces;
}

// =============================================================================== sections
const OUT = { checks: [], data: {} };
function check(id, name, pass, info) { OUT.checks.push({ id, name, status: pass === null ? 'INFO' : pass ? 'PASS' : 'FAIL', info }); }

// ---- 1. self-intersecting polygons ------------------------------------------------------------
async function s1(secs) {
  const file = path.join(CASES, 'github', 'jeroengar-jagua-rs-78-piece-overlap', 'J1617_mix_s24x1_s28x2.json');
  const inst = JSON.parse(fs.readFileSync(file, 'utf8'));
  const GAP = 3;                                   // min_item_separation of the issue (file units = mm)
  const bad = [];
  inst.items.forEach((it) => { const si = selfIntersections(it.shape.data); if (si.dups || si.crossings) bad.push({ id: it.id, n: it.shape.data.length, ...si }); });
  check('1a', 'jagua-rs #78: invalid input polygons detected', bad.some((b) => b.id === 21 && b.crossings > 0),
    bad.map((b) => `#${b.id}(${b.n}v: ${b.crossings} incroci, ${b.dups} doppi)`).join(' '));

  // synthetic: figure-8, bow-tie, loop with a self-overlapping lobe
  const fig8 = []; for (let k = 0; k < 64; k++) { const t = 2 * Math.PI * k / 64; fig8.push([60 * Math.sin(t), 30 * Math.sin(2 * t)]); }
  const bowtie = [[0, 0], [80, 50], [80, 0], [0, 50]];
  const fig8b = fig8.map(([x, y]) => (x > 0 ? [x * 1.6, y * 1.6] : [x, y]));   // unequal lobes: shoelace area != 0
  const lobe = [[0, 0], [100, 0], [100, 60], [20, 60], [20, -20], [50, -20], [50, 30], [0, 30]];
  const SYN = ['figure8', 'figure8-asym', 'bowtie', 'lobe'];
  const doc = (r, s = MM) => r.map(([x, y]) => [x * s + 2000, y * s - 1500]);
  const items = inst.items.map((it, k) => ({ i: k, name: 'J' + it.id, rings: [doc(it.shape.data)], demand: it.demand, orient: it.allowed_orientations }));
  [['figure8', fig8], ['figure8-asym', fig8b], ['bowtie', bowtie], ['lobe', lobe]].forEach(([n, r]) => items.push({ i: items.length, name: n, rings: [doc(r)], demand: 2, orient: [0, 180] }));
  const t0 = Date.now();
  const pieces = G.buildPieces(items, { gap: GAP * MM, flatness: 0.5 });
  const geomMs = Date.now() - t0;
  const errs = pieces.filter((p) => p.error), nonSimple = pieces.filter((p) => !p.error && !G.isSimple(p.polygon));
  // repaired proxy must cover the drawn region (nonzero AND even-odd) of every invalid input
  const cover = [];
  for (const p of pieces) {
    if (p.error) continue;
    const it = items[p.id], raw = it.rings[0], si = selfIntersections(raw);
    if (!si.crossings && !si.dups && !SYN.includes(it.name)) continue;
    const proxy = [toPath(p.polygon.map(([x, y]) => [x + p.ref[0], y + p.ref[1]]))];
    const nz = regionPaths([raw], NZ), eo = regionPaths([raw], EO);
    const missNZ = areaMinus(nz, proxy), missEO = areaMinus(eo, proxy);
    cover.push({ name: it.name, method: p.method, missNZ, missEO, areaNZ: pathsArea(nz) });
  }
  const worstMiss = Math.max(...cover.map((c) => Math.max(c.missNZ, c.missEO) / c.areaNZ));
  check('1b', 'self-intersecting input that gets a proxy: simple, covers nonzero+evenodd region',
    !nonSimple.length && worstMiss < 1e-3,
    `${cover.length} pezzi invalidi riparati (${cover.map((c) => c.name).join(',')}), metodi ${[...new Set(cover.map((c) => c.method))].join('/')}, ` +
    `area disegnata fuori dal proxy max ${(worstMiss * 100).toFixed(3)}%, proxy non semplici ${nonSimple.length}, geometria ${geomMs} ms`);
  // rejected pieces: a drawn shape with real area must never be dropped as "no closed contour"
  const lost = errs.map((p) => { const raw = items[p.id].rings[0];
    return { name: items[p.id].name, err: p.error, shoelace: G.area(raw), nz: pathsArea(regionPaths([raw], NZ)) }; });
  const silent = lost.filter((l) => l.nz >= 0.5);
  check('1c', 'self-intersecting input is never silently dropped (shoelace area cancels on a figure-8)', !silent.length,
    lost.length ? lost.map((l) => `${l.name}: errore "${l.err}", area shoelace ${r2(l.shoelace, 1)} pt² ma area disegnata ${r2(l.nz / (MM * MM), 0)} mm²`).join('; ') : 'nessun pezzo scartato');

  // nest in wasm (demand as in the file), overlap on the ORIGINAL rings (nonzero and even-odd)
  const good = usable(pieces);
  const inst2 = G.buildInstance(good, inst.strip_height * MM, null);
  inst2.items.forEach((it) => { const src = items[good[it.id].hostI]; it.demand = src.demand; it.allowed_orientations = src.orient; });
  const r = await nest(inst2, secs, GAP * MM);
  if (r.err || !r.best) { check('1d', 'wasm nest of #78 (+ synthetic)', false, 'errore motore: ' + r.err); }
  else {
    const want = inst2.items.reduce((s, it) => s + it.demand, 0);
    const placed = placeAll(r.best, good, (p) => items[p.hostI].rings);
    const lc = layoutChecks(placed, r.best.strip_width, inst2.strip_height, { cut: GAP * MM * 2, fill: NZ });
    const lcEO = layoutChecks(placed, r.best.strip_width, inst2.strip_height, { cut: 0, fill: EO, distance: false });
    check('1d', 'Corvo wasm nest of #78 (+ repaired synthetic): no overlaps, gap respected',
      placed.length === want && !lc.overlaps && !lcEO.overlaps && !lc.outside && lc.minD >= GAP * MM - 0.05,
      `piazzati ${placed.length}/${want}, sovrapposizioni ${lc.overlaps}/${lcEO.overlaps} (nonzero/pari-dispari, max ${r2(lc.maxOv)} pt²), ` +
      `distanza min ${r2(lc.minD / MM)} mm (gap ${GAP}), lunghezza ${r2(r.best.strip_width / MM, 0)} mm, fine ${r2(r.wall, 1)} s, prima soluzione ${r2(r.first, 1)} s`);
    OUT.data.s1wasm = { length: r.best.strip_width / MM, minD: lc.minD / MM, overlaps: lc.ovList };
  }

  // native sparrow.exe: (e) on the ORIGINAL json (the issue's setup), (f) on Corvo's repaired proxies
  const exe = path.join(ROOT, 'target', 'release', 'sparrow.exe');
  if (!fs.existsSync(exe)) { check('1e', 'native sparrow.exe on #78', null, 'sparrow.exe non trovato (cargo build --release)'); return; }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'corvo-robust-'));
  const native = (input, name) => {
    const t1 = Date.now();
    const run = cp.spawnSync(exe, ['-i', input, '-t', String(secs), '-s', '1', '--min-item-separation', String(GAP)],
      { cwd: work, timeout: (secs * 3 + 60) * 1000, encoding: 'utf8' });
    const wall = (Date.now() - t1) / 1000, outFile = path.join(work, 'output', 'final_' + name + '.json');
    const msg = String(run.stderr || '') + String(run.stdout || '');
    const errLine = (msg.match(/Error[^\n]*/) || [msg.trim().split('\n').pop()])[0];
    return fs.existsSync(outFile) ? { wall, sol: JSON.parse(fs.readFileSync(outFile, 'utf8')).solution } : { wall, err: `exit ${run.status}: ${errLine}` };
  };
  const place = (sol, shapeOf) => sol.layout.placed_items.map((pi, k) => {
    const a = pi.transformation.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), [tx, ty] = pi.transformation.translation;
    const sh = shapeOf(pi.item_id);
    return { k, id: pi.item_id, name: sh.name, rings: sh.rings.map((rg) => rg.map(([x, y]) => [c * x - s * y + tx, s * x + c * y + ty])) };
  });
  const n1 = native(file, inst.name);
  if (n1.err) check('1e', 'native sparrow.exe on the raw #78 JSON (reference)', null, `rifiutato in ${r2(n1.wall, 1)} s — ${n1.err} (jagua-rs attuale valida l'input: il bug dell'issue era la sovrapposizione silenziosa)`);
  else {
    const byId = new Map(inst.items.map((it) => [it.id, { name: 'J' + it.id, rings: [it.shape.data] }]));
    const lcN = layoutChecks(place(n1.sol, (id) => byId.get(id)), n1.sol.strip_width, inst.strip_height, { cut: GAP * 2, fill: NZ, ovTol: 0.1 });
    check('1e', 'native sparrow.exe on the raw #78 JSON (reference)', null,
      `${r2(n1.wall, 1)} s, lunghezza ${r2(n1.sol.strip_width, 0)} mm, sovrapposizioni ${lcN.overlaps} (max ${r2(lcN.maxOv)} mm²), distanza min ${r2(lcN.minD)} mm`);
  }
  // Corvo proxies in mm (relative to ref) -> native; overlaps measured on the RAW original polygons
  const good78 = good.filter((p) => !SYN.includes(items[p.hostI].name));
  const fixed = { name: 'corvo_repaired_78', strip_height: inst.strip_height, items: good78.map((p, k) => ({ id: k, demand: items[p.hostI].demand,
    allowed_orientations: items[p.hostI].orient, shape: { type: 'simple_polygon', data: p.polygon.map(([x, y]) => [x / MM, y / MM]) } })) };
  const fixedFile = path.join(work, 'corvo_repaired_78.json');
  fs.writeFileSync(fixedFile, JSON.stringify(fixed));
  const n2 = native(fixedFile, fixed.name);
  if (n2.err) check('1f', 'native sparrow.exe on Corvo-repaired #78', false, n2.err);
  else {
    const shapeOf = (k) => { const p = good78[k]; return { name: items[p.hostI].name,
      rings: items[p.hostI].rings.map((rg) => rg.map(([x, y]) => [(x - p.ref[0]) / MM, (y - p.ref[1]) / MM])) }; };
    const pl = place(n2.sol, shapeOf);
    const lcA = layoutChecks(pl, n2.sol.strip_width, inst.strip_height, { cut: GAP * 2, fill: NZ, ovTol: 0.1 });
    check('1f', 'native sparrow.exe on Corvo-repaired #78: no overlap of the raw pieces', !lcA.overlaps && lcA.minD >= GAP - 0.02,
      `${r2(n2.wall, 1)} s, piazzati ${pl.length}, lunghezza ${r2(n2.sol.strip_width, 0)} mm, sovrapposizioni ${lcA.overlaps} (max ${r2(lcA.maxOv, 3)} mm²), distanza min ${r2(lcA.minD, 3)} mm (sep ${GAP})`);
    OUT.data.s1native = { length: n2.sol.strip_width, overlaps: lcA.overlaps, minD: lcA.minD };
  }
  try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* temp */ }
}

// ---- 2. huge compound path (Deepnest #12) -----------------------------------------------------
// buildPiece runs in a grandchild with its own watchdog: a hang is a measured FAIL, not a dead section
const PROBE_LIMIT_S = 60;
function probe2(file) {             // --probe2 <file>: one compound path -> buildPiece, prints PROBE {...}
  const { items } = svgItems(file);
  const one = { i: 0, name: path.basename(file), rings: [].concat(...items.map((it) => it.rings)) };
  const pts = one.rings.reduce((s, r) => s + r.length, 0);
  global.gc && global.gc();
  const m0 = process.memoryUsage(), t0 = Date.now();
  const p = G.buildPiece(one, { gap: 2 * MM, flatness: 0.5 });
  const secs = (Date.now() - t0) / 1000, m1 = process.memoryUsage(), bb = bboxOf(one.rings);
  console.log('PROBE ' + JSON.stringify({ rings: one.rings.length, pts, secs, heapMB: (m1.heapUsed - m0.heapUsed) / 1048576,
    rssMB: m1.rss / 1048576, method: p.method, parts: p.parts, vertices: p.vertices, error: p.error || null,
    simple: !p.error && G.isSimple(p.polygon), w: (bb[2] - bb[0]) / MM, h: (bb[3] - bb[1]) / MM }));
}
// the fix proposed in docs/casi-reali-motore.md, timed here (not applied to geometry.js): pre-DP every ring at
// flatness/2 when the piece is dense, and skip the morphological closing when there are many parts (hull directly)
function proposedDense(rings, flat) {
  const t0 = Date.now(), I = G._internals;
  const dp = rings.map((r) => G.cleanRing(G.douglasPeucker(G.cleanRing(r), flat / 2))).filter((r) => r.length >= 3);
  const area = G.filledArea(dp, null), parts = I.silhouette(dp);
  const hull = G.convexHull([].concat(...dp));
  const poly = parts.length > 16 ? hull : null;
  return { secs: (Date.now() - t0) / 1000, pts: dp.reduce((s, r) => s + r.length, 0), parts: parts.length, hullV: hull.length, area, usedHull: !!poly };
}
async function s2() {
  const dir = path.join(CASES, 'github', 'jack000-deepnest-12-svg-large-group');
  for (const [tag, f] of [['2a', 'all union (cant import).svg'], ['2b', 'test.svg']]) {
    const t0 = Date.now();
    const run = cp.spawnSync(process.execPath, ['--expose-gc', __filename, '--probe2', path.join(dir, f)],
      { encoding: 'utf8', timeout: PROBE_LIMIT_S * 1000, maxBuffer: 16 << 20 });
    const wall = (Date.now() - t0) / 1000, line = (run.stdout || '').split(/\r?\n/).find((l) => l.startsWith('PROBE '));
    if (!line) {
      check(tag, `Deepnest #12 "${f}": one compound path, geometry does not hang`, false,
        `buildPiece NON termina: ucciso dopo ${r2(wall, 0)} s (limite ${PROBE_LIMIT_S} s) ${run.error ? run.error.code : 'exit ' + run.status}; il pannello resterebbe bloccato`);
      if (tag === '2a') OUT.data.s2 = { hang: true, wall };
      continue;
    }
    const q = JSON.parse(line.slice(6));
    check(tag, `Deepnest #12 "${f}": one compound path, geometry does not hang`, !q.error && q.simple && q.secs < 10,
      `${q.rings} sottotracciati, ${q.pts} punti -> ${r2(q.secs, 2)} s, heap +${r2(q.heapMB, 0)} MB, rss ${r2(q.rssMB, 0)} MB, ` +
      `metodo ${q.method}, ${q.parts} parti -> 1 pezzo ${q.vertices} vertici (${r2(q.w, 0)}×${r2(q.h, 0)} mm)`);
    if (tag === '2a') OUT.data.s2 = q;
  }
  const big = svgItems(path.join(dir, 'all union (cant import).svg'));
  const fx = proposedDense([].concat(...big.items.map((it) => it.rings)), 0.5);
  check('2d', 'proposed fix timed (pre-DP at flatness/2 + hull when > 16 parts)', fx.secs < 10,
    `${fx.pts} punti dopo DP, ${fx.parts} parti -> inviluppo ${fx.hullV} vertici in ${r2(fx.secs, 2)} s`);
  const { items } = svgItems(path.join(dir, 'all union then break (ok).svg'));
  const t0 = Date.now(), ps = G.buildPieces(items, { gap: 2 * MM, flatness: 0.5 }), secs = (Date.now() - t0) / 1000;
  check('2c', 'Deepnest #12 "then break": same drawing as separate objects', ps.every((p) => !p.error) && secs < 10,
    `${ps.length} pezzi in ${r2(secs, 2)} s, vertici max ${Math.max(...ps.map((p) => p.vertices))}`);
}

// ---- 3. gap correctness + contour fidelity (SVGnest #27) --------------------------------------
async function s3(secs) {
  const f = path.join(CASES, 'github', 'jack000-svgnest-27-deformed-shapes', 'zalesie-5.svg');
  const info = svgInfo(f);
  const { items, unit } = svgItems(f);
  const GAP_MM = 10, FLAT = 0.5, gap = GAP_MM * MM;
  const all = bboxOf([].concat(...items.map((i) => i.rings)));
  // SVGnest spacing is in SVG user units: 10 units = 10 px. Illustrator reads px as pt (72/in), Inkscape 0.48 wrote 90/in.
  check('3a', 'SVGnest #27 unit diagnosis', null,
    `width="${info.width.v}" senza unità, niente viewBox: 10 unità = ${r2(10 * 25.4 / 72)} mm a 72 px/in (Illustrator), ` +
    `${r2(10 * 25.4 / 90)} mm a 90 px/in (Inkscape 0.48): il "3,5 mm" dell'utente = 10 px a 72 dpi. ` +
    `Scritta in Illustrator ${r2((all[2] - all[0]) / MM, 0)}×${r2((all[3] - all[1]) / MM, 0)} mm (in Inkscape ${r2((all[2] - all[0]) / MM * 72 / 90, 0)}×${r2((all[3] - all[1]) / MM * 72 / 90, 0)})`);
  const pieces = usable(G.buildPieces(items, { gap, flatness: FLAT }));
  const inst = G.buildInstance(pieces, 400 * MM, G.rotationsFor('90'));
  const r = await nest(inst, secs, gap);
  if (r.err || !r.best) { check('3b', 'gap 10 mm respected', false, 'errore motore: ' + r.err); return; }
  const placed = placeAll(r.best, pieces, (p) => items[p.hostI].rings);
  const lc = layoutChecks(placed, r.best.strip_width, inst.strip_height, { cut: gap * 3, fill: 'sil' });
  // nearest neighbour of every piece (how much more than the gap the proxy wastes)
  const nn = placed.map((a) => Math.min(...placed.filter((b) => b !== a).map((b) => ringsDistance(a.rings, b.rings, gap * 4))));
  const nnF = nn.filter(isFinite), mean = nnF.reduce((s, v) => s + v, 0) / nnF.length;
  check('3b', `gap ${GAP_MM} mm respected on the real letters (min distance between all placed pieces)`,
    placed.length === pieces.length && !lc.overlaps && !lc.outside && lc.minD >= gap - 0.05,
    `piazzati ${placed.length}/${pieces.length}, distanza min ${r2(lc.minD / MM, 3)} mm (${lc.minPair && lc.minPair.join('–')}), ` +
    `media vicino più prossimo ${r2(mean / MM)} mm, sovrapposizioni ${lc.overlaps}, fuori ${lc.outside}, lunghezza ${r2(r.best.strip_width / MM, 0)} mm`);
  // contour fidelity: (a) what Illustrator receives is a rigid transform of the original art -> undo it and compare
  let worstRigid = 0, worstProxy = 0, worstInside = 0, rots = new Set();
  for (const p of placed) {
    const mv = p.mv, a = -mv.a * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    rots.add(((mv.a % 360) + 360) % 360);
    const back = p.rings.map((rg) => rg.map(([x, y]) => [c * (x - mv.tx) - s * (y - mv.ty), s * (x - mv.tx) + c * (y - mv.ty)]));
    worstRigid = Math.max(worstRigid, hausdorff(back, items[pieces[p.id].hostI].rings, 5));
  }
  // (b) the collision proxy vs the letter outline: proxy must contain the outline, deviation vs flatness
  for (const pc of pieces) {
    const sil = silhouettePaths(items[pc.hostI].rings).map(fromPath), proxy = pc.polygon.map(([x, y]) => [x + pc.ref[0], y + pc.ref[1]]);
    worstProxy = Math.max(worstProxy, hausdorff([proxy], sil, 1));
    worstInside = Math.max(worstInside, areaMinus(sil.map(toPath), [toPath(proxy)]));
  }
  check('3c', 'letters unchanged: output outline = rigid move of the input (Hausdorff)', worstRigid <= 1e-3,
    `Hausdorff max ${worstRigid.toExponential(2)} pt, rotazioni usate ${[...rots].join('/')}° (Corvo sposta l'originale con transform(), non lo ridisegna)`);
  check('3d', `collision proxy vs letter outline: Hausdorff vs flatness (${FLAT} pt) — spreco, non errore`, worstInside < 0.5 ? null : false,
    `Hausdorff proxy-lettera max ${r2(worstProxy, 3)} pt = ${r2(worstProxy / MM, 3)} mm, area lettera fuori dal proxy ${r2(worstInside, 3)} pt² ` +
    `(il proxy è gonfiato: spreco di spazio, non errore di gap)`);
  OUT.data.s3 = { minD: lc.minD / MM, mean: mean / MM, proxyH: worstProxy };
}

// ---- 4. fine features (snowflake earring) -------------------------------------------------------
async function s4(secs) {
  const f = path.join(CASES, 'forum', 'lightburn-earring-thin-snowflake', 'Teardrop Snowflake 2.svg');
  const base = svgItems(f);
  const bb0 = bboxOf(base.items[0].rings), h0 = (bb0[3] - bb0[1]) / MM;
  const rows = [];
  for (const heightMM of [h0, 30, 20]) {
    const k = heightMM / h0, cx = bb0[0], cy = bb0[1];
    const rings = [].concat(...base.items.map((it) => it.rings)).map((r) => r.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]));
    const item = { i: 0, name: 'snowflake', rings };
    const sil = silhouettePaths(rings), silA = pathsArea(sil), fillA = pathsArea(regionPaths(rings, EO));
    // min feature width of the cut part (filled region): smallest 2r whose opening removes > 0.5 % of the area
    const filled = regionPaths(rings, EO);
    let wmin = null;
    for (let rr = 0.05; rr <= 2.0; rr += 0.05) {
      const opened = offsetPaths(offsetPaths(filled, -rr * MM), rr * MM);
      if ((fillA - pathsArea(opened)) / fillA > 0.005) { wmin = 2 * rr; break; }
    }
    const res = {};
    for (const flat of [0.5, 0.25]) {
      const p = G.buildPiece(item, { gap: 1 * MM, flatness: flat });
      const proxy = [toPath(p.polygon.map(([x, y]) => [x + p.ref[0], y + p.ref[1]]))];
      // naive DP on the outer contour WITHOUT inflation (what an unsafe simplifier would do)
      const outer = fromPath(sil.reduce((a, b) => (Math.abs(C.Clipper.Area(b)) > Math.abs(C.Clipper.Area(a)) ? b : a)));
      const naive = [toPath(G.douglasPeucker(outer, flat))];
      res[flat] = { lossProxy: areaMinus(sil, proxy) / silA, extra: (pathsArea(proxy) - silA) / silA, v: p.vertices, method: p.method,
        lossNaive: areaMinus(sil, naive) / silA, H: hausdorff([fromPath(proxy[0])], [outer], 0.5) };
    }
    rows.push({ heightMM, wmin, silA, fillA, res });
  }
  const worstLoss = Math.max(...rows.map((r) => Math.max(r.res[0.5].lossProxy, r.res[0.25].lossProxy)));
  check('4a', 'snowflake: simplification never erases features (proxy covers the silhouette)', worstLoss < 1e-3,
    rows.map((r) => `${r2(r.heightMM, 0)} mm: tratto min ${r.wmin ? r2(r.wmin) + ' mm' : '>4 mm'}, perdita proxy ${r2(r.res[0.5].lossProxy * 100, 3)}% ` +
      `(+${r2(r.res[0.5].extra * 100, 1)}% area, ${r.res[0.5].v} v, H ${r2(r.res[0.5].H / MM, 2)} mm), DP ingenuo perderebbe ${r2(r.res[0.5].lossNaive * 100, 2)}%`).join(' | '));
  OUT.data.s4 = rows;

  // nest 12 earrings at 30 mm, gap 0.5 mm: thin spikes must not interpenetrate (engine's own simplification)
  const k = 30 / h0, cx = bb0[0], cy = bb0[1];
  const ring30 = [].concat(...base.items.map((it) => it.rings)).map((r) => r.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]));
  const items = []; for (let n = 0; n < 12; n++) items.push({ i: n, name: 'orecchino' + n, rings: ring30 });
  const gap = 0.5 * MM, pieces = usable(G.buildPieces(items, { gap, flatness: 0.5 }));
  const inst = G.buildInstance(pieces, 100 * MM, null);
  const r = await nest(inst, secs, gap);
  if (r.err || !r.best) { check('4b', '12 earrings, gap 0.5 mm', false, 'errore motore: ' + r.err); return; }
  const placed = placeAll(r.best, pieces, (p) => items[p.hostI].rings);
  const lc = layoutChecks(placed, r.best.strip_width, inst.strip_height, { cut: 5 * MM, fill: EO });
  check('4b', '12 earrings 30 mm, free rotation, gap 0.5 mm: no interpenetration of thin spikes',
    placed.length === 12 && !lc.overlaps && lc.minD >= gap - 0.05,
    `piazzati ${placed.length}/12, distanza min ${r2(lc.minD / MM, 3)} mm, sovrapposizioni ${lc.overlaps}, lunghezza ${r2(r.best.strip_width / MM, 1)} mm su 100 mm`);
}

// ---- 5. termination (deepnest-next #154) --------------------------------------------------------
async function s5(secs) {
  const f = path.join(CASES, 'github', 'deepnest-next-154-dxf-wont-nest', 'test-nesting-issue.dxf');
  const t0 = Date.now(), dxf = readDxf(f), { polylines, counts } = dxfPolylines(dxf);
  const { loops, dangling } = chainLoops(polylines, null);
  const parts = loopsToPieces(loops), parseMs = Date.now() - t0;
  const u = INSUNITS_MM[+((dxf.header.$INSUNITS || {})[70])] || 1;   // none declared -> mm (see section 6)
  const items = parts.map((p, i) => ({ i, name: 'P' + i, rings: p.rings.map((r) => r.map(([x, y]) => [x * u * MM, y * u * MM])) }));
  const dims = items.map((it) => { const b = bboxOf(it.rings); return [(b[2] - b[0]) / MM, (b[3] - b[1]) / MM]; });
  check('5a', 'deepnest-next #154 DXF -> pieces', items.length > 0 && dangling === 0,
    `${JSON.stringify(counts)}, ${polylines.length} polilinee aperte/chiuse -> ${loops.length} anelli, ${dangling} catene aperte -> ${items.length} pezzi ` +
    `[${dims.map((d) => r2(d[0], 1) + '×' + r2(d[1], 1)).join(', ')}] mm, ${parseMs} ms`);
  const gap = 2 * MM, roll = Math.max(300, Math.ceil(Math.max(...dims.map((d) => Math.min(d[0], d[1]))) * 1.3));
  const pieces = usable(G.buildPieces(items, { gap, flatness: 0.5 }));
  const inst = G.buildInstance(pieces, roll * MM, G.rotationsFor('90'));
  const r = await nest(inst, secs, gap);
  const ok = !r.err && r.best && r.best.placements.length === pieces.length;
  let lc = { overlaps: -1, minD: NaN };
  if (ok) lc = layoutChecks(placeAll(r.best, pieces, (p) => items[p.hostI].rings), r.best.strip_width, inst.strip_height, { cut: gap * 2, fill: 'sil' });
  check('5b', `mixed big+small nest terminates within the budget (${secs} s)`, ok && r.wall <= secs * 1.5 + 3 && !lc.overlaps,
    `rotolo ${roll} mm${r.guarded ? ' (guard: striscia ' + r2(r.stripHeight / MM, 0) + ' mm)' : ''}, fine in ${r2(r.wall, 1)} s, prima soluzione ${r2(r.first, 2)} s, ` +
    `${r.reports} report, piazzati ${ok ? r.best.placements.length : 0}/${pieces.length}, sovrapposizioni ${lc.overlaps}, ` +
    `distanza min ${r2(lc.minD / MM)} mm` + (r.err ? ', errore ' + r.err : ''));
  // stress: the same big piece + 60 small ones (the original reporter: 5 big + 54 small)
  const big = items.map((it, k) => ({ it, a: dims[k][0] * dims[k][1] })).sort((a, b) => b.a - a.a);
  const many = [];
  big.slice(0, Math.min(5, big.length)).forEach((b) => many.push({ ...b.it, i: many.length }));
  for (let n = 0; many.length < 65; n++) { const s = big[big.length - 1 - (n % Math.max(1, big.length - 1))].it; many.push({ ...s, i: many.length, name: s.name + '_' + n }); }
  const pcs2 = usable(G.buildPieces(many, { gap, flatness: 0.5 }));
  const inst2 = G.buildInstance(pcs2, roll * MM, G.rotationsFor('90'));
  const r2_ = await nest(inst2, secs, gap);
  const ok2 = !r2_.err && r2_.best && r2_.best.placements.length === pcs2.length;
  check('5c', `stress ${many.length} pieces (5 big + many small) terminates within the budget`, ok2 && r2_.wall <= secs * 1.5 + 3,
    `fine in ${r2(r2_.wall, 1)} s, prima soluzione ${r2(r2_.first, 2)} s, piazzati ${ok2 ? r2_.best.placements.length : 0}/${pcs2.length}` + (r2_.err ? ', errore ' + r2_.err : ''));
  OUT.data.s5 = { wall: r.wall, first: r.first, wall2: r2_.wall };
}

// ---- 6. DXF scale / units -------------------------------------------------------------------------
async function s6() {
  const G_ = path.join(CASES, 'github');
  const files = [
    ['6a', 'Deepnest #149', path.join(G_, 'jack000-deepnest-149-dxf-wrong-dimensions', 'Ivar48x30Shelves v17 - 3UDrawerFront.dxf')],
    ['6b', 'deepnest-next #149', path.join(G_, 'deepnest-next-149-dxf-scale-wrong', '025-copy-change-ext-to.dxf')],
    ['6c', 'Deepnest #10 (R12)', path.join(G_, 'jack000-deepnest-10-dxf-polylines-missing', 'untitled.dxf')],
    ['6d', 'Deepnest #10 (2010)', path.join(G_, 'jack000-deepnest-10-dxf-polylines-missing', 'untitled2.dxf')],
    ['6e', 'deepnest-next #154', path.join(G_, 'deepnest-next-154-dxf-wont-nest', 'test-nesting-issue.dxf')],
  ];
  OUT.data.s6 = [];
  for (const [id, label, f] of files) {
    const dxf = readDxf(f), { polylines, counts } = dxfPolylines(dxf);
    const ins = dxf.header.$INSUNITS ? +dxf.header.$INSUNITS[70] : null;
    const meas = dxf.header.$MEASUREMENT ? +dxf.header.$MEASUREMENT[70] : null;
    const ver = dxf.header.$ACADVER ? dxf.header.$ACADVER[1] : '?';
    const layers = [...new Set(polylines.map((p) => p.layer))];
    const { loops, dangling } = chainLoops(polylines, null);
    const parts = loopsToPieces(loops);
    const allPts = [].concat(...polylines.map((p) => p.pts));
    const b = allPts.length ? G.bbox(allPts) : [0, 0, 0, 0], W = b[2] - b[0], H = b[3] - b[1];
    const u = ins !== null ? INSUNITS_MM[ins] : null;
    const dims = parts.map((p) => { const q = G.bbox(p.rings[0]); return [q[2] - q[0], q[3] - q[1]]; }).sort((x, y) => y[0] * y[1] - x[0] * x[1]);
    const mm = (v) => u ? r2(v * u, 1) : r2(v, 1) + '?';
    let note;
    if (u === null || u === undefined) note = `$INSUNITS ${ins === null ? 'assente' : ins + ' (senza unità)'}: ${meas === 1 ? 'MEASUREMENT=1 -> mm' : meas === 0 ? 'MEASUREMENT=0 -> pollici?' : 'nessun indizio'}; se mm ${r2(W, 1)}×${r2(H, 1)}, se pollici ${r2(W * 25.4, 1)}×${r2(H * 25.4, 1)} mm`;
    else note = `$INSUNITS ${ins} = ${u} mm/unità` + (meas === 0 && u === 1 ? ' (ma $MEASUREMENT=0 imperiale: INSUNITS vince)' : '');
    check(id, `${label}: units + bounds in mm for the Illustrator tester`, null,
      `${path.basename(f)} ${ver}; ${JSON.stringify(counts)}; livelli ${layers.join(',')}; ${note}; ingombro disegno ${mm(W)}×${mm(H)} mm; ` +
      `${loops.length} anelli chiusi (${dangling} aperti) -> ${parts.length} pezzi` + (dims.length ? `, pezzo più grande ${mm(dims[0][0])}×${mm(dims[0][1])} mm` : ''));
    OUT.data.s6.push({ id, file: path.basename(f), ins, meas, W, H, u, parts: parts.length, dims: dims.slice(0, 5), dangling, counts });
  }
  // sanity of the reader: the ARC/LINE drawer front must be ONE closed piece with its cut-outs
  const d149 = OUT.data.s6[0];
  check('6f', 'DXF reader: Deepnest #149 LINE+ARC chain into closed pieces', d149.parts >= 1 && d149.dangling === 0,
    `${d149.parts} pezzi, ${d149.dangling} catene aperte`);
}

// ---- 7. 200+ pieces, mixed huge + tiny --------------------------------------------------------
async function s7(secs) {
  const f = path.join(CASES, 'github', 'jack000-deepnest-12-svg-large-group', 'all union then break (ok).svg');
  const { items } = svgItems(f);
  const gap = 1 * MM;
  let t0 = Date.now();
  const pieces = usable(G.buildPieces(items, { gap, flatness: 0.5 }));
  const geo = (Date.now() - t0) / 1000;
  const inst = G.buildInstance(pieces, 600 * MM, G.rotationsFor('90'));
  global.gc && global.gc();
  const r = await nest(inst, secs, gap);
  const ok = !r.err && r.best && r.best.placements.length === pieces.length;
  let lc = { overlaps: -1 };
  if (ok) lc = layoutChecks(placeAll(r.best, pieces, (p) => items[p.hostI].rings), r.best.strip_width, inst.strip_height, { cut: gap * 2, fill: 'sil', distance: false });
  check('7a', `${pieces.length} pieces (Deepnest #12 split): first solution, no overlaps`, ok && !lc.overlaps && r.first !== null && r.first < secs,
    `geometria ${r2(geo, 2)} s, prima soluzione ${r2(r.first, 2)} s, fine ${r2(r.wall, 1)} s, ${r.reports} report, piazzati ${ok ? r.best.placements.length : 0}/${pieces.length}, ` +
    `sovrapposizioni ${lc.overlaps}, memoria wasm ${r2(r.wasmMB, 0)} MB, rss ${r2(process.memoryUsage().rss / 1048576, 0)} MB` + (r.err ? ', errore ' + r.err : ''));
  // mixed: one 1200x500 mm panel with a notch + 200 small shapes + 40 tiny 3 mm dots on a 600 mm roll
  const mm = (r) => r.map(([x, y]) => [x * MM + 5000, y * MM - 3000]);
  const mixed = [{ i: 0, name: 'pannello', rings: [mm([[0, 0], [1200, 0], [1200, 500], [700, 500], [700, 250], [500, 250], [500, 500], [0, 500]])] }];
  items.slice(0, 200).forEach((it) => mixed.push({ i: mixed.length, name: it.name, rings: it.rings }));
  for (let n = 0; n < 40; n++) { const c = []; for (let k = 0; k < 16; k++) c.push([1.5 * Math.cos(k * Math.PI / 8), 1.5 * Math.sin(k * Math.PI / 8)]); mixed.push({ i: mixed.length, name: 'dot' + n, rings: [mm(c)] }); }
  t0 = Date.now();
  const pm = usable(G.buildPieces(mixed, { gap, flatness: 0.5 }));
  const geo2 = (Date.now() - t0) / 1000;
  const im = G.buildInstance(pm, 600 * MM, G.rotationsFor('90'));
  const rm = await nest(im, secs, gap);
  const okm = !rm.err && rm.best && rm.best.placements.length === im.items.length;
  let lcm = { overlaps: -1 };
  if (okm) lcm = layoutChecks(placeAll(rm.best, pm, (p) => mixed[p.hostI].rings), rm.best.strip_width, im.strip_height, { cut: gap * 2, fill: 'sil', distance: false });
  check('7b', `mixed: 1 panel 1200×500 mm + 200 shapes + 40 dots Ø3 mm (${im.items.length} pieces)`, okm && !lcm.overlaps && rm.first !== null && rm.first < secs,
    `geometria ${r2(geo2, 2)} s, prima soluzione ${r2(rm.first, 2)} s, fine ${r2(rm.wall, 1)} s, piazzati ${okm ? rm.best.placements.length : 0}/${im.items.length}, ` +
    `sovrapposizioni ${lcm.overlaps}, lunghezza ${okm ? r2(rm.best.strip_width / MM, 0) : '-'} mm, memoria wasm ${r2(rm.wasmMB, 0)} MB` + (rm.err ? ', errore ' + rm.err : ''));
  // proposed rule (docs/casi-reali-motore.md): the engine's time to the first layout grows with the TOTAL vertex count
  // (~1.5 ms per vertex before the first report): cap vertices per piece at clamp(3000 / N, 32, 200)
  const cap = Math.max(32, Math.min(200, Math.round(3000 / items.length)));
  const pc = usable(G.buildPieces(items, { gap, flatness: 0.5, maxVertices: cap }));
  const ic = G.buildInstance(pc, 600 * MM, G.rotationsFor('90'));
  const rc = await nest(ic, secs, gap);
  const okc = !rc.err && rc.best && rc.best.placements.length === pc.length;
  let lcc = { overlaps: -1 };
  if (okc) lcc = layoutChecks(placeAll(rc.best, pc, (p) => items[p.hostI].rings), rc.best.strip_width, ic.strip_height, { cut: gap * 2, fill: 'sil', distance: false });
  check('7c', `proposed vertex budget (maxVertices = ${cap} for ${pc.length} pieces): first solution within the budget`, okc && !lcc.overlaps && rc.first < secs,
    `vertici totali ${pc.reduce((a, p) => a + p.vertices, 0)} (prima ${pieces.reduce((a, p) => a + p.vertices, 0)}), prima soluzione ${r2(rc.first, 2)} s, fine ${r2(rc.wall, 1)} s, ` +
    `lunghezza ${okc ? r2(rc.best.strip_width / MM, 0) : '-'} mm (con 200 v: ${ok ? r2(r.best.strip_width / MM, 0) : '-'} mm), sovrapposizioni ${lcc.overlaps}`);
  OUT.data.s7 = { first: r.first, wasmMB: r.wasmMB, firstMixed: rm.first, wasmMixed: rm.wasmMB, firstCap: rc.first, cap };
}

// =============================================================================== driver
const SECTIONS = { 1: s1, 2: s2, 3: s3, 4: s4, 5: s5, 6: s6, 7: s7 };
if (process.argv[2] === '--probe2') {
  probe2(process.argv[3]);
} else if (process.argv[2] === '--section') {
  const n = process.argv[3], secs = +process.argv[4];
  SECTIONS[n](secs).then(() => { console.log('RESULT ' + JSON.stringify(OUT)); })
    .catch((e) => { OUT.checks.push({ id: n, name: 'section ' + n + ' crashed', status: 'FAIL', info: String(e && e.stack || e) }); console.log('RESULT ' + JSON.stringify(OUT)); });
} else {
  const secs = +(process.argv[2] || 10);
  const which = (process.argv[3] || '1,2,3,4,5,6,7').split(',');
  const all = [], data = {};
  for (const n of which) {
    const t0 = Date.now();
    const run = cp.spawnSync(process.execPath, ['--expose-gc', __filename, '--section', n, String(secs)],
      { encoding: 'utf8', timeout: (secs * 6 + 180) * 1000, maxBuffer: 64 << 20 });
    const wall = (Date.now() - t0) / 1000;
    const line = (run.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
    console.log(`\n== sezione ${n} (${r2(wall, 1)} s)`);
    if (!line) {
      const why = run.error ? String(run.error.code || run.error) : 'exit ' + run.status;
      all.push({ id: n, name: 'section ' + n, status: 'FAIL', info: `nessun risultato (${why}${run.signal ? ', ' + run.signal : ''}): ` + String(run.stderr || '').slice(-600) });
      console.log('FAIL  section ' + n + ': ' + all[all.length - 1].info);
      continue;
    }
    const res = JSON.parse(line.slice(7));
    Object.assign(data, res.data);
    for (const c of res.checks) { all.push(c); console.log(`${c.status.padEnd(5)} [${c.id}] ${c.name}\n        ${c.info}`); }
  }
  const nf = all.filter((c) => c.status === 'FAIL').length, np = all.filter((c) => c.status === 'PASS').length;
  console.log(`\n${np} PASS, ${nf} FAIL, ${all.length - np - nf} INFO`);
  if (process.env.ROBUST_JSON) fs.writeFileSync(process.env.ROBUST_JSON, JSON.stringify({ checks: all, data }, null, 1));
  if (nf) process.exitCode = 1;
}
