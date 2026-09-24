// LightBurn .lbrn2 (XML) -> SVG in mm, for the real forum cases (bench/real/cases/forum). Node only, no dependencies.
// Shapes: Path (VertList + PrimList, shared by VertID/PrimID), Rect (W,H,Cr), Ellipse (Rx,Ry), Group (XForm composed).
// Vertex "V x y c0x.. c0y.. c1x.. c1y..": c0 = handle leaving the vertex, c1 = handle arriving; "c0x1" = no handle.
// Prims: "B a b" cubic a -> b (a.c0, b.c1), "L a b" line; "LineClosed"/"LineOpen" = all lines.
// One <g> per cut layer (CutSetting name). LightBurn is y-up in mm: the SVG flips y inside a viewBox in mm.
// uso: node lbrn2svg.js in.lbrn2 out.svg
'use strict';
const fs = require('fs');
const [IN, OUT] = process.argv.slice(2);
const xml = fs.readFileSync(IN, 'utf8');
const names = {};
for (const m of xml.matchAll(/<CutSetting[^>]*>([\s\S]*?)<\/CutSetting>/g)) {
  const idx = /<index Value="(\d+)"/.exec(m[1]), nm = /<name Value="([^"]*)"/.exec(m[1]);
  if (idx) names[idx[1]] = nm ? nm[1] : 'C' + idx[1];
}
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const ap = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const vertsById = {}, primsById = {};
function parseVerts(s) {
  const out = [];
  for (const v of s.split('V').filter(x => x.trim())) {
    const m = /^\s*([-\d.eE+]+)\s+([-\d.eE+]+)(.*)$/.exec(v);
    const p = { x: +m[1], y: +m[2] }, rest = m[3];
    const g = (k) => { const r = new RegExp(k + '([-\\d.eE+]+)').exec(rest); return r ? +r[1] : null; };
    const c0x = g('c0x'), c0y = g('c0y'), c1x = g('c1x'), c1y = g('c1y');
    p.c0 = c0y !== null ? [c0x, c0y] : null; p.c1 = c1y !== null ? [c1x, c1y] : null;
    out.push(p);
  }
  return out;
}
function parsePrims(s, n) {
  s = s.trim();
  if (s === 'LineClosed' || s === 'LineOpen') { const o = []; for (let i = 0; i < n - 1; i++) o.push(['L', i, i + 1]); if (s === 'LineClosed') o.push(['L', n - 1, 0]); return o; }
  return [...s.matchAll(/([LB])\s*(\d+)\s+(\d+)/g)].map(m => [m[1], +m[2], +m[3]]);
}
const f = (v) => (+v.toFixed(5)).toString();
const layers = {}; let count = 0;
function emit(cut, d) { (layers[cut] = layers[cut] || []).push(d); count++; }
function shapeD(tag, attrs, body, M) {
  const type = /Type="(\w+)"/.exec(attrs)[1];
  const xfm = /<XForm>([^<]*)<\/XForm>/.exec(body);
  const X = mul(M, xfm ? xfm[1].trim().split(/\s+/).map(Number) : [1, 0, 0, 1, 0, 0]);
  if (type === 'Group') {
    const inner = /<Children>([\s\S]*)<\/Children>/.exec(body);
    if (inner) walk(inner[1], X);
    return;
  }
  const cut = (/CutIndex="(\d+)"/.exec(attrs) || [0, '0'])[1];
  if (type === 'Rect') {
    const W = +/W="([-\d.]+)"/.exec(attrs)[1], H = +/H="([-\d.]+)"/.exec(attrs)[1];
    const pts = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]].map(p => ap(X, p));
    emit(cut, 'M' + pts.map(p => f(p[0]) + ',' + f(p[1])).join(' L') + ' Z'); return;
  }
  if (type === 'Ellipse') {
    const rx = +/Rx="([-\d.]+)"/.exec(attrs)[1], ry = +/Ry="([-\d.]+)"/.exec(attrs)[1], k = 0.5522847498, P = [];
    const q = [[rx, 0], [rx, ry * k], [rx * k, ry], [0, ry], [-rx * k, ry], [-rx, ry * k], [-rx, 0], [-rx, -ry * k], [-rx * k, -ry], [0, -ry], [rx * k, -ry], [rx, -ry * k]].map(p => ap(X, p));
    let d = 'M' + f(q[0][0]) + ',' + f(q[0][1]);
    for (let i = 0; i < 4; i++) { const a = q[3 * i + 1], b = q[3 * i + 2], c = q[(3 * i + 3) % 12]; d += ` C${f(a[0])},${f(a[1])} ${f(b[0])},${f(b[1])} ${f(c[0])},${f(c[1])}`; }
    emit(cut, d + ' Z'); return;
  }
  if (type !== 'Path') { console.error('skipped shape type', type); return; }
  const vid = (/VertID="(\d+)"/.exec(attrs) || [])[1], pid = (/PrimID="(\d+)"/.exec(attrs) || [])[1];
  const vl = /<VertList>([\s\S]*?)<\/VertList>/.exec(body), pl = /<PrimList>([\s\S]*?)<\/PrimList>/.exec(body);
  const V = vl ? parseVerts(vl[1]) : vertsById[vid];
  if (vl && vid !== undefined) vertsById[vid] = V;
  let P = pl ? pl[1] : primsById[pid];
  if (pl && pid !== undefined) primsById[pid] = pl[1];
  if (!V || P === undefined) { console.error('missing verts/prims', vid, pid); return; }
  const prims = parsePrims(P, V.length);
  let d = '', cur = -1, start = -1;
  const T = (p) => ap(X, p);
  for (const [k, a, b] of prims) {
    if (a !== cur) { if (cur >= 0 && cur === start) d += ' Z'; const p = T([V[a].x, V[a].y]); d += (d ? ' ' : '') + 'M' + f(p[0]) + ',' + f(p[1]); start = a; }
    const pb = T([V[b].x, V[b].y]);
    if (k === 'B' && (V[a].c0 || V[b].c1)) {
      const c0 = T(V[a].c0 || [V[a].x, V[a].y]), c1 = T(V[b].c1 || [V[b].x, V[b].y]);
      d += ` C${f(c0[0])},${f(c0[1])} ${f(c1[0])},${f(c1[1])} ${f(pb[0])},${f(pb[1])}`;
    } else d += ` L${f(pb[0])},${f(pb[1])}`;
    cur = b;
    if (b === start) { d += ' Z'; cur = -1; }
  }
  emit(cut, d);
}
function walk(src, M) {
  // top-level <Shape ...> ... </Shape> blocks at this nesting level (groups contain nested shapes)
  let i = 0;
  while ((i = src.indexOf('<Shape', i)) >= 0) {
    const endTag = src.indexOf('>', i), attrs = src.slice(i, endTag + 1);
    if (attrs.endsWith('/>')) { shapeD('Shape', attrs, '', M); i = endTag + 1; continue; }
    let depth = 1, j = endTag + 1;
    while (depth > 0) {
      const o = src.indexOf('<Shape', j), c = src.indexOf('</Shape>', j);
      if (o >= 0 && o < c) { const e2 = src.indexOf('>', o); if (src[e2 - 1] !== '/') depth++; j = e2 + 1; } else { depth--; j = c + 8; }
    }
    shapeD('Shape', attrs, src.slice(endTag + 1, j - 8), M);
    i = j;
  }
}
walk(xml.replace(/<Thumbnail[^>]*\/>/, ''), [1, 0, 0, 1, 0, 0]);
// bounds from all numbers of the path data (control points included: conservative)
let l = 1e9, b = 1e9, r = -1e9, t = -1e9;
for (const ds of Object.values(layers)) for (const d of ds) for (const m of d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) { l = Math.min(l, +m[1]); r = Math.max(r, +m[1]); b = Math.min(b, +m[2]); t = Math.max(t, +m[2]); }
const pad = 5, W = r - l + 2 * pad, H = t - b + 2 * pad;
let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}">\n`;
svg += `<g transform="matrix(1 0 0 -1 ${f(pad - l)} ${f(t + pad)})">\n`;
for (const [cut, ds] of Object.entries(layers)) {
  svg += ` <g id="${(names[cut] || 'C' + cut).replace(/[^A-Za-z0-9_-]+/g, '_')}">\n`;
  for (const d of ds) svg += `  <path d="${d}" fill="none" stroke="#000" stroke-width="0.1"/>\n`;
  svg += ' </g>\n';
}
svg += '</g>\n</svg>\n';
fs.writeFileSync(OUT, svg);
console.log(`${IN}: ${count} shapes in ${Object.keys(layers).length} layers (${Object.keys(layers).map(k => names[k] || k).join(', ')}), ${(r - l).toFixed(2)} x ${(t - b).toFixed(2)} mm -> ${OUT}`);
