/* Corvo panel, modulo 5: "Material & cost" section (DOM only; the numbers come from js/report.js).
 *
 * main.js calls (marked "// MODULO 5"):
 *   CorvoReportPanel.begin(ctx)   new session: ctx = {pieces, items, H, gapPt, orient, docName}
 *                                 -> computes the rectangle baseline and the original length once
 *   CorvoReportPanel.update(best) every live tick / at the end: best = Sparrow report (cheap, recomputed
 *                                 only when the layout or the material changes)
 *   CorvoReportPanel.clear()      Cancel: the layout is gone
 * Material settings live in localStorage: 'corvo.m5.materials' = {name: material}, 'corvo.m5.current'.
 */
(function () {
  'use strict';

  var R = window.CorvoReport;
  if (!R || !document.getElementById('m5')) return;

  var STR = {
    en: {
      title: 'Material & cost', preset: 'Saved materials', save: 'Save', del: 'Delete', name: 'Material name',
      price: 'Price', priceUnit: 'Per', perM: 'linear metre', perM2: 'm²', perSheet: 'sheet', sheetLen: 'Sheet length',
      allowance: 'Waste allowance', currency: 'Currency', labor: 'Labour rate', perHour: '/h', weed: 'Weeding',
      jobs: 'Jobs / month', job: 'Job / client', csv: 'Export CSV', copy: 'Copy summary', none: 'Nest to see the report.',
      custom: '(unsaved)', length: 'Used length', usedArea: 'Used area', piecesArea: 'Pieces area', fill: 'Fill',
      waste: 'Waste', sheets: 'Sheets', matCost: 'Material', laborCost: 'Weeding', total: 'Job total',
      perPiece: 'Per piece', pieces: 'Pieces',
      vsRect: 'Saving vs rectangle layout: {m} m, {money} ({pct}%)',
      vsOrig: 'Saving vs original layout: {m} m, {money}',
      monthly: ' · {money}/month', noSaving: 'The rectangle layout is not longer than this nest (no saving).',
      saved: 'Saved to {path}', copied: 'Summary copied to the clipboard.', copyFail: 'Could not copy: select the text below.',
      writeFail: 'Could not write the file: {msg}', savedMat: 'Material "{name}" saved.', live: 'live'
    },
    it: {
      title: 'Materiale e costo', preset: 'Materiali salvati', save: 'Salva', del: 'Elimina', name: 'Nome materiale',
      price: 'Prezzo', priceUnit: 'Al', perM: 'metro lineare', perM2: 'm²', perSheet: 'foglio', sheetLen: 'Lunghezza foglio',
      allowance: 'Scarto extra', currency: 'Valuta', labor: 'Tariffa oraria', perHour: '/h', weed: 'Spellicolatura',
      jobs: 'Lavori / mese', job: 'Lavoro / cliente', csv: 'Esporta CSV', copy: 'Copia riepilogo', none: 'Fai un nest per vedere il report.',
      custom: '(non salvato)', length: 'Lunghezza usata', usedArea: 'Area usata', piecesArea: 'Area pezzi', fill: 'Riempimento',
      waste: 'Sfrido', sheets: 'Fogli', matCost: 'Materiale', laborCost: 'Spellicolatura', total: 'Totale lavoro',
      perPiece: 'Per pezzo', pieces: 'Pezzi',
      vsRect: 'Risparmio vs disposizione a rettangoli: {m} m, {money} ({pct}%)',
      vsOrig: 'Risparmio vs disposizione originale: {m} m, {money}',
      monthly: ' · {money}/mese', noSaving: 'La disposizione a rettangoli non è più lunga di questo nest (nessun risparmio).',
      saved: 'Salvato in {path}', copied: 'Riepilogo copiato negli appunti.', copyFail: 'Copia non riuscita: seleziona il testo qui sotto.',
      writeFail: 'Impossibile scrivere il file: {msg}', savedMat: 'Materiale "{name}" salvato.', live: 'live'
    }
  };
  function lang() { try { return localStorage.getItem('corvo.lang') === 'it' ? 'it' : 'en'; } catch (e) { return 'en'; } }
  function t(k, v) {
    var s = STR[lang()][k] || STR.en[k] || k;
    if (v) s = s.replace(/\{(\w+)\}/g, function (m, x) { return v[x] !== undefined ? v[x] : m; });
    return s;
  }
  function $(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------- storage
  function load(key, def) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }

  var FIELDS = { name: 'm5Name', price: 'm5Price', priceUnit: 'm5Unit', sheetLengthMm: 'm5Sheet', wastePct: 'm5Waste',
    currency: 'm5Currency', laborRate: 'm5Labor', weedMinPerM2: 'm5Weed', jobsPerMonth: 'm5Jobs' };

  function readMaterial() {
    var m = {};
    for (var k in FIELDS) m[k] = $(FIELDS[k]).value;
    return R.normalizeMaterial(m);
  }
  function writeMaterial(m) {
    m = R.normalizeMaterial(m);
    for (var k in FIELDS) $(FIELDS[k]).value = m[k];
    syncUnitUi();
  }
  function syncUnitUi() {
    $('m5SheetWrap').hidden = $('m5Unit').value !== 'sheet';
    $('m5Cur').textContent = R.CURRENCIES[$('m5Currency').value] || '€';
  }
  function fillPresets(selected) {
    var mats = load('corvo.m5.materials', {}), sel = $('m5Preset'), names = Object.keys(mats).sort();
    sel.innerHTML = '';
    var o = document.createElement('option'); o.value = ''; o.textContent = t('custom'); sel.appendChild(o);
    names.forEach(function (n) { var q = document.createElement('option'); q.value = n; q.textContent = n; sel.appendChild(q); });
    sel.value = selected && mats[selected] ? selected : '';
  }

  // ---------------------------------------------------------------- report state
  var C = null, best = null, rep = null, dirty = true;

  function compute() {
    if (!C || !best) { rep = null; return; }
    rep = R.computeReport({ pieces: C.pieces, placements: best.placements, stripLengthPt: best.strip_width,
      rollWidthPt: C.H, gapPt: C.gapPt, orientations: C.orient, material: readMaterial(), items: C.items,
      baseline: C.baseline, initialLengthPt: C.initial, job: $('m5Job').value.trim() || String(C.docName || '').replace(/\.[^.]+$/, '') });
    dirty = false;
  }

  function render() {
    var out = $('m5Out'), L = lang(), f = function (v, d) { return R.fmtNum(v, d, L); };
    out.innerHTML = '';
    $('m5Savings').textContent = '';
    $('m5Csv').disabled = $('m5Copy').disabled = !rep;
    if (!rep) { var dt = document.createElement('dt'); dt.textContent = t('none'); out.appendChild(dt); return; }
    var m = function (v) { return R.money(v, rep, L); };
    var rows = [
      ['pieces', String(rep.pieces)],
      ['length', f(rep.lengthM, 3) + ' m' + (rep.sheets ? '  (' + rep.sheets + ' ' + t('sheets').toLowerCase() + ')' : '')],
      ['usedArea', f(rep.usedM2, 3) + ' m²'],
      ['piecesArea', f(rep.piecesM2, 3) + ' m²'],
      ['fill', f(rep.fillPct, 1) + ' %'],
      ['waste', f(rep.wasteM2, 3) + ' m²  ' + f(rep.wastePct, 1) + ' %'],
      ['matCost', m(rep.materialCost)]
    ];
    if (rep.laborCost) rows.push(['laborCost', m(rep.laborCost)]);
    rows.push(['total', m(rep.totalCost), 'total'], ['perPiece', m(rep.costPerPiece)]);
    rows.forEach(function (r) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = t(r[0]); dd.textContent = r[1]; if (r[2]) dd.className = r[2];
      out.appendChild(dt); out.appendChild(dd);
    });
    var lines = [];
    if (rep.baseline && !(rep.baseline.savedM > 0)) lines.push(t('noSaving'));
    else if (rep.baseline) {
      var s = t('vsRect', { m: f(rep.baseline.savedM, 2), money: m(rep.baseline.savedMoney), pct: f(rep.baseline.savedPct, 1) });
      if (rep.baseline.monthlyMoney !== null) s += t('monthly', { money: m(rep.baseline.monthlyMoney) });
      lines.push(s);
    }
    if (rep.initial && rep.initial.savedM > 0) lines.push(t('vsOrig', { m: f(rep.initial.savedM, 2), money: m(rep.initial.savedMoney) }));
    $('m5Savings').textContent = lines.join('\n');
  }

  function refresh() { dirty = true; compute(); render(); }

  function msg(text, kind) { var el = $('m5Status'); el.textContent = text || ''; el.className = 'status' + (kind ? ' ' + kind : ''); }

  // ---------------------------------------------------------------- export / copy
  function hostDocPath() {
    var P = window.CorvoPanel;
    if (!P || !P.evalRaw) return Promise.resolve('');
    return P.evalRaw('(function(){try{var d=app.activeDocument;var p=d.path&&d.path.fsName;return p?String(d.fullName.fsName):"";}catch(e){return "";}})()')
      .then(function (r) { return r && r !== 'EvalScript error.' ? String(r) : ''; }, function () { return ''; });
  }
  function csvName() {
    var base = (C && C.docName) || 'corvo';
    base = String(base).replace(/\.[^.]+$/, '').replace(/[\\\/:*?"<>|]+/g, '_');
    return base + '_corvo_report.csv';
  }
  function exportCsv() {
    if (!rep) return;
    var nodeFs = null, nodePath = null, os = null;
    try { nodeFs = require('fs'); nodePath = require('path'); os = require('os'); } catch (e) { /* no Node */ }
    var csv = R.toCSV(rep, lang());
    if (!nodeFs) {                                   // browser preview: download
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = csvName(); a.click();
      return;
    }
    hostDocPath().then(function (docPath) {
      var dir = docPath ? nodePath.dirname(docPath) : nodePath.join(os.homedir(), 'Desktop');
      var target = nodePath.join(dir, csvName());
      var fsx = window.cep && window.cep.fs;
      if (fsx && fsx.showSaveDialogEx) {
        var res = fsx.showSaveDialogEx(t('csv'), dir, ['csv'], nodePath.basename(target), 'CSV');
        if (!res || res.err || !res.data) return;   // cancelled
        target = String(res.data);
        if (!/\.csv$/i.test(target)) target += '.csv';
      }
      try { nodeFs.writeFileSync(target, csv, 'utf8'); msg(t('saved', { path: target }), 'ok'); }
      catch (e) { msg(t('writeFail', { msg: e.message }), 'error'); }
    });
  }
  function copySummary() {
    if (!rep) return;
    var text = R.toText(rep, lang()), ok = false;
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) { msg(t('copied'), 'ok'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { msg(t('copied'), 'ok'); }, function () { msg(t('copyFail'), 'warn'); $('m5Savings').textContent = text; });
    } else { msg(t('copyFail'), 'warn'); $('m5Savings').textContent = text; }
  }

  // ---------------------------------------------------------------- i18n
  function applyLang() {
    var els = document.querySelectorAll('[data-m5]');
    for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-m5'));
    fillPresets($('m5Preset').value);
    render();
  }

  // ---------------------------------------------------------------- wire up
  writeMaterial(load('corvo.m5.current', R.DEFAULT_MATERIAL));
  fillPresets(load('corvo.m5.preset', ''));
  var inputs = Object.keys(FIELDS).map(function (k) { return FIELDS[k]; }).concat(['m5Job']);
  inputs.forEach(function (id) {
    $(id).addEventListener('input', function () {
      syncUnitUi();
      store('corvo.m5.current', readMaterial());
      if (id !== 'm5Job' && $('m5Preset').value) { $('m5Preset').value = ''; store('corvo.m5.preset', ''); }
      refresh();
    });
  });
  $('m5Unit').addEventListener('change', function () { syncUnitUi(); store('corvo.m5.current', readMaterial()); refresh(); });
  $('m5Currency').addEventListener('change', function () { syncUnitUi(); store('corvo.m5.current', readMaterial()); refresh(); });
  $('m5Preset').addEventListener('change', function () {
    var mats = load('corvo.m5.materials', {}), n = $('m5Preset').value;
    store('corvo.m5.preset', n);
    if (n && mats[n]) { writeMaterial(mats[n]); store('corvo.m5.current', readMaterial()); refresh(); }
  });
  $('m5Save').addEventListener('click', function () {
    var m = readMaterial(), mats = load('corvo.m5.materials', {});
    mats[m.name] = m; store('corvo.m5.materials', mats); store('corvo.m5.preset', m.name);
    fillPresets(m.name); msg(t('savedMat', { name: m.name }), 'ok');
  });
  $('m5Del').addEventListener('click', function () {
    var n = $('m5Preset').value, mats = load('corvo.m5.materials', {});
    if (!n) return;
    delete mats[n]; store('corvo.m5.materials', mats); store('corvo.m5.preset', ''); fillPresets('');
  });
  $('m5Csv').addEventListener('click', exportCsv);
  $('m5Copy').addEventListener('click', copySummary);
  var btnLang = $('btnLang');                        // main.js toggles corvo.lang first (registered earlier)
  if (btnLang) btnLang.addEventListener('click', function () { setTimeout(applyLang, 0); });
  try { $('m5').open = load('corvo.m5.open', false); } catch (e) { /* ignore */ }
  $('m5').addEventListener('toggle', function () { store('corvo.m5.open', $('m5').open); });
  applyLang();

  window.CorvoReportPanel = {
    begin: function (ctx) {
      C = ctx; best = null; rep = null; msg('');
      var pieces = ctx.pieces.filter(function (p) { return !p.error; });
      C.baseline = R.shelfBaseline(pieces, ctx.H, ctx.gapPt, ctx.orient);
      C.initial = R.initialLength(ctx.items, ctx.H);
      if (!$('m5Job').value.trim() && ctx.docName) $('m5Job').placeholder = String(ctx.docName).replace(/\.[^.]+$/, '');
      render();
    },
    update: function (b) {
      if (!C || !b) return;
      if (b === best && !dirty) return;
      best = b; compute(); render();
    },
    clear: function () { C = null; best = null; rep = null; render(); },
    report: function () { return rep; }
  };
})();
