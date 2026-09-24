/* Corvo — Modulo 4: nesting per colore / livello. Pure functions, no DOM.
 * Browser: window.CorvoColorGroups (needs window.CorvoCluster for planGroups). Node: module.exports.
 *
 * Input: the objects of corvoExport (module 1 format) with, when grouping by colour, `paint`:
 *   paint = [{c: colour, a: area pt²}, ...]   (host corvo_m4_paint: fills of the visible paths, cut spots excluded;
 *                                               stroke colours only when the object has no fill at all)
 *   colour = {t:'spot', name, tint?, base?} | {t:'rgb', v:[r,g,b] 0-255} | {t:'cmyk', v:[c,m,y,k] 0-100}
 *          | {t:'gray', v: 0-100 (ink %)} | {t:'lab', v:[L,a,b]}
 * Grouping:
 *   by 'color': spot colours by NAME (case/space-insensitive, tint ignored: one vinyl per spot), process colours
 *               clustered with CIE76 ΔE <= tol (default 8) around the colour with the largest area;
 *               an object takes the colour with the largest area among its paths (mixed objects are counted).
 *   by 'layer': the object's layer name.
 *   objects without a colour (no fill, no stroke, raster only) -> group 'none'.
 * planGroups runs cluster.planPieces SEPARATELY per group (module 1 merge never glues two colours together: a flag
 * made of overlapping coloured rectangles stays one piece per colour) and concatenates the pieces (piece.i
 * renumbered 0..n-1 = index for corvoGroup/corvoApply, members = export indices as usual).
 */
(function (root, factory) {
  var api = factory();
  if (root) root.CorvoColorGroups = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
  'use strict';

  var DEFAULT_TOL = 8;               // ΔE76: "same vinyl" (two sources of the same yellow), distinct hues stay apart

  // ---------------------------------------------------------------- colour spaces
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  /* approximate sRGB 0..255 of a colour descriptor (CMYK naive, enough to compare and to name it) */
  function toRGB(c) {
    if (!c) return null;
    var v = c.v;
    switch (c.t) {
      case 'rgb': return [+v[0] || 0, +v[1] || 0, +v[2] || 0];
      case 'cmyk': {
        var C = clamp01(v[0] / 100), M = clamp01(v[1] / 100), Y = clamp01(v[2] / 100), K = clamp01(v[3] / 100);
        return [255 * (1 - C) * (1 - K), 255 * (1 - M) * (1 - K), 255 * (1 - Y) * (1 - K)];
      }
      case 'gray': { var g = 255 * (1 - clamp01((+v || 0) / 100)); return [g, g, g]; }
      case 'lab': return labToRGB(v);
      case 'spot': {
        var base = c.base ? toRGB(c.base) : null;
        if (!base) return null;
        var t = c.tint === undefined ? 1 : clamp01(c.tint / 100);
        return [255 - (255 - base[0]) * t, 255 - (255 - base[1]) * t, 255 - (255 - base[2]) * t];
      }
    }
    return null;
  }
  function lin(u) { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }
  function unlin(u) { u = u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055; return Math.round(clamp01(u) * 255); }
  var WX = 0.95047, WY = 1, WZ = 1.08883;
  function rgbToLab(rgb) {
    var r = lin(rgb[0]), g = lin(rgb[1]), b = lin(rgb[2]);
    var x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / WX, y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / WY,
      z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / WZ;
    var f = function (t) { return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116; };
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function labToRGB(v) {
    var fy = (v[0] + 16) / 116, fx = fy + v[1] / 500, fz = fy - v[2] / 200;
    var inv = function (t) { return t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27); };
    var x = inv(fx) * WX, y = inv(fy) * WY, z = inv(fz) * WZ;
    return [unlin(3.2406 * x - 1.5372 * y - 0.4986 * z), unlin(-0.9689 * x + 1.8758 * y + 0.0415 * z), unlin(0.0557 * x - 0.2040 * y + 1.0570 * z)];
  }
  function toLab(c) { var rgb = toRGB(c); return rgb ? rgbToLab(rgb) : null; }
  function deltaE(a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2])); }
  function hex(rgb) {
    return '#' + rgb.map(function (u) { var s = Math.round(Math.max(0, Math.min(255, u))).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; }).join('');
  }

  // ---------------------------------------------------------------- names / keys
  function spotKey(name) { return String(name || '').toLowerCase().replace(/[\s_\-.]+/g, ''); }
  /* human label of a colour: spot name, CMYK values, or #RRGGBB */
  function label(c) {
    if (!c) return '';
    if (c.t === 'spot') return String(c.name);
    if (c.t === 'cmyk') return 'C' + Math.round(c.v[0]) + ' M' + Math.round(c.v[1]) + ' Y' + Math.round(c.v[2]) + ' K' + Math.round(c.v[3]);
    if (c.t === 'gray') return 'K' + Math.round(+c.v || 0);
    var rgb = toRGB(c);
    return rgb ? hex(rgb) : '?';
  }
  /* exact identity of a colour (for summing the area of the same colour inside one object) */
  function exactKey(c) {
    if (!c) return 'none';
    if (c.t === 'spot') return 'spot:' + spotKey(c.name);
    var v = Array.isArray(c.v) ? c.v : [c.v];
    return c.t + ':' + v.map(function (u) { return Math.round((+u || 0) * 10) / 10; }).join(',');
  }

  /* dominant colour of an object: {color, area, mixed} (mixed = a second colour covers >= 10 % of the painted area) */
  function itemColor(item) {
    var paint = (item && item.paint) || [], sum = {}, col = {}, tot = 0;
    paint.forEach(function (p) {
      if (!p || !p.c || p.c.t === 'none' || p.c.t === 'other') return;
      var k = exactKey(p.c), a = Math.max(+p.a || 0, 1e-6);
      sum[k] = (sum[k] || 0) + a; col[k] = p.c; tot += a;
    });
    var keys = Object.keys(sum).sort(function (x, y) { return sum[y] - sum[x]; });
    if (!keys.length) return { color: null, area: 0, mixed: false };
    return { color: col[keys[0]], area: sum[keys[0]], mixed: keys.length > 1 && sum[keys[1]] >= 0.1 * tot };
  }

  /* objects -> groups [{key, label, color, items:[...objects]}] in a stable order (largest total area first,
   * 'none' last). opts: {by:'color'|'layer', tol} */
  function groupItems(items, opts) {
    opts = opts || {};
    var by = opts.by === 'layer' ? 'layer' : 'color', tol = opts.tol > 0 ? +opts.tol : DEFAULT_TOL;
    var groups = [], byKey = {}, mixed = [];
    function area(it) {
      var b = it.box || it.bounds;
      return b ? Math.abs((b[2] - b[0]) * (b[1] - b[3])) : 0;
    }
    function put(key, lab, color, it, a) {
      var g = byKey[key];
      if (!g) { g = byKey[key] = { key: key, label: lab, color: color, items: [], area: 0 }; groups.push(g); }
      g.items.push(it); g.area += a;
      return g;
    }
    if (by === 'layer') {
      items.forEach(function (it) {
        var ln = it.layer === undefined || it.layer === null || it.layer === '' ? null : String(it.layer);
        put(ln === null ? 'none' : 'layer:' + ln, ln === null ? '' : ln, null, it, area(it));
      });
    } else {
      // process colours: clusters seeded by the largest painted areas first (stable representatives)
      var info = items.map(function (it) { var ic = itemColor(it); if (ic.mixed) mixed.push(it.name || ('#' + it.i)); return { it: it, ic: ic }; });
      var order = info.slice().sort(function (a, b) { return b.ic.area - a.ic.area; });
      var proc = [];                                      // [{lab, group}]
      order.forEach(function (x) {
        var c = x.ic.color, a = area(x.it) || x.ic.area;
        if (!c) { put('none', '', null, x.it, a); return; }
        if (c.t === 'spot') { put('spot:' + spotKey(c.name), label(c), c, x.it, a); return; }
        var lab = toLab(c);
        if (!lab) { put('none', '', null, x.it, a); return; }
        var best = null, bd = Infinity;
        proc.forEach(function (p) { var d = deltaE(p.lab, lab); if (d < bd) { bd = d; best = p; } });
        if (best && bd <= tol) { put(best.key, best.g.label, best.g.color, x.it, a); return; }
        var key = 'proc:' + proc.length;
        var g = put(key, label(c), c, x.it, a);
        proc.push({ key: key, lab: lab, g: g });
      });
      // keep the export order inside each group
      groups.forEach(function (g) { g.items.sort(function (a, b) { return a.i - b.i; }); });
    }
    groups.sort(function (a, b) { return (a.key === 'none') - (b.key === 'none') || b.area - a.area; });
    groups.forEach(function (g) { var rgb = g.color ? toRGB(g.color) : null; g.hex = rgb ? hex(rgb) : null; });
    return { groups: groups, mixed: mixed };
  }

  /* cluster.planPieces per group, pieces concatenated. Returns the planPieces result shape + groups:
   * {pieces, excluded, warnings (summed), error?, groups:[{key,label,color,hex,pieces:[piece index]}], mixed} */
  function planGroups(items, gopts, planOpts, CL) {
    CL = CL || (typeof window !== 'undefined' && window.CorvoCluster);
    var gi = groupItems(items, gopts);
    var out = { pieces: [], excluded: [], groups: [], mixed: gi.mixed, warnings: null, error: null };
    gi.groups.forEach(function (g) {
      var pl = CL.planPieces(g.items, planOpts);
      out.excluded = out.excluded.concat(pl.excluded || []);
      if (pl.error && !out.error) out.error = pl.error;
      out.warnings = sumWarnings(out.warnings, pl.warnings);
      var idx = [];
      pl.pieces.forEach(function (p) {
        p.i = out.pieces.length;
        p.group = g.key;
        idx.push(p.i);
        out.pieces.push(p);
      });
      if (idx.length) out.groups.push({ key: g.key, label: g.label, color: g.color, hex: g.hex, pieces: idx });
    });
    if (!out.warnings) out.warnings = CL.planPieces([], planOpts).warnings;
    return out;
  }
  function sumWarnings(a, b) {
    if (!a) return JSON.parse(JSON.stringify(b));
    ['regMarks', 'sheetFrames', 'cutFallback', 'noContour', 'nonVector'].forEach(function (k) { a[k] = (a[k] || 0) + (b[k] || 0); });
    a.sheetFrameNames = (a.sheetFrameNames || []).concat(b.sheetFrameNames || []);
    a.noContourNames = (a.noContourNames || []).concat(b.noContourNames || []);
    a.merged = { objects: a.merged.objects + b.merged.objects, pieces: a.merged.pieces + b.merged.pieces };
    if (!a.lockedFrames && b.lockedFrames) a.lockedFrames = b.lockedFrames;
    return a;
  }

  return { DEFAULT_TOL: DEFAULT_TOL, toRGB: toRGB, toLab: toLab, rgbToLab: rgbToLab, deltaE: deltaE, hex: hex,
    label: label, exactKey: exactKey, itemColor: itemColor, groupItems: groupItems, planGroups: planGroups };
});
