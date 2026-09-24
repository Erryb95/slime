/* Corvo — Modulo 7: multi-foglio (laser / fresa). Pure, no DOM.
 * Browser: window.CorvoSheets (needs window.CorvoMultinest). Node: module.exports (requires ./multinest.js).
 *
 * Sparrow (jagua-rs `spp`) only does STRIP packing. Greedy multi-sheet on top of it:
 *   0. usable sheet = sheet - 2 x margin (margin = clamps / border, separate from the gap = Sparrow min separation);
 *      a piece that fits the usable sheet in no allowed orientation -> error {code:'tooBig'} (clear, before nesting).
 *   1. remaining pieces sorted by area (desc); nest ALL of them on a strip of height = usable sheet height for a
 *      short time (splitSecs); cut at the usable sheet length: the pieces entirely inside go to sheet k.
 *   2. fill: pieces left out are tried again on sheet k in area-estimated batches (largest first, halving the batch
 *      when it does not fit, at most `fillTries` nests): accepted only if the whole layout stays inside the sheet.
 *   3. the rest goes to the next iteration (sheet k+1) until nothing is left.
 *   3b. minimum number of sheets: while above the lower bound ceil(area / usable sheet area), the pieces of the last
 *      sheet are moved into the earlier sheets with the most free area (same batch logic, `consolidateTries` nests);
 *      an emptied last sheet is dropped (res.consolidated counts them).
 *   4. final pass: every sheet is re-nested alone with the full time budget (finalSecs); the new layout is kept only
 *      if it is inside the sheet (the split layout is already valid, so the fit is always confirmed). The last sheet
 *      reports its used length (the remnant can be reused).
 * Grain lock: global (`grain`) or per piece (unit.grain) -> orientations restricted to 0/180 (multinest.grainOrients).
 * Future work: jagua-rs 0.8.3 has a `bpp` feature (bin packing: Bin{container, stock, cost}) but sparrow only
 * implements `spp`; a real bin-packing solver in Rust would replace this greedy.
 *
 *   planSheets(units, opts, runNest, hooks) -> Promise<{sheets, Lu, Hu, lowerBound, lowerBoundUsable, nests, error?}>
 *     units : nest pieces {id, polygon (relative, Sparrow), area, name, grain?}
 *     opts  : {sheetW, sheetH (pt; x = along the sheet, y = strip height), margin (pt), orient (array|null),
 *              grain (bool), splitSecs, finalSecs, fillTries, finalPass ('all'|'last'|'none'), hurry(): bool}
 *     runNest(instance, secs, onReport) -> Promise<best report>   (worker in the panel, wasm in Node)
 *     hooks : {onPhase({phase:'split'|'fill'|'consolidate'|'final', sheet, n}), onReport({phase, sheet, units, report}),
 *              onSheet(k, sheet) (sheet k closed by the greedy, then again after its final pass)}
 *     sheets: [{units, placements (item_id = unit id, usable-sheet frame: (0,0) = sheet corner + margin),
 *               usedLength (pt, rightmost point), area (pt²), fillUsable, fillSheet}]
 */
(function (root, factory) {
  var MN = (root && root.CorvoMultinest) || null;
  if (!MN && typeof require === 'function' && typeof window === 'undefined') {
    try { MN = require('./multinest.js'); } catch (e) { /* resolved lazily */ }
  }
  var api = factory(MN);
  if (root) root.CorvoSheets = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (MNInit) {
  'use strict';

  var MM = 72 / 25.4;
  // standard sheets, mm: w = along the sheet (long side), h = across (strip height)
  var PRESETS = {
    '600x400': { w: 600, h: 400, label: '600 × 400 mm' },
    '1000x600': { w: 1000, h: 600, label: '1000 × 600 mm' },
    '1220x2440': { w: 2440, h: 1220, label: '1220 × 2440 mm' }
  };
  var ORDER = ['600x400', '1000x600', '1220x2440', 'custom'];
  var DEFAULTS = { margin: 10 * MM, splitSecs: 2, finalSecs: 10, fillTries: 4, fillTarget: 0.92, consolidateTries: 8, finalPass: 'all' };
  var EPS = 1e-3;

  function mn() {
    var M = MNInit || (typeof window !== 'undefined' && window.CorvoMultinest) || (typeof self !== 'undefined' && self.CorvoMultinest);
    if (!M) throw new Error('CorvoMultinest not loaded');
    return M;
  }

  /* sheet dimensions (mm) of a preset or custom w/h; the long side goes along the strip (x) */
  function sheetSize(id, wMm, hMm) {
    var p = PRESETS[id];
    var a = p ? p.w : +wMm, b = p ? p.h : +hMm;
    if (!(a > 0) || !(b > 0)) return null;
    return { w: Math.max(a, b), h: Math.min(a, b) };
  }

  function planSheets(units, opts, runNest, hooks) {
    var M = mn(), o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in (opts || {})) if (opts[k] !== undefined) o[k] = opts[k];
    hooks = hooks || {};
    var Lu = o.sheetW - 2 * o.margin, Hu = o.sheetH - 2 * o.margin;
    var res = { sheets: [], Lu: Lu, Hu: Hu, nests: 0, sheetArea: o.sheetW * o.sheetH, usableArea: Lu * Hu };
    if (!(Lu > 0) || !(Hu > 0)) { res.error = { code: 'marginTooBig' }; return Promise.resolve(res); }
    var gOr = M.grainOrients(o.orient);
    function orientFor(u) { return (o.grain || u.grain) ? gOr : o.orient; }
    var big = units.filter(function (u) { return !M.fitsRect(u.polygon, orientFor(u), Lu, Hu); });
    if (big.length) {
      res.error = { code: 'tooBig', names: big.map(function (u) { return u.name || ('#' + u.id); }), LuMm: Lu / MM, HuMm: Hu / MM };
      return Promise.resolve(res);
    }
    var total = M.areaOf(units);
    res.lowerBound = Math.ceil(total / res.sheetArea - 1e-9);
    res.lowerBoundUsable = Math.ceil(total / res.usableArea - 1e-9);
    var hurry = function () { return !!(o.hurry && o.hurry()); };

    function nest(list, secs, phase, sheet) {
      res.nests++;
      var inst = M.subsetInstance(list, Hu, orientFor);
      return Promise.resolve(runNest(inst, secs, function (rep) {
        if (hooks.onReport) hooks.onReport({ phase: phase, sheet: sheet, units: list, report: rep });
      })).then(function (rep) {
        if (!rep) throw new Error('no layout');
        var pls = M.mapPlacements(rep, list);
        return { placements: pls, maxX: M.maxX(pls, M.byId(list)), complete: pls.length === list.length };
      });
    }
    function fits(r) { return r.complete && r.maxX <= Lu + EPS; }
    function without(list, drop) {
      var s = {}; drop.forEach(function (u) { s[u.id] = true; });
      return list.filter(function (u) { return !s[u.id]; });
    }

    var rest = units.slice().sort(function (a, b) { return b.area - a.area; });

    /* try to add candidates to a sheet layout {S, P}: batches estimated from the free area (largest first), halved
     * when they do not fit; a single piece that does not fit also drops the candidates at least as large (area
     * heuristic), so the remaining tries go to smaller pieces. Resolves {S, P, added:[units]}. */
    function absorb(S, P, cands, maxTries, phase, sk) {
      var tries = 0, batch = null, added = [];
      cands = cands.slice();
      function makeBatch() {
        var free = Lu * Hu * o.fillTarget - M.areaOf(S), acc = 0, b = [];
        cands.forEach(function (c) { if (acc + c.area <= free) { b.push(c); acc += c.area; } });
        return b;
      }
      function step() {
        if (hurry() || tries >= maxTries || !cands.length) return Promise.resolve({ S: S, P: P, added: added });
        if (!batch || !batch.length) batch = makeBatch();
        if (!batch.length) return Promise.resolve({ S: S, P: P, added: added });
        tries++;
        if (hooks.onPhase) hooks.onPhase({ phase: phase, sheet: sk, n: S.length + batch.length });
        return nest(S.concat(batch), o.splitSecs, phase, sk).then(function (r2) {
          if (fits(r2)) {
            S = S.concat(batch); P = r2.placements; added = added.concat(batch); cands = without(cands, batch); batch = null;
          } else if (batch.length === 1) {
            var aMax = batch[0].area * 0.999;
            cands = without(cands, batch).filter(function (c) { return c.area < aMax; }); batch = null;
          } else batch = batch.slice(0, Math.ceil(batch.length / 2));
          return step();
        });
      }
      return step();
    }

    function nextSheet() {
      if (!rest.length) return Promise.resolve();
      var sk = res.sheets.length, S, P;
      if (hooks.onPhase) hooks.onPhase({ phase: 'split', sheet: sk, n: rest.length });
      return nest(rest, o.splitSecs, 'split', sk).then(function (r) {
        if (fits(r)) { S = rest; P = r.placements; return null; }           // everything left fits: last sheet
        var byId = M.byId(rest);
        var inPl = r.placements.filter(function (pl) { return M.placedBox(byId[pl.item_id], pl)[2] <= Lu + EPS; });
        var inIds = {}; inPl.forEach(function (pl) { inIds[pl.item_id] = true; });
        S = rest.filter(function (u) { return inIds[u.id]; }); P = inPl;
        var start = S.length ? Promise.resolve() :                           // nothing inside the cut: the largest alone
          nest(S = [rest[0]], Math.min(1, o.splitSecs), 'split', sk).then(function (r1) { P = r1.placements; });
        return start.then(function () { return absorb(S, P, without(rest, S), o.fillTries, 'fill', sk); })
          .then(function (a) { S = a.S; P = a.P; });
      }).then(function () {
        res.sheets.push({ units: S, placements: P });
        rest = without(rest, S);
        if (hooks.onSheet) hooks.onSheet(sk, res.sheets[sk]);
        return nextSheet();
      });
    }

    /* minimum number of sheets: while above the lower bound, try to move the pieces of the LAST sheet into the
     * earlier sheets (most free area first); an emptied last sheet is dropped. Removing pieces from a valid layout
     * keeps it valid, so the last sheet keeps its placements minus the moved pieces. */
    function consolidate() {
      var budget = o.consolidateTries;
      function step() {
        var n = res.sheets.length;
        if (hurry() || n < 2 || budget <= 0 || n <= res.lowerBoundUsable) return Promise.resolve();
        var last = res.sheets[n - 1];
        var targets = res.sheets.slice(0, n - 1).map(function (s, i) { return { i: i, free: Lu * Hu * o.fillTarget - M.areaOf(s.units) }; })
          .filter(function (x) { return x.free > 0; }).sort(function (a, b) { return b.free - a.free; });
        if (!targets.length || M.areaOf(last.units) > targets.reduce(function (s, x) { return s + x.free; }, 0)) return Promise.resolve();
        var q = 0, moved = 0;
        function tryTarget() {
          if (q >= targets.length || budget <= 0 || !last.units.length || hurry()) return Promise.resolve();
          var ti = targets[q++].i, tg = res.sheets[ti], tries = Math.min(2, budget);
          var cands = last.units.slice().sort(function (a, b) { return b.area - a.area; });
          return absorb(tg.units, tg.placements, cands, tries, 'consolidate', ti).then(function (a) {
            budget -= tries;
            if (a.added.length) {
              tg.units = a.S; tg.placements = a.P; moved += a.added.length;
              last.units = without(last.units, a.added);
              var keep = {}; last.units.forEach(function (u) { keep[u.id] = true; });
              last.placements = last.placements.filter(function (pl) { return keep[pl.item_id]; });
              if (hooks.onSheet) hooks.onSheet(ti, tg);
            }
            return tryTarget();
          });
        }
        return tryTarget().then(function () {
          if (!last.units.length) { res.sheets.pop(); res.consolidated = (res.consolidated || 0) + 1; return step(); }
          if (hooks.onSheet) hooks.onSheet(n - 1, last);
          return null;                                      // could not empty it: stop
        });
      }
      return step();
    }

    function finalPass() {
      var idx = [];
      res.sheets.forEach(function (_, i) {
        if (o.finalPass === 'all' || (o.finalPass === 'last' && i === res.sheets.length - 1)) idx.push(i);
      });
      var q = 0;
      function one() {
        if (q >= idx.length || hurry()) return Promise.resolve();
        var i = idx[q++], sh = res.sheets[i];
        if (hooks.onPhase) hooks.onPhase({ phase: 'final', sheet: i, n: sh.units.length });
        return nest(sh.units, o.finalSecs, 'final', i).then(function (r) {
          var cur = M.maxX(sh.placements, M.byId(sh.units));
          if (fits(r) && r.maxX <= cur + EPS) sh.placements = r.placements;
          sh.confirmed = fits(r);
          if (hooks.onSheet) hooks.onSheet(i, sh);
          return one();
        });
      }
      return one();
    }

    return nextSheet().then(consolidate).then(finalPass).then(function () {
      res.sheets.forEach(function (sh) {
        sh.usedLength = M.maxX(sh.placements, M.byId(sh.units));
        sh.area = M.areaOf(sh.units);
        sh.fillUsable = sh.area / res.usableArea;
        sh.fillSheet = sh.area / res.sheetArea;
      });
      return res;
    });
  }

  return { MM: MM, PRESETS: PRESETS, ORDER: ORDER, DEFAULTS: DEFAULTS, sheetSize: sheetSize, planSheets: planSheets };
});
