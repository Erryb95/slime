// repeat: kiss-cut x12, Nest with marks, Apply, read $.global.corvoLastUndo, one app.undo -> check
const L = require('./lib.js');
const FILE = 'C:/Users/erryb/Desktop/Plugin/bench/real/printcut/kiss-cut-sticker-template.ai';
const N = +(process.argv[2] || 5), SYS = process.argv[3] || 'graphtec', SECS = +(process.argv[4] || 10);
(async () => {
  await L.connect();
  const name = await L.openDoc(FILE);
  await L.es(`(function(){ var d=app.activeDocument, cut=d.layers.getByName('Cut line'), art=d.layers.getByName('Artwork');
    var src=[]; for (var i=0;i<cut.pageItems.length;i++) src.push(cut.pageItems[i]); for (i=0;i<art.pageItems.length;i++) src.push(art.pageItems[i]);
    for (var c=1;c<12;c++){ var col=c%6, row=Math.floor(c/6); for (var k=0;k<src.length;k++){ src[k].duplicate().translate(col*400, -row*400); } } return 1; })()`);
  await L.es(L.ES_TAG);
  let bad = 0;
  try {
    for (let r = 0; r < N; r++) {
      await L.esSelectTagged();
      await L.setup({ roll: 600, gap: 3, time: SECS, regmarks: SYS, seed: 7 + r });
      const st = await L.nestToReview(SECS);
      const steps = await L.es('$.global.corvo.steps');
      if (process.env.EDIT) {   // the user nudges a session item during review
        await L.es('$.global.corvo.raw[0].translate(5,0); app.redraw(); 1');
        const pre = await L.esJson('(function(){ var b=$.global.corvo.raw[0].geometricBounds; return corvo_json([b[0],b[1]]); })()');
        const a2 = await L.applyAndWait();
        const d2 = await L.es('corvo_json($.global.corvoLastUndo||null)');
        const rm2 = await L.esJson(L.ES_REGMARKS);
        const b2 = await L.esJson('(function(){ var d=app.activeDocument; for (var i=0;i<d.pageItems.length;i++){ if (d.pageItems[i].note==="cv:0"){ var b=d.pageItems[i].geometricBounds; return corvo_json([b[0],b[1]]); } } return "null"; })()');
        console.log(`edit run: apply ${a2.state} "${a2.status.slice(0,40)}", singleUndo ${d2}, roll ${rm2.roll && rm2.roll.name}, marks ${rm2.rm.map(g => g.group || g.frame)}, item0 moved ${JSON.stringify(pre)} -> ${JSON.stringify(b2)}`);
        const ok2 = rm2.roll && /_rif/.test(rm2.roll.name) && rm2.rm.some(g => g.group === 'Corvo_Regmarks_rif');
        console.log(ok2 ? 'EDIT OK (layout kept, history restored)' : 'EDIT FAIL'); if (!ok2) bad++;
        break;
      }
      const a = await L.applyAndWait();
      const d = await L.es('corvo_json($.global.corvoLastUndo||null)');
      await L.es('app.undo(); app.redraw(); 1');
      const rm = await L.esJson(L.ES_REGMARKS);
      const ok = !rm.roll && rm.rm.length === 0;
      if (!ok) bad++;
      console.log(`run ${r}: ${st.state} steps-before-apply ${steps}, singleUndo ${d}, after 1 undo: roll ${rm.roll ? 'present' : 'gone'}, marks ${rm.rm.map(g => g.group || g.frame).join(',') || 'gone'} -> ${ok ? 'OK' : 'FAIL'}`);
      // back to the original layout for the next run: undo everything the session left
      for (let k = 0; k < 20; k++) { const x = await L.esJson(L.ES_REGMARKS); if (!x.roll && x.rm.length === 0) break; await L.es('app.undo(); 1'); }
    }
  } finally { console.log(await L.closeDoc(name), bad ? bad + ' FAIL' : 'ALL OK'); L.close(); process.exit(0); }
})();
