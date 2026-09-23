/* Corvo nesting worker.
 * Protocol (see docs/plugin-architecture.md):
 *   in : {type:'init', wasm: ArrayBuffer}           -> out {type:'ready'} | {type:'error', message}
 *   in : {type:'nest', instance, exploreSecs, compressSecs, seed, gap}
 *   out: {type:'report', report} (every feasible layout), then {type:'done', solution} | {type:'error', message}
 * The wasm bytes arrive via postMessage because fetch() on file:// does not work in CEP.
 * When the panel builds this worker from a Blob (fallback), the glue is prepended and
 * self.__corvoGlue is set, so importScripts is skipped.
 */
if (!self.__corvoGlue) importScripts('../lib/corvo.js');

var ready = null;

self.onmessage = function (e) {
  var msg = e.data || {};
  if (msg.type === 'init') {
    ready = wasm_bindgen({ module_or_path: msg.wasm });
    ready.then(function () { self.postMessage({ type: 'ready' }); },
               function (err) { self.postMessage({ type: 'error', message: 'wasm init failed: ' + String(err && err.message || err) }); });
    return;
  }
  if (msg.type === 'nest') {
    if (!ready) { self.postMessage({ type: 'error', message: 'worker not initialised' }); return; }
    ready.then(function () {
      try {
        var final = wasm_bindgen.nest(
          JSON.stringify(msg.instance), msg.exploreSecs, msg.compressSecs,
          BigInt(Math.floor(msg.seed || 1)), msg.gap || 0,
          function (json) { self.postMessage({ type: 'report', report: JSON.parse(json) }); }
        );
        self.postMessage({ type: 'done', solution: JSON.parse(final) });
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err && err.message || err) });
      }
    }, function () { /* init error already reported */ });
  }
};
