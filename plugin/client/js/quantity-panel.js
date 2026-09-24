/* Corvo quantity panel (module 3): "Quantities & mirrored pairs" section. DOM only, the logic is in quantity.js.
 *
 *   CorvoQtyPanel.fill(planPieces)   table rows for the module-1 pieces (values remembered by name + size)
 *   CorvoQtyPanel.spec(planPieces)   {qty:{i:n}, mirror:{i:true}, keepClose, any} keyed by plan index
 *   CorvoQtyPanel.setEnabled(bool)   inputs locked while a session runs
 * Strings come from main.js (data-i18n + window.CorvoPanel.t).
 */
(function () {
  'use strict';
  var Q = window.CorvoQuantity;
  var MM = 72 / 25.4;
  var mem = {};                 // key -> {qty, mirror}
  var rows = [];                // [{key, name, size}]
  var enabled = true;

  function $(id) { return document.getElementById(id); }
  function t(k, v) { return window.CorvoPanel && window.CorvoPanel.t ? window.CorvoPanel.t(k, v) : k; }
  function clamp(n) { return Q ? Q.clampQty(n) : Math.max(1, Math.min(999, Math.floor(+n) || 1)); }

  function sizeOf(p) {
    var b = p.box || p.bounds;
    if (!b) return '';
    return (Math.abs(b[2] - b[0]) / MM).toFixed(0) + '×' + (Math.abs(b[1] - b[3]) / MM).toFixed(0) + ' mm';
  }
  function keysOf(pieces) {
    var seen = {};
    return pieces.map(function (p) {
      var base = (p.name || '') + '|' + sizeOf(p);
      seen[base] = (seen[base] || 0) + 1;
      return base + '|' + seen[base];
    });
  }
  function saveKeepClose() {
    try { localStorage.setItem('corvo.m3close', $('m3Close').checked ? '1' : '0'); } catch (e) { /* storage blocked */ }
  }

  function render() {
    var body = $('m3Body');
    if (!body) return;
    body.innerHTML = '';
    if (!rows.length) {
      var tr0 = document.createElement('tr'), td0 = document.createElement('td');
      td0.colSpan = 3; td0.className = 'm3-empty'; td0.textContent = t('qtyEmpty');
      tr0.appendChild(td0); body.appendChild(tr0);
    }
    rows.forEach(function (r, k) {
      var v = mem[r.key] || { qty: 1, mirror: false };
      var tr = document.createElement('tr');
      var tdN = document.createElement('td'); tdN.className = 'name'; tdN.title = r.name;
      tdN.textContent = r.name || t('qtyPieceN', { n: k + 1 });
      var sm = document.createElement('small'); sm.textContent = r.size; tdN.appendChild(sm);
      var tdQ = document.createElement('td'); tdQ.className = 'qty';
      var inp = document.createElement('input'); inp.type = 'number'; inp.min = '1'; inp.max = '999'; inp.step = '1';
      inp.value = v.qty; inp.disabled = !enabled;
      inp.addEventListener('change', function () { var m = mem[r.key] = mem[r.key] || { qty: 1, mirror: false }; m.qty = clamp(inp.value); inp.value = m.qty; summary(); });
      tdQ.appendChild(inp);
      var tdM = document.createElement('td'); tdM.className = 'mir';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!v.mirror; cb.disabled = !enabled;
      cb.title = t('qtyMirrorTip');
      cb.addEventListener('change', function () { var m = mem[r.key] = mem[r.key] || { qty: 1, mirror: false }; m.mirror = cb.checked; summary(); });
      tdM.appendChild(cb);
      tr.appendChild(tdN); tr.appendChild(tdQ); tr.appendChild(tdM);
      body.appendChild(tr);
    });
    summary();
  }
  function summary() {
    var el = $('m3Sum');
    if (!el) return;
    if (!rows.length) { el.textContent = ''; return; }
    var total = 0, mir = 0;
    rows.forEach(function (r) {
      var v = mem[r.key] || { qty: 1, mirror: false };
      total += v.qty * (v.mirror ? 2 : 1);
      if (v.mirror) mir += v.qty;
    });
    el.textContent = t('qtySum', { n: rows.length, total: total, m: mir });
  }

  function fill(pieces) {
    var keys = keysOf(pieces || []);
    rows = (pieces || []).map(function (p, k) { return { key: keys[k], name: p.name || '', size: sizeOf(p) }; });
    var det = $('m3');
    render();
    return det;
  }

  function spec(pieces) {
    var keys = keysOf(pieces || []), out = { qty: {}, mirror: {}, keepClose: !!($('m3Close') && $('m3Close').checked), any: false };
    (pieces || []).forEach(function (p, k) {
      var v = mem[keys[k]];
      if (!v) return;
      var i = p.i !== undefined ? p.i : k;
      if (v.qty > 1) { out.qty[i] = v.qty; out.any = true; }
      if (v.mirror) { out.mirror[i] = true; out.any = true; }
    });
    return out;
  }

  function setEnabled(on) {
    enabled = !!on;
    var root = $('m3');
    if (!root) return;
    var inputs = root.querySelectorAll('input, button');
    for (var i = 0; i < inputs.length; i++) inputs[i].disabled = !enabled;
  }

  // "set all" applies to every row
  if ($('m3SetAll')) $('m3SetAll').addEventListener('click', function () {
    var n = clamp($('m3All').value);
    $('m3All').value = n;
    rows.forEach(function (r) { var m = mem[r.key] = mem[r.key] || { qty: 1, mirror: false }; m.qty = n; });
    render();
  });
  if ($('m3Close')) {
    try { $('m3Close').checked = localStorage.getItem('corvo.m3close') === '1'; } catch (e) { /* storage blocked */ }
    $('m3Close').addEventListener('change', saveKeepClose);
  }
  render();

  window.CorvoQtyPanel = { fill: fill, spec: spec, setEnabled: setEnabled, rerender: render };
})();
