// node wasm_run.js <instance.json> <explore_s> <compress_s> <gap>  -> stampa JSON {strip_width, density, n}
const fs = require('fs'), vm = require('vm');
const demo = 'C:/Users/erryb/Desktop/Plugin/wasm/demo';
const glue = fs.readFileSync(demo + '/corvo.js', 'utf8');
const ctx = { console, TextEncoder, TextDecoder, WebAssembly, performance, BigInt, Error, Symbol, Object, Array, Uint8Array, Float32Array, Int32Array, BigInt64Array, DataView, Math, Number, String, JSON, Function, Promise, queueMicrotask, setTimeout, Date, crypto: globalThis.crypto };
ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
const wb = vm.runInContext(glue + ';wasm_bindgen;', ctx);
(async () => {
  await wb({ module_or_path: new Uint8Array(fs.readFileSync(demo + '/corvo_bg.wasm')) });
  const [f, e, c, g] = process.argv.slice(2);
  const t0 = Date.now();
  const sol = JSON.parse(wb.nest(fs.readFileSync(f, 'utf8'), +e, +c, BigInt(1), +g, () => {}));
  console.log(JSON.stringify({ strip_width: sol.strip_width, density: sol.density, n: sol.layout.placed_items.length, wall_s: (Date.now() - t0) / 1000 }));
})().catch(err => { console.log(JSON.stringify({ error: String(err) })); process.exit(1); });
