// Module 1 "fidelity to the file" — end-to-end test of the REAL Corvo panel in Illustrator (CDP, port 8093).
//
// Builds a synthetic print&cut sheet via ExtendScript (CMYK, A3):
//   12 stickers = PRINT layer art with 3 mm bleed beyond the cut (vector, rasterized image, or clipped group)
//               + CutContour spot-color path on the CUT layer, NOT grouped together
//   4 registration marks (5 mm squares) on a "Reg" layer
// Selects everything, nests with "Cut line only" + "Merge overlapping objects", Apply, then checks:
//   stickers intact (every PRINT anchor/bbox follows the rigid move of its cut path within 0.01 pt), every item on
//   its original layer, registration marks untouched, no overlap between cut paths (+ gap), spot color unchanged.
// Extra scenarios: Cancel restores print+cut exactly; a "Through Cut Rectangle" sheet frame is left in place;
// cut lines on a LOCKED layer with only the print selected -> clear error (never unlocked); live text alone -> clear
// error; image alone -> error.
//
// uso: node plugin/tools/test_modulo1.js [secs=10]
// Never touches the desktop: no foreground, no keys/clicks outside the panel DOM. Test docs closed WITHOUT saving.
'use strict';
const path = require('path');
const ClipperLib = require(path.join(__dirname, '..', 'client', 'lib', 'clipper.js'));

const PORT = 8093;
const JSX = 'C:/Users/erryb/Desktop/Plugin/plugin/host/corvo.jsx';
const SECS = +(process.argv[2] || 10);
const MM = 72 / 25.4;
const ROLL_MM = 300, GAP_MM = 2;

let ws, msgId = 0, pending = {};
async function connect() {
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const t = targets.find(x => x.type === 'page');
  if (!t) throw new Error('Corvo panel not open on port ' + PORT);
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; }
    else if (d.method === 'Runtime.exceptionThrown') console.log('   [panel exception]', JSON.stringify(d.params.exceptionDetails).slice(0, 400));
  };
}
const cdp = (method, params) => new Promise(res => { const i = ++msgId; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
async function js(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 });
  if (r.result && r.result.exceptionDetails) throw new Error('panel: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result.result.value;
}
const es = (code) => js(`new Promise(r => window.__adobe_cep__.evalScript(${JSON.stringify(code)}, r))`);
const esJson = async (code) => { const s = await es(code); try { return JSON.parse(s); } catch (e) { throw new Error('ES: ' + String(s).slice(0, 400)); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let fails = 0, checks = 0;
function check(cond, msg) { checks++; console.log((cond ? '  OK   ' : '  FAIL ') + msg); if (!cond) fails++; }

// ---------------------------------------------------------------- document
const ES_BUILD = `(function(){
  var MM=72/25.4, W=297*MM, H=420*MM;
  var d=app.documents.add(DocumentColorSpace.CMYK, W, H);
  d.rulerOrigin=[0,0];
  var prevCS=app.coordinateSystem; app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  var ab=d.artboards[0].artboardRect;                 // l,t,r,b
  var print=d.layers[0]; print.name='PRINT';
  var cut=d.layers.add(); cut.name='CUT';
  var reg=d.layers.add(); reg.name='Reg';
  var sp=d.spots.add(); sp.name='CutContour'; var cc=new CMYKColor(); cc.cyan=0; cc.magenta=100; cc.yellow=0; cc.black=0; sp.color=cc; sp.colorType=ColorModel.SPOT;
  var spc=new SpotColor(); spc.spot=sp; spc.tint=100;
  function cmyk(c,m,y,k){ var x=new CMYKColor(); x.cyan=c; x.magenta=m; x.yellow=y; x.black=k; return x; }
  var B=3*MM, cols=3, out=[];
  for (var k=0;k<12;k++){
    var w=(45+(k*7)%30)*MM, h=(35+(k*11)%35)*MM;
    var left=ab[0]+(18+(k%cols)*92)*MM, top=ab[1]-(30+Math.floor(k/cols)*95)*MM;
    var kind=k%3;                                      // 0 rect, 1 ellipse, 2 rounded rect
    function shape(layer,t,l,ww,hh){
      if (kind===0) return layer.pathItems.rectangle(t,l,ww,hh);
      if (kind===1) return layer.pathItems.ellipse(t,l,ww,hh);
      return layer.pathItems.roundedRectangle(t,l,ww,hh,6*MM,6*MM);
    }
    // PRINT: art with bleed, deliberately off-centre (bleed 3 mm left/top, 3+k/2 mm right) so the offset matters
    var extra=(k/2)*MM;
    var pr=shape(print, top+B, left-B, w+2*B+extra, h+2*B);
    pr.filled=true; pr.stroked=false; pr.fillColor=cmyk((k*23)%100,(k*41)%100,(k*67)%100,0); pr.name='p'+k;
    if (k%4===1){                                      // image-like: rasterize the print art
      var ro=new RasterizeOptions(); ro.resolution=72; ro.transparency=true;
      var ras=d.rasterize(pr, pr.geometricBounds, ro); try { pr.remove(); } catch(e){}
      ras.name='p'+k; pr=ras;
    } else if (k===6){                                 // clipped group: big art masked by the bleed shape
      var g=print.groupItems.add(); g.name='p'+k;
      var art=g.pathItems.rectangle(top+B+40, left-B-40, w+2*B+extra+80, h+2*B+80); art.filled=true; art.fillColor=cmyk(0,0,100,0); art.stroked=false;
      var clip=shape(g, top+B, left-B, w+2*B+extra, h+2*B); pr.remove(); clip.move(g, ElementPlacement.PLACEATBEGINNING);
      g.clipped=true; clip.clipping=true; pr=g;
    }
    var c=shape(cut, top, left, w, h);
    c.filled=false; c.stroked=true; c.strokeColor=spc; c.strokeWidth=0.25; c.name='c'+k;
  }
  var s5=5*MM, off=10*MM;
  var corners=[[ab[0]+off, ab[1]-off],[ab[2]-off-s5, ab[1]-off],[ab[0]+off, ab[3]+off+s5],[ab[2]-off-s5, ab[3]+off+s5]];
  for (var j=0;j<4;j++){ var r=reg.pathItems.rectangle(corners[j][1], corners[j][0], s5, s5); r.filled=true; r.fillColor=cmyk(0,0,0,100); r.stroked=false; r.name='reg'+j; }
  app.coordinateSystem=prevCS;
  return d.name; })()`;

// select every item on PRINT, CUT and Reg (like Select All)
const ES_SELECT_ALL = `(function(){ var d=app.activeDocument, sel=[];
  var names=['PRINT','CUT','Reg']; for (var n=0;n<names.length;n++){ var ly=d.layers.getByName(names[n]); for (var i=0;i<ly.pageItems.length;i++) sel.push(ly.pageItems[i]); }
  d.selection=null; d.selection=sel; return d.selection.length; })()`;

// snapshot: every named item -> layer, type, bounds, anchors of every path inside; spot + cut strokes
const ES_SNAP = `(function(){
  var d=app.activeDocument, prev=app.coordinateSystem; app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  function anchors(it, acc){ var t=it.typename,i; if (t==='PathItem'){ for(i=0;i<it.pathPoints.length;i++){ var a=it.pathPoints[i].anchor; acc.push([a[0],a[1]]); } }
    else if (t==='CompoundPathItem'){ for(i=0;i<it.pathItems.length;i++) anchors(it.pathItems[i],acc); }
    else if (t==='GroupItem'){ for(i=0;i<it.pageItems.length;i++) anchors(it.pageItems[i],acc); } }
  var items={}, names=['PRINT','CUT','Reg'];
  for (var n=0;n<names.length;n++){ var ly=d.layers.getByName(names[n]);
    for (var i=0;i<ly.pageItems.length;i++){ var it=ly.pageItems[i], acc=[]; anchors(it,acc);
      var o={layer:it.layer.name, type:it.typename, bounds:it.geometricBounds, anchors:acc};
      if (it.typename==='PathItem' && it.stroked && it.strokeColor.typename==='SpotColor'){ o.spot=it.strokeColor.spot.name; o.tint=it.strokeColor.tint; o.sw=it.strokeWidth; o.ring=corvo_pathRing(it,0.25); }
      if (it.typename==='RasterItem'){ var m=it.matrix; o.matrix=[m.mValueA,m.mValueB,m.mValueC,m.mValueD,m.mValueTX,m.mValueTY]; }
      items[it.name]=o; } }
  var sp=d.spots.getByName('CutContour'), col=sp.color;
  var spot={name:sp.name, type:String(sp.colorType), c:col.cyan, m:col.magenta, y:col.yellow, k:col.black, count:d.spots.length};
  var roll=null; try { var cl=d.layers.getByName('Corvo'); var r=null; try { r=cl.pathItems.getByName('Corvo_Roll'); } catch(e1){ r=cl.pathItems.getByName('Corvo_Roll_rif'); } roll=r.geometricBounds; } catch(e){ roll=null; }
  app.coordinateSystem=prev;
  return corvo_json({items:items, spot:spot, roll:roll}); })()`;

const closeDoc = (name) => es(`(function(){ try { app.documents.getByName(${JSON.stringify(name)}).close(SaveOptions.DONOTSAVECHANGES); return 'closed'; } catch(e){ return 'ERR '+e.message; } })()`);

// ---------------------------------------------------------------- panel driving
async function setupPanel(secs, shape, merge) {
  await js(`(function(){ function set(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }
    set('rollWidth','${ROLL_MM}'); set('gap','${GAP_MM}'); set('rotations','90'); set('time','${secs}'); set('shapeSrc','${shape}');
    document.getElementById('merge').checked=${merge ? 'true' : 'false'}; return 1; })()`);
}
const panelState = () => js(`(function(){ var S=CorvoPanel.state(); return {state:S.state, phase:S.phase, status:document.getElementById('status').textContent,
   cls:document.getElementById('status').className, pieces:S.plan?S.plan.pieces.length:null, members:S.plan?S.plan.pieces.map(function(p){return p.members.length;}):null,
   sources:S.plan?S.plan.pieces.map(function(p){return p.source;}):null, excluded:S.plan?S.plan.excluded.length:null}; })()`);
const click = (id) => js(`document.getElementById('${id}').click(), 1`);
async function waitState(pred, timeoutMs, everyMs) {
  const t0 = Date.now();
  for (;;) { const st = await panelState(); if (pred(st) || Date.now() - t0 > timeoutMs) return st; await sleep(everyMs); }
}

// ---------------------------------------------------------------- geometry
const S = 1000;
const toPath = (r) => r.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
function polyArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; }
function inter(a, b) {
  const C = ClipperLib, c = new C.Clipper(), out = new C.Paths();
  c.AddPaths(a, C.PolyType.ptSubject, true); c.AddPaths(b, C.PolyType.ptClip, true);
  c.Execute(C.ClipType.ctIntersection, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return out.reduce((s, p) => s + Math.abs(C.Clipper.Area(p)), 0) / (S * S);
}
function grow(ring, d) { const C = ClipperLib, co = new C.ClipperOffset(2, 0.25 * S), out = new C.Paths(); co.AddPath(toPath(polyArea(ring) < 0 ? ring.slice().reverse() : ring), C.JoinType.jtRound, C.EndType.etClosedPolygon); co.Execute(out, d * S); return out; }
// rigid transform (rotation + translation) that maps the cut path before -> after
function rigidFrom(before, after) {
  const a0 = before[0], a1 = before[Math.floor(before.length / 2)], b0 = after[0], b1 = after[Math.floor(after.length / 2)];
  const th = Math.atan2(b1[1] - b0[1], b1[0] - b0[0]) - Math.atan2(a1[1] - a0[1], a1[0] - a0[0]);
  const c = Math.cos(th), s = Math.sin(th);
  return { deg: Math.round(th * 180 / Math.PI * 1000) / 1000, map: ([x, y]) => [c * (x - a0[0]) - s * (y - a0[1]) + b0[0], s * (x - a0[0]) + c * (y - a0[1]) + b0[1]] };
}
function bboxOfPts(pts) { let l = 1e30, t = -1e30, r = -1e30, b = 1e30; for (const [x, y] of pts) { l = Math.min(l, x); r = Math.max(r, x); b = Math.min(b, y); t = Math.max(t, y); } return [l, t, r, b]; }
const maxDiff = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));

// ---------------------------------------------------------------- main
(async () => {
  await connect();
  await cdp('Runtime.enable', {});
  // fresh panel code + host code (the installed extension is a junction to plugin/)
  await js('location.reload(), 1').catch(() => {});
  await sleep(2500);
  ws.close(); pending = {}; await connect(); await cdp('Runtime.enable', {});
  console.log('  host reload:', await es(`$.evalFile(new File(${JSON.stringify(JSX)})); typeof corvoGroup`));

  const docName = await es(ES_BUILD);
  console.log(`=== modulo 1: print&cut sheet (${docName}), ${SECS} s ===`);
  const extraDocs = [];
  try {
    const nSel = await es(ES_SELECT_ALL);
    const before = await esJson(ES_SNAP);
    const types = {}; Object.values(before.items).forEach(o => { types[o.type] = (types[o.type] || 0) + 1; });
    console.log('  selected:', nSel, 'types:', JSON.stringify(types));
    check(+nSel === 28, `28 objects selected (12 print + 12 cut + 4 reg) — got ${nSel}`);

    // ---------------- run 0: "All artwork" on the original sheet -> bleed is part of the shape, 12 pieces (then Cancel)
    await setupPanel(4, 'all', true);
    await click('btnNest');
    const r3 = await waitState(s => s.state === 'running' || s.state === 'idle', 20000, 200);
    check(r3.pieces === 12 && r3.sources.every(s => s === 'all'), `"All artwork": 12 pieces shaped by print+bleed (got ${r3.pieces})`);
    await click('btnCancel');
    await waitState(s => s.state === 'idle', 15000, 300);

    // ---------------- run 1: Cut line only + merge, then Apply
    await setupPanel(SECS, 'cut', true);
    await click('btnNest');
    const running = await waitState(s => s.state === 'running' || s.state === 'idle', 30000, 200);
    console.log('  plan:', JSON.stringify({ pieces: running.pieces, members: running.members, excluded: running.excluded }));
    console.log('  status while running:', running.status);
    check(running.pieces === 12, `12 pieces after merging print + cut (got ${running.pieces})`);
    check(running.members && running.members.every(m => m === 2), 'every piece = 1 print item + 1 cut path');
    check(running.sources && running.sources.every(s => s === 'cut'), 'every piece shaped by its CutContour');
    check(running.excluded === 4, `4 registration marks excluded (got ${running.excluded})`);
    check(/registration|registro/i.test(running.status), 'status line mentions the registration marks');
    const rv = await waitState(s => s.state === 'review' || s.state === 'idle', (SECS + 30) * 1000, 500);
    check(rv.state === 'review', `search ended in review ("${rv.status}")`);
    await click('btnApply');
    const idle = await waitState(s => s.state === 'idle', 15000, 300);
    check(idle.state === 'idle' && idle.cls.indexOf('error') < 0, `Apply -> idle ("${idle.status}")`);
    const after = await esJson(ES_SNAP);

    // stickers intact
    let worstPrint = 0, worstRas = 0, moved = 0; const rots = {};
    for (let k = 0; k < 12; k++) {
      const pB = before.items['p' + k], pA = after.items['p' + k], cB = before.items['c' + k], cA = after.items['c' + k];
      const T = rigidFrom(cB.anchors, cA.anchors);
      rots[T.deg] = (rots[T.deg] || 0) + 1;
      if (maxDiff(cB.bounds, cA.bounds) > 1) moved++;
      worstPrint = Math.max(worstPrint, ...cB.anchors.map((p, i) => Math.max(...T.map(p).map((v, q) => Math.abs(v - cA.anchors[i][q])))));   // self-consistency
      if (pB.anchors.length) {
        const d = Math.max(...pB.anchors.map((p, i) => Math.max(...T.map(p).map((v, q) => Math.abs(v - pA.anchors[i][q])))));
        worstPrint = Math.max(worstPrint, d);
      } else {                                           // raster: the moved bbox must match the rigid move of the old one
        const b = pB.bounds, corners = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(T.map);
        worstRas = Math.max(worstRas, maxDiff(bboxOfPts(corners), pA.bounds));
      }
    }
    console.log(`  rotations used: ${JSON.stringify(rots)}, stickers moved: ${moved}/12`);
    check(moved >= 10, `stickers were actually moved (${moved}/12)`);
    check(worstPrint < 0.01, `vector/clipped PRINT art follows its cut path exactly: max error ${worstPrint.toExponential(2)} pt`);
    check(worstRas < 0.01, `raster PRINT art follows its cut path exactly: max bbox error ${worstRas.toExponential(2)} pt`);

    // layers, reg marks, spot
    const wrongLayer = Object.keys(before.items).filter(n => !after.items[n] || after.items[n].layer !== before.items[n].layer);
    check(wrongLayer.length === 0 && Object.keys(after.items).length === Object.keys(before.items).length, 'every item still on its original layer' + (wrongLayer.length ? ' — ' + wrongLayer.join(',') : ''));
    const regErr = Math.max(...[0, 1, 2, 3].map(j => maxDiff(before.items['reg' + j].bounds, after.items['reg' + j].bounds)));
    check(regErr === 0, `registration marks untouched (max delta ${regErr} pt)`);
    check(JSON.stringify(after.spot) === JSON.stringify(before.spot), `spot color unchanged: ${JSON.stringify(after.spot)}`);
    const cutsOk = [...Array(12).keys()].every(k => after.items['c' + k].spot === 'CutContour' && after.items['c' + k].tint === 100 && Math.abs(after.items['c' + k].sw - 0.25) < 1e-9);
    check(cutsOk, 'every cut path still stroked with CutContour 100 %, 0.25 pt');

    // cut paths: no overlap, gap, inside roll
    const rings = [...Array(12).keys()].map(k => after.items['c' + k].ring);
    const half = GAP_MM * MM / 2 - 0.35;
    let overl = [], gapV = [];
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) {
      const ov = inter([toPath(polyArea(rings[i]) < 0 ? rings[i].slice().reverse() : rings[i])], [toPath(polyArea(rings[j]) < 0 ? rings[j].slice().reverse() : rings[j])]);
      if (ov > 0.01) overl.push(`c${i}/c${j}:${ov.toFixed(2)}`);
      const gv = inter(grow(rings[i], half), grow(rings[j], half));
      if (gv > 0.05) gapV.push(`c${i}/c${j}:${gv.toFixed(2)}`);
    }
    check(overl.length === 0, 'no overlap between cut paths' + (overl.length ? ' — ' + overl.join(' ') : ''));
    check(gapV.length === 0, `gap ${GAP_MM} mm between cut paths (−0.7 pt tolerance)` + (gapV.length ? ' — ' + gapV.join(' ') : ''));
    const roll = after.roll;
    const outside = roll ? rings.map((r, k) => { const b = bboxOfPts(r); return (b[0] < roll[0] - 0.6 || b[2] > roll[2] + 0.6 || b[3] < roll[3] - 0.6 || b[1] > roll[1] + 0.6) ? 'c' + k : null; }).filter(Boolean) : ['no roll'];
    check(outside.length === 0, 'every cut path inside the roll' + (outside.length ? ' — ' + outside.join(',') : ''));
    let bleedOv = 0;
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) { const a = after.items['p' + i].bounds, b = after.items['p' + j].bounds; if (Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[1], b[1]) > Math.max(a[3], b[3])) bleedOv++; }
    const lenMm = roll ? (roll[2] - roll[0]) / MM : 0;
    console.log(`  roll ${lenMm.toFixed(1)} mm; bleed boxes overlapping each other: ${bleedOv} pairs (expected with "Cut line only")`);

    // ---------------- E2: ONE Ctrl+Z after Apply restores the original sheet (live moves collapsed by corvoFinish), redo
    await es('app.undo(), 1');
    const undone = await esJson(ES_SNAP);
    let uErr = 0; Object.keys(before.items).forEach(n => { uErr = Math.max(uErr, maxDiff(before.items[n].bounds, undone.items[n].bounds)); });
    check(uErr < 0.01 && !undone.roll, `one undo after Apply restores every item (max ${uErr.toExponential(2)} pt, roll ${undone.roll ? 'still there' : 'gone'})`);
    await es('app.redo(), 1');
    const redone = await esJson(ES_SNAP);
    let rErr = 0; Object.keys(after.items).forEach(n => { rErr = Math.max(rErr, maxDiff(after.items[n].bounds, redone.items[n].bounds)); });
    check(rErr < 0.01, `redo brings the layout back (max ${rErr.toExponential(2)} pt)`);

    // ---------------- run 2: Nest then Cancel -> exact restore of print + cut
    await es(`(function(){ try { app.activeDocument.layers.getByName('Corvo').pathItems.getByName('Corvo_Roll_rif').remove(); } catch(e){} return 1; })()`);
    await es(ES_SELECT_ALL);
    const ref = await esJson(ES_SNAP);
    await setupPanel(6, 'cut', true);
    await click('btnNest');
    await waitState(s => s.state === 'running' || s.state === 'idle', 20000, 200);
    await sleep(3500);
    const mid = await esJson(ES_SNAP);
    const movedMid = Object.keys(ref.items).filter(n => maxDiff(ref.items[n].bounds, mid.items[n].bounds) > 1).length;
    await click('btnCancel');
    const stC = await waitState(s => s.state === 'idle', 15000, 300);
    const back = await esJson(ES_SNAP);
    let err = 0;
    Object.keys(ref.items).forEach(n => { err = Math.max(err, maxDiff(ref.items[n].bounds, back.items[n].bounds)); ref.items[n].anchors.forEach((p, i) => { err = Math.max(err, Math.abs(p[0] - back.items[n].anchors[i][0]), Math.abs(p[1] - back.items[n].anchors[i][1])); }); });
    check(movedMid >= 10, `run2 moved ${movedMid} items (print + cut) before Cancel`);
    check(stC.state === 'idle', `Cancel -> idle ("${stC.status}")`);
    check(err < 0.01, `Cancel restores every print/cut item: max error ${err.toExponential(2)} pt`);

    // ---------------- run 3a: sheet frame ("Through Cut Rectangle" around every sticker, unlocked, selected) -> left in place
    await es(`(function(){ var d=app.activeDocument, cut=d.layers.getByName('CUT'), l=1e9,t=-1e9,r=-1e9,b=1e9;
      for (var i=0;i<cut.pathItems.length;i++){ var g=cut.pathItems[i].geometricBounds; l=Math.min(l,g[0]); t=Math.max(t,g[1]); r=Math.max(r,g[2]); b=Math.min(b,g[3]); }
      var sp=d.spots.add(); sp.name='Through Cut Rectangle'; var c=new CMYKColor(); c.magenta=100; c.yellow=100; sp.color=c; sp.colorType=ColorModel.SPOT;
      var sc=new SpotColor(); sc.spot=sp; sc.tint=100; d.activeLayer=cut;
      var f=cut.pathItems.rectangle(t+40, l-40, r-l+80, t-b+80); f.filled=false; f.stroked=true; f.strokeColor=sc; f.strokeWidth=1; f.name='frame'; return 1; })()`);
    await es(ES_SELECT_ALL);
    const refF = await esJson(ES_SNAP);
    await setupPanel(4, 'cut', true);
    await click('btnNest');
    const rF = await waitState(s => s.state === 'running' || s.state === 'review' || s.state === 'idle', 30000, 200);
    console.log('  frame status:', rF.status);
    check(rF.pieces === 12 && rF.excluded === 5, `sheet frame left in place: 12 pieces, 4 reg marks + 1 frame excluded (got ${rF.pieces}, ${rF.excluded})`);
    check(/frame|cornic/i.test(rF.status), 'status line mentions the sheet frame');
    await click('btnCancel');
    await waitState(s => s.state === 'idle', 15000, 300);
    const backF = await esJson(ES_SNAP);
    check(maxDiff(refF.items.frame.bounds, backF.items.frame.bounds) === 0, 'frame never moved');

    // ---------------- run 3b: cut lines on a LOCKED layer, only the print selected -> clear error, nothing moved, never unlocked
    await es(`(function(){ var d=app.activeDocument; d.layers.getByName('CUT').pathItems.getByName('frame').remove(); d.layers.getByName('CUT').locked=true;
      var sel=[], ly=d.layers.getByName('PRINT'); for (var i=0;i<ly.pageItems.length;i++) sel.push(ly.pageItems[i]); d.selection=null; d.selection=sel; return d.selection.length; })()`);
    await setupPanel(4, 'cut', true);
    await click('btnNest');
    const rL = await waitState(s => s.state === 'idle' && /error/.test(s.cls), 30000, 200);
    console.log('  locked cut status:', rL.status);
    check(/error/.test(rL.cls) && /CUT/.test(rL.status) && /(locked|bloccato)/i.test(rL.status), 'print selected, its CutContour on a locked layer -> clear error naming the layer');
    const stillLocked = await es(`app.activeDocument.layers.getByName('CUT').locked`);
    check(stillLocked === 'true', 'the CUT layer is still locked (Corvo never unlocks)');
    await es(`(function(){ app.activeDocument.layers.getByName('CUT').locked=false; return 1; })()`);

    // ---------------- run 3c: a cut swatch in PROCESS colour ("Thru-cut" not spot) -> warning in the status line
    await es(`(function(){ var d=app.activeDocument, sw=d.swatches.add(); sw.name='Thru-cut'; var c=new CMYKColor(); c.magenta=100; sw.color=c; return 1; })()`);
    await es(ES_SELECT_ALL);
    await setupPanel(4, 'cut', true);
    await click('btnNest');
    const rP = await waitState(s => s.state === 'running' || s.state === 'review' || s.state === 'idle', 30000, 200);
    check(/Thru-cut/.test(rP.status) && /(process|quadricromia)/i.test(rP.status), 'process-colour cut swatch -> warning naming it');
    await click('btnCancel');
    await waitState(s => s.state === 'idle', 15000, 300);

    // ---------------- run 4: live text alone -> clear error, nothing moved
    await es(`(function(){ var d=app.activeDocument, ly=d.layers.getByName('PRINT'); var t=ly.textFrames.add(); t.contents='CORVO'; t.name='txt'; t.position=[2000,-2000];
      var t2=ly.textFrames.add(); t2.contents='STICKER'; t2.name='txt2'; t2.position=[2000,-2100]; d.selection=null; d.selection=[t,t2]; return 1; })()`);
    await setupPanel(4, 'all', true);
    await click('btnNest');
    const r4 = await waitState(s => s.state === 'idle' && /error/.test(s.cls), 15000, 200);
    console.log('  text status:', r4.status);
    check(/error/.test(r4.cls) && /2/.test(r4.status) && /(Create Outlines|Crea contorni)/.test(r4.status), 'live text -> error with count and "Create Outlines" hint');

    // ---------------- run 5: an image alone -> error
    await es(`(function(){ var d=app.activeDocument, ly=d.layers.getByName('PRINT'); var r=ly.pathItems.rectangle(-2300,2000,80,60); r.filled=true;
      var ro=new RasterizeOptions(); ro.resolution=72; var ras=d.rasterize(r, r.geometricBounds, ro); try{ r.remove(); }catch(e){} ras.name='lonely';
      d.selection=null; d.selection=[ras]; return 1; })()`);
    await setupPanel(4, 'cut', true);
    await click('btnNest');
    const r5 = await waitState(s => s.state === 'idle' && /error/.test(s.cls), 15000, 200);
    console.log('  image status:', r5.status);
    check(/error/.test(r5.cls) && /(image|immagin)/i.test(r5.status), 'image without vector contour -> error');

    console.log(`RESULT modulo1: pieces ${running.pieces}, reg excluded ${running.excluded}, print err ${worstPrint.toExponential(2)} pt, raster err ${worstRas.toExponential(2)} pt, roll ${lenMm.toFixed(1)} mm, revert err ${err.toExponential(2)} pt`);
  } finally {
    // leave the panel on its defaults (All artwork + merge) for the other tests
    await js(`(function(){ document.getElementById('shapeSrc').value='all'; document.getElementById('merge').checked=true;
      try { localStorage.setItem('corvo.opts', JSON.stringify({shape:'all', merge:true})); } catch(e){} return 1; })()`).catch(() => {});
    if (process.env.KEEP !== '1') console.log('  close:', await closeDoc(docName));
    for (const n of extraDocs) await closeDoc(n);
    console.log(fails ? `\n${fails}/${checks} FAIL` : `\nALL OK (${checks} checks)`);
    ws.close(); process.exit(fails ? 1 : 0);
  }
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
