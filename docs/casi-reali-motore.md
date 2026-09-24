# Casi reali dal motore (senza Illustrator) — 2026-09-24

Test: `node plugin/tools/test_robustness.js [secondi=10] [sezioni=1,2,3,4,5,6,7]` (ogni sezione gira in un processo figlio:
un blocco o un panic del wasm diventa un FAIL misurato; `ROBUST_JSON=file` salva i risultati). Pipeline provata:
anelli (pt, y in su, come `corvoExport`) → `geometry.buildPieces` → istanza + `guardInstance` → wasm `nest` (stessa glue
del pannello) → `placementToMove` → controlli sull'arte ORIGINALE spostata (sovrapposizioni con Clipper, distanza minima
esatta segmento-segmento, Hausdorff). File letti da `bench/real/cases/**` in sola lettura; il DXF si legge con un lettore
minimo interno al test (LINE, ARC, CIRCLE, ELLIPSE, LWPOLYLINE/POLYLINE con bulge, SPLINE de Boor, INSERT).

Esito (budget 10 s): **16 PASS, 4 FAIL, 8 INFO**.

| # | Caso utente | Esito | Numeri |
|---|---|---|---|
| 1a | jagua-rs #78, 64 pezzi | PASS | trovati 5 poligoni che si auto-intersecano: #0, #2, #21 (2 incroci), #34, #53 |
| 1b | riparazione | PASS | 7 pezzi invalidi (5 reali + 2 sintetici) → proxy semplice, area disegnata fuori dal proxy 0,000 % (nonzero e pari-dispari) |
| 1c | figura a 8 simmetrica, farfallino | **FAIL** | scartati con "no closed contour": area shoelace 0 ma area disegnata 4781 mm² e 2000 mm² |
| 1d | nest Corvo wasm (#78 + sintetici, demand come nel file) | PASS | 100/100, 0 sovrapposizioni, distanza min 3,13 mm (gap 3), prima soluzione 0,6 s |
| 1e | sparrow.exe nativo sul JSON originale | INFO | rifiutato subito: "Simple polygon contains intersecting edges 108 and 119" (jagua-rs attuale valida l'input) |
| 1f | sparrow.exe nativo sui proxy riparati da Corvo | PASS | 96/96, 0 sovrapposizioni misurate sui poligoni ORIGINALI, distanza min 3,014 mm |
| 2a | Deepnest #12, 1 tracciato composto con 404 sottotracciati (278 116 punti) | **FAIL** | `buildPiece` non finisce: ucciso dopo 60 s → il pannello resta bloccato |
| 2b | Deepnest #12 test.svg (21 sottotracciati, 14 238 punti) | PASS | 1,7 s, heap +92 MB |
| 2c | stesso disegno in 404 oggetti separati | PASS | 404 pezzi in 2,1 s |
| 2d | correzione proposta, cronometrata | PASS | 0,92 s (vedi P2) |
| 3a | SVGnest #27: diagnosi delle unità | INFO | `width="744.09448"` senza unità né viewBox: 10 unità = 3,53 mm a 72 px/in: **il "3,5 mm" dell'utente è il gap "10" letto in px**, non in mm |
| 3b | gap 10 mm sulle lettere vere | PASS | 13/13, distanza min **11,495 mm** (≥ 10), media al vicino più prossimo 13,9 mm, 0 sovrapposizioni |
| 3c | lettere non deformate | PASS | Hausdorff tra contorno in uscita e ingresso 4,6e-13 pt: Corvo sposta l'originale con `transform()`, non lo ridisegna |
| 3d | proxy di collisione rispetto al contorno | INFO | Hausdorff 1,955 pt = 0,69 mm (limite richiesto 0,5 pt); lettera tutta dentro il proxy → spreco, non errore (P3) |
| 4a | fiocco di neve (orecchino, LightBurn) | PASS | a 84/30/20 mm: tratto min 0,90/0,30/0,20 mm, **perdita 0,000 %** (il proxy aggiunge 0,8/2,1/3,4 % di area); un DP senza gonfiaggio perderebbe 0,43/1,37/1,92 % |
| 4b | 12 orecchini da 30 mm, rotazione libera, gap 0,5 mm | PASS | 0 compenetrazioni delle punte, distanza min 0,634 mm |
| 5a | deepnest-next #154, DXF R12 | PASS | 614 POLYLINE aperte → 22 anelli → 4 pezzi (1 grande con 11 fori + 3 piccoli), come "all four" dell'issue |
| 5b | nest dei 4 pezzi | PASS | finisce in 0,1 s (terminazione anticipata), 0 sovrapposizioni |
| 5c | stress 65 pezzi (5 grandi + 60 piccoli, come il primo utente) | PASS | fine 10,7 s su budget 10 s, prima soluzione 0,52 s |
| 6a-e | scala DXF | INFO | tabella sotto |
| 7a | 404 pezzi (Deepnest #12 separati) | **FAIL** | prima soluzione **18,8 s** con budget 10 s, fine 28,9 s; wasm 29 MB, rss Node 373 MB; 0 sovrapposizioni |
| 7b | misto: pannello 1200×500 mm + 200 forme + 40 pallini Ø3 mm | **FAIL** | prima soluzione **16,9 s**, fine 18,8 s; 0 sovrapposizioni, wasm 29 MB |
| 7c | budget di vertici proposto | PASS | 32 vertici/pezzo: prima soluzione 3,0 s, ma striscia 295 mm contro 250 mm (vedi P4) |

### Scala DXF per il tester in Illustrator (6a-6e)

| File | Versione | $INSUNITS | Ingombro disegno | Pezzi | Nota |
|---|---|---|---|---|---|
| Deepnest #149 `Ivar48x30Shelves v17 - 3UDrawerFront.dxf` | AC1014 | 4 (mm) | **396,2 × 88,2 mm** | 1 (48 LINE + 4 ARC concatenati) | Deepnest lo leggeva a 72 unità/pollice; misura attesa in AI: 396,2 × 88,2 mm |
| deepnest-next #149 `025-copy-change-ext-to.dxf` | AC1021 | 4 (mm), ma `$MEASUREMENT=0` (imperiale) | **484,6 × 402,0 mm** | 1 (SPLINE chiusa sul livello `Cut`) + 4 SPLINE aperte `BendLines` + 1 TEXT | conflitto di unità nell'header: vale `$INSUNITS` |
| Deepnest #10 `untitled.dxf` | AC1009 | 4 (mm) | 50,5 × 97,2 mm | 2 (4 POLYLINE 3D chiuse) | |
| Deepnest #10 `untitled2.dxf` | AC1024 | 1 (pollici) | 10 150 × 19 523 mm (!) | 2 (POLYLINE dentro 4 INSERT) | header in pollici ma coordinate ~400: unità sospette (probabilmente px o mm) |
| deepnest-next #154 `test-nesting-issue.dxf` | AC1009 | assente | 70,2 × 41,9 se mm; 1783 × 1063 se pollici | 4 | 614 polilinee esplose, estremi distanti 0,001-0,0015 unità |

## Proposte di correzione (NON applicate: file del pannello)

**P1 — figura a 8 scartata in silenzio (1c)** · `client/js/geometry.js`, `buildPiece`, filtro iniziale
`area(cr) >= opts.minRingArea`. `area()` è il valore assoluto dello shoelace, che si annulla quando i due lobi hanno verso
opposto: un 8 simmetrico o un farfallino disegnati con la penna diventano "no closed contour", il pezzo resta fermo e non
viene annidato. Correzione: misurare l'area del singolo anello con Clipper, cioè l'unione nonzero dell'anello forzato
in senso antiorario (`silhouette([cr])`, somma delle aree). In alternativa: `Math.max(area(cr), pathArea(union([toPath(cr)], pftNonZero)))`.
Il resto della pipeline gestisce già il caso: l'8 asimmetrico e il "lobo" vengono riparati correttamente (1b). Se comunque
si scarta, il messaggio deve dire "tracciato che si auto-interseca" invece di "no closed contour".

**P2 — tracciato composto enorme blocca il pannello (2a)** · `geometry.js`, `buildPiece`:
1. se i punti totali del pezzo sono più di ~5000, applicare `douglasPeucker(ring, flatness/2)` a ogni anello subito dopo
   `cleanRing` (278 116 → 19 095 punti) e sommare `flatness/2` al gonfiaggio di `simplify` (per restare conservativi);
2. se `silhouette` dà più di 16 parti, saltare la chiusura morfologica (`closing`) e usare subito `convexHull` (metodo
   `hull`). Oggi `closing` con raggio 2 pt su 62 parti e 278 000 punti non finisce in 100 s; anche dopo il DP richiede 11 s.
Tempo misurato con 1 e 2 insieme: 0,92 s (2d). Inoltre `filledArea` e `silhouette` sui punti grezzi costano 4 s e 5 s
ciascuna: anche loro vanno eseguite dopo il DP.
Uso reale (`cluster.js`, da decidere): chi unisce tutto in un solo tracciato (Deepnest #12) di solito vuole annidare le
parti. Proporre "Dividi il tracciato composto in pezzi" quando un CompoundPath ha molte parti disgiunte, lontane più del gap.

**P3 — proxy più largo del necessario (3d, spreco)** · `geometry.js`, `simplify`: gonfia di `t` e poi applica DP con `t`,
quindi può allontanarsi dal contorno fino a circa 2t, e `t` sale di ×1,6 quando i vertici superano `maxVertices`. Sulle lettere
di #27 lo scarto è 0,69 mm per lato: il gap reale arriva a 11,5 mm per 10 mm richiesti. Proposta: gonfiare di `t/2` e
applicare DP con `t/2` (scarto ≤ t), e restituire `simp.tol` nel pezzo per diagnostica. Non è un errore: il gap è sempre ≥ a quello richiesto.

**P4 — 200+ pezzi: la prima soluzione arriva dopo il budget (7a, 7b)** · la prima disposizione arriva quando il wasm ha
finito la costruzione iniziale. Quel tempo cresce con il numero TOTALE di vertici (circa 1,5 ms per vertice: 30 pezzi da
~150 vertici → 7,4 s; 404 pezzi a 200 vertici max → 18,8 s; 404 pezzi a 40 vertici max → 3,4 s). Il budget
`exploreSecs` parte solo dopo, quindi il tempo reale arriva a circa 3 volte quello impostato e l'anteprima live resta
ferma. Proposte:
- `main.js` (dove chiama `G.buildPieces`, riga ~691) e `multinest.js`: passare
  `maxVertices = clamp(round(K / N), 32, 200)`. Con K = 3000 la prima soluzione arriva in 3,0 s, ma la striscia peggiora
  del 18 % a parità di budget (295 mm contro 250). Con K ≈ 6000 si sta nel mezzo. Da tarare con `test_robustness.js 10 7`.
- `main.js`: togliere dal budget il tempo della costruzione iniziale, oppure avvisare quando serve ("costruzione
  iniziale… N pezzi"). Oggi la riga di stato resta vuota per 17-19 s.
- In alternativa, nel wasm (`wasm/src/lib.rs`): inviare un report dopo la fase costruttiva e far partire il tempo di
  esplorazione dall'inizio della chiamata.

**P5 — unità DXF e SVG (3a, 6)** · per la conversione DXF/SVG del pannello o dell'host:
- `$INSUNITS` ha la precedenza su `$MEASUREMENT` (deepnest-next #149).
- Se `$INSUNITS` manca o è 0, chiedere l'unità (default mm) e mostrare le misure: le due ipotesi di #154 differiscono di 25×.
- Fare un controllo di plausibilità: un ingombro oltre 3 m (untitled2: 10 × 19 m in pollici) va segnalato proponendo le altre unità.
- SVG senza unità (#27): Illustrator legge 1 px = 1 pt, Inkscape 0.48 scriveva 90 px/in. La scritta risulta 568 mm in AI
  e 454 mm in Inkscape. Il gap di Corvo è in mm, quindi non è ambiguo; ma se le misure del pezzo non tornano, la causa è
  questa. Da verificare in Illustrator: aprire `zalesie-5.svg` e leggere la larghezza (attesa 568 mm con la lettura a 72 ppi).
- DXF esplosi (#154): le 614 polilinee aperte hanno estremi distanti ≤ 0,0015 unità; `cluster.joinOpen` (tol 0,25 pt) le
  chiude in 4 pezzi. Da verificare in Illustrator che l'import non le raggruppi in un solo oggetto.

## Nessuna correzione necessaria

- Gap reale ≥ gap impostato su tutti i nest misurati: #78 3,13 mm su 3 mm; #27 11,5 mm su 10 mm; orecchini 0,634 mm su 0,5 mm;
  #154 2,36 mm su 2 mm.
- Nessuna sovrapposizione nei 7 nest fatti con il wasm, misurate sull'arte originale (anche con la regola pari-dispari sui pezzi che si auto-intersecano).
- Le parti sottili non vengono mai cancellate: il proxy è gonfiato prima del DP. Regola di tolleranza da mantenere: **non
  usare mai un DP senza gonfiaggio**, che sul fiocco da 20 mm perderebbe l'1,9 % dell'area, cioè le punte. Il motore
  (semplificazione interna di jagua-rs) non ha fatto compenetrare le punte sottili (4b).
- Terminazione con pezzi grandi e piccoli insieme (#154): finisce sempre. Con pochi pezzi `guardInstance` riduce la
  striscia (198 mm su 300) ed evita il panic "empty polygon".
