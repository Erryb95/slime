# Resoconto sessione Corvo

## Fatto oggi
- Benchmark su 14 set reali (ESICUP, Gardeyn, insegne): Sparrow wasm ha totalizzato 10469 mm contro 12758 mm di Arrange Master (-17,9%). Mediana -14,2%. 14 vittorie su 14. Riempimento medio 78,7% contro 63,8%.
- Verificato che Arrange Master con 1, 5 o 15 passate resta entro pochi punti: più passate (fino a 50 nella versione completa) non chiudono il divario.
- Plugin v0.1 scritto da agenti in parallelo e verificato in Illustrator 30.5.1: pannello CEP, Sparrow in WebAssembly in un Web Worker, pezzi che si muovono dal vivo (41 aggiornamenti in 30 s, 34 ms per aggiornamento), Stop/Applica/Annulla, Annulla preciso a 0,001 pt, nessuna sovrapposizione. insegna48 in 30 s: 1646 mm. Lettere forate e gruppi in più parti gestiti (gruppi lontani approssimati con inviluppo convesso).
- 4 bug trovati e corretti dal verificatore. CSInterface di Adobe sostituito con un ponte scritto da noi (licenza pulita).
- GIF dimostrativa pronta: docs/marketing/corvo_live.gif. Bozze post Signs101/Reddit/Facebook/landing pronte in docs/marketing/post-bozze.md, corrette a mano.
- Concorrente scoperto: MXNestSpirit, pannello Illustrator gratuito GPL con Sparrow solo su Windows.
- Analisi mercato: ordine di attacco kit veicoli + print&cut al lancio, insegnisti mese 2-3, DTF e laser dopo.

## Numeri chiave
- -17,9% lunghezza totale vs Arrange Master.
- Riempimento medio 78,7% vs 63,8%.
- Prezzo consigliato: Standard 69 $ (49 lancio), Pro 139 $ (99 lancio), add-on DTF 49 $.
- Ricavi netti 24 mesi: 9k / 32k / 106k $.
- Kill a 90 giorni sotto 30 prove/mese o 10 licenze.

## Cosa manca per la beta
- Pezzi nei fori.
- Multi-foglio.
- Quantità per design.
- Livelli/CutContour verificati su file reali.
- Report materiale.
- Test su Mac.
- Firma ZXP.
- Licenza e pagina prodotto.
- Lista beta.

## Prossimi 3 passi
1. Chiudere pezzi nei fori e multi-foglio.
2. Verificare livelli/CutContour su file reali e avviare test su Mac.
3. Preparare firma ZXP, licenza e pagina prodotto, poi aprire la lista beta.

Nota: durante la cattura della GIF un agente ha inviato per errore un tasto Alt al gioco a schermo intero dell'utente; Illustrator è andato in crash una volta in un test.