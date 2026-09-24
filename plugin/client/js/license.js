/* Corvo — modulo 9 "Qualita' commerciale": licenza offline, prova di 14 giorni, edizioni Standard/Pro.
 *
 * Browser/CEP: window.CorvoLicense (con la UI: stato nel piede, finestra licenza). Node: module.exports (test).
 *
 * LICENZA = token "CV1-<payload base64url>.<firma base64url>"
 *   payload JSON {v:1, p:'corvo', id, ed:'standard'|'pro', iat:'YYYY-MM-DD', n?:nome, eh?:hash email,
 *                 exp?:'YYYY-MM-DD', m?:id macchina}
 *   firma ECDSA P-256 / SHA-256 (formato IEEE P1363, 64 byte) sui byte esatti del payload.
 *   La chiave PRIVATA sta fuori dal repo (%USERPROFILE%\.config\corvo\license-private.jwk) e la usa solo
 *   plugin/tools/release/license-gen.mjs; qui c'e' solo la PUBBLICA, che verifica e non puo' firmare.
 *   Verifica: WebCrypto (crypto.subtle, CEF e Node) con ripiego sul modulo crypto di Node (chiave PEM).
 *
 * PROVA = 14 giorni dal primo avvio, con tutte le funzioni Pro. Data di inizio salvata in DUE posti:
 *   localStorage 'corvo.m9' e il file %APPDATA%\Corvo\license.json (Node fs): si prende la data piu' vecchia,
 *   quindi reinstallare il pannello (localStorage nuovo) non azzera la prova. 'lastSeen' = orologio massimo visto:
 *   riportare indietro l'orologio non allunga la prova.
 * DOPO LA PROVA senza licenza ("free"): il nest funziona sempre (anteprima live, Stop, Annulla), ma Applica e'
 *   permesso solo fino a LIMITS.freeApplyMax pezzi (10). Scelto al posto della filigrana: non tocca il file
 *   dell'utente (niente oggetti estranei da togliere prima del taglio) e resta utile per lavori piccoli.
 *
 * GATING = una sola tabella, FEATURES (sotto): funzione -> edizione minima. Per cambiare cosa e' Pro basta
 * cambiare quella tabella. Agganci nei moduli: CorvoLicense.has('holes'|'colorNest'|'costCsv'|'multiSheet'),
 * CorvoLicense.canApply(nPezzi). Se license.js non e' caricato gli agganci lasciano tutto libero.
 */
(function (root, factory) {
  var api = factory(root);
  if (root) root.CorvoLicense = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  var VERSION = '0.9.0-beta';
  var PREFIX = 'CV1-';
  var PRODUCT = 'corvo';
  var TRIAL_DAYS = 14;
  var DAY = 86400000;
  var STORE_KEY = 'corvo.m9';

  // Chiave pubblica di Corvo (generata 2026-09-24 con plugin/tools/release/license-keygen.mjs).
  var PUBLIC_JWK = { kty: 'EC', crv: 'P-256', x: 'zGg0uGHoyigmokBNRrqFVRSf6cd1orOpW02heKU9Pj8', y: 'RYRgUPVx3THaDNJChn3jRtikpH7POkESpGbGgq6tLH8' };
  var PUBLIC_PEM = '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEzGg0uGHoyigmokBNRrqFVRSf6cd1\norOpW02heKU9Pj9FhGBQ9XHdMdoM0kKGfeNG2KSkfs86QRKkZsaCrq0sfw==\n-----END PUBLIC KEY-----';

  // ------------------------------------------------------------------ TABELLA DEL GATING (unico punto da cambiare)
  // edition = edizione minima che sblocca la funzione. Ranghi: free 1 (prova scaduta), standard 1, pro 2, trial 2.
  var FEATURES = {
    holes:      { edition: 'pro', module: 2, en: 'Pieces inside holes', it: 'Pezzi dentro i fori' },
    colorNest:  { edition: 'pro', module: 4, en: 'Nesting by colour/layer', it: 'Nesting per colore/livello' },
    costCsv:    { edition: 'pro', module: 5, en: 'Cost report CSV export', it: 'Export CSV del report costi' },
    multiSheet: { edition: 'pro', module: 7, en: 'Multi-sheet nesting', it: 'Nesting su piu\' fogli' }
  };
  var RANK = { free: 1, standard: 1, pro: 2, trial: 2 };
  var LIMITS = { freeApplyMax: 10 };
  var EDITIONS = ['standard', 'pro'];      // edizioni che una licenza puo' portare

  // ------------------------------------------------------------------ utilita'
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64uDecode(s) {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('b64');
    var out = [], buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      buf = (buf << 6) | B64.indexOf(s.charAt(i)); bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
    }
    return new Uint8Array(out);
  }
  function b64uEncode(bytes) {
    var s = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63];
    }
    if (bytes.length - i === 1) { var a = bytes[i] << 16; s += B64[a >> 18 & 63] + B64[a >> 12 & 63]; }
    else if (bytes.length - i === 2) { var b = (bytes[i] << 16) | (bytes[i + 1] << 8); s += B64[b >> 18 & 63] + B64[b >> 12 & 63] + B64[b >> 6 & 63]; }
    return s;
  }
  function utf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decodeURIComponent(escape(String.fromCharCode.apply(null, bytes)));
  }
  function nodeReq(name) {
    try { if (typeof require === 'function') return require(name); } catch (e) { /* no Node */ }
    return null;
  }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')); }
  function dayStr(ms) { return new Date(ms).toISOString().slice(0, 10); }

  // ------------------------------------------------------------------ id macchina (solo per le licenze legate)
  // 16 cifre esadecimali da hostname + modello CPU; non esce mai dal PC se non lo copia l'utente.
  function machineId() {
    var os = nodeReq('os'), cr = nodeReq('crypto');
    if (!os || !cr) return null;
    var cpu = (os.cpus && os.cpus()[0] && os.cpus()[0].model) || '';
    var h = cr.createHash('sha256').update('corvo-machine|' + String(os.hostname()).toLowerCase() + '|' + cpu.trim()).digest('hex');
    return h.slice(0, 16).toUpperCase().replace(/(.{4})(?!$)/g, '$1-');
  }
  function normMachine(s) { return String(s || '').toUpperCase().replace(/[^0-9A-F]/g, ''); }

  // ------------------------------------------------------------------ token
  // -> {payload, bytes, sig} oppure lancia Error con .code
  function fail(code) { var e = new Error(code); e.code = code; throw e; }
  function parseToken(token) {
    var s = String(token || '').replace(/\s+/g, '');
    if (s.indexOf(PREFIX) !== 0) fail('format');
    var parts = s.slice(PREFIX.length).split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) fail('format');
    var bytes, sig, payload;
    try { bytes = b64uDecode(parts[0]); sig = b64uDecode(parts[1]); payload = JSON.parse(utf8(bytes)); }
    catch (e) { fail('format'); }
    if (sig.length !== 64 || !payload || typeof payload !== 'object') fail('format');
    return { payload: payload, bytes: bytes, sig: sig, token: s };
  }

  function subtle() {
    var c = (root && root.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (c && c.subtle) return c.subtle;
    var nc = nodeReq('crypto');
    return (nc && nc.webcrypto && nc.webcrypto.subtle) || null;
  }
  function verifyWebCrypto(bytes, sig, jwk) {
    var sb = subtle();
    if (!sb) return Promise.reject(new Error('no webcrypto'));
    return sb.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']).then(function (k) {
      return sb.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, sig, bytes);
    });
  }
  function verifyNode(bytes, sig, pem) {
    var cr = nodeReq('crypto');
    if (!cr || !cr.verify) return Promise.reject(new Error('no node crypto'));
    return Promise.resolve(cr.verify('sha256', Buffer.from(bytes), { key: pem, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig)));
  }
  function verifySig(bytes, sig, opts) {
    var jwk = opts.publicJwk || PUBLIC_JWK, pem = opts.publicPem || PUBLIC_PEM;
    if (opts.backend === 'node') return verifyNode(bytes, sig, pem);
    if (opts.backend === 'webcrypto') return verifyWebCrypto(bytes, sig, jwk);
    return verifyWebCrypto(bytes, sig, jwk).catch(function () { return verifyNode(bytes, sig, pem); });
  }

  /** Verifica una licenza. opts: {publicJwk, publicPem, backend, machineId, now}.
   *  -> Promise<{ok:true, lic:{id, edition, name, emailHash, issued, exp, machine}} | {ok:false, error}>
   *  error: 'format' | 'signature' | 'product' | 'edition' | 'expired' | 'machine' */
  function checkLicense(token, opts) {
    opts = opts || {};
    var t;
    try { t = parseToken(token); } catch (e) { return Promise.resolve({ ok: false, error: e.code || 'format' }); }
    return verifySig(t.bytes, t.sig, opts).then(function (valid) {
      if (!valid) return { ok: false, error: 'signature' };
      var p = t.payload, now = opts.now !== undefined ? opts.now : Date.now();
      if (p.v !== 1 || p.p !== PRODUCT) return { ok: false, error: 'product' };
      if (EDITIONS.indexOf(p.ed) < 0) return { ok: false, error: 'edition' };
      if (!isDate(p.iat)) return { ok: false, error: 'format' };
      if (p.exp !== undefined && p.exp !== null) {
        if (!isDate(p.exp)) return { ok: false, error: 'format' };
        if (now >= Date.parse(p.exp + 'T00:00:00Z') + DAY) return { ok: false, error: 'expired' };
      }
      if (p.m) {
        var here = opts.machineId !== undefined ? opts.machineId : machineId();
        if (!here || normMachine(here) !== normMachine(p.m)) return { ok: false, error: 'machine' };
      }
      return { ok: true, token: t.token, lic: { id: p.id || '', edition: p.ed, name: p.n || '', emailHash: p.eh || '',
        issued: p.iat, exp: p.exp || null, machine: p.m || null } };
    }, function () { return { ok: false, error: 'signature' }; });
  }

  // ------------------------------------------------------------------ archivio (localStorage + file)
  function defaultFile() {
    var path = nodeReq('path'), os = nodeReq('os');
    if (!path || !os) return null;
    var base = (typeof process !== 'undefined' && process.env && process.env.APPDATA) || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'Corvo', 'license.json');
  }
  function num(v) { v = +v; return isFinite(v) && v > 0 ? v : null; }
  function clean(r) {
    r = r && typeof r === 'object' ? r : {};
    return { trialStart: num(r.trialStart), lastSeen: num(r.lastSeen), key: typeof r.key === 'string' && r.key ? r.key : null };
  }
  function merge(a, b) {
    a = clean(a); b = clean(b);
    var ts = [a.trialStart, b.trialStart].filter(Boolean), ls = [a.lastSeen, b.lastSeen].filter(Boolean);
    return { trialStart: ts.length ? Math.min.apply(null, ts) : null,
             lastSeen: ls.length ? Math.max.apply(null, ls) : null,
             key: b.key || a.key || null };
  }
  /** opts: {localStorage, file, fs} (default: window.localStorage, %APPDATA%\Corvo\license.json, require('fs')).
   *  file:null disattiva il file. */
  function createStore(opts) {
    opts = opts || {};
    var ls = 'localStorage' in opts ? opts.localStorage : (function () { try { return root && root.localStorage; } catch (e) { return null; } })();
    var file = 'file' in opts ? opts.file : defaultFile();
    var fs = opts.fs || nodeReq('fs');
    var path = nodeReq('path');
    function readLs() { try { return ls ? JSON.parse(ls.getItem(STORE_KEY) || 'null') : null; } catch (e) { return null; } }
    function readFile() { try { return file && fs ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; } catch (e) { return null; } }
    return {
      file: file,
      read: function () { return merge(readLs(), readFile()); },
      write: function (rec) {
        rec = clean(rec);
        var s = JSON.stringify(rec);
        try { if (ls) ls.setItem(STORE_KEY, s); } catch (e) { /* storage blocked */ }
        try {
          if (file && fs) {
            if (path && fs.mkdirSync) fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, s, 'utf8');
          }
        } catch (e) { /* read-only profile: localStorage still holds it */ }
        return rec;
      }
    };
  }

  /** Prima apertura: fissa trialStart; ogni apertura: lastSeen = max(lastSeen, now). -> record aggiornato. */
  function touch(store, now) {
    now = now !== undefined ? now : Date.now();
    var r = store.read();
    if (!r.trialStart) r.trialStart = now;
    r.lastSeen = Math.max(r.lastSeen || 0, now);
    return store.write(r);
  }

  /** -> {start, daysLeft, expired} ; clock riportato indietro = conta l'orologio piu' avanti visto. */
  function trialInfo(rec, now) {
    now = now !== undefined ? now : Date.now();
    rec = clean(rec);
    var start = rec.trialStart || now;
    var eff = Math.max(now, rec.lastSeen || 0);
    var used = eff - start;
    if (used < 0) return { start: start, daysLeft: 0, expired: true };       // inizio nel futuro: manomesso
    var left = TRIAL_DAYS * DAY - used;
    return { start: start, daysLeft: Math.max(0, Math.ceil(left / DAY)), expired: left <= 0 };
  }

  /** stato complessivo: licenza verificata (o null) + prova -> {mode, edition, rank, applyMax, daysLeft, lic} */
  function computeState(lic, trial) {
    if (lic) return { mode: 'licensed', edition: lic.edition, rank: RANK[lic.edition] || 1, applyMax: Infinity, daysLeft: null, lic: lic };
    if (trial && !trial.expired) return { mode: 'trial', edition: 'trial', rank: RANK.trial, applyMax: Infinity, daysLeft: trial.daysLeft, lic: null };
    return { mode: 'expired', edition: 'free', rank: RANK.free, applyMax: LIMITS.freeApplyMax, daysLeft: 0, lic: null };
  }
  function hasIn(state, feature) {
    var f = FEATURES[feature];
    if (!f) return true;                       // funzione non in tabella = libera
    return !!state && state.rank >= RANK[f.edition];
  }
  function canApplyIn(state, n) { return !state || (+n || 0) <= state.applyMax; }

  // ------------------------------------------------------------------ stato del pannello
  var cur = null, store = null, listeners = [];
  function emit() { listeners.forEach(function (fn) { try { fn(cur); } catch (e) { /* listener error */ } }); }
  function refresh() {
    var rec = store.read();
    var trial = trialInfo(rec);
    cur = computeState(cur && cur.lic && rec.key ? cur.lic : null, trial);
    cur.trial = trial;
    return rec;
  }
  function init(opts) {
    store = createStore(opts);
    touch(store);
    var rec = refresh();                       // sincrono: prova subito valida per il gating
    emit();
    if (!rec.key) return Promise.resolve(cur);
    return checkLicense(rec.key).then(function (res) {
      if (res.ok) { cur = computeState(res.lic, cur.trial); cur.trial = trialInfo(store.read()); }
      else cur.keyError = res.error;
      emit();
      return cur;
    });
  }
  function activate(token) {
    return checkLicense(token).then(function (res) {
      if (!res.ok) return res;
      var rec = store.read(); rec.key = res.token; store.write(rec);
      cur = computeState(res.lic, trialInfo(rec)); cur.trial = trialInfo(rec);
      emit();
      return res;
    });
  }
  function deactivate() {
    var rec = store.read(); rec.key = null; store.write(rec);
    cur = null; refresh(); emit();
    return cur;
  }

  var api = {
    VERSION: VERSION, PREFIX: PREFIX, TRIAL_DAYS: TRIAL_DAYS, FEATURES: FEATURES, RANK: RANK, LIMITS: LIMITS, EDITIONS: EDITIONS,
    PUBLIC_JWK: PUBLIC_JWK, PUBLIC_PEM: PUBLIC_PEM,
    // logica pura (test)
    parseToken: parseToken, checkLicense: checkLicense, createStore: createStore, touch: touch, trialInfo: trialInfo,
    computeState: computeState, hasIn: hasIn, canApplyIn: canApplyIn, machineId: machineId,
    b64uEncode: b64uEncode, b64uDecode: b64uDecode,
    // pannello
    init: init, activate: activate, deactivate: deactivate,
    state: function () { return cur; },
    has: function (f) { return cur ? hasIn(cur, f) : true; },
    canApply: function (n) { return canApplyIn(cur, n); },
    applyMax: function () { return cur ? cur.applyMax : Infinity; },
    onChange: function (fn) { listeners.push(fn); if (cur) fn(cur); }
  };
  if (root && root.document) setupUi(api);
  return api;

  // ------------------------------------------------------------------ UI (piede + finestra licenza)
  function setupUi(L) {
    var doc = root.document;
    var STR = {
      en: {
        trial: 'Trial · {d} d left', expired: 'Trial ended', pro: 'Pro', standard: 'Standard',
        title: 'Corvo licence', keyPh: 'Paste your licence key (CV1-…)', activate: 'Activate', remove: 'Remove licence',
        close: 'Close', machine: 'Machine ID', copy: 'Copy',
        sTrial: 'Trial: {d} day(s) left with every Pro feature.',
        sExpired: 'Trial ended: nesting still works, Apply is limited to {n} pieces. Enter a licence key to remove the limit.',
        sLicensed: '{ed} licence · {who} · issued {iat}{exp}', sExp: ' · valid until {d}', sBound: ' · bound to this PC',
        proOnly: 'Pro only: {list}.',
        ok: 'Licence activated: {ed}.', removed: 'Licence removed.',
        e_format: 'This is not a Corvo licence key (it must start with CV1-).', e_signature: 'Invalid key: the signature does not match.',
        e_product: 'This key is not for Corvo.', e_edition: 'Unknown edition in this key.', e_expired: 'This licence has expired.',
        e_machine: 'This licence is bound to another computer.',
        applyLimit: 'Trial ended: Apply is limited to {n} pieces (this layout has {k}). Enter a licence key (footer) or Cancel.',
        proFeature: '{f} is a Pro feature.', copied: 'Copied.'
      },
      it: {
        trial: 'Prova · {d} gg', expired: 'Prova finita', pro: 'Pro', standard: 'Standard',
        title: 'Licenza Corvo', keyPh: 'Incolla la chiave di licenza (CV1-…)', activate: 'Attiva', remove: 'Rimuovi licenza',
        close: 'Chiudi', machine: 'ID macchina', copy: 'Copia',
        sTrial: 'Prova: {d} giorni rimasti con tutte le funzioni Pro.',
        sExpired: 'Prova finita: il nest funziona, Applica e\' limitato a {n} pezzi. Inserisci una licenza per togliere il limite.',
        sLicensed: 'Licenza {ed} · {who} · emessa il {iat}{exp}', sExp: ' · valida fino al {d}', sBound: ' · legata a questo PC',
        proOnly: 'Solo Pro: {list}.',
        ok: 'Licenza attivata: {ed}.', removed: 'Licenza rimossa.',
        e_format: 'Non e\' una chiave di licenza Corvo (deve iniziare con CV1-).', e_signature: 'Chiave non valida: la firma non corrisponde.',
        e_product: 'Questa chiave non e\' per Corvo.', e_edition: 'Edizione sconosciuta nella chiave.', e_expired: 'Questa licenza e\' scaduta.',
        e_machine: 'Questa licenza e\' legata a un altro computer.',
        applyLimit: 'Prova finita: Applica e\' limitato a {n} pezzi (questa disposizione ne ha {k}). Inserisci una licenza (in basso) o Annulla.',
        proFeature: '{f}: funzione Pro.', copied: 'Copiato.'
      }
    };
    function lang() { try { return root.localStorage.getItem('corvo.lang') === 'it' ? 'it' : 'en'; } catch (e) { return 'en'; } }
    function t(k, v) {
      var s = STR[lang()][k] || STR.en[k] || k;
      if (v) s = s.replace(/\{(\w+)\}/g, function (m, x) { return v[x] !== undefined ? v[x] : m; });
      return s;
    }
    function el(tag, attrs, text) {
      var e = doc.createElement(tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (text) e.textContent = text;
      return e;
    }
    function featureName(f) { return (FEATURES[f] && FEATURES[f][lang()]) || f; }
    L.t = t;
    L.featureName = featureName;
    L.applyLimitMsg = function (k) { return t('applyLimit', { n: LIMITS.freeApplyMax, k: k }); };
    L.proFeatureMsg = function (f) { return t('proFeature', { f: featureName(f) }); };

    var btn, ver, dlg, input, msgEl, statusEl, machineEl;
    function build() {
      var footer = doc.querySelector('footer');
      if (!footer) return false;
      ver = doc.getElementById('corvoVersion');
      if (ver) ver.textContent = 'v' + VERSION;
      btn = el('button', { type: 'button', id: 'm9Lic', 'class': 'link m9-badge' });
      var langBtn = doc.getElementById('btnLang');
      footer.insertBefore(btn, langBtn || null);
      dlg = el('div', { id: 'm9Dialog', 'class': 'm9-dialog', role: 'dialog', 'aria-modal': 'true', hidden: '' });
      var box = el('div', { 'class': 'm9-box' });
      box.appendChild(el('h2', { id: 'm9Title' }));
      statusEl = el('p', { id: 'm9Status', 'class': 'm9-status' });
      box.appendChild(statusEl);
      input = el('textarea', { id: 'm9Key', rows: '3', spellcheck: 'false' });
      box.appendChild(input);
      var row = el('div', { 'class': 'm9-row' });
      row.appendChild(el('button', { type: 'button', id: 'm9Activate', 'class': 'btn primary' }));
      row.appendChild(el('button', { type: 'button', id: 'm9Remove', 'class': 'btn' }));
      box.appendChild(row);
      msgEl = el('p', { id: 'm9Msg', 'class': 'status' });
      box.appendChild(msgEl);
      var mrow = el('p', { 'class': 'm9-machine' });
      mrow.appendChild(el('span', { id: 'm9MachineLbl' }));
      machineEl = el('code', { id: 'm9Machine' }, machineId() || '–');
      mrow.appendChild(machineEl);
      mrow.appendChild(el('button', { type: 'button', id: 'm9Copy', 'class': 'link' }));
      box.appendChild(mrow);
      var foot = el('div', { 'class': 'm9-row end' });
      foot.appendChild(el('span', { 'class': 'm9-ver' }, 'Corvo v' + VERSION));
      foot.appendChild(el('button', { type: 'button', id: 'm9Close', 'class': 'btn' }));
      box.appendChild(foot);
      dlg.appendChild(box);
      doc.body.appendChild(dlg);

      btn.addEventListener('click', open);
      doc.getElementById('m9Close').addEventListener('click', close);
      dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
      doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dlg.hidden) close(); });
      doc.getElementById('m9Activate').addEventListener('click', function () {
        var v = input.value.trim();
        if (!v) return;
        L.activate(v).then(function (res) {
          if (res.ok) { input.value = ''; say(t('ok', { ed: t(res.lic.edition) }), 'ok'); }
          else say(t('e_' + res.error), 'error');
        });
      });
      doc.getElementById('m9Remove').addEventListener('click', function () { L.deactivate(); say(t('removed'), 'warn'); });
      doc.getElementById('m9Copy').addEventListener('click', function () {
        copyText(machineEl.textContent); say(t('copied'), 'ok');
      });
      var lb = doc.getElementById('btnLang');
      if (lb) lb.addEventListener('click', function () { setTimeout(render, 0); });
      return true;
    }
    function copyText(s) {
      try { root.navigator.clipboard.writeText(s); return; } catch (e) { /* fallback */ }
      var ta = el('textarea'); ta.value = s; doc.body.appendChild(ta); ta.select();
      try { doc.execCommand('copy'); } catch (e2) { /* ignore */ } doc.body.removeChild(ta);
    }
    function say(s, kind) { msgEl.textContent = s; msgEl.className = 'status' + (kind ? ' ' + kind : ''); }
    function open() { render(); say('', ''); dlg.hidden = false; input.focus(); }
    function close() { dlg.hidden = true; }
    L.openDialog = function () { if (dlg) open(); };

    function render() {
      var s = cur;
      if (!btn || !s) return;
      var label = s.mode === 'licensed' ? t(s.edition) : s.mode === 'trial' ? t('trial', { d: s.daysLeft }) : t('expired');
      btn.textContent = label;
      btn.className = 'link m9-badge ' + s.mode;
      doc.getElementById('m9Title').textContent = t('title');
      input.setAttribute('placeholder', t('keyPh'));
      doc.getElementById('m9Activate').textContent = t('activate');
      var rm = doc.getElementById('m9Remove');
      rm.textContent = t('remove'); rm.hidden = s.mode !== 'licensed';
      doc.getElementById('m9Close').textContent = t('close');
      doc.getElementById('m9MachineLbl').textContent = t('machine') + ': ';
      doc.getElementById('m9Copy').textContent = t('copy');
      var st;
      if (s.mode === 'licensed') {
        var who = s.lic.name || (s.lic.emailHash ? '#' + s.lic.emailHash.slice(0, 8) : '–');
        st = t('sLicensed', { ed: t(s.edition), who: who, iat: s.lic.issued,
          exp: (s.lic.exp ? t('sExp', { d: s.lic.exp }) : '') + (s.lic.machine ? t('sBound') : '') });
      } else if (s.mode === 'trial') st = t('sTrial', { d: s.daysLeft });
      else st = t('sExpired', { n: LIMITS.freeApplyMax });
      var locked = Object.keys(FEATURES).filter(function (f) { return !hasIn(s, f); }).map(featureName);
      if (locked.length) st += ' ' + t('proOnly', { list: locked.join(', ') });
      if (s.keyError) st += ' ' + t('e_' + s.keyError);
      statusEl.textContent = st;
      // gating visivo del modulo 2 (gli altri moduli controllano has() al momento dell'uso)
      var hb = doc.getElementById('useHoles'), ho = doc.getElementById('holesOpt');
      if (hb && ho) {
        var okH = hasIn(s, 'holes');
        ho.classList.toggle('m9-locked', !okH);
        ho.title = okH ? '' : L.proFeatureMsg('holes');
        if (!okH) { hb.checked = false; hb.disabled = true; hb.setAttribute('data-m9', '1'); }
        else if (hb.getAttribute('data-m9')) { hb.removeAttribute('data-m9'); hb.disabled = false; }
      }
    }
    L.render = render;

    function start() {
      if (!build()) return;
      L.onChange(render);
      L.init().catch(function (e) { console.warn('[corvo] licence init failed:', e); });
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
    else start();
  }
});
