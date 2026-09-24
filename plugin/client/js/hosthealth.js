/* Corvo — verifica dei moduli host (host/corvo.jsx + multinest.jsx + regmarks.jsx).
 *
 * corvo.jsx carica multinest.jsx e regmarks.jsx a livello globale all'avvio. Se quel caricamento fallisce, il
 * pannello li ricarica con uno script di PRIMO LIVELLO ($.evalFile fuori da ogni funzione: dentro una funzione le
 * funzioni del modulo resterebbero locali e corvo.jsx non le vedrebbe) e poi verifica con corvoHealth() che tutte
 * le funzioni attese esistano davvero in $.global. Niente DOM: window.CorvoHostHealth nel pannello, module.exports
 * in Node.
 */
(function (root) {
  'use strict';

  var FILES = ['multinest.jsx', 'regmarks.jsx'];

  // risposta di corvoHealth() (oggetto gia' parsato) -> forma normalizzata
  function normalize(h) {
    h = h || {};
    var missing = Array.isArray(h.missing) ? h.missing.slice() : [];
    var modules = h.modules && typeof h.modules === 'object' ? h.modules : {};
    var loadErrors = Array.isArray(h.loadErrors) ? h.loadErrors.slice() : [];
    return { ok: missing.length === 0 && h.ok !== false, missing: missing, modules: modules, loadErrors: loadErrors,
      hostDir: h.hostDir || '' };
  }

  // file host con almeno una funzione mancante (solo quelli ricaricabili dal pannello)
  function filesToLoad(h) {
    return FILES.filter(function (f) { return h.modules[f] && h.modules[f].length; });
  }

  // script di primo livello: niente (function(){...})(), l'ultima espressione e' il risultato di evalScript
  function fallbackScript(hostDir, files) {
    var dir = String(hostDir).replace(/\\/g, '/').replace(/\/+$/, '');
    var out = 'if(!$.global.corvoLoadErrors)$.global.corvoLoadErrors=[];\n';
    files.forEach(function (f) {
      var p = JSON.stringify(dir + '/' + f);
      out += 'try{if(!new File(' + p + ').exists)throw new Error("file non trovato: "+' + p + ');' +
        '$.evalFile(new File(' + p + '));}catch(e){$.global.corvoLoadErrors.push("pannello ' + f + ': "+(e.message||e));}\n';
    });
    return out + 'corvoHealth()';
  }

  /* run(script) -> Promise<oggetto JSON> (hostScript del pannello). Ritorna Promise<{ok, missing, modules,
   * loadErrors, reloaded:[file], error?}>: non rigetta mai, un errore diventa ok:false con `error`.
   * 1) corvoHealth(); se non esiste (corvo.jsx non caricato, o una versione vecchia rimasta nel motore ExtendScript)
   *    ricarica corvo.jsx a livello globale, che a sua volta carica i moduli; 2) se mancano ancora funzioni dei
   *    moduli, ricarica solo quei file; 3) il risultato e' sempre l'ultima risposta di corvoHealth(). */
  function ensure(run, hostDir) {
    var reloaded = [];
    function fail(err) {
      return { ok: false, missing: ['corvoHealth'], modules: {}, loadErrors: [], reloaded: reloaded.slice(),
        error: String(err && err.message || err) };
    }
    function call(script) { return Promise.resolve().then(function () { return run(script); }); }
    function modulesStep(res) {
      var h = normalize(res);
      h.reloaded = reloaded.slice();
      if (h.ok) return h;
      var files = filesToLoad(h);
      if (!files.length) return h;          // manca qualcosa di corvo.jsx: ricaricare i moduli non serve
      reloaded = reloaded.concat(files);
      return call(fallbackScript(hostDir, files)).then(function (res2) {
        var h2 = normalize(res2);
        h2.reloaded = reloaded.slice();
        return h2;
      }, fail);
    }
    return call('corvoHealth()').then(modulesStep, function () {
      reloaded.push('corvo.jsx');
      return call(fallbackScript(hostDir, ['corvo.jsx'])).then(modulesStep, fail);
    });
  }

  // testo breve per la riga di stato
  function describe(h) {
    var s = (h.missing || []).join(', ');
    if (h.error) s += (s ? ' — ' : '') + h.error;
    if (h.loadErrors && h.loadErrors.length) s += (s ? ' — ' : '') + h.loadErrors.join(' | ');
    return s;
  }

  var api = { FILES: FILES, normalize: normalize, filesToLoad: filesToLoad, fallbackScript: fallbackScript,
    ensure: ensure, describe: describe };
  if (root) root.CorvoHostHealth = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));
