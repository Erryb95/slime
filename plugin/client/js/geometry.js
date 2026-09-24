/* Corvo geometry: Illustrator rings -> one simple polygon per piece for Sparrow/jagua-rs.
 *
 * Pure functions, no DOM. Works in the CEP panel (window.CorvoGeometry, needs window.ClipperLib)
 * and in Node (module.exports, loads ../lib/clipper.js via require).
 *
 * Pipeline per piece (docs/plugin-architecture.md):
 *   1. drop rings with |area| < minRingArea (0.5 pt^2), clean duplicates
 *   2. union of all rings (all forced to the same winding, so holes disappear) -> outer contours
 *   3. one outer -> use it; several -> morphological closing (+r, union, -r), r = max(gap, 2 pt),
 *      then a wider closing; if still several parts -> convex hull of every point
 *   4. inflate by the simplification tolerance, Douglas-Peucker, <= maxVertices, must be simple
 *      (jagua-rs rejects self-intersections and duplicate vertices), fallback convex hull.
 * The output polygon is expressed relative to a reference point `ref` (bbox centre) to keep
 * f32 precision inside the wasm: placement of original point p = R(a)(p - ref) + t.
 */
(function (root, factory) {
  var clipper = (root && root.ClipperLib) || null;
  if (!clipper && typeof require === 'function' && typeof window === 'undefined') {
    try { clipper = require('../lib/clipper.js'); } catch (e) { /* resolved lazily below */ }
  }
  var api = factory(clipper);
  if (root) root.CorvoGeometry = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (ClipperLibInit) {
  'use strict';

  var SCALE = 1000;          // clipper works on integers: 0.001 pt resolution
  var DEFAULTS = { gap: 0, flatness: 0.5, minRingArea: 0.5, maxVertices: 200, minClosing: 2 };

  function lib() {
    var C = ClipperLibInit || (typeof window !== 'undefined' && window.ClipperLib) ||
            (typeof self !== 'undefined' && self.ClipperLib);
    if (!C) throw new Error('ClipperLib not loaded');
    return C;
  }

  // ---------- basic geometry ----------
  function signedArea(ring) {
    var a = 0, n = ring.length;
    for (var i = 0, j = n - 1; i < n; j = i++) a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
    return a / 2; // > 0 for counter-clockwise (y up)
  }
  function area(ring) { return Math.abs(signedArea(ring)); }

  function cleanRing(ring, eps) {
    eps = eps || 1e-6;
    var out = [];
    for (var i = 0; i < ring.length; i++) {
      var p = ring[i];
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      var q = out[out.length - 1];
      if (q && Math.abs(q[0] - p[0]) <= eps && Math.abs(q[1] - p[1]) <= eps) continue;
      out.push([+p[0], +p[1]]);
    }
    while (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) <= eps &&
           Math.abs(out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
    return out;
  }

  function bbox(points) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (p[0] < b[0]) b[0] = p[0];
      if (p[1] < b[1]) b[1] = p[1];
      if (p[0] > b[2]) b[2] = p[0];
      if (p[1] > b[3]) b[3] = p[1];
    }
    return b;
  }

  function convexHull(points) {
    var pts = points.map(function (p) { return [p[0], p[1]]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (pts.length < 3) return pts;
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lower = [], upper = [], i;
    for (i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    for (i = pts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
      upper.push(pts[i]);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper); // counter-clockwise
  }

  // Douglas-Peucker on an open polyline
  function dpOpen(pts, tol) {
    var n = pts.length;
    if (n < 3) return pts.slice();
    var keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    var stack = [[0, n - 1]], tol2 = tol * tol;
    while (stack.length) {
      var seg = stack.pop(), s = seg[0], e = seg[1];
      var ax = pts[s][0], ay = pts[s][1], dx = pts[e][0] - ax, dy = pts[e][1] - ay;
      var len2 = dx * dx + dy * dy, maxD = -1, idx = -1;
      for (var i = s + 1; i < e; i++) {
        var px = pts[i][0] - ax, py = pts[i][1] - ay, d2;
        if (len2 === 0) d2 = px * px + py * py;
        else { var c = px * dy - py * dx; d2 = c * c / len2; }
        if (d2 > maxD) { maxD = d2; idx = i; }
      }
      if (maxD > tol2 && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }
    var out = [];
    for (var k = 0; k < n; k++) if (keep[k]) out.push(pts[k]);
    return out;
  }

  // Douglas-Peucker on a closed ring: split at vertex 0 and the vertex farthest from it
  function douglasPeucker(ring, tol) {
    var n = ring.length;
    if (n <= 4 || !(tol > 0)) return ring.slice();
    var far = 0, best = -1;
    for (var i = 1; i < n; i++) {
      var dx = ring[i][0] - ring[0][0], dy = ring[i][1] - ring[0][1], d = dx * dx + dy * dy;
      if (d > best) { best = d; far = i; }
    }
    var a = dpOpen(ring.slice(0, far + 1), tol);
    var b = dpOpen(ring.slice(far).concat([ring[0]]), tol);
    var out = a.slice(0, -1).concat(b.slice(0, -1));
    return out.length >= 3 ? out : ring.slice();
  }

  function orient(a, b, c) {
    var v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  }
  function onSeg(a, b, c) {
    return Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) &&
           Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  }
  function segIntersect(p1, p2, p3, p4) {
    var o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4), o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSeg(p1, p2, p3)) return true;
    if (o2 === 0 && onSeg(p1, p2, p4)) return true;
    if (o3 === 0 && onSeg(p3, p4, p1)) return true;
    if (o4 === 0 && onSeg(p3, p4, p2)) return true;
    return false;
  }

  // simple = >= 3 vertices, no duplicate vertex, no crossing of non-adjacent edges, non-zero area
  function isSimple(ring) {
    var n = ring.length;
    if (n < 3) return false;
    var seen = {};
    for (var k = 0; k < n; k++) {
      var key = ring[k][0] + ',' + ring[k][1];
      if (seen[key]) return false;
      seen[key] = 1;
    }
    if (!(area(ring) > 0)) return false;
    for (var i = 0; i < n; i++) {
      var a1 = ring[i], a2 = ring[(i + 1) % n];
      for (var j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
        if (segIntersect(a1, a2, ring[j], ring[(j + 1) % n])) return false;
      }
    }
    return true;
  }

  // round to f32 (what the wasm sees) relative to ref, drop duplicates created by rounding
  function toF32(ring, ref) {
    var out = [];
    for (var i = 0; i < ring.length; i++) {
      var p = [Math.fround(ring[i][0] - ref[0]), Math.fround(ring[i][1] - ref[1])];
      var q = out[out.length - 1];
      if (q && q[0] === p[0] && q[1] === p[1]) continue;
      out.push(p);
    }
    while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
    return out;
  }

  // ---------- clipper helpers ----------
  function toPath(ring) {
    return ring.map(function (p) { return { X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) }; });
  }
  function fromPath(path) { return path.map(function (p) { return [p.X / SCALE, p.Y / SCALE]; }); }

  function union(paths, fill) {
    var C = lib(), c = new C.Clipper(), out = new C.Paths();
    c.AddPaths(paths, C.PolyType.ptSubject, true);
    c.Execute(C.ClipType.ctUnion, out, fill, fill);
    return out;
  }
  function offset(paths, delta, arcTolPt) {
    var C = lib(), co = new C.ClipperOffset(2, Math.max(1, (arcTolPt || 0.25) * SCALE)), out = new C.Paths();
    co.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
    co.Execute(out, delta * SCALE);
    return out;
  }
  function outers(paths) {
    var C = lib();
    return paths.filter(function (p) { return p.length >= 3 && C.Clipper.Orientation(p); });
  }
  function pathArea(p) { return Math.abs(lib().Clipper.Area(p)) / (SCALE * SCALE); }
  function largest(paths) {
    var best = null, ba = -1;
    for (var i = 0; i < paths.length; i++) { var a = pathArea(paths[i]); if (a > ba) { ba = a; best = paths[i]; } }
    return best;
  }

  // Filled area of the piece as drawn. groups (optional, parallel to rings) = source path of each ring:
  // even-odd INSIDE a path / compound path (counters of letters are holes), non-zero union ACROSS paths (print art
  // drawn as overlapping shapes, or a kiss cut inside its through cut, must not cancel out).
  // Without groups: even-odd over everything (v0.1 behaviour).
  function filledArea(rings, groups) {
    if (!rings.length) return 0;
    var C = lib(), res, a = 0, i;
    if (groups && groups.length === rings.length) {
      var by = {}, keys = [];
      for (i = 0; i < rings.length; i++) {
        var k = String(groups[i]);
        if (!by[k]) { by[k] = []; keys.push(k); }
        by[k].push(toPath(rings[i]));
      }
      var parts = [];
      for (i = 0; i < keys.length; i++) {
        var eo = union(by[keys[i]], C.PolyFillType.pftEvenOdd);
        // union() output: outers and holes with opposite orientation -> the non-zero union below keeps the holes
        for (var q = 0; q < eo.length; q++) parts.push(eo[q]);
      }
      res = keys.length === 1 ? parts : union(parts, C.PolyFillType.pftNonZero);
    } else {
      res = union(rings.map(toPath), C.PolyFillType.pftEvenOdd);
    }
    for (i = 0; i < res.length; i++) a += C.Clipper.Area(res[i]);
    return Math.abs(a) / (SCALE * SCALE);
  }

  // silhouette: all rings forced CCW + non-zero union -> no holes, only outer contours
  function silhouette(rings) {
    var C = lib();
    var paths = rings.map(function (r) { return toPath(signedArea(r) < 0 ? r.slice().reverse() : r); });
    return outers(union(paths, C.PolyFillType.pftNonZero));
  }

  function closing(paths, r) {
    var tol = Math.max(0.1, r / 8);
    var grown = outers(offset(paths, r, tol));
    if (!grown.length) return [];
    return outers(offset(grown, -r, tol));
  }

  // inflate by tol then DP with tol => result (approximately) contains the input
  function simplify(ring, tol, maxV) {
    var t = tol, base = toPath(ring);
    for (var it = 0; it < 10; it++) {
      var grown = largest(outers(offset([base], t, t / 2)));
      if (grown) {
        var s = cleanRing(douglasPeucker(cleanRing(fromPath(grown)), t));
        if (s.length >= 3 && s.length <= maxV && isSimple(s)) return { ring: s, tol: t };
      }
      t *= 1.6;
    }
    return null;
  }

  /**
   * Build one Sparrow polygon for an exported item.
   * item: {i, name, rings:[[[x,y],...],...]} in document points (y up)
   * opts: {gap (pt), flatness (pt), minRingArea (pt^2), maxVertices, minClosing (pt)}
   * returns {id, name, ref:[x,y], polygon:[[x,y],...] (relative to ref), area, method, parts, vertices}
   *      or {id, name, error}
   */
  function buildPiece(item, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var id = item.i, name = item.name || ('#' + item.i);
    var src = item.rings || [], rgIn = item.rg && item.rg.length === src.length ? item.rg : null;
    var rings = [], rg = [];
    for (var q = 0; q < src.length; q++) {
      var cr = cleanRing(src[q]);
      if (cr.length >= 3 && area(cr) >= opts.minRingArea) { rings.push(cr); if (rgIn) rg.push(rgIn[q]); }
    }
    if (!rings.length) return { id: id, name: name, error: 'no closed contour' };

    var all = [].concat.apply([], rings);
    var pieceArea = filledArea(rings, rgIn ? rg : null);
    var parts = silhouette(rings), method = 'single', outer = null;
    if (parts.length === 1) {
      outer = fromPath(parts[0]);
    } else if (parts.length > 1) {
      var b = bbox(all), diag = Math.hypot(b[2] - b[0], b[3] - b[1]);
      var r0 = Math.max(opts.gap || 0, opts.minClosing);
      var radii = [r0, Math.min(Math.max(r0 * 3, diag * 0.04), diag * 0.1)];
      for (var k = 0; k < radii.length && !outer; k++) {
        if (k > 0 && radii[k] <= radii[k - 1]) continue;
        var closed = closing(parts, radii[k]);
        if (closed.length === 1) { outer = fromPath(closed[0]); method = 'closed'; }
      }
      if (!outer) { outer = convexHull(all); method = 'hull'; }
    }
    if (!outer || outer.length < 3) { outer = convexHull(all); method = 'hull'; }
    outer = cleanRing(outer);

    var simp = simplify(outer, opts.flatness, opts.maxVertices);
    var poly;
    if (simp) poly = simp.ring;
    else {
      poly = convexHull(outer); method = method + '+hull';
      var t = opts.flatness;
      while (poly.length > opts.maxVertices) { poly = douglasPeucker(poly, t); t *= 1.6; }
    }
    var bb = bbox(poly), ref = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
    var rel = toF32(poly, ref);
    if (!isSimple(rel)) {                   // f32 rounding broke it: convex hull is always safe
      rel = toF32(convexHull(poly), ref); method += '+hull';
    }
    return { id: id, name: name, ref: ref, polygon: rel, area: pieceArea, method: method,
             parts: parts.length, vertices: rel.length };
  }

  function buildPieces(items, opts) {
    return (items || []).map(function (it) { return buildPiece(it, opts); });
  }

  // smallest extent (across the strip) of a polygon over the given rotations (deg); null = free
  function minExtent(poly, orientations) {
    var angles = orientations && orientations.length ? orientations : null, best = Infinity;
    if (!angles) { angles = []; for (var d = 0; d < 180; d += 1) angles.push(d); }
    for (var i = 0; i < angles.length; i++) {
      var a = angles[i] * Math.PI / 180, s = Math.sin(a), c = Math.cos(a), lo = Infinity, hi = -Infinity;
      for (var k = 0; k < poly.length; k++) {
        var y = s * poly[k][0] + c * poly[k][1];
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
      if (hi - lo < best) best = hi - lo;
    }
    return best;
  }

  // Sparrow ExtSPInstance
  function buildInstance(pieces, stripHeight, orientations) {
    return {
      name: 'corvo',
      strip_height: stripHeight,
      items: pieces.map(function (p) {
        var it = { id: p.id, demand: 1, shape: { type: 'simple_polygon', data: p.polygon } };
        if (orientations) it.allowed_orientations = orientations.slice();
        return it;
      })
    };
  }

  // Engine guard (merge 3/4-7/9): jagua-rs starts the strip at width = item area / strip height and deflates it by
  // gap/2 per side; when that width is below the gap (a few small pieces on a wide roll, e.g. one colour group of dots)
  // the strip polygon is empty and the wasm PANICS ("Offset resulted in an empty polygon", worker dead).
  // Fix: lower strip_height (never below what every piece needs in an allowed orientation) until area / height >=
  // 4 x gap. The layout then lies in [0, h] inside the real roll [0, H]: still valid, placements unchanged in meaning.
  function guardInstance(inst, gap) {
    if (!inst || !inst.items || !inst.items.length) return inst;
    var H = inst.strip_height, need = 4 * Math.max(gap || 0, 1), area = 0, minH = 0;
    inst.items.forEach(function (it) {
      var P = it.shape && it.shape.data;
      if (!P || !P.length) return;
      var a = 0;
      for (var k = 0; k < P.length; k++) { var q = P[(k + 1) % P.length]; a += P[k][0] * q[1] - q[0] * P[k][1]; }
      area += Math.abs(a / 2) * (it.demand || 1);
    });
    if (!(H > 0) || area / H >= need) return inst;
    inst.items.forEach(function (it) {
      var P = it.shape && it.shape.data;
      if (P && P.length) minH = Math.max(minH, minExtent(P, it.allowed_orientations || null));
    });
    var h = Math.min(H, Math.max(area / need, minH * 1.02 + 1e-3));
    if (h < H) { inst.strip_height = h; inst.guardedHeight = H; }
    return inst;
  }

  // Sparrow placement (on the ref-relative polygon) -> absolute move for corvoApply
  // p_doc = R(a)(p - ref) + t + O  =  R(a) p + (t - R(a) ref + O)
  function placementToMove(pl, piece, origin) {
    var a = pl.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    var rx = c * piece.ref[0] - s * piece.ref[1], ry = s * piece.ref[0] + c * piece.ref[1];
    return { i: piece.hostI !== undefined ? piece.hostI : piece.id, a: pl.rotation,   // hostI: renumbered pieces
             tx: pl.translation[0] - rx + origin[0], ty: pl.translation[1] - ry + origin[1] };
  }

  // apply an absolute move to original document points (tests / previews)
  function applyMove(ring, mv) {
    var a = mv.a * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return ring.map(function (p) { return [c * p[0] - s * p[1] + mv.tx, s * p[0] + c * p[1] + mv.ty]; });
  }

  return {
    MM: 72 / 25.4,
    mmToPt: function (mm) { return mm * 72 / 25.4; },
    ptToMm: function (pt) { return pt * 25.4 / 72; },
    rotationsFor: function (mode) {
      return mode === 'none' ? [0] : mode === '180' ? [0, 180] : mode === '90' ? [0, 90, 180, 270] : null;
    },
    signedArea: signedArea, area: area, cleanRing: cleanRing, bbox: bbox, convexHull: convexHull,
    douglasPeucker: douglasPeucker, isSimple: isSimple, filledArea: filledArea,
    buildPiece: buildPiece, buildPieces: buildPieces, buildInstance: buildInstance, guardInstance: guardInstance,
    minExtent: minExtent, placementToMove: placementToMove, applyMove: applyMove,
    _internals: { silhouette: silhouette, closing: closing, simplify: simplify, union: union,
                  offset: offset, outers: outers, toPath: toPath, fromPath: fromPath, SCALE: SCALE, lib: lib }
  };
});
