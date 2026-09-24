// Module 9 verification in Illustrator: trial badge, trial expiry (simulated), Pro gating, Apply limit 10 incl. copies,
// licence dialog with keys signed by tools/release/license-gen.mjs (real private key, outside the repo).
// The licence record (localStorage 'corvo.m9' + %APPDATA%\Corvo\license.json) is saved first and restored at the end.
// node m9.js
const L = require('./lib.js');
const { execFileSync } = require('child_process');
const path = require('path');
const GEN = path.join(__dirname, '..', 'release', 'license-gen.mjs');
const gen = (ed) => JSON.parse(execFileSync(process.execPath, [GEN, '--name', 'Verifica Corvo', '--edition', ed, '--json'], { encoding: 'utf8' })).token;

const lic = () => L.js(`(function(){ var s=CorvoLicense.state(); var b=document.getElementById('m9Lic');
  function opt(id,v){ var o=document.querySelector('#'+id+' option[value="'+v+'"]'); return o ? o.disabled : null; }
  return { mode:s&&s.mode, edition:s&&s.edition, days:s&&s.daysLeft, badge:b&&b.textContent, holesDisabled:document.getElementById('useHoles').disabled,
    colorOptDisabled:opt('groupBy','color'), layerOptDisabled:opt('groupBy','layer'), sheetsOptDisabled:opt('container','sheets'),
    csv:CorvoLicense.has('costCsv'), applyMax:String(CorvoLicense.applyMax()) }; })()`);
const reloadPanel = async () => { await L.js('location.reload(), 1').catch(() => {}); L.close(); await L.sleep(4000); await L.connect(); await L.sleep(1500); };
const writeRec = (rec) => L.js(`(function(){ CorvoLicense.createStore().write(${JSON.stringify(rec)}); return JSON.stringify(CorvoLicense.createStore().read()); })()`);

const ES_DOC = `(function(){ var MM=72/25.4; var d=app.documents.add(DocumentColorSpace.CMYK, 600*MM, 400*MM); var ly=d.layers[0];
  for (var i=0;i<11;i++){ var w=(18+i*2)*MM, h=(15+i)*MM; var r=ly.pathItems.rectangle(350*MM-(i%4)*60*MM, 20*MM+Math.floor(i/4)*80*MM, w, h); r.name='R'+(i<10?'0':'')+i; r.filled=true; r.stroked=false; }
  return d.name; })()`;
const selNames = (names) => L.es(`(function(){ var d=app.activeDocument, out=[], N={}, A=${JSON.stringify(names)}; for (var k=0;k<A.length;k++) N[A[k]]=1; for (var i=0;i<d.pathItems.length;i++) if (N[d.pathItems[i].name]) out.push(d.pathItems[i]); d.selection=null; d.selection=out; return d.selection.length; })()`);
const names = (n) => Array.from({ length: n }, (_, i) => 'R' + (i < 10 ? '0' : '') + i);
async function setQty(first) {   // "Read selection", then copies on the first row, 1 elsewhere
  await L.click('m3Load'); await L.sleep(400);
  await L.waitState(s => s.state === 'idle', 120000, 300);
  return L.js(`(function(){ var trs=document.querySelectorAll('#m3Body tr'); for (var k=0;k<trs.length;k++){ var q=trs[k].querySelector('td.qty input'); if(!q) continue; q.value=k===0?${first}:1; q.dispatchEvent(new Event('change')); var m=trs[k].querySelector('td.mir input'); if (m.checked){ m.checked=false; m.dispatchEvent(new Event('change')); } } return document.getElementById('m3Sum').textContent; })()`);
}
async function nestReview() {
  await L.click('btnNest'); await L.sleep(500);
  return L.waitState(s => s.state === 'review' || (s.state === 'idle' && /error/.test(s.cls)), 200000, 300);
}
async function dialogKey(token) {
  return L.js(`new Promise(function(res){ CorvoLicense.openDialog(); var i=document.getElementById('m9Key'); i.value=${JSON.stringify(token)};
    document.getElementById('m9Activate').click(); setTimeout(function(){ var m=document.getElementById('m9Msg'); res({ msg:m.textContent, cls:m.className, status:document.getElementById('m9Status').textContent }); }, 1500); })`);
}
const closeDialog = () => L.js(`(function(){ document.getElementById('m9Close').click(); return document.getElementById('m9Dialog').hidden; })()`);

(async () => {
  await L.connect();
  const orig = await L.js(`JSON.stringify(CorvoLicense.createStore().read())`);
  console.log(' saved licence record', orig);
  let docName = null;
  const row = {};
  try {
    // 0) trial
    let s = await lic();
    console.log(' trial state', JSON.stringify(s));
    L.check(s.mode === 'trial' && /(Trial · \d+ d left|Prova · \d+ gg)/.test(s.badge) && !s.holesDisabled && !s.colorOptDisabled && !s.sheetsOptDisabled, `trial: badge "${s.badge}", every Pro option enabled`);
    row.trialBadge = s.badge;
    // 1) preset with "Nest by colour" saved during the trial
    await L.js(`(function(){ function set(id,v){ var e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('change')); } set('groupBy','color'); document.getElementById('mnName').value='m9 Pro colore'; document.getElementById('mnSave').click(); set('groupBy','none'); return 1; })()`);
    // 2) simulated expiry: trial started 15 days ago
    const now = Date.now();
    console.log(' expired record', await writeRec({ trialStart: now - 15 * 86400000, lastSeen: now, key: null }));
    await reloadPanel();
    s = await lic();
    console.log(' expired state', JSON.stringify(s));
    L.check(s.mode === 'expired' && /(Trial ended|Prova finita)/.test(s.badge), `after 15 days: badge "${s.badge}"`);
    L.check(s.holesDisabled && s.colorOptDisabled && s.layerOptDisabled && s.sheetsOptDisabled && !s.csv && s.applyMax === '10', 'expired: holes / colour / layer / sheets disabled, CSV Pro, Apply max 10');
    row.expiredBadge = s.badge;
    docName = await L.es(ES_DOC);
    await L.setup({ roll: 600, gap: 2, rot: '90', time: 3, holes: false, seed: 7 });
    // 3a) 10 pieces: Apply allowed
    await selNames(names(10)); await setQty(1);
    let st = await nestReview();
    let stA = await L.applyAndWait();
    L.check(stA.state === 'idle' && /applied|applicat/i.test(stA.status), `expired, 10 pieces: Apply allowed ("${stA.status.slice(0, 60)}")`);
    await L.es('app.undo(); app.redraw(); 1');
    // 3b) 9 designs + 2 copies = 11 pieces: Apply refused, licence dialog opened
    await selNames(names(9)); console.log(' table', await setQty(3));
    st = await nestReview();
    await L.click('btnApply'); await L.sleep(800);
    st = await L.panelState();
    const dlgOpen = await L.js(`!document.getElementById('m9Dialog').hidden`);
    L.check(st.state === 'review' && /warn/.test(st.cls) && /10/.test(st.status) && /11/.test(st.status) && dlgOpen, `expired, 9 designs + 2 copies = 11: Apply refused ("${st.status.slice(0, 120)}"), dialog open ${dlgOpen}`);
    row.limitMsg = st.status;
    await closeDialog();
    // 3c) Pro preset loaded after the trial: Nest stops with the "Pro feature" message
    await L.cancelAndWait();
    await L.js(`(function(){ var e=document.getElementById('mnPreset'); e.value='m9 Pro colore'; e.dispatchEvent(new Event('change')); return document.getElementById('groupBy').value; })()`).then(v => console.log(' groupBy after preset load:', v));
    await selNames(names(4));
    await L.click('btnNest'); await L.sleep(1500);
    st = await L.panelState();
    L.check(st.state === 'idle' && /error/.test(st.cls) && /Pro/.test(st.status), `Pro preset after the trial: Nest refused ("${st.status.slice(0, 120)}")`);
    await closeDialog().catch(() => {});
    await L.js(`(function(){ var e=document.getElementById('groupBy'); e.value='none'; e.dispatchEvent(new Event('change')); return 1; })()`);
    // 4) keys: tampered, Standard, Pro
    const std = gen('standard'), pro = gen('pro');
    const parts = pro.split('.'); const bad = parts[0].slice(0, -3) + (parts[0].slice(-3) === 'AAA' ? 'BBB' : 'AAA') + '.' + parts[1];
    let r = await dialogKey(bad);
    L.check(/error/.test(r.cls), `tampered key refused: "${r.msg}"`);
    r = await dialogKey(std);
    s = await lic();
    L.check(/ok/.test(r.cls) && s.mode === 'licensed' && s.edition === 'standard' && s.badge === 'Standard', `Standard key accepted ("${r.msg}"), badge "${s.badge}"`);
    L.check(s.holesDisabled && s.colorOptDisabled && s.sheetsOptDisabled && !s.csv && s.applyMax === 'Infinity', 'Standard: Pro options still locked, no Apply limit');
    await closeDialog();
    await selNames(names(9)); await setQty(3);
    st = await nestReview();
    stA = await L.applyAndWait();
    L.check(stA.state === 'idle' && /applied|applicat/i.test(stA.status), `Standard, 11 pieces (copies incl.): Apply allowed ("${stA.status.slice(0, 60)}")`);
    await L.es('app.undo(); app.redraw(); 1');
    r = await dialogKey(pro);
    s = await lic();
    L.check(/ok/.test(r.cls) && s.edition === 'pro' && s.badge === 'Pro' && !s.holesDisabled && !s.colorOptDisabled && !s.sheetsOptDisabled && s.csv, `Pro key: badge "${s.badge}", every option enabled`);
    await closeDialog();
    // key survives a panel reload
    await reloadPanel(); await L.sleep(1500);
    s = await lic();
    L.check(s.edition === 'pro' && s.badge === 'Pro', `Pro licence still active after reloading the panel (badge "${s.badge}")`);
    console.log('RESULT m9', JSON.stringify(row));
  } catch (e) { L.check(false, 'exception ' + e.message); console.log(e.stack); }
  finally {
    // restore the original record (trial as before), drop the test preset, close the test document
    try {
      await L.js(`(function(){ try { var m=JSON.parse(localStorage.getItem('corvo.presets')||'{}'); if (m.presets) delete m.presets['m9 Pro colore']; else delete m['m9 Pro colore']; localStorage.setItem('corvo.presets', JSON.stringify(m)); } catch(e){} return 1; })()`);
      const back = JSON.parse(orig);
      await L.js(`(function(){ var st=CorvoLicense.createStore(); st.write(${JSON.stringify(back)}); return 1; })()`);
      if (docName) { if ((await L.panelState()).state !== 'idle') await L.cancelAndWait(); console.log(' close', await L.closeDoc(docName)); }
      await reloadPanel();
      const s = await lic();
      L.check(s.mode === 'trial', `original licence record restored (badge "${s.badge}")`);
    } catch (e) { console.log('restore error', e.message); }
    console.log(L.fails ? `\n${L.fails}/${L.checks} FAIL` : `\nALL OK (${L.checks})`); L.close(); process.exit(L.fails ? 1 : 0);
  }
})().catch(e => { console.error('ERR', e.stack || e); process.exit(1); });
