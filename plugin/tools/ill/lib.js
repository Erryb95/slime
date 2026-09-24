// Harness for the Illustrator verification of modules 2,5,6,8 (never touches the desktop: CDP to the panel only)
'use strict';
const C = require('C:/Users/erryb/Desktop/Plugin/plugin/client/lib/clipper.js');
const PORT = 8093, MM = 72 / 25.4;
let ws, msgId = 0; const pending = {};
async function connect() {
  const t = (await (await fetch(`http://localhost:${PORT}/json`)).json()).find(x => x.type === 'page');
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; }
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type !== 'log') { const txt = d.params.args.map(a => a.value !== undefined ? a.value : a.description).join(' '); if (/corvo/.test(txt)) console.log('   [panel ' + d.params.type + '] ' + txt.slice(0, 300)); }
    else if (d.method === 'Runtime.exceptionThrown') console.log('   [panel exception]', JSON.stringify(d.params.exceptionDetails).slice(0, 300)); };
  await cdp('Runtime.enable', {});
}
const cdp = (method, params) => new Promise(res => { const i = ++msgId; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
async function js(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 900000 });
  if (r.result && r.result.exceptionDetails) throw new Error('panel: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result.result.value;
}
const es = (code) => js(`new Promise(r => window.__adobe_cep__.evalScript(${JSON.stringify(code)}, r))`);
const esJson = async (code) => { const s = await es(code); try { return JSON.parse(s); } catch (e) { throw new Error('ES: ' + String(s).slice(0, 400)); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0, checks = 0;
function check(cond, msg) { checks++; console.log((cond ? '  OK   ' : '  FAIL ') + msg); if (!cond) fails++; return cond; }

async function openDoc(file) {
  return es(`(function(){ var u=app.userInteractionLevel; app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
    try { var d=app.open(new File('${file}')); return d.name; } catch(e){ return 'ERR '+e.message; } finally { app.userInteractionLevel=u; } })()`);
}
async function closeDoc(name) {
  return es(`(function(){ try { app.documents.getByName(${JSON.stringify(name)}).close(SaveOptions.DONOTSAVECHANGES); return 'closed'; } catch(e){ return 'ERR '+e.message; } })()`);
}
// tag every top-level item of the non-Corvo layers with note "cv:k"; returns count
const ES_TAG = `(function(){ var d=app.activeDocument, k=0;
  function walk(ly){ if (ly.name==='Corvo'||ly.name==='Regmarks'||ly.name==='Regmarks FineCut (guida)'||ly.locked||!ly.visible) return;
    for (var i=0;i<ly.pageItems.length;i++){ var it=ly.pageItems[i]; if (it.parent!==ly) continue; try{ it.note='cv:'+(k++); }catch(e){} }
    for (var j=0;j<ly.layers.length;j++) walk(ly.layers[j]); }
  for (var i=0;i<d.layers.length;i++) walk(d.layers[i]); return k; })()`;
const esSelectTagged = (filter) => es(`(function(){ var d=app.activeDocument, out=[], F=${JSON.stringify(filter || null)};
  for (var i=0;i<d.pageItems.length;i++){ var it=d.pageItems[i]; var n=''; try{n=it.note;}catch(e){} if (!/^cv:/.test(n)) continue;
    if (F && F.indexOf(n)<0) continue; out.push(it); }
  d.selection=null; d.selection=out; return d.selection.length; })()`);
const ES_UNITS = `(function(){ var d=app.activeDocument, prev=app.coordinateSystem; app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  function paint(p){ var f=null,s=null; try{ if(p.filled && p.fillColor.typename==='SpotColor') f=p.fillColor.spot.name; else if (p.filled) f=p.fillColor.typename; }catch(e){}
    try{ if(p.stroked && p.strokeColor.typename==='SpotColor') s=p.strokeColor.spot.name; else if (p.stroked) s=p.strokeColor.typename; }catch(e){} return [f,s]; }
  function leaves(it, out){ var t=it.typename, i;
    if (t==='PathItem'){ if (it.guides) return; var r=[]; corvo_collect(it,0.25,r); var pp=paint(it); out.push({t:'p',rings:r,fill:pp[0],stroke:pp[1]}); return; }
    if (t==='CompoundPathItem'){ var r2=[]; corvo_collect(it,0.25,r2); var pp2=it.pathItems.length?paint(it.pathItems[0]):[null,null]; out.push({t:'c',rings:r2,fill:pp2[0],stroke:pp2[1]}); return; }
    if (t==='GroupItem'){ if (it.clipped){ var r3=[]; corvo_collect(it,0.25,r3); out.push({t:'clip',rings:r3}); return; }
      for (i=0;i<it.pageItems.length;i++) leaves(it.pageItems[i], out); return; }
    var b=it.geometricBounds; out.push({t:t, rings:[[[b[0],b[3]],[b[2],b[3]],[b[2],b[1]],[b[0],b[1]]]]}); }
  var res=[];
  for (var i=0;i<d.pageItems.length;i++){ var it=d.pageItems[i]; var n=''; try{n=it.note;}catch(e){} if (!/^cv:/.test(n)) continue;
    var u=[]; leaves(it,u); var ly=it.layer?it.layer.name:''; var gb=it.geometricBounds; var o={tag:n,name:it.name,type:it.typename,layer:ly,units:u,gb:[gb[0],gb[1],gb[2],gb[3]]};
    if (it.typename==='PlacedItem'||it.typename==='RasterItem'){ var m=it.matrix; o.m=[m.mValueA,m.mValueB,m.mValueC,m.mValueD,m.mValueTX,m.mValueTY]; }
    res.push(o); }
  app.coordinateSystem=prev; return corvo_json(res); })()`;
const units = () => esJson(ES_UNITS);
const ES_LAYERS = `(function(){ var d=app.activeDocument, o=[]; for (var i=0;i<d.layers.length;i++){ var l=d.layers[i]; o.push({name:l.name,n:l.pageItems.length,printable:l.printable,locked:l.locked,visible:l.visible}); } return corvo_json(o); })()`;
const ES_REGMARKS = `(function(){ var d=app.activeDocument, prev=app.coordinateSystem; app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM; var o=[];
  for (var i=0;i<d.layers.length;i++){ var l=d.layers[i];
    for (var j=0;j<l.groupItems.length;j++){ var g=l.groupItems[j]; if (!/^Corvo_Regmarks/.test(g.name)) continue;
      var ms=[]; for (var k=0;k<g.pathItems.length;k++){ var p=g.pathItems[k], pts=[]; for (var q=0;q<p.pathPoints.length;q++) pts.push(p.pathPoints[q].anchor);
        var c=p.fillColor, col=c.typename==='CMYKColor'?[c.cyan,c.magenta,c.yellow,c.black]:(c.typename==='RGBColor'?[c.red,c.green,c.blue]:c.typename);
        var gb=p.geometricBounds; ms.push({name:p.name,pts:pts,gb:[gb[0],gb[1],gb[2],gb[3]],fill:col,stroked:p.stroked,filled:p.filled}); }
      o.push({layer:l.name,printable:l.printable,group:g.name,marks:ms}); }
    for (j=0;j<l.pathItems.length;j++){ var f=l.pathItems[j]; if (/^Corvo_FineCut_Area/.test(f.name)){ var b=f.geometricBounds; o.push({layer:l.name,frame:f.name,gb:[b[0],b[1],b[2],b[3]]}); } } }
  var roll=null; try { var cl=d.layers.getByName('Corvo'); for (var r=0;r<cl.pathItems.length;r++){ var it=cl.pathItems[r]; if (/^Corvo_Roll/.test(it.name)){ var rb=it.geometricBounds; roll={name:it.name,gb:[rb[0],rb[1],rb[2],rb[3]]}; } } } catch(e){}
  app.coordinateSystem=prev; return corvo_json({rm:o,roll:roll}); })()`;

async function setup(o) {
  const v = Object.assign({ roll: 600, gap: 2, rot: '90', time: 10, shape: 'all', merge: true, regmarks: 'none', holes: true, preset: '', rasterMode: 'contour', seed: 7 }, o);
  await js(`(function(){ function set(id,v){ var e=document.getElementById(id); if(!e) return; e.value=v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }
    set('preset','${v.preset}'); if (!'${v.preset}') { set('rollWidth','${v.roll}'); set('gap','${v.gap}'); }
    set('rotations','${v.rot}'); set('time','${v.time}'); set('shapeSrc','${v.shape}'); set('regmarks','${v.regmarks}'); set('rasterMode','${v.rasterMode}');
    var m=document.getElementById('merge'); m.checked=${!!v.merge}; m.dispatchEvent(new Event('change'));
    var h=document.getElementById('useHoles'); if(h){ h.checked=${!!v.holes}; h.dispatchEvent(new Event('change')); }
    window.CorvoSeed=${v.seed}; return 1; })()`);
  await js(`(function(){ if (window.__clog) { if (window.__clog.length>200) window.__clog.splice(0, window.__clog.length-50); return 1; } window.__clog=[]; var orig=CSInterface.prototype.evalScript;
    CSInterface.prototype.evalScript=function(script, cb){ var rec={fn:String(script).slice(0,40), t0:Date.now()}; window.__clog.push(rec);
      return orig.call(this, script, function(res){ rec.ms=Date.now()-rec.t0; rec.len=String(res).length; if(cb) cb(res); }); }; return 2; })()`);
  return v;
}
const panelState = () => js(`(function(){ var S=CorvoPanel.state(); return {state:S.state, phase:S.phase, best:S.best?S.best.strip_width:null, status:document.getElementById('status').textContent, cls:document.getElementById('status').className,
  len:document.getElementById('sLength').textContent, fill:document.getElementById('sFill').textContent}; })()`);
const click = (id) => js(`document.getElementById('${id}').click(), 1`);
async function waitState(pred, timeoutMs, everyMs) {
  const t0 = Date.now();
  for (;;) { const st = await panelState(); if (pred(st)) return st; if (Date.now() - t0 > timeoutMs) return st; await sleep(everyMs || 300); }
}
async function nestToReview(secs) {
  const t0 = Date.now();
  await click('btnNest');
  let st;
  for (;;) {
    st = await panelState();
    if (st.state === 'review' || (st.state === 'idle' && /error/.test(st.cls))) break;
    if (st.state === 'idle' && Date.now() - t0 > 5000) { console.log('  !! idle without error after Nest: "' + st.status + '"'); break; }
    if (st.state === 'preparing' && Date.now() - t0 > 1200000) {
      console.log('  !! STUCK in preparing: ' + st.status);
      try { console.log('  clog: ' + JSON.stringify(await js('(window.__clog||[]).slice(-4).map(function(r){return {fn:r.fn,ms:r.ms,len:r.len};})'))); } catch (e) {}
      break;
    }
    if (Date.now() - t0 > (secs + 600) * 1000) break;
    await sleep(500);
  }
  st.wallMs = Date.now() - t0;
  return st;
}
async function applyAndWait() {
  await click('btnApply');
  return waitState(s => s.state === 'idle', 60000, 300);
}
async function cancelAndWait() {
  await click('btnCancel');
  return waitState(s => s.state === 'idle', 60000, 300);
}
async function sessionInfo() {
  const host = await esJson(`(function(){ var st=$.global.corvo, o=[]; for (var i=0;i<st.items.length;i++){ var m=st.items[i], t=[]; if(!(m instanceof Array)) m=[m]; for (var k=0;k<m.length;k++){ var n=''; try{n=m[k].note;}catch(e){} t.push(n);} o.push(t);} return corvo_json({items:o, steps:st.steps||0}); })()`);
  const panel = await js(`(function(){ var S=CorvoPanel.state(); var H=S.holes; return { H:S.H, origin:S.origin, rollOrigin:S.rollOrigin, rm:S.rm, best:S.best?{w:S.best.strip_width,n:S.best.placements.length}:null,
    nPieces:S.pieces?S.pieces.length:0, nNest:S.nestPieces?S.nestPieces.length:0,
    pieces:(S.pieces||[]).map(function(p){ return {id:p.id, hostI:(p.hostI!==undefined?p.hostI:p.id), name:p.name}; }),
    holes: H ? JSON.parse(JSON.stringify(H, function(k,v){ return (k==='polygon'||k==='rings'||k==='free'||k==='regions')?undefined:v; })) : null }; })()`);
  return { host, panel };
}

// ---------------------------------------------------------------- geometry
const S = 1000;
const toP = (r) => r.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
function unitRegion(rings) { const c = new C.Clipper(), out = new C.Paths(); c.AddPaths(rings.map(toP), C.PolyType.ptSubject, true); c.Execute(C.ClipType.ctUnion, out, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftEvenOdd); return out; }
function union(pathsList) { const c = new C.Clipper(), out = new C.Paths(); for (const p of pathsList) c.AddPaths(p, C.PolyType.ptSubject, true); c.Execute(C.ClipType.ctUnion, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero); return out; }
function outerOnly(paths) { return union([paths.filter(p => C.Clipper.Orientation(p))]); }
function grow(paths, d) { const co = new C.ClipperOffset(2, 0.25 * S), out = new C.Paths(); co.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon); co.Execute(out, d * S); return out; }
function inter(a, b) { const c = new C.Clipper(), out = new C.Paths(); c.AddPaths(a, C.PolyType.ptSubject, true); c.AddPaths(b, C.PolyType.ptClip, true); c.Execute(C.ClipType.ctIntersection, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero); return out; }
function diff(a, b) { const c = new C.Clipper(), out = new C.Paths(); c.AddPaths(a, C.PolyType.ptSubject, true); c.AddPaths(b, C.PolyType.ptClip, true); c.Execute(C.ClipType.ctDifference, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero); return out; }
const areaP = (ps) => ps.reduce((s, p) => s + C.Clipper.Area(p), 0) / (S * S);
function bb(ps) { let l = 1e30, b = 1e30, r = -1e30, t = -1e30; for (const p of ps) for (const q of p) { l = Math.min(l, q.X / S); r = Math.max(r, q.X / S); b = Math.min(b, q.Y / S); t = Math.max(t, q.Y / S); } return [l, b, r, t]; }
function minDist(a, b, maxD) {
  if (areaP(inter(a, b)) > 0.01) return 0;
  let lo = 0, hi = maxD;
  if (areaP(inter(grow(a, hi), b)) <= 0.0005) return hi;
  for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (areaP(inter(grow(a, m), b)) > 0.0005) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
function pieceRegions(U, groups) {
  const byTag = {}; U.forEach(u => { byTag[u.tag] = u; });
  return groups.map(tags => union(tags.filter(t => byTag[t]).flatMap(t => byTag[t].units.filter(x => x.rings.length).map(x => unitRegion(x.rings)))));
}
// pairwise overlap + min gap between piece regions (bbox prefilter)
function pairCheck(regs, gapPt) {
  const bbs = regs.map(bb), overl = [], near = []; let minGap = 1e9;
  for (let i = 0; i < regs.length; i++) for (let j = i + 1; j < regs.length; j++) {
    const a = bbs[i], b = bbs[j];
    if (a[2] + gapPt + 1 < b[0] || b[2] + gapPt + 1 < a[0] || a[3] + gapPt + 1 < b[1] || b[3] + gapPt + 1 < a[1]) continue;
    const ov = areaP(inter(regs[i], regs[j]));
    if (ov > 0.01) { overl.push([i, j, ov]); continue; }
    const d = minDist(regs[i], regs[j], gapPt + 1);
    if (d < minGap) minGap = d;
    if (d < gapPt - 0.7) near.push([i, j, d]);
  }
  return { overl, near, minGap };
}
module.exports = { connect, js, es, esJson, sleep, check, openDoc, closeDoc, ES_TAG, esSelectTagged, units, ES_LAYERS, ES_REGMARKS, setup, panelState, click, waitState, nestToReview, applyAndWait, cancelAndWait, sessionInfo,
  unitRegion, union, outerOnly, grow, inter, diff, areaP, bb, minDist, pieceRegions, pairCheck, MM, C, S, get fails() { return fails; }, get checks() { return checks; }, close: () => ws.close() };
