// node plugin/tools/test_quantity.js [seconds=6] [realDir]
// Module 3 "quantita' per design + coppie specchiate + copie vicine": quantity.js + Sparrow (wasm) without Illustrator.
// Real files (read-only): bench/real/quantity (Avery 22806 2" squares, Wikimania2021 / Wikipedia20 sticker sheets,
// freesvg product labels, left/right car headlights, hot-rod flames), bench/real/holes (Bebas Neue O for module 2).
// Pipeline = the one of main.js: cluster.planPieces -> geometry.buildPieces -> quantity.expand -> holes.planHoles ->
// holes.nestPieces -> quantity.buildNest -> Sparrow -> quantity.expandPlacements -> holes.movesFor.
// Checks: every copy placed exactly once on its host index (originals 0..n-1, ghosts base+k), no overlaps
// (Sparrow polygons grown by ~gap/2), inside the roll, mirrored copies = exact reflection (det < 0, never a
// rotation), mirrored headlight vs the real left file, length vs naive step-and-repeat, keep-close ON vs OFF,
// demand vs one item per copy, 200+ copies timing.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const CLIENT = path.join(__dirname, '..', 'client');
const G = require(path.join(CLIENT, 'js', 'geometry.js'));
const HO = require(path.join(CLIENT, 'js', 'holes.js'));
const Q = require(path.join(CLIENT, 'js', 'quantity.js'));
const CLU = require(path.join(CLIENT, 'js', 'cluster.js'));
const REP = require(path.join(CLIENT, 'js', 'report.js'));
const CL = require(path.join(CLIENT, 'lib', 'clipper.js'));

const SECS = +(process.argv[2] || 6);
const REAL = process.argv[3] || path.join(__dirname, '..', '..', '..', 'Plugin', 'bench', 'real', 'quantity');
const HOLES = path.join(REAL, '..', 'holes');
const MM = 72 / 25.4, GAP = 2 * MM, S = 1000;
const SEED = +(process.env.SEED || 7);
let failures = 0, checks = 0;
function check(ok, msg) { checks++; if (!ok) { console.log('  FAIL: ' + msg); failures++; process.exitCode = 1; } }

// ------------------------------------------------------------------ SVG -> top-level objects (like corvoExport)
function mul(m, n) {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
function parseTransform(s) {
  let m = [1, 0, 0, 1, 0, 0];
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g; let r;
  while ((r = re.exec(s))) {
    const v = r[2].split(/[\s,]+/).filter(Boolean).map(Number); let t;
    if (r[1] === 'matrix') t = v;
    else if (r[1] === 'translate') t = [1, 0, 0, 1, v[0], v[1] || 0];
    else if (r[1] === 'scale') t = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0];
    else { const a = v[0] * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      t = [c, sn, -sn, c, 0, 0];
      if (v.length > 2) t = mul(mul([1, 0, 0, 1, v[1], v[2]], t), [1, 0, 0, 1, -v[1], -v[2]]); }
    m = mul(m, t);
  }
  return m;
}
function pathRings(d) {
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, qx = 0, qy = 0, prev = '';
  const rings = []; let cur = null;
  const num = () => +toks[i++];
  const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  const flag = () => { const t = toks[i]; if (t.length > 1 && (t[0] === '0' || t[0] === '1')) { toks[i] = t.slice(1); return +t[0]; } i++; return +t; };
  const push = (px, py) => { if (!cur) { cur = [[x, y]]; rings.push(cur); } cur.push([px, py]); x = px; y = py; };
  const cubic = (x1, y1, x2, y2, x3, y3) => { const x0 = x, y0 = y, n = 12;
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t;
      push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3); } };
  const quad = (x1, y1, x2, y2) => { const x0 = x, y0 = y, n = 10;
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; push(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2); } };
  const arc = (rx, ry, phi, fa, fs, x2, y2) => {
    const x1 = x, y1 = y; if (rx === 0 || ry === 0) { push(x2, y2); return; }
    rx = Math.abs(rx); ry = Math.abs(ry); const p = phi * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    let n2 = Math.max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p);
    let co = Math.sqrt(n2 / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)); if (fa === fs) co = -co;
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const ccx = cp * cxp - sp * cyp + (x1 + x2) / 2, ccy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 24)));
    for (let k = 1; k <= n; k++) { const t = t1 + dt * k / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      push(cp * ex - sp * ey + ccx, sp * ex + cp * ey + ccy); } };
  while (i < toks.length) {
    if (!isNum()) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    switch (C) {
      case 'M': { const nx = num() + ox, ny = num() + oy; cur = [[nx, ny]]; rings.push(cur); x = sx = nx; y = sy = ny; cmd = rel ? 'l' : 'L'; break; }
      case 'L': push(num() + ox, num() + oy); break;
      case 'H': push(num() + ox, y); break;
      case 'V': push(x, num() + oy); break;
      case 'C': { const a = num() + ox, b = num() + oy, c = num() + ox, e = num() + oy, f = num() + ox, g = num() + oy; cubic(a, b, c, e, f, g); cx = c; cy = e; break; }
      case 'S': { const r1 = /[CS]/.test(prev) ? [2 * x - cx, 2 * y - cy] : [x, y]; const c = num() + ox, e = num() + oy, f = num() + ox, g = num() + oy; cubic(r1[0], r1[1], c, e, f, g); cx = c; cy = e; break; }
      case 'Q': { const a = num() + ox, b = num() + oy, f = num() + ox, g = num() + oy; quad(a, b, f, g); qx = a; qy = b; break; }
      case 'T': { const r1 = /[QT]/.test(prev) ? [2 * x - qx, 2 * y - qy] : [x, y]; const f = num() + ox, g = num() + oy; quad(r1[0], r1[1], f, g); qx = r1[0]; qy = r1[1]; break; }
      case 'A': { const rx = num(), ry = num(), phi = num(), fa = flag(), fs = flag(); const f = num() + ox, g = num() + oy; arc(rx, ry, phi, fa, fs, f, g); break; }
      case 'Z': x = sx; y = sy; cur = null; break;
      default: throw new Error('path command ' + cmd);
    }
    prev = C;
  }
  return rings.filter((r) => r.length >= 3);
}
const attr = (a, n) => { const m = a.match(new RegExp('(?:^|\\s)' + n + '="([^"]*)"')); return m ? m[1] : null; };
function shapeRings(tag, a) {
  const f = (n, d) => { const v = attr(a, n); return v === null ? d : parseFloat(v); };
  if (tag === 'path') { const d = attr(a, 'd'); return d ? pathRings(d) : []; }
  if (tag === 'rect') { const x = f('x', 0), y = f('y', 0), w = f('width', 0), h = f('height', 0); return w > 0 && h > 0 ? [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]] : []; }
  if (tag === 'polygon' || tag === 'polyline') {
    const v = (attr(a, 'points') || '').split(/[\s,]+/).filter(Boolean).map(Number), r = [];
    for (let k = 0; k + 1 < v.length; k += 2) r.push([v[k], v[k + 1]]);
    return r.length >= 3 ? [r] : [];
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = f('cx', 0), cy = f('cy', 0), rx = tag === 'circle' ? f('r', 0) : f('rx', 0), ry = tag === 'circle' ? rx : f('ry', 0), r = [];
    if (!(rx > 0 && ry > 0)) return [];
    for (let k = 0; k < 48; k++) r.push([cx + rx * Math.cos(k * Math.PI / 24), cy + ry * Math.sin(k * Math.PI / 24)]);
    return [r];
  }
  return [];
}
// minimal DOM of the tags that matter
function parseSvg(src) {
  const root = { tag: 'root', attrs: '', kids: [] }, stack = [root], byId = {};
  const re = /<(\/?)([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g; let m;
  while ((m = re.exec(src))) {
    const [, close, tag, a, self] = m;
    if (close) { if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop(); continue; }
    const node = { tag, attrs: a, kids: [] };
    stack[stack.length - 1].kids.push(node);
    const id = attr(a, 'id'); if (id) byId[id] = node;
    if (!self && !/^(path|rect|polygon|polyline|circle|ellipse|line|use|image|stop|feGaussianBlur|feComposite|feColorMatrix)$/.test(tag)) stack.push(node);
  }
  return { root, byId };
}
const SKIP = /^(defs|clipPath|mask|symbol|pattern|metadata|style|title|desc|linearGradient|radialGradient|filter|sodipodi:namedview|rdf:RDF|text)$/;
function collect(node, M, dom, out, depth) {
  if (SKIP.test(node.tag) || depth > 60) return;
  const T = mul(M, parseTransform(attr(node.attrs, 'transform')));
  const clip = attr(node.attrs, 'clip-path');
  if (clip && node.tag === 'g') {                    // clipped group: only the clipping path (module 1 rule)
    const cp = dom.byId[(clip.match(/#([^)'"]+)/) || [])[1]];
    if (cp) { cp.kids.forEach((k) => collect(Object.assign({}, k, { tag: k.tag }), mul(T, parseTransform(attr(cp.attrs, 'transform') || '')), { byId: {} }, out, depth + 1)); return; }
  }
  if (node.tag === 'use') {
    const ref = dom.byId[(attr(node.attrs, 'xlink:href') || attr(node.attrs, 'href') || '').replace('#', '')];
    const x = parseFloat(attr(node.attrs, 'x') || 0), y = parseFloat(attr(node.attrs, 'y') || 0);
    if (ref) collect(ref, mul(T, [1, 0, 0, 1, x, y]), dom, out, depth + 1);
    return;
  }
  const rings = shapeRings(node.tag, node.attrs);
  if (rings.length) out.push(rings.map((r) => r.map(([px, py]) => [T[0] * px + T[2] * py + T[4], -(T[1] * px + T[3] * py + T[5])])));
  node.kids.forEach((k) => collect(k, T, dom, out, depth + 1));
}
// top-level objects of the file = what the user would select; single-<g> wrappers (layers) are descended
function svgObjects(file) {
  const dom = parseSvg(fs.readFileSync(file, 'utf8'));
  let svg = dom.root.kids.find((k) => k.tag === 'svg'), M = [1, 0, 0, 1, 0, 0], level = svg.kids.filter((k) => !SKIP.test(k.tag));
  const vb = (attr(svg.attrs, 'viewBox') || '0 0 0 0').split(/[\s,]+/).map(Number);
  while (level.length === 1 && level[0].tag === 'g' && !attr(level[0].attrs, 'clip-path')) {
    M = mul(M, parseTransform(attr(level[0].attrs, 'transform'))); level = level[0].kids.filter((k) => !SKIP.test(k.tag));
  }
  const objs = [];
  level.forEach((node) => {
    const acc = []; collect(node, M, dom, acc, 0);
    const rings = [], rg = [];
    acc.forEach((rs, k) => rs.forEach((r) => { rings.push(r); rg.push(k); }));
    if (!rings.length) return;
    const b = G.bbox([].concat(...rings));
    objs.push({ i: objs.length, name: attr(node.attrs, 'id') || node.tag + objs.length, type: 'PathItem', layer: 'Art', rings, rg, box: [b[0], b[3], b[2], b[1]] });
  });
  return { objs, artboard: [vb[0], -vb[1], vb[0] + vb[2], -(vb[1] + vb[3])] };
}
function pathsById(file) {
  const dom = parseSvg(fs.readFileSync(file, 'utf8')), out = {};
  (function walk(node, M) {
    if (SKIP.test(node.tag)) return;
    const T = mul(M, parseTransform(attr(node.attrs, 'transform')));
    const id = attr(node.attrs, 'id');
    if (node.tag === 'path' && id) out[id] = shapeRings('path', node.attrs).map((r) => r.map(([px, py]) => [T[0] * px + T[2] * py + T[4], -(T[1] * px + T[3] * py + T[5])]));
    node.kids.forEach((k) => walk(k, T));
  })(dom.root, [1, 0, 0, 1, 0, 0]);
  return out;
}
// the design of a sticker sheet: module-1 pieces; the most repeated size among the real stickers (> 1000 pt2),
// or the piece closest to a documented size [w, h] (Wikimania sheets hold similar but different stickers)
function sheetDesign(file, target) {
  const { objs, artboard } = svgObjects(file);
  const plan = CLU.planPieces(objs, { merge: true, shape: 'all', artboards: [artboard] });
  const wh = (p) => [p.box[2] - p.box[0], p.box[1] - p.box[3]];
  const key = (p) => wh(p).map(Math.round).join('x');
  const big = plan.pieces.filter((p) => wh(p)[0] * wh(p)[1] > 1000);
  const count = {};
  big.forEach((p) => { count[key(p)] = (count[key(p)] || 0) + 1; });
  let p;
  if (target) p = big.slice().sort((a, b) => Math.hypot(wh(a)[0] - target[0], wh(a)[1] - target[1]) - Math.hypot(wh(b)[0] - target[0], wh(b)[1] - target[1]))[0];
  else { const best = Object.keys(count).sort((a, b) => count[b] - count[a] || parseInt(b) - parseInt(a))[0]; p = big.find((x) => key(x) === best); }
  return { item: { name: path.basename(file, '.svg'), rings: p.rings, rg: p.rg, box: p.box }, repeats: count[key(p)], pieces: plan.pieces.length, size: key(p) };
}
function scaleItem(it, k, dx, dy) {
  const rings = it.rings.map((r) => r.map(([x, y]) => [x * k + (dx || 0), y * k + (dy || 0)]));
  const b = G.bbox([].concat(...rings));
  return Object.assign({}, it, { rings, box: [b[0], b[3], b[2], b[1]] });
}

// ------------------------------------------------------------------ wasm
const glue = fs.readFileSync(path.join(CLIENT, 'lib', 'corvo.js'), 'utf8');
const ctx = { console, TextEncoder, TextDecoder, WebAssembly, performance, BigInt, Error, Symbol, Object, Array,
  Uint8Array, Float32Array, Int32Array, BigInt64Array, DataView, Math, Number, String, JSON, Function, Promise,
  queueMicrotask, setTimeout, Date, crypto: globalThis.crypto };
ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
const wb = vm.runInContext(glue + ';wasm_bindgen;', ctx);

// ------------------------------------------------------------------ geometry checks
const P = (ring) => { const p = ring.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) })); return CL.Clipper.Orientation(p) ? p : p.reverse(); };
function clip(type, a, b) {
  const c = new CL.Clipper(), out = new CL.Paths(), f = CL.PolyFillType.pftNonZero;
  c.AddPaths(a, CL.PolyType.ptSubject, true); c.AddPaths(b, CL.PolyType.ptClip, true);
  c.Execute(type, out, f, f); return out;
}
const areaOf = (paths) => Math.abs(paths.reduce((s, p) => s + CL.Clipper.Area(p), 0)) / (S * S);
function grow(paths, d) {
  const co = new CL.ClipperOffset(2, 0.05 * S), out = new CL.Paths();
  co.AddPaths(paths, CL.JoinType.jtRound, CL.EndType.etClosedPolygon); co.Execute(out, d * S); return out;
}
const placedPoly = (p, pl) => { const a = pl.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return p.polygon.map(([x, y]) => [c * x - s * y + pl.translation[0], s * x + c * y + pl.translation[1]]); };

// ------------------------------------------------------------------ the pipeline of main.js
function runJob(label, items, spec, o) {
  o = Object.assign({ rollMm: 300, rot: '90', keepClose: false, demand: true, holes: false, secs: SECS, quiet: false }, o || {});
  items = items.map((it, k) => Object.assign({}, it, { i: k }));
  const H = o.rollMm * MM, orient = G.rotationsFor(o.rot);
  const t0 = performance.now();
  let pieces = G.buildPieces(items, { gap: GAP, flatness: 0.5 });
  pieces = pieces.filter((x) => !x.error); pieces.forEach((x, k) => { x.hostI = x.id; x.id = k; });
  const qx = Q.expand(items, pieces, spec, { base: items.length });
  const plan = o.holes ? HO.planHoles(qx.items, qx.pieces, { gap: GAP, orientations: orient }) : null;
  const nestPieces = HO.nestPieces(qx.pieces, plan);
  const wrap = Q.buildNest(nestPieces, { keepClose: o.keepClose, demand: o.demand, gap: GAP, orientations: orient, stripHeight: H, cellMax: o.cellMax || 4, maxWaste: o.maxWaste || 0.03 });
  const prepMs = performance.now() - t0;
  const instance = Q.buildInstance(wrap, H, orient);
  let best = null, first = null, reports = 0;
  const tn = performance.now();
  wb.nest(JSON.stringify(instance), o.secs * 0.8, o.secs * 0.2, BigInt(SEED), GAP, (json) => {
    const r = JSON.parse(json); reports++;
    if (!first) first = performance.now() - tn;
    if (!best || r.strip_width <= best.strip_width) best = r;
  });
  const nestMs = performance.now() - tn;
  const pls = Q.expandPlacements(best.placements, wrap);
  const moves = HO.movesFor(pls, nestPieces, [0, 0], plan);
  const res = { label, n: qx.pieces.length, extra: qx.extra, L: best.strip_width / MM, prepMs, firstMs: first, nestMs, reports,
    items: wrap.items.length, cells: wrap.cells, refused: wrap.cellsRefused, waste: wrap.waste };

  // --- checks
  const want = qx.pieces.map((p) => p.hostI).sort((a, b) => a - b), got = moves.map((m) => m.i).sort((a, b) => a - b);
  check(JSON.stringify(want) === JSON.stringify(got), `${label}: every piece moved once on its host index (${got.length}/${want.length})`);
  check(best.placements.length === wrap.items.reduce((s, it) => s + it.demand, 0), `${label}: Sparrow placed every unit`);
  const byHost = Object.fromEntries(qx.pieces.map((p) => [p.hostI, p]));
  const itemByI = Object.fromEntries(qx.items.map((it) => [it.i, it]));
  // placed outline of every piece = its polygon at its move (move is on the ORIGINAL frame: p_abs = polygon + ref)
  const outl = moves.map((mv) => { const p = byHost[mv.i];
    return { mv, p, ring: G.applyMove(p.polygon.map((q) => [q[0] + p.ref[0], q[1] + p.ref[1]]), mv) }; });
  let out = 0;
  outl.forEach((x) => { const b = G.bbox(x.ring); if (b[0] < -0.6 || b[1] < -0.6 || b[2] > best.strip_width + 0.6 || b[3] > H + 0.6) out++; });
  check(!out, `${label}: ${out} pieces outside the roll`);
  // no overlaps: outlines grown by 0.45 gap must not intersect (Sparrow + cells keep >= gap); a piece in a hole
  // (module 2) lies inside its parent's OUTLINE: for those pairs the even-odd artwork must not intersect
  const inHole = {};
  if (plan) plan.children.forEach((c) => { inHole[qx.pieces[c.id].hostI] = true; });
  const grown = outl.map((x) => ({ i: x.mv.i, b: G.bbox(x.ring), g: grow([P(x.ring)], GAP * 0.45) }));
  const artOf = (x) => { const c = new CL.Clipper(), o2 = new CL.Paths();
    c.AddPaths(itemByI[x.i].rings.map((r) => G.applyMove(r, outl.find((y) => y.mv.i === x.i).mv)).map((r) => r.map(([px, py]) => ({ X: Math.round(px * S), Y: Math.round(py * S) }))), CL.PolyType.ptSubject, true);
    c.Execute(CL.ClipType.ctUnion, o2, CL.PolyFillType.pftEvenOdd, CL.PolyFillType.pftEvenOdd); return o2; };
  let ov = 0, worst = 0;
  for (let a = 0; a < grown.length; a++) for (let b = a + 1; b < grown.length; b++) {
    const A = grown[a].b, B = grown[b].b;
    if (A[2] + GAP < B[0] || B[2] + GAP < A[0] || A[3] + GAP < B[1] || B[3] + GAP < A[1]) continue;
    const v = (inHole[grown[a].i] || inHole[grown[b].i])
      ? areaOf(clip(CL.ClipType.ctIntersection, artOf(grown[a]), artOf(grown[b])))
      : areaOf(clip(CL.ClipType.ctIntersection, grown[a].g, grown[b].g));
    if (v > 0.5) { ov++; worst = Math.max(worst, v); }
  }
  check(!ov, `${label}: ${ov} overlapping pairs (worst ${worst.toFixed(1)} pt2)`);
  // mirrored copies: exact reflection then a rigid move (orientation of 3 artwork points flips, never a rotation)
  let badMirror = 0, maxErr = 0;
  outl.forEach(({ mv, p }) => {
    if (p.copyOf === undefined) return;
    const src = itemByI[p.copyOf], virt = itemByI[p.hostI];
    const pts = [].concat(...src.rings);
    const tri = [pts[0], pts[Math.floor(pts.length / 3)], pts[Math.floor(2 * pts.length / 3)]];
    const orientOf = (t) => Math.sign((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]));
    // host on Apply: duplicate at the original, reflect across x = axis (mirror), then the absolute move
    const hostPts = G.applyMove(tri.map(([x, y]) => (p.mirror ? [2 * p.ref[0] - x, y] : [x, y])), mv);
    const so = orientOf(tri), fo = orientOf(hostPts);
    if (so !== 0 && (p.mirror ? fo !== -so : fo !== so)) badMirror++;
    // virtual rings (used by holes and for the ghost) = what the host builds on Apply
    if (p.mirror) {
      const m = Q.mirrorRings(src.rings, p.ref[0]);
      for (let r = 0; r < m.length; r++) for (let k = 0; k < m[r].length; k++)
        maxErr = Math.max(maxErr, Math.hypot(m[r][k][0] - virt.rings[r][k][0], m[r][k][1] - virt.rings[r][k][1]));
    }
  });
  check(!badMirror, `${label}: ${badMirror} copies with a wrong handedness`);
  check(maxErr === 0, `${label}: virtual mirrored rings = host reflection (max ${maxErr})`);
  if (plan) res.children = plan.children.length, res.childrenInCopies = plan.children.filter((c) => byHost[qx.pieces[c.parent].hostI].copyOf !== undefined).length;
  // closeness of copies of the same design
  res.close = Q.closeness(pls, nestPieces);
  // naive: rectangles step-and-repeat (report.js shelf baseline on bounding boxes), with the same border margin
  // Sparrow keeps (gap on every side of the strip) so the two lengths compare fairly
  const bl = REP.shelfBaseline(qx.pieces, H - 2 * GAP, GAP, orient);
  res.naive = bl ? (bl.lengthPt + 2 * GAP) / MM : null;
  if (!o.quiet) console.log(`  ${label}: ${res.n} pieces (${res.extra} copies) -> ${res.items} Sparrow items` +
    `${res.cells ? `, ${res.cells} cells` : ''}${res.refused ? ` (${res.refused} refused)` : ''}; L ${res.L.toFixed(0)} mm vs naive ${res.naive ? res.naive.toFixed(0) : '-'} mm; ` +
    `prep ${prepMs.toFixed(0)} ms, first layout ${first.toFixed(0)} ms; nearest sibling ${(res.close.meanNearestSibling / MM).toFixed(0)} mm, NN same design ${(res.close.nearestIsSibling * 100).toFixed(0)}%`);
  return res;
}

if (require.main !== module) {
  module.exports = { svgObjects, pathsById, sheetDesign, runJob, REAL,
    init: () => wb({ module_or_path: new Uint8Array(fs.readFileSync(path.join(CLIENT, 'lib', 'corvo_bg.wasm'))) }) };
  return;
}
(async () => {
  await wb({ module_or_path: new Uint8Array(fs.readFileSync(path.join(CLIENT, 'lib', 'corvo_bg.wasm'))) });
  if (!fs.existsSync(path.join(REAL, 'freesvg_car-right-headlight.svg'))) { console.log('real files not found in ' + REAL); process.exit(1); }

  // ---------------------------------------------------------------- 1. units
  console.log('units');
  {
    const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const L = [[0, 0], [30, 0], [30, 8], [8, 8], [8, 20], [0, 20]];
    const items = [{ i: 0, name: 'L', rings: [L.map(([x, y]) => [x + 100, y + 50])] }, { i: 1, name: 'sq', rings: [sq] }];
    let pcs = G.buildPieces(items, { gap: 0 });
    const qx = Q.expand(items, pcs, { qty: { 0: 3, 1: 1 }, mirror: { 0: true } }, { base: 2 });
    check(qx.extra === 5 && qx.mirrored === 3, `qty 3 + mirror -> 2 copies + 3 mirrored (${qx.extra}, ${qx.mirrored})`);
    check(qx.pieces.map((p) => p.id).join() === '0,1,2,3,4,5,6', 'piece ids consecutive');
    check(qx.pieces.slice(2).map((p) => p.hostI).join() === '2,3,4,5,6', 'copy host indices = base + k (ghost indices)');
    check(qx.copies.every((c, k) => c.k === k && c.src === 0), 'copies point to their source host index');
    const src = pcs[0], mp = qx.pieces.find((p) => p.mirror);
    const exact = src.polygon.every((q, k) => { const m = mp.polygon[src.polygon.length - 1 - k]; return m[0] === -q[0] && m[1] === q[1]; });
    check(exact, 'mirrored polygon = exact reflection of the f32 polygon (x -> -x, order reversed)');
    check(Math.abs(G.signedArea(mp.polygon) - G.signedArea(src.polygon)) < 1e-6 && G.isSimple(mp.polygon), 'mirrored polygon: same area and winding, simple');
    const vm0 = qx.items.find((it) => it.mirror);
    check(Math.abs(G.bbox(vm0.rings[0])[0] - (2 * src.ref[0] - G.bbox(items[0].rings[0])[2])) < 1e-9, 'virtual mirrored rings reflected across x = ref.x');
    check(Q.clampQty(0) === 1 && Q.clampQty('7') === 7 && Q.clampQty(5000) === Q.MAX_QTY && Q.clampQty('x') === 1, 'quantity clamped to 1..999');
    // placements expansion through a cell: member placement = (a + b, R(a) d + t)
    const wrap = { items: [{ id: 0, demand: 2, units: [[{ pid: 5, b: 0, d: [0, 0] }, { pid: 6, b: 180, d: [40, 0] }], [{ pid: 7, b: 0, d: [0, 0] }, { pid: 8, b: 180, d: [40, 0] }]] }] };
    const e = Q.expandPlacements([{ item_id: 0, rotation: 90, translation: [100, 10] }, { item_id: 0, rotation: 0, translation: [0, 0] }], wrap);
    check(e.length === 4 && e[1].item_id === 6 && e[1].rotation === 270 && Math.abs(e[1].translation[0] - 100) < 1e-9 && Math.abs(e[1].translation[1] - 50) < 1e-9 &&
      e[2].item_id === 7, 'expandPlacements: demand units in order, cell members composed');
    // pair cell of an L with itself: members >= gap apart, outline contains both
    const pc = pcs[0].polygon, cell = Q._internals.makeCell(pc, [{ pid: 0, b: 0, d: [0, 0] }], pc, [{ pid: 1, b: 0, d: [0, 0] }], [0, 180],
      Object.assign({}, Q.DEFAULTS, { gap: 2 }));
    const m2 = cell && cell.members[1];
    const Bp = m2 && pc.map((q) => { const a = m2.b * Math.PI / 180; return [Math.cos(a) * q[0] - Math.sin(a) * q[1] + m2.d[0], Math.sin(a) * q[0] + Math.cos(a) * q[1] + m2.d[1]]; });
    const inter = cell ? areaOf(clip(CL.ClipType.ctIntersection, grow([P(pc)], 0.95), grow([P(Bp)], 0.95))) : 1;
    check(cell && inter < 0.01, `L + L cell: members >= gap apart (rel. rotation ${m2 && m2.b}, waste ${cell && (cell.waste * 100).toFixed(1)}%)`);
    check(cell && m2.b === 180, 'L + L cell interlocks with a 180 deg partner');
  }

  // ---------------------------------------------------------------- 1b. host (corvo.jsx) with a mock Illustrator DOM
  console.log('host corvo.jsx (mock DOM): ghosts, apply, finish -> duplicates, revert');
  {
    const mk = () => {
      const made = [];
      class It {
        constructor(pts, parent, name) { this.pts = pts.map((q) => q.slice()); this.parent = parent; this.typename = 'PathItem'; this.name = name || ''; }
        transform(m) { this.pts = this.pts.map(([x, y]) => [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty]); }
        duplicate(rel, where) { const d = new It(this.pts, this.parent, this.name); d.where = where; d.rel = rel; made.push(d); return d; }
        remove() { this.removed = true; this.parent = null; }
        setEntirePath(p) { this.pts = p.map((q) => q.slice()); }
        get geometricBounds() { const b = G.bbox(this.pts); return [b[0], b[3], b[2], b[1]]; }
      }
      const coll = (layer) => { const list = []; return { list, add() { const x = new It([], layer); list.push(x); return x; },
        getByName(n) { const x = list.find((y) => y.name === n && !y.removed); if (!x) throw new Error('no'); return x; } }; };
      const doc = { typename: 'Document', parent: {}, name: 'mock', layerList: [] };
      doc.layers = { getByName(n) { const l = doc.layerList.find((x) => x.name === n && !x.removed); if (!l) throw new Error('no'); return l; },
        add() { const l = { typename: 'Layer', parent: doc, name: '', locked: false, visible: true, layers: { length: 0 }, remove() { this.removed = true; } };
          l.pathItems = coll(l); l.textFrames = coll(l);
          Object.defineProperty(l, 'pageItems', { get() { return { length: l.pathItems.list.filter((x) => !x.removed).length + l.textFrames.list.filter((x) => !x.removed).length }; } });
          doc.layerList.push(l); return l; } };
      Object.defineProperty(doc, 'activeLayer', { get() { return null; }, set() {} });
      const M = (a, b, c, d, tx, ty) => ({ a, b, c, d, tx, ty });
      const app = { coordinateSystem: 0, documents: { length: 1 }, activeDocument: doc, redraw() {},
        getRotationMatrix(deg) { const r = deg * Math.PI / 180; return M(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0); },
        getScaleMatrix(sx, sy) { return M(sx / 100, 0, 0, sy / 100, 0, 0); },
        concatenateTranslationMatrix(m, tx, ty) { return M(m.a, m.b, m.c, m.d, m.tx + tx, m.ty + ty); } };
      const sb = { $: { global: {} }, app, RGBColor: function () {}, Transformation: { DOCUMENTORIGIN: 'DO' }, ElementPlacement: { PLACEBEFORE: 'PB' },
        CoordinateSystem: { DOCUMENTCOORDINATESYSTEM: 1 } };
      vm.createContext(sb);
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'host', 'corvo.jsx'), 'utf8'), sb);
      const lay = { typename: 'Layer', parent: doc };
      const print = new It([[0, 0], [60, 0], [60, 30], [10, 40]], lay, 'print'), cut = new It([[-2, -2], [62, -2], [62, 42], [-2, 42]], lay, 'cut'), other = new It([[200, 0], [220, 0], [210, 20]], lay, 'o');
      // arrays built INSIDE the sandbox (corvo.jsx tests `instanceof Array`, which fails across vm contexts)
      Object.assign(sb, { __p: print, __c: cut, __o: other, __doc: doc });
      vm.runInContext(`(function (st) { st.raw = [__p, __c, __o]; st.items = [[__p, __c], [__o]];
        st.applied = [{ a: 0, tx: 0, ty: 0 }, { a: 0, tx: 0, ty: 0 }]; st.doc = __doc;
        st.probe = { origin: [0, 0], sign: 1, post: true }; st.steps = 0; st.orig = [null, null, null]; })($.global.corvo)`, sb);
      const st = sb.$.global.corvo;
      return { sb, st, made, print, cut, other, doc, It };
    };
    const call = (sb, fn, arg) => JSON.parse(vm.runInContext(`${fn}(${arg === undefined ? '' : JSON.stringify(JSON.stringify(arg))})`, sb));
    const AX = 30, ring = [[0, 0], [60, 0], [60, 40], [0, 40]];
    const moves = [{ i: 0, a: 90, tx: 500, ty: 10 }, { i: 1, a: 0, tx: 5, ty: 5 }, { i: 2, a: 180, tx: 700, ty: 300 }, { i: 3, a: 270, tx: 900, ty: 50 }];
    // finish
    {
      const E = mk();
      const g = call(E.sb, 'corvoM3Ghosts', { base: 2, copies: [{ src: 0, mirror: false, axis: AX, ring }, { src: 0, mirror: true, axis: AX, ring }] });
      check(g.ok && g.n === 2 && E.st.items.length === 4, `corvoM3Ghosts: 2 ghosts at host indices 2,3 (${JSON.stringify(g)})`);
      const ghosts = [E.st.items[2][0], E.st.items[3][0]];
      check(ghosts.every((x) => x.name === 'Corvo_Ghost' && x.parent && x.parent.name === 'Corvo'), 'ghosts are Corvo_Ghost paths on the Corvo layer');
      const ap = call(E.sb, 'corvoApply', moves);
      check(ap.ok && ap.moved === 4, 'corvoApply moves pieces AND ghosts with the same contract');
      check(Math.hypot(ghosts[1].pts[0][0] - G.applyMove([ring[0]], moves[3])[0][0], ghosts[1].pts[0][1] - G.applyMove([ring[0]], moves[3])[0][1]) < 1e-9, 'ghost at its absolute move');
      const origPrint = [[0, 0], [60, 0], [60, 30], [10, 40]];
      const fin = call(E.sb, 'corvoFinish', { singleUndo: false });
      check(fin.ok && fin.copies === 2 && !(fin.copyErrors || []).length, `corvoFinish creates 2 copies (${JSON.stringify(fin)})`);
      check(ghosts.every((x) => x.removed), 'ghosts removed on Apply');
      check(E.made.length === 4 && E.made.every((d) => d.where === 'PB' && (d.rel === E.print || d.rel === E.cut) && d.parent), 'every member duplicated PLACEBEFORE itself (same layer, just above)');
      const dPrint = E.made.filter((d) => d.name === 'print');
      const exp1 = G.applyMove(origPrint, moves[2]);
      const exp2 = G.applyMove(origPrint.map(([x, y]) => [2 * AX - x, y]), moves[3]);
      const err = (a, b) => Math.max(...a.map((q, k) => Math.hypot(q[0] - b[k][0], q[1] - b[k][1])));
      check(err(dPrint[0].pts, exp1) < 1e-9, `plain copy = original moved by its ghost move (err ${err(dPrint[0].pts, exp1).toExponential(1)})`);
      check(err(dPrint[1].pts, exp2) < 1e-9, `mirrored copy = reflection across x=${AX} then the ghost move (err ${err(dPrint[1].pts, exp2).toExponential(1)})`);
      check(err(E.print.pts, G.applyMove(origPrint, moves[0])) < 1e-9, 'original stays at its final move');
    }
    // revert
    {
      const E = mk();
      call(E.sb, 'corvoM3Ghosts', { base: 2, copies: [{ src: 0, mirror: true, axis: AX, ring }] });
      const gh = E.st.items[2][0];
      call(E.sb, 'corvoApply', moves.slice(0, 3));
      const rv = call(E.sb, 'corvoRevert');
      check(rv.ok && gh.removed && E.made.length === 0 && E.st.items.length === 2, 'Annulla: ghosts removed, no duplicate ever created, pieces only');
      check(Math.hypot(E.print.pts[3][0] - 10, E.print.pts[3][1] - 40) < 1e-9, 'Annulla: originals back in place');
      const bad = call(E.sb, 'corvoM3Ghosts', { base: 5, copies: [] });
      check(!!bad.error, 'corvoM3Ghosts refuses a wrong base');
    }
  }

  // ---------------------------------------------------------------- 2. mirror on the real headlights
  console.log('mirrored pair: real left/right headlights');
  let headR;
  {
    const R = pathsById(path.join(REAL, 'freesvg_car-right-headlight.svg')), Lf = pathsById(path.join(REAL, 'freesvg_car-left-headlight.svg'));
    const r = R.path4146[0], l = Lf.path6797[0];
    const br = G.bbox(r), ax = (br[0] + br[2]) / 2;
    const m = Q.mirrorRings([r], ax)[0], bm = G.bbox(m), bl = G.bbox(l);
    const dx = (bl[0] + bl[2]) / 2 - (bm[0] + bm[2]) / 2, dy = (bl[1] + bl[3]) / 2 - (bm[1] + bm[3]) / 2;
    const mm = m.map(([x, y]) => [x + dx, y + dy]);
    const xor = areaOf(clip(CL.ClipType.ctXor, [P(mm)], [P(l)])), ar = G.area(l);
    console.log(`  mirror(right) vs real left: symmetric difference ${xor.toFixed(3)} pt2 = ${(xor / ar * 100).toFixed(4)}% of ${ar.toFixed(0)} pt2`);
    check(xor / ar < 1e-3, 'mirror(right headlight) = real left headlight (sym. diff < 0.1%)');
    headR = { name: 'headlight R', rings: [r, R.path4148[0]], rg: [0, 1] };
  }

  // ---------------------------------------------------------------- 3. real designs x quantities
  console.log('\nquantities on real designs (roll 300 mm, gap 2 mm, rotations 0/90/180/270)');
  const avery = { name: 'Avery 22806 2in', rings: [[[45, -189], [189, -189], [189, -45], [45, -45]]] };   // PyMuPDF: 12 x 144x144 pt
  const wm1 = sheetDesign(path.join(REAL, 'Wikimania2021_StickerSheet1.svg'), [82.2, 64.4]);
  const wp20 = sheetDesign(path.join(REAL, 'Wikipedia20_sticker_sheet_1.svg'));
  const pl = sheetDesign(path.join(REAL, 'freesvg_product-labels-and-stickers.svg'));
  console.log(`  designs: Wikimania1 sticker ${wm1.size} pt, Wikipedia20 sticker ${wp20.size} pt (x${wp20.repeats} on the sheet), product label ${pl.size} pt (x${pl.repeats})`);
  check(wp20.repeats >= 12 && pl.repeats === 3, 'sticker sheets: the repeated design is found by module 1');
  const results = [];
  for (const [d, qs] of [[avery, [1, 5, 12, 20]], [wm1.item, [1, 6, 12, 20]], [wp20.item, [8, 20]], [pl.item, [3, 12]]]) {
    for (const q of qs) results.push(runJob(`${d.name} x${q}`, [d], { qty: { 0: q } }));
  }
  // Avery x20 on 300 mm: 2 in squares + 2 mm gap -> 5 per column, 4 columns
  const av20 = results.find((r) => r.label === 'Avery 22806 2in x20');
  check(av20.L <= av20.naive + 1, `Avery x20 not longer than step-and-repeat (${av20.L.toFixed(0)} vs ${av20.naive.toFixed(0)} mm)`);

  // ---------------------------------------------------------------- 4. mirrored pairs (vehicle kits)
  console.log('\nmirrored pairs');
  const flames = svgObjects(path.join(REAL, 'hot-rod-flames_openclipart.svg')).objs;
  const flameItem = { name: 'hot-rod flames', rings: [].concat(...flames.map((o) => o.rings)), rg: [].concat(...flames.map((o, k) => o.rg.map((g) => k * 1000 + g))) };
  const headS = scaleItem(headR, 0.5);
  for (const [d, q] of [[headS, 1], [headS, 6], [flameItem, 2]]) results.push(runJob(`${d.name} L+R x${q}`, [d], { qty: { 0: q }, mirror: { 0: true } }, { rollMm: 600 }));

  // ---------------------------------------------------------------- 5. keep close: cells vs none
  console.log('\nkeep copies together (cells) vs plain, same seed');
  const mixed = [avery, wm1.item, pl.item, headS];
  const mixSpec = { qty: { 0: 6, 1: 8, 2: 5, 3: 4 }, mirror: { 3: true } };
  const kc = [];
  const flS = scaleItem(flameItem, 0.5);
  for (const [label, items, spec, o] of [
    ['one design: wm1 x12 (no cells)', [wm1.item], { qty: { 0: 12 } }, {}],
    ['mixed 4 designs (27 pieces)', mixed, mixSpec, { rollMm: 600 }],
    ['mixed 5 designs (40 pieces)', [avery, wp20.item, pl.item, headS, flS], { qty: { 0: 8, 1: 12, 2: 6, 3: 4, 4: 3 }, mirror: { 3: true, 4: true } }, { rollMm: 600 }],
    ['stickers 3 designs x10', [wm1.item, wp20.item, avery], { qty: { 0: 10, 1: 10, 2: 10 } }, {}]
  ]) {
    const off = runJob(label + ' / plain', items, spec, o);
    const on = runJob(label + ' / together', items, spec, Object.assign({ keepClose: true }, o));
    const on2 = runJob(label + ' / together, pairs only', items, spec, Object.assign({ keepClose: true, cellMax: 2 }, o));
    const d = (on.L / off.L - 1) * 100, d2 = (on2.L / off.L - 1) * 100;
    kc.push({ label, off, on, on2, d, d2 });
    if (items.length === 1) check(on.cells === 0, `${label}: one design -> no cells`);
    check(d <= 3.0, `${label}: together costs <= 3% length (${d.toFixed(1)}%)`);
  }

  // ---------------------------------------------------------------- 6. module 2: holes of the copies
  console.log('\ncopies with module 2 (holes)');
  {
    const bebasF = path.join(HOLES, 'BebasNeue_channel_letters_OARBDQ890.svg');
    if (fs.existsSync(bebasF)) {
      const O = pathsById(bebasF)['glyph-O'];
      const b = G.bbox([].concat(...O)), k = 300 / (b[3] - b[1]);
      const Oi = { name: 'O 300pt', rings: O.map((r) => r.map(([x, y]) => [(x - b[0]) * k, (y - b[1]) * k])) };
      const star = { name: 'dot 30pt', rings: [Array.from({ length: 24 }, (_, a) => [2000 + 15 * Math.cos(a * Math.PI / 12), 15 * Math.sin(a * Math.PI / 12)])] };
      const r = runJob('O x3 + dot x12, holes ON', [Oi, star], { qty: { 0: 3, 1: 12 } }, { holes: true });
      check(r.childrenInCopies > 0, `children placed inside the holes of COPIES too (${r.childrenInCopies}/${r.children})`);
    } else console.log('  (holes files not found, skipped)');
  }

  // ---------------------------------------------------------------- 7. 200+ copies: demand vs one item per copy
  console.log('\n200+ copies (roll 600 mm): Sparrow demand vs one item per copy');
  const bigSpec = { qty: { 0: 60, 1: 60, 2: 45, 3: 20 }, mirror: { 3: true } };   // 60 + 60 + 45 + 40 = 205
  const tDem = runJob('205 pieces, demand', mixed, bigSpec, { rollMm: 600, secs: Math.max(SECS, 10) });
  const tOne = runJob('205 pieces, one item per copy', mixed, bigSpec, { rollMm: 600, secs: Math.max(SECS, 10), demand: false });
  const tKc = runJob('205 pieces, demand + together', mixed, bigSpec, { rollMm: 600, secs: Math.max(SECS, 10), keepClose: true });
  check(tDem.n === 205, `205 pieces (${tDem.n})`);
  check(tDem.firstMs < 5000, `first layout of 205 pieces in < 5 s (${tDem.firstMs.toFixed(0)} ms)`);

  console.log('\nsummary (mm):');
  for (const r of results) console.log(`  ${r.label.padEnd(34)} n=${String(r.n).padStart(3)}  L=${r.L.toFixed(0).padStart(5)}  naive=${(r.naive ? r.naive.toFixed(0) : '-').padStart(5)}  saving vs naive ${r.naive ? ((1 - r.L / r.naive) * 100).toFixed(1) : '-'}%`);
  const pc = (x) => (x.close.nearestIsSibling * 100).toFixed(0) + '%';
  for (const k of kc) console.log(`  together: ${k.label.padEnd(32)} plain ${k.off.L.toFixed(0)} | cells<=4 ${k.on.L.toFixed(0)} (${k.d >= 0 ? '+' : ''}${k.d.toFixed(1)}%, ${k.on.cells} cells, ${k.on.refused} refused) | pairs ${k.on2.L.toFixed(0)} (${k.d2 >= 0 ? '+' : ''}${k.d2.toFixed(1)}%, ${k.on2.cells} cells) | nearest neighbour same design ${pc(k.off)} -> ${pc(k.on)} / ${pc(k.on2)}`);
  for (const r of [tDem, tOne, tKc]) console.log(`  ${r.label.padEnd(34)} items ${String(r.items).padStart(3)}  prep ${r.prepMs.toFixed(0)} ms  first ${r.firstMs.toFixed(0)} ms  L=${r.L.toFixed(0)} (${r.reports} reports in ${(r.nestMs / 1000).toFixed(1)} s)`);
  console.log(failures ? `FAIL (${failures}/${checks})` : `PASS (${checks} checks)`);
})().catch((e) => { check(false, String(e && e.stack || e)); console.log('FAIL'); });
