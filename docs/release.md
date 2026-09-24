# Corvo — rilascio: licenze, build, firma, installazione (modulo 9)

Solo Windows. Nessun segreto nel repo: tutto quello che è privato sta in `%USERPROFILE%\.config\corvo\`
(`C:\Users\erryb\.config\corvo`). Architettura e scelte: `docs/plugin-architecture.md`, sezione "Modulo 9".

## Cosa c'è in `%USERPROFILE%\.config\corvo\` (FUORI dal repo, da tenere in backup sicuro)

| File | Cosa | Se si perde |
|---|---|---|
| `license-private.jwk` | chiave privata ECDSA P-256 che firma le licenze | nessuna licenza nuova valida con questa versione; generarne una nuova (`--force`) invalida TUTTE le licenze emesse |
| `corvo-cert.p12` | certificato autofirmato per la firma ZXP (10 anni, dal 2026-09-24) | se ne crea un altro; le versioni nuove si firmano con quello |
| `cert.txt` | `password=` del `.p12` (casuale, 24 byte) e `p12=` nome file | idem |
| `bin\ZXPSignCmd.exe` | strumento ufficiale Adobe, [CEP-Resources/ZXPSignCMD/4.1.3/x64](https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD) (SHA-256 `ffc22231…16c98`) | riscaricarlo |

La chiave **pubblica** è incorporata in `plugin/client/js/license.js` (`PUBLIC_JWK`, `PUBLIC_PEM`): può stare nel codice,
serve solo a verificare.

Prima installazione su un PC nuovo (solo se non esistono già):
```
node plugin/tools/release/license-keygen.mjs          # scrive la privata, stampa la pubblica da incollare in license.js
ZXPSignCmd -selfSignedCert IT Italia Corvo "Corvo Nesting" <password> corvo-cert.p12 -validityDays 3650
```
(e scrivere `password=<password>` in `cert.txt`). Non rigenerare la chiave delle licenze se ci sono clienti.

## Emettere una licenza (dopo una vendita)

```
node plugin/tools/release/license-gen.mjs --email cliente@dominio.it --edition pro
node plugin/tools/release/license-gen.mjs --name "Insegne Rossi srl" --edition standard
```
Opzioni: `--machine XXXX-XXXX-XXXX-XXXX` lega la licenza a un PC (il cliente legge l'ID nella finestra Licenza e lo copia;
default: nessun legame) · `--days N` licenza a tempo (abbonamento; default: perpetua) · `--issued YYYY-MM-DD` ·
`--key <file>` altra chiave privata · `--json` uscita per script.

Stampa una chiave `CV1-…` da mandare al cliente. L'email NON è nella chiave (solo un hash di 16 caratteri, stampato: segnarlo
nel registro vendite insieme all'`id` per ritrovare la licenza). Il cliente: pannello Corvo → badge in basso a destra
(`Prova · N gg`) → incolla la chiave → **Attiva**. Si può incollare anche spezzata su più righe (email).

Edizioni: **Standard** = tutto tranne le funzioni Pro; **Pro** = tutto. Cosa è Pro si cambia in un solo punto: la tabella
`FEATURES` in `plugin/client/js/license.js` (oggi: fori, nesting per colore, CSV costi, multi-foglio).
Prova: 14 giorni con tutto Pro; poi senza licenza il nest funziona ma **Applica** è limitato a 10 pezzi.

Assistenza: "la licenza non va" → la finestra dice perché (`firma` = chiave copiata male o modificata, `altro computer`,
`scaduta`). Il cliente che cambia PC con una licenza legata: emettere una nuova chiave con il nuovo ID.
Stato locale del cliente: `%APPDATA%\Corvo\license.json` (+ localStorage del pannello).

## Build e firma dello ZXP

Prerequisiti: `plugin/client/lib/corvo_bg.wasm` aggiornato (`plugin/tools/build.sh`), versione allineata in
`plugin/CSXS/manifest.xml` (`0.9.0.beta`: CEP vuole il punto) e `VERSION` in `license.js` (`0.9.0-beta`) + piede di
`index.html`. Poi, dalla radice del repo:
```
powershell -ExecutionPolicy Bypass -File plugin\tools\release\build-zxp.ps1
```
Fa: staging di `CSXS/`, `client/`, `host/` senza file di sviluppo (`.debug`, `tools/`, test, `.DS_Store`, junction) →
firma con marca temporale (`-tsa http://timestamp.digicert.com`; `-NoTimestamp` se si è offline) → `ZXPSignCmd -verify`.
Uscita (in `dist/`, gitignored):
- `Corvo-0.9.0-beta.zxp` + `.sha256`
- `Corvo-0.9.0-beta-win/` = zxp + `install.cmd`, `install.ps1`, `uninstall.cmd`, `uninstall.ps1`
- `Corvo-0.9.0-beta-win.zip` = la stessa cartella zippata, **da consegnare al cliente**.

Verifica manuale: `%USERPROFILE%\.config\corvo\bin\ZXPSignCmd.exe -verify dist\Corvo-0.9.0-beta.zxp -certInfo`.

## Installazione dal cliente (Windows, senza amministratore)

1. Estrarre `Corvo-0.9.0-beta-win.zip`, chiudere Illustrator.
2. Doppio clic su **`install.cmd`**. Copia l'estensione firmata in
   `%APPDATA%\Adobe\CEP\extensions\com.corvo.nesting` (aggiorna una versione precedente al suo posto).
3. Aprire Illustrator → Finestra → Estensioni → Corvo Nesting. Non serve PlayerDebugMode (l'estensione è firmata).

Disinstallare: `uninstall.cmd` (licenza e prova restano in `%APPDATA%\Corvo`).
Se in quella cartella c'è l'installazione di **sviluppo** (junction di `plugin/tools/install-dev.ps1`) l'installer si ferma e
spiega come toglierla (`cmd /c rmdir "%APPDATA%\Adobe\CEP\extensions\com.corvo.nesting"`: rimuove solo il collegamento).
Opzioni: `install.ps1 -Zxp <file> -Target <cartella>`.

## Test prima di consegnare

```
node plugin/tools/test_license.js                                                  # 63 controlli
powershell -ExecutionPolicy Bypass -File plugin\tools\release\test-install.ps1     # 21 controlli, in %TEMP%
```
`test-install.ps1` installa/aggiorna/disinstalla in una cartella temporanea e verifica la firma sulla cartella installata;
non tocca l'installazione vera. Da fare a mano (serve Illustrator): su un utente Windows **senza** PlayerDebugMode,
`install.cmd`, aprire il pannello, attivare una licenza di prova.

## Regole
- Mai committare `.jwk`, `.p12`, `cert.txt`, `dist/`. Mai pubblicare o fare push da qui (vedi `docs/loop-brief.md`).
- La chiave privata non va mai su un servizio esterno; se un giorno si automatizza l'emissione (webhook di pagamento),
  la chiave sta solo nel segreto di quel servizio.
