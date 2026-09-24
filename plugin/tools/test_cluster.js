// Unit tests (Node, no Illustrator) for module 1 "fidelity to the file":
//   client/js/cluster.js (registration marks, union-find on boxes, shape source, errors)
//   host/corvo.jsx pure helpers (corvo_isCutName) loaded in a vm sandbox.
// uso: node plugin/tools/test_cluster.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const C = require(path.join(__dirname, '..', 'client', 'js', 'cluster.js'));
const MM = 72 / 25.4;

let fails = 0, n = 0;
function check(cond, msg) { n++; console.log((cond ? '  OK   ' : '  FAIL ') + msg); if (!cond) fails++; }

// ---------------------------------------------------------------- host helpers in a sandbox
const sb = { $: { global: {} } };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'host', 'corvo.jsx'), 'utf8'), sb);
console.log('corvo_isCutName');
for (const s of ['CutContour', 'cutcontour', 'Cut Contour', 'CUT-CONTOUR', 'CutContour 2', 'Thru-cut', 'ThruCut', 'Through Cut',
  'Kiss-cut', 'kiss_cut', 'Cut', 'CUT', 'Die-Cut', 'Cutline', 'Cut Line', 'Taglio', 'Through Cut Rectangle', 'Through Cut Round Corners', 'CONTOUR']) check(sb.corvo_isCutName(s) === true, `"${s}" is a cut color`);
for (const s of ['Cutting Mat Green', 'PANTONE 485 C', 'Cyan', 'Scut', 'Uncut', 'Contour Blue', '', null, 'Shortcut', 'White']) check(sb.corvo_isCutName(s) === false, `"${s}" is not a cut color`);

// ---------------------------------------------------------------- helpers
const rect = (l, b, w, h) => [[l, b], [l + w, b], [l + w, b + h], [l, b + h]];
const boxOf = (rings) => { let l = 1e30, t = -1e30, r = -1e30, b = 1e30; for (const g of rings) for (const [x, y] of g) { l = Math.min(l, x); r = Math.max(r, x); b = Math.min(b, y); t = Math.max(t, y); } return [l, t, r, b]; };
const circle = (cx, cy, rad, k = 48) => Array.from({ length: k }, (_, i) => [cx + rad * Math.cos(2 * Math.PI * i / k), cy + rad * Math.sin(2 * Math.PI * i / k)]);
let nextI = 0;
function vec(layer, rings, extra) { const it = Object.assign({ i: nextI++, name: 'o' + nextI, type: 'PathItem', layer, rings, box: boxOf(rings) }, extra || {}); if (extra && extra.other) it.box = boxOf(rings.concat(extra.other)); return it; }

// ---------------------------------------------------------------- clusterBoxes
console.log('clusterBoxes');
{
  const g = C.clusterBoxes([[0, 10, 10, 0], [9.6, 10, 20, 0], [30, 10, 40, 0], [2, 8, 8, 2]], 0.5);
  check(JSON.stringify(g) === '[[0,3],[1],[2]]', `0.4 pt overlap stays apart, contained merges: ${JSON.stringify(g)}`);
  const g2 = C.clusterBoxes([[0, 10, 10, 0], [9, 10, 20, 0], [19, 10, 30, 0]], 0.5);
  check(JSON.stringify(g2) === '[[0,1,2]]', `chain of overlaps -> one group: ${JSON.stringify(g2)}`);
  const g3 = C.clusterBoxes([[0, 10, 10, 0], [5, 10, 15, 0]], 0.5, () => false);
  check(g3.length === 2, 'partial overlap + shapes not touching -> apart');
  const g4 = C.clusterBoxes([[0, 10, 10, 0], [2, 8, 8, 2]], 0.5, () => false);
  check(g4.length === 1, 'containment merges even if shapes do not touch');
}

// ---------------------------------------------------------------- print & cut sheet
console.log('planPieces: print&cut sheet (12 stickers, bleed 3 mm, 4 reg marks)');
nextI = 0;
const AB = [0, 800, 600, 0];            // artboard l,t,r,b
const bleed = 3 * MM, items = [];
for (let k = 0; k < 12; k++) {
  const cx = 90 + (k % 4) * 140, cy = 170 + Math.floor(k / 4) * 220, w = 60 + k * 4, h = 80;
  const cut = rect(cx - w / 2, cy - h / 2, w, h);
  const print = rect(cx - w / 2 - bleed, cy - h / 2 - bleed, w + 2 * bleed, h + 2 * bleed);
  if (k % 2) items.push(vec('PRINT', [], { type: 'RasterItem', other: [print], nonVector: 1 }));
  else items.push(vec('PRINT', [print]));
  items.push(vec('CUT', [cut], { cut: [0], cutSpots: ['CutContour'] }));
}
const regs = [[20, 780], [580, 780], [20, 20], [580, 20]].map(([x, y]) => vec('Reg', [rect(x - 7, y - 7, 14, 14)]));
items.push(...regs);
{
  const p = C.planPieces(items, { shape: 'cut', artboards: [AB] });
  check(!p.error, 'no error ' + JSON.stringify(p.error || ''));
  check(p.pieces.length === 12, `12 pieces (got ${p.pieces.length})`);
  check(p.pieces.every(x => x.members.length === 2), 'each piece = print + cut');
  check(p.pieces.every(x => x.source === 'cut'), 'shape from the cut line');
  check(p.pieces.every(x => x.rings.length === 1 && Math.abs(boxOf(x.rings)[2] - boxOf(x.rings)[0] - (items[x.members[1]].box[2] - items[x.members[1]].box[0])) < 1e-9), 'bleed ignored (ring = cut path)');
  check(p.excluded.length === 4 && p.excluded.every(e => e.reason === 'regMark'), `4 registration marks excluded (${p.excluded.length})`);
  check(p.warnings.merged.objects === 24 && p.warnings.merged.pieces === 12, 'merge stats 24 objects -> 12 pieces');
  const pa = C.planPieces(items, { shape: 'all', artboards: [AB] });
  check(!pa.error && pa.pieces.length === 12 && pa.pieces.every(x => x.source === 'all'), 'shape "all": 12 pieces');
  const big = pa.pieces.find(x => items[x.members[0]].type === 'RasterItem');   // raster print (odd sticker)
  check(big && boxOf(big.rings)[2] - boxOf(big.rings)[0] > items[big.members[1]].box[2] - items[big.members[1]].box[0] + 2 * bleed - 1e-6, 'shape "all" includes the raster print + bleed');
}
{
  // merge off: rasters alone must be an error, vector prints fall back to "all"
  const pm = C.planPieces(items, { shape: 'cut', merge: false, artboards: [AB] });
  check(pm.error && pm.error.code === 'rasterOnly' && pm.error.n === 6, `merge off -> 6 raster-only pieces error (${JSON.stringify(pm.error)})`);
}

// ---------------------------------------------------------------- tight sheet: cut lines 2 mm apart, bleed 3 mm
console.log('planPieces: already-nested sheet, bleeds overlap the neighbours');
nextI = 0;
{
  const tight = [];
  for (let k = 0; k < 6; k++) {
    const l = k * (50 + 2 * MM), b = 0;
    tight.push(vec('PRINT', [rect(l - bleed, b - bleed, 50 + 2 * bleed, 60 + 2 * bleed)]));
    tight.push(vec('CUT', [rect(l, b, 50, 60)], { cut: [0] }));
  }
  const pc = C.planPieces(tight, { shape: 'cut', artboards: [] });
  check(pc.pieces.length === 6 && pc.pieces.every(x => x.members.length === 2 && x.members[1] === x.members[0] + 1), `"cut": 6 stickers stay separate, each print with its own cut (${pc.pieces.map(x => x.members.join('+')).join(' ')})`);
  const pa = C.planPieces(tight, { shape: 'all', artboards: [] });
  check(pa.pieces.length === 1, `"all": overlapping bleeds are one block (${pa.pieces.length})`);
  // a print with no cut line of its own, not touching any cut -> fallback piece
  const lone = vec('PRINT', [rect(1000, 0, 40, 40)]);
  const pl = C.planPieces(tight.concat([lone]), { shape: 'cut', artboards: [] });
  check(pl.pieces.length === 7 && pl.warnings.cutFallback === 1, 'loose print without cut line -> its own fallback piece');
}

// ---------------------------------------------------------------- cut fallback, text, lines
console.log('planPieces: fallback / text / raster / lines');
nextI = 0;
{
  const a = vec('L1', [rect(0, 0, 100, 100)]);                                     // no cut color
  const b = vec('L1', [rect(300, 0, 100, 100)], { cut: [0] });
  const p = C.planPieces([a, b], { shape: 'cut', artboards: [[-1000, 1000, 1000, -1000]] });
  check(p.pieces.length === 2 && p.warnings.cutFallback === 1 && p.pieces[0].source === 'fallback', 'no cut line -> fallback to all art, counted');
  const txt = vec('L1', [], { type: 'TextFrame', text: 3 }); txt.box = [500, 100, 600, 50];
  const p2 = C.planPieces([a, txt], { shape: 'all', artboards: [] });
  check(p2.error && p2.error.code === 'text' && p2.error.n === 3, 'live text alone -> error with count 3');
  const txtIn = vec('L1', [], { type: 'TextFrame', text: 1 }); txtIn.box = [310, 60, 390, 40];
  const p3 = C.planPieces([b, txtIn], { shape: 'cut', artboards: [] });
  check(!p3.error && p3.pieces.length === 1 && p3.pieces[0].members.length === 2, 'text inside a sticker with a cut line is a passenger in "cut" mode');
  const p4 = C.planPieces([b, txtIn], { shape: 'all', artboards: [] });
  check(p4.error && p4.error.code === 'text', 'same sticker in "all" mode, text box unknown -> text error (conservative)');
  // text boxes exported by the host: text INSIDE the piece area does not define the shape (laser part labels)
  const txtBox = vec('L1', [], { type: 'TextFrame', text: 1, textBoxes: [[310, 60, 390, 40]] }); txtBox.box = [310, 60, 390, 40];
  const p6 = C.planPieces([b, txtBox], { shape: 'all', artboards: [] });
  check(!p6.error && p6.pieces.length === 1 && p6.pieces[0].members.length === 2 && p6.warnings.textInside === 1, 'text box inside the piece area in "all" mode -> passenger, no error');
  const txtOut = vec('L1', [], { type: 'TextFrame', text: 1, textBoxes: [[350, 60, 450, 40]] }); txtOut.box = [350, 60, 450, 40];
  const p7 = C.planPieces([b, txtOut], { shape: 'all', artboards: [] });
  check(p7.error && p7.error.code === 'text', 'text sticking out of the piece -> text error');
  const frame = vec('L1', [rect(0, 0, 200, 200), rect(50, 50, 100, 100)]);          // outline + hole (laser frame)
  const txtHole = vec('L1', [], { type: 'TextFrame', text: 1, textBoxes: [[80, 120, 120, 80]] }); txtHole.box = [80, 120, 120, 80];
  const txtBody = vec('L1', [], { type: 'TextFrame', text: 1, textBoxes: [[10, 30, 40, 10]] }); txtBody.box = [10, 30, 40, 10];
  check(C.planPieces([frame, txtHole], { shape: 'all', artboards: [] }).error, 'text over the hole of a frame -> text error');
  check(!C.planPieces([frame, txtBody], { shape: 'all', artboards: [] }).error, 'text on the body of a frame -> no error');
  const line = vec('L1', []); line.box = [700, 10, 800, 10];
  const p5 = C.planPieces([a, line], { shape: 'all', artboards: [] });
  check(p5.pieces.length === 1 && p5.warnings.noContour === 1, 'a lone line is skipped with a warning');
}

// ---------------------------------------------------------------- lettering: kerned letters with overlapping boxes
console.log('planPieces: kerned letters, decal of overlapping shapes');
nextI = 0;
{
  // "T" and "o" tucked under its arm: boxes overlap, shapes do not
  const T = vec('L', [[[0, 90], [100, 90], [100, 100], [0, 100]].concat([]), [[45, 0], [55, 0], [55, 90], [45, 90]]]);
  const o = vec('L', [circle(85, 30, 25)]);
  const p = C.planPieces([T, o], { shape: 'all', artboards: [] });
  check(p.pieces.length === 2, `T + o with overlapping boxes but separate shapes -> 2 pieces (${p.pieces.length})`);
  // decal: two overlapping circles, same layer -> one piece
  const c1 = vec('L', [circle(300, 50, 40)]), c2 = vec('L', [circle(360, 60, 40)]);
  const p2 = C.planPieces([c1, c2], { shape: 'all', artboards: [] });
  check(p2.pieces.length === 1, 'two overlapping shapes -> 1 piece');
  // touching within 0.25 pt -> merge; 1 pt apart with overlapping boxes (diagonal circles) -> apart
  const d1 = vec('L', [circle(0, 0, 50)]), d2 = vec('L', [circle(72, 72, 50)]);    // centre distance 101.8 -> 1.8 pt gap
  const p3 = C.planPieces([d1, d2], { shape: 'all', artboards: [] });
  check(p3.pieces.length === 2, 'diagonal circles 1.8 pt apart (boxes overlap) -> 2 pieces');
}

// ---------------------------------------------------------------- registration marks heuristics
console.log('registration marks');
{
  check(C.isRegLayerName('Reg') && C.isRegLayerName('Reg Marks') && C.isRegLayerName('RegMarks') && C.isRegLayerName('registration')
    && C.isRegLayerName('OPOS marks') && C.isRegLayerName('Crocini') && C.isRegLayerName('Marks') && C.isRegLayerName('reg_marks'), 'layer names recognised');
  check(!C.isRegLayerName('Regular') && !C.isRegLayerName('Print') && !C.isRegLayerName('CutContour') && !C.isRegLayerName('Watermarks') && !C.isRegLayerName('Layer 1'), 'ordinary layer names not flagged');
  nextI = 0;
  const mark = vec('Layer 1', [circle(20, 780, 8)]);                 // 16 pt circle near a corner
  const sticker = vec('Layer 1', [rect(10, 760, 30, 30)]);            // small sticker overlapping it
  const lone = vec('Layer 1', [circle(300, 400, 8)]);                 // tiny but in the middle
  const p = C.planPieces([mark, lone], { artboards: [AB] });
  check(p.excluded.length === 1 && p.excluded[0].i === mark.i, 'corner mark excluded, mid-sheet dot kept');
  const p2 = C.planPieces([mark, sticker], { artboards: [AB] });
  check(p2.excluded.length === 0, 'a mark touching art is not excluded');
  const p3 = C.planPieces([mark, lone], { artboards: [AB], regMarks: false });
  check(p3.excluded.length === 0 && p3.pieces.length === 2, 'regMarks:false keeps everything');
}

// ---------------------------------------------------------------- sheet frames (real files: Sticker Mule 11x8.5, Wikipedia20)
console.log('sheet frames and locked cut lines');
{
  nextI = 0;
  const sheet = [];
  for (let k = 0; k < 6; k++) {
    const l = 60 + (k % 3) * 180, b = 300 - Math.floor(k / 3) * 200;
    sheet.push(vec('Artwork', [rect(l - 9, b - 9, 138, 138)]));
    sheet.push(vec('Artwork', [circle(l + 60, b + 60, 60)], { cut: [0], cutSpots: ['Kiss Cut'] }));
  }
  const frame = vec('Cut line', [rect(27, 50, 600, 450)], { cut: [0], cutSpots: ['Through Cut Rectangle'] });
  const pf = C.planPieces(sheet.concat([frame]), { shape: 'cut', artboards: [[-54, 700, 900, -500]] });
  check(pf.pieces.length === 6 && pf.warnings.sheetFrames === 1 && pf.excluded.some(e => e.reason === 'sheetFrame' && e.i === frame.i),
    `unlocked Through Cut Rectangle around 6 stickers -> frame left in place, 6 pieces (${pf.pieces.length}, frames ${pf.warnings.sheetFrames})`);
  const pfa = C.planPieces(sheet.concat([frame]), { shape: 'all', artboards: [[-54, 700, 900, -500]] });
  check(pfa.pieces.length === 6 && pfa.warnings.sheetFrames === 1, `same in "all" mode (${pfa.pieces.length})`);
  // kiss-cut template: Through Cut rect around ONE sticker = its backing, part of the piece
  const one = [vec('Art', [rect(10, 10, 300, 280)]), vec('Cut', [rect(0, 0, 320, 300)], { cut: [0] }), vec('Cut', [circle(160, 150, 120)], { cut: [0] })];
  const p1 = C.planPieces(one, { shape: 'cut', artboards: [] });
  check(p1.pieces.length === 1 && p1.pieces[0].members.length === 3 && !p1.warnings.sheetFrames, 'through cut around a single sticker stays part of it');
  // artboard-size background (Wikipedia20) around 17 stickers
  const AB2 = [0, 432, 360, 0], st = [];
  for (let k = 0; k < 4; k++) st.push(vec('L', [circle(60 + (k % 2) * 180, 100 + Math.floor(k / 2) * 200, 50)]));
  const bg = vec('L', [rect(0, 0, 360, 432)]);
  const pb = C.planPieces(st.concat([bg]), { shape: 'all', artboards: [AB2] });
  check(pb.pieces.length === 4 && pb.warnings.sheetFrames === 1, `artboard-size background -> left in place, 4 pieces (${pb.pieces.length})`);
  // a big non-artboard shape behind two logos is artwork, not a frame
  const pn = C.planPieces(st.slice(0, 2).concat([vec('L', [rect(0, 40, 300, 130)])]), { shape: 'all', artboards: [[-2000, 2000, 2000, -2000]] });
  check(pn.pieces.length === 1 && !pn.warnings.sheetFrames, 'a background smaller than the artboard is art (1 piece)');

  // locked cut lines (corvoExport().lockedCuts)
  const art = sheet.filter((_, k) => k % 2 === 0);
  const lcSticker = sheet.filter((_, k) => k % 2 === 1).map(c => ({ spot: 'Kiss Cut', layer: 'Cut line', reason: 'locked', box: c.box }));
  const pl = C.planPieces(art, { shape: 'cut', artboards: [], lockedCuts: lcSticker });
  check(pl.error && pl.error.code === 'lockedCut' && pl.error.n === 6 && pl.error.layers[0] === 'Cut line', `art selected, its kiss cuts on a locked layer -> error (${JSON.stringify(pl.error)})`);
  const lcFrame = [{ spot: 'Through Cut Rectangle', layer: 'Cut line', reason: 'locked', box: frame.box }];
  const pl2 = C.planPieces(sheet, { shape: 'cut', artboards: [], lockedCuts: lcFrame });
  check(!pl2.error && pl2.pieces.length === 6 && pl2.warnings.lockedFrames && pl2.warnings.lockedFrames.n === 1, 'locked sheet frame around the stickers -> note only');
  const far = [{ spot: 'CutContour', layer: 'Old', reason: 'hidden', box: [5000, 100, 5100, 0] }];
  const pl3 = C.planPieces(sheet, { shape: 'cut', artboards: [], lockedCuts: far });
  check(!pl3.error && !pl3.warnings.lockedFrames, 'a locked cut line far from the pieces is ignored');
  const pl4 = C.planPieces([one[0]], { shape: 'cut', artboards: [], lockedCuts: [{ spot: 'Through Cut', layer: 'Cut line', reason: 'locked', box: one[1].box }] });
  check(pl4.error && pl4.error.code === 'lockedCut', 'locked through cut around ONE selected sticker -> error (it is its backing)');
}

// ---------------------------------------------------------------- filled area per source path
console.log('filled area');
{
  const G = require(path.join(__dirname, '..', 'client', 'js', 'geometry.js'));
  const big = rect(0, 0, 100, 100), small = rect(25, 25, 50, 50);
  check(Math.abs(G.filledArea([big, small]) - 7500) < 1, 'no groups: even-odd (v0.1: letter counters are holes)');
  check(Math.abs(G.filledArea([big, small], [1, 2]) - 10000) < 1, 'two paths: shape on top of a background does not cancel it');
  check(Math.abs(G.filledArea([big, small], [1, 1]) - 7500) < 1, 'one compound path: inner ring is a hole');
  check(Math.abs(G.filledArea([big, small, rect(40, 40, 20, 20)], [1, 1, 2]) - 7900) < 1, 'hole of a compound path filled by another path');
  nextI = 0;
  const it = vec('L', [big, small], { rg: [1, 2] });
  const pp = C.planPieces([it], { shape: 'all', artboards: [] });
  check(JSON.stringify(pp.pieces[0].rg) === JSON.stringify([1, 2]), 'planPieces carries the ring groups');
  const bp = G.buildPiece(pp.pieces[0], {});
  check(Math.abs(bp.area - 10000) < 1, `buildPiece area uses the groups (${bp.area.toFixed(0)})`);
}

console.log(fails ? `\n${fails}/${n} FAIL` : `\nALL OK (${n} checks)`);
process.exit(fails ? 1 : 0);
