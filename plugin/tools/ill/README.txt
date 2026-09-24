Illustrator verification of modules 2, 5, 6, 8 (Corvo panel open, CEP debug port 8093; run ONE at a time:
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
