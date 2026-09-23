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
