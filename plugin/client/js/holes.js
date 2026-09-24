/* Corvo holes (module 2, "pezzi dentro i fori" / part-in-part).
 *
 * Pure functions, no DOM. Browser: window.CorvoHoles (needs window.CorvoGeometry + window.ClipperLib).
 * Node: module.exports (requires ./geometry.js and ../lib/clipper.js).
 *
 * jagua-rs/Sparrow items cannot have holes (jagua-rs PR #96), so the holes are filled BEFORE the main nest,
 * outside the engine, and the result is frozen:
 *   1. free space of every piece P = its Sparrow polygon (outer contour, closing or hull) minus its artwork
 *      grown by `gap`  -> regions (counters of O A R B D P Q 0 6 8 9, frames, rings, concavities under a hull).
 *   2. regions sorted by area (largest first); for each one the largest remaining pieces are tried first, in every
 *      allowed rotation: the exact feasible positions come from Minkowski sums (inner-fit region minus the no-fit
 *      regions of the children already placed there, all grown by `gap`), the bottom-left one is taken.
 *   3. an accepted child gets a FIXED transform relative to the ORIGINAL position of its parent; parent + children
 *      are one Sparrow item (the parent's polygon, children are inside it). A piece that received children is never
 *      used as a child, a child never receives children (one level).
 *   4. expandMoves(): parent move (a_P, t_P) composed with the child's relative (a_c, t_c) gives the child move
 *      a = a_P + a_c, t = R(a_P) t_c + t_P, in the same absolute corvoApply contract.
 *
 * Shapes used for the tests are conservative: child = its Sparrow polygon (already contains the artwork), further
 * simplified by inflating; region = deflated then simplified. So the clearance is always >= gap.
 */
(function (root, factory) {
  var G = (root && root.CorvoGeometry) || null, C = (root && root.ClipperLib) || null;
  if (typeof require === 'function' && typeof window === 'undefined') {
    try { if (!G) G = require('./geometry.js'); } catch (e) { /* lazily */ }
    try { if (!C) C = require('../lib/clipper.js'); } catch (e) { /* lazily */ }
  }
  var api = factory(G, C);
  if (root) root.CorvoHoles = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (GInit, CInit) {
  'use strict';

  var SCALE = 1000;
  var DEFAULTS = {
    gap: 0,               // pt, clearance child <-> parent artwork and child <-> child
    orientations: null,   // allowed rotations (deg); null (free) -> [0, 90, 180, 270]
    minHoleArea: 50,      // pt^2, smaller free regions are ignored
    childVertices: 40,    // max vertices of the child shape used in the Minkowski sums
    regionVertices: 120,  // max vertices of a region boundary
    tol: 0.35,            // pt, simplification tolerance (conservative)
    eps: 0.05,            // pt, extra safety margin on the region
    maxMs: 2000           // time budget of the whole pre-pass
  };

  function G() {
    var g = GInit || (typeof window !== 'undefined' && window.CorvoGeometry) || (typeof self !== 'undefined' && self.CorvoGeometry);
    if (!g) throw new Error('CorvoGeometry not loaded');
    return g;
  }
  function L() {
    var c = CInit || (typeof window !== 'undefined' && window.ClipperLib) || (typeof self !== 'undefined' && self.ClipperLib);
    if (!c) throw new Error('ClipperLib not loaded');
    return c;
  }
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  function toPath(ring, dx, dy) {
    dx = dx || 0; dy = dy || 0;
    return ring.map(function (p) { return { X: Math.round((p[0] + dx) * SCALE), Y: Math.round((p[1] + dy) * SCALE) }; });
  }
  function fromPath(path) { return path.map(function (p) { return [p.X / SCALE, p.Y / SCALE]; }); }
  function pathsArea(paths) {
    var a = 0, Cl = L().Clipper;
    for (var i = 0; i < paths.length; i++) a += Cl.Area(paths[i]);
    return a / (SCALE * SCALE);
  }
  function exec(type, subj, clip, fill) {
    var Cl = L(), c = new Cl.Clipper(), out = new Cl.Paths();
    fill = fill === undefined ? Cl.PolyFillType.pftNonZero : fill;
    c.AddPaths(subj, Cl.PolyType.ptSubject, true);
    if (clip && clip.length) c.AddPaths(clip, Cl.PolyType.ptClip, true);
    c.Execute(type, out, fill, fill);
    return out;
  }
  function offsetPaths(paths, delta, arcTol) {
    var Cl = L(), co = new Cl.ClipperOffset(2, Math.max(1, (arcTol || 0.25) * SCALE)), out = new Cl.Paths();
    co.AddPaths(paths, Cl.JoinType.jtRound, Cl.EndType.etClosedPolygon);
    co.Execute(out, delta * SCALE);
    return out;
  }
  function pathBox(paths) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    for (var i = 0; i < paths.length; i++) for (var k = 0; k < paths[i].length; k++) {
      var p = paths[i][k];
      if (p.X < b[0]) b[0] = p.X; if (p.Y < b[1]) b[1] = p.Y;
      if (p.X > b[2]) b[2] = p.X; if (p.Y > b[3]) b[3] = p.Y;
    }
    return b;
  }
  function rotate(ring, deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return ring.map(function (p) { return [c * p[0] - s * p[1], s * p[0] + c * p[1]]; });
  }
  function norm(deg) { deg = deg % 360; if (deg < 0) deg += 360; return Math.abs(deg - 360) < 1e-9 ? 0 : deg; }

  // closed ring -> at most maxV vertices, CONTAINING the input (inflate + Douglas-Peucker)
  function simplifyOut(ring, tol, maxV) {
    var g = G();
    if (ring.length <= maxV) return ring;
    var s = g._internals.simplify(ring, tol, maxV);
    if (s) return s.ring;
    var h = g.convexHull(ring), t = tol;
    while (h.length > maxV) { h = g.douglasPeucker(h, t); t *= 1.6; }   // hull DP may cut corners: inflate after
    var grown = offsetPaths([toPath(h)], t, t);
    return grown.length ? fromPath(grown[0]) : h;
  }
  // region path (clipper) -> simplified path CONTAINED in it (deflate by tol, then DP with tol); holes of the
  // region are simplified the other way (they are obstacles): they must grow.
  function simplifyRegion(outer, holes, tol, maxV) {
    var g = G(), Cl = L();
    function dp(ring, t) { return g.cleanRing(g.douglasPeucker(g.cleanRing(ring), t)); }
    var t = tol, res = null;
    for (var it = 0; it < 6 && !res; it++) {
      var inner = offsetPaths([outer], -t, t).filter(function (p) { return Cl.Clipper.Orientation(p); });
      if (!inner.length) return null;
      var o = inner.map(function (p) { return dp(fromPath(p), t); }).filter(function (r) { return r.length >= 3; });
      var n = o.reduce(function (s, r) { return s + r.length; }, 0);
      var hs = holes.map(function (h) {
        var r = fromPath(h); if (g.signedArea(r) < 0) r = r.slice().reverse();
        return simplifyOut(r, t, 40);
      });
      n += hs.reduce(function (s, r) { return s + r.length; }, 0);
      if (n <= maxV || it === 5) res = { outers: o, holes: hs };
      t *= 1.6;
    }
    return res;
  }

  // free regions of one piece: polygon minus artwork grown by gap, as [{outer:path, holes:[path]}]
  function freeRegions(item, piece, o) {
    var g = G(), Cl = L();
    var src = item.rings || [], rgIn = item.rg && item.rg.length === src.length ? item.rg : null;
    var rings = [], rg = [];
    src.forEach(function (r, q) {
      var cr = g.cleanRing(r);
      if (cr.length >= 3 && g.area(cr) >= 0.5) { rings.push(cr); rg.push(rgIn ? rgIn[q] : 0); }
    });
    if (!rings.length || !piece.polygon) return [];
    // merge with module 1: pieces are clusters of objects; the artwork is even-odd INSIDE each path / compound path
    // (letter counters stay free) and non-zero ACROSS paths (a print drawn over a background shape is not a hole).
    // Without rg (v0.1 export): even-odd over everything, as before.
    var filled;
    if (rgIn) {
      var by = {}, keys = [], parts = [];
      rings.forEach(function (r, q) { var k = String(rg[q]); if (!by[k]) { by[k] = []; keys.push(k); } by[k].push(toPath(r)); });
      keys.forEach(function (k) { exec(Cl.ClipType.ctUnion, by[k], null, Cl.PolyFillType.pftEvenOdd).forEach(function (pp) { parts.push(pp); }); });
      filled = keys.length === 1 ? parts : exec(Cl.ClipType.ctUnion, parts, null, Cl.PolyFillType.pftNonZero);
    } else {
      filled = exec(Cl.ClipType.ctUnion, rings.map(function (r) { return toPath(r); }), null, Cl.PolyFillType.pftEvenOdd);
    }
    var grown = offsetPaths(filled, o.gap + o.eps, Math.max(0.1, o.tol / 2));
    var poly = toPath(piece.polygon, piece.ref[0], piece.ref[1]);
    if (!Cl.Clipper.Orientation(poly)) poly.reverse();
    var tree = new Cl.PolyTree(), c = new Cl.Clipper();
    c.AddPath(poly, Cl.PolyType.ptSubject, true);
    c.AddPaths(grown, Cl.PolyType.ptClip, true);
    c.Execute(Cl.ClipType.ctDifference, tree, Cl.PolyFillType.pftNonZero, Cl.PolyFillType.pftNonZero);
    var out = [];
    (function walk(node) {
      var kids = node.Childs();
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (!k.IsHole()) {
          var holes = k.Childs().map(function (h) { return h.Contour(); });
          var area = (Cl.Clipper.Area(k.Contour()) + holes.reduce(function (s, h) { return s + Cl.Clipper.Area(h); }, 0)) / (SCALE * SCALE);
          if (area >= o.minHoleArea) out.push({ outer: k.Contour(), holes: holes, area: area });
          k.Childs().forEach(function (h) { walk(h); });   // islands inside holes of the region
        }
      }
    })(tree);
    return out;
  }

  // integer convex hull of {X,Y} points, counter-clockwise
  function hullP(pts) {
    var h = G().convexHull(pts.map(function (p) { return [p.X, p.Y]; }));
    return h.map(function (p) { return { X: p[0], Y: p[1] }; });
  }
  function shift(pts, d) { return pts.map(function (p) { return { X: p.X + d.X, Y: p.Y + d.Y }; }); }

  // Minkowski sum of a CONVEX pattern with the edges of a closed path: one small convex polygon per edge
  // (hull of the pattern at both ends). Much cheaper than clipper's quad-per-vertex-pair Minkowski and exact
  // for a convex pattern. `fill` adds the interior of the path (obstacle), shifted by a pattern vertex.
  function band(hull, path, fill, into) {
    var n = path.length;
    for (var i = 0; i < n; i++) {
      var a = path[i], b = path[(i + 1) % n];
      into.push(hullP(shift(hull, a).concat(shift(hull, b))));
    }
    if (fill) {
      var p = shift(path, hull[0]);
      if (!L().Clipper.Orientation(p)) p.reverse();
      into.push(p);
    }
  }

  // feasible translations d of child shape `shape` (ring, rotated, relative to its ref) in region reg:
  //   d + shape inside the region outer, off the region islands and off the obstacles (convex, already grown by gap).
  // The pattern is the convex hull of the shape (conservative for concave children: no position is ever wrong).
  function feasible(reg, shape, obstacles) {
    var Cl = L();
    var sp = toPath(shape);
    var neg = hullP(sp.map(function (p) { return { X: -p.X, Y: -p.Y }; }));
    var forb = [];
    for (var i = 0; i < reg.outersP.length; i++) band(neg, reg.outersP[i], false, forb);
    for (var h = 0; h < reg.holesP.length; h++) band(neg, reg.holesP[h], true, forb);
    for (var k = 0; k < obstacles.length; k++) {            // convex obstacle: sum of two convex polygons
      var pts = [];
      for (var q = 0; q < obstacles[k].length; q++) for (var r = 0; r < neg.length; r++)
        pts.push({ X: obstacles[k][q].X + neg[r].X, Y: obstacles[k][q].Y + neg[r].Y });
      forb.push(hullP(pts));
    }
    // reference: vertex 0 of the shape must lie inside the region
    var ref = { X: -sp[0].X, Y: -sp[0].Y };
    var base = reg.outersP.map(function (p) { return shift(p, ref); });
    var forbU = exec(Cl.ClipType.ctUnion, forb, null);
    return exec(Cl.ClipType.ctDifference, base, forbU);
  }

  // bottom-left vertex of the feasible set
  function bottomLeft(paths) {
    var best = null;
    for (var i = 0; i < paths.length; i++) {
      if (Math.abs(L().Clipper.Area(paths[i])) < 1) continue;      // degenerate slivers
      for (var k = 0; k < paths[i].length; k++) {
        var p = paths[i][k];
        if (!best || p.Y < best.Y - 5 || (Math.abs(p.Y - best.Y) <= 5 && p.X < best.X)) best = p;
      }
    }
    // degenerate feasible sets (single point / segment) are ignored: positions there have no numeric slack
    return best;
  }

  /**
   * items : [{i, rings, rg?}] (document pt): module-1 clustered pieces (cluster.planPieces) or v0.1 export items;
   *         pieces: geometry.buildPieces(items) (id = item.i, or hostI = item.i when renumbered after dropping
   *         degenerate pieces)
   * opts  : see DEFAULTS
   * returns {children:[{id, parent, a, tx, ty}], parents:{pid:[ids]}, regions, usedRegions, emptyRegions, ms, timedOut}
   *   child move relative to the parent's ORIGINAL frame: p -> R(a) p + (tx, ty)
   */
  // host item index of a piece (module 1: pieces renumbered after dropping degenerate ones keep it in hostI)
  function hostIdx(p) { return p.hostI !== undefined ? p.hostI : p.id; }

  function planHoles(items, pieces, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var t0 = now(), Cl = L(), g = G();
    var rots = (o.orientations && o.orientations.length) ? o.orientations.slice() : [0, 90, 180, 270];
    var itemById = {};
    (items || []).forEach(function (it) { itemById[it.i] = it; });
    var ok = (pieces || []).filter(function (p) { return p && !p.error && p.polygon && itemById[hostIdx(p)]; });
    var res = { children: [], parents: {}, regions: 0, usedRegions: 0, emptyRegions: 0, ms: 0, timedOut: false, calls: 0, feasMs: 0 };
    if (ok.length < 2) { res.ms = now() - t0; return res; }

    // 1. regions of every piece
    var regions = [];
    ok.forEach(function (p) {
      freeRegions(itemById[hostIdx(p)], p, o).forEach(function (r) { r.owner = p.id; regions.push(r); });
    });
    res.regions = regions.length;
    if (!regions.length) { res.ms = now() - t0; return res; }
    regions.sort(function (a, b) { return b.area - a.area; });

    // 2. candidate children, largest first; shapes per rotation (conservative, few vertices)
    var cands = ok.map(function (p) {
      var area = g.area(p.polygon);
      var shape = simplifyOut(p.polygon, o.tol, o.childVertices);
      var byRot = {};
      rots.forEach(function (a) {
        var r = rotate(shape, a), b = g.bbox(r);
        byRot[a] = { ring: r, w: b[2] - b[0], h: b[3] - b[1] };
      });
      return { id: p.id, piece: p, area: area, byRot: byRot, minSide: Math.min.apply(null, rots.map(function (a) { return Math.min(byRot[a].w, byRot[a].h); })) };
    }).sort(function (a, b) { return b.area - a.area; });

    var isChild = {}, isParent = {};
    for (var ri = 0; ri < regions.length; ri++) {
      if (now() - t0 > o.maxMs) { res.timedOut = true; break; }
      var R = regions[ri];
      if (isChild[R.owner]) continue;
      var simp = simplifyRegion(R.outer, R.holes, o.tol, o.regionVertices);
      if (!simp || !simp.outers.length) { res.emptyRegions++; continue; }
      var reg = { outers: simp.outers, outersP: simp.outers.map(function (r) { return toPath(r); }),
                  holesP: simp.holes.map(function (r) { return toPath(r); }) };
      var bb = pathBox(reg.outersP), bw = (bb[2] - bb[0]) / SCALE, bh = (bb[3] - bb[1]) / SCALE;
      var freeArea = R.area, placed = [], obstacles = [];
      for (var ci = 0; ci < cands.length; ci++) {
        if (now() - t0 > o.maxMs) { res.timedOut = true; break; }
        var cd = cands[ci];
        if (cd.id === R.owner || isChild[cd.id] || isParent[cd.id]) continue;
        if (cd.area > freeArea || cd.minSide > Math.max(bw, bh)) continue;
        var best = null;
        for (var k = 0; k < rots.length; k++) {
          var sh = cd.byRot[rots[k]];
          if (!((sh.w <= bw && sh.h <= bh))) continue;
          var tf = now();
          var fz = feasible(reg, sh.ring, obstacles);
          res.calls++; res.feasMs += now() - tf;
          var bl = bottomLeft(fz);
          if (bl && (!best || bl.Y < best.p.Y - 5 || (Math.abs(bl.Y - best.p.Y) <= 5 && bl.X < best.p.X))) best = { p: bl, a: rots[k], ring: sh.ring };
        }
        if (!best) continue;
        // exact check of the conservative shape at the chosen position (inside region, off other children)
        var dx = best.p.X / SCALE, dy = best.p.Y / SCALE;      // translation of the relative shape
        var placedPath = toPath(best.ring, dx, dy);
        if (!Cl.Clipper.Orientation(placedPath)) placedPath.reverse();
        var regionPaths = reg.outersP.concat(reg.holesP.map(function (p) { var q = p.slice(); if (Cl.Clipper.Orientation(q)) q.reverse(); return q; }));
        var outside = pathsArea(exec(Cl.ClipType.ctDifference, [placedPath], regionPaths));
        var over = obstacles.length ? pathsArea(exec(Cl.ClipType.ctIntersection, [placedPath], obstacles)) : 0;
        if (Math.abs(outside) > 0.05 || Math.abs(over) > 0.05) continue;
        // accept: relative move p -> R(a)(p - ref) + d = R(a) p + (d - R(a) ref)
        var ra = rotate([cd.piece.ref], best.a)[0];
        res.children.push({ id: cd.id, hostI: hostIdx(cd.piece), parent: R.owner, a: best.a, tx: dx - ra[0], ty: dy - ra[1] });
        (res.parents[R.owner] = res.parents[R.owner] || []).push(cd.id);
        isChild[cd.id] = true; isParent[R.owner] = true;
        freeArea -= cd.area;
        placed.push(cd.id);
        // obstacle for the next children: the placed shape grown by gap
        var grownP = offsetPaths([placedPath], o.gap + o.eps, Math.max(0.1, o.tol / 2));
        grownP.forEach(function (p) { if (Cl.Clipper.Orientation(p)) obstacles.push(hullP(p)); });
      }
      if (placed.length) res.usedRegions++; else res.emptyRegions++;
    }
    res.ms = now() - t0;
    return res;
  }

  // pieces to send to Sparrow: children removed (they travel inside their parent), ids renumbered 0..n-1
  // (Sparrow requires consecutive ids); srcId = the original piece id = the host item index
  function nestPieces(pieces, plan) {
    var skip = {};
    if (plan) plan.children.forEach(function (c) { skip[c.id] = true; });
    var out = [];
    pieces.forEach(function (p) {
      if (skip[p.id]) return;
      out.push(Object.assign({}, p, { id: out.length, srcId: p.id }));
    });
    return out;
  }
  function excludeChildren(pieces, plan) { return nestPieces(pieces, plan); }

  // Sparrow placements (on nestPieces) -> absolute moves of EVERY piece (children included), keyed by piece id
  function pieceMoves(placements, nPieces, origin, plan) {
    var byId = {}, moves = [];
    nPieces.forEach(function (p) { byId[p.id] = p; });
    placements.forEach(function (pl) {
      var p = byId[pl.item_id];
      if (!p) return;
      var mv = G().placementToMove(pl, p, origin);
      mv.i = p.srcId !== undefined ? p.srcId : p.id;
      moves.push(mv);
    });
    return expandMoves(moves, plan);
  }

  // Sparrow placements (on nestPieces) -> absolute corvoApply moves of EVERY piece (children included);
  // i = host piece index (hostI when the pieces were renumbered, module 1)
  function movesFor(placements, nPieces, origin, plan) {
    var hostOf = {};
    nPieces.forEach(function (p) { var sid = p.srcId !== undefined ? p.srcId : p.id; hostOf[sid] = p.hostI !== undefined ? p.hostI : sid; });
    if (plan) plan.children.forEach(function (c) { hostOf[c.id] = c.hostI !== undefined ? c.hostI : c.id; });
    return pieceMoves(placements, nPieces, origin, plan).map(function (m) {
      return { i: hostOf[m.i] !== undefined ? hostOf[m.i] : m.i, a: m.a, tx: m.tx, ty: m.ty };
    });
  }

  // Sparrow placements (on nestPieces) -> placements of EVERY piece in the strip frame (children included), on the
  // ids of `pieces` (the list given to planHoles): for the material report (module 5) and the tests.
  // Inverse of placementToMove with origin 0: translation = t + R(a) ref.
  function expandPlacements(placements, nPieces, plan, pieces) {
    var byId = {};
    pieces.forEach(function (p) { byId[p.id] = p; });
    return pieceMoves(placements, nPieces, [0, 0], plan).map(function (m) {
      var p = byId[m.i];
      if (!p) return null;
      var a = m.a * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      return { item_id: m.i, rotation: m.a, translation: [m.tx + c * p.ref[0] - s * p.ref[1], m.ty + s * p.ref[0] + c * p.ref[1]] };
    }).filter(Boolean);
  }

  // parent absolute moves -> + child absolute moves (corvoApply contract)
  function expandMoves(moves, plan) {
    if (!plan || !plan.children.length) return moves;
    var byId = {};
    moves.forEach(function (m) { byId[m.i] = m; });
    var out = moves.slice();
    plan.children.forEach(function (c) {
      var P = byId[c.parent];
      if (!P) return;
      var a = P.a * Math.PI / 180, co = Math.cos(a), s = Math.sin(a);
      out.push({ i: c.id, a: norm(P.a + c.a), tx: co * c.tx - s * c.ty + P.tx, ty: s * c.tx + co * c.ty + P.ty });
    });
    return out;
  }

  return { DEFAULTS: DEFAULTS, planHoles: planHoles, nestPieces: nestPieces, excludeChildren: excludeChildren,
           expandMoves: expandMoves, movesFor: movesFor, expandPlacements: expandPlacements,
           _internals: { freeRegions: freeRegions, feasible: feasible, simplifyOut: simplifyOut, simplifyRegion: simplifyRegion } };
});
