/* Corvo cluster: from the items exported by corvoExport to the PIECES to nest (module 1, "fidelity to the file").
 *
 * Pure functions, no DOM. Browser: window.CorvoCluster (needs window.CorvoGeometry + ClipperLib).
 * Node: module.exports (requires ./geometry.js).
 *
 *   1. registration marks are excluded (layer named Reg/Marks/Registration/OPOS/..., or a tiny square-ish mark
 *      near an artboard corner that touches nothing else): they are never moved.
 *   2. "merge overlapping objects" (default on), shape 'all': top-level items whose boxes overlap, across layers, become ONE
 *      piece (union-find). Boxes must overlap by more than `tol` (0.5 pt) on both axes. When two boxes only
 *      PARTIALLY overlap (neither contains the other), the real shapes must also touch (clipper intersection of
 *      the silhouettes grown by `touch` pt): kerned letters with overlapping boxes stay separate, while print art +
 *      cut line (one contains the other) or a decal made of overlapping shapes stay together.
 *      Shape 'cut': clustering is anchored on the cut lines (clusterCutAnchored) — bleeds overlapping a neighbour
 *      never glue two stickers together.
 *   3. shape source per piece: 'all' = every visible path (+ bounding rectangle of rasters / placed images);
 *      'cut' = only the paths painted with a cut spot color (CutContour, Thru-cut, ...), fallback to 'all' when a
 *      piece has none (counted in warnings.cutFallback).
 *   4. errors: live text that would define the shape (code 'text'), a piece made only of images (code 'rasterOnly').
 *      Pieces with nothing closed (lines only) are skipped (warnings.noContour).
 *
 * Box convention: [left, top, right, bottom] in document points, y up (top > bottom) — as corvoExport.
 */
(function (root, factory) {
  var G = (root && root.CorvoGeometry) || null;
  if (!G && typeof require === 'function' && typeof window === 'undefined') {
    try { G = require('./geometry.js'); } catch (e) { /* resolved lazily */ }
  }
  var api = factory(G);
  if (root) root.CorvoCluster = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (GInit) {
  'use strict';

  var MM = 72 / 25.4;
  var DEFAULTS = {
    merge: true,          // merge overlapping objects into one piece
    shape: 'all',         // 'all' | 'cut'
    tol: 0.5,             // pt: boxes must overlap by more than this
    touch: 0.25,          // pt: partial overlaps merge only if the shapes come this close
    regMarks: true,       // exclude registration marks
    regMaxMm: 12,         // a mark is at most this big ...
    regMinMm: 0.3,
    regCornerMm: 30,      // ... and its centre is this close to an artboard corner
    regAspect: 1.4,
    frames: true,         // a cut frame / artboard-size background around several pieces stays in place
    frameArtboard: 0.9,   // "as big as an artboard" = overlaps at least 90 % of it
    lockedCuts: null      // corvoExport().lockedCuts: cut lines on locked/hidden layers (not selectable)
  };

  function geo() {
    var G = GInit || (typeof window !== 'undefined' && window.CorvoGeometry) || (typeof self !== 'undefined' && self.CorvoGeometry);
    if (!G) throw new Error('CorvoGeometry not loaded');
    return G;
  }

  // ---------------------------------------------------------------- boxes
  function boxW(b) { return b[2] - b[0]; }
  function boxH(b) { return b[1] - b[3]; }
  function validBox(b) { return b && b.length === 4 && isFinite(b[0]) && b[2] >= b[0] && b[1] >= b[3]; }

  // overlap of more than tol on both axes
  function boxesOverlap(a, b, tol) {
    tol = tol || 0;
    return Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > tol &&
           Math.min(a[1], b[1]) - Math.max(a[3], b[3]) > tol;
  }
  // a inside b (b grown by tol)
  function boxInside(a, b, tol) {
    tol = tol || 0;
    return a[0] >= b[0] - tol && a[2] <= b[2] + tol && a[3] >= b[3] - tol && a[1] <= b[1] + tol;
  }
  function boxUnion(a, b) {
    return [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3])];
  }

  // ---------------------------------------------------------------- registration marks
  var REG_LAYER = /(^|[^a-z])(reg|regs|regmarks?|registration|registro|marks|cropmarks?|crocini|opos|arms|passer|registermarken)([^a-z]|$)/i;
  function isRegLayerName(name) {
    if (!name) return false;
    var n = String(name).replace(/[_\-.]+/g, ' ');
    return REG_LAYER.test(n) || /reg\s*marks?|registration\s*marks?|crop\s*marks?|segni\s*di\s*registro/i.test(n);
  }

  // tiny, square-ish, near a corner of any artboard, and not touching any other item
  function looksLikeRegMark(item, artboards, otherBoxes, o) {
    var b = item.box;
    if (!validBox(b)) return false;
    var w = boxW(b), h = boxH(b), mx = Math.max(w, h), mn = Math.min(w, h);
    if (mx > o.regMaxMm * MM || mx < o.regMinMm * MM) return false;
    if (mn <= 0 || mx / mn > o.regAspect) return false;
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, near = false, d = o.regCornerMm * MM;
    for (var k = 0; k < (artboards || []).length && !near; k++) {
      var ab = artboards[k], corners = [[ab[0], ab[1]], [ab[2], ab[1]], [ab[0], ab[3]], [ab[2], ab[3]]];
      for (var c = 0; c < 4; c++) {
        if (Math.abs(cx - corners[c][0]) <= d && Math.abs(cy - corners[c][1]) <= d) { near = true; break; }
      }
    }
    if (!near) return false;
    for (var j = 0; j < otherBoxes.length; j++) {
      if (otherBoxes[j] !== b && validBox(otherBoxes[j]) && boxesOverlap(b, otherBoxes[j], 0)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- union-find
  function makeUF(n) {
    var p = [];
    for (var i = 0; i < n; i++) p.push(i);
    function find(x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) { if (a < b) p[b] = a; else p[a] = b; } }
    return { find: find, union: union };
  }

  /**
   * Group boxes: i and j end in the same group if their boxes overlap by more than tol and either one contains
   * the other or shapesTouch(i, j) says so (omit it to merge on box overlap alone).
   * Returns arrays of indices, sorted, groups ordered by their first index.
   */
  function clusterBoxes(boxes, tol, shapesTouch) {
    var n = boxes.length, uf = makeUF(n), order = [], i, j;
    for (i = 0; i < n; i++) order.push(i);
    order.sort(function (a, b) { return boxes[a][0] - boxes[b][0]; });      // sweep on x
    for (var oi = 0; oi < n; oi++) {
      i = order[oi];
      var a = boxes[i];
      for (var oj = oi + 1; oj < n; oj++) {
        j = order[oj];
        var b = boxes[j];
        if (b[0] >= a[2] - tol) break;                                        // no x overlap beyond tol
        if (uf.find(i) === uf.find(j)) continue;
        if (!boxesOverlap(a, b, tol)) continue;
        var contained = boxInside(a, b, tol) || boxInside(b, a, tol);
        if (contained || !shapesTouch || shapesTouch(i, j)) uf.union(i, j);
      }
    }
    var groups = {}, out = [];
    for (i = 0; i < n; i++) {
      var r = uf.find(i);
      if (!groups[r]) { groups[r] = []; out.push(groups[r]); }
      groups[r].push(i);
    }
    out.forEach(function (g) { g.sort(function (x, y) { return x - y; }); });
    out.sort(function (x, y) { return x[0] - y[0]; });
    return out;
  }

  // ---------------------------------------------------------------- shape contact (clipper)
  function makeToucher(items, touch) {
    var cache = {};
    function sil(k) {
      if (cache[k] !== undefined) return cache[k];
      var it = items[k], rings = (it.rings || []).concat(it.other || []), G = geo(), I = G._internals, s = null;
      rings = rings.map(function (r) { return G.cleanRing(r); }).filter(function (r) { return r.length >= 3 && G.area(r) > 1e-6; });
      if (rings.length) s = I.offset(I.silhouette(rings), touch / 2, 0.1);
      cache[k] = s;
      return s;
    }
    return function (i, j) {
      var a = sil(i), b = sil(j);
      if (!a || !a.length || !b || !b.length) return true;                  // no closed shape: trust the boxes
      var C = geo()._internals.lib(), c = new C.Clipper(), out = new C.Paths();
      c.AddPaths(a, C.PolyType.ptSubject, true);
      c.AddPaths(b, C.PolyType.ptClip, true);
      c.Execute(C.ClipType.ctIntersection, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
      return out.length > 0;
    };
  }

  function ringsBox(rings) {
    var b = [Infinity, -Infinity, -Infinity, Infinity];
    for (var i = 0; i < rings.length; i++) for (var k = 0; k < rings[i].length; k++) {
      var p = rings[i][k];
      if (p[0] < b[0]) b[0] = p[0];
      if (p[0] > b[2]) b[2] = p[0];
      if (p[1] > b[1]) b[1] = p[1];
      if (p[1] < b[3]) b[3] = p[1];
    }
    return b;
  }
  function overlapArea(a, b) {
    var w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[1], b[1]) - Math.max(a[3], b[3]);
    return w > 0 && h > 0 ? w * h : 0;
  }

  /**
   * "Cut line only" clustering, anchored on the cut lines (print & cut sheets):
   *   - items that carry cut paths are anchors; anchors merge only when their CUT shapes overlap/contain each other
   *     (so bleeds that overlap a neighbour — e.g. a sheet already nested with a gap smaller than the bleed — never
   *     glue two stickers together);
   *   - every other item joins the anchor group whose cut box it overlaps the most (by more than tol);
   *   - items overlapping no cut line are clustered among themselves with the normal rule (-> fallback pieces).
   */
  function clusterCutAnchored(items, o) {
    var anchors = [], rest = [], i, k;
    for (i = 0; i < items.length; i++) ((items[i].cut && items[i].cut.length) ? anchors : rest).push(i);
    var cutItems = anchors.map(function (x) {
      var it = items[x], rings = it.cut.map(function (c) { return it.rings[c]; }).filter(Boolean);
      return { rings: rings, box: ringsBox(rings) };
    });
    var ag = clusterBoxes(cutItems.map(function (c) { return c.box; }), o.tol, makeToucher(cutItems, o.touch));
    var groups = ag.map(function (g) { return g.map(function (x) { return anchors[x]; }); });
    var gBoxes = ag.map(function (g) { return g.map(function (x) { return cutItems[x].box; }); });
    var loose = [];
    for (k = 0; k < rest.length; k++) {
      var b = items[rest[k]].box, best = -1, bestA = 0;
      for (var g = 0; g < gBoxes.length; g++) {
        for (var q = 0; q < gBoxes[g].length; q++) {
          var cb = gBoxes[g][q];
          if (!boxesOverlap(b, cb, o.tol) && !boxInside(cb, b, o.tol) && !boxInside(b, cb, o.tol)) continue;
          var a = overlapArea(b, cb);
          if (a > bestA) { bestA = a; best = g; }
        }
      }
      if (best >= 0) groups[best].push(rest[k]); else loose.push(rest[k]);
    }
    if (loose.length) {
      var lg = clusterBoxes(loose.map(function (x) { return items[x].box; }), o.tol, makeToucher(loose.map(function (x) { return items[x]; }), o.touch));
      lg.forEach(function (g) { groups.push(g.map(function (x) { return loose[x]; })); });
    }
    groups.forEach(function (g) { g.sort(function (x, y) { return x - y; }); });
    groups.sort(function (x, y) { return x[0] - y[0]; });
    return groups;
  }

  // ---------------------------------------------------------------- sheet frames
  function boxArea(b) { return Math.max(0, boxW(b)) * Math.max(0, boxH(b)); }
  // true when at least two of the boxes do not overlap each other (-> separate pieces)
  function twoApart(boxes, tol) {
    for (var i = 0; i < boxes.length; i++) for (var j = i + 1; j < boxes.length; j++) if (!boxesOverlap(boxes[i], boxes[j], tol)) return true;
    return false;
  }
  function coversArtboard(b, artboards, o) {
    for (var k = 0; k < (artboards || []).length; k++) {
      var ab = artboards[k], ov = overlapArea(b, ab);
      if (boxArea(ab) > 0 && ov >= o.frameArtboard * boxArea(ab) && ov >= o.frameArtboard * boxArea(b)) return true;
    }
    return false;
  }
  /**
   * Sheet frames: a top-level object that only draws a frame around several separate pieces:
   *   - a pure cut line (every ring is a cut ring, e.g. the sheet's "Through Cut Rectangle"), or
   *   - a single shape as big as an artboard (the sheet's background colour),
   * whose box contains at least two other objects that do not overlap each other. Left in place (never moved), noted.
   * Without this rule the frame would glue every sticker of the sheet into ONE piece.
   */
  function findFrames(keep, o) {
    var frames = [];
    for (var a = 0; a < keep.length; a++) {
      var it = keep[a], rings = it.rings || [], cut = it.cut || [], fb = null;
      var pure = !(it.other && it.other.length) && !it.text;
      if (pure && cut.length && cut.length === rings.length) fb = it.box;
      else if (pure && rings.length === 1 && !cut.length && coversArtboard(it.box, o.artboards, o)) fb = it.box;
      if (!fb) continue;
      var inside = [];
      for (var b = 0; b < keep.length; b++) {
        if (b === a) continue;
        var bb = keep[b].box;
        if (boxInside(bb, fb, o.tol) && boxArea(bb) < 0.8 * boxArea(fb)) inside.push(bb);
      }
      if (inside.length >= 2 && twoApart(inside, o.tol)) frames.push(a);
    }
    return frames;
  }

  // ---------------------------------------------------------------- plan
  // punto dentro l'area pari-dispari degli anelli (ray casting)
  function pointInRings(x, y, rings) {
    var inside = false;
    for (var r = 0; r < rings.length; r++) {
      var R = rings[r], n = R.length;
      for (var a = 0, b = n - 1; a < n; b = a++) {
        var ya = R[a][1], yb = R[b][1];
        if ((ya > y) !== (yb > y) && x < (R[b][0] - R[a][0]) * (y - ya) / (yb - ya) + R[a][0]) inside = !inside;
      }
    }
    return inside;
  }
  // box [l, t, r, b] (y in alto) dentro l'area degli anelli: 4 angoli (rientrati di 0,5 pt) + centro
  function boxInRings(tb, rings) {
    var l = Math.min(tb[0], tb[2]) + 0.5, r = Math.max(tb[0], tb[2]) - 0.5, bo = Math.min(tb[1], tb[3]) + 0.5, t = Math.max(tb[1], tb[3]) - 0.5;
    if (!(r >= l) || !(t >= bo)) { l = r = (tb[0] + tb[2]) / 2; bo = t = (tb[1] + tb[3]) / 2; }
    return [[l, bo], [r, bo], [r, t], [l, t], [(l + r) / 2, (bo + t) / 2]].every(function (p) { return pointInRings(p[0], p[1], rings); });
  }

  /**
   * items: corvoExport().items  ({i, name, layer, rings, cut?, other?, text?, nonVector?, box})
   * opts : {merge, shape, tol, touch, artboards, ...DEFAULTS}
   * returns {
   *   pieces:  [{i, members:[item.i...], name, layers:[...], source:'all'|'cut'|'fallback', rings}],
   *   excluded:[{i, name, reason:'regMark'}],
   *   warnings:{regMarks, cutFallback, noContour, merged:{objects, pieces}, nonVector},
   *   error?:  {code:'text'|'rasterOnly', n, names}
   * }
   */
  function planPieces(items, opts) {
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in (opts || {})) if (opts[k] !== undefined) o[k] = opts[k];
    items = (items || []).filter(function (it) { return it && validBox(it.box); });

    // 1. registration marks
    var excluded = [], keep = [];
    if (o.regMarks) {
      var boxes = items.map(function (it) { return it.box; });
      items.forEach(function (it) {
        if (isRegLayerName(it.layer) || looksLikeRegMark(it, o.artboards, boxes, o)) excluded.push({ i: it.i, name: it.name || it.type || ('#' + it.i), reason: 'regMark', layer: it.layer });
        else keep.push(it);
      });
    } else keep = items.slice();

    // 1b. sheet frames (Through Cut Rectangle of a sticker sheet, artboard-size background)
    var frames = [];
    if (o.frames && keep.length > 2) {
      var fr = findFrames(keep, o);
      if (fr.length) {
        var rest = [];
        keep.forEach(function (it, x) {
          if (fr.indexOf(x) >= 0) {
            excluded.push({ i: it.i, name: it.name || it.type || ('#' + it.i), reason: 'sheetFrame', layer: it.layer });
            frames.push(it.name || (it.cutSpots && it.cutSpots[0]) || it.type || ('#' + it.i));
          } else rest.push(it);
        });
        keep = rest;
      }
    }

    // 2. clusters
    var groups;
    if (o.merge && keep.length > 1 && o.shape === 'cut') groups = clusterCutAnchored(keep, o);
    else if (o.merge && keep.length > 1) groups = clusterBoxes(keep.map(function (it) { return it.box; }), o.tol, makeToucher(keep, o.touch));
    else groups = keep.map(function (_, x) { return [x]; });

    // 3. shape per cluster
    var pieces = [], textN = 0, textInside = 0, textNames = [], rasterNames = [], noContour = [], fallback = 0, mergedObjects = 0, nonVector = 0;
    groups.forEach(function (g) {
      var mem = g.map(function (x) { return keep[x]; });
      if (mem.length > 1) mergedObjects += mem.length;
      var cutRings = [], allRings = [], otherRings = [], cutRg = [], allRg = [], otherRg = [], text = 0, layers = [], textBoxes = [];
      mem.forEach(function (it, m) {
        var rs = it.rings || [], cut = it.cut || [], rg = it.rg && it.rg.length === rs.length ? it.rg : null;
        // ring -> source path key (member * 1e6 + path id): the filled area is computed per path (even-odd inside a
        // compound path), then united across paths, so overlapping print shapes do not cancel each other
        var key = function (q) { return m * 1e6 + (rg ? rg[q] : q); };
        for (var c = 0; c < cut.length; c++) if (rs[cut[c]]) { cutRings.push(rs[cut[c]]); cutRg.push(key(cut[c])); }
        for (var q = 0; q < rs.length; q++) { allRings.push(rs[q]); allRg.push(key(q)); }
        (it.other || []).forEach(function (r) { otherRings.push(r); otherRg.push(-1 - otherRg.length); });
        text += it.text || 0;
        if (it.text) textBoxes = it.textBoxes && it.textBoxes.length === it.text && textBoxes ? textBoxes.concat(it.textBoxes) : null;
        nonVector += it.nonVector || 0;
        if (layers.indexOf(it.layer) < 0) layers.push(it.layer);
      });
      var name = mem[0].name || mem[0].type || ('#' + mem[0].i);
      if (mem.length > 1) name += ' (+' + (mem.length - 1) + ')';
      var source = 'all', rings, rgs;
      if (o.shape === 'cut' && cutRings.length) { source = 'cut'; rings = cutRings; rgs = cutRg; }
      else {
        if (o.shape === 'cut') { source = 'fallback'; fallback++; }
        // testo vivo DENTRO l'area del pezzo (etichette dei file laser, numeri di parte): non cambia la sagoma, si muove
        // col pezzo; solo il testo che esce dalla sagoma (o senza ingombro noto) la definirebbe -> errore
        if (text && !(textBoxes && allRings.length && textBoxes.every(function (tb) { return boxInRings(tb, allRings); }))) { textN += text; textNames.push(name); return; }
        if (text) textInside += text;
        if (!allRings.length) {
          if (otherRings.length) rasterNames.push(name);
          else noContour.push(name);
          return;
        }
        rings = allRings.concat(otherRings); rgs = allRg.concat(otherRg);
      }
      var pbox = mem.reduce(function (acc, it) { return acc ? boxUnion(acc, it.box) : it.box.slice(); }, null);
      pieces.push({ i: pieces.length, members: mem.map(function (it) { return it.i; }), name: name,
                    layers: layers, source: source, rings: rings, rg: rgs, box: pbox });
    });

    // 4. cut lines on locked / hidden layers (not selectable, never unlocked by Corvo): touching a piece -> error,
    //    around several pieces (the sheet frame) -> note
    var lockedHit = [], lockedFrame = [];
    (o.lockedCuts || []).forEach(function (lc) {
      if (!validBox(lc.box)) return;
      var inside = 0, touch = 0;
      pieces.forEach(function (p) {
        if (boxInside(p.box, lc.box, o.tol) && boxArea(p.box) < 0.8 * boxArea(lc.box)) inside++;
        else if (boxesOverlap(p.box, lc.box, o.tol) || boxInside(lc.box, p.box, o.tol)) touch++;
      });
      if (touch || inside === 1) lockedHit.push(lc);
      else if (inside >= 2) lockedFrame.push(lc);
    });
    function lcInfo(list) {
      var layers = [], spots = [], hidden = 0;
      list.forEach(function (lc) {
        if (layers.indexOf(lc.layer) < 0) layers.push(lc.layer);
        if (spots.indexOf(lc.spot) < 0) spots.push(lc.spot);
        if (lc.reason === 'hidden') hidden++;
      });
      return { n: list.length, layers: layers, spots: spots, hidden: hidden };
    }

    var regN = excluded.filter(function (e) { return e.reason === 'regMark'; }).length;
    var res = {
      pieces: pieces,
      excluded: excluded,
      warnings: { regMarks: regN, sheetFrames: frames.length, sheetFrameNames: frames,
                  lockedFrames: lockedFrame.length ? lcInfo(lockedFrame) : null, cutFallback: fallback, noContour: noContour.length, noContourNames: noContour,
                  merged: { objects: mergedObjects, pieces: groups.filter(function (g) { return g.length > 1; }).length },
                  nonVector: nonVector, textInside: textInside }
    };
    if (lockedHit.length) {
      var li = lcInfo(lockedHit);
      res.error = { code: 'lockedCut', n: li.n, names: li.spots, layers: li.layers, hidden: li.hidden };
    } else if (textN) res.error = { code: 'text', n: textN, names: textNames };
    else if (rasterNames.length) res.error = { code: 'rasterOnly', n: rasterNames.length, names: rasterNames };
    return res;
  }

  return {
    DEFAULTS: DEFAULTS,
    boxesOverlap: boxesOverlap, boxInside: boxInside, boxUnion: boxUnion,
    isRegLayerName: isRegLayerName, looksLikeRegMark: looksLikeRegMark,
    clusterBoxes: clusterBoxes, clusterCutAnchored: clusterCutAnchored, planPieces: planPieces
  };
});
