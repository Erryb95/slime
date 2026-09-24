// Host module loading in Illustrator (never touches the desktop: CDP to the Corvo panel only, port 8093)
//   1. location.reload() of the panel -> corvoHealth() through the panel: every host function present.
//   2. simulated failed load (module functions cleared from $.global) -> panel fallback reloads the files at global
//      scope and corvoHealth() is ok again.
//   3. fresh COPY of bench/real/color/flag_italy.svg, "Nest by = Fill colour" -> 3 rolls (no "no colour" roll).
//   4. COPY of bench/suite/insegna48.svg (renamed: the user may have the original open; frame CONTAINER removed),
//      Reg. marks = Graphtec,
//      Apply -> marks present; app.undo() -> marks gone. Copies closed WITHOUT saving.
// node hostload.js [secs=8] [tmpdir]
const L = require('./lib.js');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = 'C:/Users/erryb/Desktop/Plugin/';
const SECS = +(process.argv[2] || 8);
const TMP = (process.argv[3] || path.join(os.tmpdir(), 'corvo_hostload')).replace(/\\/g, '/');

async function reloadPanel() {
  await L.js('setTimeout(function(){ location.reload(); }, 50), 1');
  await L.sleep(4000);
  for (let k = 0; k < 40; k++) {
    try { if (await L.js('!!(window.CorvoPanel && window.CorvoPanel.hostHealth)')) return true; } catch (e) { /* context switching */ }
    await L.sleep(500);
  }
  return false;
}
const health = () => L.js('CorvoPanel.hostHealth().then(function(h){ return h; })');
const status = () => L.js(`({text: document.getElementById('status').textContent, cls: document.getElementById('status').className})`);
function copy(src, name) { fs.mkdirSync(TMP, { recursive: true }); const dst = TMP + '/' + name; fs.copyFileSync(src, dst); return dst; }

(async function main() {
  await L.connect();
  console.log('== 1. reload + corvoHealth');
  L.check(await reloadPanel(), 'panel reloaded (CorvoPanel.hostHealth available)');
  await L.connect();
  let h = await health();
  L.check(h && h.ok === true && h.missing.length === 0, `corvoHealth ok, missing [${h && h.missing}] loadErrors [${h && h.loadErrors}] reloaded [${h && h.reloaded}]`);
  const raw = await L.esJson('corvoHealth()');
  console.log('   hostDir:', raw.hostDir, '| functions:', Object.keys(raw.fns).length);
  const st0 = await status();
  L.check(!/error/.test(st0.cls), `no warning in the status line ("${st0.text}")`);

  console.log('== 2. simulated failed load -> panel fallback at global scope');
  await L.es('$.global.corvo_m4_paint = undefined; $.global.corvoRegmarks = undefined; $.global.corvo_rmFinishAll = undefined; 1');
  const broken = await L.esJson('corvoHealth()');
  L.check(!broken.ok && broken.missing.length === 3, `broken host detected: missing ${broken.missing.join(', ')}`);
  h = await health();
  L.check(h.ok === true && h.reloaded.join() === 'multinest.jsx,regmarks.jsx', `fallback reloaded [${h.reloaded}] -> ok=${h.ok}`);
  const fx = await L.es('typeof corvo_m4_paint + "," + typeof corvoRegmarks + "," + typeof $.global.corvo_rmFinishAll');
  L.check(fx === 'function,function,function', `functions global again after fallback (${fx})`);

  console.log('== 3. flag_italy copy, Nest by fill colour');
  let name = await L.openDoc(copy(ROOT + 'bench/real/color/flag_italy.svg', 'hostload_flag_italy.svg'));
  try {
    console.log('   opened', name, '| tagged', await L.es(L.ES_TAG));
    await L.esSelectTagged();
    await L.setup({ roll: 1000, gap: 2, rot: '90', time: SECS, holes: true, seed: 7 });
    await L.js(`(function(){ function set(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); }
      set('groupBy','color'); set('container','roll'); return 1; })()`);
    await L.click('btnNest'); await L.sleep(800);
    const st = await L.waitState(s => s.state === 'review' || s.state === 'idle', (SECS * 4 + 600) * 1000, 700);
    const mn = await L.js(`(function(){ var M=CorvoPanel.state().mn; return M && M.results ? M.results.map(function(r){ return r.label; }) : null; })()`);
    const cont = await L.esJson(`(function(){ var d=app.activeDocument, o=[]; try { var ly=d.layers.getByName('Corvo');
      for (var g=0; g<ly.groupItems.length; g++){ var gi=ly.groupItems[g]; if (!/^Corvo_Containers/.test(gi.name)) continue;
        var labels=[]; for (var j=0;j<gi.textFrames.length;j++) labels.push(gi.textFrames[j].contents); o.push({name:gi.name, n:gi.pathItems.length, labels:labels}); } } catch(e){}
      return corvo_json(o); })()`);
    const cg = cont.find(g => g.name === 'Corvo_Containers');
    console.log('   state', st.state, '| status', st.status.slice(0, 120));
    console.log('   jobs', JSON.stringify(mn), '| labels', JSON.stringify(cg && cg.labels));
    L.check(st.state === 'review' && cg && cg.n === 3, `3 rolls drawn (${cg ? cg.n : 0})`);
    L.check(!!mn && mn.length === 3 && !mn.some(l => /no colou?r|senza colore/i.test(l)), 'no "no colour" roll');
    await L.cancelAndWait();
  } finally { console.log('   close', await L.closeDoc(name)); }

  console.log('== 4. insegna48 copy, Graphtec marks, Apply, undo');
  name = await L.openDoc(copy(ROOT + 'bench/suite/insegna48.svg', 'hostload_insegna48.svg'));
  try {
    // the suite file carries its reference frame "CONTAINER" (wider than the roll): not a piece, removed from the copy
    console.log('   opened', name, '| removed frame', await L.es(`(function(){ var d=app.activeDocument, n=0; for (var i=d.pageItems.length-1;i>=0;i--){ if (d.pageItems[i].name==='CONTAINER'){ d.pageItems[i].remove(); n++; } } return n; })()`),
      '| tagged', await L.es(L.ES_TAG));
    await L.esSelectTagged();
    await L.setup({ roll: 600, gap: 2, rot: '90', time: SECS, holes: true, regmarks: 'graphtec', seed: 7 });
    await L.js(`(function(){ var e=document.getElementById('groupBy'); if(e){ e.value='none'; e.dispatchEvent(new Event('change')); } return 1; })()`);
    await L.click('btnNest'); await L.sleep(800);
    const st = await L.waitState(s => s.state === 'review' || (s.state === 'idle' && /error/.test(s.cls)), (SECS * 4 + 600) * 1000, 700);
    const pre = await L.esJson(L.ES_REGMARKS);
    const nm = (r) => r.rm.filter(g => g.marks).reduce((s, g) => s + g.marks.length, 0);
    L.check(st.state === 'review' && nm(pre) > 0, `review with marks (${nm(pre)} paths) — "${st.status.slice(0, 80)}"`);
    const sa = await L.applyAndWait();
    const after = await L.esJson(L.ES_REGMARKS);
    L.check(nm(after) > 0 && !/error/.test(sa.cls), `after Apply marks present (${nm(after)} paths, groups ${after.rm.map(g => g.group || g.frame).join(',')}) — "${sa.status.slice(0, 80)}"`);
    await L.es('app.undo(); app.redraw(); 1');
    const un = await L.esJson(L.ES_REGMARKS);
    L.check(nm(un) === 0 && !un.roll, `after app.undo() marks gone (${nm(un)}) and roll ${un.roll ? 'still there' : 'gone'}`);
  } finally { console.log('   close', await L.closeDoc(name)); }

  console.log(`\n${L.checks - L.fails}/${L.checks} ok`);
  L.close();
  process.exit(L.fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
