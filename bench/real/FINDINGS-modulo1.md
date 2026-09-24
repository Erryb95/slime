# Modulo 1 — Fedelta' al file: risultati ricerca (2026-09-23)

## File reali (bench/real, non committati; fonti in SOURCES.md)
| File | Oggetti | Livelli | Spot di taglio | Bleed | Gruppi/maschere | Testo vivo |
|---|---|---|---|---|---|---|
| printcut/kiss-cut-sticker-template.ai (Sticker Mule) | 12 | Artwork / Cut line / Instructions | Kiss Cut + Through Cut | si' | no | no |
| printcut/die-cut-sticker-template.ai | 11 | idem | Through Cut sagomato | si' | no | no |
| printcut/11x8.5-sticker-sheet.ai | 430 | idem | Through Cut Rectangle | - | 1 clip | no |
| printcut/Tempo-100 sticker.pdf (CC0) | 3 | OCG | nessuno (cerchio grigio) | bordo bianco | gruppi | si' |
| printcut/Wikipedia20_sticker_sheet_1.svg (CC0) | 17 gruppi | - | - | bordo bianco | prof. 8, 17 clip | no |
| printcut/Wikimania2021_StickerSheet1.svg (CC0) | 597 sciolti | - | - | bordo bianco | 9 clip | no |
| kit/Tempo-100 car.pdf, Korea_Coast_Guard_racing_stripe_2018.svg, 4 Openclipart CC0 (strisce, fiamme, tribali) | 1-34 | layer1 | - | - | alcuni clip | no |

Buco: template kit moto/auto veri (carene, parti L/R) solo a pagamento (~15-21 EUR, mx-vector.com).

## Problemi utenti (per frequenza)
1. CutContour non spot/rinominato/appiattito -> stampato invece che tagliato (6 fonti; Adobe Community, Signs101).
2. Gruppi e compound path trattati male: "set in stone" (eCut), spezzati (Deepnest #27, #29) (5).
3. Nesting che separa stampa e taglio (Flexi, Rasterlink) (4).
4. Pezzi su piu' livelli (eCut "wouldnt nest properly with multiple layers") (4).
5. Maschere e trasparenze (2). 6. Crocini di registro (2). 7. Bleed e distanze (2).
8. Tracciati superflui trattati come tagli. 9. Linee di taglio doppie (linea comune: non modulo 1).

## Checklist di accettazione
- A1 kiss-cut template: ogni tracciato resta sul suo livello, conteggi per livello invariati.
- A2 Kiss Cut / Through Cut: stesso nome spot, tipo Spot, stesso spessore, nessun riempimento, stessa sovrastampa.
- A3 arte su livello A + taglio su livello B si muovono come un pezzo: scarto <= 0,01 mm, livelli invariati.
- A4 ordine di sovrapposizione conservato (taglio sopra arte).
- A5 nomi di taglio riconosciuti: CutContour, PerfCutContour, Thru-cut, Through Cut, Kiss Cut, CutContour_Flex (configurabili); avviso se "CutContour" e' in quadricromia.
- B1 Wikipedia20: 17 pezzi, struttura interna identica. B2 Wikimania2021: cluster di oggetti sovrapposti stabili.
- B3 gruppo con maschera nestato sulla maschera. B4 compound path intatto. B5 taglio raggruppato con l'arte resta nel gruppo.
- C1 distanza misurata dal taglio, non dal bleed. C2 distanza taglio-taglio rispettata. C3 rettangolo Through Cut del foglio = contenitore o avviso.
- D1 testo vivo: avviso, non convertito. D2 immagini/simboli si muovono col pezzo. D3 bloccati/nascosti/livello Instructions esclusi.
- E1 round-trip AI/PDF 1.4/EPS: stesse Separation e OCG. E2 un solo annulla. E3 nessun oggetto creato/cancellato. E4 regressione insegna48/lettering +-0,5%.
