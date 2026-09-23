// node plugin/tools/test_regmarks.js [seconds per nest = 2] [suite.json = bench/suite/insegna48.json]
// Modulo 6 (crocini di registro), senza Illustrator:
//   A) per ogni sistema e rotolo (600x1646, 1370x3000, 300x200 mm) calcola la disposizione dei crocini e controlla
//      distanze, margini, bordi, numero di crocini intermedi, avvisi, payload per l'host;
//   B) nest VERO (wasm Sparrow, stessa colla no-modules del worker) di insegna48 sulla striscia ridotta da
//      reserve(): nessun pezzo (contorni originali, intersezione poligonale con clipper) nelle zone di rispetto,
//      tutti dentro il telaio dei crocini.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const CLIENT = path.join(__dirname, '..', 'client');
const G = require(path.join(CLIENT, 'js', 'geometry.js'));
const R = require(path.join(CLIENT, 'js', 'regmarks.js'));
const ClipperLib = require(path.join(CLIENT, 'lib', 'clipper.js'));

const SECS = +(process.argv[2] || 2);
const SUITE = process.argv[3] || path.join(__dirname, '..', '..', 'bench', 'suite', 'insegna48.json');
const MM = 72 / 25.4;
const SYSTEMS = ['graphtec', 'summa', 'roland', 'mimaki'];
const ROLLS = [[600, 1646], [1370, 3000], [300, 200]];

let fails = 0, checks = 0, skipped = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  FAIL ' + msg); } }
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

// ---------------------------------------------------------------- A) regole geometriche
console.log('A) disposizione crocini');
ok(R.layout('none', 600, 1000).marks.length === 0, 'none: nessun crocino');
ok(R.reserve('none', 600).nestHeight === 600, 'none: striscia intera');
for (const id of SYSTEMS) {
  const s = R.spec(id);
  for (const [W, Ln] of ROLLS) {
    const res = R.reserve(id, W);
    const L = R.layout(id, W, Ln);
    const errs = R.check(L);
    ok(errs.length === 0, `${id} ${W}x${Ln}: ${errs.join('; ')}`);
    const xs = L.anchorsX, spans = xs.slice(1).map((x, k) => x - xs[k]);
    const expSeg = Math.max(1, Math.ceil(Math.max(Ln, s.minSpan || 0) / s.maxSpan - 1e-9));
    ok(L.segments === expSeg, `${id} ${W}x${Ln}: segmenti ${L.segments} != ${expSeg}`);
    ok(spans.every((d) => d <= s.maxSpan + 1e-9), `${id} ${W}x${Ln}: distanza > max`);
    ok(spans.every((d) => near(d, spans[0])), `${id} ${W}x${Ln}: crocini intermedi non equidistanti`);
    ok(L.marks.length === 2 * (expSeg + 1), `${id} ${W}x${Ln}: ${L.marks.length} crocini`);
    ok(near(L.nestOrigin[0], xs[0]) && near(L.nestOrigin[1], res.band), `${id}: origine del nest`);
    ok(near(L.rollLength, res.startX + Math.max(Ln, s.minSpan || 0) + res.endPad), `${id}: lunghezza rotolo`);
    ok(near(res.nestHeight, W - 2 * res.band), `${id}: altezza striscia`);
    // simmetria lato basso / alto
    const bot = L.marks.filter((m) => m.side === 'bottom'), top = L.marks.filter((m) => m.side === 'top');
    ok(bot.every((m, k) => near(m.box[1], W - top[k].box[3], 1e-9) && near(m.anchor[0], top[k].anchor[0])), `${id}: crocini non simmetrici`);
    // fascia: ogni zona di rispetto sta sotto band (basso) o sopra W - band (alto)
    ok(bot.every((m) => m.keepOut[3] <= res.band + 1e-9) && top.every((m) => m.keepOut[1] >= W - res.band - 1e-9), `${id}: rispetto fuori fascia`);
    // avviso crocini intermedi solo quando servono
    const warnMid = L.warnings.some((w) => w.code === 'rmIntermediate');
    ok(warnMid === (expSeg > 1), `${id} ${W}x${Ln}: avviso intermedi ${warnMid}`);
    // payload host: stesse forme in pt, cerchi solo per Roland
    const org = [1000, -2000], P = R.toDoc(L, org);
    ok(P.marks.length === L.marks.length && P.layer === s.layer && P.printable === (s.printable !== false), `${id}: payload`);
    ok(P.marks.every((m) => (id === 'roland') === !!m.circle), `${id}: forme payload`);
    if (P.marks[0].poly) ok(near(P.marks[0].poly[0][0], org[0] + L.marks[0].poly[0][0] * MM, 1e-9), `${id}: conversione pt`);
    ok(!!P.frame === !!s.guideOnly, `${id}: rettangolo FineCut`);
    // forme: poligoni semplici con l'area attesa
    for (const m of L.marks) {
      if (m.poly) {
        ok(G.isSimple(m.poly), `${id}: poligono crocino non semplice`);
        const a = G.area(m.poly);
        const exp = m.shape === 'square' ? s.size * s.size : m.shape === 'L' ? 2 * (s.size + s.line / 2) * s.line - s.line * s.line : 2 * s.size * s.line - s.line * s.line;
        ok(near(a, exp, 1e-6), `${id} ${m.shape}: area ${a} != ${exp}`);
      }
    }
    console.log(`  ${id.padEnd(8)} ${String(W).padStart(4)}x${String(Ln).padEnd(4)} fascia ${res.band.toFixed(2)} mm, striscia ${res.nestHeight.toFixed(1)} mm, ` +
      `rotolo ${L.rollLength.toFixed(1)} mm (+${(L.rollLength - Ln).toFixed(1)}), ${L.marks.length} crocini, passo ${spans[0].toFixed(1)} mm` +
      (L.warnings.length ? ', avvisi ' + L.warnings.map((w) => w.code).join('/') : ''));
  }
}
// casi limite
{
  const L = R.layout('mimaki', 600, 10);       // job cortissimo: campata minima 50 mm
  ok(near(L.anchorsX[1] - L.anchorsX[0], 50), 'mimaki: campata minima 50 mm');
  const T = R.layout('graphtec', 80, 100);     // rotolo troppo stretto per le fasce
  ok(T.warnings.some((w) => w.code === 'rmTooNarrow') && T.marks.length === 0, 'graphtec 80 mm: avviso rotolo stretto');
  const E = R.layout('summa', 600, 500);       // esattamente il massimo: nessun intermedio
  ok(E.segments === 1, 'summa: 500 mm esatti = 1 segmento');
  const bad = R.check(R.layout('roland', 600, 1000), [[20, 5, 60, 50]]);
  ok(bad.some((e) => /invade/.test(e)), 'check rileva un pezzo nella zona di rispetto');
}

// ---------------------------------------------------------------- B) nest reale sulla striscia ridotta
const suite = JSON.parse(fs.readFileSync(SUITE, 'utf8'));
const DOC_OFFSET = [2400, -1800];
const toDocPt = (r) => r.map(([x, y]) => [x * MM + DOC_OFFSET[0], y * MM + DOC_OFFSET[1]]);
const items = suite.items.map((it, k) => {
  const s = it.shape, rings = [];
  if (s.type === 'simple_polygon') rings.push(s.data);
  else { rings.push(s.data.outer); (s.data.inner || []).forEach((h) => rings.push(h)); }
  return { i: k, name: 'item' + it.id, rings: rings.map(toDocPt) };
});
const GAP_MM = 2, gap = GAP_MM * MM, orient = G.rotationsFor('90');
const pieces = G.buildPieces(items, { gap, flatness: 0.5 });

const glue = fs.readFileSync(path.join(CLIENT, 'lib', 'corvo.js'), 'utf8');
const ctx = { console, TextEncoder, TextDecoder, WebAssembly, performance, BigInt, Error, Symbol, Object, Array,
  Uint8Array, Float32Array, Int32Array, BigInt64Array, DataView, Math, Number, String, JSON, Function, Promise,
  queueMicrotask, setTimeout, Date, crypto: globalThis.crypto };
ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
const wb = vm.runInContext(glue + ';wasm_bindgen;', ctx);

const S = 1000;
const toPath = (r) => r.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
function interArea(pathsA, pathsB) {
  const c = new ClipperLib.Clipper(), out = new ClipperLib.Paths();
  c.AddPaths(pathsA, ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(pathsB, ClipperLib.PolyType.ptClip, true);
  c.Execute(ClipperLib.ClipType.ctIntersection, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out.reduce((s, p) => s + Math.abs(ClipperLib.Clipper.Area(p)), 0) / (S * S);
}

// Sparrow a volte non trova la disposizione iniziale se la striscia e' appena piu' alta del pezzo piu' grande:
// ritorna { error } invece di lanciare, cosi' il test lo registra.
function nest(Hpt) {
  try { return nestRaw(Hpt); } catch (e) { return { error: String(e && e.message || e) }; }
}
function nestRaw(Hpt) {
  const instance = G.buildInstance(pieces, Hpt, orient);
  let best = null;
  wb.nest(JSON.stringify(instance), SECS * 0.8, SECS * 0.2, BigInt(1), gap, (json) => {
    const r = JSON.parse(json);
    if (!best || r.strip_width <= best.strip_width) best = r;
  });
  return best;
}

(async () => {
  await wb({ module_or_path: new Uint8Array(fs.readFileSync(path.join(CLIENT, 'lib', 'corvo_bg.wasm'))) });
  console.log(`B) nest reale ${path.basename(SUITE)} (${pieces.length} pezzi, ${SECS} s per nest, distanza ${GAP_MM} mm)`);
  const TOL_MM = 0.25;                      // i contorni originali possono uscire dal poligono semplificato di <= 0.5 pt
  for (const W of ROLLS.map((r) => r[0])) {
    const fitsAll = (Hpt) => pieces.every((p) => G.minExtent(p.polygon, orient) <= Hpt - 1e-6);
    const base = fitsAll(W * MM) ? nest(W * MM) : null;
    const baseLen = base && !base.error ? base.strip_width / MM : NaN;
    for (const id of SYSTEMS) {
      const res = R.reserve(id, W);
      const Hpt = res.nestHeight * MM;
      const big = pieces.filter((p) => G.minExtent(p.polygon, orient) > Hpt - 1e-6);
      if (big.length) {                      // il pannello rifiuta con "troppo larghi": qui lo registriamo e basta
        console.log(`  ${id.padEnd(8)} ${W} mm: ${big.length} pezzi non entrano nella striscia di ${res.nestHeight.toFixed(1)} mm (rifiutato, come nel pannello)`);
        continue;
      }
      const best = nest(Hpt);
      if (best && best.error) {
        console.log(`  ${id.padEnd(8)} ${W} mm: Sparrow non costruisce la disposizione iniziale (${best.error}) - SALTATO`);
        ok(W < 400, `${id} ${W}: errore di Sparrow su un rotolo largo`);
        skipped++;
        continue;
      }
      ok(!!best && best.placements.length === pieces.length, `${id} ${W}: pezzi piazzati ${best && best.placements.length}/${pieces.length}`);
      if (!best) continue;
      const Lnest = best.strip_width / MM;
      const L = R.layout(id, W, Lnest);
      // contorni originali nel sistema del rotolo (mm): mossa sulla striscia (origine 0) + origine del nest
      const boxes = [], ringsMm = [];
      for (const pl of best.placements) {
        const piece = pieces.find((p) => p.id === pl.item_id);
        const mv = G.placementToMove(pl, piece, [0, 0]);
        const rings = items[piece.id].rings.map((r) => G.applyMove(r, mv).map(([x, y]) => [x / MM + L.nestOrigin[0], y / MM + L.nestOrigin[1]]));
        ringsMm.push(rings);
        const b = G.bbox([].concat(...rings));
        boxes.push([b[0] + TOL_MM, b[1] + TOL_MM, b[2] - TOL_MM, b[3] - TOL_MM]);
      }
      const errs = R.check(L, boxes);
      ok(errs.length === 0, `${id} ${W}: ${errs.slice(0, 3).join('; ')}`);
      let worst = 0;
      for (const m of L.marks) {
        const k = m.keepOut, kp = [toPath([[k[0], k[1]], [k[2], k[1]], [k[2], k[3]], [k[0], k[3]]])];
        for (const rings of ringsMm) worst = Math.max(worst, interArea(rings.map(toPath), kp));
      }
      ok(worst < 0.05, `${id} ${W}: pezzi nelle zone di rispetto, ${worst.toFixed(3)} mm2`);
      console.log(`  ${id.padEnd(8)} ${String(W).padStart(4)} mm: striscia ${res.nestHeight.toFixed(1)} mm, nest ${Lnest.toFixed(0)} mm ` +
        `(senza crocini ${!isNaN(baseLen) ? baseLen.toFixed(0) + ' mm' : 'non entra'}), rotolo ${L.rollLength.toFixed(0)} mm, ${L.marks.length} crocini, ` +
        `max intersezione con i rispetti ${worst.toFixed(3)} mm2`);
    }
  }
  console.log(`${checks} controlli, ${fails} falliti, ${skipped} nest saltati`);
  if (fails) process.exitCode = 1; else console.log('PASS');
})().catch((e) => { console.log('FAIL: ' + (e && e.stack || e)); process.exitCode = 1; });
