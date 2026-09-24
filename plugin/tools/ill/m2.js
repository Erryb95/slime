// Module 2 verification in Illustrator: Bebas channel letters + small pieces + rings/washers, holes ON/OFF
// node m2.js [secs=20]
const L = require('./lib.js');
const REAL = 'C:/Users/erryb/Desktop/Plugin/bench/real/holes/';
const SECS = +(process.argv[2] || 20);
const GAP_MM = 3, MM = L.MM;

const ES_BUILD = `(function(){ var MM=72/25.4, d=app.activeDocument, ly=d.layers[0];
  function spot(name, c,m,y,k){ var s; try { s=d.spots.getByName(name); } catch(e){ s=d.spots.add(); s.name=name; var col=new CMYKColor(); col.cyan=c; col.magenta=m; col.yellow=y; col.black=k; s.color=col; s.colorType=ColorModel.SPOT; }
    var sc=new SpotColor(); sc.spot=s; sc.tint=100; return sc; }
  var red=spot('Rosso Vinile',0,100,100,0), cut=spot('CutContour',0,100,0,0);
  // ungroup the letters
  var g=ly.groupItems[0], n=0; while (g.pageItems.length){ g.pageItems[0].move(ly, ElementPlacement.PLACEATEND); n++; } try{ g.remove(); }catch(e){}
  function paintAll(it, f){ if (it.typename==='PathItem'){ f(it); } else if (it.typename==='CompoundPathItem'){ for (var i=0;i<it.pathItems.length;i++) f(it.pathItems[i]); } else if (it.typename==='GroupItem'){ for (var j=0;j<it.pageItems.length;j++) paintAll(it.pageItems[j], f); } }
  for (var i=0;i<ly.pageItems.length;i++) paintAll(ly.pageItems[i], function(p){ p.filled=true; p.fillColor=red; p.stroked=false; });
  var names=['O','A','R','B','D','Q','8','9','0'];
  for (i=0;i<ly.pageItems.length && i<names.length;i++) ly.pageItems[i].name='L_'+names[i];
  // small pieces to the right of the artboard, on a grid (no overlaps)
  var x0=3800, y=700, col=0, k=0;
  function place(it, w){ it.name=it.name||('s'+k); k++; }
  function circ(dmm){ var r=dmm*MM, c=ly.pathItems.ellipse(y - col*0, x0 + col, r, r); return c; }
  var specs=[['c',15],['c',15],['c',20],['c',20],['c',25],['c',25],['c',30],['c',30],['c',40],['s',20],['s',20],['s',30],['w',35,15],['w',35,15],['w',50,25],['c',12],['c',12],['c',18]];
  var cx=x0, cy=700, rowH=0;
  for (var q=0;q<specs.length;q++){ var sp=specs[q], D=sp[1]*MM, it;
    if (cx + D > x0 + 900){ cx=x0; cy-=rowH+30; rowH=0; }
    if (sp[0]==='c'){ it=ly.pathItems.ellipse(cy, cx, D, D); it.name='circle'+sp[1]+'_'+q; }
    else if (sp[0]==='s'){ it=ly.pathItems.rectangle(cy, cx, D, D); it.name='square'+sp[1]+'_'+q; }
    else { it=ly.compoundPathItems.add(); var o=it.pathItems.ellipse(cy, cx, D, D); var h=sp[2]*MM; var hh=it.pathItems.ellipse(cy-(D-h)/2, cx+(D-h)/2, h, h); hh.polarity=PolarityValues.NEGATIVE; it.name='washer'+sp[1]+'_'+q;
      for (var z=0;z<it.pathItems.length;z++){ var pz=it.pathItems[z]; pz.filled=false; pz.stroked=true; pz.strokeColor=cut; pz.strokeWidth=0.25; } }
    if (sp[0]!=='w'){ it.filled=false; it.stroked=true; it.strokeColor=cut; it.strokeWidth=0.25; }
    cx+=D+30; if (D>rowH) rowH=D; }
  return 'letters '+n+', small '+specs.length; })()`;

(async () => {
  await L.connect();
  const name = await L.openDoc(REAL + 'BebasNeue_channel_letters_OARBDQ890.svg');
  const extra = [];
  const row = { file: 'Bebas OARBDQ890 + 18 piccoli + anello Roundel + mdi record' };
  try {
    console.log('build:', await L.es(ES_BUILD));
    // bring the Roundel ring (200 mm) and the mdi record-circle (ring + disc, 60 mm) from their real files
    for (const [f, mm, nm] of [['Roundel_argent_ring_wikimedia.svg', 200, 'Roundel'], ['mdi_record-circle-outline.svg', 60, 'mdiRecord']]) {
      const src = await L.openDoc(REAL + f); extra.push(src);
      console.log(' copy', f, await L.es(`(function(){ var s=app.documents.getByName(${JSON.stringify(src)}), t=app.documents.getByName(${JSON.stringify(name)});
        var it=null; for (var i=0;i<s.pageItems.length;i++){ var p=s.pageItems[i]; if (p.parent===p.layer && p.typename==='CompoundPathItem'){ it=p; break; } }
        var dup=it.duplicate(t.layers[0], ElementPlacement.PLACEATEND); t.activate();
        var b=dup.geometricBounds, w=b[2]-b[0], sc=${mm}*72/25.4/w*100; dup.resize(sc,sc); dup.name='${nm}';
        var b2=dup.geometricBounds; dup.translate(${nm === 'Roundel' ? 3800 : 4400}-b2[0], ${nm === 'Roundel' ? -50 : -100}-b2[1]); return dup.pathItems.length; })()`));
      await L.closeDoc(src);
    }
    console.log(' tagged', await L.es(L.ES_TAG));
    const U0 = await L.units();
    console.log(' items', U0.length, U0.map(u => u.name).join(' '));

    const runs = {};
    for (const holes of [false, true]) {
      await L.esSelectTagged();
      await L.setup({ roll: 600, gap: GAP_MM, rot: '90', time: SECS, holes, seed: 7 });
      const st = await L.nestToReview(SECS);
      const info = await L.sessionInfo();
      console.log(` holes=${holes}: ${st.state} "${st.status.slice(0, 200)}" len ${st.len} fill ${st.fill} wall ${(st.wallMs / 1000).toFixed(1)} s`);
      runs[holes] = { st, info, lenMm: info.panel.best.w / MM };
      if (!holes) { await L.cancelAndWait(); continue; }
      const nChild = info.panel.holes ? info.panel.holes.children.length : 0;
      console.log('  holes plan keys:', info.panel.holes && Object.keys(info.panel.holes).join(','), 'stats', JSON.stringify(info.panel.holes && info.panel.holes.stats || info.panel.holes && info.panel.holes.ms));
      // Apply
      const stA = await L.applyAndWait();
      L.check(stA.state === 'idle' && !/error/.test(stA.cls), `Apply -> idle ("${stA.status.slice(0, 80)}")`);
      const U1 = await L.units();
      const groups = info.host.items;               // piece -> member tags
      const regs = L.pieceRegions(U1, groups);
      const gapPt = GAP_MM * MM;
      const pc = L.pairCheck(regs, gapPt);
      L.check(pc.overl.length === 0, `no overlaps between ${regs.length} pieces (even-odd regions)` + (pc.overl.length ? ' ' + JSON.stringify(pc.overl.slice(0, 5)) : ''));
      L.check(pc.near.length === 0, `gap ${GAP_MM} mm respected everywhere: min ${(pc.minGap / MM).toFixed(2)} mm` + (pc.near.length ? ' ' + JSON.stringify(pc.near.slice(0, 5)) : ''));
      // children inside a hole of their parent
      const byId = {}; info.panel.pieces.forEach(p => { byId[p.id] = p; });
      let inHole = 0, minChildGap = 1e9; const bad = [];
      for (const c of info.panel.holes.children) {
        const ci = c.hostI, pi = byId[c.parent].hostI;
        const cr = regs[ci], pr = regs[pi], outer = L.outerOnly(pr);
        const ca = L.areaP(cr), inside = L.areaP(L.inter(cr, outer));
        const d = L.minDist(pr, cr, gapPt + 2);
        minChildGap = Math.min(minChildGap, d);
        if (inside > ca - 0.05 && d >= gapPt - 0.05 * MM) inHole++; else bad.push(`${groups[ci]}/${byId[c.parent].name}: in ${(inside / ca * 100).toFixed(1)}% d ${(d / MM).toFixed(3)} mm`);
      }
      L.check(nChild > 0 && inHole === nChild, `${inHole}/${nChild} children entirely inside a hole of their parent, clearance >= ${GAP_MM} mm - 0.05 (min ${(minChildGap / MM).toFixed(3)} mm)` + (bad.length ? ' ' + bad.join('; ') : ''));
      const parents = {}; info.panel.holes.children.forEach(c => { parents[byId[c.parent].name] = (parents[byId[c.parent].name] || 0) + 1; });
      console.log('  children per parent:', JSON.stringify(parents));
      // spot colours / paint unchanged, every item on its layer
      const paint = (U) => { const o = {}; U.forEach(u => { o[u.tag] = u.layer + '|' + u.units.map(x => x.fill + '/' + x.stroke).join(','); }); return o; };
      const p0 = paint(U0), p1 = paint(U1); const diffP = Object.keys(p0).filter(k => p0[k] !== p1[k]);
      L.check(diffP.length === 0, `paint (spot fills/strokes) and layer unchanged on all ${U0.length} items` + (diffP.length ? ' ' + diffP.slice(0, 3).map(k => p0[k] + ' -> ' + p1[k]).join(' ; ') : ''));
      const mdi = U1.find(u => u.name === 'mdiRecord');
      const mdiPiece = groups.findIndex(g => g.includes(mdi.tag));
      L.check(mdi && mdiPiece >= 0 && groups[mdiPiece].length === 1 && mdi.units.length === 1 && mdi.units[0].rings.length === 3, 'mdi record-circle (ring + disc) stays ONE piece with its 3 contours');
      // lengths
      row.off = runs[false].lenMm; row.on = runs[true].lenMm; row.children = nChild; row.minChildGap = minChildGap / MM; row.minGap = pc.minGap / MM;
      L.check(row.on <= row.off + 0.5, `length with holes ${row.on.toFixed(1)} mm <= without ${row.off.toFixed(1)} mm`);
      // single undo (app.undo) and redo
      const snap = (U) => { const o = {}; U.forEach(u => { o[u.tag] = u.units.flatMap(x => x.rings.flat(2)); }); return o; };
      const maxErr = (A, B) => { let e = 0; for (const k in A) { const a = A[k], b = B[k] || []; if (a.length !== b.length) return Infinity; for (let i = 0; i < a.length; i++) e = Math.max(e, Math.abs(a[i] - b[i])); } return e; };
      await L.es('app.undo(); app.redraw(); 1');
      const Uu = await L.units(); const eu = maxErr(snap(U0), snap(Uu));
      const rm = await L.esJson(L.ES_REGMARKS);
      L.check(eu < 0.01 && !rm.roll, `ONE app.undo() restores all items (max ${eu.toExponential(2)} pt) and removes the roll`);
      await L.es('app.redo(); app.redraw(); 1');
      const Ur = await L.units(); const er = maxErr(snap(U1), snap(Ur));
      L.check(er < 0.01, `app.redo() brings the layout back (max ${er.toExponential(2)} pt)`);
      // Cancel exact (children included)
      await L.es(`(function(){ try { app.activeDocument.layers.getByName('Corvo').pathItems.getByName('Corvo_Roll_rif').remove(); } catch(e){} return 1; })()`);
      const Ubefore = await L.units();
      await L.esSelectTagged();
      await L.setup({ roll: 600, gap: GAP_MM, rot: '90', time: 6, holes: true, seed: 3 });
      await L.click('btnNest');
      await L.waitState(s => s.state === 'running', 60000, 300); await L.sleep(3500);
      const stC = await L.cancelAndWait();
      const Uc = await L.units(); const ec = maxErr(snap(Ubefore), snap(Uc));
      L.check(stC.state === 'idle' && ec < 0.01, `Cancel restores every item incl. children (max ${ec.toExponential(2)} pt)`);
      row.undo = eu; row.cancel = ec;
    }
    console.log('RESULT m2', JSON.stringify(row));
  } finally {
    if (process.env.KEEP !== '1') console.log(' close', await L.closeDoc(name));
    console.log(L.fails ? `\n${L.fails}/${L.checks} FAIL` : `\nALL OK (${L.checks})`); L.close(); process.exit(L.fails ? 1 : 0);
  }
})().catch(e => { console.error('ERR', e.stack || e); process.exit(1); });
