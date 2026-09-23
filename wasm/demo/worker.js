// Runs sparrow (compiled to WebAssembly) off the main thread.
importScripts('corvo.js');
let ready = wasm_bindgen({ module_or_path: 'corvo_bg.wasm' });
self.onmessage = async (e) => {
  const { instance, exploreSecs, compressSecs, seed, minSeparation } = e.data;
  try {
    await ready;
    const final = wasm_bindgen.nest(
      JSON.stringify(instance), exploreSecs, compressSecs, BigInt(seed), minSeparation,
      (json) => self.postMessage({ type: 'report', report: JSON.parse(json) })
    );
    self.postMessage({ type: 'done', solution: JSON.parse(final) });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
