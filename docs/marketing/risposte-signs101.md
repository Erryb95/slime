**Nesting rigid materials**

For sheet goods, the first thing to fix is your layer structure before nesting. Keep cut lines on their own layer and check that every path is a closed compound path; open or overlapping paths are what usually break true-shape nesting and force everything back into rectangles. For acrylic, PVC and ACM, set a sheet margin and a grain direction constraint, then nest per sheet rather than one big run. Run a scrap-first pass: place small parts into the holes of letters and logos, that alone recovers a lot on rigid sheets. Prove it on one sheet before committing a full run.

Full disclosure: I'm building an Illustrator nesting plugin (not released yet) and tested this exact kind of job; happy to run your file if you want to see the result.

**Nesting software suggestions**

Shape-based nesting inside Illustrator is the practical route if you already build artwork there, because you skip the export/import step that usually breaks cut lines. What to check before you buy anything: does it keep print and CutContour together when they sit on different layers, does it preserve spot colors and layer names, and is the whole nest a single undo. Ask for a live preview, not a batch-only mode, so you can nudge parts before committing. For volume, ask how long 50 parts takes; anything past a minute per nest gets old fast on daily work. Also confirm it handles mirrored pairs and multiple copies per design, since sign work needs both constantly.

Full disclosure: I'm building an Illustrator nesting plugin (not released yet) and tested this exact kind of job; happy to run your file if you want to see the result.

**Job batching software**

The batching problem is usually upstream of the nesting tool. Group orders by material and thickness first, then by vinyl color, and only then nest; mixing colors in one nest is what forces you into separate rolls anyway. Build one consolidated cut file per material per run, keep quantities in a simple CSV so you can re-import if a job gets pulled, and keep the original per-order files archived in case of a reprint. If you're on Switch or Caldera, use them for the routing and file consolidation, and let the nesting happen at the end on the merged list. One roll per vinyl color, one sheet per rigid material, is the rule that keeps it sane.

Full disclosure: I'm building an Illustrator nesting plugin (not released yet) and tested this exact kind of job; happy to run your file if you want to see the result.

**eCut for AI problems**

That "stuck in a bounding box" behavior is how eCut treats anything grouped or compound: it nests the rectangle around the group, not the outline. Two things help: ungroup everything down to single closed paths before you run it, and release compound paths that don't need to stay compound (letters with counters do need to). Keep the cut line on its own layer and run the nest on that layer only, then move the print artwork back with the same offsets. It works, but it's the step that costs the material, because grouped print+cut stickers are exactly what you want kept together. If a sticker has to stay one object with its cut line, eCut can't do that shape-accurate; that's a limit of the tool, not of your file.

Full disclosure: I'm building an Illustrator nesting plugin (not released yet) and tested this exact kind of job; happy to run your file if you want to see the result.

**Weeding small labels**

25 hours of weeding means the layout is fighting you, not the vinyl. Two fixes you can apply today: increase spacing between labels so the waste vinyl lifts in bigger sections instead of individual letters, and add a weed border plus internal cut lines that break the waste into manageable chunks. For 6x1.25 in labels with small text, rotate the whole run so the text runs with the roll, which makes the waste pull in one direction. Also check your cut pressure and blade offset; too deep a cut makes small counters tear and slows weeding. If you can, group labels by text size so you weed similar detail in one pass.

Full disclosure: I'm building an Illustrator nesting plugin (not released yet) and tested this exact kind of job; happy to run your file if you want to see the result.