Illustrator verification of modules 2, 3, 4, 5, 6, 7, 8, 9 (Corvo panel open, CEP debug port 8093; run ONE at a time:
they all drive the same panel). Documents are opened/created via ExtendScript and closed without saving.
Never touches the desktop (no foreground, no keys): CDP to the panel only.

  node m2.js [secs=20]            Bebas OARBDQ890 + 18 small pieces + Roundel ring + mdi record: holes OFF/ON,
                                  children inside holes with clearance, spot colours, one undo, Cancel.
  node m56.js [copies=12] [secs=10] [graphtec,summa,roland,mimaki]
                                  kiss-cut template x N: report vs measured, CSV via the panel button (save dialog
                                  stubbed), marks geometry per spec, keep-out, one undo incl. marks, Cancel.
  node m8.js [secs=15]            linked/embedded/mirrored/rotated PNGs from bench/real/dtf: linked path == render,
                                  DTF 58 preset, rigid move with the contour, 6 mm spacing, one undo.
  node undo6.js [n] [system] [secs]   repeat Apply + one undo with marks (EDIT=1: user nudge during review ->
                                  single undo must be skipped and the nudge kept).
  node m3.js [secs=12]            Avery 22806 labels A x8 / B x4 (print + spot + CutContour on 2 layers) and the real right
                                  headlight x2 + S+D: ghosts during the search, duplicates on Apply (layers, spots, rigid
                                  copies, exact mirror), one undo removes copies, redo, Cancel removes ghosts.
  node m47.js [secs=12] [color|laser|<label regex>]
                                  4: flags + colourful alphabet by fill colour (one roll per colour, labels, report per
                                  colour, Containers_rif, one undo, Cancel). 7: ClosedBox / DividerTray / AgricolaInsert on
                                  600x400 and 1220x2440 (sheets, margin 10 mm, gap, grain 0/180); Agricola: annotation text
                                  outside p-7/p-8 -> clear error, then deleted.
  node m9.js                      trial badge, simulated expiry (licence record saved and restored), Pro options locked,
                                  Apply limit 10 incl. copies, Pro preset refused, tampered/Standard/Pro keys from
                                  tools/release/license-gen.mjs, key kept after reload.
  node hostload.js [secs=8]       panel reload + corvoHealth(), simulated failed module load -> panel fallback at global
                                  scope, flag_italy copy by fill colour = 3 rolls, insegna48 copy Graphtec marks after
                                  Apply and gone after app.undo() (copies in %TEMP%\corvo_hostload, closed unsaved).
