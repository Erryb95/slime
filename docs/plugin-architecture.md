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

## Modulo 8 — DTF gang sheet: raster con contorno (2026-09-24)

Obiettivo: immagini trasparenti (PNG per DTF) nestate per la loro **silhouette reale** invece che per il rettangolo,
con l'immagine che si muove col suo contorno. Tutte le aggiunte sono marcate `MODULO 8`.

**Host (`host/corvo.jsx`, blocco `corvo_m8_*`).** `corvoExport({flatness, raster:true})`: un `PlacedItem` o `RasterItem`
di primo livello diventa un pezzo con `rings: []` e
`raster: {path, temp, kind:'linked'|'render', corners:{tl,tr,bl}}`, dove `corners` sono le coordinate documento dei
vertici pixel (0,0), (W,0), (0,H) (y pixel in basso). Senza `raster:true` il vecchio errore resta (messaggio aggiornato).
- `linked`: PNG collegato, esistente, matrice senza rotazione/inclinazione, `mValueA > 0` e
  `mValueD·CORVO_M8_PLACED_DSIGN > 0` → file originale a piena risoluzione, corners dai `geometricBounds`.
- `render`: tutto il resto (incorporato, TIF/PSD/JPG, ruotato, specchiato, `rasterRender:true`) → documento RGB temporaneo,
  `duplicate`, tavola = `visibleBounds`, `exportFile(PNG24, transparency, artBoardClipping)` in `Folder.temp`
  a `rasterPpi` (default 150) con lato massimo `rasterMaxPx` (default 4000 px, scala PNG24 1..776 %), chiusura senza salvare,
  `doc.activate()`. Corners = `visibleBounds` dell'originale (pixel allineati agli assi). Il pannello cancella il PNG temporaneo.

**Pannello (`client/js/raster.js`, `window.CorvoRaster` / `module.exports`).** `prepareItems(items, opts)` legge il file
(fs), `decodePNG` (decoder scritto da noi: zlib di Node, filtri 0-4, Adam7, profondità 1-16, tipi 0/2/3/4/6 + tRNS; solo
l'alfa), `trace(img, corners, opts)` e sostituisce `rings` con contorni esterni (CCW) + fori (CW) in coordinate documento,
lo stesso formato di `corvoExport`: `geometry.buildPiece` non cambia.
1. soglia alfa `alphaThreshold` 10 %; immagini > `maxPixels` (4 Mpx) ridotte con media a blocchi;
2. pulizia = apertura morfologica per ricostruzione: una componente (8-conn) resta intera se sopravvive a un'apertura di
   raggio `openPx` (1) e ha ≥ max(9, 1e-5·W·H) px (via i puntini, le linee sottili vere restano); fori < stessa soglia riempiti;
3. marching squares sul campo alfa vincolato alla maschera pulita (bordo sub-pixel sull'anti-aliasing), selle = primo piano
   8-connesso; esterni/fori per parità di contenimento;
4. smoothing laplaciano leggero (2 passate 1/4-1/2-1/4) + Douglas-Peucker 0.5 px: niente gradini sui bordi netti;
5. mappa pixel → documento con i 3 corners (qualsiasi affine: scala, rotazione, specchio);
6. offset esterno Clipper (`offset`, pt). Il pannello usa `SAFETY_MM = 0.2 mm`: la separazione di Sparrow misurata sui
   contorni veri può restare ~0.2 mm sotto la distanza impostata; con l'offset la distanza misurata è ≥ distanza.
   La spaziatura vera e propria resta il `gap` di Sparrow (uguale per pezzi vettoriali e raster nello stesso nest).
Modi (`Immagini` nel pannello): `contour` (default, "Trim transparency": il margine trasparente non conta) o `bbox`
(rettangolo rifilato); `canvas` (rettangolo intero) solo per confronto. Immagine senza canale alfa / tRNS (`noAlpha`) o con
< 0.1 % di pixel trasparenti (`noTransparency`) → rettangolo intero + avviso nella riga di stato; tutta trasparente →
errore `empty`; file non PNG → errore `notPng`.
**Preset** (`R.PRESETS`): DTF 22" = 558.8 mm e DTF 58 cm = 580 mm, distanza 6 mm; cambiare larghezza/distanza a mano torna
a "Personalizzato".

**Test** `node plugin/tools/test_raster.js [secondi=20]` (Node, niente Illustrator): decoder (RGBA 8/16, Adam7, grigio+alfa,
RGB, chiave tRNS, palette), pulizia (puntini, foro piccolo riempito, foro vero tenuto, diagonale senza gradini), 5 PNG reali di
`bench/real/dtf`, mappatura ruotata+specchiata, offset, `prepareItems` (PNG temporaneo cancellato), poi nest wasm di 5 design × 6
copie su 22", distanza 6 mm, rotazioni 90°:

| PNG | px | contorni | fori | silhouette/bbox | scarto max px (maschera→contorno / ritorno) |
|---|---|---|---|---|---|
| donut | 618² | 1 | **1** | 71.6 % | 1.01 / 0.59 |
| gatto | 618² | 1 | 0 | 49.3 % | 1.06 / 0.59 |
| stella | 618² | 1 | 0 | 46.4 % | 1.03 / 0.59 |
| farfalla | 618² | 1 | 0 | 60.5 % | 0.94 / 0.58 |
| testo corsivo | 1899×446 | 13 | 5 | 16.6 % | 1.03 / 0.60 |

Nest 30 copie, 20 s: silhouette **358 mm** (riempimento 42.9 %, distanza minima misurata sui contorni 6.15 mm), rettangolo
rifilato 460 mm (33.5 %), rettangolo intero 657 mm (23.4 %) → **−22 % di rotolo** rispetto al bbox rifilato, −45 % rispetto
all'immagine intera (a 5 s: −25 % / −47 %).

**Limiti / da verificare in Illustrator.** Segno di `mValueD` per un PNG collegato dritto (`CORVO_M8_PLACED_DSIGN`, se
sbagliato i PNG collegati passano comunque dal render, tranne quelli specchiati in verticale → contorno capovolto); render
= documento temporaneo che compare un istante; solo immagini di primo livello (dentro un gruppo → errore, dentro una maschera
conta il tracciato di maschera); l'opacità dell'oggetto riduce l'alfa (sotto il 10 % sparisce); i fori sono esportati ma
`geometry.js` v0.1 li ignora (pezzi nei fori = modulo 2); il testo in più parti passa per la chiusura morfologica di geometry.
PNG temporanei rimasti in `%TEMP%\corvo_m8_*.png` se l'export fallisce a metà.
