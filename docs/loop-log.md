# Loop log Corvo

## 2026-09-23 — base
v0.1 verificata in Illustrator 30.5.1: nesting live, Stop/Applica/Annulla, insegna48 30 s -> 1646 mm.
Prossimo modulo: 1 (fedelta' al file).

## 2026-09-23/24 — Modulo 1 Fedeltà al file
Verifica in Illustrator 2026 dal pannello Corvo (CDP 8093), rotolo 600 mm, distanza 3 mm, rotazioni 90°, seme fisso 7.
Harness di verifica nello scratchpad (apre i file con `DONTDISPLAYALERTS`, Seleziona tutto come Ctrl+A, misura
scarto rigido dei membri, livelli, tinte, ordine, struttura interna, annulla/ripristina); regressioni nei test del repo.

**File reali usati** (bench/real, non committati): printcut/kiss-cut-sticker-template.ai e die-cut-sticker-template.ai
(Sticker Mule, adesivo replicato 6 volte: arte e taglio su livelli diversi, NON raggruppati), 11x8.5-sticker-sheet.ai
(livello "Cut line" BLOCCATO con il Through Cut Rectangle del foglio, 3 scenari), Wikipedia20_sticker_sheet_1.svg,
Wikimania2021_StickerSheet1.svg, Tempo-100 sticker/car PDF, kit/ 5 SVG (Korea Coast Guard, Openclipart CC0).

**Problemi utenti affrontati** (FINDINGS-modulo1): CutContour stampato invece che tagliato (avviso nuovo se il campione
di taglio è in quadricromia), stampa e taglio separati dal nesting (restano solidali, scarto ≤ 0,0015 pt), pezzi su più
livelli (ognuno resta sul suo livello), gruppi/maschere/tracciati composti intatti, crocini esclusi, foglio con
rettangolo di taglio (non incolla più tutti gli adesivi), livelli bloccati (errore chiaro, mai sbloccati).

| File / scenario | Pezzi | Lunghezza | Riemp. | Scarto membri | Livelli · tinte · ordine | Annulla/ripristina |
|---|---|---|---|---|---|---|
| kiss-cut ×6, "Solo taglio" e "Tutto" | 6 (4 oggetti ciascuno) | 221 mm | 54,7 % (prima mostrato 37,7 %) | 0,0010 pt | invariati (Instructions 18 bloccato, Cut line 12, Artwork 12) · 7 tinte, 12 tagli identici · ordine ok | Annulla 0,001 pt · **1 Ctrl+Z** (prima 5) |
| die-cut ×6 | 12 (6 adesivi + 6 etichette "EXAMPLE" fuori dal taglio → pezzi a sé, avvisati) | 99,7 mm taglio / 105,3 mm tutto | 37,9 % / 47,9 % (prima 12,2 %) | 0,0014 pt | invariati | 0 pt · 1 Ctrl+Z |
| 11x8.5 A: arte+kiss cut, cornice su livello bloccato | 8 | 63,2 mm | 52,8 % | 0,0016 pt | invariati, cornice ferma + nota | 0 pt |
| 11x8.5 B: kiss cut sul livello BLOCCATO | errore `errLockedCut` (nomina tinta e livello), nulla spostato, livello ancora bloccato | – | – | – | invariati | – |
| 11x8.5 C: livello sbloccato, tutto selezionato | 8 + cornice lasciata al suo posto (prima: 1 pezzo unico) | 63,2 mm | 52,8 % | 0,0016 pt | invariati | 0,001 pt |
| Wikipedia20 (B1) | **17** (prima 1: lo sfondo grande come la tavola incollava tutto) | 53,4 mm | 48,2 % | 0,0012 pt | struttura interna identica (1866 tracciati) | 0,001 pt |
| Wikimania2021 (B2) | 29 = 16 gruppi di oggetti sovrapposti (583 oggetti) + 13 lettere/decori sciolti; 4 puntini lasciati (prima: errore) | 53,3 mm | 47,2 % | 0,019 pt (0,007 mm) | invariati, 597 oggetti | 0,001 pt |
| Tempo-100 sticker PDF | errore testo vivo (45 cornici), in "Solo taglio" messaggio corretto (niente linea di taglio) | – | – | – | intatto | – |
| Tempo-100 car PDF senza testo | 8, 16 crocini esclusi (livello "cutting marks") | 386,6 mm | 75,3 % | 0,003 pt | invariati | 0,001 pt |
| kit: 5 SVG (strisce, fiamme, tribale) | 1 per file (gruppi/composti intatti, figli restano nel gruppo) | 68-289 mm | – | ≤ 0,0014 pt | invariati | ≤ 0,001 pt |
| E1 round-trip kiss-cut ×3 | AI ed EPS riaperti: 3 livelli, 7 tinte, 6 tagli (3 Kiss + 3 Through); PDF 1.4: Separation Kiss Cut + Through Cut; OCG solo da PDF 1.5 (3 livelli) | | | | | |
| Regressioni | test_cluster 74/74, test_modulo1 32/32, test_host ok, test_client ok; insegna48 30 s SEED=1: 1668,6 / 1670,3 / 1668,6 mm, SEED=2/3: 1689 / 1675 mm (v0.1: 1646 mm con seme casuale); lettering SEED=1 841,4 mm; nessuna sovrapposizione, distanza rispettata | | | | | |

**Bug corretti** (plugin/):
1. Cornice del foglio (Through Cut Rectangle sbloccato) o sfondo grande come la tavola → tutti gli adesivi in UN pezzo.
   Ora `findFrames` in cluster.js: resta al suo posto + nota "raggruppa (Ctrl+G) per spostare un foglio intero".
2. Linee di taglio su livello bloccato/nascosto: la stampa partiva senza il suo taglio. Host `lockedCuts` + errore
   chiaro; cornice bloccata attorno ai pezzi = solo nota. Corvo non sblocca mai.
3. Wikimania: pezzi con soli anelli degeneri bloccavano tutto ("no closed contour") → lasciati al posto con nota;
   poi il motore rifiutava id non consecutivi → rinumerati (`hostI` per corvoApply).
4. Riempimento sbagliato (pari-dispari su tutti gli anelli: la stampa fatta di forme sovrapposte si annullava):
   area per tracciato (`rg`), die-cut 12 % → 48 %.
5. E2: la ricerca dal vivo lasciava decine di passi di annullamento → `corvoFinish` riavvolge e rifà in un solo passo.
6. Messaggio testo vivo in "Solo taglio" suggeriva di scegliere "Solo taglio"; ora dice che manca la linea di taglio.
7. A5: avviso se un campione con nome di taglio è in quadricromia (non era implementato).
8. Seme del motore configurabile per i test (`window.CorvoSeed`, `SEED=n` in test_e2e).

**Aperti**: (a) lettura geometria lentissima con Illustrator in background (1-4 ms per lettura DOM: Wikipedia20 27 000
punti = 272 s, Wikimania 122 s) → esportazione in blocco da studiare; (b) E4 non confermato a ±0,5 %: con seme fisso
insegna48 è 1669-1689 mm contro 1646 mm di v0.1 (seme casuale, altro carico macchina: durante i test giravano 3 `find`
fuori controllo che occupavano ~3 core; i poligoni di insegna48 non cambiano con le modifiche di questo giro) →
rifare la base v0.1 con SEED fisso; (c) dopo Applica la disposizione sta sotto la tavola: il PDF salvato contiene solo
le tavole → serve una tavola sul rotolo (modulo 5/6); (d) lettere di un logo non raggruppate (Wikimania "WIKIMANIA")
diventano pezzi separati; (e) die-cut: l'etichetta "EXAMPLE" fuori dal taglio diventa un pezzo a sé (corretto ma da
spiegare); (f) template kit moto/auto veri ancora mancanti (solo a pagamento).

## 2026-09-24 — Merge moduli 2,5,6,8

Branch `modulo5-report`, `modulo6-crocini`, `modulo2-fori`, `modulo8-dtf` (nati da e4b3f8a) uniti in quest'ordine sopra il
modulo 1 (`--no-ff`, un commit di merge per modulo). Conflitti: `main.js`, `index.html`, `docs/plugin-architecture.md`
a ogni merge, `corvo.jsx` con il modulo 8 (export riscritto dal modulo 1). Tutte le funzioni tenute.

Adattamenti al modello del modulo 1 (dettagli in plugin-architecture.md, "Integrazione dei moduli"):
- 5: colonna `livello` dai `layers` del pezzo raggruppato, `hostI` per i pezzi rinumerati, lunghezza originale dai `box`;
  con i crocini costo e area sul rotolo intero + margini di testa/coda; righe anche per i pezzi nei fori.
- 6: fascia dei crocini dentro il rotolo del modulo 1; disegno/rimozione crocini contati nei passi di annullamento e
  ridisegnati confermati dentro `corvoFinish` → l'annullo unico (E2) vale anche con i crocini.
- 2: fori calcolati con i gruppi `rg` (la stampa sopra lo sfondo non apre un falso foro), indici `hostI`,
  `expandPlacements` per il report.
- 8: immagini di primo livello esportate col formato del modulo 1 (layer, box, nascosti/bloccati) e tracciate PRIMA di
  `planPieces` → diventano membri dei pezzi (si uniscono alla loro CutContour).

Test Node (SEED=7): test_client PASS, test_cluster 74/74, test_report PASS (+3 controlli nuovi), test_regmarks 333/333
(1 nest saltato come prima), test_holes PASS (+ blocco cluster: 6 pezzi nell'O, 0 sullo sfondo stampato), test_raster PASS,
nuovo test_combined 28/28 (46 pezzi: 28 lettere, 14 piccoli di cui 11 nei fori, adesivo stampa+taglio unito, crocino "Reg"
escluso, 3 PNG DTF; Graphtec: striscia 507,5 mm su 600, nessun pezzo nei rispetti; report 46 righe con livello).

Da verificare in Illustrator (non usato in questo giro): annullo unico con crocini (un Ctrl+Z dopo Applica deve togliere
anche i crocini, che poi devono restare `_rif` dopo Ctrl+Maiusc+Z); corvoExport con `raster:true` sui fogli print&cut
di test_modulo1 (render temporaneo dei raster, tempi); PNG collegati (segno `CORVO_M8_PLACED_DSIGN`); test_e2e insegna48/
lettering con fori ON e crocini; CSV con la colonna livello.

## 2026-09-24 — Verifica Illustrator moduli 2,5,6,8

Illustrator 2026 (30.5.1) dal pannello Corvo (CDP 8093, pannello e host ricaricati sul codice del merge), seme fisso.
Harness riusabile in `plugin/tools/ill/` (m2.js, m56.js, m8.js, undo6.js, lib.js): documenti aperti/creati via
ExtendScript e chiusi senza salvare; misure con clipper sugli oggetti reali dopo Applica; annullo con `app.undo()`.

| Modulo / file reale | Scenario | Esito | Numeri |
|---|---|---|---|
| 2 · BebasNeue_channel_letters_OARBDQ890 (9 lettere, tinta piatta "Rosso Vinile") + 18 piccoli CutContour (cerchi, quadrati, 3 rondelle) + Roundel_argent_ring (200 mm) + mdi_record-circle | rotolo 600, distanza 3 mm, 20 s, fori OFF/ON | 10/10 | 19 figli nei fori (Roundel 8, O 6, B 5), tutti interamente dentro il foro, distanza min dal genitore 3,31 mm (≥ 3), min tra pezzi 3,13-3,17 mm; lunghezza OFF 575,5 → ON 567-571 mm; tinte e livelli invariati sui 29 oggetti; mdi (anello+disco) resta 1 pezzo; 1 `app.undo()` 0,001 pt, redo 0 pt, Annulla 0,001 pt |
| 5 · kiss-cut-sticker-template.ai ×12 e ×30 (Cut line + Artwork) | report + CSV dal pulsante del pannello (dialogo di salvataggio sostituito da un percorso) | 11/11 | CSV = misura: lunghezza 330,3 mm = rettangolo del rotolo 330,30; area pezzi 145 176 mm² = unione delle regioni disegnate (0,00 %); area usata = L×W; riempimento 73,25 % = misurato; costo 2,48 € = m²×12,5; colonna livello "Cut line + Artwork" su tutte le 12 righe; x/y/l/a di ogni riga entro 0,36 mm dal pezzo misurato. ×30: 657,5 mm, 92,0 %, 30 righe |
| 6 · stesso foglio ×12, rotolo 600 | Graphtec / Summa / Roland / Mimaki, 10 s | 69/69 (+45/45 con ×30) | geometria misurata in Illustrator = specifica: L 10 mm + linea 0,5 (Graphtec, Mimaki), quadrati 3,000 mm (Summa), cerchi Ø 10,000 (Roland); bordo 30/20/10/10 mm, testa 15/10/20/20, coda 35/40/50/45 esatti al µm; K100 pieno; livello Regmarks stampabile, Mimaki su "Regmarks FineCut (guida)" NON stampabile + Corvo_FineCut_Area; nessun pezzo nei rispetti (più vicino 6,3-13,7 mm dal crocino); rotolo = intero (600 × 383-416 mm) e report con i margini; ×30 Summa (929 mm) → 1 coppia intermedia, 6 crocini; **1 `app.undo()` toglie disposizione, rotolo e crocini** (redo li riporta `_rif`); Annulla toglie solo i crocini di anteprima |
| 8 · bench/real/dtf: 5 PNG collegati + star specchiato V + butterfly specchiato H + cat ruotato 30° + donut incorporato | preset DTF 58 (580 mm, 6 mm), 15 s | 15/15 (dopo la correzione) | contorno dal file collegato = contorno dal render entro 0,05-0,09 mm (< 1 px a 150 ppi); render temporaneo 2,7-3,0 s per immagine (solo incorporate/ruotate), collegate 0-1 ms; corvoExport 9 immagini 5,8 s (prima della correzione ~17 s); dopo Applica ogni immagine ritracciata coincide col suo contorno spostato (≤ 2,3 % dell'area = ricampionamento); nessuna sovrapposizione, distanza min 6,35 mm; 1 `app.undo()` rimette tutto |
| Regressione | test_modulo1 33/33; test_host OK; Node: test_raster, test_combined 28/28, test_regmarks 333/333 | ok | test_modulo1: l'immagine opaca da sola ora viene nestata come rettangolo con nota (modulo 8) invece dell'errore: test aggiornato |
| E4 modulo 1 | test_e2e SEED=1, 30 s, v0.1 (e3e86aa, solo seme reso fissabile) vs HEAD | **chiuso** | insegna48 1666,9 / 1666,9 mm (v0.1, 2 run) = 1666,9 mm (HEAD, fori ON); lettering 844,7 / 844,7 = 844,7 mm: differenza 0,0 % |

**Bug corretti** (plugin/):
1. **Modulo 8, segno di `mValueD`** (`CORVO_M8_PLACED_DSIGN`): in Illustrator un PNG collegato dritto ha `mValueD < 0`.
   Con +1 i PNG dritti passavano tutti dal render (≈2,7 s l'uno) e quello specchiato in verticale prendeva la via veloce con
   gli angoli non scambiati → contorno capovolto (65 % dell'area sbagliata, pezzi sovrapponibili). Ora −1 e angoli dai
   segni di A e D: anche gli specchiati H/V usano il file originale.
2. test_modulo1: il caso "immagine da sola → errore" non vale più col modulo 8 (diventa un pezzo, opaca = rettangolo con nota).
3. Diagnostica dell'annullo unico: `$.global.corvoLastUndo = {steps, undone, ok, why}`.

**Aperti**:
(a) annullo unico con crocini saltato 1 volta su ~15 (Graphtec, primo run dopo un'altra sessione nello stesso documento):
il riavvolgimento non tornava all'origine entro `st.steps` passi → ripiego corretto (disposizione tenuta, più Ctrl+Z).
Un margine oltre `st.steps` è stato provato e TOLTO: annullava anche una modifica fatta dall'utente durante la revisione
(spostamento di 5 pt perso, verificato con undo6 EDIT=1). Con la diagnostica il prossimo caso dirà quale passo manca.
(b) Illustrator rallenta molto dopo ore di test (working set 10,5 GB): chiamate ExtendScript bloccate 75-215 s, anche
`1+1` (non è un callback perso: provato un watchdog lato pannello, inutile e rimosso). Riavviare Illustrator tra le sessioni lunghe.
(c) I crocini Mimaki restano una guida: FineCut va verificato su un plotter reale. (d) Nessun pezzo è finito nel foro del
donut DTF (nessun PNG abbastanza piccolo nel set): part-in-part dentro un raster verificato solo in Node (test_combined).

## 2026-09-24 — Merge moduli 3, 4-7, 9

Worktree `Plugin-int`, branch `integrazione-3-47-9` (base 6ba63e2 = moduli 1,2,5,6,8). Merge `--no-ff` in ordine:
`modulo9-commerciale` (nessun conflitto), `modulo3-quantita` (conflitti: architettura, `index.html` css, `main.js`
gating fori + `QP().setEnabled`), `modulo4-7-multinest` (conflitti: `index.html` script, `main.js` setState/readParams/
export/apply, `corvo.jsx` `corvo_singleUndo` = sagome M3 + contenitori M4/7, architettura). Tutte le funzioni tenute.

Integrazione (dettagli in plugin-architecture.md, "Moduli 3, 4, 7, 9"):
- gating: `colorNest` (4) e `multiSheet` (7) controllati in `mnReadParams` (anche da preset) + opzioni bloccate nella UI
  licenza; fori (2) e CSV (5) gia' agganciati; nuova voce `quantity` = Standard.
- copie (3) nel multi-job: `MN.assignGroups` mette copie e specchiate nel gruppo dell'originale, sagome create prima dei
  job e mosse job per job; "Tieni vicine" solo nel nest singolo (nota `mnNoCells`); "Leggi selezione" usa export+piano di Nest.
- crocini (6) con piu' rotoli/fogli: non supportati, nota di stato esplicita (`mnNoRegmarks`).
- limite di prova: `S.m9Count` conta i pezzi reali dopo `quantity.expand` (copie comprese).
- BUG trovato dal test combinato: gruppo con poca area (pallini 3-5 mm) su striscia larga -> panic di jagua-rs ("Offset
  resulted in an empty polygon", worker morto); vale anche per il nest singolo. Fix `geometry.guardInstance` (abbassa
  `strip_height` finche' area/altezza >= 4 gap), usato in `nest()` e `mnRunner`.

Test Node (SEED=7): test_client PASS, test_cluster 74/74, test_holes PASS, test_report PASS, test_regmarks 333/333,
test_raster PASS, test_quantity 221/221, test_multinest 221/221, test_multinest_panel 48/48 (+10: copie per colore,
gating), test_license 64/64, test_combined 49/49 (+21: 4 rotoli per colore, 4 copie di cui 1 specchiata, 50 pezzi per
il limite di Applica).

Da verificare in Illustrator: nest per colore con copie (sagome tratteggiate che saltano da un rotolo all'altro, Applica
crea i duplicati nel rotolo giusto, un solo Ctrl+Z toglie copie + `Corvo_Containers`); opzioni Colore/Livello/Fogli
disabilitate a prova finita (badge licenza) e messaggio "funzione Pro" caricando un preset; Applica rifiutato con
<= 10 design + copie > 10; nota crocini con piu' rotoli; pochi adesivi piccoli su rotolo 1600 mm (guard, niente crash).

## 2026-09-24 — Verifica finale 0.9 beta

Merge `integrazione-3-47-9` (moduli 3, 4, 7, 9) nella copia principale (`--no-ff`, 45d947b). Conflitti: `corvo_singleUndo`
(tenute l'attesa di sagome M3 e contenitori M4/7 E la diagnostica `corvoLastUndo`, ora anche con `ghosts`) e questo log;
tenuti `CORVO_M8_PLACED_DSIGN = -1`, test_modulo1 e `plugin/tools/ill/`. Illustrator riavviato (10,75 GB -> chiuso con
`app.quit()` dal pannello in 6 s, riaperto, pannello da `requestOpenExtension`): ~2,7 GB durante tutta la verifica.
Harness nuovi in `plugin/tools/ill/`: `m3.js`, `m47.js`, `m9.js` (stesse regole: solo CDP, documenti chiusi senza salvare).

| Modulo / file reale | Scenario | Esito | Numeri |
|---|---|---|---|
| Node (SEED=7) | 11 suite | ok | client, cluster 78/78 (+4), holes, report, regmarks 333/333, raster, quantity 221/221, multinest 224/224, multinest_panel 48/48, license 64/64, combined 49/49 |
| 3 · avery22806_square_labels.ai | 2 etichette disegnate sul modello (CMYK + PANTONE 485 C su "Stampa", CutContour su "Taglio"), A ×8, B ×4 | 11/11 | 10 sagome durante la ricerca; dopo Applica 36 oggetti (12 esemplari × 3) su livelli e tinte originali; copie rigide (scarto max 0,0054 %), stampa sempre dentro il suo taglio; 145,7 mm su 300; min 2,18 mm; UN `app.undo()` -> 6 oggetti originali (0 pt), redo ok; Annulla toglie le 10 sagome |
| 3 · freesvg_car-right-headlight.svg | ×2 + S+D | 12/12 | 3 sagome; 2 dritti + 2 specchiati esatti (differenza simmetrica 0,0012 %); 164,7 mm; min 2,35 mm; annullo unico, redo, Annulla |
| 4 · flag_italy.svg | per colore, rotolo 1000 | 13/13 | 3 rotoli (verde 357 · bianco 357 · rosso 181 mm), etichette "Corvo — #hex — L mm", un colore per rotolo, report 3 righe + TOTALE, `Corvo_Containers_rif`, un undo toglie tutto, Annulla durante la sequenza |
| 4 · flag_south_africa.svg | per colore | 10/10 | 3 rotoli: il gruppo con maschera (Y verde/bianca/gialla) resta UN pezzo col colore dominante (limite noto) |
| 4 · alfabeto colorato (34 oggetti -> 30 pezzi) | per colore, rotolo 600 | 10/10 | 6 rotoli (156 · 618 · 101 · 114 · 111 · 107 mm), nessun colore mischiato, min 2,22 mm; il rosso da 618 mm e' UN tracciato composto con piu' lettere |
| 7 · ClosedBox | 600×400 / 1220×2440 | 17/17 · 10/10 | 1 foglio (limite 1), 24 % / 2 %; margine 10 mm, min 2,29 mm; undo unico + Annulla (600×400) |
| 7 · DividerTray | 600×400 / 1220×2440 / venatura | 10/10 ×3 | 1 foglio, 58 % / 5 %; venatura: tutti i pezzi a 0/180° (0,0039 %) |
| 7 · AgricolaInsert (101 pezzi) | 600×400 / 1220×2440 | 10/10 (1220), 600: vedi nota | testo di annotazione FUORI dalle parti p-7/p-8 -> errore chiaro che le nomina; tolto il testo: 600×400 = 2 fogli (limite 2) 68/28 %, 266 mm usati; 1220×2440 = 1 foglio 8 %, 260 mm, min 2,25 mm. La "sovrapposizione" 64/95 del primo giro era il figlio nel foro (harness che riempiva i fori): corretto e ripassato sul 1220 |
| 9 · licenza | prova, scadenza simulata, chiavi | 13/13 | badge "Trial · 14 d left"; con inizio a -15 gg "Trial ended", fori/colore/livello/fogli bloccati, CSV Pro; 10 pezzi Applica ok, 9 design + 2 copie = 11 -> rifiutato + finestra licenza; preset Pro "per colore" -> Nest rifiutato; chiave manomessa rifiutata; Standard (license-gen) -> 11 pezzi ok, Pro ancora bloccate; Pro -> tutto; resta dopo il ricaricamento; record originale ripristinato |
| Regressione | test_modulo1 · insegna48 SEED=1 30 s | 33/33 · ok | insegna48 **1653,6 mm** in 2 run (era 1666,9): istanza Sparrow identica byte per byte a quella senza modulo 3 -> la differenza viene dal budget a tempo, non dal codice (e' piu' corta) |

**Bug corretti** (plugin/):
1. **Testo vivo nei file laser** (boxes.py: ogni parte ha un'etichetta di testo al suo interno): Nest si fermava con
   "N live text frame(s) define the shape" su TUTTI i file laser reali (ClosedBox 7/7 pezzi, DividerTray 17/17, Agricola).
   L'host esporta `textBoxes`; `cluster.planPieces` ignora il testo che sta tutto dentro l'area pari-dispari del pezzo
   (`boxInRings`: 4 angoli + centro): viaggia col pezzo. Testo fuori dalla sagoma o sopra un foro -> errore come prima.
   test_cluster +4 controlli. Documentato in plugin-architecture.md (Modulo 1, pannello).
2. Harness (non plugin): `Array.indexOf` assente in ExtendScript, regioni pari-dispari per i figli nei fori, impostazioni
   del pannello (`corvo.mn.opts`, salvate a ogni Nest e ripristinate al caricamento) riportate a Tutto insieme + Rotolo.

**Aperti prima di una beta pubblica**:
(a) testo di annotazione fuori dalle parti (Agricola p-7/p-8): errore corretto ma il laserista deve cancellarlo a mano ->
valutare "ignora testo fuori dai pezzi" o una nota piu' mirata; (b) tracciati composti con piu' lettere (alfabeto) e gruppi
con maschera multicolore restano un pezzo solo -> proporre "scomponi"; (c) export lento sui file densi (Agricola 20-27 s a
chiamata, harness di verifica minuti); (d) riga di stato per un attimo "Foglio 1 (verifica finale)…" in revisione finche' le
ultime mosse non sono inviate (cosmetico); (e) ZXP firmato senza PlayerDebugMode e installer mai provati su un PC pulito;
pagina prodotto assente; (f) crocini con piu' rotoli/fogli non supportati; annullo unico con crocini saltato 1/15 (ripiego
sicuro); FineCut da provare su plotter vero; (g) solo Windows.


## 2026-09-24 — Fix caricamento moduli host

**Causa**: `corvo.jsx` caricava `multinest.jsx`/`regmarks.jsx` con `$.evalFile` relativo a `$.fileName` e ingoiava
l'errore; se il caricamento saltava, il pannello li ricaricava con `$.evalFile` DENTRO `(function(){...})()`, quindi le
funzioni restavano locali e `corvo.jsx` (`typeof corvo_m4_paint`, `corvo_rmFinishAll`...) non le vedeva: nest per colore
tutto in "senza colore", crocini persi dopo Applica, senza messaggi. Stesso effetto con un `corvo.jsx` vecchio rimasto nel
motore ExtendScript (il reload del pannello non riesegue ScriptPath).
**Fix**: `corvo.jsx` carica i due file a livello globale con percorso assoluto (`File($.fileName).parent`), errori in
`$.global.corvoLoadErrors`; nuovo `corvoHealth()` (JSON: funzioni attese per file, mancanti, errori, hostDir).
`client/js/hosthealth.js`: all'avvio `corvoHealth()`; se manca ricarica `corvo.jsx`, se mancano funzioni dei moduli
ricarica solo quei file con uno script di PRIMO LIVELLO e riverifica; se manca ancora qualcosa errore chiaro nella riga
di stato, e nest per colore / crocini / contenitori si fermano con quel messaggio invece di andare avanti muti.
**Verifica**: `tools/check_jsx.js` (acorn ES3, o parentesi senza acorn) ok; `tools/test_hosthealth.js` 26/26 (host
simulato in vm); test_multinest_panel 48/48, test_license, test_combined, test_quantity, test_regmarks, test_client ok.
Illustrator (`tools/ill/hostload.js`, porta 8093, copie chiuse senza salvare) 11/11: dopo il reload il motore aveva il
`corvo.jsx` vecchio -> il pannello lo ha ricaricato da solo, `corvoHealth` ok (22 funzioni); guasto simulato (funzioni
tolte da `$.global`) -> ricarica dei due moduli, ok; flag_italy per colore = 3 rotoli (#009246, #FFFFFF, #CE2B37), nessun
"senza colore"; insegna48 (copia, cornice CONTAINER tolta) Graphtec: 8 crocini in revisione, presenti dopo Applica
(`Corvo_Regmarks_rif`), spariti dopo un `app.undo()`.

## 2026-09-24 — Casi reali degli utenti (GitHub, forum LightBurn) contro Corvo in Illustrator

20 casi (8 GitHub giro 1, 3 LightBurn, 8 GitHub giro 2, 1 Rhino N/A), dettagli in `docs/casi-reali.md`; harness
`plugin/tools/ill/real.js` (Nest + Applica dal pannello, misure sull'arte vera), `lbrn2svg.js`. Esito: 17 PASS (6 dopo
correzioni), 1 parziale (Deepnest #12 path unito: 1 pezzo + nota, lettura host 136-159 s), 1 INFO (sparrow #113), 1 N/A.
Corretti: DXF a segmenti (joinOpen), sottotracciati aperti nei composti ignorati (sovrapposizioni reali su SVGnest #37),
ingombri `geometricBounds` sbagliati (Deepnest #12: 42 → 62 pezzi), cornice sagomata scambiata per cornice del foglio
(targa Air Force), motore con pezzi piccoli rispetto al gap (wasm ricompilato + `guardInstance` neutro), P1-P5 di
`docs/casi-reali-motore.md` (test_robustness 20 PASS / 0 FAIL). Regressione: test_modulo1 33/33 (142,2 mm), test_e2e
insegna48 SEED=1 1624,3 mm (era 1653,6), test_host ok, test_cluster 92/92, combined, client, quantity, holes, multinest 228/228.
**Incidente**: `tools/test_host.js` (lanciato nella regressione) apre e chiude per nome `bench/suite/insegna48.svg`: ha
chiuso senza salvare il documento `insegna48.svg` aperto da Enrico. Riaperto dal disco a fine giro; eventuali modifiche
non salvate sono perse. Da ora test_host/test_e2e insegna48 solo con quel documento non aperto (o su copia con altro nome).
Aperti: lettura host lenta sui composti enormi (serve export SVG temporaneo), cornice di layout nei DXF 2013, unità SVG `100%`.
