/* Corvo — Moduli 4 + 7: orchestratore MULTI-JOB. Pure functions, no DOM.
 * Browser: window.CorvoMultinest. Node: module.exports.
 *
 * Several Sparrow nests in sequence (one per vinyl colour / layer = module 4, one per sheet = module 7), each on a
 * subset of the nest pieces ("units" = geometry.buildPieces pieces, or holes.nestPieces when module 2 is on), each
 * laid out in its own container in the document.
 *
 *   subsetInstance(units, H, orientFor)  -> Sparrow instance with ids 0..m-1 (+ per-piece allowed_orientations)
 *   mapPlacements(rep, units)            -> placements re-keyed on the unit ids (item_id = units[k].id), so
 *                                            holes.movesFor / geometry.placementToMove work unchanged
 *   placedPoly / placedBox / maxX        -> geometry of a placement (strip frame, pt)
 *   runJobs(jobs, runNest, hooks)        -> sequential nests; runNest(instance, secs, onReport) -> Promise<best report>
 *   timeShares(areas, total, min)        -> seconds per job, proportional to the piece area, at least `min`
 *   stackRolls(n, W, origin, spacing)    -> roll k origin (bottom-left) stacked DOWNWARDS below the artboard
 *   rowSheets(n, w, h, origin, spacing)  -> sheet k origin in a row to the right
 *   rollLabel(label, mm)                 -> "Corvo — <label> — L mm"
 *   Presets                               -> named settings (localStorage + JSON export/import), see below
 * Units: pt (1 mm = 72/25.4 pt), document coordinates y up (docs/plugin-architecture.md, "Sistema di coordinate").
 */
(function (root, factory) {
  var api = factory();
  if (root) root.CorvoMultinest = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
  'use strict';

  var MM = 72 / 25.4;

  // ---------------------------------------------------------------- instance / placements
  function subsetInstance(units, H, orientFor) {
    return {
      name: 'corvo',
      strip_height: H,
      items: units.map(function (u, k) {
        var it = { id: k, demand: 1, shape: { type: 'simple_polygon', data: u.polygon } };
        var o = typeof orientFor === 'function' ? orientFor(u) : orientFor;
        if (o) it.allowed_orientations = o.slice();
        return it;
      })
    };
  }
  function mapPlacements(rep, units) {
    if (!rep || !rep.placements) return [];
    return rep.placements.map(function (pl) {
      var u = units[pl.item_id];
      return u ? { item_id: u.id, rotation: pl.rotation, translation: pl.translation.slice() } : null;
    }).filter(Boolean);
  }
  function placedPoly(unit, pl) {
    var a = pl.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), t = pl.translation;
    return unit.polygon.map(function (p) { return [c * p[0] - s * p[1] + t[0], s * p[0] + c * p[1] + t[1]]; });
  }
  function placedBox(unit, pl) {
    var P = placedPoly(unit, pl), b = [Infinity, Infinity, -Infinity, -Infinity];
    P.forEach(function (p) {
      if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1];
      if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1];
    });
    return b;                                           // [minx, miny, maxx, maxy]
  }
  /* rightmost point of a layout (placements keyed by unit id) */
  function maxX(placements, byId) {
    var m = 0;
    placements.forEach(function (pl) { var u = byId[pl.item_id]; if (u) m = Math.max(m, placedBox(u, pl)[2]); });
    return m;
  }
  function byId(units) { var o = {}; units.forEach(function (u) { o[u.id] = u; }); return o; }
  function areaOf(units) { return units.reduce(function (s, u) { return s + (u.area || 0); }, 0); }

  // ---------------------------------------------------------------- orientations
  /* grain lock (module 7): only 0/180 among the allowed ones; free rotation -> [0, 180]; none left -> [0] */
  function grainOrients(orient) {
    if (!orient) return [0, 180];
    var o = orient.filter(function (a) { var m = ((a % 360) + 360) % 360; return m === 0 || m === 180; });
    return o.length ? o : [0];
  }
  /* rotated bbox [w, h] of a polygon */
  function rotDims(poly, deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (var k = 0; k < poly.length; k++) {
      var x = c * poly[k][0] - s * poly[k][1], y = s * poly[k][0] + c * poly[k][1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x1 - x0, y1 - y0];
  }
  /* does the piece fit a W x H rectangle in one of the allowed orientations (null = free: every degree)? */
  function fitsRect(poly, orient, W, H) {
    var angles = orient || (function () { var a = []; for (var d = 0; d < 180; d++) a.push(d); return a; })();
    for (var i = 0; i < angles.length; i++) {
      var d = rotDims(poly, angles[i]);
      if (d[0] <= W + 1e-6 && d[1] <= H + 1e-6) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- sequential jobs
  /* jobs: [{units, H, orient (array|null|fn), secs}] -> each job gets .report (best, strip frame, Sparrow ids) and
   * .placements (unit ids). hooks: {onStart(k, job), onReport(k, job, rep), onDone(k, job), secsFor(k, job)} */
  function runJobs(jobs, runNest, hooks) {
    hooks = hooks || {};
    var k = 0;
    function next() {
      if (k >= jobs.length) return Promise.resolve(jobs);
      var job = jobs[k], idx = k;
      if (hooks.onStart) hooks.onStart(idx, job);
      var inst = subsetInstance(job.units, job.H, job.orient);
      var secs = hooks.secsFor ? hooks.secsFor(idx, job) : job.secs;
      return Promise.resolve(runNest(inst, secs, function (rep) { if (hooks.onReport) hooks.onReport(idx, job, rep); }))
        .then(function (rep) {
          if (!rep) throw new Error('no layout for job ' + idx);
          job.report = rep;
          job.placements = mapPlacements(rep, job.units);
          if (hooks.onDone) hooks.onDone(idx, job);
          k++;
          return next();
        });
    }
    return next();
  }
  function timeShares(areas, total, min) {
    var sum = areas.reduce(function (s, a) { return s + a; }, 0) || 1;
    return areas.map(function (a) { return Math.max(min, total * a / sum); });
  }

  // ---------------------------------------------------------------- containers in the document
  /* rolls stacked DOWNWARDS: roll 0 top edge at originTop (y), each next one `spacing` below the previous one.
   * returns bottom-left corners [x, y] (the strip origin of each job). */
  function stackRolls(n, W, left, top, spacing) {
    var out = [];
    for (var k = 0; k < n; k++) out.push([left, top - W - k * (W + spacing)]);
    return out;
  }
  /* sheets in a row to the right, top edges aligned at `top` */
  function rowSheets(n, w, h, left, top, spacing) {
    var out = [];
    for (var k = 0; k < n; k++) out.push([left + k * (w + spacing), top - h]);
    return out;
  }
  function rollLabel(lab, mm) { return 'Corvo — ' + (lab || '?') + ' — ' + Math.round(mm) + ' mm'; }

  // ---------------------------------------------------------------- presets (module 4)
  /* A preset = named panel settings. Stored in localStorage 'corvo.presets' as {name: preset}; exported/imported as
   * JSON {"corvoPresets":1,"presets":{name: preset}}. Unknown fields are dropped, numbers clamped. */
  var PRESET_FIELDS = {
    rollMm: ['num', 10, 10000], gapMm: ['num', 0, 100], rot: ['enum', ['none', '180', '90', 'free']],
    time: ['num', 2, 3600], group: ['enum', ['none', 'color', 'layer']], colorTol: ['num', 0, 100],
    container: ['enum', ['roll', 'sheets']], sheet: ['str'], sheetW: ['num', 10, 20000], sheetH: ['num', 10, 20000],
    sheetMargin: ['num', 0, 500], grain: ['bool'], material: ['obj']
  };
  function normalizePreset(p) {
    var out = {};
    if (!p || typeof p !== 'object') return out;
    Object.keys(PRESET_FIELDS).forEach(function (k) {
      var f = PRESET_FIELDS[k], v = p[k];
      if (v === undefined || v === null) return;
      if (f[0] === 'num') { v = parseFloat(v); if (isFinite(v)) out[k] = Math.max(f[1], Math.min(f[2], v)); }
      else if (f[0] === 'enum') { if (f[1].indexOf(String(v)) >= 0) out[k] = String(v); }
      else if (f[0] === 'bool') out[k] = !!v;
      else if (f[0] === 'str') out[k] = String(v).slice(0, 40);
      else if (f[0] === 'obj' && typeof v === 'object' && !Array.isArray(v)) out[k] = JSON.parse(JSON.stringify(v));
    });
    return out;
  }
  function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60); }
  var Presets = {
    KEY: 'corvo.presets',
    FIELDS: PRESET_FIELDS,
    normalize: normalizePreset,
    load: function (storage) {
      try { var o = JSON.parse(storage.getItem(Presets.KEY) || '{}'); return o && typeof o === 'object' ? o : {}; }
      catch (e) { return {}; }
    },
    save: function (storage, map) { try { storage.setItem(Presets.KEY, JSON.stringify(map)); return true; } catch (e) { return false; } },
    put: function (map, name, p) { name = cleanName(name); if (!name) return null; map[name] = normalizePreset(p); return name; },
    remove: function (map, name) { delete map[name]; },
    toJSON: function (map, only) {
      var out = {};
      Object.keys(map).forEach(function (n) { if (!only || only.indexOf(n) >= 0) out[n] = normalizePreset(map[n]); });
      return JSON.stringify({ corvoPresets: 1, presets: out }, null, 2);
    },
    /* merge an exported file into map; returns {added:[names], error?} (same name = replaced) */
    fromJSON: function (text, map) {
      var o;
      try { o = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { return { added: [], error: 'json' }; }
      var src = o && o.corvoPresets && o.presets && typeof o.presets === 'object' ? o.presets : null;
      if (!src) return { added: [], error: 'format' };
      var added = [];
      Object.keys(src).forEach(function (n) { var nm = Presets.put(map, n, src[n]); if (nm) added.push(nm); });
      return { added: added };
    }
  };

  return { MM: MM, subsetInstance: subsetInstance, mapPlacements: mapPlacements, placedPoly: placedPoly, placedBox: placedBox,
    maxX: maxX, byId: byId, areaOf: areaOf, grainOrients: grainOrients, rotDims: rotDims, fitsRect: fitsRect,
    runJobs: runJobs, timeShares: timeShares, stackRolls: stackRolls, rowSheets: rowSheets, rollLabel: rollLabel,
    Presets: Presets };
});
