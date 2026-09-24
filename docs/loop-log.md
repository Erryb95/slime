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
