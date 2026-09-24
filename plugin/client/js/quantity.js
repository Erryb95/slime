/* Corvo quantity (module 3): copies per design, mirrored left/right pairs, copies kept close.
 *
 * Pure functions, no DOM. Browser: window.CorvoQuantity (needs window.CorvoGeometry + window.ClipperLib).
 * Node: module.exports (requires ./geometry.js and ../lib/clipper.js).
 *
 * 1. expand(items, pieces, spec)  VIRTUAL copies, nothing is duplicated in Illustrator while the search runs:
 *      qty n  -> n-1 extra copies of the piece (same polygon, same ref)
 *      mirror -> n mirrored copies (reflection across the vertical line x = ref.x of the piece); the engine
 *                cannot mirror (Sparrow issue #157), so the mirrored polygon is a separate item.
 *    Copy k gets the host index base + k (base = number of module-1 pieces): the host keeps a lightweight ghost
 *    outline (the Sparrow polygon) at that index, so corvoApply moves ghosts with the same absolute contract.
 *    On Apply the host duplicates the original members, reflects them if needed, and places them (corvo.jsx).
 *    Virtual items (rings mirrored when needed) let module 2 fill the holes of copies too.
 * 2. buildNest(nestPieces, opts)  Sparrow items: identical polygons become ONE item with `demand` = count
 *    (Sparrow handles demand natively); with keepClose, copies of the same design are pre-grouped into rigid
 *    cells of 2 (L+R for mirrored pairs) and 4 when the cell wastes <= maxWaste of the pieces' area and its hull
 *    <= maxHull more (only with 2+ designs: with one design every neighbour is already a sibling).
 *    expandPlacements() maps Sparrow placements (item_id = Sparrow item) back to one placement per nest piece.
 *
 * Frames: a piece polygon is relative to its ref (geometry.js); a unit member (pid, b, d) is placed in the unit
 * frame as p -> R(b) p + d; the Sparrow placement (a, t) of the unit gives the member placement
 * (a + b, R(a) d + t), in the same convention as every other placement (holes.js, report.js).
 */
(function (root, factory) {
  var G = (root && root.CorvoGeometry) || null, C = (root && root.ClipperLib) || null;
  if (typeof require === 'function' && typeof window === 'undefined') {
    try { if (!G) G = require('./geometry.js'); } catch (e) { /* lazily */ }
    try { if (!C) C = require('../lib/clipper.js'); } catch (e) { /* lazily */ }
  }
  var api = factory(G, C);
  if (root) root.CorvoQuantity = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (GInit, CInit) {
  'use strict';

  var SCALE = 1000;
  var MAX_QTY = 999;
  var DEFAULTS = {
    keepClose: false,     // pre-group copies of the same design into cells
    demand: true,         // identical polygons -> one Sparrow item with demand n
    maxWaste: 0.03,       // a cell may occupy at most 3% more area (grown by gap/2) than its pieces
    maxHull: 0.03,        // ... and its convex hull at most 3% more than the hulls of its members (grown by gap/2):
                          // rejects pairs of circles/ovals, whose rigid pair packs worse than the free pieces
    cellMax: 4,           // 2 = pairs only, 4 = pairs of pairs
    gap: 0,               // pt
    orientations: null,   // allowed rotations (deg), null = free
    stripHeight: Infinity,// pt: a cell wider than the roll in every allowed rotation is refused
    shapeVertices: 40,    // simplified shapes used for the pair search (conservative)
    tol: 0.35,            // pt
    maxCandidates: 60     // candidate positions checked exactly per relative rotation
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
  function norm(deg) { deg = deg % 360; if (deg < 0) deg += 360; return Math.abs(deg - 360) < 1e-9 ? 0 : deg; }
  function rot(p, deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [c * p[0] - s * p[1], s * p[0] + c * p[1]];
  }
  function place(ring, b, d) { return ring.map(function (p) { var q = rot(p, b); return [q[0] + d[0], q[1] + d[1]]; }); }
  function hostIdx(p) { return p.hostI !== undefined ? p.hostI : p.id; }
  function clampQty(n) { n = Math.floor(+n); return n >= 1 ? Math.min(n, MAX_QTY) : 1; }

  // ------------------------------------------------------------------ mirror
  // polygon relative to ref, axis = the vertical line through ref: x -> -x, order reversed (keeps the winding)
  function mirrorPolygon(poly) {
    var out = [];
    for (var i = poly.length - 1; i >= 0; i--) out.push([poly[i][0] === 0 ? 0 : -poly[i][0], poly[i][1]]);
    return out;
  }
  // document rings, axis x = ax: x -> 2 ax - x (what the host does on Apply)
  function mirrorRings(rings, ax) {
    return rings.map(function (r) {
      var out = [];
      for (var i = r.length - 1; i >= 0; i--) out.push([2 * ax - r[i][0], r[i][1]]);
      return out;
    });
  }
  function mirrorBox(b, ax) { return b ? [2 * ax - b[2], b[1], 2 * ax - b[0], b[3]] : b; }

  // ------------------------------------------------------------------ 1. expand
  /**
   * items  : module-1 plan pieces [{i, name, rings, rg?, box?, layers?}] (i = host piece index)
   * pieces : geometry.buildPieces(items), degenerate ones removed and renumbered (hostI = plan index)
   * spec   : {qty: {hostI: n}, mirror: {hostI: true}}
   * opts   : {base}: first ghost index in the host (default: number of items)
   * returns {items, pieces, copies:[{k, src, mirror, axis, ring}], base, extra, mirrored}
   *   pieces = originals (untouched) + copies (id consecutive after the originals, hostI = base + k)
   */
  function expand(items, pieces, spec, opts) {
    spec = spec || {}; opts = opts || {};
    var qty = spec.qty || {}, mir = spec.mirror || {};
    var base = opts.base !== undefined ? opts.base : (items || []).length;
    var itemBy = {};
    (items || []).forEach(function (it) { itemBy[it.i] = it; });
    var outPieces = pieces.slice(), outItems = (items || []).slice(), copies = [], mirrored = 0;
    var nextId = pieces.reduce(function (m, p) { return Math.max(m, p.id + 1); }, 0);
    pieces.forEach(function (p) { if (p.design === undefined) p.design = 'd' + hostIdx(p); });
    pieces.forEach(function (p) {
      if (p.error) return;
      var h = hostIdx(p), n = clampQty(qty[h] === undefined ? 1 : qty[h]), m = !!mir[h];
      var extra = [];
      for (var c = 1; c < n; c++) extra.push(false);
      if (m) for (var c2 = 0; c2 < n; c2++) extra.push(true);
      if (!extra.length) return;
      var it = itemBy[h] || {}, ax = p.ref[0], mpoly = m ? mirrorPolygon(p.polygon) : null;
      var mrings = m && it.rings ? mirrorRings(it.rings, ax) : null;
      var nPlain = 0, nMir = 0;
      extra.forEach(function (isMir) {
        var k = copies.length, hi = base + k;
        var name = (p.name || ('#' + h)) + (isMir ? ' (mirror ' + (++nMir) + ')' : ' (' + (++nPlain + 1) + ')');
        var poly = isMir ? mpoly : p.polygon;
        outPieces.push({ id: nextId++, name: name, ref: p.ref, polygon: poly, area: p.area, method: p.method,
          parts: p.parts, vertices: p.vertices, hostI: hi, copyOf: h, mirror: isMir, design: p.design + (isMir ? 'm' : '') });
        var vi = { i: hi, name: name, rings: isMir ? mrings : it.rings, copyOf: h, mirror: isMir };
        if (it.rg) vi.rg = it.rg;
        if (it.layer) vi.layer = it.layer;
        if (it.layers) vi.layers = it.layers;
        if (it.box) vi.box = isMir ? mirrorBox(it.box, ax) : it.box;
        if (it.bounds) vi.bounds = isMir ? mirrorBox(it.bounds, ax) : it.bounds;
        outItems.push(vi);
        copies.push({ k: k, src: h, mirror: isMir, axis: ax,
          ring: poly.map(function (q) { return [q[0] + p.ref[0], q[1] + p.ref[1]]; }) });
        if (isMir) mirrored++;
      });
    });
    return { items: outItems, pieces: outPieces, copies: copies, base: base, extra: copies.length, mirrored: mirrored };
  }

  // ------------------------------------------------------------------ clipper helpers
  function toPath(ring) { return ring.map(function (p) { return { X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) }; }); }
  function fromPath(path) { return path.map(function (p) { return [p.X / SCALE, p.Y / SCALE]; }); }
  function ccw(path) { return L().Clipper.Orientation(path) ? path : path.slice().reverse(); }
  function exec(type, subj, clip) {
    var Cl = L(), c = new Cl.Clipper(), out = new Cl.Paths(), f = Cl.PolyFillType.pftNonZero;
    c.AddPaths(subj, Cl.PolyType.ptSubject, true);
    if (clip && clip.length) c.AddPaths(clip, Cl.PolyType.ptClip, true);
    c.Execute(type, out, f, f);
    return out;
  }
  function grow(paths, delta, arcTolPt) {
    var Cl = L(), co = new Cl.ClipperOffset(2, Math.max(1, (arcTolPt || 0.25) * SCALE)), out = new Cl.Paths();
    co.AddPaths(paths, Cl.JoinType.jtRound, Cl.EndType.etClosedPolygon);
    co.Execute(out, delta * SCALE);
    return out;
  }
  function areaP(paths) { var a = 0; for (var i = 0; i < paths.length; i++) a += L().Clipper.Area(paths[i]); return a / (SCALE * SCALE); }
  function outersOf(paths) { var Cl = L(); return paths.filter(function (p) { return p.length >= 3 && Cl.Clipper.Orientation(p); }); }
  function simplifyOut(ring, tol, maxV) {
    var g = G();
    if (ring.length <= maxV) return ring;
    var s = g._internals.simplify(ring, tol, maxV);
    return s ? s.ring : g.convexHull(ring);
  }
  // area occupied by a set of polygons in the nest = union grown by gap/2 (Sparrow keeps them gap apart)
  function grownArea(polys, half) {
    var paths = polys.map(function (r) { return ccw(toPath(r)); });
    return areaP(half > 0 ? grow(exec(L().ClipType.ctUnion, paths), half) : exec(L().ClipType.ctUnion, paths));
  }
  function grownHull(poly, half) {
    var g = G(), pts = [];
    (half > 0 ? grow([ccw(toPath(poly))], half) : [toPath(poly)]).forEach(function (p) { pts = pts.concat(fromPath(p)); });
    return g.area(g.convexHull(pts));
  }

  // ------------------------------------------------------------------ pair search
  /* Best rigid placement of polygon B next to polygon A (both in their own frames), at distance >= gap:
   * candidates = vertices of the no-fit polygon (A grown by gap) (+) (-B) from clipper's Minkowski sum, scored by the
   * area of the convex hull of the pair (compact pairs pack like one piece), checked exactly on the full polygons.
   * rels = relative rotations of B allowed. Returns {b, d, hull} or null. */
  function pairPlacement(A, B, rels, o) {
    var g = G(), Cl = L();
    var sA = simplifyOut(A, o.tol, o.shapeVertices), sB = simplifyOut(B, o.tol, o.shapeVertices);
    var gA = outersOf(grow([ccw(toPath(sA))], o.gap + 0.05, Math.max(0.1, o.tol)));
    if (!gA.length) return null;
    var exactA = grow([ccw(toPath(A))], Math.max(0, o.gap - 0.02), 0.05);
    var best = null;
    rels.forEach(function (b) {
      var rB = sB.map(function (p) { return rot(p, b); });
      var neg = toPath(rB.map(function (p) { return [-p[0], -p[1]]; }));
      var nfp = Cl.Clipper.MinkowskiSum(neg, gA[0], true);
      // candidates: NFP vertices, edge midpoints, and the NFP points that ALIGN the two boxes (left/centre/right,
      // bottom/centre/top): side-by-side placements lie in the middle of NFP edges, not on its vertices
      var bA = g.bbox(A), bB = g.bbox(rB), cands = [];
      var xs = [bA[0] - bB[0], (bA[0] + bA[2] - bB[0] - bB[2]) / 2, bA[2] - bB[2]];
      var ys = [bA[1] - bB[1], (bA[1] + bA[3] - bB[1] - bB[3]) / 2, bA[3] - bB[3]];
      nfp.forEach(function (path) {
        for (var k = 0, n = path.length; k < n; k++) {
          var p0 = [path[k].X / SCALE, path[k].Y / SCALE], q = path[(k + 1) % n], p1 = [q.X / SCALE, q.Y / SCALE];
          cands.push(p0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]);
          xs.forEach(function (x) {
            if ((p0[0] - x) * (p1[0] - x) < 0) { var t = (x - p0[0]) / (p1[0] - p0[0]); cands.push([x, p0[1] + t * (p1[1] - p0[1])]); }
          });
          ys.forEach(function (y) {
            if ((p0[1] - y) * (p1[1] - y) < 0) { var t = (y - p0[1]) / (p1[1] - p0[1]); cands.push([p0[0] + t * (p1[0] - p0[0]), y]); }
          });
        }
      });
      if (!cands.length) return;
      var fullB = B.map(function (p) { return rot(p, b); });
      var scored = cands.map(function (d) {
        var pts = A.concat(fullB.map(function (p) { return [p[0] + d[0], p[1] + d[1]]; }));
        return { d: d, hull: g.area(g.convexHull(pts)) };
      }).sort(function (x, y) { return x.hull - y.hull; });
      var tried = 0;
      for (var i = 0; i < scored.length && tried < o.maxCandidates; i++) {
        var c = scored[i];
        if (best && c.hull >= best.hull) break;
        tried++;
        var pb = ccw(toPath(fullB.map(function (p) { return [p[0] + c.d[0], p[1] + c.d[1]]; })));
        if (areaP(exec(Cl.ClipType.ctIntersection, exactA, [pb])) > 0.01) continue;
        best = { b: b, d: c.d, hull: c.hull };
        break;
      }
    });
    return best;
  }

  /* Cell = rigid group of units. members: [{pid, b, d}] in the frame of the first polygon.
   * A, B: unit polygons (frames of their first members); returns {polygon, members, waste} or null. */
  function makeCell(A, membersA, B, membersB, rels, o) {
    var g = G(), Cl = L();
    var pl = pairPlacement(A, B, rels, o);
    if (!pl) return null;
    var Bp = place(B, pl.b, pl.d);
    // outline: closing of the pair (bridges the gap), outer contour only, simplified CONTAINING the pair
    var r = o.gap / 2 + o.tol * 2 + 0.25;
    var both = exec(Cl.ClipType.ctUnion, [ccw(toPath(A)), ccw(toPath(Bp))]);
    var up = outersOf(grow(both, r, Math.max(0.1, r / 8)));
    if (up.length !== 1) return null;
    var down = outersOf(grow(up, -r, Math.max(0.1, r / 8)));
    if (!down.length) return null;
    var big = down.reduce(function (m, p) { return !m || Math.abs(Cl.Clipper.Area(p)) > Math.abs(Cl.Clipper.Area(m)) ? p : m; }, null);
    var s = g._internals.simplify(g.cleanRing(fromPath(big)), 0.5, 200);
    if (!s) return null;
    var poly = s.ring.map(function (p) { return [Math.fround(p[0]), Math.fround(p[1])]; });
    poly = g.cleanRing(poly, 0);
    if (!g.isSimple(poly)) return null;
    // the outline must contain both polygons (simplify inflates, the closing only adds area)
    var outside = areaP(exec(Cl.ClipType.ctDifference, [ccw(toPath(A)), ccw(toPath(Bp))], [ccw(toPath(poly))]));
    if (outside > 0.5) return null;
    var half = o.gap / 2;
    var piecesArea = grownArea([A], half) + grownArea([Bp], half);
    var cellArea = grownArea([poly], half);
    var waste = cellArea / piecesArea - 1;
    var hullExcess = grownHull(poly, half) / (grownHull(A, half) + grownHull(Bp, half)) - 1;
    if (g.minExtent(poly, o.orientations) > o.stripHeight - 1e-6) return null;
    var members = membersA.slice();
    membersB.forEach(function (m) {
      var q = rot(m.d, pl.b);
      members.push({ pid: m.pid, b: norm(m.b + pl.b), d: [q[0] + pl.d[0], q[1] + pl.d[1]] });
    });
    return { polygon: poly, members: members, waste: waste, hullExcess: hullExcess, rel: pl };
  }
  function acceptable(cell, o) { return !!cell && cell.waste <= o.maxWaste && cell.hullExcess <= o.maxHull; }
  // relative rotations that keep every member inside the allowed set
  function relRotations(orient) {
    if (!orient) return [0, 180];
    var set = {}; orient.forEach(function (a) { set[norm(a)] = true; });
    return set[180] && set[0] ? [0, 180] : [0];
  }
  function relink(members, pids) {   // cell template (members of design pieces 0..n-1) -> actual piece ids
    return members.map(function (m, k) { return { pid: pids[k], b: m.b, d: m.d }; });
  }

  // ------------------------------------------------------------------ 2. Sparrow items
  /**
   * nestPieces: pieces sent to the engine (holes.nestPieces output: srcId = piece id, children removed)
   * returns {items:[{id, polygon, demand, units:[[{pid, b, d}]], kind}], cells, cellsRefused, waste}
   */
  function buildNest(nestPieces, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var units = [];            // {polygon, members, key}
    var cells = 0, refused = 0, wastes = [], skippedSingle = !!o.keepClose;
    var used = {};
    if (o.keepClose) {
      // designs: originals + plain copies share `design`, mirrored copies have design + 'm'
      var byDesign = {}, order = [];
      nestPieces.forEach(function (p) {
        if (p.design === undefined) return;
        var d = String(p.design), key = d.replace(/m$/, '');
        if (!byDesign[key]) { byDesign[key] = { plain: [], mir: [] }; order.push(key); }
        (/m$/.test(d) ? byDesign[key].mir : byDesign[key].plain).push(p);
      });
      var rels = relRotations(o.orientations);
      // one design only: every neighbour is already a sibling, rigid cells would only cost material
      if (order.length < 2) order = [];
      else skippedSingle = false;
      order.forEach(function (key) {
        var grp = byDesign[key], plain = grp.plain, mir = grp.mir;
        if (plain.length + mir.length < 2 || !plain.length) return;
        var P = plain[0].polygon, pairs = [], pair = null, leftovers = [];
        if (mir.length) {                       // L + R cells
          pair = makeCell(P, [{ pid: 0, b: 0, d: [0, 0] }], mir[0].polygon, [{ pid: 1, b: 0, d: [0, 0] }], rels, o);
          var nLR = Math.min(plain.length, mir.length);
          if (acceptable(pair, o)) {
            for (var i = 0; i < nLR; i++) pairs.push([plain[i].id, mir[i].id]);
            leftovers = plain.slice(nLR).concat(mir.slice(nLR));
          } else { if (pair) { refused++; wastes.push(pair.waste); } pair = null; }
        } else {
          pair = makeCell(P, [{ pid: 0, b: 0, d: [0, 0] }], P, [{ pid: 1, b: 0, d: [0, 0] }], rels, o);
          if (acceptable(pair, o)) {
            for (var j = 0; j + 1 < plain.length; j += 2) pairs.push([plain[j].id, plain[j + 1].id]);
            leftovers = plain.length % 2 ? [plain[plain.length - 1]] : [];
          } else { if (pair) { refused++; wastes.push(pair.waste); } pair = null; }
        }
        if (!pair) return;
        wastes.push(pair.waste);
        var quad = null;
        if (o.cellMax >= 4 && pairs.length >= 2) {
          quad = makeCell(pair.polygon, pair.members, pair.polygon, relink(pair.members, [2, 3]), rels, o);
          if (quad && !acceptable(quad, o)) { refused++; wastes.push(quad.waste); quad = null; }
          if (quad) wastes.push(quad.waste);
        }
        var q = 0;
        if (quad) {
          for (; q + 1 < pairs.length; q += 2) {
            units.push({ polygon: quad.polygon, members: relink(quad.members, pairs[q].concat(pairs[q + 1])), key: 'q:' + key });
            cells++;
          }
        }
        for (; q < pairs.length; q++) {
          units.push({ polygon: pair.polygon, members: relink(pair.members, pairs[q]), key: 'p:' + key });
          cells++;
        }
        pairs.forEach(function (pp) { pp.forEach(function (id) { used[id] = true; }); });
        leftovers.forEach(function () { /* singles below */ });
      });
    }
    nestPieces.forEach(function (p) {
      if (used[p.id]) return;
      units.push({ polygon: p.polygon, members: [{ pid: p.id, b: 0, d: [0, 0] }], key: 'x:' + JSON.stringify(p.polygon) });
    });
    // identical outlines -> one Sparrow item with demand (or one item per unit)
    var items = [], byKey = {};
    units.forEach(function (u) {
      var it = o.demand ? byKey[u.key] : null;
      if (!it) {
        it = { id: items.length, polygon: u.polygon, demand: 0, units: [], kind: u.key.charAt(0) };
        items.push(it);
        if (o.demand) byKey[u.key] = it;
      }
      it.demand++;
      it.units.push(u.members);
    });
    return { items: items, cells: cells, cellsRefused: refused, waste: wastes, singleDesign: skippedSingle };
  }

  function buildInstance(wrap, stripHeight, orientations) {
    return {
      name: 'corvo',
      strip_height: stripHeight,
      items: wrap.items.map(function (it) {
        var x = { id: it.id, demand: it.demand, shape: { type: 'simple_polygon', data: it.polygon } };
        if (orientations) x.allowed_orientations = orientations.slice();
        return x;
      })
    };
  }

  // Sparrow placements (item_id = wrap item, repeated for demand) -> one placement per nest piece
  function expandPlacements(placements, wrap) {
    var next = {}, out = [];
    (placements || []).forEach(function (pl) {
      var it = wrap.items[pl.item_id];
      if (!it) return;
      var u = next[pl.item_id] || 0;
      next[pl.item_id] = u + 1;
      var mem = it.units[u];
      if (!mem) return;
      mem.forEach(function (m) {
        var q = rot(m.d, pl.rotation);
        out.push({ item_id: m.pid, rotation: norm(pl.rotation + m.b), translation: [q[0] + pl.translation[0], q[1] + pl.translation[1]] });
      });
    });
    return out;
  }

  // ------------------------------------------------------------------ closeness metric (tests / status)
  /* placements of pieces (strip frame) -> for every piece with siblings of the same design: distance of its centre
   * to the nearest sibling (pt), and whether its nearest neighbour overall is a sibling. */
  function closeness(placements, pieces) {
    var byId = {};
    pieces.forEach(function (p) { byId[p.id] = p; });
    var pts = [];
    placements.forEach(function (pl) {
      var p = byId[pl.item_id];
      if (!p) return;
      var b = G().bbox(p.polygon), c = rot([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], pl.rotation);
      pts.push({ id: p.id, d: String(p.design === undefined ? 'd' + p.id : p.design).replace(/m$/, ''), x: c[0] + pl.translation[0], y: c[1] + pl.translation[1] });
    });
    var n = 0, sum = 0, nnSame = 0;
    pts.forEach(function (a) {
      var bestSame = Infinity, bestAll = Infinity, allSame = false, sib = 0;
      pts.forEach(function (b) {
        if (a === b) return;
        var dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (b.d === a.d) { sib++; if (dd < bestSame) bestSame = dd; }
        if (dd < bestAll) { bestAll = dd; allSame = b.d === a.d; }
      });
      if (!sib) return;
      n++; sum += bestSame; if (allSame) nnSame++;
    });
    return { n: n, meanNearestSibling: n ? sum / n : 0, nearestIsSibling: n ? nnSame / n : 1 };
  }

  return { DEFAULTS: DEFAULTS, MAX_QTY: MAX_QTY, expand: expand, buildNest: buildNest, buildInstance: buildInstance,
           expandPlacements: expandPlacements, closeness: closeness,
           mirrorPolygon: mirrorPolygon, mirrorRings: mirrorRings, clampQty: clampQty,
           _internals: { pairPlacement: pairPlacement, makeCell: makeCell, relRotations: relRotations } };
});
