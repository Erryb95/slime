# Moduli 7-8 — Multi-foglio (laser) e DTF: risultati ricerca (2026-09-23)

## File reali
Laser (bench/real/laser, da florianfesti/boxes, GPL-3.0: solo benchmark interno, mai distribuire):
| File | Dimensioni | Pezzi | Uso |
|---|---|---|---|
| ClosedBox.svg | 222x335 mm | ~6 pannelli | caso base, 1 foglio 600x400 |
| PhotoFrame.svg | 260x578 mm | 16 path | cornice, incrocio col modulo 2 |
| DividerTray.svg | 331x640 mm | 45 path | supera 600 in un verso |
| AgricolaInsert.svg | 1933x304 mm | 195 path | stress minimo fogli |
| JigsawPuzzle.svg | 126x138 mm | pannello unico | test negativo |
DTF (bench/real/dtf): dtf_donut_ring_hole.png (foro reale), dtf_cat_silhouette.png, dtf_star_simple.png, dtf_butterfly.png (OpenMoji CC BY-SA 4.0), dtf_welcome_cursive_text.png (PD, anti-aliasing reale).

## Problemi utenti
- LightBurn Quick/True Nest: spreco su 3 fogli, si ferma con pezzi non piazzati, cerchi trattati come rettangoli (forum.lightburnsoftware.com/t/quick-nest-vs-true-nest/191457, /190528).
- Venatura: "only 180 degrees" (forum.lightburnsoftware.com/t/open-source-nesting-solution/190774).
- Margine foglio (morsetti 20 mm) diverso dalla distanza tra pezzi (/possible-nest-function/190480). Kerf variabile.
- Glowforge: "create x copies ... fill it in" (community.glowforge.com/.../99799); Smartfit molto apprezzato.
- DTF: spaziatura troppo stretta = errore piu' frequente, >= 6 mm (jotoimagingsupplies, pdfpress.app); trim alpha senza aloni; spreco manuale 12-20% vs auto 3-7% (cheetahdtf). Prezzi 2,58-8 $/piede su rotolo 22"; formati 22x12 ... 22x200 in.

## Note tecniche
- jagua-rs 0.8.3 ha la feature `bpp` (Bin{container,stock,cost}), ma sparrow implementa solo `spp`. Beta: greedy nel pannello (First-Fit-Decreasing + run SPP corti per foglio), poi eventuale solver bpp in Rust.
- Venatura = allowed_orientations [0,180]. min_item_separation vale anche verso il bordo: il margine foglio va sottratto dal contenitore a parte.
- DTF = stesso problema a rotolo (spp); nuovo solo raster -> contorno: soglia alpha, apertura morfologica, marching squares (esterno + fori), Douglas-Peucker + smoothing, offset Clipper per la spaziatura. 22" = 558,8 mm e 58 cm sono preset distinti.

## Checklist
M7: split corretto su AgricolaInsert; minimo numero di fogli verificato; nessuna rotazione 90 sui pezzi a venatura; margine foglio e kerf separati e misurabili; pezzo piu' grande del foglio = errore chiaro; copie N per design; report fogli usati e resa %.
M8: foro reale rilevato su donut; spaziatura >= valore impostato misurata sui contorni; preset 22"/58 cm distinti; PNG senza trasparenza = errore chiaro; contorno senza gradini su bordi netti; lunghezza minima del gang sheet riportata; raster si muove col suo contorno.
