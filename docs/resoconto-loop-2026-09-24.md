# Loop di sviluppo notturno del plugin Corvo per Illustrator

## Risultato
Loop dal 23/09 sera al 24/09 mezzogiorno. 9 moduli sviluppati da agenti in parallelo su branch separati. Uniti e verificati in Illustrator 30.5.1 su file reali scaricati dal web. 11 suite di test Node verdi.

## Cosa fa ora il plugin
- Fedelta' al file: stampa e taglio uniti anche su livelli diversi, nesting sulla sola linea di taglio, crocini esclusi, livelli e tinte piatte intatti, un solo Ctrl+Z.
- Pezzi nei fori.
- Quantita' per design, coppie specchiate S/D, copie vicine.
- Nesting per colore/livello con preset.
- Report materiale e costo con CSV.
- Crocini Graphtec/Summa/Roland/Mimaki.
- Multi-foglio con margine, venatura, minimo fogli.
- DTF con contorno dai PNG trasparenti.
- Licenza offline ECDSA, prova 14 giorni, edizioni Standard/Pro, ZXP firmato, installer senza admin.

## Numeri verificati
- Stampa e taglio solidali a 0,0016 pt.
- Pezzi nei fori con distanza >= 3,31 mm su gap 3.
- Copie: -10..-24% vs griglia. Faro specchiato esatto 0,0012%.
- Colori: un rotolo per colore.
- Fogli: Agricola 101 pezzi in 2 fogli 600x400 = minimo teorico.
- DTF 22% film in meno vs rettangolo, distanza 6,35 mm su 6.
- Crocini geometria = specifica al micron. CSV coincide con le misure.
- Regressione insegna48 con seme fisso 1653,6 mm (prima 1666,9).

## Cosa manca per la beta pubblica
- Annullo unico con crocini salta 1 volta su 15.
- Crocini non supportati con piu' rotoli/fogli.
- Export lento sui file densi (20-27 s, fino a 272 s su un foglio da 597 oggetti).
- ZXP e installer mai provati su un PC senza modalita' debug.
- Manca la pagina prodotto.
- FineCut Mimaki da provare su plotter vero.
- Template veri di kit moto/auto solo a pagamento (15-21 EUR).

## Incidenti
- 4 ricerche su tutto il disco lasciate appese dagli agenti (chiuse, ora vietate nel brief).
- Un sotto-agente ha messo l'email di Enrico in un header di download Wikimedia (ora vietato).
- Un agente ha mandato un tasto Alt al gioco a schermo intero (ora vietato).
- Illustrator arrivato a 10,5 GB dopo ore di test, riavviato.
- Limite di sessione API alle 3:30, ripreso alle 10:17.

Bug corretti dagli agenti di verifica: 6 nel modulo 1, PNG specchiati con contorno capovolto, crash motore con pochi adesivi piccoli su rotolo largo, testo vivo dentro parti laser che bloccava il Nest, e altri minori.