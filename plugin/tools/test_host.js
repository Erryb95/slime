// Test del lato host (host/corvo.jsx) dentro Illustrator, SENZA riavviarlo.
// Usa come ponte un pannello CEP gia' aperto (debug port, default 8092 = Arrange Master; 8093 = Corvo stesso):
// via Chrome DevTools Protocol esegue CSInterface.evalScript nel pannello.
//
// uso: node tools/test_host.js [porta]            (Node >= 22: WebSocket e fetch globali)
// Apre bench/suite/{insegna48,lettering}.svg, testa export/apply/revert/roll e chiude i documenti SENZA salvare.

const PORT = Number(process.argv[2] || 8092);
const JSX = 'C:/Users/erryb/Desktop/Plugin/plugin/host/corvo.jsx';
const SUITE = 'C:/Users/erryb/Desktop/Plugin/bench/suite/';
const fs = require('fs');

let ws, msgId = 0; const pending = {};
async function connect() {
  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const t = targets.find(x => x.type === 'page');
  if (!t) throw new Error('nessun pannello CEP sulla porta ' + PORT);
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } };
}
const cdp = (method, params) => new Promise(res => { const i = ++msgId; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });

// esegue ExtendScript e ritorna la stringa risultato
async function host(code) {
  const expr = `new Promise(r => new CSInterface().evalScript(${JSON.stringify(code)}, r))`;
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 });
  if (r.result && r.result.exceptionDetails) throw new Error('CDP: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result.result.value;
}
const load = `$.evalFile(new File(${JSON.stringify(JSX)}));`;
async function call(fn, arg) {
  const s = await host(load + `${fn}(${arg === undefined ? '' : JSON.stringify(typeof arg === 'string' ? arg : JSON.stringify(arg))})`);
  try { return JSON.parse(s); } catch (e) { throw new Error(`${fn}: risposta non JSON: ${String(s).slice(0, 300)}`); }
}

let fails = 0;
function check(cond, msg) { console.log((cond ? '  OK   ' : '  FAIL ') + msg); if (!cond) fails++; }

// bounds [l,t,r,b] in coordinate documento dei pezzi in $.global.corvo.items
async function readBounds() {
  const s = await host(`(function(){ var prev=app.coordinateSystem; app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
    var st=$.global.corvo, out=[]; for (var i=0;i<st.items.length;i++){ var it0=st.items[i]; if (it0 instanceof Array) it0=it0[0]; var b=it0.geometricBounds; out.push('['+b[0]+','+b[1]+','+b[2]+','+b[3]+']'); }
    app.coordinateSystem=prev; return '['+out.join(',')+']'; })()`);
  return JSON.parse(s);
}
const rot90 = (b, tx, ty) => [-b[1] + tx, b[2] + ty, -b[3] + tx, b[0] + ty];   // antiorario, y in alto
const rot180 = (b, tx, ty) => [-b[2] + tx, -b[3] + ty, -b[0] + tx, -b[1] + ty];
const maxDiff = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));

function svgSubpaths(file) {
  // numero di sottotracciati (comandi M) per ogni <path>, escluso CONTAINER
  const svg = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const m of svg.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)) out.push((m[1].match(/[Mm]/g) || []).length);
  return out;
}

async function testFile(key) {
  console.log(`\n=== ${key} ===`);
  const open = await host(`(function(){ try {
    var doc = app.open(new File('${SUITE}${key}.svg'));
    var items = [], big = null, bigA = 0;
    function collect(c){ for (var i=0;i<c.pageItems.length;i++){ var it=c.pageItems[i];
      if (it.typename==='GroupItem' && it.pageItems.length>1 && it.clipped!==true && it.name.indexOf('p')!==0) collect(it); else items.push(it); } }
    collect(doc.layers[0]);
    for (var i=0;i<items.length;i++){ var b=items[i].visibleBounds; var a=(b[2]-b[0])*(b[1]-b[3]); if(a>bigA){bigA=a;big=items[i];} }
    var sel=[]; for (i=0;i<items.length;i++) if (items[i]!==big && items[i].name!=='CONTAINER') sel.push(items[i]);
    doc.selection=null; doc.selection=sel;
    return doc.name+'|'+doc.selection.length+'|'+big.name+'|'+items[0].typename;
  } catch(e){ return 'ERR '+e.message; } })()`);
  console.log('  apertura:', open);
  if (open.startsWith('ERR')) { fails++; return; }
  const docName = open.split('|')[0];
  const closeDoc = () => host(`(function(){ try { app.documents.getByName(${JSON.stringify(docName)}).close(SaveOptions.DONOTSAVECHANGES); return 'chiuso'; } catch(e){ return 'ERR '+e.message; } })()`);
  try {
    // ---- export
    let t0 = Date.now();
    const ex = await call('corvoExport', { flatness: 0.5 });
    const exMs = Date.now() - t0;
    if (ex.error) { check(false, 'export: ' + ex.error); return; }
    const probe = JSON.parse(await host('(function(){var p=$.global.corvo.probe; return "{\\"o\\":["+p.origin+"],\\"sign\\":"+p.sign+",\\"post\\":"+p.post+",\\"ok\\":"+p.ok+"}";})()'));
    console.log(`  export: ${ex.items.length} pezzi in ${exMs} ms (round-trip), sonda:`, JSON.stringify(probe));
    const nSel = Number(open.split('|')[1]);
    check(ex.items.length === nSel, `numero pezzi = selezione (${ex.items.length}/${nSel})`);
    const expRings = svgSubpaths(`${SUITE}${key}.svg`);
    const gotRings = ex.items.map(it => it.rings.length);
    const totExp = expRings.reduce((a, b) => a + b, 0), totGot = gotRings.reduce((a, b) => a + b, 0);
    check(totGot === totExp, `anelli totali ${totGot} vs sottotracciati SVG ${totExp}`);
    const pts = ex.items.reduce((a, it) => a + it.rings.reduce((s, r) => s + r.length, 0), 0);
    console.log(`  punti totali dopo discretizzazione: ${pts}`);
    const orig = await readBounds();
    const bd = Math.max(...ex.items.map((it, i) => maxDiff(it.bounds, orig[i])));
    check(bd <= 0.5 + 1e-3, `bounds export vs geometricBounds, scarto max ${bd.toFixed(4)} pt (<= flatness)`);
    console.log(`  doc: ${JSON.stringify(ex.doc)}`);

    // ---- mossa nota: rot 90 + traslazione su 5 pezzi
    const sub = [0, 1, 2, 3, 4].filter(i => i < ex.items.length);
    const TX = 1234.5, TY = -678.25;
    let ap = await call('corvoApply', sub.map(i => ({ i, a: 90, tx: TX, ty: TY })));
    check(ap.ok, `apply rot90: ${JSON.stringify(ap)}`);
    let now = await readBounds();
    let d = Math.max(...sub.map(i => maxDiff(now[i], rot90(orig[i], TX, TY))));
    check(d < 0.01, `rot90+T: scarto bounds ${d.toFixed(5)} pt`);
    const untouched = ex.items.map((_, i) => i).filter(i => !sub.includes(i));
    d = untouched.length ? Math.max(...untouched.map(i => maxDiff(now[i], orig[i]))) : 0;
    check(d < 1e-6, `pezzi non mossi invariati (${d})`);
    // seconda mossa assoluta: rot 180 + altra traslazione (verifica la composizione dei delta)
    ap = await call('corvoApply', sub.map(i => ({ i, a: 180, tx: -300, ty: 400 })));
    now = await readBounds();
    d = Math.max(...sub.map(i => maxDiff(now[i], rot180(orig[i], -300, 400))));
    check(d < 0.01, `poi rot180+T' (assoluta): scarto ${d.toFixed(5)} pt`);
    // rotazione libera 37.5 gradi: controlla il centro dei bounds dell'anello esportato
    ap = await call('corvoApply', [{ i: 0, a: 37.5, tx: 50, ty: 60 }]);
    now = await readBounds();
    {
      const r = 37.5 * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      const P = ex.items[0].rings.flat().map(([x, y]) => [c * x - s * y + 50, s * x + c * y + 60]);
      const eb = [Math.min(...P.map(p => p[0])), Math.max(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.min(...P.map(p => p[1]))];
      d = maxDiff(now[0], eb);
      check(d < 0.6, `rot 37.5 libera: bounds vs anelli trasformati, scarto ${d.toFixed(4)} pt`);
    }

    // ---- rotolo
    const H = 600 * 72 / 25.4, ab = ex.doc;
    const roll = { ox: ab.abLeft, oy: ab.abBottom - 20 * 72 / 25.4 - H, w: 1619 * 72 / 25.4, h: H };
    let rr = await call('corvoRoll', roll);
    check(rr.ok, 'corvoRoll crea: ' + JSON.stringify(rr));
    rr = await call('corvoRoll', { ...roll, w: roll.w * 0.9 });
    const rinfo = await host(`(function(){ var prev=app.coordinateSystem; app.coordinateSystem=CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
      var d=app.activeDocument, ly=d.layers.getByName('Corvo'); var r=ly.pathItems.getByName('Corvo_Roll'); var t=ly.textFrames.getByName('Corvo_Label');
      var g=r.geometricBounds; app.coordinateSystem=prev; return ly.pathItems.length+'|'+ly.textFrames.length+'|'+g.join(',')+'|'+t.contents; })()`);
    const [np, nt, gb, txt] = rinfo.split('|');
    const g = gb.split(',').map(Number);
    check(np === '1' && nt === '1', `rotolo aggiornato senza duplicati (path=${np}, testi=${nt})`);
    check(maxDiff(g, [roll.ox, roll.oy + roll.h, roll.ox + roll.w * 0.9, roll.oy]) < 0.01, `rettangolo del rotolo alle coordinate attese`);
    console.log('  etichetta:', txt);

    // ---- revert
    const rv = await call('corvoRevert');
    now = await readBounds();
    d = Math.max(...orig.map((b, i) => maxDiff(now[i], b)));
    check(rv.ok && d < 0.01, `revert: pezzi tornati, scarto max ${d.toExponential(2)} pt (${rv.ms} ms)`);
    const layerGone = await host(`(function(){ try { app.activeDocument.layers.getByName('Corvo'); return 'presente'; } catch(e){ return 'rimosso'; } })()`);
    check(layerGone === 'rimosso', `rotolo/etichetta/livello Corvo rimossi (${layerGone})`);

    // ---- timing: tutti i pezzi, mosse casuali, 10 ripetizioni
    const N = ex.items.length, times = [], tt = [], rt = [];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let rep = 0; rep < 10; rep++) {
      const moves = ex.items.map(it => ({ i: it.i, a: [0, 90, 180, 270][Math.floor(rnd() * 4)], tx: rnd() * 3000, ty: -rnd() * 1500 }));
      t0 = Date.now();
      const r = await call('corvoApply', moves);
      rt.push(Date.now() - t0); times.push(r.ms); tt.push(r.msTransform);
      if (!r.ok) check(false, 'apply timing: ' + JSON.stringify(r));
    }
    const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log(`  corvoApply ${N} pezzi: interno mediana ${med(times)} ms (max ${Math.max(...times)}), di cui transform ${med(tt)} ms; round-trip CEP mediana ${med(rt)} ms`);
    check(med(times) < 150 * N / 50 || med(times) < 150, `apply < 150 ms per 50 pezzi (mediana ${med(times)} ms per ${N})`);
    const rv2 = await call('corvoRevert');
    now = await readBounds();
    d = Math.max(...orig.map((b, i) => maxDiff(now[i], b)));
    check(d < 0.01, `revert dopo 10 apply completi: scarto max ${d.toExponential(2)} pt (${rv2.ms} ms)`);

    // ---- finish
    const fin = await call('corvoFinish');
    check(fin.ok, 'corvoFinish');
    // ---- errore per il testo vivo
    const te = await host(load + `(function(){ var d=app.activeDocument; var t=d.layers[0].textFrames.add(); t.contents='ABC'; d.selection=null; t.selected=true; var r=corvoExport('{"flatness":0.5}'); t.remove(); return r; })()`);
    // modulo 1: l'host conta il testo vivo (items[].text), l'errore lo da' il pannello (cluster.js, codice 'text')
    let teo = null; try { teo = JSON.parse(te); } catch (e) { teo = null; }
    check(teo && teo.items && teo.items.length === 1 && teo.items[0].text === 1, `testo vivo -> contato per il pannello: ${te.slice(0, 160)}`);
  } finally {
    console.log('  chiusura documento:', await closeDoc());
  }
}

(async () => {
  await connect();
  const ver = await host('app.version');
  console.log('Illustrator', ver, '- ponte CEP porta', PORT);
  for (const key of ['insegna48', 'lettering']) await testFile(key);
  console.log(fails ? `\n${fails} controlli FALLITI` : '\nTutti i controlli OK');
  ws.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(2); });
