# Loop di sviluppo Corvo — brief (da rileggere a OGNI giro)

Obiettivo: portare il plugin Corvo (plugin/) alla beta, modulo per modulo, usando ESEMPI REALI per ciascuno dei
5 segmenti e risolvendo i PROBLEMI REALI che gli utenti descrivono online. Solo Windows (Mac rimandato).

## Come si lavora a ogni giro
1. Leggi `docs/loop-log.md` (stato, modulo corrente) e questo brief. Prendi il primo modulo non chiuso del backlog.
2. RICERCA (1 agente Opus, web): 3-6 file/casi reali per quel segmento (SVG/AI/DXF/PDF gratuiti o dimostrativi:
   template kit veicoli, fogli di adesivi, insegne, progetti laser, gang sheet DTF) + i problemi che gli utenti
   segnalano su quel modulo (Signs101, Reddit, forum Adobe/LightBurn, recensioni eCut/Arrange Master/AINest).
   I file scaricati vanno in `bench/real/<segmento>/` (gitignored: NON committare file di terzi), con `SOURCES.md`
   (URL + licenza).
3. IMPLEMENTA (1-2 agenti Opus in parallelo su file disgiunti, contratto in `docs/plugin-architecture.md`,
   aggiornarlo se cambia). Test unitari in Node dove possibile.
4. VERIFICA (1 agente Opus): in Illustrator tramite il pannello Corvo (CEP debug porta 8093, `plugin/tools/test_e2e.js`)
   sui file reali del giro + regressione su `bench/suite/insegna48.svg` e `lettering.svg`. Numeri prima/dopo.
5. REGISTRA: aggiungi al `docs/loop-log.md` (data, modulo, file reali usati, problemi utenti risolti, numeri, bug),
   aggiorna il documento Claude Docs https://claude.ai/code/artifact/f862b26d-10c2-4c3d-b3a9-fce78fcb97f1
   (sezione Piano di sviluppo: stato fasi), commit LOCALE sul branch (mai push, mai post pubblici).

## Regole
- Illustrator: gira da G:\afree\illustrator\Adobe Illustrator 2026. MAI SetForegroundWindow, MAI tasti o click
  sul desktop: Enrico usa il PC (gioca). Screenshot solo con PrintWindow. Chiudere i documenti di test senza salvare.
  Se Illustrator crasha: riavvialo e riapri il pannello con requestOpenExtension dal pannello Arrange Master (8092).
- Budget: max 4 agenti per giro, modello opus; DeepSeek (`tools/deepseek.py`, credito ~1 $) solo per testi brevi.
- Non copiare codice da MXNestSpirit (GPL) o NestorCut (PolyForm). Sparrow/jagua-rs MIT ok.
- Nessuna chiave o segreto nel repo.

## Backlog (in ordine)
1. [ ] Fedelta' al file — kit veicoli + print&cut: livelli preservati, spot color CutContour/Thru-cut intatti,
       gruppi con maschera, bleed/offset, testo non convertito con errore chiaro. File reali: template kit moto/auto,
       fogli adesivi con CutContour.
2. [ ] Pezzi dentro i fori (lettere O/A/R, cornici, loghi ad anello) — insegne + kit.
3. [ ] Quantita' per design (copie) e coppie specchiate sinistra/destra (kit veicoli) + design uguali vicini.
4. [ ] Nesting per colore/livello (insegne multicolore: un nest per ogni colore di vinile) + preset salvati.
5. [ ] Report materiale e costo (m, m², sfrido, €), export CSV, calcolatore "quanto risparmi".
6. [ ] Crocini di registro print&cut (Graphtec ARMS, Summa OPOS, Roland, Mimaki) generati sul rotolo.
7. [ ] Multi-foglio (laser/fresa): fogli standard, minimo numero di fogli, venatura, margini.
8. [ ] DTF: raster con contorno (trasparenza -> contorno), gang sheet 22"/58 cm, lunghezza minima.
9. [ ] Qualita' commerciale: licenza offline ECDSA, prova, firma ZXP, installer Windows, pagina prodotto.
