// Corvo — emette una LICENZA FIRMATA (da lanciare dopo ogni vendita). Offline, nessun server.
//
//   node plugin/tools/release/license-gen.mjs --email cliente@dominio.it --edition pro
//   node plugin/tools/release/license-gen.mjs --name "Insegne Rossi srl" --edition standard
//   opzioni:  --machine XXXX-XXXX-XXXX-XXXX   lega la licenza a un PC (ID mostrato nella finestra Licenza; default: no)
//             --days N                        scadenza (abbonamento); default: nessuna scadenza
//             --issued YYYY-MM-DD             data di emissione (default: oggi)
//             --key <file.jwk>                chiave privata (default: $CORVO_LICENSE_KEY o
//                                             %USERPROFILE%\.config\corvo\license-private.jwk)
//             --json                          stampa solo {token, payload} in JSON (per script/test)
//
// L'email NON finisce nella licenza: ci va solo 'eh' = primi 16 hex di SHA-256(email in minuscolo), cosi' la chiave
// si puo' ricondurre al cliente (ricalcolando l'hash) senza esporre dati personali.
// Formato del token: vedi plugin/client/js/license.js ("CV1-<payload b64url>.<firma P1363 b64url>").
import { webcrypto as wc, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2), nxt = process.argv[i + 1];
    args[k] = (nxt !== undefined && !nxt.startsWith('--')) ? process.argv[++i] : true;
  }
}
const usage = () => {
  console.error('Uso: node license-gen.mjs (--email <email> | --name <nome>) --edition <standard|pro> ' +
    '[--machine ID] [--days N] [--issued YYYY-MM-DD] [--key file.jwk] [--json]');
  process.exit(1);
};
const email = typeof args.email === 'string' ? args.email.trim() : '';
const name = typeof args.name === 'string' ? args.name.trim() : '';
const edition = typeof args.edition === 'string' ? args.edition.toLowerCase() : '';
if (!email && !name) usage();
if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) usage();
if (!['standard', 'pro'].includes(edition) && !args['allow-any-edition']) usage();   // --allow-any-edition: solo test
if (name.length > 80) usage();
const issued = typeof args.issued === 'string' ? args.issued : new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(issued)) usage();
let exp;
if (args.days !== undefined) {
  const d = Number(args.days);
  if (!(d > 0)) usage();
  exp = new Date(Date.parse(issued + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
}
let machine;
if (typeof args.machine === 'string') {
  machine = args.machine.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (machine.length !== 16) { console.error('ID macchina non valido (16 cifre esadecimali, es. 1A2B-3C4D-5E6F-7A8B)'); process.exit(1); }
  machine = machine.replace(/(.{4})(?!$)/g, '$1-');
}

const PRIV = typeof args.key === 'string' ? args.key
  : (process.env.CORVO_LICENSE_KEY || join(homedir(), '.config', 'corvo', 'license-private.jwk'));
if (!existsSync(PRIV)) {
  console.error(`Chiave privata mancante: ${PRIV}\nGenerala una volta con: node plugin/tools/release/license-keygen.mjs`);
  process.exit(1);
}
const jwk = JSON.parse(readFileSync(PRIV, 'utf8'));
const key = await wc.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

const payload = { v: 1, p: 'corvo', id: wc.randomUUID(), ed: edition, iat: issued };
if (name) payload.n = name;
if (email) payload.eh = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
if (exp) payload.exp = exp;
if (machine) payload.m = machine;

const bytes = new TextEncoder().encode(JSON.stringify(payload));
const sig = new Uint8Array(await wc.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes));
const token = 'CV1-' + Buffer.from(bytes).toString('base64url') + '.' + Buffer.from(sig).toString('base64url');

if (args.json) { console.log(JSON.stringify({ token, payload })); process.exit(0); }
console.log('\nLicenza Corvo emessa\n');
console.log('  edizione :', edition);
if (name) console.log('  nome     :', name);
if (email) console.log('  email    : hash', payload.eh, '(l\'email non e\' nella chiave)');
console.log('  emessa   :', issued, exp ? `· scade ${exp}` : '· nessuna scadenza');
console.log('  macchina :', machine || 'qualsiasi');
console.log('  id       :', payload.id);
console.log('\n  Chiave da consegnare (pannello Corvo > badge licenza in basso > Attiva):\n');
console.log('  ' + token + '\n');
