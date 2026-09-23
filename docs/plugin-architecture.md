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

## Modulo 6 — Crocini di registro print&cut (2026-09-24)

File: `client/js/regmarks.js` (specifiche e geometria, funzioni pure, testabile in Node), `host/regmarks.jsx`
(disegno in Illustrator), agganci nel pannello marcati `// MODULO 6` in `main.js` e `index.html`.
`corvo.jsx` carica `regmarks.jsx` alla fine con `$.evalFile` relativo a `$.fileName`; se non ci riesce, il pannello
lo carica prima di chiamare `corvoRegmarks` (percorso `<estensione>/host/regmarks.jsx`).

### Specifiche (mm, dati in `CorvoRegmarks.SPECS`, fonte di ogni numero nel campo `src`)

| Sistema | Forma | Lato/diam. | Linea | Bordo lat. | Testa / coda | Rispetto | Passo max | Livello |
|---|---|---|---|---|---|---|---|---|
| Graphtec ARMS | L tipo 1 (vertice verso la grafica) | 10 (5-20) | 0.5 (0.3-1.0) | 30 | 15 / 35 | 6 | 1000* | `Regmarks` |
| Summa OPOS | quadrato pieno | 3* | – | 20 (min 10) | 10 / 40 | 3* | 500* | `Regmarks` |
| Roland | cerchio pieno | 10 (10-12.5) | – | 10 | 20 / 50 | 5* | 1600 | `Regmarks` |
| Mimaki FineCut | L tipo 1 "outward" | 10 (4-40) | 0.5 (0.5-1.0) | 10 | 20 / 45 | 10 (= lato) | 3000 (min 50) | `Regmarks FineCut (guida)`, non stampabile |

`*` = scelta di Corvo, il manuale non da' il numero. Manuali: `bench/real/regmarks/` (CE7000 cap.5, SummaCut cap.3,
GS2-24 p.15/160/161, Mimaki CSD200035). Colore: nero K100 (in un documento RGB: 0,0,0), tracciati pieni senza traccia
(le L sono poligoni a 6 vertici con lo spessore della linea, non tracce).

### Come il nest riserva lo spazio

Sistema del rotolo in mm: x lungo il rotolo (0 = testa/lato origine), y sulla larghezza (0..W). I crocini stanno in
due fasce laterali; ogni crocino ha un box (forma piena) e una zona di rispetto = box + `clear`.

- `reserve(id, W)` prima del nest: `band = edge + out + inn + clear` (out/inn = estensione del crocino verso il bordo
  e verso la grafica rispetto all'ancora: L → size / line/2, quadrato e cerchio → size/2), `startX = lead + out`.
  Sparrow riceve `strip_height = (W - 2·band)` e la striscia viene posata con origine
  `S.origin = rollOrigin + (startX, band)`; `rollOrigin = (abLeft, abBottom - 20 mm - W)`.
  Nessun pezzo puo' quindi toccare una fascia: tutte le zone di rispetto stanno in `y < band` o `y > W - band`.
- `layout(id, W, Lnest)` dopo il nest: ancore agli angoli in `x0 = startX` e `x1 = x0 + max(Lnest, minSpan)`,
  `n = ceil(span / maxSpan)` segmenti → `n-1` coppie di crocini intermedi equidistanti (per i sistemi a L sono croci
  centrate nella riga dei bracci), rotolo usato `= x1 + out + trail`. Avvisi: `rmIntermediate` (lavoro piu' lungo del
  passo massimo), `rmFineCut` (Mimaki), `rmTooNarrow`, `rmCrossTooWide/Narrow`. Il pannello aggiunge sempre la nota
  sul materiale (nero su bianco opaco).
- `check(layout, pieceBoxes)` verifica distanze, margini, bordo, zone di rispetto dentro il materiale, pezzi fuori dai
  rispetti e dentro il telaio. `toDoc(layout, rollOrigin)` produce il payload in pt per l'host.

### Contratto host (`host/regmarks.jsx`)

- `corvoRegmarks(payloadJson)` — `{"system","layer","printable","color":{c,m,y,k},"marks":[{"poly":[[x,y],..]} |
  {"circle":[cx,cy,r]}],"frame":[x0,y0,x1,y1]?}` in pt documento. Rimuove i crocini non confermati precedenti (gruppo
  `Corvo_Regmarks` su qualsiasi livello), crea il livello se manca (in cima, `printable` dal payload), disegna il gruppo
  `Corvo_Regmarks` e, per Mimaki, il rettangolo `Corvo_FineCut_Area` (telaio dei vertici) da usare con "Crea crocini"
  di FineCut. Ritorna `{"ok":true,"marks":n,"layer":".."}`.
- `corvoRegmarksClear()` — toglie gruppo e rettangolo non confermati, rimuove i livelli crocini rimasti vuoti.
- `corvoRegmarksFinish()` — Applica: rinomina in `Corvo_Regmarks_rif` / `Corvo_FineCut_Area_rif`, cosi' una
  sessione successiva non li sostituisce.

### Flusso pannello

Menu "Crocini" (Nessuno, Graphtec, Summa, Roland, Mimaki; ricordato in `localStorage`). Durante la ricerca il rotolo
arancione e' gia' quello intero (margini di testa/coda compresi). A fine ricerca (Stop o fine tempo) i crocini vengono
disegnati come anteprima e gli avvisi compaiono nella riga di stato; Applica li ridisegna sul layout finale, li conferma
e chiude la sessione; Annulla (o chiusura del pannello) chiama `corvoRegmarksClear()` prima di `corvoRevert()`.
La lunghezza mostrata a fine ricerca e' quella del materiale usato (nest + margini crocini).

### Test

`node plugin/tools/test_regmarks.js [s per nest=2]`: per i 4 sistemi × rotoli 600x1646, 1370x3000, 300x200 mm controlla
passo ≤ max ed equidistante, numero di crocini, margini di testa/coda e di bordo, simmetria, zone di rispetto nelle
fasce, avvisi, payload (forme, conversione pt, rettangolo FineCut), area dei poligoni; poi nest wasm di insegna48 sulla
striscia ridotta per ogni sistema e larghezza: intersezione poligonale (clipper) contorni originali × zone di rispetto
= 0 e pezzi dentro il telaio. Esito 2026-09-24: 333 controlli, 0 falliti; su 600 mm insegna48 passa da 1744 mm senza
crocini a 1882-2080 mm di nest (fasce da 25-46 mm per lato).

### Limiti noti

- Summa: lato del marchio e passo non sono nel manuale scaricato (3 mm / 500 mm scelti da Corvo): vanno fatti
  combaciare con i parametri OPOS del software Summa. Manca la linea OPOS XY e il barcode.
- Mimaki: FineCut non legge crocini disegnati da Illustrator (doc. ufficiale C36): Corvo disegna solo la guida non
  stampabile + il rettangolo per FineCut e riserva lo spazio.
- Roland: se VersaWorks aggiunge i propri crocini al lavoro, quelli di Corvo vanno resi non stampabili (sarebbero doppi).
- I crocini intermedi presuppongono un software che li usi (regolazione a segmenti Graphtec, OPOS con piu' marchi);
  Roland/Mimaki possono richiedere di dividere il lavoro in pannelli: l'avviso `rmIntermediate` lo segnala.
- Nessuna verifica ancora su plotter reale ne' in Illustrator (fase VERIFICA del loop).
