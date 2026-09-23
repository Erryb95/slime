# Ricerca nicchia monetizzabile per motore di nesting (Sparrow)

## Iterazione 1 (2026-09-23)

### Scartati
- **LightBurn plugin**: nessuna API plugin; True Nest (contorno reale) uscito in 2.2.0 il 19/9/2026, Pro-only ($199). Nest Selected cablato su SVGnest.com.
- **xTool Creative Space**: ha già Smart Nesting (standard/compact/matrix). Vuoto chiuso.
- **Glowforge**: nessun nesting nativo, ma la richiesta nel forum (gen 2024) ha 8 risposte e interesse minimo; usano Deepnest e "non vale il tempo". Domanda debole.
- **Pelle (hide nesting con difetti)**: mercato esistente ma legato all'hardware (Atom, Comelz, Zünd, AutoNester-L, Mirisys). Prezzi opachi, vendita hardware-driven. Non accessibile.
- **Plasma hobby / piccole officine (Langmuir, SheetCam)**: forum Langmuir >5.000 utenti; SheetCam $145-390 con nesting "molto limitato"; il dev (2018) ha detto che i plugin di nesting (NestFab, DG Nest Pro) vendevano poco. Fascia bassa affollata: DG Nest €120 lifetime, NestForge €29, Sheet2Nest $12, NestorCut freemium, Deepnest-Next. Willingness to pay bassissima. **Insight**: la lamentela ricorrente non è la qualità del nest ma "ti dà il layout ma non i numeri" (usato/residuo per foglio, costo materiale).
- **Quoting SaaS per job shop laser**: molto affollato (CutQuote $95/mese, AutoCut, Tempus, LaserQuote, CUTL, SmartCutQuote, Accuracy, MakeQuote, Quote&Cut per WooCommerce; Paperless Parts da $300/mese). Costruirne un altro = competere sul marketing, non sull'algoritmo.

### Segnali interessanti
- CutQuote vende "unlimited nesting add-on" a **$200/mese**: il nesting è visto come costo/premium dai micro-SaaS di quoting.
- Esistono API di nesting B2B: Powernest (libreria/API, prezzo non pubblico), Nesting Center API (Starsoft, prezzo non pubblico), Nest&Cut ($60-100/mese ma è app, non API), Otimize.
- Ipotesi da verificare: **API di nesting a consumo, self-serve, prezzo trasparente**, venduta ai micro-SaaS di quoting/e-commerce (CutQuote, AutoCut, MakeQuote, Quote&Cut, NestForge, Sheet2Nest, NestorCut, CUTL...) che oggi o si scrivono il motore o pagano Powernest. Serve: prezzo Powernest/Nesting Center, se hanno self-serve, quanti micro-SaaS esistono.

### Prossimi candidati
1. API nesting self-serve per SaaS verticali (verifica prezzi Powernest / Nesting Center / Otimize).
2. Sartoria/pattern layout per home sewists (fabric yardage) — willingness to pay?
3. Piani di taglio marmo/pietra (slab layout) — Slabsmith ecc.
4. Packaging/cartotecnica impostazione fustelle.

## Iterazione 2

### Scartati
- **API nesting self-serve**: già esiste. Nesting Center: free (50 parti) / €99/mese (100 layout, 1000 parti) / €590/mese, API inclusa. Cutlist Evolution: SmartCut API, motore riscritto in Rust nel 2026, free tier 40 parti/nest, target CAD/CAM, ERP, cut-to-size store. NestFab, NestProfessor SDK, Powernest (ora Alma "Almacam Nesting Component", enterprise, prezzo su richiesta).
- **Hobby CNC router (Carbide Create, Easel, Onefinity)**: VCarve ha già nesting; stessa dinamica LightBurn.
- **Lamiera Italia**: Overcam PROfirst, Libellula, Eurosoft xCut: incumbents con rete commerciale, prezzi opachi.
- **Marmo/pietra**: EasySTONE (DDX), Taglio, OptCut, DDL drylayout, iBlocky (€299/mese gestionale). Coperto.
- **Home sewing**: Sewist CAD ha layout manuale; app yardage a pochi €. WTP bassissima.
- **Moda piccoli brand / marker making**: TUKAcad cloud da $99/mese (freelancer), CLO ~$50/mese, Gerber "scaled-down". Coperto.
- **POD cut&sew / sublimazione sportswear**: Optitex Print&Cut (prezzo su richiesta), VPersonalize, AISublimation.com, PrintFactory. Esistono, ma prezzi opachi → possibile wedge "self-serve economico". Da verificare dolore reale.
- **Guarnizioni/gomma**: nesting bundled con la macchina (STYLECNC ecc.).

### FATTO CHIAVE
- **Sparrow è già commercializzato da terzi**: NestorCut (nestorcut.com, licenza PolyForm Noncommercial, SaaS, motore = jagua-rs + sparrow, multi-foglio, report materiale/offcut CSV). Anche nestasm (WASM). ⇒ "Sparrow migliorato" non è un vantaggio difendibile: chiunque può fare lo stesso; il vantaggio va cercato nel workflow verticale.

### Pattern emerso
- Ogni verticale raggiungibile via web ha già un incumbent con nesting.
- Il wedge ricorrente che funziona (es. CutQuote vs Paperless Parts) è: incumbent enterprise a prezzo opaco + self-serve trasparente per piccole realtà.
- Sparrow risolve strip packing = materiali in ROTOLO (tessuto, vinile, pelle in rotolo, feltro, sublimazione). Lì la formulazione è nativa, senza dover costruire il bin packing.

### Prossimo: verificare POD sublimazione/tessile digitale piccole tipografie (prezzi AISublimation, VPersonalize; dolore su forum/reddit).

## Iterazione 3

### Scartato
- **Sublimazione sportswear**: AISublimation (plugin CorelDRAW, abbonamento mensile, trial gratis, ufficio a Sialkot = cluster mondiale), eCut (~$60), ReproScripts nesting plugin CorelDRAW, RasterLink (RIP Mimaki) con nesting base. Il dolore esiste (AISublimation cita 61% manuale vs 92%), ma è già presidiato a prezzi bassi.

### PROMOSSA: motore embeddable per software vendor ("Sparrow Industrial")
Evidenze:
- Domanda: sparrow 363 stelle, 81 fork, 9 dipendenti jagua-rs tra cui sparrow_rpc, spyrrow (binding Python, PyPI 0.9.0 marzo 2026), nest2D-jagua-rs, studio-vaai; nestasm (WASM); NestorCut (SaaS commerciale su sparrow); Cutlist Evolution ha riscritto il motore in Rust nel 2026.
- Gap funzionali chiesti da utenti industriali sul tracker: #157 item specchiati per marker tessile industriale (via spyrrow, set 2026, senza risposta), #121 item fissi (dic 2025), #140 multi-piastra (chiuso), #135 Python. Mancano anche: zone difettose/qualità, grain direction, sfridi/remnant, taglio comune.
- Incumbent engine: Almacam Nesting Component (ex Powernest, DLL/web service, vendita diretta, prezzo su richiesta, ha multisheet/difetti/grain/remnant), NestLib HCL (125+ OEM, prezzo su richiesta; online $20/mese <10 nest), NestProfessor/TAOSoft (DLL, sito che cita Windows XP). Tutti sales-led, opachi, legacy.
- Potere di prezzo a valle: CutQuote add-on nesting $200/mese; Nesting Center €99–590/mese; Nest&Cut $60–100/mese.
Rischi: base MIT (moat = feature industriali + supporto + licenza chiara, non l'algoritmo); mercato di vendor = decine/centinaia, non migliaia; l'autore (KU Leuven) può implementare le feature lui stesso.
Lista lead iniziale: autori delle issue e dei fork, NestorCut, Cutlist Evolution, CutQuote/AutoCut/MakeQuote/CUTL, AISublimation, produttori macchine laser/plasma hobby (Langmuir, xTool), LightBurn (True Nest appena uscito).

# LOOP 2 — idea monetizzabile con PROVA DI PAGAMENTO

## Iterazione 1: add-in di nesting per Fusion 360 (Autodesk App Store)

### Prove di pagamento
- Autodesk vende il nesting vero come Manufacturing Extension a **$1.465/utente/anno** (estensioni da $595 a $1.465).
- **MapBoards Pro** (Icarus Soft Landings): add-in sull'App Store a **$24,99 una tantum**, recensioni positive ("si ripaga al primo uso"), trial 7 giorni per le funzioni PLUS. Target dichiarato: hobbisti con laser/CNC.
- Autodesk App Store: **0% commissione** oggi (può salire fino al 30%), pagamenti via PayPal, abbonamenti ammessi, ~400 app Fusion, 4,6M utenti Fusion, discovery in-product.

### Il vuoto
- Licenza Personal Use (hobbisti, gratis): **nessun Arrange, nessuna estensione**. Devono disporre i pezzi a mano.
- Utenti commerciali: Arrange ha già "2D True Shape" incluso → per loro il gap è piccolo (solo multi-foglio/report/CAM, coperti dall'estensione a $1.465).
- Concorrente gratuito: **FuseNest 2D Nesting** (Ortus Lab), basato su SVGNest, "risultati incostanti" (thread Langmuir gen 2025, 16 risposte). MapBoards Pro "True Shapes" usa Arrange di Fusion → non funziona su Personal.
- Sparrow batte SVGNest/Deepnest nettamente in qualità e velocità → differenziazione tecnica reale, verificabile dall'utente in 10 secondi.

### Rischi / incognite
- Non ho una fonte ufficiale che confermi che gli add-in dell'App Store girano su Personal Use (403 sulla pagina Autodesk). Indizi forti che sì: FuseNest e MapBoards sono venduti agli hobbisti e citati da utenti Langmuir su licenza gratuita.
- Packaging: moduli Python compilati dentro l'add-in sono fragili → soluzione: binario Rust standalone lanciato via subprocess (SVG out → nest → SVG in). Da verificare che l'App Store accetti eseguibili nel bundle (guidelines APS).
- Thread Langmuir: molti hobbisti preferiscono il manuale. WTP bassa: fascia $20-50 una tantum.
- Autodesk può abilitare Arrange su Personal in qualsiasi momento.

### Verdetto
PROMOSSA come **entrata secondaria**, non come business: canale concreto (App Store, 0%), prova di pagamento nella stessa fascia ($24,99), differenziazione tecnica. Ordine di grandezza realistico: centinaia-poche migliaia di €/anno. Costo: 2-4 settimane.

## Iterazione 2: packing 3D logistica (scartato) + plugin nesting Illustrator per insegnisti (PROMOSSO)

### Packing 3D / cartonization — scartato
Prova di pagamento fortissima (3DBinPacking da $39/mese; Paccurate $16M raccolti, ~$2M ricavi; Boxify Shopify $19/mese 175 recensioni; Box Smart $10/mese; EasyCargo $67/utente/mese; Cube-IQ $2.500) ma affollatissimo e il nostro vantaggio (2D irregolare true-shape) non conta: è un problema diverso.

### CAD plugin vari — scartati
AutoCAD: nessun plugin di nesting (forum Autodesk) ma utenti AutoCAD usano DXF→CAM esterno; Inventor Nesting esiste. Rhino: OpenNest gratis, RhinoCAM-NEST incluso gratis in RhinoCAM. SolidWorks: NestingWorks. Fusion: vedi iter. 1 (piccolo).

### PROMOSSO: plugin di nesting true-shape per Adobe Illustrator, target insegnisti / print & cut / sticker / laser
Prove di PAGAMENTO:
- **AINest-Pro** (Baby Universe, JP): **$998/anno** o $255/3 mesi, Mac+Win, consiglia 8 core e 32 GB RAM (lento). Utenti Signs101: "non ci è piaciuto".
- **eCut**: ~$60 una tantum, il più consigliato, **solo PC (la versione Mac non funziona più)**, algoritmo subottimale, problemi con compound path, spalma su più fogli inutilmente.
- **Arrange Master** (Andrew R., 2025): $39 / $79 / $159 una tantum, true-shape, recensioni iniziali positive su forum Adobe (ott 2025), utente pronto a pagare $39 dopo la demo.
- **TruFit (Onyx)**: $2.995 ("dovrebbe essere incluso"). **Flexi** in abbonamento. PowerScript $25.
- Mercato: ~45.000 sign shop negli USA (IBISWorld/ByteScraper 2026), Europa segnaletica $11,1 mld 2026, Italia ~11% dell'Europa. Professionisti che usano Illustrator tutto il giorno, molti su Mac.
- Dolore esplicito: Signs101 2020 (20 risposte) e 2023 (20 risposte): vogliono nesting DENTRO Illustrator, gruppi preservati (accenti delle lettere), batch/ganging di più ordini, algoritmo migliore.
Canale:
- Vendita diretta (Gumroad/Paddle) come Arrange Master ed eCut; Adobe Exchange (rev share storico 75/25, da verificare); Signs101 + YouTube + gruppi FB sign makers.
Differenziazione Sparrow:
- Qualità nettamente superiore a eCut/SVGnest/Deepnest; velocità (secondi su laptop vs "8 core 32 GB" di AINest); **Mac** (eCut morto su Mac); prezzo tra eCut e AINest (es. $79-149 una tantum o $9/mese).
Incognite tecniche (esecuzione, non validazione):
- UXP per Illustrator: WASM non ufficialmente supportato, crash su Photoshop 2025; ExtendScript rimosso nel 2026. Opzioni: plugin nativo C++ SDK con Rust via FFI (come fanno eCut/AINest), oppure plugin UXP/CEP + helper locale che esegue Sparrow.
- Rev share Adobe Exchange attuale.
Rischi: Arrange Master è appena arrivato nella stessa fascia (concorrente diretto, ma indie e nuovo); Adobe potrebbe integrare un nesting nativo; mercato "plugin a $79" = business piccolo-medio (es. 500 licenze/anno ≈ $40k), scalabile con CorelDRAW (eCut) e Affinity.

# VERDETTO FINALE (3 agenti: mercato, tecnica, finanza) — 2026-09-23

Idea: plugin nesting true-shape per Illustrator (CEP + helper Rust/Sparrow), target sign shop / print&cut / sticker / laser, $79-99 una tantum.

Mercato (correzione): produttori insegne USA 5.700 (Vertical IQ) – 11.800 (NAICS), NON 45k; EU 15-25k, IT 2-3k [S]. Illustrator ~35-40% del settore. Target 20-40k shop. Lifetime realistico $50-150k. Prezzo accettato $49-79; abbonamento rifiutato. Unico rivale vero: Arrange Master (ott 2025, $39-79, JS, 0 recensioni). eCut solo Win, bounding box sui gruppi. AINest $998/anno "assurdo". TruFit $1.995. Adobe Exchange: 90% al dev, CEP ancora accettato.

Tecnica: UXP Illustrator non pubblico 2026, WASM non supportato → CEP + helper Rust locale (arch. d). 8-10 settimane dev singolo. Manca: multi-foglio (1-2 sett. greedy, 4-8 vero BPP), gruppi/compound → poligoni con fori (1 sett.), specchiati (1 sett.). 50 pezzi: 30-90 s su laptop.

Finanza ($99 una tantum, fee ~8%): 12m netto pess/base/ott = $1,3k / $6,45k / $23k; 24m = $3,5k / $17k / $60k. Break-even costi vivi ~15 licenze; break-even tempo dev (€400/g) ~350 licenze → >24 mesi nel base. Benchmark: tool singolo di nicchia = $5-25k/anno.

Verdetto: SIDE BUSINESS sì, business principale no. Kill: 3 mesi <30 trial/mese o <10 licenze; 6 mesi <40 licenze. Go: ≥8 licenze/mese al mese 6 → porting CorelDRAW + API web-to-print.
Prima mossa: comprare Arrange Master ($39) e confrontarlo con Sparrow su 3 file reali.
