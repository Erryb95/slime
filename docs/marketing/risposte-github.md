**Comment 1 — deepnest-next #154**

I analyzed the attached DXF (`test-nesting-issue.dxf`). It contains 614 open POLYLINE entities. Chaining them by endpoints with a 0.25 pt tolerance yields 23 closed contours forming 4 parts. With those parts, nesting completes in 24.5 s (30 s budget), min distance 2.18 mm, no overlaps. The DXF does not declare units (`$INSUNITS` absent); read as mm, extents are 70.2 x 41.9. Likely cause: the open polylines never get closed, so the polygon input degenerates and the solver fails to converge. Practical suggestion: run an endpoint-chaining pass with a small tolerance before polygon construction, and fall back to a sane default unit when `$INSUNITS` is missing. Also worth logging the contour count after chaining to catch this early.

Disclosure: I'm building a separate nesting plugin for Illustrator and used this file as a test case; happy to share the converted file or the measurements.

**Comment 2 — deepnest-next #149**

Checked the attached `025-copy-change-ext-to.dxf`. The header has conflicting units: `$INSUNITS = 4` (mm) but `$MEASUREMENT = 0` (imperial). Reading `$INSUNITS`, dimensions come out 484.63 x 401.97 mm, consistent with `$EXTMIN`/`$EXTMAX`. The file holds 1 closed SPLINE (cut) + 4 open SPLINEs (folds) + text. Likely cause: the importer honors `$MEASUREMENT` (or a fallback) over `$INSUNITS`, so the scale is off by 25.4x. Suggestion: prioritize `$INSUNITS` when present, and warn the user when the two headers disagree instead of silently picking one. Optionally expose a unit override at import time.

Disclosure: I'm building a separate nesting plugin for Illustrator and used this file as a test case; happy to share the converted file or the measurements.

**Comment 3 — SVGnest #122**

Compared the original DXF, the exported SVG (QCAD, with a `scale(1,-1)` transform) and the PDF. Arcs recomputed from the DXF bulges match the SVG within 0.04–0.11 mm, so the arc geometry is not flipped. The inversion shows up when the SVG parser ignores the group's `scale(1,-1)` transform, or mishandles the `A` command's sweep-flag after a reflection — under a reflection the sweep-flag must be inverted. Full DXF nest (232 parts) ran with no overlaps. Suggestion: apply group transforms before arc conversion, and flip the sweep-flag whenever the accumulated transform has negative determinant.

Disclosure: I'm building a separate nesting plugin for Illustrator and used this file as a test case; happy to share the converted file or the measurements.