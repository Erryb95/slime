// Pilota Arrange Master Demo in Illustrator (CEP debug porta 8092) su tutti i set della suite.
// uso: node am_suite.js [key1 key2 ...]
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('suite/manifest.json', 'utf8'));
const only = process.argv.slice(2);
async function cdpEval(expr, timeoutMs = 600000) {
  const t = (await (await fetch('http://localhost:8092/json')).json()).find(x => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const r = await new Promise(res => { ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) res(d); }; ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs } })); });
  ws.close();
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result.result.value;
}
const panelRun = (m) => `(async () => {
  const cs = new CSInterface(); const ev = c => new Promise(r => cs.evalScript(c, r));
  const $ = id => document.getElementById(id);
  const setCheck = (id, v) => { const e = $(id); if (e.checked !== v) e.click(); if (e.checked !== v) { e.checked = v; e.dispatchEvent(new Event('change', {bubbles:true})); } };
  const setText = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); };
  // chiudi documenti, apri il set, seleziona oggetti di primo livello
  const open = await ev(\`(function(){ try {
    while (app.documents.length) app.documents[0].close(SaveOptions.DONOTSAVECHANGES);
    var doc = app.open(new File('C:/Users/erryb/Desktop/Plugin/bench/suite/${m.key}.svg'));
    var MM = 72/25.4, items = [], big = null, bigA = 0;
    function collect(c){ for (var i=0;i<c.pageItems.length;i++){ var it=c.pageItems[i]; if (it.typename==='GroupItem' && it.parent.typename!=='CompoundPathItem' && it.pageItems.length>1 && it.clipped!==true && it.name.indexOf('p')!==0) { collect(it); } else items.push(it); } }
    collect(doc.layers[0]);
    for (var i=0;i<items.length;i++){ var b=items[i].visibleBounds; var a=(b[2]-b[0])*(b[1]-b[3]); if(a>bigA){bigA=a;big=items[i];} }
    big.name='CONTAINER'; doc.selection=null; doc.selection=items;
    var cb=big.visibleBounds;
    return 'sel='+doc.selection.length+' container='+((cb[2]-cb[0])/MM).toFixed(0)+'x'+((cb[1]-cb[3])/MM).toFixed(0)+' types='+items[0].typename;
  } catch(e){ return 'ERR '+e.message; } })()\`);
  $('icon-greedy').click(); await new Promise(r => setTimeout(r, 300));
  setCheck('greedy-dense-packing', true); setText('greedy-spacing', '5.67'); setText('greedy-quality', '${process.env.AMQ || 15}');
  setCheck('greedy-y-grav', true); setCheck('greedy-free-rotation', false);
  setCheck('greedy-allow-turn', false); setCheck('greedy-allow-turn-180', false);
  ${m.rots.some(r => r.includes(90)) ? "setCheck('greedy-allow-turn', true);" : m.rots.some(r => r.includes(180)) ? "setCheck('greedy-allow-turn-180', true);" : ""}
  await new Promise(r => setTimeout(r, 300));
  const cfg = ['y-grav','allow-turn','allow-turn-180','quality','spacing'].map(k => k + '=' + ($('greedy-'+k).type==='checkbox' ? $('greedy-'+k).checked : $('greedy-'+k).value)).join(' ');
  const t0 = Date.now(); $('btn-apply').click(); let st = '';
  while (Date.now() - t0 < 540000) { await new Promise(r => setTimeout(r, 1000)); st = document.body.innerText; if (/Layout applied|rror|unreachable|more than 50/.test(st)) break; }
  const secs = (Date.now() - t0) / 1000;
  const status = (st.match(/Layout applied[^\\n]*|[^\\n]*rror[^\\n]*|[^\\n]*more than 50[^\\n]*/) || ['timeout'])[0];
  const meas = await ev(\`(function(){ try { var doc=app.activeDocument; var MM=72/25.4; var c=doc.pageItems.getByName('CONTAINER'); var cb=c.visibleBounds;
    var wg=doc.groupItems.getByName('ArrangeMasterDemo_Temp_Working'); var L=-1, H=-1, n=0;
    for (var i=0;i<wg.pageItems.length;i++){ var it=wg.pageItems[i]; if (it.typename==='RasterItem'){ var b=it.visibleBounds; L=(b[2]-cb[0])/MM; H=(cb[1]-b[3])/MM; n++; } }
    var o=new ExportOptionsPNG24(); o.artBoardClipping=false; o.horizontalScale=15; o.verticalScale=15; o.transparency=false;
    doc.exportFile(new File('C:/Users/erryb/Desktop/Plugin/bench/results/am_${m.key}${process.env.AMQ ? '_q' + process.env.AMQ : ''}.png'), ExportType.PNG24, o);
    return JSON.stringify({L:L,H:H,rasters:n}); } catch(e){ return JSON.stringify({error:e.message}); } })()\`);
  $('btn-cancel').click(); await new Promise(r => setTimeout(r, 3000));
  return JSON.stringify({ open, cfg, secs, status, meas: JSON.parse(meas) });
})()`;
(async () => {
  fs.mkdirSync('results', { recursive: true });
  for (const m of manifest) {
    if (only.length && !only.includes(m.key)) continue;
    try {
      const r = JSON.parse(await cdpEval(panelRun(m)));
      r.key = m.key; r.density = r.meas.L > 0 ? m.area_mm2 / (600 * r.meas.L) : null;
      fs.writeFileSync(`results/am_${m.key}${process.env.AMQ ? '_q' + process.env.AMQ : ''}.json`, JSON.stringify(r, null, 1));
      console.log(`${m.key} L=${r.meas.L && r.meas.L.toFixed(1)} dens=${r.density && (r.density*100).toFixed(1)}% ${r.secs.toFixed(0)}s | ${r.status} | ${r.open} | ${r.cfg}`);
    } catch (e) { console.log(`${m.key} FAIL ${e.message}`); }
  }
  console.log('ALLDONE');
})();
