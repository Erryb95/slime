# Corvo — architettura del plugin Illustrator (v0.1, 2026-09-23)

Obiettivo v0.1: selezioni gli oggetti in Illustrator, premi **Nest**, e vedi i pezzi muoversi LIVE nella tavola
mentre Sparrow cerca; **Stop** tiene il migliore, **Applica** conferma, **Annulla** riporta tutto com'era.

## Struttura (`plugin/`)

```
plugin/
  CSXS/manifest.xml        # id com.corvo.nesting, host ILST [29.5,99.9], CSXS 11.0, --enable-nodejs --mixed-context
  .debug                   # porta CEP 8093 per ILST (solo sviluppo)
  host/corvo.jsx           # ExtendScript: geometria in uscita, trasformazioni in entrata      [AGENTE HOST]
  client/index.html        # pannello UI                                                       [AGENTE PANEL]
  client/css/panel.css
  client/js/main.js        # UI, stato, orchestrazione, throttle delle mosse live               [AGENTE PANEL]
  client/js/geometry.js    # anelli -> forme Sparrow (unione, chiusura, semplificazione)        [AGENTE PANEL]
  client/js/worker.js      # Web Worker: carica wasm dai byte ricevuti, chiama nest()           [AGENTE PANEL]
  client/js/CSInterface.js # ponte CEP minimo scritto da noi (evalScript, requestOpenExtension, ...) su window.__adobe_cep__
                           # NB: il CSInterface.js ufficiale (Adobe-CEP/CEP-Resources) NON e' MIT: porta la licenza Adobe SDK
  client/lib/corvo.js, corvo_bg.wasm   # output wasm-bindgen (copiati da wasm/demo con tools/build.sh)
  client/lib/clipper.js    # clipper-lib (Boost License) vendorizzato
  tools/build.sh           # rebuild wasm + copia in client/lib
  tools/test_e2e.js        # test end-to-end del pannello VERO in Illustrator via CDP (porta 8093)
  tools/install-dev.ps1    # junction in %APPDATA%\Adobe\CEP\extensions\com.corvo.nesting + PlayerDebugMode
```

## Sistema di coordinate

Tutto in **punti tipografici, y verso l'alto**, coordinate documento di Illustrator (quelle di
`pathPoints[i].anchor`, `geometricBounds`, `transform(..., Transformation.DOCUMENTORIGIN)`).
Sparrow riceve i poligoni direttamente in queste coordinate; la sua trasformazione esportata
`(rotation° , [tx, ty])` mappa il punto originale p in `R(rotation)·p + t` nel sistema della striscia
(x in [0, L], y in [0, H]). La striscia viene posata nel documento con origine in basso a sinistra `O = (ox, oy)`,
quindi la posizione finale in documento è `R·p + t + O`.

## Contratto ExtendScript (`host/corvo.jsx`), stato in `$.global.corvo`

Tutte le funzioni restituiscono una STRINGA JSON (serializzatore scritto a mano, niente JSON nativo garantito).
Errori: `{"error":"messaggio"}`.

1. `corvoExport(optsJson)` — opts `{ "flatness": 0.5 }` (errore massimo in pt nella discretizzazione delle Bézier).
   - Pezzi = oggetti di primo livello della selezione (`app.activeDocument.selection`). Un GroupItem,
     CompoundPathItem o gruppo con maschera è UN pezzo. Per i gruppi con maschera usa solo il tracciato di maschera.
   - Salva i riferimenti in `$.global.corvo.items[i]` e azzera `$.global.corvo.applied[i] = {a:0, tx:0, ty:0}`.
   - Ritorna:
     `{"doc":{"name":"..","abLeft":x,"abTop":y,"abRight":x,"abBottom":y},
       "items":[{"i":0,"name":"..","type":"GroupItem","rings":[[[x,y],[x,y],...], ...],"bounds":[l,t,r,b]}, ...]}`
     dove `rings` sono tutti i contorni chiusi (sottotracciati) del pezzo, in coordinate documento, già discretizzati.
     Tracciati aperti: chiudili. Tracciati con 1-2 punti: ignorali. Testo live: convertilo? NO in v0.1 → errore chiaro
     "Converti il testo in tracciati (Maiusc+Ctrl+O)".
2. `corvoApply(movesJson)` — `[{"i":0,"a":90,"tx":123.4,"ty":-567.8}, ...]` = trasformazione ASSOLUTA desiderata
   (rotazione in gradi attorno all'origine del documento, poi traslazione) rispetto alla posizione ORIGINALE.
   Lo script calcola il delta rispetto a `applied[i]` e applica una sola `transform()` per pezzo:
   `D(x) = R(a_new - a_old)·x + (t_new - R(a_new - a_old)·t_old)`.
   Poi `app.redraw()`. Ritorna `{"ok":true,"ms":<durata>}`. Deve reggere 50 pezzi in < 150 ms.
3. `corvoRoll(rollJson)` — `{"ox":x,"oy":y,"w":L,"h":H}` crea/aggiorna un rettangolo senza riempimento, traccia
   sottile arancione, nome `Corvo_Roll`, sul livello `Corvo` (crealo se manca, bloccato no), e un testo
   `Corvo_Label` sopra con la lunghezza in mm. Ritorna `{"ok":true}`.
4. `corvoRevert()` — riporta ogni pezzo alla trasformazione identità (inverso di `applied`), rimuove rotolo e
   etichetta. `corvoFinish()` — conferma: tiene le posizioni, rimuove l'etichetta, lascia il rotolo come
   rettangolo di riferimento (opzione), svuota lo stato.

## Contratto pannello (`client/`)

- Legge i byte del wasm con `require('fs').readFileSync(...)` (Node abilitato), li passa al worker
  (`postMessage({type:'init', wasm: arrayBuffer}, [arrayBuffer])`). `fetch` su file:// non funziona in CEP.
- Il worker: `importScripts('../lib/corvo.js')`, `await wasm_bindgen({module_or_path: bytes})`, poi su
  `{type:'nest', instance, exploreSecs, compressSecs, seed, gap}` chiama
  `wasm_bindgen.nest(JSON.stringify(instance), exploreSecs, compressSecs, BigInt(seed), gap, cb)`;
  `cb(json)` → `postMessage({type:'report', report})`; al termine `{type:'done', solution}`; errori `{type:'error'}`.
  Il report ha `{kind, phase, strip_width, density, elapsed_ms, placements:[{item_id, rotation, translation:[x,y]}]}`.
  Se i Worker da file:// non funzionano in CEP, fallback: stesso codice nel thread principale con avviso.
- `geometry.js` → per ogni pezzo costruisce UN poligono semplice (Sparrow vuole un contorno esterno):
  1) anelli con area < 0.5 pt² scartati; 2) se c'è un solo contorno esterno → quello (i fori NON servono in v0.1);
  3) se ci sono più contorni esterni (lettera + accento, logo in più parti) → chiusura morfologica con clipper:
  offset +r, unione, offset -r (r = max(gap, 2 pt)), si prende il contorno esterno più grande; se restano più
  parti → inviluppo convesso di tutti i punti. 4) semplificazione Douglas-Peucker a `flatness` pt, max ~200
  vertici per pezzo. Orientamento: indifferente per jagua-rs (verificare).
- Istanza Sparrow: `{name:'corvo', strip_height: H_pt, items:[{id:i, demand:1, allowed_orientations:[...],
  shape:{type:'simple_polygon', data:[[x,y],...]}}]}`. Rotazioni UI: Nessuna → [0]; 180 → [0,180];
  90 → [0,90,180,270]; Libera → ometti `allowed_orientations`.
- Live: tiene l'ultimo report; un ciclo ogni 250 ms, se c'è un report nuovo e la chiamata precedente è finita,
  invia `corvoApply` con `a = rotation`, `tx = translation[0] + ox`, `ty = translation[1] + oy`, e `corvoRoll`
  con `w = strip_width`. Mostra lunghezza (mm), riempimento %, tempo, fase.
- Origine della striscia O: sotto la tavola attiva, 20 mm di distacco: `ox = abLeft`, `oy = abBottom - 20mm - H`.
- UI (italiano/inglese via dizionario semplice, default inglese): larghezza rotolo (mm), distanza (mm),
  rotazioni, tempo (s, default 30), pulsanti Nest / Stop / Applica / Annulla, barra riempimento,
  riga di stato. Stile scuro coerente con Illustrator. Niente librerie UI.
- Pulsante "Annulla" = `corvoRevert()`; chiusura pannello durante una sessione = revert.

## Test (manuali via CEP debug, porta 8093)

`plugin/tools/test_session.js` (node): apre `bench/suite/insegna48.svg`, seleziona i pezzi (escluso CONTAINER),
chiama la pipeline come farebbe il pannello, verifica: nessuna sovrapposizione tra bounding box ruotati dei
pezzi finali (controllo lasco), tutti i pezzi dentro il rotolo, lunghezza entro il 10% del benchmark wasm (1619 mm
a 600 mm/2 mm per insegna48).

## Deviazioni host

Nessuna deviazione dalle firme o dai formati del contratto; solo aggiunte compatibili (host/corvo.jsx, verificato su Illustrator 30.5.1):

- `corvoApply` ritorna anche `msTransform` (solo le `transform()`, senza `app.redraw()`), `moved` (pezzi davvero
  trasformati: quelli con delta nullo vengono saltati) ed `errors` (array, solo se qualche pezzo fallisce, es. bloccato
  o cancellato); in quel caso `ok` è `false` ma gli altri pezzi sono comunque applicati. Stesso schema per `corvoRevert`.
- Tutte le funzioni lavorano in `CoordinateSystem.DOCUMENTCOORDINATESYSTEM` e ripristinano il sistema dell'utente.
  A `corvoExport` una sonda (tracciato temporaneo, poi rimosso) misura origine e verso di `transform(...DOCUMENTORIGIN)`
  e se `concatenateTranslationMatrix` trasla dopo la rotazione; misurato: origine (0,0) a 1e-5 pt, rotazione positiva
  = antioraria con y in alto, traslazione applicata dopo → nessuna correzione necessaria, ma il codice compensa se cambiasse.
- `bounds` in `corvoExport` è calcolato dagli anelli discretizzati (non da `geometricBounds`); scarto misurato ≤ 0.001 pt
  sulle suite. Per i gruppi con maschera coincide con il tracciato di maschera. Oggetti senza anelli chiusi (linee, tracciati
  da 1-2 punti) vengono esclusi dalla lista: gli indici `i` sono consecutivi sui soli pezzi validi.
- Discretizzazione: criterio `0.75·max(d1,d2) ≤ flatness` (limite garantito dello scostamento della cubica dalla corda).
- `corvoRevert()` mantiene i riferimenti con `applied` azzerato (si può rilanciare Nest senza ri-esportare);
  rimuove anche il livello `Corvo` se resta vuoto.
- `corvoFinish(optsJson)` accetta `{"keepRoll":false}` per togliere anche il rotolo; se tenuto, viene rinominato
  `Corvo_Roll_rif` così una sessione successiva ne crea uno nuovo invece di riusarlo.
- Deriva numerica: ogni `transform()` a delta accumula ~3e-4 pt; dopo 10 apply completi il revert torna entro 3e-3 pt.
  Una sessione live lunga (centinaia di aggiornamenti) può arrivare a qualche centesimo di pt: accettabile per il taglio.

## Verifica integrazione (2026-09-23, Illustrator 30.5.1)

`node plugin/tools/test_e2e.js <insegna48|lettering|group> [secondi]` guida il pannello reale (campi, Nest, Stop, Applica,
Annulla) e verifica: mosse live, rotolo che si accorcia, nessuna sovrapposizione (intersezione poligonale a coppie con
clipper), distanza rispettata, tutto dentro il rotolo, Annulla esatto su ogni ancora.

Correzioni emerse:
- `corvo_alive()`: in ExtendScript l'errore "Object is invalid" lanciato dentro l'espressione di un `return` sfugge al
  try/catch della stessa funzione → con il documento della sessione chiuso Annulla dava "Object is invalid (riga 342)".
  Ora le letture sono istruzioni separate.
- Documento della sessione chiuso: `corvoApply`/`corvoRoll`/`corvoFinish` rispondono `{"error":"Il documento della
  sessione Corvo è stato chiuso..."}` e azzerano lo stato; `corvoRevert` risponde `{"ok":true,"docClosed":true}`.
  Senza sessione `corvoRevert` risponde `{"ok":true,"noSession":true}` (prima: "there is no document"). `app.redraw()`
  protetto quando non c'e' nessun documento.
- Pannello: un errore dell'host durante la ricerca ferma la sessione (`failSession`) invece di ripetere l'errore ogni
  250 ms; un `corvoApply` parziale (`ok:false` + `errors`, es. pezzo bloccato) ora viene mostrato come avviso.

## Modulo 5 — Report materiale e costo (2026-09-24, branch `modulo5-report`)

File nuovi, isolati dal resto: `client/js/report.js` (logica pura, `window.CorvoReport` / `module.exports`),
`client/js/report-panel.js` (solo DOM, `window.CorvoReportPanel`), `client/css/report.css`, sezione `<details id="m5">`
in `index.html` (etichette con `data-m5`, non `data-i18n`, cosi' `applyLang` di main.js non le tocca),
`tools/test_report.js`. In `main.js` solo agganci marcati `// MODULO 5`:
`CorvoReportPanel.begin(ctx)` in `nest()` dopo la preparazione dei pezzi, `update(S.best)` in `renderStats()`
(ogni 250 ms, ricalcolo solo se cambia la disposizione o il materiale), `clear()` su Annulla/errore,
`CorvoPanel.evalRaw(script)` (query host in sola lettura, serve il percorso del documento per il CSV).

Definizioni (ingresso in pt come il resto del pannello, uscita in mm/m/m²):
- lunghezza usata L = `strip_width` di Sparrow; area usata = L x larghezza rotolo; area pezzi = area vera
  (`piece.area`, fori esclusi); riempimento = pezzi / usata; sfrido = usata - pezzi (m² e %).
- costo materiale: `m` = L(m) x prezzo; `m2` = area usata x prezzo; `sheet` = ceil(L / lunghezza foglio) x prezzo;
  poi x (1 + scarto extra %). Manodopera opzionale = tariffa/h x min spellicolatura/m² x area usata / 60.
  Costo per pezzo = (materiale + manodopera) / n pezzi.
- risparmio (a) vs disposizione a rettangoli: bounding box di ogni pezzo (0/90° se consentiti), scaffali FFD
  attraverso il rotolo con la stessa distanza, migliore di 3 politiche di orientamento (lato lungo attraverso,
  lungo il rotolo, come disegnato) → baseline onesta, non un fantoccio; (b) vs disposizione originale: unione
  dei `bounds` degli oggetti, com'e' o ruotata di 90°, solo se entra nella larghezza del rotolo (altrimenti assente).
  Risparmio in m, m², % ed € (stessa formula di costo); proiezione mensile se "lavori/mese" > 0.
  Se i rettangoli non sono piu' lunghi del nest il pannello scrive "nessun risparmio" invece di un numero negativo.
- `combine(reports)`: riga TOTALE per il multicolore del modulo 4 (somme, riempimento ricalcolato).

Impostazioni materiale in localStorage: `corvo.m5.current` (campi correnti), `corvo.m5.materials` (preset per nome,
Salva/Elimina), `corvo.m5.preset`, `corvo.m5.open`. Valute EUR (default) e USD.

CSV (`toCSV(report, lang)`): UTF-8 con BOM, `it` → separatore `;` e virgola decimale (Excel italiano), `en` → `,` e `.`.
Blocco 1 = riepilogo con le colonne di FINDINGS-modulo4-6 §4 (deviazioni: importi senza suffisso `_eur` + colonna
`valuta`; aggiunte `riempimento_pct`, `unita_prezzo`, `scarto_extra_pct`, `fogli`, `costo_manodopera`, `costo_totale`,
`lunghezza_taglio_m` (perimetro dei poligoni semplificati), `lunghezza_rettangoli_mm`, `risparmio_m`,
`lunghezza_originale_mm`, `risparmio_originale`; `tempo_macchina_min` e `colore_vinile` vuoti finche' non ci sono
velocita' cutter e modulo 4). Riga vuota, poi blocco 2 = un pezzo per riga: `n, nome, livello, area_mm2,
rotazione_gradi, x_mm, y_mm, larghezza_mm, altezza_mm` (bbox del pezzo posato, coordinate del rotolo, origine in basso
a sinistra). Celle con separatore/virgolette/a capo tra virgolette; testo che inizia con `= + - @` prefissato da `'`.
`livello` = `item.layer` di `corvoExport` se l'host lo fornisce (modulo 1), altrimenti vuoto.
Esporta: `window.cep.fs.showSaveDialogEx` nella cartella del documento (o Desktop se non salvato), scrittura con
`fs.writeFileSync`; senza dialogo scrive accanto al documento; nel browser scarica il file.
"Copia riepilogo": testo per preventivi (`toText`), `execCommand('copy')` con ripiego su `navigator.clipboard`.

Test: `node plugin/tools/test_report.js [s]` — unit (costi m/m²/fogli/scarto, scaffali, CSV quoting/BOM/iniezione,
report vuoto senza NaN) + nest wasm su insegna48 e lettering (600 mm, 2 mm, 0/90/180/270): somma aree righe = area
pezzi, riempimento = pezzi/usata, costo = L x prezzo, costo/pezzo x n = totale, baseline rettangoli e disposizione
originale piu' lunghe del nest, pezzi dentro la striscia, CSV con righe/colonne coerenti.
Risultati (4 s): insegna48 1.75 m, riempimento 66 %, rettangoli +0.68 m (28 %); lettering 0.88 m, 71 %, rettangoli +0.23 m (21 %).
Non verificato in Illustrator (dialogo di salvataggio CEP, appunti in CEP): da fare nel passo VERIFICA del loop.
