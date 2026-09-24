// Modules 5 + 6 verification in Illustrator on the real Sticker Mule kiss-cut template, replicated N times.
// node m56.js [copies=12] [secs=10] [systems=graphtec,summa,roland,mimaki]
const fs = require('fs');
const L = require('./lib.js');
const RM = require('C:/Users/erryb/Desktop/Plugin/plugin/client/js/regmarks.js');
const FILE = 'C:/Users/erryb/Desktop/Plugin/bench/real/printcut/kiss-cut-sticker-template.ai';
const COPIES = +(process.argv[2] || 12), SECS = +(process.argv[3] || 10);
const SYSTEMS = (process.argv[4] || 'graphtec,summa,roland,mimaki').split(',');
const MM = L.MM, ROLL = 600, GAP = 3;
const OUT = require('os').tmpdir().replace(/\\/g, '/');

const ES_BUILD = `(function(){ var d=app.activeDocument, cut=d.layers.getByName('Cut line'), art=d.layers.getByName('Artwork');
  var src=[]; for (var i=0;i<cut.pageItems.length;i++) src.push(cut.pageItems[i]); for (i=0;i<art.pageItems.length;i++) src.push(art.pageItems[i]);
  var n=0; for (var c=1;c<${COPIES};c++){ var col=c%6, row=Math.floor(c/6); for (var k=0;k<src.length;k++){ var dup=src[k].duplicate(); dup.translate(col*400, -row*400); } n++; }
  return 'copies '+(n+1); })()`;

async function setMaterial() {
  await L.js(`(function(){ function set(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }
    document.getElementById('m5').open=true; set('m5Preset',''); set('m5Name','Vinile test'); set('m5Unit','m2'); set('m5Price','12.5'); set('m5Waste','0'); set('m5Currency','EUR'); set('m5Labor','0'); set('m5Weed','0'); set('m5Job','kisscut-verifica'); return 1; })()`);
}
function parseCsv(txt) {
  txt = txt.replace(/^\uFEFF/, '');
  const lines = txt.split(/\r\n/).filter((x, i, a) => i < a.length - 1 || x);
  const sep = lines[0].indexOf(';') >= 0 ? ';' : ',';
  const split = (l) => { const o = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === sep) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; };
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : v; };
  const head = split(lines[0]), vals = split(lines[1]).map(num), job = {}; head.forEach((h, i) => { job[h] = vals[i]; });
  const rh = split(lines[3]); const rows = lines.slice(4).filter(Boolean).map(l => { const v = split(l).map(num), o = {}; rh.forEach((h, i) => { o[h] = v[i]; }); return o; });
  return { sep, job, rows };
}
// export the CSV through the panel's own button; the native save dialog is stubbed to return a path (no desktop clicks)
async function exportCsv(file) {
  try { fs.unlinkSync(file); } catch (e) {}
  const r = await L.js(`(function(){ var fsx=window.cep.fs, orig=fsx.showSaveDialogEx, asked=null;
    fsx.showSaveDialogEx=function(title, dir, types, name){ asked={title:title,dir:dir,name:name}; return {err:0, data:${JSON.stringify(file)}}; };
    document.getElementById('m5Csv').click();
    return new Promise(function(res){ setTimeout(function(){ fsx.showSaveDialogEx=orig; res({asked:asked, msg:document.getElementById('m5Status').textContent}); }, 1500); }); })()`);
  return r;
}

(async () => {
  await L.connect();
  const name = await L.openDoc(FILE);
  const table = [];
  try {
    console.log('build:', await L.es(ES_BUILD));
    console.log('tagged', await L.es(L.ES_TAG));
    await setMaterial();

    // ------------------------------------------------ MODULE 5: no marks
    await L.esSelectTagged();
    await L.setup({ roll: ROLL, gap: GAP, rot: '90', time: SECS, holes: true, regmarks: 'none', seed: 7 });
    let st = await L.nestToReview(SECS);
    console.log(`M5 nest: ${st.state} "${st.status.slice(0, 160)}"`);
    let info = await L.sessionInfo();
    st = await L.applyAndWait();
    const U = await L.units(), groups = info.host.items, regs = L.pieceRegions(U, groups);
    const rm0 = await L.esJson(L.ES_REGMARKS);
    const csvFile = OUT + '/m5_report.csv';
    const ex = await exportCsv(csvFile);
    console.log('  csv export:', JSON.stringify(ex));
    L.check(fs.existsSync(csvFile), 'CSV written through the panel button (save dialog stubbed)');
    const csv = parseCsv(fs.readFileSync(csvFile, 'utf8'));
    const roll = rm0.roll.gb; // l,t,r,b
    const lenMeas = (roll[2] - roll[0]) / MM, widMeas = (roll[1] - roll[3]) / MM;
    const areaMeas = regs.reduce((s, r) => s + L.areaP(r), 0) / (MM * MM);
    let xEnd = -1e9; regs.forEach(r => { xEnd = Math.max(xEnd, L.bb(r)[2]); });
    const j = csv.job;
    console.log('  job:', JSON.stringify(j));
    L.check(j.numero_pezzi === COPIES && csv.rows.length === COPIES, `pieces: CSV ${j.numero_pezzi}, rows ${csv.rows.length}, expected ${COPIES}`);
    L.check(Math.abs(j.lunghezza_usata_mm - lenMeas) < 0.2, `length: CSV ${j.lunghezza_usata_mm} mm vs roll rectangle measured ${lenMeas.toFixed(2)} mm (pieces end at ${((xEnd - roll[0]) / MM).toFixed(2)} mm)`);
    L.check(Math.abs(j.larghezza_rotolo_mm - widMeas) < 0.2 && Math.abs(widMeas - ROLL) < 0.2, `roll width: CSV ${j.larghezza_rotolo_mm} vs measured ${widMeas.toFixed(2)} mm`);
    const aErr = Math.abs(j.area_pezzi_mm2 - areaMeas) / areaMeas;
    L.check(aErr < 0.01, `pieces area: CSV ${j.area_pezzi_mm2} mm² vs measured (union of drawn regions) ${areaMeas.toFixed(0)} mm² (${(aErr * 100).toFixed(2)} %)`);
    L.check(Math.abs(j.area_usata_mm2 - lenMeas * widMeas) / (lenMeas * widMeas) < 0.001, `used area ${j.area_usata_mm2} = length x width ${(lenMeas * widMeas).toFixed(0)}`);
    L.check(Math.abs(j.sfrido_pct + j.riempimento_pct - 100) < 0.02 && Math.abs(j.riempimento_pct - areaMeas / (lenMeas * widMeas) * 100) < 1, `fill ${j.riempimento_pct} % (measured ${(areaMeas / (lenMeas * widMeas) * 100).toFixed(2)} %), waste ${j.sfrido_pct} %`);
    L.check(Math.abs(j.costo_materiale - j.area_usata_mm2 / 1e6 * 12.5) < 0.011, `cost ${j.costo_materiale} EUR = used m² x 12.5 €/m² (${(j.area_usata_mm2 / 1e6 * 12.5).toFixed(3)})`);
    L.check(Math.abs(j.costo_per_pezzo * j.numero_pezzi - j.costo_totale) < 0.006, `cost per piece ${j.costo_per_pezzo} x ${j.numero_pezzi} = total ${j.costo_totale} (total rounded to cents)`);
    // rows: layer column + bbox of each piece vs measured
    const layersOk = csv.rows.every(r => /Cut line/.test(r.livello) && /Artwork/.test(r.livello));
    L.check(layersOk, `layer column = "${csv.rows[0].livello}" on every row`);
    const meas = regs.map(r => { const b = L.bb(r); return [(b[0] - roll[0]) / MM, (b[1] - roll[3]) / MM, (b[2] - b[0]) / MM, (b[3] - b[1]) / MM]; });
    let worst = 0; const used = new Set();
    for (const r of csv.rows) {
      let best = null, bd = 1e9;
      meas.forEach((m, k) => { if (used.has(k)) return; const d = Math.max(Math.abs(m[0] - r.x_mm), Math.abs(m[1] - r.y_mm), Math.abs(m[2] - r.larghezza_mm), Math.abs(m[3] - r.altezza_mm)); if (d < bd) { bd = d; best = k; } });
      used.add(best); worst = Math.max(worst, bd);
    }
    L.check(worst < 1.0, `every CSV row (x, y, w, h) matches a measured piece within ${worst.toFixed(3)} mm`);
    table.push({ scen: 'M5 senza crocini', len: lenMeas, csvLen: j.lunghezza_usata_mm, area: areaMeas, csvArea: j.area_pezzi_mm2, fill: j.riempimento_pct, cost: j.costo_materiale, rowsErr: worst });
    // clean the reference roll for the next sessions
    await L.es(`(function(){ try { app.activeDocument.layers.getByName('Corvo').pathItems.getByName('Corvo_Roll_rif').remove(); } catch(e){} return 1; })()`);

    // ------------------------------------------------ MODULE 6: each system
    for (const sys of SYSTEMS) {
      const spec = RM.spec(sys);
      console.log(`\n== ${sys} (${spec.label})`);
      await L.esSelectTagged();
      await L.setup({ roll: ROLL, gap: GAP, rot: '90', time: SECS, holes: true, regmarks: sys, seed: 7 });
      const snap = (UU) => { const o = {}; UU.forEach(u => { o[u.tag] = u.units.flatMap(x => x.rings.flat(2)); }); return o; };
      const maxErr = (A, B) => { let e = 0; for (const k in A) { const a = A[k], b = B[k] || []; if (a.length !== b.length) return Infinity; for (let i = 0; i < a.length; i++) e = Math.max(e, Math.abs(a[i] - b[i])); } return e; };
      const U0 = await L.units();
      st = await L.nestToReview(SECS);
      console.log(`  nest: ${st.state} "${st.status.slice(0, 260)}"`);
      const prev = await L.esJson(L.ES_REGMARKS);
      L.check(prev.rm.some(g => g.group === 'Corvo_Regmarks'), `preview marks drawn at the end of the search (${prev.rm.map(g => g.group || g.frame).join(',')})`);
      info = await L.sessionInfo();
      const csvRep = await L.js('(function(){ var r=CorvoReportPanel.report(); return r?{len:r.lengthMm,w:r.rollWidthMm,used:r.usedM2}:null; })()');
      st = await L.applyAndWait();
      L.check(st.state === 'idle' && !/error/.test(st.cls), `Apply -> idle ("${st.status.slice(0, 200)}")`);
      const after = await L.esJson(L.ES_REGMARKS), Ua = await L.units();
      const grp = after.rm.filter(g => g.marks), frame = after.rm.find(g => g.frame);
      L.check(grp.length === 1 && grp[0].group === 'Corvo_Regmarks_rif' && grp[0].layer === spec.layer, `marks confirmed once: ${grp.map(g => g.layer + '/' + g.group).join(', ')} (expected layer "${spec.layer}")`);
      const G = grp[0] || { marks: [] };
      const layers = await L.esJson(L.ES_LAYERS);
      const rl = layers.find(l => l.name === spec.layer);
      L.check(rl && rl.printable === spec.printable, `layer "${spec.layer}" printable=${rl && rl.printable} (spec ${spec.printable})`);
      // geometry vs spec, in roll coordinates (mm, x along the roll from the roll's left edge, y from its bottom edge)
      const roll = after.roll.gb, W = (roll[1] - roll[3]) / MM, Lr = (roll[2] - roll[0]) / MM;
      const toR = (p) => [(p[0] - roll[0]) / MM, (p[1] - roll[3]) / MM];
      const mk = G.marks.map(m => { const b = [toR([m.gb[0], m.gb[3]]), toR([m.gb[2], m.gb[1]])]; return { name: m.name, box: [b[0][0], b[0][1], b[1][0], b[1][1]], pts: m.pts.map(toR), fill: m.fill }; });
      const Lay = RM.layout(sys, ROLL, info.panel.best.w / MM);
      L.check(Math.abs(W - ROLL) < 0.05 && Math.abs(Lr - Lay.rollLength) < 0.1, `roll rectangle = whole roll ${W.toFixed(2)} x ${Lr.toFixed(2)} mm (layout ${Lay.rollLength.toFixed(2)}), report length ${csvRep && csvRep.len.toFixed(2)} mm`);
      L.check(csvRep && Math.abs(csvRep.len - Lr) < 0.1 && Math.abs(csvRep.w - ROLL) < 0.05, 'report uses the whole roll incl. marks margins');
      L.check(mk.length === Lay.marks.length, `${mk.length} marks (expected ${Lay.marks.length}: ${Lay.segments} segment(s), maxSpan ${spec.maxSpan} mm)`);
      L.check(mk.every(m => Array.isArray(m.fill) && (m.fill.length === 4 ? m.fill[3] === 100 && m.fill[0] + m.fill[1] + m.fill[2] === 0 : m.fill.every(v => v === 0))), `marks filled solid black K100 (${JSON.stringify(mk[0] && mk[0].fill)})`);
      // per-shape geometry
      const corners = mk.filter(m => spec.shape !== 'L' || m.pts.length === 6);
      const sizes = mk.map(m => [m.box[2] - m.box[0], m.box[3] - m.box[1]]);
      let geomOk = true, geomTxt = '';
      if (spec.shape === 'L') {
        const expExt = spec.size + spec.line / 2;
        const cornerMs = mk.filter(m => m.pts.length === 6);
        cornerMs.forEach(m => { const w = m.box[2] - m.box[0], h = m.box[3] - m.box[1]; if (Math.abs(w - expExt) > 0.01 || Math.abs(h - expExt) > 0.01) geomOk = false; });
        // line thickness: the inner-corner vertex vs the outer-corner vertex of the L polygon
        const th = cornerMs.map(m => { const xs = m.pts.map(p => p[0]).sort((a, b) => a - b), ys = m.pts.map(p => p[1]).sort((a, b) => a - b); const ux = [...new Set(xs.map(v => v.toFixed(3)))].map(Number), uy = [...new Set(ys.map(v => v.toFixed(3)))].map(Number); return Math.min(ux[1] - ux[0], ux[ux.length - 1] - ux[ux.length - 2], uy[1] - uy[0], uy[uy.length - 1] - uy[uy.length - 2]); });
        if (th.some(t => Math.abs(t - spec.line) > 0.01)) geomOk = false;
        geomTxt = `L arms ${cornerMs.length ? (cornerMs[0].box[2] - cornerMs[0].box[0]).toFixed(3) : '?'} mm (spec ${spec.size} + line/2), line ${th.length ? th[0].toFixed(3) : '?'} mm (spec ${spec.line}), ${cornerMs.length} corners + ${mk.length - cornerMs.length} crosses`;
      } else if (spec.shape === 'square') {
        sizes.forEach(s => { if (Math.abs(s[0] - spec.size) > 0.01 || Math.abs(s[1] - spec.size) > 0.01) geomOk = false; });
        geomTxt = `squares ${sizes[0][0].toFixed(3)} x ${sizes[0][1].toFixed(3)} mm (spec ${spec.size})`;
      } else {
        sizes.forEach(s => { if (Math.abs(s[0] - spec.size) > 0.01 || Math.abs(s[1] - spec.size) > 0.01) geomOk = false; });
        geomTxt = `circles Ø ${sizes[0][0].toFixed(3)} mm (spec ${spec.size}, range ${spec.sizeRange})`;
      }
      L.check(geomOk, 'mark geometry: ' + geomTxt);
      // edge / lead / trail / spans
      const bottom = mk.filter(m => m.box[1] < W / 2), top = mk.filter(m => m.box[1] >= W / 2);
      const edgeB = Math.min(...bottom.map(m => m.box[1])), edgeT = Math.min(...top.map(m => W - m.box[3]));
      const lead = Math.min(...mk.map(m => m.box[0])), trail = Lr - Math.max(...mk.map(m => m.box[2]));
      const cxs = [...new Set(bottom.map(m => ((m.box[0] + m.box[2]) / 2).toFixed(2)))].map(Number).sort((a, b) => a - b);
      L.check(Math.abs(edgeB - spec.edge) < 0.01 && Math.abs(edgeT - spec.edge) < 0.01, `side edge -> mark ${edgeB.toFixed(3)} / ${edgeT.toFixed(3)} mm (spec ${spec.edge})`);
      L.check(lead >= spec.lead - 0.01 && trail >= spec.trail - 0.01, `lead ${lead.toFixed(3)} mm (>= ${spec.lead}), trail ${trail.toFixed(3)} mm (>= ${spec.trail})`);
      L.check(bottom.length === top.length && bottom.length >= 2, `${bottom.length} marks per side`);
      // keep-out: no piece (drawn regions) within `clear` of a mark, and pieces inside the mark frame
      const regs2 = L.pieceRegions(Ua, info.host.items);
      let minD = 1e9, inv = [];
      for (const m of G.marks) {
        const b = m.gb, ko = spec.clear * MM;
        const box = [[{ X: Math.round((b[0] - ko) * 1000), Y: Math.round((b[3] - ko) * 1000) }, { X: Math.round((b[2] + ko) * 1000), Y: Math.round((b[3] - ko) * 1000) }, { X: Math.round((b[2] + ko) * 1000), Y: Math.round((b[1] + ko) * 1000) }, { X: Math.round((b[0] - ko) * 1000), Y: Math.round((b[1] + ko) * 1000) }]];
        regs2.forEach((r, k) => { const a = L.areaP(L.inter(r, box)); if (a > 0.001) inv.push(m.name + '/piece' + k + ':' + a.toFixed(2)); });
        const markReg = [[{ X: Math.round(b[0] * 1000), Y: Math.round(b[3] * 1000) }, { X: Math.round(b[2] * 1000), Y: Math.round(b[3] * 1000) }, { X: Math.round(b[2] * 1000), Y: Math.round(b[1] * 1000) }, { X: Math.round(b[0] * 1000), Y: Math.round(b[1] * 1000) }]];
        regs2.forEach(r => { const bbr = L.bb(r); if (bbr[0] - b[2] > 60 * MM || b[0] - bbr[2] > 60 * MM) return; minD = Math.min(minD, L.minDist(markReg, r, 80 * MM)); });
      }
      L.check(inv.length === 0, `no piece in the keep-out zones (clear ${spec.clear} mm); closest piece ${(minD / MM).toFixed(2)} mm from a mark box` + (inv.length ? ' ' + inv.slice(0, 4).join(' ') : ''));
      if (spec.guideOnly) L.check(!!frame && /_rif$/.test(frame.frame), `FineCut area rectangle present (${frame && frame.frame})`);
      // single undo: layout + roll + marks gone
      const lastUndo = await L.es('corvo_json($.global.corvoLastUndo||null)');
      await L.es('app.undo(); app.redraw(); 1');
      const Uu = await L.units(), ru = await L.esJson(L.ES_REGMARKS);
      console.log('  singleUndo diag:', lastUndo);
      const eu = maxErr(snap(U0), snap(Uu));
      L.check(eu < 0.01 && !ru.roll && ru.rm.length === 0, `ONE app.undo(): pieces back (max ${eu.toExponential(2)} pt), roll ${ru.roll ? 'still there' : 'gone'}, marks ${ru.rm.length ? 'STILL THERE ' + ru.rm.map(g => g.group || g.frame).join(',') : 'gone'}`);
      await L.es('app.redo(); app.redraw(); 1');
      const rr = await L.esJson(L.ES_REGMARKS), Ur = await L.units();
      L.check(rr.rm.filter(g => g.marks).length === 1 && rr.rm.find(g => g.marks).group === 'Corvo_Regmarks_rif' && maxErr(snap(Ua), snap(Ur)) < 0.01, `app.redo(): layout + marks "_rif" back`);
      // revert: new session with marks, Cancel -> marks of the preview removed, confirmed ones untouched
      await L.esSelectTagged();
      await L.setup({ roll: ROLL, gap: GAP, rot: '90', time: 4, holes: true, regmarks: sys, seed: 5 });
      const Ub = await L.units();
      st = await L.nestToReview(4);
      const pv = await L.esJson(L.ES_REGMARKS);
      st = await L.cancelAndWait();
      const rv = await L.esJson(L.ES_REGMARKS), Uc = await L.units();
      const ec = maxErr(snap(Ub), snap(Uc));
      L.check(pv.rm.some(g => g.group === 'Corvo_Regmarks') && !rv.rm.some(g => g.group === 'Corvo_Regmarks') && rv.rm.some(g => g.group === 'Corvo_Regmarks_rif'), `Cancel removes the preview marks (had ${pv.rm.map(g => g.group || g.frame).join(',')}; now ${rv.rm.map(g => g.group || g.frame).join(',')})`);
      L.check(ec < 0.01, `Cancel restores the pieces (max ${ec.toExponential(2)} pt)`);
      table.push({ scen: 'M6 ' + sys, len: Lr, marks: mk.length, geom: geomTxt, edge: edgeB, lead, trail, clearMin: minD / MM, undo: eu });
      // clean up confirmed marks + roll for the next system
      await L.es(`(function(){ var d=app.activeDocument; for (var i=d.layers.length-1;i>=0;i--){ var l=d.layers[i]; if (l.name==='Corvo'||l.name==='Regmarks'||l.name==='Regmarks FineCut (guida)') l.remove(); } return 1; })()`);
    }
    console.log('\nTABLE', JSON.stringify(table, null, 1));
  } finally {
    if (process.env.KEEP !== '1') console.log(' close', await L.closeDoc(name));
    console.log(L.fails ? `\n${L.fails}/${L.checks} FAIL` : `\nALL OK (${L.checks})`); L.close(); process.exit(L.fails ? 1 : 0);
  }
})().catch(e => { console.error('ERR', e.stack || e); process.exit(1); });
