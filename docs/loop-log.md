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
