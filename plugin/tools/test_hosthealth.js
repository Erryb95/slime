// node plugin/tools/test_hosthealth.js
// Caricamento dei moduli host (host/corvo.jsx -> multinest.jsx + regmarks.jsx) e verifica corvoHealth(), senza
// Illustrator: i .jsx girano in un contesto vm di Node con uno stub minimo di ExtendScript ($.global, $.fileName,
// $.evalFile a livello globale, File). Poi la logica del pannello (client/js/hosthealth.js): ensure() con host sano,
// con moduli mancanti (ricarica di primo livello + nuova verifica), con moduli ancora mancanti, con host rotto.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const HOST = path.join(__dirname, '..', 'host');
const HH = require(path.join(__dirname, '..', 'client', 'js', 'hosthealth.js'));
let fails = 0, checks = 0;
function check(ok, msg) { checks++; console.log((ok ? '  OK   ' : '  FAIL ') + msg); if (!ok) fails++; }

// ------------------------------------------------------------------ stub ExtendScript
function File(p) {
  if (!(this instanceof File)) return new File(p);
  p = String(p || '');
  this.fsName = p ? path.resolve(p) : '';
  this.exists = !!p && fs.existsSync(this.fsName);
  Object.defineProperty(this, 'parent', { get: () => new File(path.dirname(this.fsName)) });
}
function makeHost(fileName) {
  const ctx = { File: File, Error: Error };
  ctx.$ = {
    global: ctx, fileName: fileName,
    // ExtendScript $.evalFile chiamato a livello globale: il codice finisce nello scope globale
    evalFile(f) { if (!f.exists) throw new Error('File or folder does not exist'); return vm.runInContext(fs.readFileSync(f.fsName, 'utf8'), ctx, { filename: f.fsName }); }
  };
  vm.createContext(ctx);
  ctx.$.evalFile(new File(path.join(HOST, 'corvo.jsx')));   // come ScriptPath del manifest
  ctx.$.fileName = fileName;
  return ctx;
}
const run = (ctx) => (script) => JSON.parse(vm.runInContext(script, ctx));

(async function main() {
  // ---------------------------------------------------------------- 1. host: caricamento normale
  console.log('1. corvo.jsx con $.fileName valido');
  let ctx = makeHost(path.join(HOST, 'corvo.jsx'));
  let h = JSON.parse(ctx.corvoHealth());
  check(h.ok === true && h.missing.length === 0, 'corvoHealth ok, nessuna funzione mancante');
  check(h.loadErrors.length === 0, 'nessun errore di caricamento');
  check(h.fns.corvo_m4_paint === true && h.fns.corvo_rmFinishAll === true, 'corvo_m4_paint e corvo_rmFinishAll globali');
  check(path.resolve(h.hostDir) === path.resolve(HOST), 'hostDir = cartella host');

  // ---------------------------------------------------------------- 2. host: $.fileName assente (il bug)
  console.log('2. corvo.jsx senza $.fileName: errore registrato, corvoHealth lo dice');
  ctx = makeHost('');
  h = JSON.parse(ctx.corvoHealth());
  check(h.ok === false, 'corvoHealth ok=false');
  check(h.missing.indexOf('corvo_m4_paint') >= 0 && h.missing.indexOf('corvoRegmarks') >= 0, 'mancano corvo_m4_paint e corvoRegmarks');
  check(h.modules['corvo.jsx'].length === 0, 'corvo.jsx completo');
  check(h.loadErrors.length >= 2 && /regmarks\.jsx/.test(h.loadErrors.join()) && /multinest\.jsx/.test(h.loadErrors.join()), 'errori di caricamento in corvoLoadErrors');
  check(HH.filesToLoad(HH.normalize(h)).join() === 'multinest.jsx,regmarks.jsx', 'filesToLoad = i due moduli');

  // ---------------------------------------------------------------- 3. script di ricarica del pannello
  console.log('3. fallbackScript: primo livello, percorso assoluto');
  const fb = HH.fallbackScript('C:\\x\\host\\', ['multinest.jsx']);
  check(!/function\s*\(/.test(fb), 'nessuna funzione intorno a $.evalFile');
  check(/\$\.evalFile\(new File\("C:\/x\/host\/multinest\.jsx"\)\)/.test(fb), 'barre normalizzate, niente barra doppia');
  check(/corvoHealth\(\)$/.test(fb), "l'ultima espressione e' corvoHealth()");

  // ---------------------------------------------------------------- 4. ensure() sull'host simulato
  console.log('4. ensure(): host rotto -> ricarica -> sano');
  let r = await HH.ensure(run(ctx), HOST);
  check(r.ok === true, 'dopo la ricarica ok=true');
  check(r.reloaded.join() === 'multinest.jsx,regmarks.jsx', 'ricaricati i due moduli');
  check(typeof ctx.corvo_m4_paint === 'function' && typeof ctx.corvoRegmarksFinish === 'function', 'funzioni ora in $.global');
  r = await HH.ensure(run(ctx), HOST);
  check(r.ok && r.reloaded.length === 0, 'seconda verifica: niente da ricaricare');

  console.log('5. ensure(): cartella sbagliata -> ok=false con messaggio');
  ctx = makeHost('');
  r = await HH.ensure(run(ctx), path.join(HOST, 'nope'));
  check(r.ok === false && r.missing.indexOf('corvo_m4_paint') >= 0, 'ancora mancanti -> ok=false');
  check(/pannello multinest\.jsx: file non trovato/.test(HH.describe(r)), 'describe() riporta il file non trovato: ' + HH.describe(r).slice(0, 90));

  console.log('5b. ensure(): corvo.jsx mai caricato (o vecchio, senza corvoHealth) -> ricarica tutto');
  {
    const c0 = { File: File, Error: Error };
    c0.$ = { global: c0, fileName: '', evalFile(f) { if (!f.exists) throw new Error('File or folder does not exist'); const prev = c0.$.fileName; c0.$.fileName = f.fsName;
      try { return vm.runInContext(fs.readFileSync(f.fsName, 'utf8'), c0, { filename: f.fsName }); } finally { c0.$.fileName = prev; } } };
    vm.createContext(c0);
    r = await HH.ensure(run(c0), HOST);
    check(r.ok === true && r.reloaded.join() === 'corvo.jsx', `corvo.jsx ricaricato a livello globale, moduli caricati da lui -> ok (${r.reloaded})`);
    check(typeof c0.corvoExport === 'function' && typeof c0.corvo_rmFinishAll === 'function', 'corvoExport e corvo_rmFinishAll globali');
  }

  console.log('6. ensure(): casi del pannello (stub)');
  const calls = [];
  const fake = (answers) => (s) => { calls.push(s); const a = answers.shift(); return a instanceof Error ? Promise.reject(a) : Promise.resolve(a); };
  r = await HH.ensure(fake([{ ok: true, missing: [], modules: {} }]), 'D:/h');
  check(r.ok && calls.length === 1, 'host sano: una sola chiamata');
  calls.length = 0;
  r = await HH.ensure(fake([new Error('EvalScript error.'), new Error('EvalScript error.')]), 'D:/h');
  check(!r.ok && r.error === 'EvalScript error.' && calls.length === 2 && /corvo\.jsx/.test(calls[1]), 'corvoHealth assente -> ricarica corvo.jsx, poi ok=false con errore');
  calls.length = 0;
  r = await HH.ensure(fake([{ ok: false, missing: ['corvoExport'], modules: { 'corvo.jsx': ['corvoExport'] } }]), 'D:/h');
  check(!r.ok && calls.length === 1, 'manca una funzione di corvo.jsx: nessuna ricarica inutile');
  calls.length = 0;
  r = await HH.ensure(fake([{ ok: false, missing: ['corvoRegmarks'], modules: { 'regmarks.jsx': ['corvoRegmarks'] } }, new Error('boom')]), 'D:/h');
  check(!r.ok && r.reloaded.join() === 'regmarks.jsx' && /boom/.test(r.error), 'ricarica fallita -> ok=false, errore');
  check(calls[1] && calls[1].indexOf('regmarks.jsx') > 0 && calls[1].indexOf('multinest.jsx') < 0, 'ricarica solo il file mancante');
  r = await HH.ensure(fake([{ ok: true }]), 'D:/h');
  check(r.ok, 'risposta minima {ok:true} = sano');

  console.log(`\n${checks - fails}/${checks} ok`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
