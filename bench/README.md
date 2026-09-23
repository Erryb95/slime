# Benchmark Corvo (Sparrow) vs Arrange Master Demo 1.5.1 — 2026-09-23

Set: `insegna48.svg` / `insegna48.json` (generati da `gen_insegna.py`): 48 sagome da insegna in mm
(lettere a blocchi, frecce, stelle, cerchi, foglie, targhe, poligoni), area totale 0,721 m².
Regole uguali per entrambi: rotolo largo **610 mm**, distanza minima **3 mm**, rotazioni **0/90/180/270**.
Lunghezza minima teorica (riempimento 100%): **1181 mm**.

| Motore | Configurazione | Tempo | Lunghezza rotolo | Riempimento |
|---|---|---|---|---|
| Sparrow nativo (`cargo run --release`) | `-t 15 --min-item-separation 3` | 15 s | **1679 mm** | 70,4% |
| Sparrow nativo | `-t 60 --min-item-separation 3` | 60 s | **1655 mm** | 71,4% |
| Arrange Master Demo | Greedy, Dense Packing, Y-Gravity, 90° Turn, Evolution Stepper 15 (max demo), spacing 8,5 pt, contenitore 3000×610 | 76 s | **2037 mm** | 58,0% |
| Arrange Master Demo | idem con X-Gravity, contenitore verticale 610×3000 | 76 s | **2037 mm** | 58,0% |

Sparrow usa il 19% di rotolo in meno (382 mm su 2037) a parità di vincoli, in meno tempo.

Note di metodo:
- Arrange Master è stato pilotato in Illustrator 2026 via CEP remote debugging (porta 8092, file `.debug`
  nell'estensione + `PlayerDebugMode=1`), con `CSInterface.evalScript` per l'ExtendScript. Script in scratchpad
  (`cdp.js`, `run_full.js`).
- Il contenitore per Arrange Master è l'oggetto con bbox più grande della selezione (rettangolo `CONTAINER`).
- La demo produce un raster con filigrana: la lunghezza è la larghezza del raster risultante (2036,6 mm),
  eventuale margine bianco compreso (pochi mm).
- La demo limita l'Evolution Stepper a 15 (la versione completa arriva a 50) e disattiva la rotazione libera.
  Con la versione completa il risultato potrebbe migliorare, ma il divario è di 380 mm.
- I 76 s includono il download del motore JS dal server dell'autore (il motore non è nel pacchetto).
- Gotcha: `ExtTransformation.rotation` esportata da jagua-rs è in **gradi** (`plot_solution.py` lo gestisce).

File: `sparrow_insegna48_t60.png/.svg/.json`, `sparrow_insegna48_t15.*`, `arrangemaster_insegna48_ygrav.png`,
`arrangemaster_insegna48_xgrav_vertical.png`, `arrangemaster_insegna48.png` (prima prova con X-Gravity su 3000×610: righe su tutta la lunghezza, 2990×468 mm, non confrontabile).

## Suite da 14 set (2026-09-23, seconda sessione)

`build_suite.py` genera `suite/<set>.json|svg` (rotolo 600 mm, gap 2 mm): 11 set ESICUP/Gardeyn riscalati,
insegna48, `lettering` (PIZZERIA DA MARIO in Arial Black, lettere forate) e `frecce_am` (50 frecce dal file
Examples.ai di Arrange Master). `run_sparrow_suite.sh` = Sparrow nativo 60 s + wasm 60 s (`wasm_run.js`);
i JSON nativi finiscono in `bench/output/` (copiati in `results/final_*.json`). `am_suite.js` pilota Arrange Master
via CEP debug. Riepilogo in `results/summary.json`, immagini Arrange Master in `results/am_*.png`.

Risultato: Sparrow vince 14 su 14. Totale lunghezze: wasm 10469 mm, nativo 10283 mm, Arrange Master 12758 mm
(-17,9% wasm). Mediana del risparmio 14,2%, minimo 9,5% (marques), massimo 60,1% (jakobs1, buco di Arrange Master).
Riempimento medio: wasm 78,7%, nativo 80,1%, Arrange Master 63,8%. Wasm entro l'1,8% del nativo.
