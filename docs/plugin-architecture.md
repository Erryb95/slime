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

## Modulo 1 — Fedeltà al file (print&cut, kit veicoli) — 2026-09-23

Il raggruppamento in pezzi NON sta più nell'host: l'host esporta gli oggetti, il pannello decide i pezzi con
`client/js/cluster.js` (puro, testato in Node) e li comunica all'host con `corvoGroup`.

### Contratto host (aggiornato)

1. `corvoExport({flatness})` — un elemento per ogni oggetto di primo livello della selezione, anche senza anelli chiusi:
   `{"i","name","type","layer","rings":[...],"bounds":[l,t,r,b],"box":[l,t,r,b],"cut":[indici in rings]?,
     "cutSpots":["CutContour"]?,"other":[rettangoli]?,"text":n?,"nonVector":n?,"nonVectorTypes":[..]?}`
   - `rings`: tracciati VISIBILI (riempimento o traccia; i tracciati senza né l'uno né l'altra sono ignorati), guide escluse,
     figli nascosti esclusi; gruppo con maschera → solo il tracciato di maschera (il contenuto mascherato viene visitato
     solo per trovare linee di taglio).
   - `cut`: indici dei tracciati con traccia o riempimento in tinta piatta di taglio (`corvo_isCutName`: senza maiuscole,
     spazi, trattini, punti, underscore; prefissi `cutcontour|contourcut|thrucut|throughcut|kisscut|diecut|cutline|cutpath|perfcut`
     oppure esatti `cut|cuts|cutter|contour|taglio` + numero facoltativo → "CutContour", "Thru-cut", "Kiss Cut",
     "Through Cut Rectangle", "CONTOUR", "Cut 2"; NON "Cutting Mat", "Uncut", "Shortcut").
   - `other`: rettangolo d'ingombro di raster, immagini collegate, simboli, mesh, grafici, plugin (si muovono col pezzo).
   - `text`: numero di cornici di testo vivo (NON più errore dell'host: decide il pannello).
   - `box`: ingombro di tutto (anche linee aperte e testo); `bounds` = ingombro dei soli anelli (compatibile v0.1).
   - Esclusi e riportati in `"excluded":[{name,layer,reason:"hidden"|"locked"}]`: oggetti nascosti o bloccati (anche via
     livello/gruppo antenato). Oggetti sul livello `Corvo` ignorati in silenzio. Tutti esclusi → `{"error","code":"allExcluded","n"}`.
   - `doc.artboards`: tutti i rettangoli delle tavole (per i crocini).
   - `rg` (verifica 24/09): per ogni anello l'id del tracciato / tracciato composto di provenienza. L'area riempita del pezzo
     (statistica "Riempimento") è pari-dispari DENTRO un tracciato composto e unione non-zero TRA tracciati: prima era
     pari-dispari su tutto e la stampa fatta di forme sovrapposte (o il kiss cut dentro il suo through cut) si annullava
     (die-cut Sticker Mule: 12 % mostrato contro 48 % reale).
   - `lockedCuts` (verifica 24/09): `[{name, spot, layer, reason:"locked"|"hidden", box}]` — tracciati con tinta di taglio
     BLOCCATI o NASCOSTI (anche via livello/gruppo) che non stanno dentro la selezione. Cercati solo se il documento ha
     almeno una tinta con nome di taglio. Corvo non sblocca mai nulla: decide il pannello (sotto).
   - `processCuts` (verifica 24/09): nomi dei campioni con nome di taglio che NON sono tinta piatta (quadricromia globale
     o semplice) → avviso `noteProcessCut` in testa alla riga di stato (checklist A5, problema utenti n. 1). Solo avviso.
2. `corvoGroup([[0,3],[1],...])` — NUOVO: indici degli elementi esportati che formano ciascun pezzo; il pezzo k è l'indice
   di `corvoApply`. Va chiamato prima del primo `corvoApply`. Elementi non elencati (crocini) non vengono mai toccati.
   Senza `corvoGroup` ogni elemento è un pezzo (compatibile v0.1).
3. `corvoApply`/`corvoRevert`: la stessa `transform()` viene applicata a ogni membro del pezzo, attorno all'origine del
   documento → i membri restano rigidamente solidali e ciascuno resta sul SUO livello (nessuno spostamento tra livelli).
   `$.global.corvo.items[i]` è ora un ARRAY di membri.

### Pannello (`cluster.js` → `planPieces(items, {merge, shape, artboards})`)

- Opzioni UI: **Forma di ingombro** (`shapeSrc`: "Tutto il disegno" | "Solo linea di taglio (CutContour…)") e
  **Unisci oggetti sovrapposti** (`merge`, default ON). Ricordate in localStorage (`corvo.opts`).
- **Crocini di registro** esclusi automaticamente (nota nella riga di stato): livello il cui nome contiene
  Reg / Reg Marks / Registration / Registro / Marks / Crop marks / Crocini / OPOS / ARMS; oppure oggetto ≤ 12 mm,
  quasi quadrato (rapporto ≤ 1.4), con il centro entro 30 mm da un angolo di una tavola e che non tocca nessun altro oggetto.
- **Unione** (shape "all"): union-find sui `box`; due oggetti si uniscono se i box si sovrappongono di più di 0.5 pt su
  entrambi gli assi E (uno contiene l'altro OPPURE le sagome reali, ingrandite di 0.125 pt, si intersecano — clipper).
  Così lettere crenate con box sovrapposti restano separate, stampa+taglio o decal fatte di forme sovrapposte restano unite.
- **Unione** (shape "cut", `clusterCutAnchored`): gli oggetti con linea di taglio sono ancore; due ancore si uniscono solo
  se le LINEE DI TAGLIO si sovrappongono/contengono; ogni altro oggetto va all'ancora il cui box di taglio sovrappone di più.
  Serve per fogli già disposti con distanza < abbondanza: le abbondanze che invadono il vicino non incollano due adesivi.
  Oggetti che non toccano nessuna linea di taglio → regola normale → pezzi "fallback".
- **Forma**: "all" = tutti gli anelli + rettangoli `other`; "cut" = solo gli anelli di taglio del pezzo (l'abbondanza
  fuori dal taglio è ignorata: comportamento corretto print&cut); pezzo senza taglio → "all" + avviso `noteFallback`.
- **Cornici del foglio** (verifica 24/09, `findFrames`): un oggetto di primo livello che è solo linea di taglio (es.
  "Through Cut Rectangle" del foglio Sticker Mule 11x8.5) oppure un'unica forma grande come una tavola (lo sfondo di
  Wikipedia20) e che contiene almeno due oggetti separati → escluso (`reason:"sheetFrame"`), resta al suo posto, nota
  `noteSheetFrame` ("per spostare un foglio intero raggruppalo, Ctrl+G"). Senza questa regola la cornice incollava
  tutti gli adesivi in UN pezzo. Un through cut attorno a UN solo adesivo (template kiss-cut) resta parte del pezzo.
- **Linee di taglio bloccate** (`lockedCuts`): se toccano un pezzo o ne contengono uno solo → errore `errLockedCut`
  (nomina tinta e livello: "sblocca e mostra il livello, seleziona anche le linee di taglio"); se contengono due o più
  pezzi (cornice del foglio sul livello bloccato) → solo nota `noteLockedFrame`; lontane → ignorate.
- **Pezzi degeneri**: pezzi i cui anelli sono tutti sotto `minRingArea` (puntini, tracciati chiusi ad area nulla) restano al
  loro posto con la nota `noteNoContour`, invece di bloccare tutto il nesting (errore visto su Wikimania2021).
- **Errori**: testo vivo che definisce la forma (shape "all" o fallback) → `errText` con il numero di cornici e
  "Testo > Crea contorni"; in shape "cut" il testo dentro un adesivo con linea di taglio è solo un passeggero.
  Pezzo fatto solo di immagini/oggetti non vettoriali → `errRasterOnly`. Pezzo con sole linee aperte → saltato (`noteNoContour`).
- Avvisi nella riga di stato: oggetti uniti, crocini esclusi, nascosti/bloccati ignorati, fallback, senza contorno, inviluppi.

### Annullo unico (E2, verifica 24/09)
- Ogni `corvoApply` che sposta qualcosa e ogni `corvoRoll` contano un passo (`st.steps`); `corvoExport` salva l'ingombro
  originale di ogni elemento (`st.orig`). `corvoFinish` (Applica) chiama `app.undo()` finché tutto è di nuovo
  all'ingombro originale e il rotolo non esiste (al massimo `st.steps` volte), poi rifà la disposizione finale e il
  rettangolo `Corvo_Roll_rif` nello STESSO script → un solo Ctrl+Z riporta il foglio all'originale, Ctrl+Maiusc+Z lo rifà.
  Se il riavvolgimento non torna esattamente all'origine (l'utente ha toccato il documento durante la ricerca) si
  rifanno i passi (`app.redo`) e resta la cronologia a passi. `corvoFinish({singleUndo:false})` lo disattiva.
  Risultato in `{"undo":"single"|"restored"|"skip"|"off"}`.
- ExtendScript: `final` è parola riservata (ES3) — un `var final` rompe il caricamento dell'intero corvo.jsx.

### Limiti v1 (noti)
- La traccia (strokeWidth) non allarga la sagoma: un tracciato stampato con traccia spessa sporge di metà traccia (la
  distanza la assorbe se ≥ traccia/2).
- Raster/immagini in "Tutto il disegno" = rettangolo d'ingombro (conservativo, niente trasparenza → contorno: modulo 8).
- Un oggetto di stampa che copre due linee di taglio (sfondo unico per due adesivi) va a una sola ancora.
- Lettura della geometria lenta sui file densi: ogni lettura DOM di un punto costa ~1-4 ms con Illustrator in
  background (misurato 24/09: 27 000 punti di Wikipedia20 = ~270 s di esportazione). Da valutare: esportazione in blocco
  (SVG/PDF temporaneo) letta dal pannello.
- Applica lascia la disposizione sul rotolo SOTTO la tavola: un PDF salvato contiene solo le tavole, quindi serve una
  tavola sul rotolo (per ora a mano; candidata per il modulo 5/6).
- Il riconoscimento dei crocini ARMS/OPOS con forme a L o gruppi di linee dipende dal nome del livello o dall'ingombro quadrato.

### Test
- `node plugin/tools/test_cluster.js` — 74 controlli (dal 24/09 anche cornici del foglio, linee di taglio bloccate, area per tracciato), senza Illustrator (nomi tinte di taglio via vm su corvo.jsx,
  union-find, foglio print&cut, foglio già disposto, fallback, testo, raster, lettere crenate, crocini).
- `node plugin/tools/test_modulo1.js [s]` — pannello reale: foglio A3 CMYK sintetico, 12 adesivi (vettoriali, 3 raster,
  1 gruppo con maschera; abbondanza 3 mm asimmetrica) + CutContour su livello CUT + 4 crocini su "Reg". 32 controlli (dal 24/09 anche un solo Ctrl+Z dopo Applica, campione di taglio in quadricromia → avviso, cornice
  "Through Cut Rectangle" lasciata al suo posto, livello CUT bloccato → errore e livello ancora bloccato).
- `SEED=n node plugin/tools/test_e2e.js insegna48 30` — seme del motore fisso (`window.CorvoSeed`, solo test) per
  confronti di regressione meno rumorosi; 0/assente = casuale come in produzione.
- Aperture di file nei test: `app.userInteractionLevel = DONTDISPLAYALERTS` (un avviso sui profili colore CMYK bloccava
  ExtendScript con una finestra modale).

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

## Modulo 2 — Pezzi dentro i fori (`client/js/holes.js`, branch `modulo2-fori`)

jagua-rs/Sparrow non accetta item con fori (jagua-rs PR #96): i fori si riempiono PRIMA del nest, fuori dal motore,
con un pre-pass deterministico in JS (nessuna modifica al wasm). File nuovo, puro, usabile in Node e nel pannello
(`window.CorvoHoles`, richiede `CorvoGeometry` + `ClipperLib`). Aggancio in `main.js`/`index.html` marcato `// MODULO 2`.

1. **Regioni libere** di ogni pezzo P = poligono Sparrow di P (contorno esterno, chiusura o inviluppo) MENO il disegno
   di P (riempimento even-odd) cresciuto di `gap + 0.05 pt`. Sono i controfori di O A R B D P Q 0 6 8 9, cornici,
   anelli, guarnizioni, e anche le concavita' coperte da una chiusura/inviluppo. Regioni < 50 pt² ignorate. Le isole
   dentro un foro (es. il disco centrale di un logo ad anello) restano ostacoli.
2. **Riempimento greedy**: regioni per area decrescente; per ciascuna si provano i pezzi rimasti dal piu' grande, in
   tutte le rotazioni ammesse dall'UI (Libera → 0/90/180/270). Le posizioni ammissibili sono ESATTE via somme di
   Minkowski (inner-fit della regione meno i no-fit dei figli gia' messi, cresciuti di `gap`), usando l'inviluppo
   convesso del figlio come pattern (conservativo). Si prende il vertice in basso a sinistra e si ricontrolla con
   clipper (figlio dentro la regione, fuori dagli altri figli). Forme conservative: figlio = poligono Sparrow
   semplificato GONFIANDO (≤ 40 vertici), regione = sgonfiata poi semplificata → distanza sempre ≥ `gap`.
   Budget 2 s (`maxMs`); misurato 0.1–0.5 s su 26–46 pezzi.
3. **Un livello**: un pezzo che riceve figli non diventa figlio, un figlio non riceve figli. Genitore + figli = UN
   item Sparrow (il poligono del genitore: i figli sono dentro).
4. **Contratto**: `planHoles(items, pieces, {gap, orientations})` →
   `{children:[{id, parent, a, tx, ty}], parents, regions, usedRegions, emptyRegions, ms, timedOut}` dove
   `(a, tx, ty)` porta il figlio dalla sua posizione ORIGINALE dentro il foro del genitore nella posizione ORIGINALE
   del genitore. `nestPieces(pieces, plan)` toglie i figli e rinumera gli id 0..n-1 (Sparrow vuole id consecutivi;
   `srcId` = indice host). `movesFor(placements, nestPieces, origin, plan)` = mosse `corvoApply` di TUTTI i pezzi:
   figlio `a = a_P + a_c`, `t = R(a_P)·t_c + t_P` (stesso contratto assoluto per indice `i`, quindi `corvoRevert`
   riporta anche i figli, e il colore spot dei figli resta intatto: solo trasformazioni).
5. **UI**: casella "Usa i fori" / "Use holes" (default ON, ricordata in `localStorage corvo.holes`); nota di stato
   "N pezzi nei fori". La densita' mostrata conta l'area di tutti i pezzi, figli compresi.

Test: `node plugin/tools/test_holes.js [secondi]` (Node + wasm, niente Illustrator; contiene un piccolo parser SVG
con archi/Bézier/trasformazioni). Set: Bebas Neue O A R B D 8 a 300 pt + 20 pezzi; le 9 lettere reali
`BebasNeue_channel_letters_OARBDQ890.svg`; anello/guarnizione/cornice MDI + roundel Wikimedia (+ 26 o 40 pezzi); caso
negativo senza pezzi che entrano. Verifica: tutti i pezzi piazzati e nel rotolo, nessuna sovrapposizione fra i disegni
(even-odd), ogni figlio dentro il genitore con distanza ≥ gap dal genitore e dagli altri figli, composizione delle
trasformazioni, lunghezza fori ON vs OFF (stesso seed) e tempo del pre-pass.

Limiti noti: un solo livello di annidamento; il figlio e' trattato come convesso nel calcolo delle posizioni
(niente incastri a L dentro un foro); il greedy non garantisce "mai peggio": quando il rotolo ha comunque spazio
libero per i pezzi piccoli il guadagno e' ~0 e il rumore stocastico di Sparrow (±2%) domina; non ancora verificato
in Illustrator (`test_e2e.js`).
