// Real user problem files (bench/real/cases) through the Corvo panel: open (SVG/PDF/DXF), select everything, Nest,
// Apply, then measure what the users complained about: shape unchanged (every anchor + handle moved rigidly),
// polygon-to-polygon min gap, overlaps, pieces vs source objects, scale (piece areas before/after), time.
// Open paths (DXF LINE/ARC/SPLINE entities) are chained by endpoints HERE, independently from the panel.
// uso: node real.js <file> [roll=600] [gap=2] [rot=90] [secs=20]      env KEEP=1 leaves the document open, OUT=result.json
// Never touches the desktop: CDP to the panel only; the document is closed WITHOUT saving.
'use strict';
const L = require('./lib.js');
const MM = L.MM;
const [FILE, ROLL = '600', GAP = '2', ROT = '90', SECS = '20'] = process.argv.slice(2);
const OUT = process.env.OUT || '';

const esOpen = (f) => `(function(){ var u=app.userInteractionLevel; app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
  var o=app.preferences.AutoCADFileOptions, keep=[o.globalScaleOption,o.unit,o.unitScaleRatio,o.centerArtwork];
  try { if (/\\.dxf$/i.test(${JSON.stringify(f)})) { o.globalScaleOption=AutoCADGlobalScaleOption.OriginalSize; o.unit=AutoCADUnit.${process.env.DXFUNIT || "Millimeters"}; o.unitScaleRatio=1; o.centerArtwork=false; }
    var d=app.open(new File(${JSON.stringify(f)})); return d.name; } catch(e){ return 'ERR '+e.message; }
  finally { o.globalScaleOption=keep[0]; o.unit=keep[1]; o.unitScaleRatio=keep[2]; o.centerArtwork=keep[3]; app.userInteractionLevel=u; } })()`;
// every path of every tagged item: anchors+handles (rigid check) and a flattened polyline (regions)
const ES_PATHS = `(function(){ var d=app.activeDocument, prev=app.coordinateSystem; app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
  function poly(p){ var P=p.pathPoints, n=P.length, A=[],Lh=[],R=[],i,out=[]; for(i=0;i<n;i++){ A.push(P[i].anchor); Lh.push(P[i].leftDirection); R.push(P[i].rightDirection); }
    if (!n) return {closed:p.closed, ctl:[], pts:[]};
    out.push([A[0][0],A[0][1]]); var segs=p.closed?n:n-1;
    for(i=0;i<segs;i++){ var j=(i+1)%n; corvo_flatCubic(out,A[i],R[i],Lh[j],A[j],0.1,0); }
    var ctl=[]; for(i=0;i<n;i++) ctl.push([A[i][0],A[i][1],Lh[i][0],Lh[i][1],R[i][0],R[i][1]]);
    return {closed:p.closed, ctl:ctl, pts:out}; }
  function walk(it, out, cid){ var t=it.typename, i;
    if (t==='PathItem'){ if (it.guides) return; var q=poly(it); q.c=cid; out.push(q); return; }
    if (t==='CompoundPathItem'){ var c=out.length+1000000; for(i=0;i<it.pathItems.length;i++){ var q2=poly(it.pathItems[i]); q2.c=c; out.push(q2);} return; }
    if (t==='GroupItem'){ for(i=0;i<it.pageItems.length;i++) walk(it.pageItems[i], out, -1); return; }
    var b=it.geometricBounds; out.push({closed:true,other:t,ctl:[],pts:[[b[0],b[3]],[b[2],b[3]],[b[2],b[1]],[b[0],b[1]]]}); }
  var res=[];
  for (var i=0;i<d.pageItems.length;i++){ var it=d.pageItems[i]; var n=''; try{n=it.note;}catch(e){} if (!/^cv:/.test(n)) continue;
    var u=[]; walk(it,u,-1); res.push({tag:n, paths:u}); }
  app.coordinateSystem=prev; return corvo_json(res); })()`;
// UNGROUP=n: what a user does first on an Inkscape/DXF import (Object > Ungroup n times on the top-level groups)
const ES_UNGROUP = `(function(){ var d=app.activeDocument, n=0;
  for (var l=0;l<d.layers.length;l++){ var ly=d.layers[l]; if (ly.locked||!ly.visible) continue;
    var gs=[]; for (var i=0;i<ly.groupItems.length;i++){ var g=ly.groupItems[i]; if (g.parent===ly && !g.clipped) gs.push(g); }
    for (var k=0;k<gs.length;k++){ var g2=gs[k]; while (g2.pageItems.length) g2.pageItems[0].move(g2, ElementPlacement.PLACEBEFORE); g2.remove(); n++; } }
  return n; })()`;
const ES_SELECT_ALL = `(function(){ var d=app.activeDocument, out=[];
  for (var l=0;l<d.layers.length;l++){ var ly=d.layers[l]; if (ly.name==='Corvo'||ly.locked||!ly.visible) continue;
    for (var i=0;i<ly.pageItems.length;i++){ var it=ly.pageItems[i]; if (it.parent===ly && !it.hidden && !it.locked) out.push(it); } }
  d.selection=null; d.selection=out; return d.selection.length; })()`;

// ---- chaining of open polylines (independent from the panel), tolerance in pt
function chain(opens, tol) {
  const used = new Array(opens.length).fill(false), loops = [], rest = [];
  const near = (a, b) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
  for (let s = 0; s < opens.length; s++) {
    if (used[s]) continue; used[s] = true;
    let pts = opens[s].slice(), members = [s], closed = near(pts[0], pts[pts.length - 1]) && pts.length > 2;
    for (let grow = true; grow && !closed;) {
      grow = false;
      for (let k = 0; k < opens.length; k++) {
        if (used[k]) continue; const q = opens[k], e = pts[pts.length - 1];
        if (near(q[0], e)) pts = pts.concat(q.slice(1));
        else if (near(q[q.length - 1], e)) pts = pts.concat(q.slice().reverse().slice(1));
        else if (near(q[q.length - 1], pts[0])) pts = q.slice(0, -1).concat(pts);
        else if (near(q[0], pts[0])) pts = q.slice().reverse().slice(0, -1).concat(pts);
        else continue;
        used[k] = true; members.push(k); grow = true;
        if (near(pts[0], pts[pts.length - 1])) { closed = true; break; }
      }
    }
    if (closed) loops.push({ pts, members }); else rest.push({ pts, members });
  }
  return { loops, rest };
}
function rigidErr(pre, post, ap) {   // max distance (pt) between post anchors/handles and pre moved by ap
  const c = Math.cos(ap.a * Math.PI / 180), s = Math.sin(ap.a * Math.PI / 180);
  const T = (x, y) => [c * x - s * y + ap.tx, s * x + c * y + ap.ty];
  let worst = 0;
  pre.paths.forEach((p, k) => {
    const q = post.paths[k]; if (!q || q.ctl.length !== p.ctl.length) { worst = 1e9; return; }
    p.ctl.forEach((v, i) => { const w = q.ctl[i]; for (let j = 0; j < 6; j += 2) { const m = T(v[j], v[j + 1]); worst = Math.max(worst, Math.hypot(m[0] - w[j], m[1] - w[j + 1])); } });
  });
  return worst;
}
// per piece: closed paths even-odd per (compound) path, chained open loops even-odd together
function regionsOf(pieceTags, byTag) {
  const warn = [], opens = [], owner = [];
  pieceTags.forEach((tags, pi) => tags.forEach(t => (byTag[t] ? byTag[t].paths : []).forEach(p => { if (!p.closed && p.pts.length >= 2) { opens.push(p.pts); owner.push(pi); } })));
  const ch = chain(opens, 0.25);
  const loopsOf = pieceTags.map(() => []), linesOf = pieceTags.map(() => []);
  ch.rest.forEach(l => l.members.forEach(m => linesOf[owner[m]].push(opens[m])));   // unchained lines: thin regions
  ch.loops.forEach(l => { const ps = new Set(l.members.map(m => owner[m])); ps.forEach(pi => loopsOf[pi].push(l.pts)); if (ps.size > 1) warn.push('loop split across pieces ' + [...ps].join(',')); });
  const regs = pieceTags.map((tags, pi) => {
    const units = [];
    tags.forEach(t => {
      const byC = {};
      (byTag[t] ? byTag[t].paths : []).forEach((p, k) => { if (!p.closed || p.pts.length < 3) return; const key = p.c >= 0 ? p.c : 'p' + k; (byC[key] = byC[key] || []).push(p.pts); });
      Object.values(byC).forEach(r => units.push(L.unitRegion(r)));
    });
    if (loopsOf[pi].length) units.push(L.unitRegion(loopsOf[pi]));
    linesOf[pi].forEach(pts => { const C = L.C, co = new C.ClipperOffset(2, 25), out = new C.Paths();
      co.AddPath(pts.map(([x, y]) => ({ X: Math.round(x * L.S), Y: Math.round(y * L.S) })), C.JoinType.jtRound, C.EndType.etOpenRound); co.Execute(out, 0.1 * L.S); if (out.length) units.push(out); });
    return units.length ? L.union(units) : [];
  });
  return { regs, loops: ch.loops.length, openRest: ch.rest.length, warn };
}
const bbMm = (regs) => { const b = L.bb([].concat(...regs)); return [(b[2] - b[0]) / MM, (b[3] - b[1]) / MM]; };

(async () => {
  await L.connect();
  const t0 = Date.now();
  const name = await L.es(esOpen(FILE.replace(/\\/g, '/')));
  console.log('open', name, ((Date.now() - t0) / 1000).toFixed(1), 's');
  if (/^ERR/.test(name)) { L.close(); process.exit(2); }
  const R = { file: FILE, roll: +ROLL, gap: +GAP, rot: ROT, secs: +SECS };
  try {
    for (let k = 0; k < +(process.env.UNGROUP || 0); k++) console.log('  ungrouped', await L.es(ES_UNGROUP));
    R.ungroup = +(process.env.UNGROUP || 0);
    // DROP_BIN=1: the SVGnest/Deepnest bin rectangle (largest top-level object) is the sheet, not a part -> removed
    if (process.env.DROP_BIN === '1') console.log('  bin removed', await L.es(`(function(){ var d=app.activeDocument, best=null, ba=0;
      for (var i=0;i<d.pageItems.length;i++){ var it=d.pageItems[i]; if (it.parent.typename!=='Layer') continue; var b=it.geometricBounds, a=(b[2]-b[0])*(b[1]-b[3]); if (a>ba){ ba=a; best=it; } }
      var r=best.typename+' '+((best.geometricBounds[2]-best.geometricBounds[0])*25.4/72).toFixed(1)+'x'+((best.geometricBounds[1]-best.geometricBounds[3])*25.4/72).toFixed(1)+' mm'; best.remove(); return r; })()`));
    // COPIES=n: n-1 duplicates of every top-level object side by side (earrings sheet: many copies of one design)
    if (+(process.env.COPIES || 0) > 1) console.log('  copies', await L.es(`(function(){ var d=app.activeDocument, src=[], n=${+process.env.COPIES}, made=0;
      for (var i=0;i<d.pageItems.length;i++){ var it=d.pageItems[i]; if (it.parent.typename==='Layer') src.push(it); }
      for (var k=0;k<src.length;k++){ var b=src[k].geometricBounds, w=b[2]-b[0]+20; for (var c=1;c<n;c++){ var dup=src[k].duplicate(); dup.translate(w*c, 0); made++; } }
      return made; })()`));
    R.tagged = +(await L.es(L.ES_TAG));
    R.selected = +(await L.es(ES_SELECT_ALL));
    const pre = await L.esJson(ES_PATHS); const preBy = {}; pre.forEach(x => { preBy[x.tag] = x; });
    R.paths = pre.reduce((s, x) => s + x.paths.length, 0);
    R.openPaths = pre.reduce((s, x) => s + x.paths.filter(p => !p.closed).length, 0);
    const preAll = regionsOf([pre.map(x => x.tag)], preBy);
    R.srcLoops = preAll.loops; R.srcOpenUnchained = preAll.openRest;
    R.srcBoxMm = preAll.regs[0].length ? bbMm(preAll.regs) : null;
    console.log(`  source: ${R.tagged} objects, ${R.paths} paths (${R.openPaths} open -> ${R.srcLoops} closed chains, ${R.srcOpenUnchained} unchained), extent ${R.srcBoxMm ? R.srcBoxMm.map(v => v.toFixed(2)).join(' x ') : '-'} mm`);
    if (process.env.PREGAP === '1') {   // how the parts sit in the source (assembly: touching / overlapping outlines)
      const pr0 = regionsOf(pre.map(x => [x.tag]), preBy).regs.filter(r => r.length), pc0 = L.pairCheck(pr0, 2 * MM);
      R.srcOverlaps = pc0.overl.map(o => +(o[2] / MM / MM).toFixed(3)); R.srcMinGapMm = pc0.minGap >= 1e8 ? null : pc0.minGap / MM;
      console.log(`  source layout: overlaps (mm2) ${JSON.stringify(R.srcOverlaps)}, min distance ${R.srcMinGapMm === null ? '-' : R.srcMinGapMm.toFixed(3)} mm`);
    }
    await L.setup({ roll: ROLL, gap: GAP, rot: ROT, time: SECS, holes: true, merge: process.env.MERGE !== '0', seed: +(process.env.SEED || 7) });
    const st = await L.nestToReview(+SECS);
    R.nestState = st.state; R.status = st.status; R.wallS = st.wallMs / 1000; R.len = st.len; R.fill = st.fill;
    console.log(`  nest: ${st.state} "${st.status.slice(0, 300)}" wall ${R.wallS.toFixed(1)} s len ${st.len} fill ${st.fill}`);
    if (st.state !== 'review') { R.verdict = 'NO-NEST'; return; }
    const info = await L.sessionInfo();
    const applied = await L.esJson('corvo_json($.global.corvo.applied)');
    R.pieces = info.host.items.length; R.enginePieces = info.panel.nPieces; R.inHoles = info.panel.holes && info.panel.holes.children ? info.panel.holes.children.length : 0;
    const sa = await L.applyAndWait();
    R.apply = sa.status;
    const post = await L.esJson(ES_PATHS); const postBy = {}; post.forEach(x => { postBy[x.tag] = x; });
    let worst = 0, moved = 0; const notInPiece = [], inPiece = new Set();
    info.host.items.forEach((tags, pi) => tags.forEach(t => {
      inPiece.add(t); if (!preBy[t] || !postBy[t]) return;
      worst = Math.max(worst, rigidErr(preBy[t], postBy[t], applied[pi])); if (applied[pi].a || applied[pi].tx || applied[pi].ty) moved++;
    }));
    pre.forEach(x => { if (!inPiece.has(x.tag)) notInPiece.push(x.tag); });
    R.rigidMaxMm = worst / MM; R.movedObjects = moved; R.leftInPlace = notInPiece.length;
    let still = 0; notInPiece.forEach(t => { still = Math.max(still, rigidErr(preBy[t], postBy[t], { a: 0, tx: 0, ty: 0 })); });
    R.leftMovedMm = still / MM;
    const pr = regionsOf(info.host.items, postBy), regs = pr.regs;
    R.emptyPieces = regs.filter(r => !r.length).length;
    const pc = L.pairCheck(regs.filter(r => r.length), +GAP * MM);
    R.overlaps = pc.overl.length; R.overlapSample = pc.overl.slice(0, 5).map(o => [o[0], o[1], +(o[2] / MM / MM).toFixed(2)]);
    R.minGapMm = pc.minGap >= 1e8 ? null : pc.minGap / MM; R.nearPairs = pc.near.length;
    const preRegs = regionsOf(info.host.items, preBy).regs;
    let dA = 0; preRegs.forEach((r, k) => { const a0 = Math.abs(L.areaP(r)), a1 = Math.abs(L.areaP(regs[k])); if (a0 > 0) dA = Math.max(dA, Math.abs(a1 - a0) / a0); });
    R.areaChangeMax = dA; R.warn = pr.warn.slice(0, 3);
    console.log(`  pieces ${R.pieces} (engine ${R.enginePieces}, in holes ${R.inHoles}, without region ${R.emptyPieces}), left in place ${R.leftInPlace} (moved ${R.leftMovedMm.toFixed(4)} mm) ${R.warn.join(';')}`);
    console.log(`  shape: max anchor/handle deviation from rigid move ${R.rigidMaxMm.toExponential(2)} mm over ${moved} moved objects; piece area change max ${(dA * 100).toFixed(4)} %`);
    console.log(`  overlaps ${R.overlaps} ${JSON.stringify(R.overlapSample)}; min gap ${R.minGapMm === null ? '-' : R.minGapMm.toFixed(3)} mm (asked ${GAP}), pairs below gap-0.25mm: ${R.nearPairs}`);
    console.log(`  apply: "${sa.status.slice(0, 160)}"`);
  } finally {
    if (OUT) require('fs').writeFileSync(OUT, JSON.stringify(R, null, 1));
    if (process.env.KEEP !== '1') console.log(' close', await L.closeDoc(name));
    L.close(); process.exit(0);
  }
})().catch(e => { console.error('ERR', e.stack || e); process.exit(1); });
