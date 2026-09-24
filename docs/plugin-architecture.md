# Corvo — architettura del plugin Illustrator (v0.9.0-beta: moduli 1-9, merge 2026-09-24)

Obiettivo v0.1: selezioni gli oggetti in Illustrator, premi **Nest**, e vedi i pezzi muoversi LIVE nella tavola
mentre Sparrow cerca; **Stop** tiene il migliore, **Applica** conferma, **Annulla** riporta tutto com'era.

## Struttura (`plugin/`)

```
plugin/
  CSXS/manifest.xml        # id com.corvo.nesting, host ILST [29.5,99.9], CSXS 11.0, --enable-nodejs --mixed-context
  .debug                   # porta CEP 8093 per ILST (solo sviluppo)
  host/corvo.jsx           # ExtendScript: geometria in uscita, trasformazioni in entrata      [AGENTE HOST]
  host/regmarks.jsx        # modulo 6: disegno dei crocini (caricato da corvo.jsx)
  host/multinest.jsx       # moduli 4+7: colori degli oggetti (paint) e contenitori multipli (caricato da corvo.jsx)
  client/index.html        # pannello UI                                                       [AGENTE PANEL]
  client/css/panel.css
  client/js/main.js        # UI, stato, orchestrazione, throttle delle mosse live               [AGENTE PANEL]
  client/js/geometry.js    # anelli -> forme Sparrow (unione, chiusura, semplificazione)        [AGENTE PANEL]
  client/js/cluster.js     # modulo 1: oggetti esportati -> pezzi (unione, crocini, linea di taglio)
  client/js/holes.js       # modulo 2: pezzi piccoli dentro i fori dei grandi (pre-pass prima del nest)
  client/js/quantity.js    # modulo 3: copie per design, coppie specchiate S/D, copie vicine (logica pura)
  client/js/quantity-panel.js, css/quantity.css   # modulo 3: sezione "Copie e coppie specchiate" (solo DOM)
  client/js/report.js      # modulo 5: report materiale/costo, CSV (logica pura)
  client/js/report-panel.js, css/report.css   # modulo 5: sezione "Materiale e costo" del pannello (solo DOM)
  client/js/regmarks.js    # modulo 6: specifiche e geometria dei crocini print&cut (logica pura)
  client/js/raster.js      # modulo 8: PNG trasparente -> contorno (decoder, marching squares, offset)
  client/js/license.js     # modulo 9: licenza offline ECDSA, prova 14 giorni, tabella gating Standard/Pro + UI licenza
  client/css/license.css   # modulo 9: badge nel piede + finestra licenza
  client/js/multinest.js   # moduli 4+7: orchestratore multi-job (nest in sequenza, contenitori, preset)
  client/js/colorgroups.js # modulo 4: gruppi per colore (spot per nome, ΔE sui colori di processo) o livello
  client/js/sheets.js      # modulo 7: fogli standard, greedy multi-foglio sopra lo strip packing di Sparrow
  client/js/worker.js      # Web Worker: carica wasm dai byte ricevuti, chiama nest()           [AGENTE PANEL]
  client/js/CSInterface.js # ponte CEP minimo scritto da noi (evalScript, requestOpenExtension, ...) su window.__adobe_cep__
                           # NB: il CSInterface.js ufficiale (Adobe-CEP/CEP-Resources) NON e' MIT: porta la licenza Adobe SDK
  client/lib/corvo.js, corvo_bg.wasm   # output wasm-bindgen (copiati da wasm/demo con tools/build.sh)
  client/lib/clipper.js    # clipper-lib (Boost License) vendorizzato
  tools/build.sh           # rebuild wasm + copia in client/lib
  tools/test_e2e.js        # test end-to-end del pannello VERO in Illustrator via CDP (porta 8093)
  tools/test_modulo1.js    # modulo 1 nel pannello vero (Illustrator)
  tools/test_client.js, test_cluster.js, test_holes.js, test_report.js, test_regmarks.js, test_raster.js,
  tools/test_combined.js   # test Node senza Illustrator (vedi "Integrazione dei moduli")
  tools/test_license.js    # modulo 9 (Node)
  tools/release/           # modulo 9: license-keygen/gen .mjs, build-zxp.ps1, install/uninstall .ps1+.cmd, test-install.ps1
  tools/test_multinest.js, test_multinest_panel.js, svgparse.js   # moduli 4+7 (Node, file reali bench/real)
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

## Integrazione dei moduli (merge 2026-09-24: moduli 2, 5, 6, 8 sopra il modulo 1; poi 9, 3, 4+7)

I quattro moduli sono nati in branch separati sulla base v0.1; il modulo 1 aveva nel frattempo cambiato il formato di
`corvoExport` (oggetti con `layer`, `rings`, `rg`, `cut`, `box`) e spostato il raggruppamento nel pannello
(`cluster.js` + `corvoGroup`). Nel codice gli agganci restano marcati `// MODULO N`.

### Pipeline di `nest()` in `main.js` (ordine)

1. **Modulo 6** `RM.reserve(sistema, larghezza)` → striscia del nest ridotta (`nestHeight`) e offset dentro il rotolo.
2. `corvoExport({flatness, raster:true})` → oggetti di primo livello (modulo 1); le immagini di primo livello arrivano
   con `raster` e `rings: []` (**modulo 8**).
3. **Modulo 8** `raster.prepareItems` traccia le immagini PRIMA del raggruppamento: ogni immagine diventa un oggetto
   come gli altri (`rings` = contorno, `rg` = un solo gruppo pari-dispari, `box` = ingombro + contorno con offset).
   Così un'immagine sotto una CutContour si unisce alla sua linea di taglio, e in "Solo linea di taglio" e' un passeggero.
4. **Modulo 1** `cluster.planPieces` → pezzi `{i, members, name, layers, source, rings, rg, box}`; `corvoGroup`.
5. `geometry.buildPieces`; i pezzi degeneri restano al loro posto e gli altri sono rinumerati (`hostI` = indice del piano).
5b. **Modulo 3** `quantity.expand(planPieces, pieces, spec)` → copie e copie specchiate VIRTUALI (pezzi + oggetti
   virtuali agli indici host `base + k`); `corvoM3Ghosts` crea le sagome nell'host prima della ricerca.
6. **Modulo 2** `holes.planHoles(planPieces, pieces)` → figli nei fori (anche nei fori delle copie); `nestPieces` toglie i figli.
6b. **Modulo 3** `quantity.buildNest(nestPieces)` → item Sparrow con `demand` (+ celle "tieni vicine");
   ogni report viene riportato a una posizione per pezzo con `quantity.expandPlacements` appena arriva dal motore.
7. **Modulo 5** `CorvoReportPanel.begin` con `expand` (posizioni di tutti i pezzi, figli compresi) e con le misure del
   materiale (rotolo intero e lunghezza con i margini dei crocini).
8. Nest; live `movesFor` = `holes.movesFor` (indici `hostI`, figli composti col genitore); a fine ricerca crocini in
   anteprima; Applica = `corvoFinish` che conferma anche i crocini.

### Interazioni risolte nel merge

- **Fori (2) × pezzi raggruppati (1)**: le regioni libere si calcolano sugli anelli del pezzo raggruppato con i gruppi
  `rg` (pari-dispari dentro un tracciato/tracciato composto, unione non-zero tra tracciati). Senza questo la stampa
  disegnata sopra il suo sfondo (due oggetti uniti in un pezzo) apriva un falso foro e ci finivano dentro altri pezzi.
  `planHoles` cerca l'oggetto del pezzo per `hostI`; i figli portano `hostI`; `movesFor` restituisce gli indici
  del piano (quelli di `corvoGroup`), non gli id rinumerati per Sparrow.
- **Fori (2) × DTF (8)**: i fori del contorno di un PNG (es. donut) sono veri fori: possono ricevere pezzi piccoli.
- **Report (5) × pezzi raggruppati (1)**: colonna `livello` = livelli del pezzo (`"Print + CUT"` per un pezzo su due
  livelli), nome = nome del pezzo; lunghezza originale dai `box` dei pezzi.
- **Report (5) × fori (2)**: `expandPlacements(placements, nestPieces, plan, pieces)` = posizioni nella striscia di TUTTI
  i pezzi (inverso di `placementToMove`); righe CSV = pezzi, figli compresi.
- **Report (5) × crocini (6)**: con i crocini il materiale usato e' il rotolo INTERO (non la striscia ridotta) per la
  lunghezza del nest + margini di testa/coda: `computeReport({materialWidthPt, materialLengthPt})`. I risparmi vs
  rettangoli / disposizione originale aggiungono gli stessi margini, quindi restano confrontabili.
- **Crocini (6) × annullo unico (1)**: disegno e rimozione dei crocini durante la sessione contano nei passi di
  annullamento (`st.steps`), `corvo_singleUndo` aspetta che anche i crocini di anteprima siano spariti e poi li
  ridisegna gia' confermati (`Corvo_Regmarks_rif`) nello stesso script: un solo Ctrl+Z toglie disposizione, rotolo e
  crocini. `corvoFinish` conferma i crocini anche nei percorsi senza annullo unico; il pannello non chiama piu'
  `corvoRegmarksFinish` (resta nell'host per compatibilita').
- **Crocini (6) × crocini esistenti (1)**: i crocini disegnati da Corvo stanno sul livello `Regmarks` → se riselezionati
  in una sessione successiva il modulo 1 li esclude come crocini (nome livello).
- **DTF (8) × modulo 1**: immagini dentro un gruppo o una maschera restano "other" (rettangolo d'ingombro) come nel
  modulo 1; solo quelle di primo livello vengono tracciate. Un pezzo fatto solo di immagini non e' piu' un errore
  (`errRasterOnly`) se le immagini sono di primo livello.
- **Preset DTF (8) × crocini (6)**: indipendenti; per DTF lasciare "Crocini: Nessuno".
- API host retrocompatibile: `corvoExport` senza `raster:true` si comporta come nel modulo 1; `corvoRegmarksFinish`,
  `corvoGroup`, `corvoApply`, `corvoRevert`, `corvoFinish(opts)` invariati nelle firme.

### Moduli 3, 4, 7, 9 (secondo merge 2026-09-24, branch `integrazione-3-47-9`)

Ordine: `modulo9-commerciale` → `modulo3-quantita` → `modulo4-7-multinest`, sopra i moduli 1, 2, 5, 6, 8.
Conflitti solo testuali (`main.js`, `index.html`, `corvo.jsx`, questo documento); tutte le funzioni tenute.
Ordine degli script in `index.html`: ... `quantity.js` (3), `raster.js` (8), `multinest.js` / `colorgroups.js` /
`sheets.js` (4/7), `license.js` (9, prima di `main.js`), `main.js`, `report*.js`, `quantity-panel.js`.

**Gating delle edizioni (9)** — una sola tabella, `FEATURES` in `license.js`; `CorvoLicense.has(f)` nel pannello:
| Funzione | Chiave | Edizione | Dove si controlla |
|---|---|---|---|
| Pezzi nei fori (2) | `holes` | Pro | `readParams` (`m9has`) + casella bloccata da `license.js` |
| Nest per colore/livello (4) | `colorNest` | Pro | `mnReadParams`: errore chiaro + finestra licenza; opzioni "Colore"/"Livello" disabilitate |
| Multi-foglio (7) | `multiSheet` | Pro | come sopra, opzione "Fogli" disabilitata |
| CSV del report (5) | `costCsv` | Pro | `report-panel.js` (anche il CSV multi-gruppo) |
| Copie / coppie specchiate (3) | `quantity` | Standard (anche a prova finita) | `nest()` prima di `quantity.expand` |
Il controllo in `readParams` vale anche quando un **preset** (modulo 4) imposta un raggruppamento bloccato: il preset si
carica, Nest si ferma con il messaggio "funzione Pro". In prova (14 giorni) tutto e' Pro.

**Limite di Applica a prova finita (9)** — `S.m9Count = pieces.length` DOPO `quantity.expand` e dopo aver tolto i pezzi
degeneri: conta i pezzi reali che Applica sposta o crea nell'host, **copie e specchiate comprese** (9 design × 1 + 2 copie
= 11 → rifiutato), figli nei fori compresi. Vale uguale per il nest singolo e per il multi-job.

**Copie (3) × multi-job (4/7)**
- `quantity.expand` avviene PRIMA della divisione in gruppi; `MN.assignGroups(plan.groups, pieces)` mette ogni copia e
  ogni specchiata nel gruppo del suo originale (`copyOf` = indice del piano), quindi nei rotoli per colore e nei fogli
  le copie si dispongono con i pezzi del loro colore / gruppo. La venatura per nome/livello si legge dall'originale.
- Ogni copia e' un'unita' a se' (demand 1) nel suo job: `quantity.buildNest` (demand + celle "tieni vicine") vale solo
  per il nest singolo; con piu' rotoli/fogli e "Tieni vicine" attivo compare la nota `mnNoCells`.
- Le sagome (`corvoM3Ghosts`) si creano prima del primo job (`mnStart` → `m3Ghosts()` → `mnStartJobs`); le mosse di ogni
  job (`mnUnitMoves` → `holes.movesFor`) usano gli indici host `base + k`, quindi **le sagome si spostano job per job**
  come gli originali. Applica (`corvoFinish`) crea i duplicati veri come nel nest singolo; `corvo_singleUndo` aspetta sia
  le sagome sia `Corvo_Containers` prima di ridisegnare i contenitori confermati.
- Fori (2) per gruppo: i figli si cercano solo tra pezzi dello stesso gruppo (copie comprese).
- "Leggi selezione" usa lo stesso export (`paint` se "per colore") e lo stesso piano (`planGroups`) di Nest, cosi' le
  chiavi della tabella (nome + ingombro + ordinale) coincidono; l'export in cache si riusa solo se ha i colori quando servono.

**Crocini (6) × multi-job (4/7)** — NON supportati: con piu' rotoli/fogli i crocini non vengono disegnati e la riga di
stato lo dice (`mnNoRegmarks`: "per print & cut con crocini usa Tutto insieme + Rotolo"). Motivo: il modulo 6 riserva
fasce dentro UN rotolo e disegna un solo set (`corvo_rmDraw`); un set per rotolo/foglio richiede un payload per
contenitore e il ricalcolo dell'origine di ogni job (lavoro futuro).

**Limite noto (4)** — per colore, un oggetto di taglio senza riempimento (solo traccia CutContour, colore di taglio
escluso) finisce nel gruppo "senza colore" e non si unisce piu' alla sua stampa: il nest per colore e' pensato per il
vinile da intaglio; per print & cut usare "Tutto insieme" (o per livello con stampa e taglio sullo stesso livello).

**Motore: gruppo con poca area su un rotolo largo** — trovato dal test combinato: jagua-rs parte da una striscia larga
`area pezzi / altezza` e la restringe di `gap/2` per lato; 15 pallini da 3-5 mm su 507 mm di striscia danno una larghezza
iniziale sotto il gap → **panic nel wasm** ("Offset resulted in an empty polygon", worker morto). Succede anche nel nest
singolo (pochi adesivi piccoli su un rotolo da 1,6 m). Correzione lato pannello: `geometry.guardInstance(inst, gap)`
abbassa `strip_height` (mai sotto l'ingombro minimo di ogni pezzo nelle rotazioni ammesse) finche' area/altezza >= 4 gap;
la disposizione resta dentro il rotolo vero. Applicata in `nest()` e in `mnRunner`.

### Test Node (senza Illustrator)

| Test | Cosa | Esito al merge |
|---|---|---|
| `test_client.js` | geometria + nest insegna48 | PASS |
| `test_cluster.js` | modulo 1 | 74/74 |
| `test_holes.js [s]` | modulo 2, + blocco "module 1 clusters" (sfondo+stampa senza falso foro, `hostI`, `expandPlacements`) | PASS |
| `test_report.js [s]` | modulo 5, + colonna livello da pezzi raggruppati, + costo con margini crocini | PASS |
| `test_regmarks.js [s]` | modulo 6 | 333 controlli, 0 falliti |
| `test_raster.js [s]` | modulo 8 | PASS |
| `test_quantity.js [s]` | modulo 3, anche host corvo.jsx con DOM finto | 221 controlli, PASS |
| `test_combined.js [s]` | lettering + pezzi piccoli con fori ON, adesivo stampa+taglio, crocino su "Reg", 3 PNG DTF, crocini Graphtec, report; **parte 2**: stessi oggetti per colore (4 rotoli) con 2 copie + 1 copia + 1 specchiata, fori per gruppo, report per gruppo, gating edizioni e limite di Applica | 49/49 |
| `test_multinest.js [s] [split] [finale]` | moduli 4+7: colori/livelli su bench/real/color, fogli su bench/real/laser, preset | 221/221 |
| `test_multinest_panel.js [s]` | moduli 4+7 nel pannello vero (DOM e host finti, motore inline); + 3b copie/specchiata nei rotoli per colore (sagome mosse job per job), + 4 gating a prova finita (colore/fogli rifiutati prima dell'export, Applica rifiutato per 1 pezzo + 11 copie) | 48/48 |
| `test_license.js` | modulo 9: firma ECDSA, prova, edizioni, tabella FEATURES (4 Pro + `quantity` Standard) | 64/64 |

`SEED=n` fissa il seme del motore in `test_holes`, `test_combined` (default 7).

Verifica in Illustrator (24/09): `plugin/tools/ill/` (m2.js fori, m56.js report+CSV+crocini dei 4 sistemi, m8.js PNG
collegati/incorporati/specchiati, undo6.js annullo unico con crocini; vedi README.txt). Uno alla volta: pilotano lo stesso
pannello. `$.global.corvoLastUndo` = diagnostica dell'ultimo annullo unico (`{steps, undone, ok, why}`).

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
   - `text`: numero di cornici di testo vivo (NON più errore dell'host: decide il pannello); `textBoxes`: i loro
     `geometricBounds` [l,t,r,b] (verifica finale 0.9 beta).
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
- **Testo dentro il pezzo** (verifica finale 0.9 beta, file laser di boxes.py: ogni parte ha un'etichetta di testo vivo):
  se TUTTE le cornici di testo del pezzo stanno dentro l'area pari-dispari dei suoi anelli (4 angoli rientrati di 0,5 pt +
  centro, `boxInRings` in `cluster.js`) il testo non definisce la sagoma: viaggia col pezzo, nessun errore
  (`warnings.textInside`). Testo che esce dalla sagoma, sopra un foro, o senza `textBoxes` → `errText` come prima.
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
- Raster/immagini DENTRO un gruppo in "Tutto il disegno" = rettangolo d'ingombro (quelle di primo livello: contorno, modulo 8).
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

## Modulo 2 — Pezzi dentro i fori (`client/js/holes.js`, 2026-09-24)

jagua-rs/Sparrow non accetta item con fori (jagua-rs PR #96): i fori si riempiono PRIMA del nest, fuori dal motore,
con un pre-pass deterministico in JS (nessuna modifica al wasm). File nuovo, puro, usabile in Node e nel pannello
(`window.CorvoHoles`, richiede `CorvoGeometry` + `ClipperLib`). Aggancio in `main.js`/`index.html` marcato `// MODULO 2`.

1. **Regioni libere** di ogni pezzo P = poligono Sparrow di P (contorno esterno, chiusura o inviluppo) MENO il disegno
   di P (pari-dispari dentro ogni tracciato, unione tra tracciati se il pezzo porta `rg`) cresciuto di `gap + 0.05 pt`. Sono i controfori di O A R B D P Q 0 6 8 9, cornici,
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
   `srcId` = id del pezzo, `hostI` copiato). `movesFor(placements, nestPieces, origin, plan)` = mosse `corvoApply` di
   TUTTI i pezzi sull'indice del piano del modulo 1 (`hostI` se i pezzi sono stati rinumerati);
   `expandPlacements(...)` = le stesse posizioni nel sistema della striscia per il report. Composizione:
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

## Modulo 3 — Copie per design, coppie specchiate S/D, copie vicine (`client/js/quantity.js`, 2026-09-24)

Problemi utente: Deepnest #6 (specchiatura chiesta dal 2018), #16/#181 (copie), #124 (pezzi dello stesso lavoro vicini),
Signs101 (decal S/D ridisegnate a mano). File nuovi: `quantity.js` (puro, `window.CorvoQuantity`/`module.exports`),
`quantity-panel.js` + `css/quantity.css` (DOM). Agganci `// MODULO 3` in `main.js`, `index.html`, `host/corvo.jsx`.

### Scelta di progetto: copie VIRTUALI fino ad Applica
- Durante la ricerca nessun oggetto viene duplicato. Ogni copia e' un pezzo del pannello con `hostI = base + k`
  (`base` = numero di pezzi di `corvoGroup`); nell'host all'indice `base + k` c'e' una **sagoma** leggera
  (`Corvo_Ghost`: il poligono Sparrow, <= 200 punti, tratteggio azzurro sul livello Corvo). `corvoApply` muove sagome e
  pezzi con lo stesso contratto assoluto, quindi l'anteprima dal vivo costa come un tracciato semplice per copia anche se
  il design e' un gruppo pesante con maschere e tinte piatte.
- **Applica** (`corvoFinish`): per ogni copia l'host duplica TUTTI i membri del pezzo sorgente con
  `duplicate(membro, ElementPlacement.PLACEBEFORE)` (stesso livello/gruppo, subito sopra l'originale: tinte piatte,
  CutContour, livelli e impilamento dentro la copia conservati), riporta i duplicati alla posizione ORIGINALE del
  sorgente (inverso della sua `applied`), li specchia se serve, poi applica la mossa finale della sagoma e toglie le
  sagome. Con l'annullo unico le sagome (un passo in `st.steps`) si annullano con tutto il resto e i duplicati nascono
  nello stesso script → **un Ctrl+Z toglie disposizione, rotolo, crocini e copie**. Risposta: `{ok, undo, copies, copyErrors?}`.
- **Annulla** (`corvoRevert`): toglie solo le sagome (`corvo_m3_clear`): non esiste nessun duplicato da cancellare.
- **Specchiata**: riflessione rispetto alla verticale `x = axis` (asse = centro dell'ingombro del poligono del pezzo,
  `piece.ref.x`), poi mossa rigida. Pannello: `mirrorPolygon` = `x -> -x` sul poligono relativo a `ref` con ordine
  invertito (esatto in f32); host: `app.getScaleMatrix(-100, 100)` + traslazione `2·axis − 2·o.x` (sonda `st.probe`),
  `transform(..., DOCUMENTORIGIN)`. Sparrow non puo' specchiare (Sparrow #157): la specchiata e' un item separato e non
  viene mai "simulata" con una rotazione.
- Semantica: `copie = n` → n esemplari del design; `S+D` → anche n copie specchiate (2n pezzi in tutto).

### Contratto host (aggiunte, firme esistenti invariate)
- `corvoM3Ghosts({base, copies:[{src, mirror, axis, ring:[[x,y]..]}]})` — dopo `corvoGroup`, prima del primo
  `corvoApply`; `base` deve essere il numero di pezzi. Ritorna `{ok, base, n}`. Conta un passo di annullamento.
- `corvoM3SelSig()` — `{sig}`: firma veloce della selezione (tipo + `geometricBounds` di ogni oggetto, nessuna lettura
  di punti). "Leggi selezione" esporta una volta; Nest riusa quell'esportazione UNA volta se la firma non e' cambiata
  (sui file densi `corvoExport` costa minuti).
- `corvoGroup`/`corvoRevert` chiamano `corvo_m3_clear`; `corvo_singleUndo` aspetta anche che le sagome siano sparite,
  rimette solo i `base` pezzi e poi `corvo_m3_materialize`.

### Pannello
- Sezione "Copie e coppie specchiate": **Leggi selezione** (esporta + raggruppa col modulo 1, nessuna sessione),
  tabella pezzo / ingombro mm / copie (1..999) / S+D, campo "Tutti" + OK, casella "Tieni vicine le copie dello stesso
  design" (`localStorage corvo.m3close`). Valori ricordati per nome + ingombro del pezzo; la tabella si riempie anche a
  ogni Nest. Riga di stato: "N copie aggiunte (M specchiate): sagome fino ad Applica", dopo Applica "N copie create".
- `quantity.expand` crea anche gli **oggetti virtuali** (anelli specchiati se serve, `rg`, `box`, livelli) → il modulo 2
  riempie i fori delle copie e il modulo 5 conta le copie nel report/CSV.
- `quantity.buildNest`: pezzi con poligono identico → **un item Sparrow con `demand`** (misurato: 205 pezzi = 5 item,
  prima disposizione in 0,28–0,45 s contro 1,9–2,5 s con un item per copia, stessa lunghezza finale).
  `expandPlacements` assegna i posizionamenti ripetuti alle copie in ordine (sono intercambiabili).

### "Tieni vicine" — misurato e scelto
- Il post-processo "scambia le copie" proposto nei FINDINGS non serve: copie identiche scambiate danno lo stesso disegno.
- Scelto: **celle rigide** pre-calcolate: coppia (S+D per le coppie specchiate, altrimenti copia+copia con rotazione
  relativa 0/180 se ammessa), poi coppia di coppie (4). Posizione relativa: vertici, punti medi e punti di allineamento
  degli ingombri sul no-fit polygon (Minkowski di clipper, forma semplificata per eccesso, distanza >= gap),
  scelta quella col minimo inviluppo convesso e verificata esattamente. Contorno = chiusura della coppia, semplificato
  per eccesso (contiene i pezzi). Una cella si accetta solo se occupa <= 3 % di area in piu' dei pezzi (cresciuti di
  gap/2) E il suo inviluppo <= 3 % in piu' degli inviluppi dei membri; mai con un solo design (ogni vicino e' gia' una
  copia) e mai se non entra nel rotolo.
- Numeri (test_quantity, 6 s, seme 7, gap 2 mm): prima versione senza il criterio dell'inviluppo +4…+14 % di lunghezza
  (cerchi e fari rigidi in coppia) → scartata. Con i criteri: 4 design/27 pezzi +0,4 % (vicino piu' prossimo dello
  stesso design 22 → 37 %), 5 design/40 pezzi +0,2 % (30 → 28 %), 3 adesivi x10 +0,8 % (53 → 70 %),
  205 pezzi +0,0 %. Costo sempre <= 3 %, beneficio modesto: e' un'opzione, spenta di default.

### Numeri (Node, `node plugin/tools/test_quantity.js 6`)
- Specchio: faro destro reale specchiato vs file sinistro reale: differenza simmetrica 0,012 % dell'area (lo scarto e'
  il taglio 4e-5 del file). Host con DOM finto: copia = originale mosso, specchiata = riflessione + mossa (errore 0).
- Lunghezza vs step-and-repeat dei rettangoli (stesso margine di bordo di Sparrow): Avery 2" x20 214 vs 215 mm;
  adesivi Wikipedia20 x20 59 vs 65 (−9,7 %); etichette tonde x12 303 vs 338 (−10,4 %); fari S+D x6 57 vs 74 (−23,9 %);
  fiamme hot-rod S+D x2 112 vs 143 (−22 %). O x3 + 12 pallini con fori: tutti i pallini nei fori, anche delle copie.

### Da verificare in Illustrator (non ancora fatto)
`transform()` con `getScaleMatrix(-100,100)` (specchiata esatta, spessore traccia invariato: usa lo stesso
`changeLineWidths` = 1 delle rotazioni), `duplicate(x, PLACEBEFORE)` su gruppi con maschera / testo / immagini collegate,
un solo Ctrl+Z dopo Applica con copie, tempo di Applica con 200 copie di un gruppo pesante, sagome tratteggiate visibili.

### Limiti noti
- Il testo vivo in una copia specchiata esce specchiato (come in Illustrator "Rifletti"): per decal S/D con scritte
  serve una versione del testo per lato.
- Le celle sono rigide e il beneficio di vicinanza e' modesto; nessuna penalita' di distanza dentro Sparrow.
- I pezzi identici selezionati come oggetti distinti (un foglio gia' ripetuto) non sono riconosciuti come stesso design.

## Orchestratore multi-job (moduli 4 + 7, 2026-09-24)

Astrazione comune: piu' nest Sparrow **in sequenza**, ciascuno su un sottoinsieme dei pezzi e nel suo contenitore
(un rotolo per colore/livello = modulo 4, un foglio per nest = modulo 7). File nuovi, puri, testati in Node:
`client/js/multinest.js` (`window.CorvoMultinest`), `client/js/colorgroups.js` (`CorvoColorGroups`),
`client/js/sheets.js` (`CorvoSheets`), lato host `host/multinest.jsx` (caricato da `corvo.jsx` come `regmarks.jsx`).
Agganci marcati `// MODULO 4` / `// MODULO 7` / `MODULO 4/7` in `main.js`, `index.html`, `corvo.jsx`, `report.js`,
`report-panel.js`, `panel.css`.

- `subsetInstance(units, H, orientFor)`: istanza Sparrow con id 0..m-1 e `allowed_orientations` PER PEZZO (venatura);
  `mapPlacements(rep, units)` riporta le posizioni sugli id delle unita' (= `S.nestPieces`, figli nei fori esclusi),
  cosi' `holes.movesFor` / `placementToMove` / `expandPlacements` funzionano senza modifiche (anche su sottoinsiemi).
- `runJobs(jobs, runNest, hooks)`: `runNest(instance, secs, onReport) -> Promise<miglior report>`. Nel pannello
  (`mnRunner`) un solo worker riusato per tutta la sequenza; Stop = "chiudi in fretta" (`mnHurry`): il nest corrente
  termina col migliore trovato (worker terminato e ricreato), i successivi hanno 1 s, niente riempimento/verifica finale.
  Applica e' disabilitato finche' la sequenza non finisce; Annulla funziona sempre (`corvoRevert` toglie anche i contenitori).
- Live: `S.mn.fixed` = mosse dei job/fogli gia' chiusi + mosse del report corrente (`mnMoves`); i pezzi non ancora
  disposti restano dove sono. Contenitori: `corvoContainers({list:[{ox,oy,w,h,label}]})` ridisegna TUTTI i rettangoli
  arancioni + etichette (gruppo `Corvo_Containers` sul livello `Corvo`), solo quando il payload cambia. Nessun `corvoRoll`.
- Annullo unico (merge col modulo 1): `corvoContainers` conta un passo (`st.steps`) e salva `st.mnPayload`;
  `corvo_singleUndo` aspetta che anche `Corvo_Containers` sia sparito e lo ridisegna confermato
  (`Corvo_Containers_rif`, etichette comprese, restano come riferimento di produzione); senza annullo unico
  `corvoFinish` lo rinomina `_rif` (o lo toglie con `keepRoll:false`).
- Crocini (modulo 6): con piu' contenitori non vengono disegnati (nota `mnNoRegmarks`). Fori (modulo 2): pre-pass
  PER GRUPPO (un pezzo rosso non finisce nel foro di una lettera blu); nei fogli vale sul gruppo intero.
- Report (modulo 5): a fine sequenza `CorvoReportPanel.multi(list)` = un `computeReport` per colore/foglio
  (`color` = etichetta) + `R.combineReports` (TOTALE: lunghezze, aree, costi sommati, riempimento ricalcolato).
  Il pannello mostra il totale e una riga per gruppo; CSV `R.toCSVMulti`: blocco 1 = una riga per gruppo (colonna
  `colore_vinile`) + riga `TOTALE`, blocco 2 = pezzi con la colonna iniziale `gruppo`; "Copia riepilogo" = `toTextMulti`.
  Fogli: materiale = foglio intero (`materialWidthPt` = altezza foglio, `materialLengthPt` = lunghezza foglio).

## Modulo 4 — Nesting per colore / livello + preset (2026-09-24)

UI: **Nest per** = Tutto insieme | Colore di riempimento | Livello; **Tolleranza colore** ΔE (default 8, solo per
colore). Con "Colore" `corvoExport` riceve `paint:true` e aggiunge a ogni oggetto
`paint: [{c: colore, a: area pt²}]` (`corvo_m4_paint` in `host/multinest.jsx`): riempimenti dei tracciati visibili
(guide, figli nascosti e maschere esclusi; tinte con nome di taglio — CutContour… — escluse), colori di traccia solo se
l'oggetto non ha nessun riempimento (disegni al tratto). Colore = `{t:'spot',name,tint,base}` | `rgb` | `cmyk` | `gray` | `lab`.

`colorgroups.js`:
- colore dell'oggetto = quello con l'area maggiore (`itemColor`; se un secondo colore copre ≥ 10 % → "misto", nota `mnMixed`);
- **tinte piatte per NOME** (maiuscole/spazi ignorati, tinta % ignorata: un vinile per tinta); **quadricromia/RGB**
  raggruppate con ΔE76 ≤ tolleranza (sRGB→Lab D65, CMYK ingenuo) attorno al colore di area maggiore; senza colore →
  gruppo "senza colore" in fondo. Per livello: nome del livello dell'oggetto.
- `planGroups(items, {by, tol}, planOpts, cluster)` esegue `cluster.planPieces` **separatamente per gruppo** e concatena
  i pezzi (`i` rinumerato = indice di `corvoGroup`): l'unione degli oggetti sovrapposti del modulo 1 non incolla mai due
  colori (una bandiera fatta di rettangoli sovrapposti resta un pezzo per colore).

Rotoli: stessa larghezza, impilati VERSO IL BASSO sotto la tavola (primo a 20 mm, distanza tra rotoli
max(20 mm, 2,5 × corpo etichetta)); etichetta `Corvo — <colore> — L mm` (colore = nome tinta, `C.. M.. Y.. K..` o
`#RRGGBB`; per livello il nome del livello). Tempo: il campo Tempo e' diviso tra i gruppi in proporzione all'area,
minimo 3 s per gruppo. La vista live mostra il gruppo corrente ("Gruppo k/n: <colore>").

**Preset con nome** (`MN.Presets`, `localStorage corvo.presets`): larghezza rotolo, distanza, rotazioni, tempo,
raggruppamento + tolleranza, materiale rotolo/fogli (foglio, lunghezza/larghezza, margine, venatura) e il materiale del
modulo 5 (`CorvoReportPanel.material()`). Salva (nome dal campo di testo accanto: `window.prompt` non e' affidabile in CEP; vuoto = preset scelto o data), scegli dal menu = carica, Elimina, Esporta/Importa
JSON `{"corvoPresets":1,"presets":{nome: preset}}` (dialoghi CEP `showSaveDialogEx`/`showOpenDialogEx`, nel browser
download / `<input type=file>`). Campi sconosciuti scartati, numeri limitati ai range dei campi. Le impostazioni correnti
restano anche in `corvo.mn.opts`.

Numeri (`test_multinest.js`, 4 s per gruppo, rotolo 1000 mm per le bandiere, 600 mm per l'alfabeto a 1400 mm di
larghezza, distanza 2 mm, 0/90/180/270):

| File | Gruppi | Lunghezza per colore (mm) | Totale |
|---|---|---|---|
| flag_italy | 3 | verde 304 · bianco 304 · rosso 154 | 763 |
| flag_jamaica | 2 (+1 pezzo degenere: il tracciato a farfalla nera ha area netta 0, resta fermo) | verde 229 | 229 |
| flag_south_africa | 5 | bianco 230 · rosso 154 · blu 154 · nero 230 · verde 157 | 926 |
| flag_brazil (i `<use>` non letti dal parser di test) | 4 | verde 312 · giallo 237 · bianco 191 · blu 158 | 898 |
| alfabeto colorato, per colore | 6 | #00FF00 1069 · #FF0000 1145 · #00FFFF 314 · #FFFF00 211 · #FF00FF 1074 · #0080FF 304 | 4118 |
| alfabeto colorato, per livello | 6 | stessi gruppi (layer0..5 = un colore ciascuno) | 4118 |

I tre gruppi da ~1,1 m dell'alfabeto sono UN tracciato composto con piu' lettere (come nel file): un pezzo solo.
Limite geometria (non del modulo): la Y bianca del Sudafrica e' un tracciato unico che tocca se stesso; `geometry.js` ne
prende un solo lobo come sagoma, quindi il disegno puo' uscire dalla sagoma (il test lo segnala come NOTE).

## Modulo 5 — Report materiale e costo (2026-09-24)

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
- `combine(reports)`: riga TOTALE per il multicolore del modulo 4 (somme, riempimento ricalcolato);
  `combineReports` / `toCSVMulti` / `toTextMulti` (moduli 4+7, vedi "Orchestratore multi-job").

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
`livello` = livelli del pezzo raggruppato del modulo 1 (`layers` uniti con " + "), o `item.layer`; vuoto senza modulo 1.
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
- `corvoRegmarksFinish()` — rinomina in `Corvo_Regmarks_rif` / `Corvo_FineCut_Area_rif`, cosi' una sessione
  successiva non li sostituisce. Dal merge lo fa `corvoFinish` (stesso passo di annullamento); resta per compatibilita'.
- Con una sessione Corvo aperta, `corvoRegmarks`/`corvoRegmarksClear` contano un passo in `st.steps` e memorizzano
  l'ultimo payload in `st.rmPayload` (ridisegnato confermato da `corvo_singleUndo`, vedi "Integrazione dei moduli").

### Flusso pannello

Menu "Crocini" (Nessuno, Graphtec, Summa, Roland, Mimaki; ricordato in `localStorage`). Durante la ricerca il rotolo
arancione e' gia' quello intero (margini di testa/coda compresi). A fine ricerca (Stop o fine tempo) i crocini vengono
disegnati come anteprima e gli avvisi compaiono nella riga di stato; Applica li ridisegna sul layout finale e
`corvoFinish` li conferma chiudendo la sessione (un solo Ctrl+Z); Annulla (o chiusura del pannello) chiama `corvoRegmarksClear()` prima di `corvoRevert()`.
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

## Modulo 7 — Multi-foglio laser / fresa (2026-09-24)

UI: **Materiale** = Rotolo | Fogli; con Fogli: **Foglio** 600 × 400, 1000 × 600, 1220 × 2440, Personalizzato
(lunghezza/larghezza), **Margine foglio** (mm, default 10: morsetti/bordo, SEPARATO dalla Distanza = separazione minima
di Sparrow tra i pezzi) e **Venatura** (solo 0/180° per tutti i pezzi). Venatura per pezzo: nome del pezzo o livello che
contiene `grain`/`venatura`/`vena`/`fibra`. Il lato lungo del foglio va lungo x (la venatura di un pannello 1220 × 2440
corre sui 2440). Il campo Larghezza rotolo e' nascosto; il nest usa l'altezza utile del foglio.

Sparrow fa solo strip packing (`spp`): `sheets.planSheets` e' un greedy sopra (dettagli nel commento del file):
0. foglio utile = foglio − 2 × margine; un pezzo che non entra nel foglio utile in nessuna rotazione ammessa →
   errore chiaro PRIMA del nest (`mnTooBig`: dimensioni utili e nomi dei pezzi); margine ≥ meta' foglio → `mnBadSheet`.
1. pezzi rimasti ordinati per area decrescente, nest su striscia alta quanto il foglio utile per `splitSecs`
   (10 % del Tempo, 1-5 s); taglio alla lunghezza utile: i pezzi interamente dentro vanno al foglio k.
2. riempimento: i pezzi rimasti fuori riprovati sul foglio k a lotti stimati dall'area libera (92 % utile), lotto
   dimezzato se non entra, un pezzo singolo che non entra scarta anche quelli piu' grandi; max 4 nest.
3. il resto passa al foglio k+1.
3b. **minimo numero di fogli**: finche' i fogli superano il limite inferiore ceil(area pezzi / area UTILE), i pezzi
   dell'ultimo foglio vengono spostati nei fogli precedenti con piu' spazio (stessa logica a lotti, max 8 nest); se
   l'ultimo si svuota viene eliminato.
4. verifica finale: ogni foglio rinestato da solo col Tempo intero; il nuovo layout si tiene solo se sta nel foglio
   (quello del greedy e' gia' valido: nessun pezzo viene mai perso). L'ultimo foglio riporta la lunghezza usata
   (avanzo riutilizzabile) nell'etichetta: `Corvo — [gruppo — ]Foglio k — 600 × 400 mm — usati L mm`.
Fogli nel documento: in fila verso destra sotto la tavola, una riga per gruppo se e' attivo anche il modulo 4
(es. un livello per materiale). Posizioni nel sistema del foglio utile: origine = angolo del foglio + (margine, margine).
Sparrow tiene meta' distanza anche verso il bordo: distanza misurata dal margine 2,1-2,2 mm con distanza 2 mm.

**Futuro**: jagua-rs 0.8.3 ha la feature `bpp` (bin packing: `Bin{container, stock, cost}`) ma sparrow implementa solo
`spp`: un vero solutore bin-packing in Rust (o sparrow esteso a `bpp`) sostituirebbe il greedy e i suoi nest ripetuti.

Numeri (`test_multinest.js`, split 1,5 s, verifica 4 s, distanza 2 mm, margine 10 mm, 0/90/180/270; limite inferiore
= area foglio / area utile):

| File (pezzi) | Foglio | Fogli | Limite inf. | Riempimento per foglio (area foglio) | Ultimo foglio usato |
|---|---|---|---|---|---|
| ClosedBox (7) | 600 × 400 | 1 | 1 / 1 | 24 % | 205 mm |
| ClosedBox | 1220 × 2440 | 1 | 1 / 1 | 2 % | 103 mm |
| DividerTray (17 pezzi, 45 tracciati) | 600 × 400 | 1 | 1 / 1 | 58 % | 457 mm |
| DividerTray | 1220 × 2440 | 1 | 1 / 1 | 5 % | 153 mm |
| AgricolaInsert (101 pezzi, 195 tracciati) | 600 × 400 | 2 | 1 / 2 | 68 / 30 % | 284 mm |
| AgricolaInsert | 1220 × 2440 | 1 | 1 / 1 | 8 % | 264 mm |
| AgricolaInsert | 400 × 300 (pers.) | 3 (4 prima del passo 3b) | 2 / 3 | 70 / 66 / 60 % | 366 mm |
| DividerTray, venatura globale | 600 × 400 | 1 | 1 / 1 | 58 % (rotazioni usate 0, 180) | 502 mm |
| AgricolaInsert, venatura per pezzo (p-1..p-59) | 600 × 400 | 2 | 1 / 2 | 69 / 29 % | 261 mm |

Una esecuzione (il motore e' a tempo: riempimenti ±3 punti tra esecuzioni, numero di fogli stabile). Sempre al
limite inferiore sull'area utile. Ogni foglio: nessuna sovrapposizione (intersezione clipper delle sagome),
tutto dentro i margini, ogni pezzo in un solo foglio, pezzi con venatura solo a 0/180. DividerTray su 120 × 90 →
`tooBig` per 17 pezzi senza avviare il motore.

### Test (moduli 4 + 7)

- `node plugin/tools/test_multinest.js [sGruppo=4] [split=1.5] [finale=4] [realDir]` (SEED=n): unit (colori, ΔE,
  gruppi spot/processo/nessuno, preset salva/carica/JSON/import errato, fogli, venatura, fitsRect) + i casi sopra
  su `bench/real/color` e `bench/real/laser` (sola lettura; senza `bench/real` nel worktree usa `..\Plugin\bench\real`).
  Parser SVG di test in `tools/svgparse.js` (path/rect/circle/polygon, trasformazioni, fill/stroke ereditati; `<use>`
  ignorati). ~4 min.
- `node plugin/tools/test_multinest_panel.js [s=6]`: gli script VERI del pannello (ordine di `index.html`) in Node con
  DOM finto, CSInterface finto che risponde come `corvo.jsx`/`multinest.jsx`, motore inline (niente Worker in Node):
  alfabeto per colore (6 rotoli impilati con etichette, ogni pezzo spostato una volta e dentro il SUO rotolo, report
  6 gruppi + TOTALE, CSV multi, Applica → `corvoFinish`), AgricolaInsert su 600 × 400 (fogli in fila, pezzi dentro
  l'area utile, Annulla → `corvoRevert`), Stop durante la sequenza (chiusura rapida, tutti i pezzi disposti),
  preset salva/carica/esporta. 38/38.

### Da verificare in Illustrator (passo VERIFICA)

1. `corvoExport({paint:true})`: `paint` su file reali (tinte piatte con tinta %, CMYK globali, gruppi con maschera,
   testo, raster) e tempo aggiunto sui file densi (2 letture DOM per tracciato).
2. `corvoContainers`: rettangoli + etichette `Corvo — colore — L mm` impilati sotto la tavola, aggiornati live senza
   sfarfallio; dopo Applica un solo Ctrl+Z toglie disposizione + contenitori (`Corvo_Containers_rif` ridisegnato
   da `corvo_singleUndo`); Annulla toglie tutto; `corvoFinish({keepRoll:false})`.
3. Stop durante la sequenza (worker terminato e ricreato), Applica disabilitato fino alla fine, chiusura del pannello.
4. Fogli: pezzi dentro il margine su file laser reali, venatura, errore pezzo troppo grande, riga per gruppo con
   "Nest per livello" + Fogli.
5. Preset: campo nome, menu, dialoghi CEP di esporta/importa (`showSaveDialogEx` / `showOpenDialogEx`).
6. Regressione `insegna48.svg` / `lettering.svg` con "Tutto insieme" + Rotolo (percorso a nest singolo invariato).

## Modulo 8 — DTF gang sheet: raster con contorno (2026-09-24)

Obiettivo: immagini trasparenti (PNG per DTF) nestate per la loro **silhouette reale** invece che per il rettangolo,
con l'immagine che si muove col suo contorno. Tutte le aggiunte sono marcate `MODULO 8`.

**Host (`host/corvo.jsx`, blocco `corvo_m8_*`).** `corvoExport({flatness, raster:true})`: un `PlacedItem` o `RasterItem`
di primo livello diventa un pezzo con `rings: []` e
`raster: {path, temp, kind:'linked'|'render', corners:{tl,tr,bl}}`, dove `corners` sono le coordinate documento dei
vertici pixel (0,0), (W,0), (0,H) (y pixel in basso), piu' `name`, `layer`, `bounds` e `box` (= `visibleBounds`) come gli
altri oggetti del modulo 1 (anche il controllo nascosti/bloccati vale). Senza `raster:true` l'immagine resta un rettangolo
`other` (modulo 1).
- `linked`: PNG collegato, esistente, matrice senza rotazione/inclinazione (anche specchiato) → file originale a piena
  risoluzione, corners dai `geometricBounds` scambiati secondo gli specchi (`mValueA < 0` = orizzontale,
  `mValueD·CORVO_M8_PLACED_DSIGN < 0` = verticale). `CORVO_M8_PLACED_DSIGN = -1`, verificato in Illustrator 30.5.1:
  un PNG dritto ha `mValueD < 0`.
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

**Limiti.** (Segno di `mValueD` verificato il 24/09: prima era +1, i PNG dritti passavano dal render, ~2,7 s l'uno, e
quelli specchiati in verticale avevano il contorno capovolto.) Render
= documento temporaneo che compare un istante; solo immagini di primo livello (dentro un gruppo → rettangolo d'ingombro
del modulo 1, dentro una maschera conta il tracciato di maschera); l'opacità dell'oggetto riduce l'alfa (sotto il 10 %
sparisce); i fori del contorno ricevono pezzi piccoli (modulo 2); il testo in più parti passa per la chiusura morfologica
di geometry. Il pannello chiede sempre `raster:true`: anche le immagini di un foglio print&cut (es. i 3 raster di
test_modulo1) vengono tracciate (render temporaneo se non sono PNG collegati) — da misurare il tempo in Illustrator.
PNG temporanei rimasti in `%TEMP%\corvo_m8_*.png` se l'export fallisce a metà.

## Modulo 9 — Qualità commerciale (licenza, prova, firma ZXP, installer) — 2026-09-24

Procedure operative (emettere una licenza, build, firma, installazione): **`docs/release.md`**.

### Licenza offline (`client/js/license.js`)
- Stesso schema di CamForge (studiato, nessun codice o chiave copiati) ma con una **coppia di chiavi nuova**: ECDSA P-256 /
  SHA-256, firma IEEE P1363 (64 byte). Token `CV1-<payload base64url>.<firma base64url>`, payload
  `{v:1, p:'corvo', id, ed:'standard'|'pro', iat:'YYYY-MM-DD', n?:nome, eh?:hash email, exp?:'YYYY-MM-DD', m?:id macchina}`.
  L'email non entra nel token: `eh` = primi 16 hex di SHA-256(email minuscola).
- Nel pannello c'è solo la chiave **pubblica** (`PUBLIC_JWK` + `PUBLIC_PEM`). Verifica con WebCrypto (`crypto.subtle`, provato in
  Edge headless con la chiave vera) e ripiego sul `crypto` di Node (`crypto.verify` con `dsaEncoding:'ieee-p1363'`).
- La privata è **fuori dal repo**: `%USERPROFILE%\.config\corvo\license-private.jwk` (o `$CORVO_LICENSE_KEY`).
- Legame alla macchina **spento per default** (`--machine` in license-gen): ID = 16 hex da SHA-256(hostname + modello CPU),
  mostrato nella finestra Licenza con "Copia".
- Errori: `format`, `signature`, `product`, `edition`, `expired`, `machine` (messaggi IT/EN nella finestra).

### Prova e dopo la prova
- **14 giorni** dal primo avvio con tutte le funzioni Pro. Stato in `localStorage['corvo.m9']` **e** in
  `%APPDATA%\Corvo\license.json` (Node fs; fuori dalla cartella dell'estensione, così non rompe la firma): vale l'inizio
  più vecchio dei due (reinstallare non azzera), `lastSeen` = orologio più avanti visto (riportare indietro la data non allunga
  la prova), inizio nel futuro = manomesso = finita. Anche la chiave attivata sta in entrambi.
- **Prova finita senza licenza ("free")**: il nest funziona tutto (anteprima live, Stop, Annulla), **Applica solo fino a 10 pezzi**
  (`LIMITS.freeApplyMax`); oltre, Applica mostra il messaggio e apre la finestra Licenza. Scelto al posto della filigrana:
  non mette oggetti estranei nel file (finirebbero al plotter) e lascia il prodotto utile per lavori piccoli.
  Funzioni come Standard (niente Pro).

### Gating delle edizioni — UNA tabella (`FEATURES` in license.js)
| Chiave | Modulo | Edizione minima |
|---|---|---|
| `holes` | 2 — pezzi dentro i fori | Pro |
| `colorNest` | 4 — nesting per colore/livello | Pro |
| `costCsv` | 5 — export CSV del report costi | Pro |
| `multiSheet` | 7 — multi-foglio | Pro |

Ranghi: free 1, standard 1, pro 2, trial 2. Una funzione non in tabella è libera. API per i moduli:
`CorvoLicense.has(chiave)`, `CorvoLicense.canApply(nPezzi)`, `proFeatureMsg(chiave)`, `openDialog()`.
Se `license.js` non è caricato gli agganci lasciano tutto libero (i test Node dei moduli restano invariati).

### Agganci (`// MODULO 9`)
- `main.js`: `LIC`/`m9has`; checkbox "Usa i fori" disabilitata e ignorata senza Pro (`setState`, `readParams`);
  `S.m9Count = pieces.length` al nest; in `apply()` controllo `LIC.canApply(S.m9Count)` prima di qualsiasi azione.
- `report-panel.js`: `exportCsv()` → `has('costCsv')` (il riepilogo "Copia" resta libero).
- **Moduli 4 e 7** (non ancora in questo ramo): chiamare `CorvoLicense.has('colorNest')` / `has('multiSheet')` all'avvio del
  nest e mostrare `proFeatureMsg`. Le chiavi sono già in tabella.
- `index.html`: `css/license.css`, `js/license.js` prima di `main.js`, versione nel piede (`#corvoVersion`). license.js aggiunge
  da sé il badge (Prova · N gg / Prova finita / Standard / Pro) e la finestra.

### Versione
`0.9.0-beta`. Nel manifest è `0.9.0.beta` (bundle ed estensione): lo schema CEP accetta solo `major.minor.micro.qualificatore`
(pattern `\d{1,9}(\.\d{1,9}(\.\d{1,9}(\.(\w|_|-)+)?)?)?` nell'XSD di CEP-Resources), il trattino dopo il micro non passa.
`build-zxp.ps1` legge il manifest, lo converte in `0.9.0-beta` e si ferma se non coincide con `VERSION` di license.js;
test_license controlla anche il piede.

### Firma ZXP e installer (`tools/release/`)
- `build-zxp.ps1`: staging di `CSXS`, `client`, `host` (niente `.debug`, `tools/`, test, mappe, `.DS_Store`/`__MACOSX`, niente
  junction: `robocopy /XJ` + controllo dei reparse point), firma con **ZXPSignCmd 4.1.3 x64** + marca temporale
  `http://timestamp.digicert.com`, `-verify -certInfo` → `dist/Corvo-0.9.0-beta.zxp` (+ `.sha256`, `dist/Corvo-0.9.0-beta-win/`
  con zxp + install/uninstall, e il suo `.zip`). `dist/` è gitignored.
- `install.ps1` / `install.cmd` (doppio clic, niente amministratore): controlla che lo zxp sia Corvo e firmato
  (`META-INF/signatures.xml`), estrae con .NET in una cartella accanto e poi scambia (niente installazione a metà);
  **se al posto dell'estensione c'è la junction di sviluppo si ferma (codice 2) con le istruzioni** (`cmd /c rmdir`), una
  cartella non-Corvo non la tocca. `-Target` per installare altrove (test). `uninstall.ps1`/`.cmd`: stesse protezioni;
  licenza e prova restano in `%APPDATA%\Corvo`.
- Niente file aggiunti dentro la cartella installata (romperebbero la verifica della firma di CEP).

### Test
| Test | Cosa | Esito |
|---|---|---|
| `node plugin/tools/test_license.js` | chiavi di test al volo: Pro/Standard valide (WebCrypto e Node), manomissioni (standard→pro, firma, payload, altra chiave), formato, edizione/prodotto sbagliati, scadenza, macchina, prova 13/14 giorni, limite 10/11 pezzi, reinstallazione, file cancellato, orologio indietro, versione manifest/piede, agganci; giro completo con la chiave vera se presente | 63/63 |
| `plugin/tools/release/test-install.ps1` | install/aggiorna/disinstalla in `%TEMP%`, firma verificata sulla cartella installata, junction rifiutata e intatta, cartella estranea, zxp non firmato; la junction vera di CEP non cambia | 21/21 |
| Edge headless (`--dump-dom`) | pannello vero: badge "Trial · 14 d left" e finestra; prova scaduta → fori disabilitati, 10 sì/11 no; attivazione di una Standard firmata con la chiave vera via WebCrypto | ok |

### Limiti noti
- **Non provato in Illustrator** (niente Illustrator in questo giro): caricamento dello ZXP firmato **senza** PlayerDebugMode,
  `crypto.subtle` nel CEF di CEP 11 (c'è comunque il ripiego Node), finestra nel pannello stretto. Sulla macchina di sviluppo
  PlayerDebugMode=1 resta attivo: per provare davvero la firma serve un utente/PC senza.
- Certificato **autofirmato**: CEP lo accetta, ma non identifica un editore; per la vendita valutare un certificato di firma
  vero. Il problema noto di Adobe (ZXPSignCMD/KnownIssue2024: pannelli vuoti) riguarda i link simbolici installati via UPIA:
  il pacchetto non ne ha e l'installer non usa UPIA.
- La protezione della prova è "non banale", non inviolabile (cancellare entrambi i posti la azzera; il JS è leggibile).
- Il limite di 10 pezzi conta i pezzi del piano (figli nei fori compresi), non gli oggetti originali di Illustrator.

## Casi reali (2026-09-24, `docs/casi-reali.md`)

- Host: `corvoExport` esporta i tracciati aperti con estremi distinti (anche i sottotracciati dei composti) in
  `item.opens: [{pts, g, cut, n}]` invece di chiuderli con la corda; l'ingombro `box` viene dai punti letti
  (`geometricBounds` solo per i tracciati senza anello: su SVG di Inkscape è sbagliato fino a 170 mm).
  Nuovo `corvoDxfUnits()` → `{dxf, insunits, measurement, extmin, extmax}` dall'header del .dxf del documento attivo.
- Pannello: `cluster.joinOpen(items, tol=0.25, closeTol=2.8)` all'inizio di `planPieces`: contorni chiusi dai segmenti
  (DXF), oggetti di un contorno legati in un pezzo, anelli uniti `rg >= 900000` = una forma pari-dispari per pezzo;
  linee non concatenabili dentro un oggetto con forma → anello sottile 0,25 pt; altrimenti regola v0.1 (corda se ≥ 3 punti).
  Cornice del foglio (`findFrames`) solo se rettangolare (area ≥ 85 % del riquadro). Nota `noteJoined`, `compoundNote`, `dxf*`.
- `geometry.buildPiece`: P1 `ringArea` (Clipper), P2 `densePoints` 5000 / `maxParts` 16, P3 `simplify` gonfia t/2 e
  DP t/2, P4 `buildPieces` senza `maxVertices` usa `vertexCap(N) = clamp(6000/N, 32, 200)`.
- `guardInstance` non modifica più l'istanza: il wasm (`wasm/src/lib.rs`) parte da una striscia larga almeno
  diametro massimo + 2 gap + 1 (niente panic "empty polygon" né "could not construct an initial placement").
