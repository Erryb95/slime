// node plugin/tools/test_holes.js [seconds=8] [realDir]
// Module 2 "pezzi dentro i fori": holes.js pre-pass + Sparrow (wasm, same no-modules glue as the worker), without Illustrator.
//   set "letters": Bebas Neue O A R B D 8 at 300 pt + 20 small pieces (synthetic)
//   real sets    : bench/real/holes (Bebas channel letters, MDI ring/washer/frame, Wikimedia roundel) + small pieces
// For each set: holes OFF vs holes ON (same seed), checks on the ON layout (original artwork after the final moves):
//   every child inside its parent's hole with clearance >= gap, no overlaps between any artwork (even-odd fill),
//   all pieces placed, inside the roll; reports saving %, pre-pass runtime.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const CLIENT = path.join(__dirname, '..', 'client');
const G = require(path.join(CLIENT, 'js', 'geometry.js'));
const H = require(path.join(CLIENT, 'js', 'holes.js'));
const CL = require(path.join(CLIENT, 'lib', 'clipper.js'));
const CLU = require(path.join(CLIENT, 'js', 'cluster.js'));   // module 1 (merge)

const SECS = +(process.argv[2] || 8);
const REAL = process.argv[3] || path.join(__dirname, '..', '..', '..', 'Plugin', 'bench', 'real', 'holes');
const MM = 72 / 25.4, GAP = 2 * MM, ROT = '90', ROLL_MM = 300;
const S = 1000;
let failures = 0;
function fail(msg) { console.log('  FAIL: ' + msg); failures++; process.exitCode = 1; }

// ------------------------------------------------------------------ minimal SVG -> rings (paths incl. arcs)
function mul(m, n) { // [a b c d e f] affine, m * n
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
  const flag = () => { // arc flags may be glued ("0 0,1" or "01")
    let t = toks[i]; if (t.length > 1 && (t[0] === '0' || t[0] === '1')) { toks[i] = t.slice(1); return +t[0]; } i++; return +t; };
  const push = (px, py) => { if (!cur) { cur = [[x, y]]; rings.push(cur); } cur.push([px, py]); x = px; y = py; };
  const cubic = (x1, y1, x2, y2, x3, y3) => { const x0 = x, y0 = y, n = 16;
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t;
      push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3); } };
  const quad = (x1, y1, x2, y2) => { const x0 = x, y0 = y, n = 12;
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; push(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2); } };
  const arc = (rx, ry, phi, fa, fs, x2, y2) => { // SVG spec F.6.5
    const x1 = x, y1 = y; if (rx === 0 || ry === 0) { push(x2, y2); return; }
    rx = Math.abs(rx); ry = Math.abs(ry); const p = phi * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    let num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p; num2 = Math.max(0, num2);
    let co = Math.sqrt(num2 / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)); if (fa === fs) co = -co;
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const ccx = cp * cxp - sp * cyp + (x1 + x2) / 2, ccy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 48)));
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
// svg file -> [{name, rings}] (one piece per <path>, transforms of the <g> stack applied)
function svgPieces(file) {
  const src = fs.readFileSync(file, 'utf8'), out = [], stack = [[1, 0, 0, 1, 0, 0]];
  const re = /<(\/?)(g|path|svg)\b([^>]*?)(\/?)>/g; let m;
  while ((m = re.exec(src))) {
    const attrs = m[3], tr = parseTransform((attrs.match(/\btransform="([^"]*)"/) || [])[1]);
    if (m[2] === 'g' || m[2] === 'svg') {
      if (m[1]) stack.pop(); else if (!m[4]) stack.push(mul(stack[stack.length - 1], tr));
      continue;
    }
    if (m[1]) continue;
    const d = (attrs.match(/\sd="([^"]*)"/) || [])[1]; if (!d) continue;
    const M = mul(stack[stack.length - 1], tr);
    const rings = pathRings(d).map((r) => r.map(([px, py]) => [M[0] * px + M[2] * py + M[4], M[1] * px + M[3] * py + M[5]]));
    out.push({ name: (attrs.match(/\bid="([^"]*)"/) || [])[1] || path.basename(file), rings });
  }
  return out;
}
// normalise: flip y (SVG y down -> doc y up), scale so the bbox height is `h` pt, move to (x, y)
function place(rings, h, x0, y0, useWidth) {
  const b = G.bbox([].concat(...rings)), k = h / (useWidth ? (b[2] - b[0]) : (b[3] - b[1]));
  return rings.map((r) => r.map(([x, y]) => [(x - b[0]) * k + x0, -(y - b[3]) * k + y0]));
}

// ------------------------------------------------------------------ small pieces (the pool that can go in holes)
function smallPieces(n, seed, k0) {
  k0 = k0 || 1;
  let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const out = [];
  for (let k = 0; k < n; k++) {
    const kind = k % 4, w = (14 + rnd() * 26) * k0, h = (12 + rnd() * 40) * k0, x0 = 3000 + k * 80 * k0, y0 = -2000;
    let r;
    if (kind === 0) r = [[0, 0], [w, 0], [w, h], [0, h]];
    else if (kind === 1) { r = []; for (let a = 0; a < 32; a++) r.push([w / 2 * Math.cos(a * Math.PI / 16), w / 2 * Math.sin(a * Math.PI / 16)]); }
    else if (kind === 2) r = [[0, 0], [w, 0], [w / 2, h]];
    else r = [[0, 0], [w, 0], [w, h * 0.3], [w * 0.4, h * 0.3], [w * 0.4, h], [0, h]]; // L shape
    out.push({ name: 'small' + k, rings: [r.map(([x, y]) => [x + x0, y + y0])] });
  }
  return out;
}

// ------------------------------------------------------------------ wasm
const glue = fs.readFileSync(path.join(CLIENT, 'lib', 'corvo.js'), 'utf8');
const ctx = { console, TextEncoder, TextDecoder, WebAssembly, performance, BigInt, Error, Symbol, Object, Array,
  Uint8Array, Float32Array, Int32Array, BigInt64Array, DataView, Math, Number, String, JSON, Function, Promise,
  queueMicrotask, setTimeout, Date, crypto: globalThis.crypto };
ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
const wb = vm.runInContext(glue + ';wasm_bindgen;', ctx);

function nestRun(pieces) {
  const instance = G.buildInstance(pieces, ROLL_MM * MM, G.rotationsFor(ROT));
  let best = null;
  wb.nest(JSON.stringify(instance), SECS * 0.8, SECS * 0.2, BigInt(+(process.env.SEED || 7)), GAP, (json) => {
    const r = JSON.parse(json); if (!best || r.strip_width <= best.strip_width) best = r;
  });
  return best;
}

// ------------------------------------------------------------------ checks
const P = (ring) => ring.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
function clip(type, a, b, fa, fb) {
  const c = new CL.Clipper(), out = new CL.Paths();
  c.AddPaths(a, CL.PolyType.ptSubject, true); c.AddPaths(b, CL.PolyType.ptClip, true);
  c.Execute(type, out, fa, fb); return out;
}
const areaOf = (paths) => Math.abs(paths.reduce((s, p) => s + CL.Clipper.Area(p), 0)) / (S * S);
function filled(rings) { // even-odd artwork as a clean nonzero set
  const c = new CL.Clipper(), out = new CL.Paths();
  c.AddPaths(rings.map(P), CL.PolyType.ptSubject, true);
  c.Execute(CL.ClipType.ctUnion, out, CL.PolyFillType.pftEvenOdd, CL.PolyFillType.pftEvenOdd); return out;
}
function grow(paths, d) {
  const co = new CL.ClipperOffset(2, 0.05 * S), out = new CL.Paths();
  co.AddPaths(paths, CL.JoinType.jtRound, CL.EndType.etClosedPolygon); co.Execute(out, d * S); return out;
}
const NZ = CL.PolyFillType.pftNonZero;

async function runSet(label, items) {
  items.forEach((it, k) => { it.i = k; });
  console.log(`\n== ${label}: ${items.length} pieces`);
  const pieces = G.buildPieces(items, { gap: GAP, flatness: 0.5 });
  const bad = pieces.filter((p) => p.error); if (bad.length) fail('pieces with errors ' + bad.map((b) => b.name));
  const plan = H.planHoles(items, pieces, { gap: GAP, orientations: G.rotationsFor(ROT) });
  console.log(`  pre-pass: ${plan.regions} free regions, ${plan.children.length} pieces in ${plan.usedRegions} holes, ` +
    `${plan.emptyRegions} empty, ${plan.ms.toFixed(0)} ms, ${plan.calls} fits ${plan.feasMs.toFixed(0)} ms${plan.timedOut ? ' (TIMED OUT)' : ''}`);
  if (plan.ms > 2000) fail('pre-pass slower than 2 s');

  const off = nestRun(pieces);
  const onPieces = H.nestPieces(pieces, plan);
  const on = nestRun(onPieces);
  if (off.placements.length !== pieces.length) fail(`OFF placed ${off.placements.length}/${pieces.length}`);
  if (on.placements.length !== onPieces.length) fail(`ON placed ${on.placements.length}/${onPieces.length}`);

  // final moves of the ON layout, children included
  const byId = Object.fromEntries(pieces.map((p) => [p.id, p]));
  const moves = H.movesFor(on.placements, onPieces, [0, 0], plan);
  if (new Set(moves.map((m) => m.i)).size !== pieces.length) fail('duplicate / missing move indices');
  if (moves.length !== pieces.length) fail(`moves ${moves.length}/${pieces.length}`);
  const art = {};
  for (const mv of moves) art[mv.i] = filled(items[mv.i].rings.map((r) => G.applyMove(r, mv)));
  // inside the roll
  const Hpt = ROLL_MM * MM;
  for (const mv of moves) {
    const b = G.bbox([].concat(...items[mv.i].rings.map((r) => G.applyMove(r, mv))));
    if (b[0] < -0.6 || b[1] < -0.6 || b[2] > on.strip_width + 0.6 || b[3] > Hpt + 0.6) fail(`${items[mv.i].name} outside the roll`);
  }
  // no overlaps between any two artworks (even-odd: a child in a counter is NOT an overlap)
  let overlaps = 0; const ids = Object.keys(art);
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    const ov = areaOf(clip(CL.ClipType.ctIntersection, art[ids[a]], art[ids[b]], NZ, NZ));
    if (ov > 1) { overlaps++; console.log(`  overlap ${items[ids[a]].name} x ${items[ids[b]].name}: ${ov.toFixed(2)} pt2`); }
  }
  if (overlaps) fail(overlaps + ' overlapping pairs');
  // children: inside the parent's outer contour, clearance >= gap from the parent artwork and from other children
  let minClear = Infinity;
  const clearance = (A, B) => { // largest d in a coarse ladder with grow(A, d) not touching B
    let d = 0; for (const s of [GAP - 0.05 * MM, GAP, GAP * 1.5, GAP * 3]) { if (areaOf(clip(CL.ClipType.ctIntersection, grow(A, s), B, NZ, NZ)) < 0.01) d = s; else break; }
    return d; };
  for (const c of plan.children) {
    const parent = art[c.parent], child = art[c.id];
    const sil = (() => { const cc = new CL.Clipper(), out = new CL.Paths(); cc.AddPaths(parent, CL.PolyType.ptSubject, true);
      cc.Execute(CL.ClipType.ctUnion, out, NZ, NZ); return out.filter((p) => CL.Clipper.Orientation(p)); })();
    const outside = areaOf(clip(CL.ClipType.ctDifference, child, sil, NZ, NZ));
    if (outside > 0.5 && !/hull|closed/.test(byId[c.parent].method)) fail(`${items[c.id].name} not inside ${items[c.parent].name} (${outside.toFixed(2)} pt2 out)`);
    const cl = clearance(child, parent);
    minClear = Math.min(minClear, cl);
    if (cl < GAP - 0.05 * MM) fail(`${items[c.id].name} in ${items[c.parent].name}: clearance < gap`);
    for (const d of plan.children) if (d.parent === c.parent && d.id > c.id && clearance(child, art[d.id]) < GAP - 0.05 * MM)
      fail(`${items[c.id].name} x ${items[d.id].name}: clearance < gap`);
  }
  const Loff = off.strip_width / MM, Lon = on.strip_width / MM;
  const saving = (1 - Lon / Loff) * 100;
  console.log(`  children: ${plan.children.map((c) => items[c.id].name + '->' + items[c.parent].name).join(', ') || '-'}`);
  if (plan.children.length) console.log(`  min clearance child/parent >= ${(minClear / MM).toFixed(2)} mm (gap ${(GAP / MM).toFixed(1)} mm)`);
  console.log(`  length holes OFF ${Loff.toFixed(1)} mm, ON ${Lon.toFixed(1)} mm -> saving ${saving.toFixed(1)}% (roll ${ROLL_MM} mm, ${SECS}s each)`);
  return { label, n: items.length, children: plan.children.length, ms: plan.ms, Loff, Lon, saving };
}

(async () => {
  await wb({ module_or_path: new Uint8Array(fs.readFileSync(path.join(CLIENT, 'lib', 'corvo_bg.wasm'))) });
  const results = [];
  const bebasFile = path.join(REAL, 'BebasNeue_channel_letters_OARBDQ890.svg');
  if (!fs.existsSync(bebasFile)) { console.log('real files not found in ' + REAL); process.exit(1); }
  const bebas = Object.fromEntries(svgPieces(bebasFile).map((p) => [p.name.replace('glyph-', ''), p.rings]));

  // unit check of the transform composition
  {
    const plan = { children: [{ id: 1, parent: 0, a: 90, tx: 10, ty: 5 }] };
    const mv = H.expandMoves([{ i: 0, a: 180, tx: 100, ty: 50 }], plan)[1];
    const p = [3, 4], rel = G.applyMove([p], { a: 90, tx: 10, ty: 5 })[0], exp = G.applyMove([rel], { a: 180, tx: 100, ty: 50 })[0];
    const got = G.applyMove([p], mv)[0];
    if (Math.hypot(got[0] - exp[0], got[1] - exp[1]) > 1e-9 || mv.a !== 270) fail('expandMoves composition'); else console.log('expandMoves composition: ok');
  }

  // 0. merge with module 1: pieces are CLUSTERS (cluster.planPieces) with ring groups rg, degenerate pieces are
  //    dropped and the rest renumbered (hostI). A print drawn over its background (two overlapping objects, one
  //    piece) must NOT open a false hole; the letter O counter must still take children; moves must address the
  //    plan index (hostI); expandPlacements (report) must agree with movesFor.
  {
    const box = (rs) => { const b = G.bbox([].concat(...rs)); return [b[0], b[3], b[2], b[1]]; };
    const sq = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const exp = [];
    const add = (name, rings, rg) => exp.push({ i: exp.length, name, type: 'PathItem', layer: 'Art', rings, rg: rg || rings.map(() => 0), box: box(rings) });
    add('O', place(bebas.O, 300, 0, 0));
    add('background', [sq(1000, 0, 300, 300)]);
    add('print', [sq(1050, 50, 200, 200)]);                     // on top of the background: merged, no hole
    add('speck', [sq(2000, 0, 0.3, 0.3)]);                       // degenerate -> dropped, renumbering
    smallPieces(8, 5).forEach((it, k) => add('s' + k, it.rings.map((r) => r.map((q) => [q[0] + 3000, q[1]]))));
    const plan = CLU.planPieces(exp, { merge: true, shape: 'all', artboards: [] });
    const bgPlan = plan.pieces.find((x) => x.members.indexOf(1) >= 0);
    if (!bgPlan || bgPlan.members.indexOf(2) < 0) fail('module 1: background+print not merged');
    let pcs = G.buildPieces(plan.pieces, { gap: GAP, flatness: 0.5 });
    const nBad = pcs.filter((x) => x.error).length;
    pcs = pcs.filter((x) => !x.error); pcs.forEach((x, k) => { x.hostI = x.id; x.id = k; });
    const hp = H.planHoles(plan.pieces, pcs, { gap: GAP, orientations: G.rotationsFor(ROT) });
    const oPiece = pcs.find((x) => plan.pieces[x.hostI].members[0] === 0);
    const bgPiece = pcs.find((x) => x.hostI === bgPlan.i);
    const inBg = hp.children.filter((c) => c.parent === bgPiece.id).length, inO = hp.children.filter((c) => c.parent === oPiece.id).length;
    console.log(`\n== module 1 clusters: ${plan.pieces.length} plan pieces, ${nBad} degenerate, ${hp.children.length} in holes (O ${inO}, background+print ${inBg})`);
    if (nBad !== 1) fail('module 1: speck should be the only degenerate piece (' + nBad + ')');
    if (inBg) fail('module 1: children placed on the printed background (false hole from even-odd across objects)');
    if (!inO) fail('module 1: no child in the O counter');
    if (hp.children.some((c) => c.hostI !== pcs[c.id].hostI)) fail('module 1: child hostI');
    const np = H.nestPieces(pcs, hp);
    const run = nestRun(np);
    const mv = H.movesFor(run.placements, np, [0, 0], hp);
    const idx = mv.map((m) => m.i).sort((a, b) => a - b), want = pcs.map((x) => x.hostI).sort((a, b) => a - b);
    if (JSON.stringify(idx) !== JSON.stringify(want)) fail('module 1: move indices ' + idx + ' != plan indices ' + want);
    const byHost = Object.fromEntries(mv.map((m) => [m.i, m]));
    const pls = H.expandPlacements(run.placements, np, hp, pcs);
    if (pls.length !== pcs.length) fail('module 1: expandPlacements count ' + pls.length);
    let worst = 0;
    for (const pl of pls) {
      const pc = pcs[pl.item_id], m = byHost[pc.hostI];
      const a = G.applyMove(pc.polygon.map((q) => [q[0] + pc.ref[0], q[1] + pc.ref[1]]), m);   // doc polygon moved
      const r = pl.rotation * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
      const b = pc.polygon.map((q) => [c * q[0] - sn * q[1] + pl.translation[0], sn * q[0] + c * q[1] + pl.translation[1]]);
      for (let k = 0; k < a.length; k++) worst = Math.max(worst, Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]));
    }
    if (!(worst < 1e-6)) fail('module 1: expandPlacements vs movesFor ' + worst);
    console.log(`  moves on plan indices ok, expandPlacements = movesFor (max ${worst.toExponential(1)} pt)`);
  }

  // 1. letters O A R B D 8 at 300 pt + 20 small pieces
  {
    const items = ['O', 'A', 'R', 'B', 'D', '8'].map((ch, k) => ({ name: ch, rings: place(bebas[ch], 300, 2000 + k * 200, -1000) }));
    results.push(await runSet('letters OARBD8 300pt + 20 small', items.concat(smallPieces(20, 11))));
  }
  // 1b. same letters, heavier pool (40 pieces, 1.5x): the small parts are a real share of the job
  {
    const items = ['O', 'A', 'R', 'B', 'D', '8'].map((ch, k) => ({ name: ch, rings: place(bebas[ch], 300, 2000 + k * 200, -1000) }));
    results.push(await runSet('letters OARBD8 300pt + 40 pieces x1.5', items.concat(smallPieces(40, 13, 1.5))));
  }
  // 2. real: all 9 Bebas channel letters (O A R B D Q 8 9 0) at 300 pt + 20 small
  {
    const items = Object.keys(bebas).map((ch, k) => ({ name: ch, rings: place(bebas[ch], 300, 2000 + k * 200, -1000) }));
    results.push(await runSet('real Bebas channel letters (9) + 20 small', items.concat(smallPieces(20, 23))));
  }
  // 3. real: rings / washer / frame / roundel (sizes of real signs & gaskets) + 20 small + 6 small Bebas letters at 60 pt
  {
    const one = (f) => svgPieces(path.join(REAL, f))[0].rings;
    const items = [
      { name: 'roundel 160mm', rings: place(one('Roundel_argent_ring_wikimedia.svg'), 160 * MM, 0, 0, true) },
      { name: 'ring-badge 140mm', rings: place(one('mdi_record-circle-outline.svg'), 140 * MM, 600, 0, true) },
      { name: 'washer 120mm', rings: place(one('mdi_circle-double.svg'), 120 * MM, 1200, 0, true) },
      { name: 'frame 150mm', rings: place(one('mdi_square-outline_frame.svg'), 150 * MM, 1800, 0, true) }
    ];
    ['O', 'A', 'R', 'B', 'D', '8'].forEach((ch, k) => items.push({ name: 'small ' + ch, rings: place(bebas[ch], 60, 2600 + k * 60, 0) }));
    results.push(await runSet('real rings/washer/frame/roundel + 26 small', items.concat(smallPieces(20, 37))));
  }
  // 3b. same parents, heavier pool: 40 pieces twice as big (typical sign/kit leftovers: logos, small letters)
  {
    const one = (f) => svgPieces(path.join(REAL, f))[0].rings;
    const items = [
      { name: 'roundel 160mm', rings: place(one('Roundel_argent_ring_wikimedia.svg'), 160 * MM, 0, 0, true) },
      { name: 'ring-badge 140mm', rings: place(one('mdi_record-circle-outline.svg'), 140 * MM, 600, 0, true) },
      { name: 'washer 120mm', rings: place(one('mdi_circle-double.svg'), 120 * MM, 1200, 0, true) },
      { name: 'frame 150mm', rings: place(one('mdi_square-outline_frame.svg'), 150 * MM, 1800, 0, true) }
    ];
    results.push(await runSet('real rings/washer/frame/roundel + 40 pieces x2', items.concat(smallPieces(40, 41, 2))));
  }
  // 4. regression: nothing fits (only big pieces) -> no children, same length
  {
    const items = ['O', 'A', 'R'].map((ch, k) => ({ name: ch, rings: place(bebas[ch], 300, k * 200, 0) }));
    const r = await runSet('negative: letters only, nothing fits', items);
    if (r.children) fail('children found where nothing should fit');
    results.push(r);
  }

  console.log('\nsummary:');
  for (const r of results) console.log(`  ${r.label}: ${r.children} in holes, pre-pass ${r.ms.toFixed(0)} ms, OFF ${r.Loff.toFixed(0)} mm, ON ${r.Lon.toFixed(0)} mm, saving ${r.saving.toFixed(1)}%`);
  console.log(failures ? `FAIL (${failures})` : 'PASS');
})().catch((e) => { fail(String(e && e.stack || e)); });
