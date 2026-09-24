// Module 3 verification in Illustrator: copies per design + mirrored L/R pairs on real files
//   A) Avery 22806 2" square labels template: two label designs drawn on the template (print art with a spot colour on
//      layer "Stampa" + CutContour on layer "Taglio"), design A x8, design B x4
//   B) real right car headlight (freesvg, CC0) x2 + S+D (2 mirrored copies)
// Checks: ghosts (Corvo_Ghost) during the search, duplicates on Apply on the original layers with the same paint/spots,
// every copy = original moved rigidly (mirrored copies = exact reflection), print follows its cut, no overlaps,
// ONE app.undo() removes copies + layout + roll, redo, Cancel removes the ghosts.
// node m3.js [secs=12]
const L = require('./lib.js');
const REAL = 'C:/Users/erryb/Desktop/Plugin/bench/real/quantity/';
const SECS = +(process.argv[2] || 12);
const MM = L.MM;

const ES_AVERY = `(function(){ var d=app.activeDocument;
  function spot(name,c,m,y,k){ var s; try { s=d.spots.getByName(name); } catch(e){ s=d.spots.add(); s.name=name; var col=new CMYKColor(); col.cyan=c; col.magenta=m; col.yellow=y; col.black=k; s.color=col; s.colorType=ColorModel.SPOT; } var sc=new SpotColor(); sc.spot=s; sc.tint=100; return sc; }
  var cut=spot('CutContour',0,100,0,0), pms=spot('PANTONE 485 C',0,95,100,0);
  var lp=d.layers.add(); lp.name='Stampa'; var lc=d.layers.add(); lc.name='Taglio';
  function cmyk(c,m,y,k){ var o=new CMYKColor(); o.cyan=c;o.magenta=m;o.yellow=y;o.black=k; return o; }
  // label A on the template square at (45,747): rounded square + spot star, square CutContour
  var bg=lp.pathItems.roundedRectangle(744, 48, 138, 138, 12, 12); bg.filled=true; bg.fillColor=cmyk(0,20,90,0); bg.stroked=false; bg.name='A_bg';
  var st=lp.pathItems.star(45+72, 747-72, 50, 22, 5); st.filled=true; st.fillColor=pms; st.stroked=false; st.name='A_spot';
  var c=lc.pathItems.rectangle(747, 45, 144, 144); c.filled=false; c.stroked=true; c.strokeColor=cut; c.strokeWidth=0.25; c.name='A_cut';
  // label B at (234,747): round sticker + spot disc, round CutContour
  var bbg=lp.pathItems.ellipse(744, 237, 138, 138); bbg.filled=true; bbg.fillColor=cmyk(60,0,10,0); bbg.stroked=false; bbg.name='B_bg';
  var dot=lp.pathItems.ellipse(747-40, 234+30, 60, 40); dot.filled=true; dot.fillColor=pms; dot.stroked=false; dot.name='B_spot';
  var bc=lc.pathItems.ellipse(747, 234, 144, 144); bc.filled=false; bc.stroked=true; bc.strokeColor=cut; bc.strokeWidth=0.25; bc.name='B_cut';
  return 'avery built'; })()`;

// transform fit: instance rings vs original rings (rotation 0/90/180/270, optional mirror x -> -x, translation by bbox centre)
function ringsOf(u) { return u.units.flatMap(x => x.rings); }
function regionOf(rings) { return L.union(rings.map(r => L.unitRegion([r]))); }
function xform(rings, a, m) {
  const c = Math.round(Math.cos(a * Math.PI / 180)), s = Math.round(Math.sin(a * Math.PI / 180));
  return rings.map(r => r.map(([x, y]) => { const X = m ? -x : x; return [X * c - y * s, X * s + y * c]; }));
}
function bbc(rings) { let l = 1e30, b = 1e30, r = -1e30, t = -1e30; for (const q of rings) for (const [x, y] of q) { l = Math.min(l, x); r = Math.max(r, x); b = Math.min(b, y); t = Math.max(t, y); } return [(l + r) / 2, (b + t) / 2]; }
function fit(orig, inst) {
  const RI = regionOf(inst), ai = L.areaP(RI), ci = bbc(inst);
  let best = null;
  for (const m of [false, true]) for (const a of [0, 90, 180, 270]) {
    const T = xform(orig, a, m), ct = bbc(T), dx = ci[0] - ct[0], dy = ci[1] - ct[1];
    const R = regionOf(T.map(r => r.map(([x, y]) => [x + dx, y + dy])));
    const sd = L.areaP(L.diff(R, RI)) + L.areaP(L.diff(RI, R));
    const rel = sd / Math.max(ai, 1e-9);
    if (!best || rel < best.rel - 1e-9) best = { a, m, rel, cx: ci[0], cy: ci[1] };
  }
  return best;
}
const ES_GHOSTS = `(function(){ try { var ly=app.activeDocument.layers.getByName('Corvo'), n=0; for (var i=0;i<ly.pathItems.length;i++) if (ly.pathItems[i].name==='Corvo_Ghost') n++; return n; } catch(e){ return 0; } })()`;

async function scenario(label, file, build, qtyFor, expect) {
  console.log(`\n== ${label}`);
  const name = await L.openDoc(REAL + file);
  const row = { label };
  try {
    if (build) console.log(' build:', await L.es(build));
    console.log(' tagged', await L.es(L.ES_TAG));
    const U0 = await L.units();
    console.log(' items', U0.map(u => `${u.name || u.type}@${u.layer}`).join(' '));
    await L.esSelectTagged();
    await L.setup({ roll: 300, gap: 2, rot: '90', time: SECS, holes: false, seed: 7 });
    // "Read selection" -> table, then quantities / mirror per row
    await L.click('m3Load');
    await L.sleep(500);
    const stL = await L.waitState(s => s.state === 'idle', 600000, 400);
    const rows = await L.js(`Array.from(document.querySelectorAll('#m3Body tr')).map(function(tr){ var n=tr.querySelector('td.name'); return n ? n.textContent : tr.textContent; })`);
    console.log(` read selection: "${stL.status.slice(0, 100)}" rows: ${JSON.stringify(rows)}`);
    const spec = rows.map(r => qtyFor(r));
    console.log(' table:', await L.js(`(function(){ var S=${JSON.stringify(spec)}; var trs=document.querySelectorAll('#m3Body tr');
      for (var k=0;k<trs.length;k++){ var s=S[k]; if(!s) continue; var q=trs[k].querySelector('td.qty input'), m=trs[k].querySelector('td.mir input');
        q.value=s.qty; q.dispatchEvent(new Event('change')); if (m.checked!==!!s.mirror){ m.checked=!!s.mirror; m.dispatchEvent(new Event('change')); } } return document.getElementById('m3Sum').textContent; })()`));
    const extra = spec.reduce((s, x) => s + (x ? (x.qty - 1) + (x.mirror ? x.qty : 0) : 0), 0);
    // Nest, count ghosts while running
    await L.click('btnNest');
    let ghostsLive = -1;
    for (let k = 0; k < 2400; k++) {
      const st = await L.panelState();
      if (st.state === 'running' || st.state === 'review') { await L.sleep(1500); ghostsLive = +(await L.es(ES_GHOSTS)); break; }
      if (st.state === 'idle' && /error/.test(st.cls)) { console.log(' nest error: ' + st.status); break; }
      await L.sleep(500);
    }
    L.check(ghostsLive === extra, `${label}: ${ghostsLive} ghosts (Corvo_Ghost) on the Corvo layer during the search (expected ${extra} = copies)`);
    const st = await L.waitState(s => s.state === 'review' || s.state === 'idle', (SECS + 600) * 1000, 500);
    console.log(` nest: ${st.state} "${st.status.slice(0, 160)}" len ${st.len} fill ${st.fill}`);
    const info = await L.sessionInfo();
    row.lenMm = info.panel.best ? +(info.panel.best.w / MM).toFixed(1) : null;
    // Apply
    const t0 = Date.now();
    const stA = await L.applyAndWait();
    row.applyS = +((Date.now() - t0) / 1000).toFixed(1);
    L.check(stA.state === 'idle' && !/error/.test(stA.cls), `${label}: Apply -> idle in ${row.applyS} s ("${stA.status.slice(0, 90)}")`);
    console.log(' corvoLastUndo', await L.es('$.global.corvoLastUndo ? corvo_json($.global.corvoLastUndo) : "none"'));
    const U1 = await L.units();
    const byTag = {}; U1.forEach(u => { (byTag[u.tag] = byTag[u.tag] || []).push(u); });
    const orig = {}; U0.forEach(u => { orig[u.tag] = u; });
    const groups = info.host.items.filter(g => g.length && orig[g[0]]);
    const badCount = [], badPaint = [], fits = [];
    const paint = (u) => u.layer + '|' + u.units.map(x => x.fill + '/' + x.stroke).join(',');
    for (const g of groups) {
      const want = expect(orig[g[0]]);   // {normal, mirror, check}
      for (const tag of g) {
        const inst = byTag[tag] || [];
        if (inst.length !== want.normal + want.mirror) badCount.push(`${orig[tag].name || tag} ${inst.length}/${want.normal + want.mirror}`);
        for (const u of inst) {
          if (paint(u) !== paint(orig[tag])) badPaint.push(`${tag}: ${paint(orig[tag])} -> ${paint(u)}`);
          fits.push({ tag, name: orig[tag].name, f: fit(ringsOf(orig[tag]), ringsOf(u)) });
        }
      }
      if (want.mirror) {
        const f0 = fits.filter(x => x.tag === g[0]);
        const nm = f0.filter(x => x.f.m).length, nn = f0.filter(x => !x.f.m).length;
        L.check(nm === want.mirror && nn === want.normal, `${label}: ${nn} plain + ${nm} mirrored instances (expected ${want.normal} + ${want.mirror})`);
      }
    }
    L.check(!badCount.length, `${label}: every item present the requested number of times` + (badCount.length ? ' ' + badCount.slice(0, 6).join('; ') : ''));
    L.check(!badPaint.length, `${label}: duplicates keep layer + fill/stroke (spot colours) of the original` + (badPaint.length ? ' ' + badPaint.slice(0, 3).join('; ') : ''));
    const worst = fits.reduce((w, x) => (!w || x.f.rel > w.f.rel) ? x : w, null);
    L.check(worst && worst.f.rel < 2e-3, `${label}: every instance = original moved rigidly (rotation/mirror), worst sym. diff ${(worst.f.rel * 100).toFixed(4)} % (${worst.name})`);
    row.worstFitPct = worst ? +(worst.f.rel * 100).toFixed(4) : null;
    // print inside its cut: every print instance lies inside exactly one cut instance of the same piece
    let orphan = 0;
    for (const g of groups) if (g.length > 1) {
      const cutTag = g.find(t => /cut/i.test(orig[t].name)) || g[0];
      const cuts = (byTag[cutTag] || []).map(u => L.outerOnly(regionOf(ringsOf(u))));
      for (const t of g) if (t !== cutTag) for (const u of byTag[t] || []) {
        const r = regionOf(ringsOf(u)), a = L.areaP(r);
        const hosts = cuts.filter(c => L.areaP(L.inter(r, c)) > a - 0.05).length;
        if (hosts !== 1) orphan++;
      }
    }
    L.check(orphan === 0, `${label}: print art of every copy inside exactly one cut line of its piece (${orphan} orphans)`);
    // overlaps between all final cut instances
    const regs = [];
    for (const g of groups) { const cutTag = g.find(t => /cut/i.test(orig[t].name)) || g[0]; for (const u of byTag[cutTag] || []) regs.push(regionOf(ringsOf(u))); }
    const pc = L.pairCheck(regs, 2 * MM);
    L.check(pc.overl.length === 0, `${label}: no overlaps between ${regs.length} instances` + (pc.overl.length ? ' ' + JSON.stringify(pc.overl.slice(0, 4)) : ''));
    L.check(pc.near.length === 0, `${label}: gap 2 mm respected (min ${(pc.minGap / MM).toFixed(2)} mm)`);
    // one undo
    const snap = (U) => { const o = {}; U.forEach(u => { (o[u.tag] = o[u.tag] || []).push(ringsOf(u).flat(2)); }); return o; };
    const cmp0 = (A, B) => { let e = 0; for (const k in A) { const a = A[k][0], b = (B[k] || [])[0] || []; if (!B[k] || B[k].length !== A[k].length || a.length !== b.length) return Infinity; for (let i = 0; i < a.length; i++) e = Math.max(e, Math.abs(a[i] - b[i])); } return e; };
    await L.es('app.undo(); app.redraw(); 1');
    const Uu = await L.units(); const eu = cmp0(snap(U0), snap(Uu));
    const rm = await L.esJson(L.ES_REGMARKS);
    const ghostsAfter = +(await L.es(ES_GHOSTS));
    L.check(eu < 0.01 && !rm.roll && ghostsAfter === 0, `${label}: ONE app.undo() removes every copy + layout + roll (max ${eu.toExponential(2)} pt, ${Uu.length}/${U0.length} items, roll ${rm.roll ? rm.roll.name : 'gone'})`);
    await L.es('app.redo(); app.redraw(); 1');
    const Ur = await L.units();
    L.check(Ur.length === U1.length, `${label}: app.redo() brings the copies back (${Ur.length}/${U1.length} items)`);
    await L.es('app.undo(); app.redraw(); 1');
    // Cancel removes the ghosts
    await L.esSelectTagged();
    await L.setup({ roll: 300, gap: 2, rot: '90', time: 8, holes: false, seed: 3 });
    await L.click('btnNest');
    await L.waitState(s => s.state === 'running' || s.state === 'review', 600000, 300); await L.sleep(3000);
    const gC = +(await L.es(ES_GHOSTS));
    const stC = await L.cancelAndWait();
    const Uc = await L.units(); const ec = cmp0(snap(U0), snap(Uc));
    const gC2 = +(await L.es(ES_GHOSTS));
    L.check(stC.state === 'idle' && gC === extra && gC2 === 0 && ec < 0.01 && Uc.length === U0.length, `${label}: Cancel removes the ${gC} ghosts (left ${gC2}) and restores the originals (max ${ec.toExponential(2)} pt)`);
    row.copies = extra; row.items = U0.length; row.instances = U1.length;
    console.log('RESULT m3', JSON.stringify(row));
  } finally {
    if (process.env.KEEP !== '1') console.log(' close', await L.closeDoc(name));
  }
}

(async () => {
  await L.connect();
  await L.js(`(function(){ var d=document.getElementById('m3'); if (d) d.open=true; var c=document.getElementById('m3Close'); if (c && c.checked){ c.checked=false; c.dispatchEvent(new Event('change')); }
    var g=document.getElementById('groupBy'); g.value='none'; g.dispatchEvent(new Event('change')); var ct=document.getElementById('container'); if (ct){ ct.value='roll'; ct.dispatchEvent(new Event('change')); } return 1; })()`);
  try {
    await scenario('Avery 22806: A x8, B x4', 'avery22806_square_labels.ai', ES_AVERY,
      (r) => /^A/.test(r) ? { qty: 8 } : /^B/.test(r) ? { qty: 4 } : { qty: 1 },
      (u) => /^A_/.test(u.name) ? { normal: 8, mirror: 0 } : { normal: 4, mirror: 0 });
    await scenario('Faro destro x2 + S+D', 'freesvg_car-right-headlight.svg', null,
      () => ({ qty: 2, mirror: true }),
      () => ({ normal: 2, mirror: 2 }));
  } finally {
    console.log(L.fails ? `\n${L.fails}/${L.checks} FAIL` : `\nALL OK (${L.checks})`); L.close(); process.exit(L.fails ? 1 : 0);
  }
})().catch(e => { console.error('ERR', e.stack || e); process.exit(1); });
