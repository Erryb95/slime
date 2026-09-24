// Module 8 verification in Illustrator: linked + embedded PNGs (bench/real/dtf), mirrored/rotated placements,
// linked-path contour == rendered contour, nest by silhouette (DTF 58 preset), image moves exactly with its contour.
const fs = require('fs');
const L = require('./lib.js');
const R = require('C:/Users/erryb/Desktop/Plugin/plugin/client/js/raster.js');
const DTF = 'C:/Users/erryb/Desktop/Plugin/bench/real/dtf/';
const MM = L.MM, SECS = +(process.argv[2] || 15);

const ES_BUILD = `(function(){ var MM=72/25.4, d=app.documents.add(DocumentColorSpace.RGB, 3000, 3000), ly=d.layers[0], out=[];
  function put(f, x, y, wmm, name){ var p=ly.placedItems.add(); p.file=new File('${DTF}'+f); var b=p.geometricBounds, s=wmm*MM/(b[2]-b[0])*100; p.resize(s,s); b=p.geometricBounds; p.translate(x-b[0], y-b[1]); p.name=name; return p; }
  put('dtf_butterfly.png', 100, 2900, 90, 'butterfly');
  put('dtf_cat_silhouette.png', 500, 2900, 80, 'cat');
  put('dtf_donut_ring_hole.png', 900, 2900, 120, 'donut');
  put('dtf_star_simple.png', 1400, 2900, 60, 'star');
  put('dtf_welcome_cursive_text.png', 100, 2400, 200, 'welcome');
  var sv=put('dtf_star_simple.png', 900, 2400, 60, 'star_mirrorV'); sv.transform(app.getScaleMatrix(100,-100));
  var bf=put('dtf_butterfly.png', 1400, 2400, 70, 'butterfly_mirrorH'); bf.transform(app.getScaleMatrix(-100,100));
  var rot=put('dtf_cat_silhouette.png', 1900, 2400, 60, 'cat_rot30'); rot.rotate(30);
  var e=put('dtf_donut_ring_hole.png', 100, 1900, 70, 'donut_embedded'); e.embed();
  var ds=[]; for (var i=0;i<ly.pageItems.length;i++){ var it=ly.pageItems[i]; var m=null; try{ m=it.matrix; }catch(x){} ds.push(it.name+':'+it.typename+(m?' A='+m.mValueA.toFixed(3)+' D='+m.mValueD.toFixed(3):'')); }
  return d.name+' | '+ds.join(' | '); })()`;
// host view of every image: linked path (if accepted) and forced render; corners in document pt
const ES_INFO = (render) => `corvo_withDocCoords(function(){ var d=app.activeDocument, o=[];
  for (var i=0;i<d.pageItems.length;i++){ var it=d.pageItems[i]; if (!corvo_m8_isRaster(it)) continue; var n=''; try{n=it.note;}catch(e){}
    var t0=new Date().getTime(), inf=corvo_m8_info(it, d, i, {rasterRender:${render}}); inf.ms=new Date().getTime()-t0; inf.tag=n; inf.name=it.name; o.push(inf); }
  return corvo_json(o); })`;

function traceRegion(inf) {
  const img = R.decodePNG(fs.readFileSync(inf.path));
  const t = R.trace(img, inf.corners, {});
  return { reg: L.unitRegion(t.rings), t };
}
function symDiff(a, b) { return L.areaP(L.diff(a, b)) + L.areaP(L.diff(b, a)); }

(async () => {
  await L.connect();
  const built = await L.es(ES_BUILD);
  const name = built.split(' | ')[0];
  console.log(built);
  const rows = [];
  try {
    console.log(' tagged', await L.es(L.ES_TAG));
    // ---- 1. linked-path corners vs forced render (validates CORVO_M8_PLACED_DSIGN and the corner mapping)
    const lk = await L.esJson(ES_INFO(false)), rd = await L.esJson(ES_INFO(true));
    for (let k = 0; k < lk.length; k++) {
      const a = traceRegion(lk[k]), b = traceRegion(rd[k]);
      const area = L.areaP(b.reg), sd = symDiff(a.reg, b.reg);
      const px = 72 / (rd[k].ppi || 150);   // pt per rendered pixel
      const per = b.reg.reduce((s2, p) => { let q = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) q += Math.hypot(p[i].X - p[j].X, p[i].Y - p[j].Y); return s2 + q / 1000; }, 0);
      const meanOff = sd / per;                  // average distance between the two contours (pt)
      const ok = meanOff < px;
      L.check(ok, `${lk[k].name}: host path "${lk[k].kind}"${lk[k].mirror ? ' mirror ' + lk[k].mirror : ''} (${lk[k].ms} ms) vs render (${rd[k].ms} ms, ${(rd[k].ppi || 0).toFixed(0)} ppi): mean contour offset ${(meanOff / MM).toFixed(3)} mm (< 1 render px ${(px / MM).toFixed(3)}), diff ${(sd / area * 100).toFixed(2)} % of area`);
      rows.push({ name: lk[k].name, kind: lk[k].kind, ms: lk[k].ms, renderMs: rd[k].ms, diffPct: sd / area * 100 });
      for (const x of [lk[k], rd[k]]) if (x.temp) try { fs.unlinkSync(x.path); } catch (e) {}
    }
    const before = await L.esJson(ES_INFO(true));
    const preRegs = {}; before.forEach(x => { preRegs[x.tag] = traceRegion(x).reg; try { fs.unlinkSync(x.path); } catch (e) {} });

    // ---- 2. nest through the panel, DTF 58 preset
    await L.esSelectTagged();
    await L.setup({ preset: 'dtf58', rot: '90', time: SECS, holes: true, regmarks: 'none', rasterMode: 'contour', seed: 7 });
    const t0 = Date.now();
    const st = await L.nestToReview(SECS);
    console.log(`  nest: ${st.state} "${st.status.slice(0, 220)}" wall ${(st.wallMs / 1000).toFixed(1)} s`);
    const clog = await L.js('(window.__clog||[]).filter(function(r){return /corvoExport/.test(r.fn);}).slice(-1).map(function(r){return r.ms;})');
    console.log('  corvoExport (incl. temporary renders):', clog[0], 'ms');
    const roll = await L.js('(function(){ return [document.getElementById("rollWidth").value, document.getElementById("gap").value]; })()');
    L.check(roll[0] === '580' && roll[1] === '6', `preset DTF 58 -> roll ${roll[0]} mm, gap ${roll[1]} mm`);
    const info = await L.sessionInfo();
    const applied = await L.esJson('corvo_json($.global.corvo.applied)');
    const sa = await L.applyAndWait();
    L.check(sa.state === 'idle' && !/error/.test(sa.cls), `Apply -> idle ("${sa.status.slice(0, 80)}")`);
    // ---- 3. after: re-trace every image where it is now; compare with the pre-move contour moved by the applied transform
    const after = await L.esJson(ES_INFO(true));
    const post = {}; after.forEach(x => { post[x.tag] = traceRegion(x).reg; try { fs.unlinkSync(x.path); } catch (e) {} });
    let worst = 0;
    info.host.items.forEach((tags, pi) => {
      const ap = applied[pi], c = Math.cos(ap.a * Math.PI / 180), s = Math.sin(ap.a * Math.PI / 180);
      tags.forEach(tag => {
        if (!preRegs[tag]) return;
        const moved = preRegs[tag].map(p => p.map(q => { const x = q.X / 1000, y = q.Y / 1000; return { X: Math.round((c * x - s * y + ap.tx) * 1000), Y: Math.round((s * x + c * y + ap.ty) * 1000) }; }));
        const area = L.areaP(post[tag]), d = symDiff(moved, post[tag]) / area;
        worst = Math.max(worst, d);
      });
    });
    L.check(worst < 0.03, `every image moved rigidly with its contour: re-traced silhouette vs moved pre-contour differ by <= ${(worst * 100).toFixed(2)} % of area (render resampling)`);
    const regs = info.host.items.map(tags => L.union(tags.map(t => post[t]).filter(Boolean)));
    const pc = L.pairCheck(regs, 6 * MM);
    L.check(pc.overl.length === 0, `no overlap between ${regs.length} silhouettes after Apply`);
    L.check(pc.minGap >= 6 * MM - 0.05 * MM, `DTF spacing >= 6 mm on the real silhouettes: min ${(pc.minGap / MM).toFixed(2)} mm` + (pc.near.length ? ' ' + JSON.stringify(pc.near.slice(0, 4)) : ''));
    const donut = info.panel.holes && info.panel.holes.children ? info.panel.holes.children.length : 0;
    console.log('  pieces in holes (donut):', donut, ' length', st.len, 'fill', st.fill);
    // single undo
    await L.es('app.undo(); app.redraw(); 1');
    const u = await L.esJson(ES_INFO(true)); let ue = 0;
    u.forEach(x => { const r = traceRegion(x).reg; ue = Math.max(ue, symDiff(r, preRegs[x.tag]) / L.areaP(r)); try { fs.unlinkSync(x.path); } catch (e) {} });
    L.check(ue < 0.01, `one app.undo() puts every image back (${(ue * 100).toFixed(3)} %)`);
    console.log('RESULT m8', JSON.stringify({ rows, exportMs: clog[0], len: st.len, fill: st.fill, minGap: pc.minGap / MM, moveErr: worst, holes: donut }));
  } finally {
    if (process.env.KEEP !== '1') console.log(' close', await L.closeDoc(name));
    console.log(L.fails ? `\n${L.fails}/${L.checks} FAIL` : `\nALL OK (${L.checks})`); L.close(); process.exit(L.fails ? 1 : 0);
  }
})().catch(e => { console.error('ERR', e.stack || e); process.exit(1); });
