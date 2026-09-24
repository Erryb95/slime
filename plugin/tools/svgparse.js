// Test helper (Node only): minimal SVG reader for the module 4/7 tests. Paths (incl. arcs, curves), rect, circle,
// ellipse, polygon, polyline; <g>/<svg> transform stack; fill/stroke from attributes or style, inherited from <g>;
// content of <defs>, <clipPath>, <mask>, <symbol> skipped; <use> and <text> ignored (counted in `skipped`).
// The path tokenizer/flattener is the one of test_holes.js (module 2).
'use strict';
const fs = require('fs');
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
const NAMED = { white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0] };
function parseColor(s) {
  if (!s) return undefined;
  s = s.trim().toLowerCase();
  if (s === 'none' || s === 'transparent') return null;
  let m;
  if ((m = s.match(/^#([0-9a-f]{3})$/))) return m[1].split('').map((h) => parseInt(h + h, 16));
  if ((m = s.match(/^#([0-9a-f]{6})$/))) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
  if ((m = s.match(/^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/))) return [+m[1], +m[2], +m[3]];
  if (NAMED[s]) return NAMED[s];
  return undefined;                                   // url(#gradient) etc.: unknown -> inherited
}
function attr(attrs, name) {
  const m = attrs.match(new RegExp('(?:^|\\s)' + name + '="([^"]*)"'));
  const st = (attrs.match(/\sstyle="([^"]*)"/) || [])[1] || '';
  const sm = st.match(new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)'));
  return sm ? sm[1].trim() : (m ? m[1] : undefined);
}
function shapeRings(tag, attrs) {
  const n = (k, d = 0) => { const v = attr(attrs, k); return v === undefined ? d : parseFloat(v); };
  if (tag === 'path') { const d = attr(attrs, 'd'); return d ? pathRings(d) : []; }
  if (tag === 'rect') { const x = n('x'), y = n('y'), w = n('width'), h = n('height'); return w > 0 && h > 0 ? [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]] : []; }
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry'), r = [];
    for (let k = 0; k < 64; k++) r.push([cx + rx * Math.cos(k * Math.PI / 32), cy + ry * Math.sin(k * Math.PI / 32)]);
    return rx > 0 && ry > 0 ? [r] : [];
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const v = (attr(attrs, 'points') || '').split(/[\s,]+/).filter(Boolean).map(Number), r = [];
    for (let k = 0; k + 1 < v.length; k += 2) r.push([v[k], v[k + 1]]);
    return r.length >= 3 ? [r] : [];
  }
  return [];
}
function bboxArea(r) { const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); }
function signedArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; }

/* file -> {shapes:[{tag, id, rings (svg units, transformed), fill:[r,g,b]|null, stroke, groupIds:[...ancestors]}], skipped} */
function readSvg(file) {
  const src = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const re = /<(\/?)([a-zA-Z:]+)\b([^>]*?)(\/?)>/g;
  const stack = [{ m: [1, 0, 0, 1, 0, 0], fill: [0, 0, 0], stroke: null, skip: false, id: null, tag: 'root' }];
  const shapes = []; let skipped = 0, m;
  while ((m = re.exec(src))) {
    const close = !!m[1], tag = m[2], attrs = ' ' + m[3], selfClose = !!m[4], top = stack[stack.length - 1];
    if (close) { if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop(); continue; }
    const container = /^(svg|g|defs|clipPath|mask|symbol|a|switch|pattern|linearGradient|radialGradient|marker)$/.test(tag);
    const f = parseColor(attr(attrs, 'fill')), s = parseColor(attr(attrs, 'stroke'));
    const ctx = { m: mul(top.m, parseTransform(attr(attrs, 'transform'))), fill: f === undefined ? top.fill : f,
      stroke: s === undefined ? top.stroke : s, skip: top.skip || /^(defs|clipPath|mask|symbol|pattern|marker|linearGradient|radialGradient)$/.test(tag),
      id: attr(attrs, 'id') || null, tag };
    if (container) { if (!selfClose) stack.push(ctx); continue; }
    if (ctx.skip) continue;
    if (tag === 'use' || tag === 'text') { skipped++; if (!selfClose && tag === 'text') { /* its content is plain text */ } continue; }
    const rings = shapeRings(tag, attrs).map((r) => r.map(([x, y]) => [ctx.m[0] * x + ctx.m[2] * y + ctx.m[4], ctx.m[1] * x + ctx.m[3] * y + ctx.m[5]]))
      .filter((r) => r.length >= 3 && bboxArea(r) > 1e-9);
    if (!rings.length) continue;
    shapes.push({ tag, id: ctx.id, rings, fill: ctx.fill, stroke: ctx.stroke, groupIds: stack.slice(1).map((c) => c.id).filter(Boolean) });
  }
  return { shapes, skipped };
}
module.exports = { readSvg, pathRings, parseTransform, parseColor, signedArea };
