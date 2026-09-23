// End-to-end test of the REAL Corvo panel inside Illustrator, driven through CDP (debug port 8093).
// Drives the panel DOM (fields + buttons), polls piece positions through ExtendScript, checks the final layout.
//
// uso: node plugin/tools/test_e2e.js <scenario> [secs]
//   scenario: insegna48 | lettering | group     (default insegna48)
//   env SEED=n fixes the engine seed (reproducible lengths); KEEP=1 leaves the document open
// Requires: Illustrator running with the Corvo panel open (PlayerDebugMode, .debug port 8093).
// Documents are opened from bench/suite and closed WITHOUT saving at the end.
'use strict';
const path = require('path');
const ClipperLib = require(path.join(__dirname, '..', 'client', 'lib', 'clipper.js'));

const PORT = 8093;
const SUITE = 'C:/Users/erryb/Desktop/Plugin/bench/suite/';
const SCEN = process.argv[2] || 'insegna48';
const SECS = +(process.argv[3] || 30);
const MM = 72 / 25.4;
const ROLL_MM = 600, GAP_MM = 2;

let ws, msgId = 0; const pending = {};
async function connect() {
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const t = targets.find(x => x.type === 'page');
  if (!t) throw new Error('Corvo panel not open on port ' + PORT);
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; }
    else if (d.method === 'Runtime.consoleAPICalled') console.log('   [panel console]', d.params.type, d.params.args.map(a => a.value !== undefined ? a.value : a.description).join(' '));
    else if (d.method === 'Runtime.exceptionThrown') console.log('   [panel exception]', JSON.stringify(d.params.exceptionDetails).slice(0, 400));
  };
}
const cdp = (method, params) => new Promise(res => { const i = ++msgId; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
async function js(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 });
  if (r.result && r.result.exceptionDetails) throw new Error('panel: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result.result.value;
}
// ExtendScript through the native bridge (NOT through CSInterface, so it is not counted by the instrumentation)
const es = (code) => js(`new Promise(r => window.__adobe_cep__.evalScript(${JSON.stringify(code)}, r))`);
const esJson = async (code) => { const s = await es(code); try { return JSON.parse(s); } catch (e) { throw new Error('ES: ' + String(s).slice(0, 300)); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let fails = 0;
function check(cond, msg) { console.log((cond ? '  OK   ' : '  FAIL ') + msg); if (!cond) fails++; }

// ---------------------------------------------------------------- ExtendScript snippets
// pieces = top-level items of the first layer, except CONTAINER and anything on layer Corvo
const ES_PIECES = `function __pieces(){ var d=app.activeDocument, ly=d.layers[d.layers.length-1], out=[];
  for (var k=0;k<d.layers.length;k++){ if (d.layers[k].name!=='Corvo'){ ly=d.layers[k]; break; } }
  for (var i=0;i<ly.pageItems.length;i++){ var it=ly.pageItems[i]; if (it.name!=='CONTAINER') out.push(it); } return out; }`;
// every anchor of every piece (for the revert test) + roll
const ES_SNAPSHOT = `(function(){ ${ES_PIECES}
  var prev=app.coordinateSystem; app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  var ps=__pieces(), out=[];
  function pts(it, acc){ var t=it.typename,i; if (t==='PathItem'){ for(i=0;i<it.pathPoints.length;i++){ var a=it.pathPoints[i].anchor; acc.push(a[0],a[1]); } }
    else if (t==='CompoundPathItem'){ for(i=0;i<it.pathItems.length;i++) pts(it.pathItems[i],acc); }
    else if (t==='GroupItem'){ for(i=0;i<it.pageItems.length;i++) pts(it.pageItems[i],acc); } }
  for (var i=0;i<ps.length;i++){ var acc=[]; pts(ps[i],acc); out.push('['+acc.join(',')+']'); }
  var roll=null; try { var ly=app.activeDocument.layers.getByName('Corvo'); var r=null;
    try { r=ly.pathItems.getByName('Corvo_Roll'); } catch(e1){ r=ly.pathItems.getByName('Corvo_Roll_rif'); }
    var b=r.geometricBounds; roll='['+b.join(',')+']'; } catch(e){ roll='null'; }
  app.coordinateSystem=prev;
  return '{"pieces":['+out.join(',')+'],"roll":'+roll+'}'; })()`;
// cheap live poll: first anchor of every piece + roll width
const ES_POLL = `(function(){ ${ES_PIECES}
  var prev=app.coordinateSystem; app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  var ps=__pieces(), s=[]; for (var i=0;i<ps.length;i++){ var b=ps[i].geometricBounds; s.push(Math.round(b[0]*10)/10+':'+Math.round(b[1]*10)/10); }
  var w=-1; try { var r=app.activeDocument.layers.getByName('Corvo').pathItems.getByName('Corvo_Roll'); var g=r.geometricBounds; w=g[2]-g[0]; } catch(e){}
  app.coordinateSystem=prev; return '{"sig":"'+s.join('|')+'","w":'+w+'}'; })()`;
// final rings through the host's own collector
const ES_RINGS = `(function(){ ${ES_PIECES}
  var prev=app.coordinateSystem; app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  var ps=__pieces(), out=[];
  for (var i=0;i<ps.length;i++){ var rings=[]; corvo_collect(ps[i],0.25,rings); out.push({name:ps[i].name,rings:rings}); }
  app.coordinateSystem=prev; return corvo_json(out); })()`;

// ---------------------------------------------------------------- geometry checks (clipper)
const S = 1000;
const toPath = (r) => r.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
function silhouette(rings) {
  const C = ClipperLib, c = new C.Clipper(), out = new C.Paths();
  const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; };
  c.AddPaths(rings.map(r => toPath(area(r) < 0 ? r.slice().reverse() : r)), C.PolyType.ptSubject, true);
  c.Execute(C.ClipType.ctUnion, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return out;
}
function grow(paths, d) { const C = ClipperLib, co = new C.ClipperOffset(2, 0.25 * S), out = new C.Paths(); co.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon); co.Execute(out, d * S); return out; }
function interArea(a, b) {
  const C = ClipperLib, c = new C.Clipper(), out = new C.Paths();
  c.AddPaths(a, C.PolyType.ptSubject, true); c.AddPaths(b, C.PolyType.ptClip, true);
  c.Execute(C.ClipType.ctIntersection, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return out.reduce((s, p) => s + Math.abs(C.Clipper.Area(p)), 0) / (S * S);
}
function bboxOf(rings) { let l = 1e30, b = 1e30, r = -1e30, t = -1e30; for (const g of rings) for (const [x, y] of g) { l = Math.min(l, x); r = Math.max(r, x); b = Math.min(b, y); t = Math.max(t, y); } return [l, b, r, t]; }

async function checkLayout(label, gapPt) {
  const pcs = await esJson(ES_RINGS);
  const snap = await esJson(ES_SNAPSHOT);
  const roll = snap.roll; // [l,t,r,b]
  check(!!roll, `${label}: roll rectangle present`);
  if (!roll) return {};
  const tol = 0.6;
  let outside = [];
  const sil = pcs.map(p => silhouette(p.rings)), bb = pcs.map(p => bboxOf(p.rings));
  pcs.forEach((p, i) => { const b = bb[i]; if (b[0] < roll[0] - tol || b[2] > roll[2] + tol || b[1] < roll[3] - tol || b[3] > roll[1] + tol) outside.push(p.name); });
  check(outside.length === 0, `${label}: all ${pcs.length} pieces inside the roll` + (outside.length ? ' — outside: ' + outside.join(',') : ''));
  const half = gapPt / 2 - 0.35;          // allow the gap to be ~0.7 pt short (flatness of export + our 0.25 pt)
  const grown = sil.map(s => grow(s, half));
  let overl = [], gapViol = [], worst = 0;
  for (let i = 0; i < pcs.length; i++) for (let j = i + 1; j < pcs.length; j++) {
    const a = bb[i], b = bb[j];
    if (a[2] + gapPt < b[0] || b[2] + gapPt < a[0] || a[3] + gapPt < b[1] || b[3] + gapPt < a[1]) continue;
    const ov = interArea(sil[i], sil[j]);
    if (ov > 0.01) overl.push(`${pcs[i].name}/${pcs[j].name}:${ov.toFixed(2)}pt²`);
    const gv = interArea(grown[i], grown[j]);
    if (gv > 0.05) { gapViol.push(`${pcs[i].name}/${pcs[j].name}:${gv.toFixed(2)}`); worst = Math.max(worst, gv); }
  }
  check(overl.length === 0, `${label}: no overlaps (pairwise polygon intersection)` + (overl.length ? ' — ' + overl.slice(0, 8).join(' ') : ''));
  check(gapViol.length === 0, `${label}: gap ${GAP_MM} mm respected (−0.7 pt tolerance)` + (gapViol.length ? ' — ' + gapViol.length + ' pairs, e.g. ' + gapViol.slice(0, 5).join(' ') : ''));
  const lenMm = (roll[2] - roll[0]) / MM, hMm = (roll[1] - roll[3]) / MM;
  let usedR = -1e30; bb.forEach(b => { usedR = Math.max(usedR, b[2]); });
  const area = sil.reduce((s, p) => s + p.reduce((q, r) => q + Math.abs(ClipperLib.Clipper.Area(r)), 0) / (S * S), 0);
  const fill = area / ((roll[2] - roll[0]) * (roll[1] - roll[3]));
  console.log(`  ${label}: roll ${lenMm.toFixed(1)} x ${hMm.toFixed(1)} mm, pieces end ${((usedR - roll[0]) / MM).toFixed(1)} mm, silhouette fill ${(fill * 100).toFixed(1)} %`);
  return { lenMm, fill };
}

// ---------------------------------------------------------------- panel driving
async function setupPanel(secs, rot) {
  await js(`(function(){ function set(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }
    set('rollWidth','${ROLL_MM}'); set('gap','${GAP_MM}'); set('rotations','${rot}'); set('time','${secs}');
    window.CorvoSeed=${+(process.env.SEED || 0)}; return 1; })()`);   // SEED=n -> reproducible search (0 = random)
}
async function instrument() {
  await js(`(function(){ if (window.__corvoLog) { window.__corvoLog.length=0; return 'reset'; }
    window.__corvoLog=[]; var orig=CSInterface.prototype.evalScript;
    CSInterface.prototype.evalScript=function(script, cb){ var t0=performance.now(), fn=String(script).split('(')[0];
      var rec={fn:fn,t:Date.now()}; window.__corvoLog.push(rec);
      return orig.call(this, script, function(res){ rec.ms=performance.now()-t0; try{ var o=JSON.parse(res); rec.hostMs=o.ms; rec.moved=o.moved; rec.err=o.error||o.errors; }catch(e){ rec.raw=String(res).slice(0,100);} if(cb) cb(res); }); };
    return 'installed'; })()`);
}
const panelState = () => js(`(function(){ var S=CorvoPanel.state(); return {state:S.state, phase:S.phase, best:S.best?S.best.strip_width:null, status:document.getElementById('status').textContent,
   len:document.getElementById('sLength').textContent, fill:document.getElementById('sFill').textContent,
   btn:{nest:!document.getElementById('btnNest').disabled, stop:!document.getElementById('btnStop').disabled, apply:!document.getElementById('btnApply').disabled, cancel:!document.getElementById('btnCancel').disabled}}; })()`);
const click = (id) => js(`document.getElementById('${id}').click(), 1`);

async function waitState(pred, timeoutMs, everyMs, onTick) {
  const t0 = Date.now();
  for (;;) {
    const st = await panelState();
    if (onTick) await onTick(st, Date.now() - t0);
    if (pred(st)) return st;
    if (Date.now() - t0 > timeoutMs) return st;
    await sleep(everyMs);
  }
}

async function selectPieces() {
  return es(`(function(){ ${ES_PIECES} var d=app.activeDocument; d.selection=null; d.selection=__pieces(); return d.selection.length; })()`);
}

// run Nest; returns stats about the live phase
async function runNest(secs, stopAt) {
  await instrument();
  await click('btnNest');
  const polls = []; let lastSig = null, changes = 0, widths = [];
  const st = await waitState(s => s.state === 'review' || s.state === 'idle', (secs + 30) * 1000, 1000, async (s, el) => {
    if (s.state === 'running' || s.state === 'review') {
      const p = await esJson(ES_POLL);
      if (lastSig !== null && p.sig !== lastSig) changes++;
      lastSig = p.sig; if (p.w > 0) widths.push(p.w / MM);
      polls.push({ el, w: p.w / MM, state: s.state });
    }
    if (stopAt && el >= stopAt * 1000 && s.state === 'running') await click('btnStop');
  });
  const log = await js('window.__corvoLog');
  return { st, polls, changes, widths, log };
}

function summarizeLog(log) {
  const ap = log.filter(r => r.fn === 'corvoApply'), rl = log.filter(r => r.fn === 'corvoRoll');
  const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const lat = ap.map(r => r.ms).filter(x => x !== undefined), host = ap.map(r => r.hostMs).filter(x => x !== undefined);
  return { applyCalls: ap.length, rollCalls: rl.length, latAvg: avg(lat), latMax: Math.max(0, ...lat), hostAvg: avg(host), hostMax: Math.max(0, ...host),
    errors: log.filter(r => r.err).map(r => r.fn + ':' + JSON.stringify(r.err)) };
}

// ---------------------------------------------------------------- scenarios
async function openDoc(file) {
  // no modal dialogs (colour profile, missing fonts...): they would block ExtendScript and pop up on the user's desktop
  return es(`(function(){ var u=app.userInteractionLevel; app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
    try { var d=app.open(new File('${file}')); return d.name; } finally { app.userInteractionLevel=u; } })()`);
}
async function makeGroupDoc() {
  return es(`(function(){ var d=app.documents.add(DocumentColorSpace.RGB, 2000, 1500); var ly=d.layers[0];
    function rect(x,y,w,h){ return ly.pathItems.rectangle(y,x,w,h); }
    for (var i=0;i<10;i++) { var r=rect(40+i*150, 1400-(i%3)*200, 60+i*9, 90+(i*37)%120); r.name='r'+i; }
    for (i=0;i<6;i++) { var e=ly.pathItems.ellipse(700-(i%2)*150, 60+i*220, 120+i*10, 120+i*10); e.name='e'+i; }
    var g=ly.groupItems.add(); g.name='twoParts';
    var a=g.pathItems.ellipse(300, 400, 150, 150); var b=g.pathItems.rectangle(300, 800, 200, 120);   // 250 pt apart
    var cp=ly.compoundPathItems.add(); cp.name='ring'; var o=cp.pathItems.ellipse(1100,1400,300,300); var h=cp.pathItems.ellipse(1020,1480,140,140); h.polarity=PolarityValues.NEGATIVE;
    return d.name; })()`);
}

(async () => {
  await connect();
  await cdp('Runtime.enable', {});
  let docName;
  if (SCEN === 'group') docName = await makeGroupDoc();
  else docName = await openDoc(SUITE + SCEN + '.svg');
  console.log(`=== ${SCEN} (${docName}), ${SECS} s ===`);
  try {
    if (SCEN === 'insegna48') await es(`(function(){ var d=app.activeDocument; try { d.layers[0].pathItems.getByName('CONTAINER').remove(); } catch(e){} return 1; })()`);
    if (SCEN === 'lettering') await es(`(function(){ ${ES_PIECES} var d=app.activeDocument, ps=__pieces(), big=null, ba=0;
      for (var i=0;i<ps.length;i++){ var b=ps[i].geometricBounds, a=(b[2]-b[0])*(b[1]-b[3]); if (a>ba){ba=a;big=ps[i];} }
      if (big && big.name==='CONTAINER') big.remove(); return 1; })()`);
    const n = await selectPieces();
    console.log('  selected pieces:', n);
    const before = await esJson(ES_SNAPSHOT);
    await setupPanel(SECS, '90');

    // ---- run 1: full run, then Apply
    const stopAt = SECS >= 20 ? SECS - 5 : 0;       // long runs: press Stop 5 s before the end
    const r1 = await runNest(SECS, stopAt);
    const sm = summarizeLog(r1.log);
    console.log(`  run1 final panel: ${JSON.stringify(r1.st)}`);
    console.log(`  live: ${sm.applyCalls} corvoApply, ${sm.rollCalls} corvoRoll, apply round-trip avg ${sm.latAvg.toFixed(0)} ms / max ${sm.latMax.toFixed(0)} ms, host ms avg ${sm.hostAvg.toFixed(0)} / max ${sm.hostMax}`);
    console.log(`  polls: ${r1.polls.length}, position changes seen: ${r1.changes}, roll width mm over time: ${r1.widths.map(w => w.toFixed(0)).join(' ')}`);
    check(r1.st.state === 'review', 'run ended in review state');
    if (stopAt && r1.st.phase !== 'done') check(/^Stopped|^Fermato/.test(r1.st.status), `Stop keeps the best layout ("${r1.st.status}")`);
    check(sm.applyCalls >= 3, `pieces moved live (${sm.applyCalls} applies)`);
    check(r1.changes >= Math.min(2, r1.polls.length - 1), `positions changed between polls ${r1.changes} times`);
    const ws2 = r1.widths.filter(w => w > 0);
    check(ws2.length > 1 && ws2[ws2.length - 1] < ws2[0], `roll shrinks over time (${ws2[0] && ws2[0].toFixed(0)} -> ${ws2.length && ws2[ws2.length - 1].toFixed(0)} mm)`);
    check(sm.errors.length === 0, 'no host errors ' + sm.errors.slice(0, 3).join(' '));
    await click('btnApply');
    const stA = await waitState(s => s.state === 'idle', 15000, 300);
    check(stA.state === 'idle', `apply -> idle ("${stA.status}")`);
    const res = await checkLayout('run1', GAP_MM * MM);

    // ---- run 2: Nest a few seconds then Cancel -> exact restore of the applied layout
    await selectPieces();
    await es(`(function(){ try { app.activeDocument.layers.getByName('Corvo').pathItems.getByName('Corvo_Roll_rif').remove(); } catch(e){} return 1; })()`);
    const ref = await esJson(ES_SNAPSHOT);
    await setupPanel(6, '90');
    await instrument();
    await click('btnNest');
    await waitState(s => s.state === 'running', 20000, 200);
    await sleep(4000);
    const mid = await esJson(ES_SNAPSHOT);
    let moved = 0; mid.pieces.forEach((p, i) => { if (Math.max(...p.map((v, k) => Math.abs(v - ref.pieces[i][k]))) > 1) moved++; });
    await click('btnCancel');
    const stC = await waitState(s => s.state === 'idle', 15000, 300);
    const after = await esJson(ES_SNAPSHOT);
    let err = 0; after.pieces.forEach((p, i) => p.forEach((v, k) => { err = Math.max(err, Math.abs(v - ref.pieces[i][k])); }));
    check(moved > 0, `run2 moved ${moved} pieces before Cancel`);
    check(stC.state === 'idle', `cancel -> idle ("${stC.status}")`);
    check(err < 0.01, `Cancel restores every anchor: max error ${err.toExponential(2)} pt`);
    check(after.roll === null, 'Cancel removes the roll');
    console.log(`RESULT ${SCEN}: len ${res.lenMm && res.lenMm.toFixed(1)} mm, fill ${res.fill && (res.fill * 100).toFixed(1)} %, applies ${sm.applyCalls}, lat ${sm.latAvg.toFixed(0)}/${sm.latMax.toFixed(0)} ms, host ${sm.hostAvg.toFixed(0)} ms, revert err ${err.toExponential(2)} pt, before-pieces ${before.pieces.length}`);
  } finally {
    if (process.env.KEEP !== '1') console.log('  close:', await es(`(function(){ try { app.documents.getByName(${JSON.stringify(docName)}).close(SaveOptions.DONOTSAVECHANGES); return 'closed'; } catch(e){ return 'ERR '+e.message; } })()`));
    console.log(fails ? `\n${fails} FAIL` : '\nALL OK');
    ws.close(); process.exit(fails ? 1 : 0);
  }
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
