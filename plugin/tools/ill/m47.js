// Modules 4 + 7 verification in Illustrator (never touches the desktop: CDP to the panel only)
//   4: bench/real/color flags + colourful alphabet, "Nest by: Fill colour": one roll per colour (Corvo_Containers),
//      every piece inside the roll of ITS colour, labels "Corvo — colour — L mm", report per colour + TOTAL,
//      Apply -> Corvo_Containers_rif, ONE app.undo(), Cancel.
//   7: bench/real/laser ClosedBox / DividerTray / AgricolaInsert on 600x400 and 1220x2440 sheets: sheets drawn in a row,
//      every piece inside ONE sheet within the margin, no overlaps / gap, grain lock (0/180 only).
// node m47.js [secs=12] [only=color|laser]
const L = require('./lib.js');
const REAL = 'C:/Users/erryb/Desktop/Plugin/bench/real/';
const SECS = +(process.argv[2] || 12);
const ONLY = process.argv[3] || '';
const MM = L.MM, GAP = 2;
const results = [];

// move the children of top-level groups to the layer (the user selects the single letters / stripes)
const ES_UNGROUP = `(function(){ var d=app.activeDocument, n=0; for (var i=0;i<d.layers.length;i++){ var ly=d.layers[i];
  for (var g=ly.groupItems.length-1; g>=0; g--){ var gi=ly.groupItems[g]; if (gi.parent!==ly || gi.clipped) continue; while (gi.pageItems.length){ gi.pageItems[0].move(ly, ElementPlacement.PLACEATEND); n++; } try{ gi.remove(); }catch(e){} } }
  return n; })()`;
// dominant fill colour (hex) of every tagged item (area of the largest filled path)
const ES_COLORS = `(function(){ var d=app.activeDocument, o={};
  function hex(c){ if (!c) return null; var t=c.typename; function h2(v){ var s=Math.round(v).toString(16); return s.length<2?'0'+s:s; }
    if (t==='RGBColor') return '#'+h2(c.red)+h2(c.green)+h2(c.blue);
    if (t==='SpotColor') return 'spot:'+c.spot.name; if (t==='CMYKColor') return 'cmyk:'+Math.round(c.cyan)+','+Math.round(c.magenta)+','+Math.round(c.yellow)+','+Math.round(c.black); if (t==='GrayColor') return 'gray:'+Math.round(c.gray); return t; }
  function walk(it, acc){ var t=it.typename; if (t==='PathItem'){ if (it.filled && !it.guides && !it.hidden){ var k=hex(it.fillColor); acc[k]=(acc[k]||0)+Math.abs(it.area); } return; }
    if (t==='CompoundPathItem'){ if (it.pathItems.length && it.pathItems[0].filled){ var k2=hex(it.pathItems[0].fillColor), a=0; for (var q=0;q<it.pathItems.length;q++) a+=it.pathItems[q].area; acc[k2]=(acc[k2]||0)+Math.abs(a); } return; }
    if (t==='GroupItem'){ for (var i=0;i<it.pageItems.length;i++) walk(it.pageItems[i], acc); } }
  for (var i=0;i<d.pageItems.length;i++){ var it=d.pageItems[i]; var n=''; try{n=it.note;}catch(e){} if (!/^cv:/.test(n)) continue;
    var acc={}; walk(it, acc); var best=null, ba=-1; for (var k in acc) if (acc[k]>ba){ ba=acc[k]; best=k; } o[n]=best; }
  return corvo_json(o); })()`;
const ES_CONTAINERS = `(function(){ var d=app.activeDocument, prev=app.coordinateSystem; app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM; var o=[];
  try { var ly=d.layers.getByName('Corvo');
    for (var g=0; g<ly.groupItems.length; g++){ var gi=ly.groupItems[g]; if (!/^Corvo_Containers/.test(gi.name)) continue;
      var rects=[], labels=[]; for (var i=0;i<gi.pathItems.length;i++){ var b=gi.pathItems[i].geometricBounds; rects.push([b[0],b[1],b[2],b[3]]); }
      for (var j=0;j<gi.textFrames.length;j++) labels.push(gi.textFrames[j].contents);
      o.push({name:gi.name, rects:rects, labels:labels}); } } catch(e){}
  var roll=false; try { var l2=d.layers.getByName('Corvo'); for (var r=0;r<l2.pathItems.length;r++) if (/^Corvo_Roll/.test(l2.pathItems[r].name)) roll=true; } catch(e){}
  app.coordinateSystem=prev; return corvo_json({groups:o, roll:roll}); })()`;

function ringsOf(u) { return u.units.flatMap(x => x.rings); }
function regionOf(rings) { return L.union(rings.map(r => L.unitRegion([r]))); }
function xform(rings, a) { const c = Math.round(Math.cos(a * Math.PI / 180)), s = Math.round(Math.sin(a * Math.PI / 180)); return rings.map(r => r.map(([x, y]) => [x * c - y * s, x * s + y * c])); }
function bbc(rings) { let l = 1e30, b = 1e30, r = -1e30, t = -1e30; for (const q of rings) for (const [x, y] of q) { l = Math.min(l, x); r = Math.max(r, x); b = Math.min(b, y); t = Math.max(t, y); } return [(l + r) / 2, (b + t) / 2]; }
function fitRot(orig, inst, angles) {
  const RI = regionOf(inst), ai = L.areaP(RI), ci = bbc(inst); let best = 1e9;
  for (const a of angles) { const T = xform(orig, a), ct = bbc(T); const R = regionOf(T.map(r => r.map(([x, y]) => [x + ci[0] - ct[0], y + ci[1] - ct[1]])));
    best = Math.min(best, (L.areaP(L.diff(R, RI)) + L.areaP(L.diff(RI, R))) / Math.max(ai, 1e-9)); }
  return best;
}
// rects: [l, t, r, b] in doc coords (y up)
const inside = (bb, r, inset) => bb[0] >= r[0] + inset - 0.1 && bb[2] <= r[2] - inset + 0.1 && bb[1] >= r[3] + inset - 0.1 && bb[3] <= r[1] - inset + 0.1;

async function run(o) {
  if (ONLY && ONLY !== 'color' && ONLY !== 'laser' && !new RegExp(ONLY, 'i').test(o.label)) return;
  console.log(`\n== ${o.label}`);
  const name = await L.openDoc(REAL + o.file);
  const row = { label: o.label };
  try {
    if (o.ungroup) console.log(' ungrouped', await L.es(ES_UNGROUP));
    console.log(' tagged', await L.es(L.ES_TAG));
    const U0 = await L.units();
    const colors = o.mode === 'color' ? await L.esJson(ES_COLORS) : null;
    await L.esSelectTagged();
    await L.setup({ roll: o.roll || 600, gap: GAP, rot: '90', time: SECS, holes: true, seed: 7 });
    await L.js(`(function(){ function set(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); }
      set('groupBy','${o.mode === 'color' ? 'color' : 'none'}'); set('container','${o.mode === 'sheets' ? 'sheets' : 'roll'}');
      ${o.mode === 'sheets' ? `set('sheetPreset','${o.sheet}'); set('sheetMargin','10'); var g=document.getElementById('grain'); g.checked=${!!o.grain}; g.dispatchEvent(new Event('change'));` : ''}
      return 1; })()`);
    if (o.dropText) {   // annotation text OUTSIDE some parts (boxes.py notes): clear error first, then the user deletes it
      await L.click('btnNest'); await L.sleep(800);
      const se = await L.waitState(s => s.state === 'idle' || s.state === 'review', 600000, 500);
      L.check(se.state === 'idle' && /error/.test(se.cls) && o.dropText.every(n => se.status.includes(n)), `${o.label}: text outside the parts -> clear error naming ${o.dropText.join(', ')} ("${se.status.slice(0, 110)}")`);
      console.log(' removed annotation text frames:', await L.es(`(function(){ var d=app.activeDocument, n=0, N=${JSON.stringify(o.dropText)};
        for (var i=0;i<N.length;i++){ var g=d.groupItems.getByName(N[i]); for (var k=g.textFrames.length-1;k>=0;k--){ g.textFrames[k].remove(); n++; } } return n; })()`));
      await L.esSelectTagged();
    }
    const t0 = Date.now();
    await L.click('btnNest');
    await L.sleep(800);
    const st = await L.waitState(s => s.state === 'review' || s.state === 'idle', (SECS * 4 + 900) * 1000, 700);
    row.wallS = +((Date.now() - t0) / 1000).toFixed(1);
    console.log(` nest: ${st.state} ${row.wallS} s "${st.status.slice(0, 260)}"`);
    if (!L.check(st.state === 'review', `${o.label}: search ended in review`)) return;
    const info = await L.sessionInfo();
    const mn = await L.js(`(function(){ var M=CorvoPanel.state().mn; if(!M) return null; return { results: M.results.map(function(r){ return { label:r.label, len:r.lengthPt, n:r.units.length, fill:r.sheetFill }; }), sheetsN:M.sheetsN, lb:M.lowerBound }; })()`);
    const rep = await L.js(`(function(){ var r=window.CorvoReportPanel && CorvoReportPanel.report(); if(!r) return null; return { multi: r.multi ? r.multi.length : 0, keys: Object.keys(r).slice(0,20), total: r.total ? { lengthM: r.total.lengthM, cost: r.total.cost } : null, out: document.getElementById('m5Out').textContent.slice(0, 400) }; })()`);
    const cont = await L.esJson(ES_CONTAINERS);
    const cg = cont.groups.find(g => g.name === 'Corvo_Containers');
    console.log(' results', JSON.stringify(mn && mn.results), '\n report', JSON.stringify(rep));
    L.check(cg && mn && cg.rects.length === mn.results.length && cg.labels.length === mn.results.length && !cont.roll,
      `${o.label}: ${cg ? cg.rects.length : 0} containers + ${cg ? cg.labels.length : 0} labels drawn = ${mn ? mn.results.length : '?'} jobs, no single roll`);
    console.log(' labels', JSON.stringify(cg && cg.labels));
    // Apply, then geometry on the real items
    const stA = await L.applyAndWait();
    L.check(stA.state === 'idle' && !/error/.test(stA.cls), `${o.label}: Apply -> idle ("${stA.status.slice(0, 80)}")`);
    const U1 = await L.units(); const byTag = {}; U1.forEach(u => { byTag[u.tag] = u; });
    const cont1 = await L.esJson(ES_CONTAINERS);
    const rif = cont1.groups.find(g => g.name === 'Corvo_Containers_rif');
    L.check(!!rif && rif.rects.length === cg.rects.length && !cont1.groups.find(g => g.name === 'Corvo_Containers'), `${o.label}: after Apply containers kept as Corvo_Containers_rif (${rif ? rif.rects.length : 0})`);
    const rects = rif ? rif.rects : cg.rects;
    const groups = info.host.items.filter(g => g.length && byTag[g[0]]);
    // even-odd over ALL the rings of a piece: holes stay holes (a child placed in a hole is not an overlap)
    const regs = groups.map(g => L.unitRegion(g.flatMap(t => ringsOf(byTag[t]))));
    const inset = o.mode === 'sheets' ? 10 * MM : 0;
    const where = regs.map(r => { const b = L.bb(r); return rects.map((R, k) => inside(b, R, inset) ? k : -1).filter(k => k >= 0); });
    const bad = where.map((w, i) => w.length === 1 ? null : `${groups[i][0]}:${JSON.stringify(w)}`).filter(Boolean);
    L.check(!bad.length, `${o.label}: each of ${regs.length} pieces inside exactly one container${inset ? ' within the 10 mm margin' : ''}` + (bad.length ? ' ' + bad.slice(0, 5).join(' ') : ''));
    if (o.mode === 'color') {
      const byCont = {}; where.forEach((w, i) => { if (w.length === 1) { const k = w[0]; (byCont[k] = byCont[k] || new Set()).add(colors[groups[i][0]]); } });
      const mixed = Object.keys(byCont).filter(k => byCont[k].size > 1).map(k => `${k}:${[...byCont[k]].join('/')}`);
      const distinct = new Set(groups.map(g => colors[g[0]]));
      L.check(!mixed.length, `${o.label}: every roll holds ONE colour` + (mixed.length ? ' ' + mixed.join(' ; ') : ''));
      L.check(rects.length === distinct.size, `${o.label}: one roll per colour (${rects.length} rolls, ${distinct.size} colours: ${[...distinct].join(' ')})`);
      L.check(rep && rep.multi === rects.length, `${o.label}: report with one line per colour (${rep && rep.multi}) + TOTAL`);
      row.rolls = rects.length; row.colors = [...distinct].length;
      row.lengths = mn.results.map(r => `${r.label} ${(r.len / MM).toFixed(0)}`).join(' · ');
    } else {
      L.check(rects.length === mn.sheetsN, `${o.label}: ${rects.length} sheets drawn (lower bound ${mn.lb})`);
      // sheets in a row: same size, left to right
      const sz = rects.map(r => [(r[2] - r[0]) / MM, (r[1] - r[3]) / MM]);
      const [sw, sh] = o.sheet.split('x').map(Number);
      L.check(sz.every(s => Math.abs(Math.max(...s) - Math.max(sw, sh)) < 0.5 && Math.abs(Math.min(...s) - Math.min(sw, sh)) < 0.5), `${o.label}: sheet size ${sz.map(s => s.map(v => v.toFixed(0)).join('x')).join(', ')} mm`);
      row.sheets = rects.length; row.lb = mn.lb; row.fills = mn.results.map(r => (r.fill * 100).toFixed(0) + '%').join('/');
      if (o.grain) {
        const orig = {}; U0.forEach(u => { orig[u.tag] = u; });
        let worst = 0, worstT = '';
        for (const g of groups) { const rO = g.flatMap(t => ringsOf(orig[t])), rI = g.flatMap(t => ringsOf(byTag[t])); const f = fitRot(rO, rI, [0, 180]); if (f > worst) { worst = f; worstT = g[0]; } }
        L.check(worst < 2e-3, `${o.label}: grain lock, every piece at 0/180 deg (worst sym. diff ${(worst * 100).toFixed(4)} % ${worstT})`);
      }
    }
    const pc = L.pairCheck(regs, GAP * MM);
    L.check(pc.overl.length === 0, `${o.label}: no overlaps between ${regs.length} pieces` + (pc.overl.length ? ' ' + JSON.stringify(pc.overl.slice(0, 4)) : ''));
    L.check(pc.near.length === 0, `${o.label}: gap ${GAP} mm respected (min ${(pc.minGap / MM).toFixed(2)} mm)` + (pc.near.length ? ' ' + JSON.stringify(pc.near.slice(0, 4)) : ''));
    if (o.undo) {
      const snap = (U) => { const r = {}; U.forEach(u => { r[u.tag] = ringsOf(u).flat(2); }); return r; };
      const maxErr = (A, B) => { let e = 0; for (const k in A) { const a = A[k], b = B[k] || []; if (a.length !== b.length) return Infinity; for (let i = 0; i < a.length; i++) e = Math.max(e, Math.abs(a[i] - b[i])); } return e; };
      await L.es('app.undo(); app.redraw(); 1');
      const Uu = await L.units(); const eu = maxErr(snap(U0), snap(Uu)); const cu = await L.esJson(ES_CONTAINERS);
      console.log(' corvoLastUndo', await L.es('$.global.corvoLastUndo ? corvo_json($.global.corvoLastUndo) : "none"'));
      L.check(eu < 0.01 && !cu.groups.length, `${o.label}: ONE app.undo() restores all pieces (max ${eu.toExponential(2)} pt) and removes the containers (${cu.groups.map(g => g.name).join(',') || 'none'})`);
      await L.es('app.redo(); app.redraw(); 1');
      const cr = await L.esJson(ES_CONTAINERS);
      L.check(cr.groups.some(g => g.name === 'Corvo_Containers_rif'), `${o.label}: app.redo() brings back layout + Corvo_Containers_rif`);
      await L.es('app.undo(); app.redraw(); 1');
      // Cancel during the sequence
      await L.esSelectTagged();
      await L.click('btnNest');
      await L.waitState(s => s.state === 'running' || s.state === 'review', 600000, 300); await L.sleep(1500);
      const stC = await L.cancelAndWait();
      const Uc = await L.units(); const ec = maxErr(snap(U0), snap(Uc)); const cc = await L.esJson(ES_CONTAINERS);
      L.check(stC.state === 'idle' && ec < 0.01 && !cc.groups.length, `${o.label}: Cancel during the sequence restores the pieces (max ${ec.toExponential(2)} pt) and removes the containers`);
    }
    results.push(row);
    console.log('RESULT m47', JSON.stringify(row));
  } catch (e) { L.check(false, `${o.label}: exception ${e.message}`); console.log(e.stack);
  } finally {
    if (process.env.KEEP !== '1') console.log(' close', await L.closeDoc(name));
  }
}

(async () => {
  await L.connect();
  await L.js(`(function(){ var b=document.querySelectorAll('#m3Body input[type=number]'); for (var i=0;i<b.length;i++){ b[i].value=1; b[i].dispatchEvent(new Event('change')); } var m=document.querySelectorAll('#m3Body input[type=checkbox]'); for (i=0;i<m.length;i++) if (m[i].checked){ m[i].checked=false; m[i].dispatchEvent(new Event('change')); } return 1; })()`);
  try {
    if (ONLY !== 'laser') {  // ONLY = 'color' | 'laser' | regex on the label
      await run({ label: 'flag_italy per colore', file: 'color/flag_italy.svg', mode: 'color', roll: 1000, undo: true });
      await run({ label: 'flag_south_africa per colore', file: 'color/flag_south_africa.svg', mode: 'color', roll: 1000, ungroup: true });
      await run({ label: 'alfabeto colorato per colore', file: 'color/openclipart_alphabet_bojarkski_colorful.svg', mode: 'color', roll: 600, ungroup: true });
    }
    if (ONLY !== 'color') {
      for (const f of ['ClosedBox', 'DividerTray', 'AgricolaInsert']) for (const sheet of ['600x400', '1220x2440'])
        await run({ label: `${f} fogli ${sheet}`, file: `laser/${f}.svg`, mode: 'sheets', sheet, undo: f === 'ClosedBox' && sheet === '600x400', dropText: f === 'AgricolaInsert' ? ['p-8', 'p-7'] : null });
      await run({ label: 'DividerTray fogli 600x400 venatura', file: 'laser/DividerTray.svg', mode: 'sheets', sheet: '600x400', grain: true });
    }
  } finally {
    // back to "All together" + Roll, also in the settings the panel restores on reload (saved at every Nest)
    await L.js(`(function(){ function set(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('change')); } set('groupBy','none'); set('container','roll'); var g=document.getElementById('grain'); g.checked=false; g.dispatchEvent(new Event('change'));
      try { var o=JSON.parse(localStorage.getItem('corvo.mn.opts')||'{}'); o.container='roll'; o.group='none'; o.grain=false; localStorage.setItem('corvo.mn.opts', JSON.stringify(o)); } catch(e){} return 1; })()`);
    console.log('\nSUMMARY', JSON.stringify(results, null, 1));
    console.log(L.fails ? `\n${L.fails}/${L.checks} FAIL` : `\nALL OK (${L.checks})`); L.close(); process.exit(L.fails ? 1 : 0);
  }
})().catch(e => { console.error('ERR', e.stack || e); process.exit(1); });
