// node plugin/tools/test_license.js
// Modulo 9: licenza offline ECDSA P-256 (license.js + release/license-gen.mjs), prova 14 giorni, gating edizioni.
// Usa una coppia di chiavi DI TEST generata al volo in una cartella temporanea; se esiste la chiave privata vera
// (%USERPROFILE%\.config\corvo\license-private.jwk) prova anche il giro completo con la chiave pubblica incorporata.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const L = require(path.join(__dirname, '..', 'client', 'js', 'license.js'));
const REL = path.join(__dirname, 'release');
const GEN = path.join(REL, 'license-gen.mjs'), KEYGEN = path.join(REL, 'license-keygen.mjs');

let fails = 0, passes = 0;
function check(cond, msg) { if (cond) passes++; else { fails++; console.log('  FAIL: ' + msg); } }
const DAY = 86400000;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corvo-m9-'));

function run(file, args) {
  return cp.execFileSync(process.execPath, [file].concat(args), { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
}
function gen(args, keyFile) { return JSON.parse(run(GEN, args.concat(keyFile ? ['--key', keyFile] : [], ['--json']))); }
function b64u(b) { return Buffer.from(b).toString('base64url'); }
function memLs() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; }
const ALL = ['holes', 'costCsv', 'colorNest', 'multiSheet'];

(async function main() {
  // ---------------------------------------------------------------- chiavi di test
  const testKey = path.join(tmp, 'test-private.jwk');
  run(KEYGEN, ['--out', testKey]);
  const priv = JSON.parse(fs.readFileSync(testKey, 'utf8'));
  const pubJwk = { kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y };
  const pubPem = crypto.createPublicKey({ key: pubJwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  const T = { publicJwk: pubJwk, publicPem: pubPem };
  const optsFor = (extra) => Object.assign({}, T, extra || {});
  const signRaw = async (payload) => {   // firma un payload arbitrario (casi che license-gen rifiuta)
    const k = await crypto.webcrypto.subtle.importKey('jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const bytes = Buffer.from(JSON.stringify(payload));
    const sig = new Uint8Array(await crypto.webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, bytes));
    return 'CV1-' + b64u(bytes) + '.' + b64u(sig);
  };

  // ---------------------------------------------------------------- valide (entrambi i motori di verifica)
  const pro = gen(['--email', 'Cliente@Example.com', '--edition', 'pro'], testKey);
  const std = gen(['--name', 'Insegne Test', '--edition', 'standard'], testKey);
  check(/^CV1-[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/.test(pro.token), 'formato token CV1-<payload>.<firma 64 byte>');
  check(!('email' in pro.payload) && pro.payload.eh === crypto.createHash('sha256').update('cliente@example.com').digest('hex').slice(0, 16),
    'email non nel token, solo hash (minuscolo)');
  for (const backend of ['webcrypto', 'node']) {
    const r1 = await L.checkLicense(pro.token, optsFor({ backend }));
    check(r1.ok && r1.lic.edition === 'pro' && r1.lic.emailHash === pro.payload.eh, `[${backend}] pro valida`);
    const r2 = await L.checkLicense(std.token, optsFor({ backend }));
    check(r2.ok && r2.lic.edition === 'standard' && r2.lic.name === 'Insegne Test', `[${backend}] standard valida`);
  }
  const wrapped = pro.token.slice(0, 40) + '\n  ' + pro.token.slice(40) + '\n';
  check((await L.checkLicense(wrapped, T)).ok, 'token spezzato su piu\' righe (email) accettato');

  // ---------------------------------------------------------------- manomesse
  const [head, sigPart] = pro.token.slice(4).split('.');
  const pl = JSON.parse(Buffer.from(head, 'base64url').toString());
  const [stdHead, stdSig] = std.token.slice(4).split('.');
  const stdPl = JSON.parse(Buffer.from(stdHead, 'base64url').toString());
  const upgraded = 'CV1-' + b64u(Buffer.from(JSON.stringify(Object.assign({}, stdPl, { ed: 'pro' })))) + '.' + stdSig;
  for (const backend of ['webcrypto', 'node']) {
    check((await L.checkLicense(upgraded, optsFor({ backend }))).error === 'signature', `[${backend}] standard->pro modificata: firma`);
    const sig = Buffer.from(sigPart, 'base64url'); sig[10] ^= 1;
    check((await L.checkLicense('CV1-' + head + '.' + b64u(sig), optsFor({ backend }))).error === 'signature', `[${backend}] firma alterata`);
    const pl2 = Object.assign({}, pl, { n: 'Altro' });
    check((await L.checkLicense('CV1-' + b64u(Buffer.from(JSON.stringify(pl2))) + '.' + sigPart, optsFor({ backend }))).error === 'signature', `[${backend}] payload alterato`);
  }
  check((await L.checkLicense(pro.token)).error === 'signature', 'firmata con un\'altra chiave -> rifiutata dalla chiave di Corvo');
  check((await L.checkLicense('CF1-' + pro.token.slice(4), T)).error === 'format', 'prefisso sbagliato (CamForge) -> format');
  check((await L.checkLicense('CV1-abc', T)).error === 'format', 'senza firma -> format');
  check((await L.checkLicense('CV1-' + head + '.AAAA', T)).error === 'format', 'firma corta -> format');
  check((await L.checkLicense('CV1-%%%.' + sigPart, T)).error === 'format', 'base64 non valido -> format');
  check((await L.checkLicense('', T)).error === 'format', 'vuota -> format');

  // ---------------------------------------------------------------- edizione / prodotto sbagliati
  const ultra = gen(['--name', 'X', '--edition', 'ultra', '--allow-any-edition'], testKey);
  check((await L.checkLicense(ultra.token, T)).error === 'edition', 'edizione sconosciuta -> edition');
  check((await L.checkLicense(await signRaw({ v: 1, p: 'camforge', id: 'x', ed: 'pro', iat: '2026-09-24' }), T)).error === 'product', 'altro prodotto -> product');
  check((await L.checkLicense(await signRaw({ v: 2, p: 'corvo', id: 'x', ed: 'pro', iat: '2026-09-24' }), T)).error === 'product', 'versione formato ignota -> product');
  check((await L.checkLicense(await signRaw({ v: 1, p: 'corvo', id: 'x', ed: 'pro', iat: 'ieri' }), T)).error === 'format', 'data di emissione non valida -> format');
  const sStd = L.computeState((await L.checkLicense(std.token, T)).lic, { expired: true, daysLeft: 0 });
  check(ALL.every((f) => !L.hasIn(sStd, f)), 'Standard: niente funzioni Pro (fori, CSV, colore, multi-foglio)');
  check(L.canApplyIn(sStd, 500), 'Standard: Applica senza limite di pezzi');
  const sPro = L.computeState((await L.checkLicense(pro.token, T)).lic, { expired: true });
  check(ALL.every((f) => L.hasIn(sPro, f)) && L.canApplyIn(sPro, 500), 'Pro: tutto');
  check(L.hasIn(sStd, 'funzioneNonInTabella'), 'funzione non in tabella = libera');

  // ---------------------------------------------------------------- scadenza e macchina
  const sub = gen(['--name', 'Abbonato', '--edition', 'pro', '--issued', '2026-01-01', '--days', '30'], testKey);
  check(sub.payload.exp === '2026-01-31', 'scadenza = emissione + 30 giorni');
  check((await L.checkLicense(sub.token, optsFor({ now: Date.parse('2026-01-31T23:00:00Z') }))).ok, 'abbonamento valido l\'ultimo giorno');
  check((await L.checkLicense(sub.token, optsFor({ now: Date.parse('2026-02-01T00:00:01Z') }))).error === 'expired', 'abbonamento scaduto');
  const here = L.machineId();
  check(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(here || ''), 'ID macchina 16 hex a gruppi di 4');
  check(L.machineId() === here, 'ID macchina stabile');
  const bound = gen(['--name', 'PC', '--edition', 'pro', '--machine', here.toLowerCase()], testKey);
  check((await L.checkLicense(bound.token, T)).ok, 'legata a questo PC: valida qui');
  check((await L.checkLicense(bound.token, optsFor({ machineId: '0000-0000-0000-0001' }))).error === 'machine', 'legata a un altro PC: machine');
  check(!('m' in pro.payload), 'legame alla macchina spento per default');

  // ---------------------------------------------------------------- prova 14 giorni
  const t0 = Date.parse('2026-09-24T10:00:00Z');
  const file = path.join(tmp, 'Corvo', 'license.json');
  const ls1 = memLs();
  const st1 = L.createStore({ localStorage: ls1, file });
  L.touch(st1, t0);
  check(fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).trialStart === t0, 'prova salvata nel file (%APPDATA%\\Corvo)');
  check(JSON.parse(ls1.getItem('corvo.m9')).trialStart === t0, 'prova salvata in localStorage');
  let tr = L.trialInfo(st1.read(), t0 + 13 * DAY);
  check(!tr.expired && tr.daysLeft === 1, 'giorno 13: 1 giorno rimasto');
  const sTrial = L.computeState(null, tr);
  check(sTrial.mode === 'trial' && ALL.every((f) => L.hasIn(sTrial, f)) && L.canApplyIn(sTrial, 999), 'in prova: tutto Pro, Applica libero');
  tr = L.trialInfo(st1.read(), t0 + 14 * DAY);
  check(tr.expired && tr.daysLeft === 0, 'giorno 14: prova finita');
  const sExp = L.computeState(null, tr);
  check(sExp.mode === 'expired' && sExp.applyMax === 10, 'prova finita: Applica limitato a 10');
  check(L.canApplyIn(sExp, 10) && !L.canApplyIn(sExp, 11), 'prova finita: 10 pezzi si, 11 no');
  check(ALL.every((f) => !L.hasIn(sExp, f)), 'prova finita: niente Pro');
  check(L.computeState((await L.checkLicense(std.token, T)).lic, tr).applyMax === Infinity, 'licenza Standard dopo la prova: limite tolto');

  // reinstallazione: localStorage nuovo, file rimasto -> la prova NON riparte
  const st2 = L.createStore({ localStorage: memLs(), file });
  const rec2 = L.touch(st2, t0 + 20 * DAY);
  check(rec2.trialStart === t0 && L.trialInfo(rec2, t0 + 20 * DAY).expired, 'reinstallazione (localStorage vuoto): prova non azzerata');
  // file cancellato ma localStorage vivo -> idem, e il file torna
  fs.unlinkSync(file);
  const st3 = L.createStore({ localStorage: ls1, file });
  check(L.touch(st3, t0 + 21 * DAY).trialStart === t0 && fs.existsSync(file), 'file cancellato: ripristinato da localStorage');
  // due date diverse -> vale la piu' vecchia
  ls1.setItem('corvo.m9', JSON.stringify({ trialStart: t0 + 5 * DAY, lastSeen: t0 + 5 * DAY }));
  check(st3.read().trialStart === t0, 'date diverse: vince la piu\' vecchia');
  // orologio indietro: lastSeen tiene la data piu' avanti vista
  check(L.trialInfo(st3.read(), t0 + 2 * DAY).expired, 'orologio riportato indietro: la prova resta finita');
  check(L.trialInfo({ trialStart: t0 + 30 * DAY, lastSeen: t0 }, t0).expired, 'inizio prova nel futuro (manomesso): finita');
  check(!L.trialInfo({}, t0).expired && L.trialInfo({}, t0).daysLeft === 14, 'primo avvio: 14 giorni');
  fs.writeFileSync(file, '{rotto');
  check(L.createStore({ localStorage: memLs(), file }).read().trialStart === null, 'file corrotto ignorato senza eccezioni');
  const kf = path.join(tmp, 'k', 'license.json');
  L.createStore({ localStorage: memLs(), file: kf }).write({ trialStart: t0, lastSeen: t0, key: std.token });
  check(L.createStore({ localStorage: memLs(), file: kf }).read().key === std.token, 'chiave salvata nel file e riletta');

  // ---------------------------------------------------------------- tabella, versione, agganci
  const PRO = Object.keys(L.FEATURES).filter((f) => L.FEATURES[f].edition === 'pro').sort().join();
  check(PRO === 'colorNest,costCsv,holes,multiSheet', 'tabella gating: 4 funzioni Pro (moduli 2,4,5,7)');
  check(Object.keys(L.FEATURES).every((f) => ['pro', 'standard'].indexOf(L.FEATURES[f].edition) >= 0) &&
    L.FEATURES.quantity && L.FEATURES.quantity.edition === 'standard', 'modulo 3 (quantity) in tabella come Standard (merge 3/4-7/9)');
  const bytes = crypto.randomBytes(97);
  check(Buffer.from(L.b64uDecode(L.b64uEncode(bytes))).equals(bytes) && L.b64uEncode(bytes) === b64u(bytes), 'base64url andata e ritorno');
  const PLUG = path.join(__dirname, '..');
  const manifest = fs.readFileSync(path.join(PLUG, 'CSXS', 'manifest.xml'), 'utf8');
  const mv = /ExtensionBundleVersion="([^"]+)"/.exec(manifest)[1];
  check(mv.replace(/^(\d+\.\d+\.\d+)\.(.+)$/, '$1-$2') === L.VERSION && L.VERSION === '0.9.0-beta', 'versione manifest = license.js = 0.9.0-beta');
  check(/^\d{1,9}\.\d{1,9}\.\d{1,9}\.[\w-]+$/.test(mv) && manifest.includes('Version="' + mv + '"/>'), 'versione manifest valida per lo schema CEP (bundle ed estensione)');
  check(fs.readFileSync(path.join(PLUG, 'client', 'index.html'), 'utf8').includes('v' + L.VERSION), 'versione nel piede del pannello');
  const mainJs = fs.readFileSync(path.join(PLUG, 'client', 'js', 'main.js'), 'utf8');
  check(/canApply\(S\.m9Count/.test(mainJs) && /m9has\('holes'\)/.test(mainJs), 'agganci MODULO 9 in main.js (Applica, fori)');
  check(/has\('costCsv'\)/.test(fs.readFileSync(path.join(PLUG, 'client', 'js', 'report-panel.js'), 'utf8')), 'aggancio MODULO 9 nel CSV');
  check(!/\bd\s*:\s*'/.test(fs.readFileSync(path.join(PLUG, 'client', 'js', 'license.js'), 'utf8')), 'nessuna chiave privata (campo d) in license.js');

  // ---------------------------------------------------------------- chiave vera (se presente su questo PC)
  const realKey = process.env.CORVO_LICENSE_KEY || path.join(os.homedir(), '.config', 'corvo', 'license-private.jwk');
  if (fs.existsSync(realKey)) {
    const real = gen(['--name', 'Test giro completo', '--edition', 'pro']);
    for (const backend of ['webcrypto', 'node']) {
      check((await L.checkLicense(real.token, { backend })).ok, `[${backend}] chiave vera: firma verificata con la pubblica incorporata`);
    }
    check((await L.checkLicense(real.token, T)).error === 'signature', 'chiave vera non verificata dalla chiave di test');
  } else console.log('  (chiave privata vera assente: giro completo saltato)');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`test_license: ${passes} ok, ${fails} falliti`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
