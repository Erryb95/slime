/* Corvo raster (MODULO 8, DTF gang sheet): transparent image -> real silhouette rings.
 *
 * Pure logic, no DOM. Works in the CEP panel (window.CorvoRaster; Node is enabled there, so the PNG is
 * read with fs and inflated with zlib) and in Node (module.exports) for tests.
 *
 * Pipeline (docs/plugin-architecture.md, "Modulo 8"):
 *   1. decodePNG: minimal PNG decoder (zlib inflate, filters 0-4, Adam7, bit depth 1-16, colour types
 *      0/2/3/4/6 + tRNS). Only the ALPHA channel is kept. Huge images are box-downsampled to maxPixels.
 *   2. alpha threshold (default 10 %) -> binary mask
 *   3. cleaning: "opening by reconstruction" = a connected component (8-conn) is kept whole if it survives a
 *      morphological opening of radius openPx AND has at least minSpeckPx pixels (drops dust/specks without
 *      thinning hairlines of real artwork); background holes smaller than minHolePx are filled.
 *   4. marching squares on the alpha field clamped to the cleaned mask (sub-pixel edges on anti-aliased
 *      art), saddles resolved as 8-connected foreground, loops linked by shared cell edges
 *   5. outer/hole classification by containment parity, light Laplacian smoothing (no staircase),
 *      Douglas-Peucker (simplifyPx)
 *   6. pixel -> document mapping with the image corners {tl, tr, bl} (document pt, y up): any affine
 *      placement (scale, rotation, mirror, shear) is supported
 *   7. optional outward offset (Clipper, jtRound) of the contour, in pt
 *
 * Output rings are the same format corvoExport produces ([[x,y],...] in document pt), so
 * geometry.buildPiece nests the piece by its real silhouette and corvoApply moves the image with it.
 * Modes: 'contour' (default, trim transparency + silhouette), 'bbox' (trimmed rectangle),
 * 'canvas' (whole image rectangle, what you get without trimming).
 */
(function (root, factory) {
  var clipper = (root && root.ClipperLib) || null;
  if (!clipper && typeof require === 'function' && typeof window === 'undefined') {
    try { clipper = require('../lib/clipper.js'); } catch (e) { /* resolved lazily */ }
  }
  var api = factory(clipper);
  if (root) root.CorvoRaster = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (ClipperLibInit) {
  'use strict';

  var MM = 72 / 25.4;
  var DEFAULTS = {
    mode: 'contour',        // 'contour' | 'bbox' | 'canvas'
    alphaThreshold: 0.10,   // fraction of full opacity
    openPx: 1,              // opening radius (px) used to recognise specks
    minSpeckFrac: 1e-5,     // components smaller than max(9, frac*W*H) px are dropped
    minHoleFrac: 1e-5,      // holes smaller than max(9, frac*W*H) px are filled
    smoothIter: 2,
    simplifyPx: 0.5,
    offset: 0,              // pt, outward offset of the contour (bleed / cut margin); spacing is Sparrow's gap
    maxPixels: 4e6,         // larger images are box-downsampled (keeps memory and time bounded)
    opaqueFrac: 1e-3        // < this fraction of transparent pixels = "no real transparency"
  };
  // DTF presets (FINDINGS-modulo7-8: 22" and 58 cm are distinct rolls, spacing >= 6 mm).
  // safetyMm: outward offset of the traced contour, because Sparrow's min separation measured on the
  // real contours can fall up to ~0.2 mm short of the gap (test_raster.js); with it spacing >= gap.
  var PRESETS = {
    dtf22: { label: 'DTF 22" (558.8 mm)', rollMm: 558.8, gapMm: 6, safetyMm: 0.2 },
    dtf58: { label: 'DTF 58 cm (580 mm)', rollMm: 580, gapMm: 6, safetyMm: 0.2 }
  };

  function lib() {
    var C = ClipperLibInit || (typeof window !== 'undefined' && window.ClipperLib) ||
            (typeof self !== 'undefined' && self.ClipperLib);
    if (!C) throw new Error('ClipperLib not loaded');
    return C;
  }
  function nodeRequire(name) {
    if (typeof require !== 'function') throw new Error('Node require() not available (' + name + ')');
    return require(name);
  }
  function rasterError(code, msg) { var e = new Error(msg); e.code = code; return e; }

  // ================================================================== PNG decoder
  function toU8(b) {
    if (b instanceof Uint8Array) return b;
    if (b && b.buffer instanceof ArrayBuffer) return new Uint8Array(b.buffer, b.byteOffset || 0, b.byteLength);
    return new Uint8Array(b);
  }
  function u32(u8, p) { return ((u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3]) >>> 0; }
  function inflate(u8, fn) {
    if (fn) return toU8(fn(u8));
    var z = nodeRequire('zlib');
    return toU8(z.inflateSync(typeof Buffer !== 'undefined' ? Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength) : u8));
  }
  function unfilter(ft, cur, prev, bpp) {
    var n = cur.length, i;
    switch (ft) {
      case 0: return;
      case 1: for (i = bpp; i < n; i++) cur[i] = (cur[i] + cur[i - bpp]) & 255; return;
      case 2: for (i = 0; i < n; i++) cur[i] = (cur[i] + prev[i]) & 255; return;
      case 3: for (i = 0; i < n; i++) cur[i] = (cur[i] + (((i >= bpp ? cur[i - bpp] : 0) + prev[i]) >> 1)) & 255; return;
      case 4:
        for (i = 0; i < n; i++) {
          var a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
          var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          cur[i] = (cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
        }
        return;
    }
    throw rasterError('badPng', 'PNG: unknown filter ' + ft);
  }
  var ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

  /** decodePNG(bytes[, inflateFn]) -> {width, height, alpha: Uint8Array(w*h), hasAlpha, colorType, bitDepth} */
  function decodePNG(bytes, inflateFn) {
    var u8 = toU8(bytes), SIG = [137, 80, 78, 71, 13, 10, 26, 10], i;
    for (i = 0; i < 8; i++) if (u8[i] !== SIG[i]) throw rasterError('notPng', 'Not a PNG file');
    var pos = 8, w = 0, h = 0, depth = 0, ct = -1, il = 0, trns = null, parts = [], total = 0;
    while (pos + 8 <= u8.length) {
      var len = u32(u8, pos), type = String.fromCharCode(u8[pos + 4], u8[pos + 5], u8[pos + 6], u8[pos + 7]);
      var data = u8.subarray(pos + 8, pos + 8 + len);
      if (type === 'IHDR') { w = u32(data, 0); h = u32(data, 4); depth = data[8]; ct = data[9]; il = data[12]; }
      else if (type === 'tRNS') trns = data;
      else if (type === 'IDAT') { parts.push(data); total += len; }
      else if (type === 'IEND') break;
      pos += 12 + len;
    }
    var CH = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
    if (!w || !h || !CH || [1, 2, 4, 8, 16].indexOf(depth) < 0) throw rasterError('badPng', 'PNG: unsupported header');
    var z = new Uint8Array(total), o = 0;
    for (i = 0; i < parts.length; i++) { z.set(parts[i], o); o += parts[i].length; }
    var raw = inflate(z, inflateFn);
    var bitsPP = CH * depth, bpp = Math.max(1, bitsPP >> 3), alpha = new Uint8Array(w * h);
    var maxV = (1 << depth) - 1;
    function sample(row, idx) {                 // full-precision sample
      if (depth === 8) return row[idx];
      if (depth === 16) return (row[idx * 2] << 8) | row[idx * 2 + 1];
      var bit = idx * depth;
      return (row[bit >> 3] >> (8 - depth - (bit & 7))) & maxV;
    }
    function to8(v) { return depth === 16 ? v >> 8 : depth === 8 ? v : Math.round(v * 255 / maxV); }
    var key = null;
    if (trns && ct === 0 && trns.length >= 2) key = [(trns[0] << 8) | trns[1]];
    if (trns && ct === 2 && trns.length >= 6) key = [(trns[0] << 8) | trns[1], (trns[2] << 8) | trns[3], (trns[4] << 8) | trns[5]];
    function alphaAt(row, x) {
      switch (ct) {
        case 6: return to8(sample(row, x * 4 + 3));
        case 4: return to8(sample(row, x * 2 + 1));
        case 3: { var k = sample(row, x); return trns && k < trns.length ? trns[k] : 255; }
        case 0: return key && sample(row, x) === key[0] ? 0 : 255;
        case 2: return key && sample(row, x * 3) === key[0] && sample(row, x * 3 + 1) === key[1] &&
                       sample(row, x * 3 + 2) === key[2] ? 0 : 255;
      }
      return 255;
    }
    var passes = il ? ADAM7 : [[0, 0, 1, 1]], off = 0;
    for (var ps = 0; ps < passes.length; ps++) {
      var xs = passes[ps][0], ys = passes[ps][1], dx = passes[ps][2], dy = passes[ps][3];
      var pw = Math.ceil((w - xs) / dx), ph = Math.ceil((h - ys) / dy);
      if (pw <= 0 || ph <= 0) continue;
      var stride = Math.ceil(pw * bitsPP / 8), prev = new Uint8Array(stride);
      for (var y = 0; y < ph; y++) {
        if (off + 1 + stride > raw.length) throw rasterError('badPng', 'PNG: truncated image data');
        var ft = raw[off], cur = raw.subarray(off + 1, off + 1 + stride);
        unfilter(ft, cur, prev, bpp);
        var base = (ys + y * dy) * w + xs;
        for (var x = 0; x < pw; x++) alpha[base + x * dx] = alphaAt(cur, x);
        prev = cur; off += 1 + stride;
      }
    }
    return { width: w, height: h, alpha: alpha, hasAlpha: ct === 4 || ct === 6 || !!trns,
             colorType: ct, bitDepth: depth, interlaced: !!il };
  }

  /** from a canvas ImageData (panel fallback when zlib is unavailable) */
  function fromImageData(img) {
    var n = img.width * img.height, a = new Uint8Array(n), t = 0;
    for (var i = 0; i < n; i++) { a[i] = img.data[i * 4 + 3]; if (a[i] < 255) t = 1; }
    return { width: img.width, height: img.height, alpha: a, hasAlpha: true, colorType: 6, bitDepth: 8, anyTransparent: !!t };
  }

  // box downsample by an integer factor f (average alpha: keeps sub-pixel edges)
  function downsample(img, maxPixels) {
    var W = img.width, H = img.height;
    if (W * H <= maxPixels) return { img: img, f: 1 };
    var f = Math.ceil(Math.sqrt(W * H / maxPixels)), w = Math.ceil(W / f), h = Math.ceil(H / f);
    var a = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var s = 0, c = 0;
      for (var yy = y * f; yy < Math.min(H, y * f + f); yy++)
        for (var xx = x * f; xx < Math.min(W, x * f + f); xx++) { s += img.alpha[yy * W + xx]; c++; }
      a[y * w + x] = Math.round(s / c);
    }
    return { img: { width: w, height: h, alpha: a, hasAlpha: img.hasAlpha }, f: f };
  }

  // ================================================================== mask cleaning
  // connected components of pixels where mask[p] === val; conn8 for foreground, 4 for background
  function label(mask, w, h, val, conn8) {
    var lab = new Int32Array(w * h).fill(-1), areas = [], border = [], stack = new Int32Array(w * h);
    for (var p0 = 0; p0 < w * h; p0++) {
      if (mask[p0] !== val || lab[p0] >= 0) continue;
      var id = areas.length, sp = 0, area = 0, touch = 0;
      stack[sp++] = p0; lab[p0] = id;
      while (sp) {
        var p = stack[--sp], x = p % w, y = (p - x) / w;
        area++;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touch = 1;
        for (var dy = -1; dy <= 1; dy++) {
          var ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (!conn8 && dx && dy) continue;
            var nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            var q = ny * w + nx;
            if (mask[q] === val && lab[q] < 0) { lab[q] = id; stack[sp++] = q; }
          }
        }
      }
      areas.push(area); border.push(touch);
    }
    return { lab: lab, areas: areas, border: border };
  }

  // erosion with a (2r+1)^2 square, separable; outside the image counts as background
  function erode(mask, w, h, r) {
    if (r <= 0) return mask.slice();
    var tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), x, y, zeros;
    for (y = 0; y < h; y++) {
      var row = y * w; zeros = 0;
      for (x = -r; x <= r; x++) if (x < 0 || x >= w || !mask[row + x]) zeros++;
      for (x = 0; x < w; x++) {
        tmp[row + x] = zeros ? 0 : 1;
        var outX = x - r, inX = x + r + 1;
        if (outX < 0 || !mask[row + outX]) zeros--;
        if (inX >= w || !mask[row + inX]) zeros++;
      }
    }
    for (x = 0; x < w; x++) {
      zeros = 0;
      for (y = -r; y <= r; y++) if (y < 0 || y >= h || !tmp[y * w + x]) zeros++;
      for (y = 0; y < h; y++) {
        out[y * w + x] = zeros ? 0 : 1;
        var outY = y - r, inY = y + r + 1;
        if (outY < 0 || !tmp[outY * w + x]) zeros--;
        if (inY >= h || !tmp[inY * w + x]) zeros++;
      }
    }
    return out;
  }

  function cleanMask(mask, w, h, o) {
    var n = w * h, minSpeck = Math.max(9, Math.round(o.minSpeckFrac * n)), minHole = Math.max(9, Math.round(o.minHoleFrac * n));
    var fg = label(mask, w, h, 1, true), er = erode(mask, w, h, o.openPx);
    var survive = new Uint8Array(fg.areas.length), p, k;
    for (p = 0; p < n; p++) if (er[p]) survive[fg.lab[p]] = 1;
    var keep = new Uint8Array(fg.areas.length), specks = 0;
    for (k = 0; k < keep.length; k++) { keep[k] = survive[k] && fg.areas[k] >= minSpeck ? 1 : 0; if (!keep[k]) specks++; }
    var out = new Uint8Array(n);
    for (p = 0; p < n; p++) out[p] = mask[p] && keep[fg.lab[p]] ? 1 : 0;
    var bg = label(out, w, h, 0, false), filled = 0, holes = 0;
    var fill = new Uint8Array(bg.areas.length);
    for (k = 0; k < fill.length; k++) {
      if (bg.border[k]) continue;
      if (bg.areas[k] < minHole) { fill[k] = 1; filled++; } else holes++;
    }
    if (filled) for (p = 0; p < n; p++) if (!out[p] && fill[bg.lab[p]]) out[p] = 1;
    return { mask: out, specksRemoved: specks, holesFilled: filled, holes: holes,
             components: keep.length - specks };
  }

  // ================================================================== marching squares
  function marchingSquares(field, PW, PH, iso) {
    var adj = new Map();
    function link(a, b) {
      var e = adj.get(a);
      if (!e) adj.set(a, [b]); else e.push(b);
    }
    function seg(a, b) { link(a, b); link(b, a); }
    for (var Y = 0; Y < PH - 1; Y++) {
      for (var X = 0; X < PW - 1; X++) {
        var i = Y * PW + X;
        var c = (field[i] >= iso ? 8 : 0) | (field[i + 1] >= iso ? 4 : 0) |
                (field[i + PW + 1] >= iso ? 2 : 0) | (field[i + PW] >= iso ? 1 : 0);
        if (c === 0 || c === 15) continue;
        var top = i * 2, bottom = (i + PW) * 2, left = i * 2 + 1, right = (i + 1) * 2 + 1;
        switch (c) {
          case 1: case 14: seg(left, bottom); break;
          case 2: case 13: seg(bottom, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(top, right); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, top); break;
          case 10: seg(top, right); seg(left, bottom); break;   // tl+br inside: 8-connected foreground
          case 5: seg(left, top); seg(bottom, right); break;    // tr+bl inside
        }
      }
    }
    function pt(e) {
      var cell = e >> 1, X = cell % PW, Y = (cell - X) / PW, v0 = field[cell], v1, t;
      if (e & 1) { v1 = field[cell + PW]; t = (iso - v0) / (v1 - v0); return [X - 0.5, Y + t - 0.5]; }
      v1 = field[cell + 1]; t = (iso - v0) / (v1 - v0); return [X + t - 0.5, Y - 0.5];
    }
    var seen = new Set(), loops = [];
    adj.forEach(function (nb, start) {
      if (seen.has(start)) return;
      var loop = [pt(start)], prev = start, cur = nb[0];
      seen.add(start);
      var guard = adj.size + 2;
      while (cur !== start && guard-- > 0) {
        seen.add(cur); loop.push(pt(cur));
        var n2 = adj.get(cur), nx = n2[0] === prev ? n2[1] : n2[0];
        prev = cur; cur = nx;
        if (cur === undefined) break;
      }
      if (loop.length >= 3) loops.push(loop);
    });
    return loops;
  }

  // ================================================================== ring utilities
  function signedArea(r) {
    var a = 0;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
    return a / 2;
  }
  function bboxOf(r) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    for (var i = 0; i < r.length; i++) {
      if (r[i][0] < b[0]) b[0] = r[i][0]; if (r[i][1] < b[1]) b[1] = r[i][1];
      if (r[i][0] > b[2]) b[2] = r[i][0]; if (r[i][1] > b[3]) b[3] = r[i][1];
    }
    return b;
  }
  function inside(p, r) {
    var c = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) &&
          p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    }
    return c;
  }
  function smooth(r, iter) {
    var n = r.length, cur = r;
    for (var k = 0; k < iter; k++) {
      var nx = new Array(n);
      for (var i = 0; i < n; i++) {
        var a = cur[(i + n - 1) % n], b = cur[i], c = cur[(i + 1) % n];
        nx[i] = [0.25 * a[0] + 0.5 * b[0] + 0.25 * c[0], 0.25 * a[1] + 0.5 * b[1] + 0.25 * c[1]];
      }
      cur = nx;
    }
    return cur;
  }
  function dpOpen(pts, tol) {
    var n = pts.length;
    if (n < 3) return pts.slice();
    var keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    var stack = [[0, n - 1]], tol2 = tol * tol;
    while (stack.length) {
      var sg = stack.pop(), s = sg[0], e = sg[1];
      var ax = pts[s][0], ay = pts[s][1], dx = pts[e][0] - ax, dy = pts[e][1] - ay, l2 = dx * dx + dy * dy, md = -1, idx = -1;
      for (var i = s + 1; i < e; i++) {
        var px = pts[i][0] - ax, py = pts[i][1] - ay, d2;
        if (l2 === 0) d2 = px * px + py * py; else { var cr = px * dy - py * dx; d2 = cr * cr / l2; }
        if (d2 > md) { md = d2; idx = i; }
      }
      if (md > tol2 && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }
    var out = [];
    for (var k = 0; k < n; k++) if (keep[k]) out.push(pts[k]);
    return out;
  }
  function dpRing(r, tol) {
    if (r.length <= 4 || !(tol > 0)) return r.slice();
    var far = 0, best = -1;
    for (var i = 1; i < r.length; i++) {
      var dx = r[i][0] - r[0][0], dy = r[i][1] - r[0][1], d = dx * dx + dy * dy;
      if (d > best) { best = d; far = i; }
    }
    var a = dpOpen(r.slice(0, far + 1), tol), b = dpOpen(r.slice(far).concat([r[0]]), tol);
    var out = a.slice(0, -1).concat(b.slice(0, -1));
    return out.length >= 3 ? out : r.slice();
  }

  // ================================================================== trace (pixel space)
  /**
   * traceAlpha(img, opts) -> {mode, outers:[ring px], holes:[ring px], bboxPx:[x0,y0,x1,y1], stats, warnings:[code]}
   * Pixel space: image spans [0,W]x[0,H], y DOWN (pixel (i,j) covers [i,i+1]x[j,j+1]).
   */
  function traceAlpha(img0, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var ds = downsample(img0, o.maxPixels), img = ds.img, f = ds.f;
    var w = img.width, h = img.height, n = w * h, A = img.alpha, iso = o.alphaThreshold * 255, p;
    var warnings = [], mask = new Uint8Array(n), count = 0, transparent = 0;
    for (p = 0; p < n; p++) { if (A[p] > iso) { mask[p] = 1; count++; } if (A[p] < 255) transparent++; }
    var W0 = img0.width, H0 = img0.height, canvasRing = [[0, 0], [W0, 0], [W0, H0], [0, H0]];
    var stats = { width: W0, height: H0, downsample: f, maskPx: count * f * f, canvasPx: W0 * H0 };
    if (!count) throw rasterError('empty', 'The image is fully transparent at the alpha threshold');
    if (!img.hasAlpha || transparent < o.opaqueFrac * n) {
      warnings.push(img.hasAlpha ? 'noTransparency' : 'noAlpha');
      return { mode: 'canvas', outers: [canvasRing], holes: [], bboxPx: [0, 0, W0, H0], stats: stats, warnings: warnings };
    }
    var cl = cleanMask(mask, w, h, o), M = cl.mask;
    stats.specksRemoved = cl.specksRemoved; stats.holesFilled = cl.holesFilled; stats.components = cl.components;
    var bx0 = w, by0 = h, bx1 = -1, by1 = -1, cleanCount = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (M[y * w + x]) {
      cleanCount++;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    if (!cleanCount) throw rasterError('empty', 'Only specks survive the alpha threshold');
    var bboxPx = [bx0 * f, by0 * f, Math.min(W0, (bx1 + 1) * f), Math.min(H0, (by1 + 1) * f)];
    stats.cleanPx = cleanCount * f * f;
    stats.bboxPx = (bboxPx[2] - bboxPx[0]) * (bboxPx[3] - bboxPx[1]);
    stats.mask = M; stats.maskW = w; stats.maskH = h;
    if (o.mode === 'canvas') return { mode: 'canvas', outers: [canvasRing], holes: [], bboxPx: bboxPx, stats: stats, warnings: warnings };
    if (o.mode === 'bbox') {
      var b = bboxPx;
      return { mode: 'bbox', outers: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]], holes: [],
               bboxPx: bboxPx, stats: stats, warnings: warnings };
    }
    // field: alpha clamped to the cleaned mask, padded by one pixel of zeros
    var PW = w + 2, PH = h + 2, field = new Float32Array(PW * PH);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var v = A[y * w + x], q = (y + 1) * PW + x + 1;
      field[q] = M[y * w + x] ? Math.max(v, iso + 0.5) : Math.min(v, iso - 0.5);
    }
    var loops = marchingSquares(field, PW, PH, iso);
    var info = loops.map(function (r) { return { r: r, bb: bboxOf(r), area: Math.abs(signedArea(r)) }; });
    var outers = [], holes = [], tol = o.simplifyPx / f;
    for (var i = 0; i < info.length; i++) {
      var depth = 0, p0 = info[i].r[0];
      for (var j = 0; j < info.length; j++) {
        if (i === j) continue;
        var bb = info[j].bb;
        if (p0[0] < bb[0] || p0[0] > bb[2] || p0[1] < bb[1] || p0[1] > bb[3] || info[j].area < info[i].area) continue;
        if (inside(p0, info[j].r)) depth++;
      }
      var ring = dpRing(smooth(info[i].r, o.smoothIter), tol);
      if (ring.length < 3 || Math.abs(signedArea(ring)) < 1) continue;
      if (f !== 1) ring = ring.map(function (pp) { return [pp[0] * f, pp[1] * f]; });
      (depth % 2 ? holes : outers).push(ring);
    }
    var aOut = outers.reduce(function (s, r) { return s + Math.abs(signedArea(r)); }, 0);
    var aHol = holes.reduce(function (s, r) { return s + Math.abs(signedArea(r)); }, 0);
    stats.contourPx = aOut - aHol;
    stats.vertices = outers.concat(holes).reduce(function (s, r) { return s + r.length; }, 0);
    return { mode: 'contour', outers: outers, holes: holes, bboxPx: bboxPx, stats: stats, warnings: warnings };
  }

  // ================================================================== document mapping + offset
  /** corners {tl,tr,bl} = document points of the image corners (0,0), (W,0), (0,H) in pixel space */
  function mapper(corners, W, H) {
    var tl = corners.tl, ux = [(corners.tr[0] - tl[0]) / W, (corners.tr[1] - tl[1]) / W];
    var vy = [(corners.bl[0] - tl[0]) / H, (corners.bl[1] - tl[1]) / H];
    return function (p) { return [tl[0] + p[0] * ux[0] + p[1] * vy[0], tl[1] + p[0] * ux[1] + p[1] * vy[1]]; };
  }
  function orient(r, ccw) { var s = signedArea(r); return (s > 0) === ccw ? r : r.slice().reverse(); }

  function offsetRings(outers, holes, delta) {
    var C = lib(), S = 1000;
    var co = new C.ClipperOffset(2, Math.max(1, 0.1 * S)), out = new C.Paths();
    var paths = outers.map(function (r) { return orient(r, true); }).concat(holes.map(function (r) { return orient(r, false); }))
      .map(function (r) { return r.map(function (p) { return { X: Math.round(p[0] * S), Y: Math.round(p[1] * S) }; }); });
    co.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
    co.Execute(out, delta * S);
    var res = { outers: [], holes: [] };
    out.forEach(function (pth) {
      if (pth.length < 3) return;
      var r = pth.map(function (q) { return [q.X / S, q.Y / S]; });
      (C.Clipper.Orientation(pth) ? res.outers : res.holes).push(r);
    });
    return res;
  }

  /**
   * trace(img, corners, opts) -> {rings (document pt, outers CCW then holes CW), outers, holes, mode,
   *                               warnings, stats, px (pixel-space result, for tests/debug)}
   */
  function trace(img, corners, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var t = traceAlpha(img, o), map = mapper(corners, img.width, img.height);
    var outers = t.outers.map(function (r) { return orient(r.map(map), true); });
    var holes = t.holes.map(function (r) { return orient(r.map(map), false); });
    if (o.offset > 0) { var off = offsetRings(outers, holes, o.offset); outers = off.outers; holes = off.holes; }
    return { rings: outers.concat(holes), outers: outers, holes: holes, mode: t.mode, warnings: t.warnings,
             stats: t.stats, px: t };
  }

  // ================================================================== panel glue
  /**
   * items from corvoExport; the ones with `raster` ({path, corners:{tl,tr,bl}, temp}) get their rings from
   * the image. Returns {items, warnings:[{name, code}]}. Temporary PNGs written by the host are deleted.
   * Throws an Error with .code on unreadable images (message names the item).
   */
  function prepareItems(items, opts, fsMod) {
    var fs = fsMod || nodeRequire('fs'), warnings = [];
    var out = (items || []).map(function (it) {
      if (!it.raster) return it;
      var r = it.raster, name = it.name || ('#' + it.i), bytes;
      try { bytes = fs.readFileSync(r.path); }
      catch (e) { throw rasterError('read', name + ': ' + r.path + ' (' + e.message + ')'); }
      finally { if (r.temp) { try { fs.unlinkSync(r.path); } catch (e2) { /* already gone */ } } }
      var img, res;
      try { img = decodePNG(bytes); res = trace(img, r.corners, opts); }
      catch (e) { e.message = name + ': ' + e.message; throw e; }
      res.warnings.forEach(function (c) { warnings.push({ name: name, code: c }); });
      var copy = Object.assign({}, it, { rings: res.rings });
      copy.rasterInfo = { mode: res.mode, holes: res.holes.length, outers: res.outers.length, px: [img.width, img.height] };
      return copy;
    });
    return { items: out, warnings: warnings };
  }

  // ================================================================== measurement (tests)
  /**
   * Distance between the traced contour (pixel space) and the cleaned mask boundary (pixel edges).
   * Returns {maxPx, meanPx, maxBackPx, n}: maxPx = max over mask boundary points of the distance to the
   * contour; maxBackPx = max over contour vertices of the distance to the mask boundary.
   */
  function deviation(traceRes) {
    var st = traceRes.stats, M = st.mask, w = st.maskW, h = st.maskH, f = st.downsample, x, y;
    var pts = [];
    function m(xx, yy) { return xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : M[yy * w + xx]; }
    for (y = 0; y <= h; y++) for (x = 0; x <= w; x++) {
      if (m(x, y) !== m(x - 1, y) && y < h) pts.push([x * f, (y + 0.5) * f]);
      if (m(x, y) !== m(x, y - 1) && x < w) pts.push([(x + 0.5) * f, y * f]);
    }
    var segs = [];
    traceRes.outers.concat(traceRes.holes).forEach(function (r) {
      for (var i = 0; i < r.length; i++) segs.push([r[i], r[(i + 1) % r.length]]);
    });
    var CELL = 8 * f, grid = new Map();
    function key(cx, cy) { return cx * 100003 + cy; }
    segs.forEach(function (s, k) {
      var x0 = Math.floor(Math.min(s[0][0], s[1][0]) / CELL), x1 = Math.floor(Math.max(s[0][0], s[1][0]) / CELL);
      var y0 = Math.floor(Math.min(s[0][1], s[1][1]) / CELL), y1 = Math.floor(Math.max(s[0][1], s[1][1]) / CELL);
      for (var cx = x0; cx <= x1; cx++) for (var cy = y0; cy <= y1; cy++) {
        var kk = key(cx, cy), a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(k);
      }
    });
    function dseg(p, s) {
      var ax = s[0][0], ay = s[0][1], dx = s[1][0] - ax, dy = s[1][1] - ay, l2 = dx * dx + dy * dy;
      var t = l2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2)) : 0;
      return Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy);
    }
    function nearest(p) {
      var cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL), best = Infinity;
      for (var rad = 1; rad <= 4 && best === Infinity; rad++) {
        for (var i = cx - rad; i <= cx + rad; i++) for (var j = cy - rad; j <= cy + rad; j++) {
          var a = grid.get(key(i, j)); if (!a) continue;
          for (var k = 0; k < a.length; k++) { var d = dseg(p, segs[a[k]]); if (d < best) best = d; }
        }
      }
      if (best === Infinity) for (var q = 0; q < segs.length; q++) best = Math.min(best, dseg(p, segs[q]));
      return best;
    }
    var max = 0, sum = 0;
    pts.forEach(function (p) { var d = nearest(p); sum += d; if (d > max) max = d; });
    // back direction: contour vertices -> nearest boundary point (grid of points)
    var pg = new Map();
    pts.forEach(function (p) {
      var kk = key(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)), a = pg.get(kk); if (!a) pg.set(kk, a = []); a.push(p);
    });
    var maxBack = 0;
    traceRes.outers.concat(traceRes.holes).forEach(function (r) {
      r.forEach(function (p) {
        var cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL), best = Infinity;
        for (var i = cx - 1; i <= cx + 1; i++) for (var j = cy - 1; j <= cy + 1; j++) {
          var a = pg.get(key(i, j)); if (!a) continue;
          for (var k = 0; k < a.length; k++) best = Math.min(best, Math.hypot(a[k][0] - p[0], a[k][1] - p[1]));
        }
        if (best < Infinity && best > maxBack) maxBack = best;
      });
    });
    return { maxPx: max, meanPx: pts.length ? sum / pts.length : 0, maxBackPx: maxBack, n: pts.length };
  }

  return {
    DEFAULTS: DEFAULTS, PRESETS: PRESETS, MM: MM, SAFETY_MM: 0.2,
    decodePNG: decodePNG, fromImageData: fromImageData, traceAlpha: traceAlpha, trace: trace,
    mapper: mapper, offsetRings: offsetRings, prepareItems: prepareItems, deviation: deviation,
    signedArea: signedArea,
    _internals: { cleanMask: cleanMask, erode: erode, label: label, marchingSquares: marchingSquares,
                  smooth: smooth, dpRing: dpRing, downsample: downsample }
  };
});
