// Corvo — UNA TANTUM: genera la coppia di chiavi ECDSA P-256 che firma le licenze.
//   node plugin/tools/release/license-keygen.mjs [--out <file.jwk>] [--force]
//
// La chiave PRIVATA va FUORI dal repo: default %USERPROFILE%\.config\corvo\license-private.jwk
// (o $CORVO_LICENSE_KEY). Chi la possiede puo' emettere licenze valide: non committarla, non condividerla.
// Stampa la chiave PUBBLICA (JWK + PEM SPKI) da incollare in plugin/client/js/license.js (PUBLIC_JWK, PUBLIC_PEM).
// Rigenerarla INVALIDA tutte le licenze gia' emesse (serve --force).
import { webcrypto as wc, createPublicKey } from 'node:crypto';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const PRIV = outIdx >= 0 ? argv[outIdx + 1]
  : (process.env.CORVO_LICENSE_KEY || join(homedir(), '.config', 'corvo', 'license-private.jwk'));

if (existsSync(PRIV) && !argv.includes('--force')) {
  console.error(`La chiave privata esiste gia': ${PRIV}\nRigenerarla invalida tutte le licenze emesse. Usa --force per forzare.`);
  process.exit(1);
}
const pair = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const priv = await wc.subtle.exportKey('jwk', pair.privateKey);
const pub = await wc.subtle.exportKey('jwk', pair.publicKey);
mkdirSync(dirname(PRIV), { recursive: true });
writeFileSync(PRIV, JSON.stringify(priv, null, 2), { mode: 0o600 });
const pubJwk = { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y };
const pem = createPublicKey({ key: pubJwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' }).trim();
console.log(`Chiave privata salvata (FUORI dal repo): ${PRIV}\n`);
console.log('Incolla in plugin/client/js/license.js:\n');
console.log('  var PUBLIC_JWK = ' + JSON.stringify(pubJwk) + ';');
console.log('  var PUBLIC_PEM = ' + JSON.stringify(pem) + ';');
