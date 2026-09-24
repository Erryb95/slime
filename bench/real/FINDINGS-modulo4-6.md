# Findings — Moduli 4, 5, 6 (Corvo)

Ricerca per: 4 "Nesting per colore/livello", 5 "Report materiale e costo", 6 "Crocini di registro print&cut".
Fonti dettagliate (URL + licenza) in `bench/real/SOURCES.md`. File scaricati in `bench/real/color/` e `bench/real/regmarks/` (gitignored).

---

## 1. File reali scaricati

| File | Cartella | Tipo | Cosa mostra | Fonte |
|---|---|---|---|---|
| `openclipart_alphabet_bojarkski_colorful.svg` | color/ | SVG | Alfabeto completo, 6 colori piatti distinti su gruppi di lettere diverse | openclipart.org (Public Domain) |
| `flag_brazil.svg` | color/ | SVG | Bandiera 4 colori (verde/blu/giallo/bianco), regioni nette | verosim. Wikimedia Commons (PD) |
| `flag_italy.svg` | color/ | SVG | Bandiera 3 colori (verde/bianco/rosso) | verosim. Wikimedia Commons (PD) |
| `flag_jamaica.svg` | color/ | SVG | Bandiera 2 colori | verosim. Wikimedia Commons (PD) |
| `flag_south_africa.svg` | color/ | SVG | Bandiera 3 colori con confini diagonali/a Y | verosim. Wikimedia Commons (PD) |
| `graphtec_CE7000_UserManual.pdf` | regmarks/ | PDF (320 pag.) | Cap. 5 "ARMS" completo: forma, dimensione, offset, distanze | mygraphtec.jp (manuale ufficiale) |
| `roland_GS2-24_manual.pdf` | regmarks/ | PDF (166 pag.) | Sez. "Crop Marks" + "Margins and Distance between Crop Marks" | downloadcenter.rolanddg.com (ufficiale) |
| `summa_SC_R_manual.pdf` | regmarks/ | PDF (96 pag.) | Cap. 3 "OPOS": calibrazione, margini, paneling | download.airmark.com (rivenditore ufficiale Summa) |
| `mimaki_regmarks_error_C36.pdf` | regmarks/ | PDF (14 pag.) | Geometria completa crocini FineCut/CG-AR con diagrammi | mimaki.com (ufficiale) |
| `mimaki_IDCutGuide_e.pdf` | regmarks/ | PDF (43 pag.) | Workflow "ID Cut" alternativo (ID stampato, non crocino visivo classico) | mimaki.com (ufficiale) |
| `mimaki_CGAR_PrintCut.pdf` | regmarks/ | PDF (4 pag.) | Guida rapida print&cut CG-AR | mimaki.com (ufficiale) |

Nota: un tentativo di scaricare un logo multicolore da Wikimedia Commons (`Wikibooks_multicolor_open_book.svg`) e' fallito con HTTP 429 (rate limit su upload.wikimedia.org) e ha restituito una pagina di errore invece dell'SVG; il file non valido e' stato rimosso da `color/` per non inquinare i test.

**Limite onesto**: non sono stati trovati file .ai/.eps veri di "insegne multicolore separate per livello" scaricabili liberamente (i cataloghi Freepik/Vecteezy con licenza gratuita richiedono login e non offrono link diretti scriptabili). I file color/ sostituiscono con casi reali e verificabili (bandiere, alfabeto, logo) che hanno la stessa struttura rilevante per il modulo 4: **poche regioni di colore piatto e netto, senza sfumature, ciascuna adatta a un rotolo di vinile diverso**, che e' esattamente la geometria che il nesting-per-colore deve gestire. Prossimo giro: cercare specificamente su Signs101 "Downloads (Premium)" (richiede account) o repo GitHub di template vehicle-wrap/kit lettere.

---

## 2. Problemi utenti, classificati e con fonte

### 2.1 Weeding di lavori multicolore / spreco vinile (modulo 4)

Rango 1: **il weeding e' il vero collo di bottiglia**, non il taglio in se':
- "Production here estimated about 25 hours for the weeding to be done." — wonderings, Signs101 — https://www.signs101.com/threads/weeding-small-labels.176168/
- "weeding cut lettering at small sizes just sucks no big magical way to get it done." — petepaz, Signs101 — https://www.signs101.com/threads/weeding-small-labels.176168/
- "I avoid weeding small decals at all costs." — Stacey K, Signs101 — https://www.signs101.com/threads/weeding-small-labels.176168/
- "Unfortunately there aren't any tricks to eliminate the need to manually pick out centers of letters." — White Haus, Signs101 — https://www.signs101.com/threads/weeding-small-labels.176168/

Implicazione per Corvo: nestare per colore riduce il weeding solo se si evita di intrecciare pezzi di colori diversi molto vicini (altrimenti si staccano comunque vinili adiacenti per errore), requisito di design per il modulo 4: margine minimo configurabile tra colori diversi, non solo tra pezzi dello stesso colore.

### 2.2 Preventivo / costo materiale (modulo 5)

Rango 1: non esiste una formula standard, ma tutti calcolano ore + materiale + margine:
- "Time x Hourly Rate + Materials + Material Markup = Selling Price" — FireSprint.com, Signs101 — https://www.signs101.com/threads/how-to-calculate-your-hourly-shop-rate.164991/
- "Labor rate X hrs + material + mark up = cost." — UFB Fabrication, Signs101 — https://www.signs101.com/threads/what-formula-do-you-use-to-quote-a-job.62708/
- "You need to start by figuring out your hourly rate. Which is what it costs you per hour to keep your doors open." — FatCat, Signs101 — https://www.signs101.com/threads/what-formula-do-you-use-to-quote-a-job.62708/
- "They have to calculate the square inches and find the closest match." — Stacey K, Signs101 (sugli adesivi non standard) — https://www.signs101.com/threads/standard-pricing-on-stickers.183241/
- "My prices start at $110 + cost of materials (plus 40% margin) + cost of production." — kcollinsdesign, Signs101 — https://www.signs101.com/threads/standard-pricing-on-stickers.183241/

Rango 2: esiste gia' domanda di mercato per un tool che faccia questo calcolo automaticamente: il thread "New Free Tool: SignShop Profit — Sign Pricing and Job Estimating" (Signs101, https://www.signs101.com/threads/new-free-tool-signshop-profit-%E2%80%94-sign-pricing-and-job-estimating.184109/) mostra un tool dedicato con campi: costo materiale, sfrido, markup materiale, tempo design/prepress, manodopera produzione/installazione, tempo macchina, tariffa oraria negozio, costi viaggio/varie, sconti/tasse, margine target; output: prezzo di vendita consigliato, costo/unita', costo totale job, profitto stimato, margine effettivo. Conferma che i campi proposti sotto (sezione 4) sono allineati a cosa il mercato gia' usa.

### 2.3 Crocini di registro (modulo 6)

Rango 1: **causa piu' comune di fallimento: materiale non idoneo** (colorato, lucido, trasparente, curvo):
- "Crop marks cannot be detected if decorations or colors are on the material. Crop marks also cannot be detected on glossy material even if it is white." — manuale Roland GS2-24 (fonte ufficiale, non forum), vedi regmarks/roland_GS2-24_manual.pdf pag. 129
- "You may find the laminate the cause as it struggles to read the crop marks through the laminate." — Steve McAdie, uksignboards.com — https://uksignboards.com/forums-2/discussion/summa-opos-cutting-alignment-promblems/
- "it won't read the crop marks, it goes over it acts like it's going to read then just starts scanning" — s.audioguy, Signs101 (Graphtec FC8600) — https://www.signs101.com/threads/fc8600-not-reading-crop-marks.183709/ (causa finale: "It ended up being a bad sensor")

Rango 2: **guasti hardware del sensore stesso**:
- "the little 'shroud' that pops down while it goes back and forth looking for the mark stopped working" — tbullo, Signs101 (Graphtec FC8600 ARMS) — https://www.signs101.com/threads/fc8600-arms-problem.180657/

Rango 3: **errori di posizionamento/allineamento dopo il nesting**:
- "Having problems with Summa OPOS cutting alignment, cant seem to find correct cutting path seems to be out by about 5mm." — Colin Aburrow, uksignboards.com — https://uksignboards.com/forums-2/discussion/summa-opos-cutting-alignment-promblems/
- "the Summa will not cut exactly on the contour line of the printing, it's approx 0.2mm off to the right" — shizyo, Signs101 — https://www.signs101.com/threads/summa-contour-cutting-off-0-2mm.158410/
- "the cuts are not aligned with the OPOS origin marker. They are offset by about 1/2 inch in the Y axis" — signdude, Signs101 — https://www.signs101.com/threads/help-with-summa-d60-se-and-opos-registration.12736/

Rango 4: **crocini non rigenerati correttamente quando il nesting duplica un disegno piu' volte** (fallimento diretto legato al nesting, non solo al sensore):
- "it printed ONE set of reg marks, but in order to cut it needs 2 sets..one for 1st group, one for 2nd group" — eahicks, Signs101 — https://www.signs101.com/threads/uh-this-sucks-flexi-nesting.112452
- "if you nest 2 jobs, and it prints 1 set of marks, you should be able to cut by using that 1 set of marks" — eahicks, Signs101 (stesso thread) — https://www.signs101.com/threads/uh-this-sucks-flexi-nesting.112452
- "I have experienced the same thing...I have wasted a tone of material" — SAR.Summerlin, Signs101 (stesso thread, su Flexi Cloud) — https://www.signs101.com/threads/uh-this-sucks-flexi-nesting.112452
- "I think this is a design flaw in Flexi / Prod Mgr" — eahicks, Signs101 (stesso thread) — https://www.signs101.com/threads/uh-this-sucks-flexi-nesting.112452

Implicazione diretta per Corvo: il modulo 6 non deve solo disegnare crocini geometricamente corretti ma anche (a) avvisare l'utente prima dell'export se il colore di sfondo/vinile scelto e' scuro, lucido o trasparente (dati non leggibili da nessun sensore ottico dei 4 brand), (b) mantenere sempre una zona di rispetto libera da grafica attorno a ogni marchio (vedi tabella sotto), e (c) **generare un set completo e indipendente di crocini per OGNI copia/duplicato prodotto dal nesting** (bug reale osservato in Flexi/ProductionManager: nestare N copie ma stampare un solo set di crocini rende il resto del rotolo non tagliabile e causa spreco totale del materiale).

---

## 3. Specifiche geometriche crocini, tabella per marchio

Tutti i valori sono presi dai manuali ufficiali scaricati (non da terzi), tranne dove indicato "da forum".

| Marchio / sistema | Forma e dimensione | Spessore linea | Offset dal bordo artwork | Distanza tra marchi consecutivi | N. minimo marchi | Colore richiesto | Note |
|---|---|---|---|---|---|---|---|
| Graphtec ARMS (Cutting Master 4/5, ARMS 6.0) | 4 forme possibili (MARK TYPE 1-4); lato 5-20 mm | 0.3-1.0 mm, linea singola (mai doppia) | Zona di scansione libera attorno al marchio: a = 6 mm (nessuna stampa in quell'area); origine cutting a 15-17 mm dai rulli pressori | Panel Cutting: partizioni 1.0-2000 cm; adattamento manuale asse: 2/3/4 punti | 2 punti (min), consigliati 3-4 per warp su 2 assi | Nero su bianco raccomandato; sensore ha 3 modalita' (Mode 1 standard, Mode 2 colorato/lucido, Mode 3 speciale) con funzione RECOMMENDED SETTINGS che rileva colore ottimale | Precisione di scansione dichiarata: 0.3 mm. Range di correzione offset sensore: -3.0 / +3.0 mm. Con Panel Cutting attivo i crocini vengono ignorati. |
| Summa OPOS (S/D/F series, OPOS-CAM) | Quadrato pieno stampato; quadrato di calibrazione fabbrica ~9.5x9.5 mm; quadrato di test calibrazione media >= 40x40 mm | Non specificato in mm nel manuale (dipende da stampante/densita' inchiostro), richiede zone piene di colore uniforme di almeno 30x30 mm bianco e 30x30 mm colore marchio per la calibrazione | Margine laterale >= 10 mm (1 cm), preferibile 20 mm (2 cm); margine anteriore >= 10 mm (1 cm); margine di coda (dopo la stampa, per fogli/rotolo) >= 40 mm (4 cm) | OPOS Panels: distanza tra i marchi sull'asse X = dimensione del pannello (parametro software, nessun minimo/massimo fisso nel manuale base) | 1 origine + marchi aggiuntivi per pannelli/copie multiple; barcode opzionale per code automatico rotolo-a-rotolo | Nero su bianco (calibrazione di fabbrica fatta su vinile nero + backing bianco); mezzi lucidi richiedono ricalibrazione Cal. Media | Ha 3 metodi di fallback manuali (X-Alignment, XY-Alignment, XY-Adjustment) quando la combinazione colore marchio/materiale non e' leggibile otticamente. |
| Roland VersaWorks / CutStudio (crop mark) | Cerchio pieno; diametro leggibile 10-12.5 mm (12.5 mm raccomandato/da doc. errori) | N/A (marchio pieno, non linea) | Margine anteriore (leading) prima del 1o marchio 20 mm; margine di coda (trailing) dopo l'ultimo >= 50 mm; margini laterali 10-60 mm (lato C) e 10-42.5 mm (lato D); area attorno ai marchi libera da grafica/sporco | Tolleranza offset in direzione avanzamento <= 20 mm, altrimenti errore WIDTH NG / LENGTH NG | 4 marchi (uno per angolo dell'area di stampa) | Nero al 100% di densita'; materiale bianco opaco obbligatorio, trasparente/colorato/lucido = non rilevabile | Tolleranza angolo: i marchi sn/dx non devono essere inclinati >= 5 gradi rispetto alla direzione di avanzamento, altrimenti errore ANGLE TOO BIG. |
| Mimaki FineCut / CG-AR register mark | Quadrato; lato default 10 mm, range 4-40 mm (deve combaciare esattamente tra impostazione plotter e FineCut) | 0.5-1.0 mm | Dal 1o marchio (TP1) al bordo anteriore foglio: >= 20 mm (Type 2: + meta' lato marchio); dal 2o marchio (TP2) al bordo posteriore: >= 45 mm (Type 2: + meta' lato marchio); area libera attorno a ogni marchio = lunghezza del lato del marchio stesso | Tra TP1 e TP2: 50-3000 mm | 1 punto (impostazione plotter, "1pt") + 4 punti lato FineCut per compensazione completa; Type 1 (esterno) o Type 2 (interno), devono combaciare | Nero su bianco obbligatorio: "Colored sheets and colored register marks cannot be detected" | I marchi devono essere creati con FineCut, non con Illustrator direttamente: "Register marks created with Illustrator cannot be read" (fonte: doc. ufficiale errore C36), vincolo diretto per Corvo: l'export deve generare marchi in un formato che FineCut riconosca, non un semplice cerchio/croce disegnato a mano. Esiste anche il sistema alternativo ID Cut (barcode/ID invece del crocino visivo) per i plotter compatibili. |

Costanti utili trasversali a tutti e 4 i brand (da usare come default sicuri in Corvo):
- Colore marchio: nero puro (K100 / #000000), mai un colore spot custom, su sfondo bianco opaco.
- Zona di rispetto (keep-out) attorno a ogni marchio: nessuna grafica ne' sporco per una distanza pari almeno alla dimensione del marchio stesso.
- Margine di sicurezza minimo dal bordo materiale su tutti i lati: >= 20 mm (il valore piu' permissivo tra i 4 e' Roland leading 20mm; il piu' severo e' Mimaki/Roland trailing 45-50mm, usare 50mm come default di coda per compatibilita' universale).
- Distanza minima tra marchi: 50 mm (Mimaki, e implicitamente compatibile con gli altri).
- Materiale: mai trasparente, mai lucido senza laminazione opaca, mai colorato sotto ai marchi.

---

## 4. Formato di report proposto (modulo 5)

### Campi del report (schermata/PDF di riepilogo job)

| Campo | Unita' | Formula/fonte |
|---|---|---|
| Nome job / cliente | testo | - |
| Data | data | - |
| Materiale (nome, larghezza rotolo) | mm | dai preset materiale Corvo |
| Lunghezza vinile usata | mm / m | somma bounding-box del nesting lungo l'asse di avanzamento |
| Area totale pezzi utili | mm2 / m2 | somma area poligoni dei pezzi effettivamente nestati |
| Area rotolo usata (larghezza x lunghezza usata) | mm2 / m2 | larghezza rotolo x lunghezza usata |
| Sfrido % | % | 1 - (area pezzi utili / area rotolo usata), coerente con la formula standard di utilizzo nesting |
| Costo materiale | euro | area rotolo usata (m2) x prezzo/m2 (o lunghezza x prezzo/m lineare se il materiale si vende a metro) |
| Costo per pezzo | euro | costo materiale job / numero pezzi (o per-design se copie multiple) |
| Tempo macchina stimato | min | lunghezza percorso di taglio / velocita' cutter impostata (+ tempo di scansione crocini se print&cut) |
| Manodopera (opzionale, da tariffa oraria utente) | euro | tariffa oraria x tempo stimato (design+produzione), come da formula community: Tempo x Tariffa oraria + Materiale + Markup materiale = Prezzo vendita |
| Risparmio vs. nesting manuale/sequenziale | % e euro | confronto tra sfrido ottenuto e uno sfrido di riferimento (es. nesting a griglia semplice o "un pezzo alla volta"), stessa metrica sopra applicata a entrambi gli scenari |

### Colonne export CSV (una riga per job, o una riga per colore/nest se multicolore)

```
data,cliente,job,materiale,larghezza_rotolo_mm,lunghezza_usata_mm,area_pezzi_mm2,area_usata_mm2,sfrido_pct,prezzo_materiale_per_m2,costo_materiale_eur,numero_pezzi,costo_per_pezzo_eur,tempo_macchina_min,colore_vinile,risparmio_pct,risparmio_eur
```

Se il job e' multicolore (modulo 4 + 5 insieme): una riga per colore, piu' una riga TOTALE con i campi sommati (lunghezza, area, costo) e lo sfrido % ricalcolato sul totale.

### Calcolatore "quanto risparmi"

Input: sfrido del nesting attuale (Corvo) vs. sfrido di un nesting di riferimento scelto dall'utente (es. "come lo facevo prima", griglia semplice, o il valore che l'utente inserisce a mano). Output: m2 risparmiati, euro risparmiati sul job corrente e proiezione mensile (m2 risparmiati x job/mese stimati dall'utente).

---

## 5. Checklist di accettazione testabile per modulo

### Modulo 4 - Nesting per colore/livello
- [ ] Dato un file con N colori di fill distinti (es. openclipart_alphabet_bojarkski_colorful.svg, 6 colori), Corvo produce N nest separati, uno per colore, senza mescolare pezzi di colori diversi nello stesso nest.
- [ ] Dato un file organizzato per livelli Illustrator (uno per colore vinile) invece che per fill color, il riconoscimento funziona anche usando il nome/colore del livello come chiave, non solo il fill.
- [ ] Il margine minimo tra pezzi di colori DIVERSI e' configurabile e default a un valore piu' largo del margine tra pezzi dello stesso colore (per facilitare il weeding separato, problema #1 rilevato).
- [ ] Preset di nesting-per-colore salvabili e ricaricabili (nome preset, margini, ordine dei colori).
- [ ] Regressione: insegna48.svg e lettering.svg continuano a nestare correttamente quando trattati come mono-colore (nessuna rottura del modulo 1-3 esistente).
- [ ] Verifica numerica: sfrido totale con nesting-per-colore confrontato con nesting unico (deve essere dichiarato/misurato, non necessariamente migliore, serve il numero per il report del modulo 5).

### Modulo 5 - Report materiale e costo
- [ ] Dato un nesting completato, il report mostra tutti i campi della tabella sopra con valori numerici coerenti (area pezzi <= area usata, sfrido tra 0 e 100%).
- [ ] Export CSV valido (apribile in Excel/LibreOffice) con le colonne definite sopra, un file per job.
- [ ] Con materiale multicolore (modulo 4 attivo), il report genera una riga per colore + riga totale, con lunghezza/area sommate correttamente (no doppio conteggio).
- [ ] Il calcolatore "quanto risparmi" produce un numero (% e euro) quando l'utente fornisce un prezzo/m2 e uno sfrido di riferimento; con sfrido di riferimento = 0 o assente, il calcolatore non deve dividere per zero o crashare.
- [ ] Prezzo materiale configurabile sia a euro/m2 sia a euro/m lineare (rotolo), con conversione automatica nota la larghezza rotolo.

### Modulo 6 - Crocini di registro print&cut
- [ ] Corvo genera crocini con geometria conforme ad almeno i 4 profili (Graphtec, Summa, Roland, Mimaki) della tabella sopra, selezionabili da un menu "sistema crocini".
- [ ] Per ogni profilo, il margine di sicurezza dai bordi e la zona di rispetto (keep-out) attorno a ogni marchio sono rispettati automaticamente dopo il nesting (nessun pezzo nestato invade la zona crocino).
- [ ] Se l'utente sceglie un colore di vinile diverso da bianco/chiaro-opaco sotto ai marchi, Corvo mostra un avviso esplicito ("i sensori ottici richiedono nero su bianco opaco, questo materiale potrebbe non essere letto") prima dell'export, copre il problema #1 rilevato (causa piu' comune di errore reale).
- [ ] Distanza tra marchi consecutivi rispetta il minimo/massimo del profilo scelto (es. 50-3000mm Mimaki) anche quando il nesting produce un job molto corto o molto lungo.
- [ ] Per Mimaki, i marchi esportati sono verificabili come leggibili da FineCut (non solo geometricamente corretti), da testare con un file di prova reale in FineCut se disponibile, altrimenti documentare il limite noto (marchi "fatti a mano" in Illustrator non garantiti compatibili, serve verifica sul plotter reale nella fase VERIFICA del loop).
- [ ] Nome del layer/spot color dei crocini e' coerente con le convenzioni gia' in uso in Corvo per CutContour/Thru-cut (vedi modulo 1), per non creare un secondo standard di naming.
- [ ] Quando il nesting produce N copie/duplicati dello stesso design (es. con il modulo "quantita' per design"), Corvo genera un set di crocini completo e funzionante per OGNUNA delle N copie, mai un solo set condiviso per l'intero rotolo (bug reale riscontrato in Flexi/ProductionManager, causa di spreco totale del materiale segnalata da piu' utenti Signs101).
