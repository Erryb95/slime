# Casi reali degli utenti contro Corvo (Illustrator 2026) — 2026-09-24

File degli utenti in `bench/real/cases/` (gitignored, fonti e licenze in `bench/real/SOURCES.md`). Ogni caso aperto in
Illustrator (SVG/PDF diretti; DXF con `app.open` e scala "1 unità = 1 mm" o pollici; `.lbrn2` convertito con
`plugin/tools/ill/lbrn2svg.js`; JSON jagua-rs convertito in SVG), tutto selezionato, **Nest + Applica dal pannello**
(CDP 8093), poi misurato da `plugin/tools/ill/real.js` sull'arte vera (non sui poligoni del motore):
forma = ogni ancora e maniglia confrontata con lo spostamento rigido del pezzo; gap = distanza minima poligono-poligono
(Clipper, bisezione); sovrapposizioni = intersezione delle regioni riempite; segmenti aperti (DXF) concatenati in modo
indipendente dal pannello. Documenti sempre chiusi senza salvare. Motore nativo: `target/release/sparrow.exe`.
Analisi del solo motore (senza Illustrator): `docs/casi-reali-motore.md` + `plugin/tools/test_robustness.js` (ora 20 PASS, 0 FAIL, 8 INFO).

## Tabella

| Caso (fonte) | Problema dell'utente | Cosa ha fatto Corvo | Numeri | Esito | Correzione |
|---|---|---|---|---|---|
| SVGnest #27 lettere deformate, gap 3,5 mm invece di 10 — https://github.com/Jack000/SVGnest/issues/27 | "S" e "W" diverse dall'originale; spazio 10 → 3,5 mm | 12 lettere (tolto il rettangolo-foglio), rotolo 225 mm, gap **10 mm**, 30 s | forma: scarto max 5·10⁻⁴ mm; gap min **10,10 mm** (prima di P3: 10,28); 282 mm; 0 sovrapposizioni. Il "3,5 mm" dell'utente = gap "10" letto in px a 72 dpi | PASS | P3 (proxy meno gonfio: 293 → 282 mm) |
| SVGnest #122 archi CW/CCW — https://github.com/Jack000/SVGnest/issues/122 | archi capovolti DXF→SVG | DXF, SVG (QCAD, `scale(1,-1)`) e PDF aperti in Illustrator e confrontati con gli archi ricalcolati dai bulge del DXF; nest del DXF (232 pezzi, lastra tolta) | Hausdorff max DXF 0,037 / SVG 0,066 / PDF 0,107 mm (233/233 polilinee, 152 con archi); nest 475 mm su lastra 832, gap min 2,08, 0 sovrapposizioni, forma 5·10⁻⁴ mm | PASS | — |
| Deepnest #12 path unico con 404 sottotracciati — https://github.com/Jack000/Deepnest/issues/12 | il path unito blocca il programma | **unito**: termina, 1 pezzo (è un solo oggetto) + nota "UN oggetto con 62 forme separate: Rilascia il tracciato composto"; **spezzato**: 404 oggetti → 62 pezzi (= 62 parti reali), 1 in un foro | unito: geometria del pannello 8 s (in Node senza P2 > 60 s), ma lettura host 136-159 s; spezzato 527 mm, gap min 2,27, 0 sovrapposizioni | PASS (spezzato) / PARZIALE (unito: lento, un pezzo) | P2, nota nuova; **bug corretto**: ingombri da `geometricBounds` sbagliati (Illustrator dava tracciati 170 mm più larghi dei loro punti) → 42 pezzi invece di 62 |
| Deepnest #149 DXF Fusion 360, misure sbagliate — https://github.com/Jack000/Deepnest/issues/149 | dimensioni diverse dal CAD | 48 LINE + 4 ARC = 52 oggetti aperti | **396,15 × 88,15 mm** = DXF; **prima (dal codice): segmenti a 2 punti senza anello → "nessun contorno chiuso"**; ora 52 segmenti → 1 contorno, 1 pezzo, forma 5·10⁻⁴ mm | PASS (dopo fix) | **joinOpen** (nuovo) |
| deepnest-next #149 scala DXF — https://github.com/deepnest-next/deepnest/issues/149 | scala errata in import/export | 1 SPLINE chiusa (Cut) + 4 SPLINE aperte (piega) + testo = 1 pezzo | 484,63 × 401,97 mm = `$EXTMIN/$EXTMAX` in mm (`$INSUNITS`=4 vince su `$MEASUREMENT`=0); linee di piega si muovono col pezzo | PASS | P5 (nessuna nota: misure coerenti) |
| deepnest-next #154 grande + piccoli non termina — https://github.com/deepnest-next/deepnest/issues/154 | barra ferma all'infinito | 614 POLYLINE aperte → 23 contorni → 4 pezzi | finisce in 24,5 s (budget 30), gap min 2,18, 0 sovrapposizioni; nota "DXF senza unità: 70,2 × 41,9 mm (in pollici 1783 × 1063)" | PASS (dopo fix) | joinOpen, P5 |
| Deepnest #10 polilinee mancanti — https://github.com/Jack000/Deepnest/issues/10 | pezzi non importati | untitled.dxf (R12): 4/4 polilinee chiuse; untitled2.dxf (2010, dentro INSERT): 4/4 | 2 pezzi ciascuno (uno con foro), gap min 2,34 / 2,35 mm; untitled2 dichiara pollici → nota P5 | PASS | P5 |
| jagua-rs #78 sovrapposizione, poligono che si auto-interseca — https://github.com/JeroenGar/jagua-rs/issues/78 | overlap silenzioso | nativo: **errore chiaro** "Simple polygon contains intersecting edges 108 and 119"; Corvo (96 pezzi in SVG, 0/180°, gap 3, 60 s): nest valido | 5 poligoni auto-intersecanti (#0, #2, #21, #34, #53); Corvo 4157 mm, gap min **3,08 mm**, **0 sovrapposizioni** sull'arte vera | PASS | — (P1 per l'8 simmetrico) |
| LightBurn santa hat — https://forum.lightburnsoftware.com/t/how-to-make-sure-pieces-nest-together/147164 | i 3 pezzi non combaciano | originale: nel file i pezzi distano già **1,205 mm** (difetto del disegno); corretto dal supporto: distanza 0 | forma invariata (5·10⁻⁴ mm) → l'incastro dipende solo dal kerf; versione corretta: pezzi che si toccano = 1 pezzo (unione), con "Unisci" spento 3 pezzi, gap min 2,34 | PASS (N/A per il combacio) | — |
| LightBurn Air Force (vetrina) — https://forum.lightburnsoftware.com/t/air-force-plaque/166479 | nessuno (targa multilivello) | 54 tracciati su 5 livelli → 1 pezzo | **prima: il contorno di taglio restava fermo come "cornice del foglio" e le incisioni si spostavano fuori**; ora 54/54 insieme, forma 5·10⁻⁴ mm | PASS (dopo fix) | cornice = solo rettangolo |
| LightBurn orecchino fiocco — https://forum.lightburnsoftware.com/t/i-have-a-head-scratcher-earring-file/115293 | parti da 0,5 mm perse | 12 copie, gap 1 mm, 90° e libera | forma: scarto 5·10⁻⁴ / 3,9·10⁻³ mm (rotazione libera: arrotondamento), area ±0,0004 %; gap min 1,17 / 1,01 mm; 176 / 158 mm; Corvo non semplifica mai l'arte | PASS | — |
| Deepnest #3 linee del pezzo specchiato — https://github.com/Jack000/Deepnest/issues/3 | linee sbagliate dopo l'export | R14 (senza unità) e 2013 (pollici) importati in pollici: 96 LINE/ARC → 8 contorni; R14 6 pezzi, gap min 3,19, 0 sovrapposizioni. **2013: Illustrator importa anche la cornice del layout (20×11") → tutto un pezzo** | forma 5·10⁻⁴ mm; in mm: 6 × 9 mm → prima **errore motore**, ora nest + nota unità | PASS (R14) / NOTA (2013: togliere la cornice) | **bug motore pezzi minuscoli**, P5 |
| Deepnest #29 SVG = un solo oggetto — https://github.com/Jack000/Deepnest/issues/29 | nulla da annidare | `width="100%"`: Illustrator lo apre a 10,6 × 5,3 mm; 10 oggetti, 9 sovrapposti → 1 pezzo (sono disegnati uno sull'altro) | prima: **"could not construct an initial placement"**; ora nest ok, forma 5·10⁻⁴ mm | PASS dopo fix (unità SVG: limite di Illustrator) | bug motore pezzi minuscoli |
| Deepnest #102 forme una dentro l'altra — https://github.com/Jack000/Deepnest/issues/102 | forme annidate una nell'altra | Eule: gufo+ramo sovrapposti nel disegno = 1 pezzo; testo "flowRoot" = 1 oggetto con 12 forme (nota); Schnecke, "Unisci" spento: 37 pezzi | 0 sovrapposizioni in tutti i giri, gap min 2,04 mm; i pezzi nei fori solo in fori veri | PASS | nota oggetto multiplo |
| Deepnest #148 DXF distorto — https://github.com/Jack000/Deepnest/issues/148 | geometria distorta | DXF 2018 in pollici: 6 POLYLINE, 7 SPLINE, 3 CIRCLE, 1 LINE; 13 aperti → 1 contorno, 1 pezzo | in pollici 486,5 × 84,8 mm (= `$EXTMAX` 21,3" meno i punti di controllo); in mm: nota "dovrebbe misurare 542 × 109 mm, qui 19,2 × 3,3 (×0,035)" | PASS | joinOpen, P5, motore pezzi minuscoli |
| SVGnest #37 curve Fusion 360 spezzate — https://github.com/Jack000/SVGnest/issues/37 | curve in tanti sottotracciati | 5 pezzi, 31 sottotracciati aperti | **prima: 2 sovrapposizioni (445 mm²) e un pezzo fuori dal rotolo**: l'arco a 2 punti dentro un tracciato composto veniva ignorato; ora 31 → 3 contorni, 0 sovrapposizioni, gap min 2,35, 150 mm, riempimento 69 % | PASS (dopo fix) | sottotracciati aperti nei composti |
| SVGnest #38 piazzamento sbagliato — https://github.com/Jack000/SVGnest/issues/38 | pezzi mal piazzati | 69 oggetti → 66 pezzi, 3 nei fori | 0 sovrapposizioni, gap min 2,02 mm, forma 7,9·10⁻⁴ mm | PASS | — |
| deepnest-next #174 settimo pezzo fuori — https://github.com/deepnest-next/deepnest/issues/174 | 6 pezzi su 7 in 330 × 2100 | rotolo 330 mm, gap 5 | **7/7**, lunghezza **1875 mm** (< 2100), gap min 5,03, 0 sovrapposizioni | PASS | — |
| sparrow #113 SIMD peggiore — https://github.com/JeroenGar/sparrow/issues/113 | 3,9133 contro 3,8745 | nativo 60 s: 3,944 (seed 1: 3,999); wasm Corvo 60 s: 4,16-4,26; Corvo in Illustrator (×100 mm, rotolo 387, gap 0,5, libera): 429 mm | 41/41, 0 sovrapposizioni | INFO (wasm a un thread ~7 % dietro al nativo) | — |
| OpenNest (Rhino) fori — https://discourse.mcneel.com/t/opennest-cant-use-some-shapes/148502 | forme con fori escluse | `.3dm/.gh` nativi Rhino | — | N/A (serve Rhino per esportare) | — |

## Bug trovati e corretti (plugin/)

1. **DXF fatti di segmenti** (Deepnest #149, #154, #3, #148, SVGnest #37): Illustrator importa ogni LINE/ARC/SPLINE come
   oggetto aperto a sé; Corvo scartava tutto ("nessun contorno chiuso"). Host: `corvo_pathLine` esporta le polilinee
   aperte (`item.opens`); pannello: `cluster.joinOpen` le concatena per estremi (0,25 pt, qualsiasi oggetto e verso) in
   contorni chiusi, chiude buchi CAD ≤ 1 mm, tiene insieme gli oggetti di un contorno (un pezzo, nulla viene modificato),
   nota "N segmenti aperti uniti in M contorni". Contorni uniti = una forma pari-dispari per pezzo (fori).
2. **Sottotracciati aperti dentro un tracciato composto** ignorati (arco a 2 punti) → sagoma senza l'arco →
   **sovrapposizioni reali e pezzo fuori rotolo** (SVGnest #37). Ora passano da `opens`; una linea non concatenabile dentro
   un oggetto con forma diventa un anello sottile (0,25 pt), mai scartata.
3. **Ingombro da `geometricBounds`**: su SVG di Inkscape Illustrator restituisce ingombri fino a 170 mm più larghi dei
   punti (e di `visibleBounds`) → pezzi diversi incollati (Deepnest #12: 42 pezzi invece di 62). Ora l'ingombro viene dai
   punti letti; `geometricBounds` solo per tracciati senza anello.
4. **Cornice del foglio** riconosciuta anche su un contorno sagomato grande come la tavola (targa Air Force): il taglio
   restava fermo e le incisioni si spostavano. Ora cornice/sfondo = solo rettangolo (area ≥ 85 % del riquadro).
5. **Motore con pezzi piccoli rispetto al gap** (DXF in pollici letti in mm, SVG `width="100%"`): "could not construct
   an initial placement" o panic "Offset resulted in an empty polygon". Causa: `guardInstance` abbassava la striscia
   sotto pezzo + 2 gap. Correzione nel wasm (`wasm/src/lib.rs`: striscia iniziale ≥ diametro massimo + 2 gap, ricompilato)
   e `guardInstance` ora non cambia più l'istanza (altezza intera: 5 pezzi da 3 mm → 7 mm invece di 31).
6. **P1-P5** (`docs/casi-reali-motore.md`): P1 area dell'anello con Clipper (8 simmetrico non più scartato); P2 pezzo
   denso (> 5000 punti) pre-semplificato a flatness/2 con gonfiaggio compensato, > 16 parti → inviluppo convesso senza
   chiusura morfologica (Deepnest #12 unito: 0,8 s invece di > 60 s); P3 gonfiaggio t/2 + DP t/2 (proxy 0,69 → 0,35 mm:
   insegna48 1653,6 → 1624,3 mm, modulo1 144,4 → 142,2 mm); P4 vertici per pezzo = clamp(6000/N, 32, 200) (404 pezzi:
   prima soluzione 3,2 s invece di 18,8); P5 `corvoDxfUnits` legge `$INSUNITS/$EXTMIN/$EXTMAX` e il pannello avvisa se le
   misure non tornano (×0,035 su #148), se il DXF è in pollici o senza unità, o se supera 3 m.
7. Nota nuova: un oggetto con ≥ 3 forme separate (path unito, gruppo) → "è UN oggetto con N forme: Rilascia/Separa".

## Aperti

- **Lettura host lenta sui tracciati composti enormi**: Deepnest #12 unito, 18 511 punti → `corvoExport` 136-159 s
  (Illustrator occupato, pannello su "Lettura della selezione…"). Misurato: su alcuni sottotracciati ogni lettura DOM
  di un punto costa 2,5-10 ms, su altri 0,01. Non è un blocco (finisce), ma serve un'altra via (esportare in SVG
  temporaneo e leggere il testo) — da fare con l'export lento dei file densi.
- DXF 2013 di Deepnest #3: Illustrator importa anche la cornice del layout (carta 20 × 11") → un pezzo solo finché non la si toglie.
- Unità SVG `width="100%"` (Deepnest #29) e DXF senza `$INSUNITS`: dipendono dall'importazione di Illustrator; Corvo ora avvisa per i DXF, non per gli SVG.
- Motore wasm a un thread: ~7 % più lungo del nativo a pari tempo (sparrow #113).

## Strumenti

`plugin/tools/ill/real.js <file> [rotolo] [gap] [rot] [s]` (env `UNGROUP`, `DROP_BIN`, `COPIES`, `MERGE=0`, `PREGAP`,
`DXFUNIT=Inches`, `OUT`), `plugin/tools/ill/lbrn2svg.js` (LightBurn → SVG in mm). Test: `test_cluster` 92/92 (joinOpen,
cornice sagomata, arco non concatenabile), `test_combined` aggiornato (niente più abbassamento della striscia),
`test_host` conta anche `opens`.
