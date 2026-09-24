# Findings — Modulo 2 "Pezzi dentro i fori" e Modulo 3 "Quantità/coppie L-R/vicinanza"

Ricerca di avanzamento (RICERCA, non implementazione) per i moduli 2 e 3 del backlog Corvo
(`docs/loop-brief.md`). Illustrator MAI aperto. File reali in `bench/real/holes/` e
`bench/real/quantity/` (gitignored). Fonti complete con URL e licenza in `bench/real/SOURCES.md`
(append-only, condiviso con gli agenti degli altri moduli in corso in parallelo). Versione
consolidata il 2026-09-24 dopo diverse riscritture concorrenti dello stesso file da parte di più
sotto-agenti: qui sono riunite tutte le informazioni verificate raccolte nel giro, senza perdite.

## 1. File reali raccolti

### `bench/real/holes/` — modulo 2, pezzi dentro i fori

| File | Formato/licenza | Cosa verifica |
|---|---|---|
| `BebasNeue_channel_letters_OARBDQ890.svg` (+ `BebasNeue-Regular.ttf`, `BebasNeue-OFL.txt`) | Glifi reali estratti dal font Bebas Neue (condensato, tipico delle insegne a canale) — SIL OFL 1.1, Google Fonts | 9 lettere O A R B D Q 8 9 0. Verificato via script Python (`svg.path`): 20 subpath totali su 9 path -> O/A/R/D/Q/9/0 = 1 foro ciascuna, B/8 = 2 fori ciascuna (11 fori totali, contorno interno sempre dentro il bbox di quello esterno) |
| `Moxom_uppercase_outline_alphabet.svg` | Specimen reale del font "Moxom" in 4 pesi con pangramma — CC BY-SA 4.0, autore Basile Morin (Wikimedia Commons, licenza confermata via API Commons; attribuzione obbligatoria) | 399 path, 135 con 2-3 subpath (A B D O P Q R con fori veri nei 4 pesi regular/bold/black/outline) — stress-test con centinaia di piccoli fori, le lettere vanno isolate a mano |
| `Roundel_argent_ring_wikimedia.svg` (Commons `Roundel-argent.svg`) | Anello araldico, caso minimo di logo ad anello — pubblico dominio (dichiarazione dell'autore sulla pagina file) | 1 path, 2 subpath concentrici -> 1 foro confermato |
| `manhole_flange_washer_wikimedia.svg` (docname reale `porte_couvercle_trou_d_homme_ballon_reflux_complet.svg`) | Tavola tecnica francese "staffa/gru porta-chiusino con valvola di reflusso" — pubblico dominio (Wikimedia Commons, extmetadata verificato via API) | Non e' una guarnizione pura ma contiene rondelle, boccole e flange concentriche reali: 216 path (191 evenodd, 16 nonzero), 39 con piu' subpath -> buon sostituto per "pezzo con piu' fori concentrici" e per il test del fill-rule misto |
| `mdi_record-circle-outline.svg` | Logo ad anello con disco centrale nello stesso compound path — Apache 2.0 (Pictogrammers Material Design Icons) | 3 subpath concentrici (r=10/8/3) -> 2 fori/isole annidate confermati |
| `mdi_circle-double.svg` | Doppio anello concentrico, sostituto di una guarnizione — Apache 2.0 (Pictogrammers) | 4 subpath concentrici (r=10/8/6/4) -> 3 fori confermati |
| `mdi_square-outline_frame.svg` | Cornice quadrata (frame) — Apache 2.0 (Pictogrammers) | 2 subpath, interno (5,5)-(19,19) dentro esterno (3,3)-(21,21) -> 1 foro confermato |
| `ring-of-flames_openclipart.svg` | Logo ad anello fatto di 16 fiamme separate — pubblico dominio/CC0 (Openclipart, autore GDJ) | Caso negativo: il vuoto centrale (~45% del diametro) nasce dalla disposizione di 16 pezzi separati, NON e' un foro di un pezzo unico — il pre-pass fori non deve trattarlo come tale (a meno che il modulo 1 li fonda prima) |

File scartati (falsi positivi del download automatico, non piu' su disco): `Kreisring_annulus_wikimedia.svg` (era un diagramma geometrico astratto, non un anello) e `Annulet_ring_commons.svg` (duplicato, sostituito dal Roundel).

Non trovato in questa sessione: un DXF di guarnizione (gasket) industriale scaricabile senza login/checkout — sostituito con i due file ad anello concentrico sopra (stesso pattern geometrico: contorno esterno + fori interni multipli). Un set di lettere di un produttore di insegne e' risultato sempre a pagamento.

### `bench/real/quantity/` — modulo 3, N copie + coppie L/R + vicinanza

| File | Formato/licenza | Cosa verifica |
|---|---|---|
| `avery22806_square_labels.ai` / `.pdf` | Template ufficiale Avery "Design and Print Online" (uso libero per progettare etichette proprie, non ridistribuire come prodotto) | Verificato con PyMuPDF: pagina Letter 612x792pt, 12 rettangoli identici 144x144pt (2"x2") in griglia 3x4 — il caso piu' diretto del modulo 3 ("N copie identiche dello stesso design") |
| `Wikimania2021_StickerSheet1.svg` / `StickerSheet2.svg` | Fogli adesivi reali evento Wikimania 2021 — CC0 confermato via API Wikimedia Commons | Foglio 5x6" (360x432pt): Sheet1 = un design 82.2x64.4pt ripetuto 6 volte; Sheet2 = un design 44.5x44.5pt ripetuto 8 volte |
| `Wikipedia20_sticker_sheet_1.svg` / `_5.svg` | Fogli adesivi evento Wikipedia 20 — CC0 confermato via API Wikimedia Commons | Foglio 4x6": ripetizioni 4 volte (82.9x64.9pt e 59.1x19.1/88.1x23.8pt) — stress-test "molte copie sullo stesso foglio" |
| `freesvg_car-left-headlight.svg` + `freesvg_car-right-headlight.svg` | freesvg.org / Openclipart 188671-188672, pubblico dominio | Coppia speculare L/R geometricamente vera: il vetro del faro nel file "left" e' un `<use>` con `transform="matrix(-1 .000043716 .000043716 1 1111 -2.9783)"` (scala x = -1) della stessa forma del file "right"; bbox 496.052x202.694 vs 496.048x202.695, riflesso interno a x=7.94 vs x=358.16 (specchiato rispetto al centro). Il file "left" ha in piu' un gruppo etichetta/badge da isolare per il test pulito. Doppio uso: test positivo di riconoscimento coppia L/R + test di import di `<use>` con scala negativa |
| `freesvg_product-labels-and-stickers.svg` | freesvg.org, pubblico dominio | Foglio etichette: stesso design circolare ripetuto 3 volte a bbox identico (231.3x231.3), y costante — caso pulito "design uguali vicini" |
| `freesvg_pair-of-flip-flops.svg` | freesvg.org, pubblico dominio | Paio di infradito: due gruppi con bbox quasi identico (scarto < 0,02 unita') — coppia L/R reale, ma la trasformazione di specchiatura esatta non e' stata verificata analiticamente (nota onesta, a differenza dei fari) |
| `freesvg_jicjac-motorcycle-windshield-exploded-view.svg` | freesvg.org, pubblico dominio; SVG generato da Illustrator 11 | Componente moto (staffa di montaggio, 7 path) duplicato 2 volte con offset costante (dx=113.85, dy≈53.42) — copia traslata, non specchiata: caso "quantita'=2" piu' un test di import (PyMuPDF legge 0 drawings su questo file, serve Inkscape) |
| `hot-rod-flames_openclipart.svg` + `hot-rod-flames-2_openclipart.svg` | Openclipart, CC0/pubblico dominio | Decal di fiancata "hot rod" per UN solo lato (7 path, colori diversi tra i due file ma stessa sagoma): il kit reale = copia + copia specchiata — caso reale piu' vicino a un kit veicolo L/R disponibile gratis |
| `Femnetz_sticker_75x43_PRINT.pdf` | Adesivo evento Wikimedia "FemNetz" — CC BY-SA 4.0 (dichiarata nel testo del PDF, URL corretto: `File:Femnetz-Aufkleber-75x43-PRINT.pdf`) | Dieline singolo adesivo 75x43mm con bleed (pagina 77x45mm), 1 sola istanza — utile per bleed/cut, non per "N copie" |

Non trovato in questa sessione: un kit grafiche motocross/dirt-bike gratuito con pannelli sinistro/destro reali, scaricabile senza login o checkout (Vecteezy, Freepik, mx-vector.com, dirtbiketemplates.com, motosportstemplates.com, vectortemplatestore.com richiedono tutti account o ordine anche per il "campione gratuito" a 0). Pista aperta per il prossimo giro: `hipsters_glases.pdf` su Thingiverse (`https://www.thingiverse.com/thing:401859/files`, CC BY-SA, ARTCAD) — stanghette di occhiali laser-cut, speculari per natura; Thingiverse blocca il download via curl (403 anti-scraping), va preso a mano. Scartato invece `thing:129229` (stessa idea ma CC BY-NC).

## 2. Problemi reali segnalati dagli utenti

Fonti raggiunte: Signs101.com (forum FlexiSIGN/Onyx), forum LightBurn, issue tracker GitHub di
Deepnest (Jack000/Deepnest, MIT — il nesting open source piu' usato dagli hobbisti laser/CNC,
citato nel brief come benchmark). Reddit non raggiungibile via fetch diretto in questa sessione
(403/anti-bot su piu' tentativi); Adobe Community senza thread pertinenti trovati; niente citazioni
dirette da eCut/Arrange Master (solo il confronto architetturale in nota, sezione 3).

### Tema A — pezzi che non entrano/restano nei fori

1. "when I go to nest them, the holes disappear" — forum LightBurn — https://forum.lightburnsoftware.com/t/internal-cutouts-not-showing-when-nesting/120793
2. "only the part outline is shown and the hole cutout has been lost" (export verso SVGnest) — forum LightBurn — https://forum.lightburnsoftware.com/t/shape-hole-within-shape-not-showing-when-nesting-to-svgnest/105747
3. "the holes become disconnected and are placed outside of the part" — Deepnest #191 — https://github.com/Jack000/Deepnest/issues/191
4. "Would be really nice if the parts would nest inside of large holes in other parts" (mai implementata) — Deepnest #146 — https://github.com/Jack000/Deepnest/issues/146
5. "not enough distance when a part is placed in the hole of another part" — Deepnest #42 — https://github.com/Jack000/Deepnest/issues/42
6. "Clearance in holes only half" del gap richiesto — Deepnest #189 — https://github.com/Jack000/Deepnest/issues/189
7. "I had to make an outer shape and combine it to get it to work" (workaround manuale) — Signs101, FlexiSIGN True Shape Nesting — https://www.signs101.com/threads/is-there-a-way-to-auto-nest-multiple-objects-inside-one-shape.120743/
8. "Deepnest is nesting some svg into each other" (comportamento non voluto/non controllabile) — Deepnest #102 — https://github.com/Jack000/Deepnest/issues/102
9. "places parts in the holes of other parts. This is off by default" (part-in-part esiste ma disattivato di default perche' pesante) — Deepnest, readme — https://github.com/Jack000/Deepnest/blob/master/main/readme.md
10. "exporting the nest becomes very slow, often fails" su pezzi con molti fori — Deepnest #75 — https://github.com/Jack000/Deepnest/issues/75

### Tema B — quantita'/coppie L-R/vicinanza

1. "Is there any plan to support mirroring of parts in addition to rotation?" — Deepnest #6, aperta dal 2018, ancora aperta dopo 6+ anni — https://github.com/Jack000/Deepnest/issues/6
2. "pieces I can't define as being a part of another to avoid having it sorted elsewhere" — Deepnest #124 — https://github.com/Jack000/Deepnest/issues/124
3. "Il programma spezza le parole in singole lettere" (perde il raggruppamento) — Deepnest #111 — https://github.com/Jack000/Deepnest/issues/111
4. "If you have loose text, group it and re-nest" (workaround manuale) — Signs101, FlexiSIGN Designer — https://www.signs101.com/threads/flexisign-19-nesting-jobs-question.157740/
5. "This sucks" — materiale sprecato perche' non si puo' raggruppare dal Production Manager — Signs101, Flexi — https://www.signs101.com/threads/uh-this-sucks-flexi-nesting.112452/
6. "When you group files of 1 copy, you can't add spacing between them" — Signs101, Onyx RIP — https://www.signs101.com/threads/make-multiple-copies-in-a-group.122263/
7. "When I use mirror, my letters come out backwards" (specchiatura decal veicolo) — Signs101 — https://www.signs101.com/threads/create-vehicle-decal-for-left-and-right-side.137174/
8. "You'll have to redraw one side by hand to get similar shapes on both" (decal barca L/R) — Signs101 — https://www.signs101.com/threads/please-help-i-need-to-make-a-decal-for-the-left-side-an-right-side-of-a-boat.147374/
9. "This part should be 2 copies" (il nester non piazza la seconda copia) — Deepnest #16 — https://github.com/Jack000/Deepnest/issues/16
10. "Auto duplicazione oggetti Sheet" (richiesta di duplicazione automatica) — Deepnest #181 — https://github.com/Jack000/Deepnest/issues/181
11. "flip every other part upside down, so the tapers align" — Deepnest #185 — https://github.com/Jack000/Deepnest/issues/185

### Ranking (impatto/persistenza)

1. Deepnest #6 "part mirroring" — aperta da oltre 6 anni, ancora irrisolta: il gap piu' eclatante nel nester open source piu' usato, esattamente il bisogno "coppie L/R" del modulo 3. Rinforzata dalle citazioni Signs101 (righe 7-8 sopra): gli utenti risolvono ancora a mano.
2. "I fori spariscono al nesting" (Tema A, righe 1-3, 6) — il problema piu' ricorrente e trasversale a piu' strumenti (LightBurn/SVGnest, Deepnest): non solo mancanza della feature ma bug di correttezza quando la feature esiste a meta'.
3. Deepnest #124 "keep related pieces together" — bisogno esplicito di "vicinanza per design", trasversale a insegne (lettere di una scritta, Deepnest #111) e kit veicoli; confermato indipendentemente dai thread Signs101 su Flexi/Onyx.
4. Deepnest #146/#42/#189 (part-in-part parziale) — anche quando un motore prova a farlo (Deepnest lo ha, spento di default), il risultato e' instabile -> conferma che serve un pre-pass dedicato e deterministico, non una feature generica del solver principale.
5. Deepnest #16/#181/#185 — richieste piu' recenti/generiche su duplicazione e ordine: priorita' minore, utili solo come dettagli implementativi.

## 3. Note tecniche: jagua-rs / Sparrow su fori e part-in-part

### A) Cosa fanno oggi (verificato su GitHub: codice, README, issue/PR reali con permalink)

- `entities/item.rs` (jagua-rs 0.8.3, la versione in uso da Corvo): `Item` ha un solo `shape_cd: Arc<SPolygon>` (poligono semplice) piu' `allowed_rotation` e `min_quality` — nessun campo per fori ne' per riflessione/mirror. Le rotazioni sono supportate, lo specchiamento no.
- `entities/container.rs`: `Container` ha un `outer` piu' fino a `N_QUALITIES` (10) `quality_zones`; una zona a qualita' 0 diventa `HazardEntity::Hole`. I fori sono supportati SOLO a livello di contenitore (il foglio/bin), mai a livello di singolo item — confermato anche dal README, sezione "Currently supports": "Holes and inferior quality zones in containers".
- jagua-rs PR #96 -> #97, "Reject unsupported holes in item geometry": prima un item con un proprio foro (es. la lettera "O" come poligono unico) veniva importato scartando silenziosamente il foro; ora viene rifiutato esplicitamente in fase di import. Testo del PR: "Reject item polygons with holes instead of silently discarding their holes; container holes remain supported." — https://github.com/JeroenGar/jagua-rs/pull/97 — conferma che gli item non hanno mai avuto vero supporto ai fori, ed e' un vincolo voluto dell'engine.
- jagua-rs PR #90: le collisioni contro hazard "Hole"/zona di qualita' inferiore del contenitore sono gestite e visualizzate con la stessa logica delle collisioni item-item.
- Il crate implementa gia' tre varianti di problema in `probs`: `spp` (strip packing, quella usata oggi da Sparrow/Corvo), `bpp` (bin packing a contenitore fisso, completo e utilizzabile) e `mspp` (multi-strip). Corvo oggi abilita solo la feature `spp` nel Cargo.toml.
- Non ci sono NFP/IFP espliciti nel crate: le collisioni si gestiscono con quadtree, hazard e campionamento delle posizioni.
- jagua-rs PR #103, `Layout::register_hazard` (aperta 22/09/2026): registra ostacoli che non sono item veri e propri — caso d'uso dichiarato: nestare un gruppo nello spazio libero lasciato da un gruppo precedente.
- Sparrow PR #168, "Holes: fixed obstacles items are pushed out of..." (dipende da #103): introduce `extra_hazards` per registrare un foro come ostacolo FISSO nel layout, con la guided-local-search che impara a spingere gli item fuori dal foro come gia' fa col bordo del foglio. Caso d'uso testuale del PR: "strip-packing one group of pieces into the free space an earlier group left" — pensato per ostacoli fissi noti in anticipo, non per fori che si muovono insieme al proprio pezzo host durante il nesting.
- Sparrow issue #157, "mirrored/reflected item variants" — rilevantissima per il modulo 3: conferma esplicita che Sparrow oggi non supporta riflessioni, solo trasformazioni rigide proprie (rotazione + traslazione). L'autore stesso propone il workaround "opt-in, senza modifiche al motore": registrare originale e specchiato come due Item regolari distinti, condividendo un "demand pool" di gruppo invece di una quantita' per-Item.
- Sparrow issue #130, "How to specify minimal gap allowed between objects?" — conferma che anche a monte il tema clearance/kerf tra oggetti e' un punto aperto, non solo nostro: utile riferimento per il margine foro-pezzo.
- Ricerca mirata "hole"/"part-in-part"/"nested item" sugli issue di jagua-rs: nessun risultato su part-in-part come funzionalita' nativa pianificata — non e' implementato, e gli hazard fissi (#103/#168) restano lo strumento piu' vicino ma pensato per un uso diverso.
- Paper di riferimento: Sparrow, "An open-source heuristic to reboot 2D nesting research" (arXiv:2509.13329) — parla solo di fori del contenitore, mai di pezzi dentro altri pezzi. Ricerca piu' ampia sulla letteratura accademica classica (Bennell/Oliveira/Burke su "nesting with holes"/"interior placement") non completata in questa sessione per esaurimento del budget WebSearch condiviso tra gli agenti paralleli — limite dichiarato onestamente, da riprendere nel prossimo giro con query mirate.

### B) Modulo 2 — approccio proposto: item composito, pre-pass fuori dal motore (nessuna modifica a jagua-rs/Sparrow)

Dato che jagua-rs rifiuta comunque i fori a livello di singolo item (PR #96/#97), l'unico modo per
passargli "un pezzo con un buco pieno di pezzi piccoli" e' esattamente quanto ipotizzato nel brief:

1. `geometry.js` tiene i fori invece di appiattirli: per ogni pezzo, contorno esterno + anelli interni classificati per contenimento via clipper (funziona sia con fill-rule evenodd sia nonzero — verificato necessario sul file manhole, che li mescola).
2. Filtro dei fori utilizzabili: si restringe ogni foro di `gap` (offset interno via clipper, dato che ne' jagua-rs ne' Sparrow hanno clearance nativa configurabile — issue #130); se il foro sparisce o non ci entra il bbox del pezzo piccolo piu' piccolo del pool, si salta.
3. Un sotto-problema di bin-packing per ogni foro utilizzabile, dal piu' grande al piu' piccolo: il container e' il foro ristretto, gli item sono i pezzi piccoli non ancora assegnati. Si usa il modulo `probs::bpp` gia' presente in jagua-rs (bin fisso), da abilitare con `features = ["spp", "bpp"]` in Cargo.toml — nessuna modifica al crate, solo una feature gia' scritta da attivare.
4. Composizione: pezzo grande + piccoli piazzati nel suo foro diventano UN solo item per il nesting principale, con outline = solo il contorno esterno (identico a oggi per il solver SPP). Le trasformazioni dei piccoli restano relative all'host; quando il solver piazza l'host a (R, T), si applica la stessa trasformazione composta ai piccoli — pura composizione 2D lato host/JS, nessuna modifica al motore.
5. Il foro va sempre ricostruito nell'export finale con il fill-rule corretto, pieno o vuoto che sia — e' esattamente il bug piu' segnalato dagli utenti (Tema A): va trattato come requisito di export, non delegato al motore.
6. UI: interruttore "Usa i fori" (spento di default, coerente con "i fori NON servono in v0.1"), contatore "N fori riempiti / non riempiti", rotazioni dei pezzi-foro limitate a un sottoinsieme per tenere il pre-pass rapido.

Alternativa piu' moderna ma meno matura: usare `register_hazard`/`extra_hazards` di Sparrow (PR #168) per un secondo passaggio di nesting vincolato all'area del foro — stesso risultato finale, ma dipendente da API sperimentale non ancora in una release taggata. Raccomandazione: partire con l'item composito (zero dipendenze instabili), rivalutare l'hazard quando #103/#168 saranno stabili e rilasciati.

Rischi/punti critici:
- Ordine di riempimento greedy (fori grandi prima, un piccolo non va "prenotato" per due fori contemporaneamente — serve fallback al pool generale se il sotto-packing fallisce).
- Conflitto con `cluster.js` (modulo 1): oggi un oggetto il cui bbox ne contiene un altro viene fuso in un pezzo unico. Un pezzo dentro un foro (non sopra la superficie piena dell'host) NON va fuso — la regola va basata sull'intersezione col poligono pieno (fori sottratti), non sul bbox, altrimenti un secondo Nest incollerebbe ogni piccolo al suo host.
- Il report materiale (modulo 5) deve continuare a contare i pezzi piccoli singolarmente pur essendo fusi geometricamente in un item.
- Kerf: sottrarre lo spessore lama/laser dal contorno del foro prima del sotto-packing.
- Regressione modulo 1: il pezzo piccolo nel foro mantiene intatto il proprio colore spot CutContour/Thru-cut, nessuna fusione geometrica dei tracciati.

### C) Modulo 3 — approccio proposto: item separati + post-processing di raggruppamento

- N copie dello stesso design: jagua-rs/Sparrow non hanno nozione di "gruppo" nel solver, ma N copie identiche sono item intercambiabili — scambiarne posizione/rotazione finale non cambia mai la densita' totale. Si lascia risolvere Sparrow come oggi e si applica un post-processo puramente geometrico (nessun nuovo solve): riordinare/scambiare le istanze dello stesso `design_id` per minimizzare la dispersione dei baricentri (greedy locale, economico) — risponde direttamente a Deepnest #124.
- Coppie L/R specchiate: coerente con Sparrow issue #157 (nessuna riflessione nativa) e Deepnest #6 (stesso limite nel nester piu' diffuso). Corvo genera la geometria gia' specchiata (flip X) prima di passarla al solver, come un secondo Item indipendente con un proprio `pair_id`/`design_id` — esattamente il workaround proposto dall'autore della issue upstream Sparrow. Le due meta', dopo il nesting, si riavvicinano con lo stesso post-processo di prossimita' delle N copie, usando come chiave di raggruppamento "stessa forma dopo mirroring" (differenza simmetrica dell'area via clipper ≈ 0).
- Estensione di contratto minima: un campo opzionale `design_id`/`pair_id` sui pezzi, mai letto dal solver Sparrow (non tocca densita'/overlap), solo dal nuovo modulo di post-processo — nome file suggerito `plugin/client/js/grouping.js`, separato da `cluster.js` (che gia' raggruppa oggetti Illustrator in "pezzi" per il modulo 1, concetto diverso).
- Da evitare in v1: una penalita' di distanza dentro il solver Sparrow stesso (richiederebbe modificare il core mentre #103/#168 sono ancora in lavorazione a monte).

## 4. Checklist di accettazione (testabile)

### Modulo 2 — Pezzi dentro i fori

1. Dato un pezzo con un foro (es. lettera "O"/"A"/"R"/"B"/"D"/"8" di Bebas Neue) e un pool di pezzi piccoli compatibili con margine >= kerf: dopo Nest, con "Usa i fori" attivo, almeno un pezzo piccolo risulta interamente dentro il perimetro interno, nessuna sovrapposizione col bordo (controllo poligonale a coppie via clipper, come gia' in `test_e2e.js`).
2. La lunghezza rotolo finale con "Usa i fori" attivo e' sempre <= di quella con l'opzione disattivata sullo stesso file (non deve mai peggiorare la densita').
3. Se nessun pezzo piccolo entra nel foro, il nesting principale procede senza errori, il foro resta vuoto e visibile nell'export, l'UI segnala "N fori non riempiti" (nessun blocco, nessuna sparizione silenziosa come nei bug Tema A).
4. Distanza minima misurata fra bordo del pezzo piccolo e bordo interno del foro >= kerf impostato (tolleranza 0,05mm) — il difetto esatto di Deepnest #42/#189.
5. Su un pezzo con piu' fori (es. "B" o "8", 2 fori ciascuno) ogni foro e' valutato indipendentemente.
6. Compound path annidato (`mdi_record-circle-outline.svg`, anello+disco nello stesso path) resta un solo pezzo: il disco centrale non viene staccato per errore.
7. Fill-rule misto (`manhole_flange_washer_wikimedia.svg`, evenodd e nonzero insieme): import senza errori, fori riconosciuti in entrambi i casi.
8. Falso foro (`ring-of-flames_openclipart.svg`, 16 pezzi separati): il vuoto centrale NON viene trattato come foro a meno che il modulo 1 fonda prima i pezzi.
9. Dopo Applica, il pezzo piccolo mantiene il proprio colore spot CutContour/Thru-cut (nessuna regressione sul modulo 1); il report materiale (quando implementato) lo conta come pezzo separato.
10. `corvoRevert()` riporta anche i pezzi piazzati nei fori alla posizione originale, stesso contratto assoluto per indice `i` di oggi; un secondo Nest dopo un Applica con i fori non fonde i piccoli con l'host (conflitto `cluster.js`).
11. Tempo aggiuntivo del pre-pass su un file con ~10 lettere/fori e ~30 candidati: entro un budget dichiarato (es. < 2s, < 20% del tempo totale) da misurare al primo test reale. Nessuna regressione su `insegna48.svg`/`lettering.svg`.

### Modulo 3 — Quantita'/coppie L-R/vicinanza

1. Dato N=6/8/12 copie identiche di un adesivo (es. celle di `Wikimania2021_StickerSheet1/2.svg` o `avery22806_square_labels`), dopo Nest tutte le istanze sono piazzate (nessuna persa) e raggruppabili in un bounding box compatto — non sparse ai quattro angoli del rotolo.
2. La lunghezza rotolo con "raggruppa design uguali" attivo non peggiora oltre una soglia dichiarata (da fissare al primo test) rispetto a senza raggruppamento sullo stesso file.
3. Dato un pannello e il suo mirror generato da Corvo (test principale su `freesvg_car-right-headlight.svg` -> genera la "left" e confronta col file reale tolto il badge): differenza simmetrica dell'area via clipper ≈ 0 entro tolleranza dichiarata; import corretto di `<use>` a scala negativa.
4. Le due meta' di una coppia L/R, dopo Applica, hanno baricentri a distanza <= soglia dichiarata (misura diretta di "coppie vicine", il bisogno di Deepnest #124) e sono riconoscibili/abbinate nell'export (etichetta o raggruppamento) per la fase di taglio/imbustamento.
5. Nessun pezzo mirror viene ruotato dal solver per tentare di farlo combaciare con l'originale (verifica su orientamento vertici/determinante della trasformazione < 0) — dato che Sparrow non modella la riflessione (issue #157), un flip simulato con rotazione sarebbe un bug.
6. `corvoRevert()` ripristina esattamente coppie e copie multiple come pezzi indipendenti, stesso contratto assoluto di oggi.
7. Import di fedelta': `freesvg_jicjac-motorcycle-windshield-exploded-view.svg` (SVG da AI11, PyMuPDF legge 0 drawings) si importa correttamente in Illustrator/Corvo.
8. Nessuna regressione sulla suite di controllo (`insegna48.svg`, `lettering.svg`): stessa lunghezza rotolo (tolleranza 10%) quando "quantita'/coppie" e' disattivato o non applicabile.

## 5. Prossimi passi consigliati per il prossimo giro

- Cercare un vero DXF/SVG di guarnizione industriale gratuito (es. McMaster-Carr o simili) per sostituire il sostituto `mdi_circle-double.svg`.
- Scaricare a mano `hipsters_glases.pdf` da Thingiverse (CC BY-SA, ARTCAD, `thing:401859`) come secondo caso reale di coppia L/R; Thingiverse blocca il download automatico via curl.
- Trovare/procurare un vero kit veicolo L/R (nessuno reperibile gratis senza login in questa sessione; valutare pannelli kayak/canoa CNC "left/right hull" come alternativa piu' reperibile, o acquistarne uno per i test beta).
- Ripetere la ricerca problemi utente su Reddit (r/vinylcutting, r/lasercutting, r/signmaking) con un agente dotato di browser reale (claude-in-chrome) invece di WebFetch puro, bloccato in questa sessione; verificare a mano la documentazione eCut/Arrange Master per la frase "Container holes remain unavailable" citata nel brief.
- Completare la ricerca su letteratura accademica classica (Bennell/Oliveira/Burke, "nesting with holes"/"interior placement") non raggiunta per esaurimento budget WebSearch in questo giro.
- Provare a compilare la feature `bpp` di jagua-rs 0.8.3 in `corvo-wasm` (verificare che compili su target wasm32): e' il primo mattone tecnico del modulo 2.
