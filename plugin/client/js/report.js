/* Corvo report (modulo 5): material, cost and savings of a nest. Pure functions, no DOM.
 * Works in the CEP panel (window.CorvoReport) and in Node (module.exports).
 *
 * Units in: document points (pt, 1 mm = 72/25.4 pt), the same numbers the panel already has
 *   (pieces from geometry.buildPieces, Sparrow placements, strip length, roll width).
 * Units out: mm, m, m2 and money in the material currency.
 *
 * Definitions (docs/plugin-architecture.md, "Modulo 5"):
 *   used length L = Sparrow strip_width; used area = L x roll width; pieces area = true filled area;
 *   fill = pieces / used; waste = used - pieces.
 *   material cost = L(m) x price/m | used area(m2) x price/m2 | sheets x price/sheet, then x (1 + allowance%).
 *   labour (optional) = rate/h x weeding min/m2 x used area / 60.  cost per piece = (material + labour) / n.
 *   savings vs (a) a naive rectangle (bounding box) shelf layout computed here, (b) the original artwork
 *   extent when it would fit the roll.
 */
(function (root, factory) {
  var api = factory();
  if (root) root.CorvoReport = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
  'use strict';

  var MM = 72 / 25.4;                      // pt per mm
  var PT2_TO_MM2 = 1 / (MM * MM);
  var CURRENCIES = { EUR: '€', USD: '$' };

  var DEFAULT_MATERIAL = {
    name: 'Vinile',          // material name
    priceUnit: 'm',          // 'm' (linear metre of roll) | 'm2' | 'sheet'
    price: 0,                // per priceUnit
    sheetLengthMm: 1000,     // only for priceUnit 'sheet' (sheet width = roll width)
    wastePct: 0,             // allowance added to the material cost (test cuts, leader, trim)
    currency: 'EUR',
    laborRate: 0,            // per hour, optional
    weedMinPerM2: 0,         // weeding minutes per m2 of used roll, optional
    jobsPerMonth: 0          // savings projection, optional
  };

  function num(v, d) { v = parseFloat(v); return isFinite(v) ? v : d; }

  function normalizeMaterial(m) {
    m = m || {};
    var o = {};
    for (var k in DEFAULT_MATERIAL) o[k] = DEFAULT_MATERIAL[k];
    if (m.name !== undefined && String(m.name).trim()) o.name = String(m.name).trim();
    o.priceUnit = m.priceUnit === 'm2' || m.priceUnit === 'sheet' ? m.priceUnit : 'm';
    o.price = Math.max(0, num(m.price, 0));
    o.sheetLengthMm = Math.max(1, num(m.sheetLengthMm, DEFAULT_MATERIAL.sheetLengthMm));
    o.wastePct = Math.max(0, num(m.wastePct, 0));
    o.currency = CURRENCIES[m.currency] ? m.currency : 'EUR';
    o.laborRate = Math.max(0, num(m.laborRate, 0));
    o.weedMinPerM2 = Math.max(0, num(m.weedMinPerM2, 0));
    o.jobsPerMonth = Math.max(0, num(m.jobsPerMonth, 0));
    return o;
  }

  // material cost for a strip of lengthMm on a roll of widthMm
  function materialCost(lengthMm, widthMm, mat) {
    mat = normalizeMaterial(mat);
    var lenM = lengthMm / 1000, areaM2 = lenM * widthMm / 1000, sheets = null, base;
    if (mat.priceUnit === 'm2') base = areaM2 * mat.price;
    else if (mat.priceUnit === 'sheet') { sheets = Math.max(1, Math.ceil(lengthMm / mat.sheetLengthMm - 1e-9)); base = sheets * mat.price; }
    else base = lenM * mat.price;
    return { base: base, cost: base * (1 + mat.wastePct / 100), sheets: sheets };
  }

  // ---------- geometry helpers (pt) ----------
  function rotBBox(poly, deg) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i < poly.length; i++) {
      var x = c * poly[i][0] - s * poly[i][1], y = s * poly[i][0] + c * poly[i][1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  }

  // bbox of a placed piece in strip coordinates (pt): Sparrow maps p -> R(rot) p + t on the ref-relative polygon
  function placedBBox(piece, pl) {
    var b = rotBBox(piece.polygon, pl.rotation || 0);
    return [b[0] + pl.translation[0], b[1] + pl.translation[1], b[2] + pl.translation[0], b[3] + pl.translation[1]];
  }

  function perimeter(poly) {
    var s = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      s += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return s;
  }

  /* Naive "rectangles" layout: every piece as its axis-aligned bounding box (0 or 90 deg when allowed),
   * First-Fit-Decreasing shelves across the roll: a shelf is a column of the strip (width along the roll =
   * widest box in it), boxes stack across the roll height H with `gap` between them. Three orientation
   * policies (long side across, long side along, as drawn) -> the shortest wins, so the baseline is fair.
   * Returns { lengthPt, shelves, policy } or null if some box cannot fit. */
  function shelfBaseline(pieces, H, gap, orientations) {
    gap = gap || 0;
    var allow90 = !orientations || orientations.some(function (a) { return Math.abs(((a % 180) + 180) % 180 - 90) < 1e-6; });
    var dims = pieces.map(function (p) {
      var b0 = rotBBox(p.polygon, 0), w0 = b0[2] - b0[0], h0 = b0[3] - b0[1];
      return { w0: w0, h0: h0 };
    });
    var policies = ['across', 'along', 'asis'], best = null;
    for (var k = 0; k < policies.length; k++) {
      var boxes = [], ok = true;
      for (var i = 0; i < dims.length; i++) {
        var d = dims[i], cands = [[d.w0, d.h0]];
        if (allow90) cands.push([d.h0, d.w0]);
        cands = cands.filter(function (c) { return c[1] <= H + 1e-6; });
        if (!cands.length) { ok = false; break; }
        var c = cands[0];
        if (policies[k] === 'across') cands.forEach(function (q) { if (q[0] < c[0]) c = q; });
        else if (policies[k] === 'along') cands.forEach(function (q) { if (q[1] < c[1]) c = q; });
        boxes.push({ w: c[0], h: c[1] });
      }
      if (!ok) continue;
      boxes.sort(function (a, b) { return b.w - a.w || b.h - a.h; });
      var shelves = [];
      boxes.forEach(function (b) {
        for (var s = 0; s < shelves.length; s++) {
          if (shelves[s].used + gap + b.h <= H + 1e-6) { shelves[s].used += gap + b.h; return; }
        }
        shelves.push({ w: b.w, used: b.h });
      });
      var L = shelves.reduce(function (s, sh) { return s + sh.w; }, 0) + gap * Math.max(0, shelves.length - 1);
      if (!best || L < best.lengthPt) best = { lengthPt: L, shelves: shelves.length, policy: policies[k] };
    }
    return best;
  }

  /* Length the ORIGINAL artwork would take on the roll (union of item bounds, as drawn, or turned by 90 deg),
   * null when it does not fit the roll width. items: corvoExport items with bounds [l,t,r,b] or rings. */
  function initialLength(items, H) {
    var l = Infinity, t = -Infinity, r = -Infinity, b = Infinity;
    (items || []).forEach(function (it) {
      var bb = it.bounds || it.box;   // module 1: clustered pieces carry box [l,t,r,b]
      if (!bb && it.rings) {
        bb = [Infinity, -Infinity, -Infinity, Infinity];
        it.rings.forEach(function (ring) {
          ring.forEach(function (p) {
            if (p[0] < bb[0]) bb[0] = p[0]; if (p[0] > bb[2]) bb[2] = p[0];
            if (p[1] > bb[1]) bb[1] = p[1]; if (p[1] < bb[3]) bb[3] = p[1];
          });
        });
      }
      if (!bb) return;
      l = Math.min(l, bb[0]); t = Math.max(t, bb[1]); r = Math.max(r, bb[2]); b = Math.min(b, bb[3]);
    });
    if (!(r > l) || !(t > b)) return null;
    var w = r - l, h = t - b, opts = [];
    if (h <= H + 1e-6) opts.push(w);
    if (w <= H + 1e-6) opts.push(h);
    return opts.length ? Math.min.apply(null, opts) : null;
  }

  function savingsVs(refLenPt, L, Wmm, mat, cost) {
    if (refLenPt === null || refLenPt === undefined || !(refLenPt > 0)) return null;
    var refMm = refLenPt / MM, Lmm = L / MM, refCost = materialCost(refMm, Wmm, mat).cost;
    var m = normalizeMaterial(mat);
    return {
      lengthMm: refMm,
      savedM: (refMm - Lmm) / 1000,
      savedM2: (refMm - Lmm) * Wmm / 1e6,
      savedPct: refMm > 0 ? (refMm - Lmm) / refMm * 100 : 0,
      savedMoney: refCost - cost,
      monthlyMoney: m.jobsPerMonth ? (refCost - cost) * m.jobsPerMonth : null
    };
  }

  /* opts: { pieces (geometry.buildPieces), placements (Sparrow report), stripLengthPt, rollWidthPt,
   *         gapPt, orientations, material, items (corvoExport items: name/layer/bounds), job, date,
   *         baseline (optional, precomputed shelfBaseline) } */
  function computeReport(opts) {
    var mat = normalizeMaterial(opts.material);
    var H = opts.rollWidthPt, L = opts.stripLengthPt;
    var byId = {};
    (opts.pieces || []).forEach(function (p) { if (!p.error) byId[p.id] = p; });
    var itemById = {};
    (opts.items || []).forEach(function (it) { itemById[it.i] = it; });

    var rows = [], areaPt2 = 0, cutPt = 0;
    (opts.placements || []).forEach(function (pl) {
      var p = byId[pl.item_id];
      if (!p) return;
      // module 1: pieces renumbered after dropping degenerate ones keep the plan index in hostI
      var it = itemById[p.hostI !== undefined ? p.hostI : p.id] || {};
      var bb = placedBBox(p, pl);
      areaPt2 += p.area;
      cutPt += perimeter(p.polygon);
      rows.push({
        id: p.id, name: p.name || it.name || ('#' + p.id), layer: it.layer || (it.layers || []).join(' + '),
        areaMm2: p.area * PT2_TO_MM2, rotation: ((pl.rotation % 360) + 360) % 360,
        xMm: bb[0] / MM, yMm: bb[1] / MM, wMm: (bb[2] - bb[0]) / MM, hMm: (bb[3] - bb[1]) / MM
      });
    });
    rows.sort(function (a, b) { return a.xMm - b.xMm || a.yMm - b.yMm; });

    var Wmm = H / MM, Lmm = L / MM;
    var usedM2 = Lmm * Wmm / 1e6, piecesM2 = areaPt2 * PT2_TO_MM2 / 1e6;
    var fill = usedM2 > 0 ? piecesM2 / usedM2 : 0;
    var mc = materialCost(Lmm, Wmm, mat);
    var labor = mat.laborRate * mat.weedMinPerM2 * usedM2 / 60;
    var total = mc.cost + labor;
    var n = rows.length;
    var baseline = opts.baseline !== undefined ? opts.baseline : shelfBaseline(opts.pieces.filter(function (p) { return !p.error; }), H, opts.gapPt, opts.orientations);
    var init = opts.initialLengthPt !== undefined ? opts.initialLengthPt : (opts.items ? initialLength(opts.items, H) : null);

    return {
      job: opts.job || '', date: opts.date || new Date().toISOString().slice(0, 10),
      material: mat, currency: mat.currency, symbol: CURRENCIES[mat.currency],
      rollWidthMm: Wmm, lengthMm: Lmm, lengthM: Lmm / 1000,
      usedM2: usedM2, piecesM2: piecesM2, fillPct: fill * 100,
      wasteM2: usedM2 - piecesM2, wastePct: (1 - fill) * 100,
      sheets: mc.sheets, materialCost: mc.cost, materialBase: mc.base, laborCost: labor, totalCost: total,
      pieces: n, costPerPiece: n ? total / n : 0,
      cutLengthM: cutPt / MM / 1000,
      baseline: baseline ? Object.assign({ shelves: baseline.shelves, policy: baseline.policy },
        savingsVs(baseline.lengthPt, L, Wmm, mat, mc.cost)) : null,
      initial: savingsVs(init, L, Wmm, mat, mc.cost),
      rows: rows
    };
  }

  /* Multicolour jobs (modulo 4): one report per colour -> TOTAL (lengths/areas/costs summed, fill recomputed). */
  function combine(reports) {
    var t = { job: reports[0] ? reports[0].job : '', date: reports[0] ? reports[0].date : '', lengthMm: 0, usedM2: 0,
      piecesM2: 0, materialCost: 0, laborCost: 0, totalCost: 0, pieces: 0, cutLengthM: 0 };
    reports.forEach(function (r) {
      ['lengthMm', 'usedM2', 'piecesM2', 'materialCost', 'laborCost', 'totalCost', 'pieces', 'cutLengthM'].forEach(function (k) { t[k] += r[k]; });
    });
    t.lengthM = t.lengthMm / 1000;
    t.fillPct = t.usedM2 > 0 ? t.piecesM2 / t.usedM2 * 100 : 0;
    t.wasteM2 = t.usedM2 - t.piecesM2; t.wastePct = 100 - t.fillPct;
    t.costPerPiece = t.pieces ? t.totalCost / t.pieces : 0;
    return t;
  }

  // ---------- text / CSV ----------
  var TXT = {
    en: {
      title: 'Corvo — material report', job: 'Job', date: 'Date', material: 'Material', roll: 'Roll width',
      length: 'Used length', usedArea: 'Used area', piecesArea: 'Pieces area', fill: 'Fill', waste: 'Waste',
      sheets: 'Sheets', matCost: 'Material cost', allowance: 'incl. {p}% allowance', labor: 'Weeding labour',
      total: 'Job total', perPiece: 'Cost per piece', pieces: 'Pieces', cut: 'Cut length',
      vsRect: 'Saving vs rectangle layout', vsOrig: 'Saving vs original layout', monthly: 'per month ({n} jobs)',
      unitM: '/m', unitM2: '/m²', unitSheet: '/sheet'
    },
    it: {
      title: 'Corvo — report materiale', job: 'Lavoro', date: 'Data', material: 'Materiale', roll: 'Larghezza rotolo',
      length: 'Lunghezza usata', usedArea: 'Area usata', piecesArea: 'Area pezzi', fill: 'Riempimento', waste: 'Sfrido',
      sheets: 'Fogli', matCost: 'Costo materiale', allowance: 'incl. {p}% di scarto', labor: 'Spellicolatura',
      total: 'Totale lavoro', perPiece: 'Costo per pezzo', pieces: 'Pezzi', cut: 'Lunghezza di taglio',
      vsRect: 'Risparmio vs disposizione a rettangoli', vsOrig: 'Risparmio vs disposizione originale', monthly: 'al mese ({n} lavori)',
      unitM: '/m', unitM2: '/m²', unitSheet: '/foglio'
    }
  };

  function fmtNum(v, d, lang) {
    var s = (+v).toFixed(d);
    if (s === '-' + (0).toFixed(d)) s = (0).toFixed(d);
    return lang === 'it' ? s.replace('.', ',') : s;
  }
  function money(v, r, lang) {
    var s = fmtNum(v, 2, lang);
    return r.currency === 'USD' ? '$' + s : s + ' €';
  }

  function toText(r, lang) {
    lang = lang === 'it' ? 'it' : 'en';
    var T = TXT[lang], f = function (v, d) { return fmtNum(v, d, lang); }, m = function (v) { return money(v, r, lang); };
    var unit = r.material.priceUnit === 'm2' ? T.unitM2 : r.material.priceUnit === 'sheet' ? T.unitSheet : T.unitM;
    var L = [T.title];
    if (r.job) L.push(T.job + ': ' + r.job);
    L.push(T.date + ': ' + r.date);
    L.push(T.material + ': ' + r.material.name + ' — ' + m(r.material.price) + unit);
    L.push(T.roll + ': ' + f(r.rollWidthMm, 0) + ' mm');
    L.push(T.pieces + ': ' + r.pieces);
    L.push(T.length + ': ' + f(r.lengthM, 3) + ' m' + (r.sheets ? ' (' + T.sheets + ': ' + r.sheets + ')' : ''));
    L.push(T.usedArea + ': ' + f(r.usedM2, 3) + ' m²  ·  ' + T.piecesArea + ': ' + f(r.piecesM2, 3) + ' m²');
    L.push(T.fill + ': ' + f(r.fillPct, 1) + ' %  ·  ' + T.waste + ': ' + f(r.wasteM2, 3) + ' m² (' + f(r.wastePct, 1) + ' %)');
    L.push(T.matCost + ': ' + m(r.materialCost) + (r.material.wastePct ? ' (' + T.allowance.replace('{p}', f(r.material.wastePct, 0)) + ')' : ''));
    if (r.laborCost) L.push(T.labor + ': ' + m(r.laborCost));
    L.push(T.total + ': ' + m(r.totalCost) + '  ·  ' + T.perPiece + ': ' + m(r.costPerPiece));
    [['baseline', T.vsRect], ['initial', T.vsOrig]].forEach(function (x) {
      var s = r[x[0]];
      if (!s) return;
      var line = x[1] + ': ' + f(s.savedM, 2) + ' m, ' + m(s.savedMoney) + ' (' + f(s.savedPct, 1) + ' %)';
      if (s.monthlyMoney !== null) line += ', ' + m(s.monthlyMoney) + ' ' + T.monthly.replace('{n}', f(r.material.jobsPerMonth, 0));
      L.push(line);
    });
    return L.join('\n');
  }

  /* CSV (Excel/LibreOffice): UTF-8 with BOM; lang 'it' -> ';' separator and decimal comma (what Excel expects
   * with Italian regional settings), 'en' -> ',' and '.'. Block 1 = job summary with the column names of
   * FINDINGS-modulo4-6 §4 (money columns without the _eur suffix + a `valuta` column); blank line;
   * block 2 = one row per piece. Cells are quoted when needed; text starting with = + - @ is prefixed with '
   * (CSV formula injection). */
  function toCSV(r, lang) {
    var it = lang === 'it', sep = it ? ';' : ',';
    function cell(v) {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') { if (!isFinite(v)) return ''; var n = String(v); return it ? n.replace('.', ',') : n; }
      var s = String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      if (s.indexOf(sep) >= 0 || /["\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    function line(a) { return a.map(cell).join(sep); }
    var b = r.baseline || {}, i0 = r.initial || {};
    var head = ['data', 'cliente', 'job', 'materiale', 'larghezza_rotolo_mm', 'lunghezza_usata_mm', 'area_pezzi_mm2',
      'area_usata_mm2', 'sfrido_pct', 'riempimento_pct', 'prezzo_materiale', 'unita_prezzo', 'scarto_extra_pct', 'fogli',
      'costo_materiale', 'costo_manodopera', 'costo_totale', 'numero_pezzi', 'costo_per_pezzo', 'tempo_macchina_min',
      'lunghezza_taglio_m', 'colore_vinile', 'lunghezza_rettangoli_mm', 'risparmio_pct', 'risparmio', 'risparmio_m',
      'lunghezza_originale_mm', 'risparmio_originale', 'valuta'];
    var vals = [r.date, r.client || '', r.job, r.material.name, round(r.rollWidthMm, 1), round(r.lengthMm, 1),
      round(r.piecesM2 * 1e6, 0), round(r.usedM2 * 1e6, 0), round(r.wastePct, 2), round(r.fillPct, 2), r.material.price,
      r.material.priceUnit, r.material.wastePct, r.sheets, round(r.materialCost, 2), round(r.laborCost, 2),
      round(r.totalCost, 2), r.pieces, round(r.costPerPiece, 4), null, round(r.cutLengthM, 3), r.color || '',
      b.lengthMm !== undefined ? round(b.lengthMm, 1) : null, b.savedPct !== undefined ? round(b.savedPct, 2) : null,
      b.savedMoney !== undefined ? round(b.savedMoney, 2) : null, b.savedM !== undefined ? round(b.savedM, 3) : null,
      i0.lengthMm !== undefined ? round(i0.lengthMm, 1) : null, i0.savedMoney !== undefined ? round(i0.savedMoney, 2) : null,
      r.currency];
    var out = [line(head), line(vals), '', line(['n', 'nome', 'livello', 'area_mm2', 'rotazione_gradi', 'x_mm', 'y_mm', 'larghezza_mm', 'altezza_mm'])];
    r.rows.forEach(function (row, k) {
      out.push(line([k + 1, row.name, row.layer, round(row.areaMm2, 1), round(row.rotation, 2), round(row.xMm, 2),
        round(row.yMm, 2), round(row.wMm, 2), round(row.hMm, 2)]));
    });
    return '﻿' + out.join('\r\n') + '\r\n';
  }
  function round(v, d) { var k = Math.pow(10, d); return Math.round(v * k) / k; }

  return {
    MM: MM, CURRENCIES: CURRENCIES, DEFAULT_MATERIAL: DEFAULT_MATERIAL, normalizeMaterial: normalizeMaterial,
    materialCost: materialCost, rotBBox: rotBBox, placedBBox: placedBBox, shelfBaseline: shelfBaseline,
    initialLength: initialLength, computeReport: computeReport, combine: combine,
    toText: toText, toCSV: toCSV, fmtNum: fmtNum, money: money
  };
});
