/* Corvo panel: UI, state, orchestration (docs/plugin-architecture.md, "Contratto pannello").
 *
 * Flow: Nest -> corvoExport -> geometry -> worker(wasm Sparrow) -> reports
 *       every 250 ms: if a newer best layout exists and the host is idle -> corvoApply + corvoRoll
 *       Stop keeps the best layout, Apply -> corvoFinish, Cancel -> corvoRevert.
 */
(function () {
  'use strict';

  var G = window.CorvoGeometry;
  var CL = window.CorvoCluster;
  var RM = window.CorvoRegmarks;       // MODULO 6: crocini di registro (js/regmarks.js)
  var HO = window.CorvoHoles;          // MODULO 2 (pieces inside holes), optional
  var R = window.CorvoRaster;          // MODULO 8 (DTF: immagini -> contorno)
  var LIC = window.CorvoLicense;       // MODULO 9: licenza/prova/edizioni (js/license.js), opzionale
  function m9has(f) { return !LIC || LIC.has(f); }   // MODULO 9
  var Q = window.CorvoQuantity;        // MODULO 3 (copie, coppie specchiate, copie vicine)
  function QP() { return window.CorvoQtyPanel || null; }   // MODULO 3: tabella (quantity-panel.js, caricato dopo)
  var M3 = { cache: null };            // MODULO 3: esportazione di "Leggi selezione", riusata una volta da Nest
  var MM = 72 / 25.4;                  // 1 mm in pt
  var FLATNESS = 0.5;                  // pt, Bezier discretisation + simplification tolerance
  var ROLL_MARGIN_MM = 20;             // strip placed 20 mm below the active artboard
  var LIVE_MS = 250;

  // ---------------------------------------------------------------- strings
  var STR = {
    en: {
      rollWidth: 'Roll width', gap: 'Gap', rotations: 'Rotations', rotNone: 'None', rotFree: 'Free', time: 'Time',
      nest: 'Nest', stop: 'Stop', apply: 'Apply', cancel: 'Cancel',
      length: 'Length', fill: 'Fill', elapsed: 'Time', phase: 'Phase',
      ready: 'Select the pieces and press Nest.',
      exporting: 'Reading the selection…',
      preparing: 'Preparing {n} pieces…',
      loading: 'Starting the nesting engine…',
      running: 'Searching… pieces move live. Stop keeps the best layout.',
      exploration: 'exploring', compression: 'compressing', done: 'finished',
      hullNote: '{n} multi-part piece(s) approximated by their convex hull.',
      doneMsg: 'Finished: {len} mm, fill {fill}%. Apply to keep, Cancel to restore.',
      stoppedMsg: 'Stopped: {len} mm, fill {fill}%. Apply to keep, Cancel to restore.',
      applied: 'Layout applied.',
      reverted: 'Pieces restored to their original position.',
      noSelection: 'Nothing selected: select the pieces to nest in Illustrator.',
      notCep: 'Not running inside Illustrator: the panel needs the CEP host.',
      hostScriptError: 'Illustrator script error (is host/corvo.jsx loaded?).',
      badPieces: 'These pieces have no closed contour: {names}',
      tooBig: 'Too wide for a {w} mm roll: {names}',
      badInput: 'Check the values: roll width > 0, gap ≥ 0, time ≥ 2 s.',
      noLayout: 'Stopped before a first layout was found.',
      workerFallback: 'Web Worker unavailable: running in the panel thread, the panel will freeze until the end.',
      engineError: 'Nesting engine error: {msg}',
      partialApply: '{n} piece(s) could not be moved (locked or deleted?): {msg}',
      shapeSrc: 'Shape used for nesting', shapeAll: 'All artwork', shapeCut: 'Cut line only (CutContour…)',
      merge: 'Merge overlapping objects',
      noteMerged: '{objects} overlapping objects joined into {pieces} piece(s).',
      noteRegMarks: '{n} registration mark(s) left in place.',
      noteSkipped: '{n} hidden or locked object(s) skipped.',
      noteFallback: '{n} piece(s) without a cut line: whole artwork used.',
      noteNoContour: '{n} object(s) without a closed contour left in place.',
      errText: '{n} live text frame(s) define the shape of {names}: convert them with Type > Create Outlines (Shift+Ctrl+O), or choose "Cut line only".',
      errTextCut: '{n} live text frame(s) in {names}, which has no cut line (no CutContour/Thru-cut spot color), so the artwork defines the shape: convert the text with Type > Create Outlines (Shift+Ctrl+O) or add a cut path.',
      errRasterOnly: '{n} image(s) without a vector contour ({names}): place a cut path or a vector shape over them, or select them together with it.',
      errAllExcluded: 'All {n} selected object(s) are hidden or locked.',
      errNothing: 'Nothing to nest: the selection only contains registration marks or open lines.',
      noteProcessCut: 'Warning: the swatch "{names}" is a process colour, not a spot colour: the cutter/RIP will PRINT it instead of cutting. Set Color Type to Spot Color in Swatch Options.',
      noteSheetFrame: '{n} sheet frame(s) or background(s) around several pieces ({names}) left in place. To move a whole sheet, group it first (Ctrl+G).',
      noteLockedFrame: 'The {names} cut frame on the locked layer "{layers}" stays in place (Corvo never unlocks layers).',
      errLockedCut: '{n} cut line(s) ({names}) on the locked or hidden layer "{layers}" belong to the selected pieces: they would stay behind while the artwork moves. Unlock and show the layer "{layers}" (Corvo never does it for you), select the cut lines too and press Nest again.',
      // MODULO 6
      regmarks: 'Reg. marks', rmNone: 'None',
      rmTooNarrow: 'Roll too narrow for the {sys} marks: {band} mm per side are reserved.',
      rmIntermediate: 'Job {len} mm longer than {max} mm: {n} intermediate mark pair(s) added.',
      rmCrossTooWide: 'Marks {d} mm apart across the roll: the maximum is {max} mm.',
      rmCrossTooNarrow: 'Marks {d} mm apart across the roll: the minimum is {min} mm.',
      rmFineCut: 'Mimaki: FineCut reads only its own marks. Select Corvo_FineCut_Area and create the marks in FineCut.',
      rmMaterial: 'Marks: black on white matte media only (no clear, glossy or coloured media).',
      rmError: 'Registration marks not drawn: {msg}',
      useHoles: 'Use holes', holesNote: '{n} piece(s) placed inside holes.',   // MODULO 2
      // MODULO 8
      preset: 'Preset', presetCustom: 'Custom', images: 'Images', imgContour: 'Contour', imgBbox: 'Bounding box',
      rasterNoAlpha: 'No real transparency, nested as a rectangle: {names}.',
      rasterNoEngine: 'Images selected but raster.js is not loaded.',
      // MODULO 3
      qtyTitle: 'Copies & mirrored pairs', qtyLoad: 'Read selection', qtySetAll: 'All', qtyPiece: 'Piece', qtyQty: 'Qty',
      qtyMirror: 'L+R', qtyMirrorTip: 'Mirrored pair: also cut a mirrored copy of every copy (left/right)',
      qtyClose: 'Keep copies of the same design together', qtyEmpty: 'Press "Read selection" (or Nest) to list the pieces.',
      qtyPieceN: 'Piece {n}', qtySum: '{n} piece(s) -> {total} to cut ({m} mirrored).',
      qtyLoaded: '{n} piece(s) read: set the copies and press Nest.',
      qtyNote: '{n} copies added ({m} mirrored): outlines until Apply.',
      qtyCells: '{n} group(s) of copies kept together.',
      qtyApplied: '{n} copies created.', qtyCopyErrors: '{n} copies could not be created: {msg}'
    },
    it: {
      rollWidth: 'Larghezza rotolo', gap: 'Distanza', rotations: 'Rotazioni', rotNone: 'Nessuna', rotFree: 'Libera', time: 'Tempo',
      nest: 'Nest', stop: 'Stop', apply: 'Applica', cancel: 'Annulla',
      length: 'Lunghezza', fill: 'Riempimento', elapsed: 'Tempo', phase: 'Fase',
      ready: 'Seleziona i pezzi e premi Nest.',
      exporting: 'Lettura della selezione…',
      preparing: 'Preparazione di {n} pezzi…',
      loading: 'Avvio del motore di nesting…',
      running: 'Ricerca in corso… i pezzi si muovono dal vivo. Stop tiene il migliore.',
      exploration: 'esplorazione', compression: 'compressione', done: 'finito',
      hullNote: '{n} pezzi in più parti approssimati con l\'inviluppo convesso.',
      doneMsg: 'Finito: {len} mm, riempimento {fill}%. Applica per tenere, Annulla per ripristinare.',
      stoppedMsg: 'Fermato: {len} mm, riempimento {fill}%. Applica per tenere, Annulla per ripristinare.',
      applied: 'Disposizione applicata.',
      reverted: 'Pezzi riportati nella posizione originale.',
      noSelection: 'Nessuna selezione: seleziona in Illustrator i pezzi da disporre.',
      notCep: 'Il pannello non gira dentro Illustrator: serve l\'host CEP.',
      hostScriptError: 'Errore nello script di Illustrator (host/corvo.jsx è caricato?).',
      badPieces: 'Questi pezzi non hanno un contorno chiuso: {names}',
      tooBig: 'Troppo larghi per un rotolo da {w} mm: {names}',
      badInput: 'Controlla i valori: larghezza > 0, distanza ≥ 0, tempo ≥ 2 s.',
      noLayout: 'Fermato prima di trovare una prima disposizione.',
      workerFallback: 'Web Worker non disponibile: il calcolo gira nel pannello, che resterà bloccato fino alla fine.',
      engineError: 'Errore del motore di nesting: {msg}',
      partialApply: '{n} pezzi non si possono spostare (bloccati o cancellati?): {msg}',
      shapeSrc: 'Forma di ingombro', shapeAll: 'Tutto il disegno', shapeCut: 'Solo linea di taglio (CutContour…)',
      merge: 'Unisci oggetti sovrapposti',
      noteMerged: '{objects} oggetti sovrapposti uniti in {pieces} pezzi.',
      noteRegMarks: '{n} crocini di registro lasciati al loro posto.',
      noteSkipped: '{n} oggetti nascosti o bloccati ignorati.',
      noteFallback: '{n} pezzi senza linea di taglio: uso tutto il disegno.',
      noteNoContour: '{n} oggetti senza contorno chiuso lasciati al loro posto.',
      errText: '{n} cornici di testo vivo definiscono la forma di {names}: convertile con Testo > Crea contorni (Maiusc+Ctrl+O) oppure scegli "Solo linea di taglio".',
      errTextCut: '{n} cornici di testo vivo in {names}, che non ha una linea di taglio (nessuna tinta CutContour/Thru-cut), quindi la forma è il disegno: converti il testo con Testo > Crea contorni (Maiusc+Ctrl+O) o aggiungi un tracciato di taglio.',
      errRasterOnly: '{n} immagini senza contorno vettoriale ({names}): mettici sopra un tracciato di taglio o una forma vettoriale, o selezionale insieme.',
      errAllExcluded: 'Tutti i {n} oggetti selezionati sono nascosti o bloccati.',
      errNothing: 'Niente da disporre: la selezione contiene solo crocini di registro o linee aperte.',
      noteProcessCut: 'Attenzione: il campione «{names}» è in quadricromia, non in tinta piatta: il plotter/RIP lo STAMPERÀ invece di tagliarlo. In Opzioni campione imposta Tipo di colore = Tinta piatta.',
      noteSheetFrame: '{n} cornici o sfondi del foglio attorno a più pezzi ({names}) lasciati al loro posto. Per spostare un foglio intero raggruppalo prima (Ctrl+G).',
      noteLockedFrame: 'La cornice di taglio {names} sul livello bloccato «{layers}» resta al suo posto (Corvo non sblocca mai i livelli).',
      errLockedCut: '{n} linee di taglio ({names}) sul livello bloccato o nascosto «{layers}» appartengono ai pezzi selezionati: resterebbero ferme mentre la stampa si sposta. Sblocca e mostra il livello «{layers}» (Corvo non lo fa da solo), seleziona anche le linee di taglio e ripremi Nest.',
      // MODULO 6
      regmarks: 'Crocini', rmNone: 'Nessuno',
      rmTooNarrow: 'Rotolo troppo stretto per i crocini {sys}: servono {band} mm per lato.',
      rmIntermediate: 'Lavoro di {len} mm oltre i {max} mm: aggiunte {n} coppie di crocini intermedi.',
      rmCrossTooWide: 'Crocini a {d} mm sulla larghezza: il massimo è {max} mm.',
      rmCrossTooNarrow: 'Crocini a {d} mm sulla larghezza: il minimo è {min} mm.',
      rmFineCut: 'Mimaki: FineCut legge solo i suoi crocini. Seleziona Corvo_FineCut_Area e crea i crocini con FineCut.',
      rmMaterial: 'Crocini: solo nero su materiale bianco opaco (niente trasparenti, lucidi o colorati).',
      rmError: 'Crocini non disegnati: {msg}',
      useHoles: 'Usa i fori', holesNote: '{n} pezzi nei fori.',   // MODULO 2
      // MODULO 8
      preset: 'Preset', presetCustom: 'Personalizzato', images: 'Immagini', imgContour: 'Contorno', imgBbox: 'Rettangolo',
      rasterNoAlpha: 'Nessuna trasparenza reale, disposte come rettangolo: {names}.',
      rasterNoEngine: 'Immagini selezionate ma raster.js non è caricato.',
      // MODULO 3
      qtyTitle: 'Copie e coppie specchiate', qtyLoad: 'Leggi selezione', qtySetAll: 'Tutti', qtyPiece: 'Pezzo', qtyQty: 'Copie',
      qtyMirror: 'S+D', qtyMirrorTip: 'Coppia specchiata: taglia anche una copia specchiata di ogni copia (sinistra/destra)',
      qtyClose: 'Tieni vicine le copie dello stesso design', qtyEmpty: 'Premi "Leggi selezione" (o Nest) per elencare i pezzi.',
      qtyPieceN: 'Pezzo {n}', qtySum: '{n} pezzi -> {total} da tagliare ({m} specchiati).',
      qtyLoaded: '{n} pezzi letti: imposta le copie e premi Nest.',
      qtyNote: '{n} copie aggiunte ({m} specchiate): sagome fino ad Applica.',
      qtyCells: '{n} gruppi di copie tenuti vicini.',
      qtyApplied: '{n} copie create.', qtyCopyErrors: '{n} copie non create: {msg}'
    }
  };
  var lang = 'en';
  try { lang = localStorage.getItem('corvo.lang') === 'it' ? 'it' : 'en'; } catch (e) { /* storage blocked */ }

  function t(key, vars) {
    var s = (STR[lang] && STR[lang][key]) || STR.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
    return s;
  }
  function applyLang() {
    document.documentElement.lang = lang;
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var k = els[i].getAttribute('data-i18n');
      if (k === 'ready' && lastStatus.key !== 'ready') continue;
      els[i].textContent = t(k);
    }
    $('btnLang').textContent = lang.toUpperCase();
    if (lastStatus.key) setStatus(lastStatus.key, lastStatus.vars, lastStatus.kind);
    if (S.phase) $('sPhase').textContent = t(S.phase);
  }

  // ---------------------------------------------------------------- DOM helpers
  function $(id) { return document.getElementById(id); }
  var lastStatus = { key: 'ready' };
  function setStatus(key, vars, kind, extra) {
    lastStatus = { key: key, vars: vars, kind: kind };
    var el = $('status');
    el.textContent = t(key, vars) + (extra ? ' ' + extra : '');
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  function setError(err) {
    var msg = String(err && err.message || err);
    lastStatus = { key: null };
    $('status').textContent = msg;
    $('status').className = 'status error';
  }
  function fmt(v, d) { return (+v).toFixed(d === undefined ? 0 : d); }

  // ---------------------------------------------------------------- host bridge (serialised)
  var cs = null;
  try { if (window.__adobe_cep__ && typeof CSInterface === 'function') cs = new CSInterface(); } catch (e) { cs = null; }

  var hostChain = Promise.resolve();
  var hostBusy = 0;

  function evalHost(script) {
    return new Promise(function (resolve, reject) {
      if (!cs) { reject(new Error(t('notCep'))); return; }
      cs.evalScript(script, function (res) { resolve(res); });
    });
  }
  function parseHost(res) {
    if (res === undefined || res === null || res === '' || res === 'EvalScript error.') throw new Error(t('hostScriptError'));
    var obj;
    try { obj = JSON.parse(res); } catch (e) { throw new Error(t('hostScriptError') + ' ' + String(res).slice(0, 200)); }
    if (obj && obj.error) {
      var key = obj.code ? 'err' + obj.code.charAt(0).toUpperCase() + obj.code.slice(1) : null;
      throw new Error(key && STR.en[key] ? t(key, obj) : String(obj.error));
    }
    return obj;
  }
  // fn(arg) with arg passed as a JSON string literal; calls never overlap
  function hostCall(fn, arg) {
    return hostScript(fn + '(' + (arg === undefined ? '' : JSON.stringify(JSON.stringify(arg))) + ')');
  }
  function hostScript(script) {       // MODULO 6: anche script arbitrari, stessa coda
    hostBusy++;
    var p = hostChain.then(function () { return evalHost(script); }).then(parseHost);
    hostChain = p.then(done, done);
    function done() { hostBusy--; }
    return p;
  }
  function hostIdle() { return hostChain; }

  // ---------------------------------------------------------------- files (CEP: fs, browser: fetch)
  var nodeFs = null;
  try { if (typeof require === 'function' && location.protocol === 'file:') nodeFs = require('fs'); } catch (e) { nodeFs = null; }
  var baseDir = decodeURIComponent(location.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\/[^\/]*$/, '');

  function readBytes(rel) {
    if (nodeFs) {
      var buf = nodeFs.readFileSync(baseDir + '/' + rel);
      return Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    }
    return fetch(rel).then(function (r) { if (!r.ok) throw new Error(rel + ': HTTP ' + r.status); return r.arrayBuffer(); });
  }
  function readText(rel) {
    if (nodeFs) return Promise.resolve(nodeFs.readFileSync(baseDir + '/' + rel, 'utf8'));
    return fetch(rel).then(function (r) { if (!r.ok) throw new Error(rel + ': HTTP ' + r.status); return r.text(); });
  }

  var wasmBytes = null;
  function getWasm() {
    if (wasmBytes) return Promise.resolve(wasmBytes);
    return readBytes('lib/corvo_bg.wasm').then(function (b) { wasmBytes = b; return b; });
  }

  // ---------------------------------------------------------------- engine (worker, blob worker, inline)
  function initWorker(worker) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { cleanup(); reject(new Error('worker init timeout')); }, 15000);
      function cleanup() { clearTimeout(timer); worker.onmessage = null; worker.onerror = null; }
      worker.onmessage = function (e) {
        if (e.data && e.data.type === 'ready') { cleanup(); resolve(worker); }
        else if (e.data && e.data.type === 'error') { cleanup(); reject(new Error(e.data.message)); }
      };
      worker.onerror = function (ev) { cleanup(); if (ev && ev.preventDefault) ev.preventDefault(); reject(new Error((ev && ev.message) || 'worker error')); };
      getWasm().then(function (bytes) {
        var copy = bytes.slice(0);
        worker.postMessage({ type: 'init', wasm: copy }, [copy]);
      }, function (err) { cleanup(); reject(err); });
    });
  }
  function fileWorker() {
    var w;
    try { w = new Worker('js/worker.js'); } catch (e) { return Promise.reject(e); }
    return initWorker(w).catch(function (err) { w.terminate(); throw err; });
  }
  function blobWorker() {
    return Promise.all([readText('lib/corvo.js'), readText('js/worker.js')]).then(function (src) {
      var code = 'self.__corvoGlue = true;\n' + src[0] + '\n;self.wasm_bindgen = wasm_bindgen;\n' + src[1];
      var url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      var w = new Worker(url);
      return initWorker(w).catch(function (err) { w.terminate(); throw err; });
    });
  }
  function startEngine() {
    return fileWorker().catch(function (e1) {
      console.warn('[corvo] file worker failed, trying blob worker:', e1);
      return blobWorker();
    }).then(function (w) { return { kind: 'worker', worker: w }; }, function (e2) {
      console.warn('[corvo] blob worker failed, running inline:', e2);
      return { kind: 'inline' };
    });
  }

  var inlineReady = null;
  function inlineNest(msg, onMessage) {
    if (!inlineReady) {
      inlineReady = readText('lib/corvo.js').then(function (src) {
        (0, eval)(src + '\n;window.wasm_bindgen = wasm_bindgen;');
        return getWasm();
      }).then(function (bytes) { return window.wasm_bindgen({ module_or_path: bytes.slice(0) }); });
    }
    inlineReady.then(function () {
      setTimeout(function () {       // let the warning paint before blocking the thread
        try {
          var fin = window.wasm_bindgen.nest(JSON.stringify(msg.instance), msg.exploreSecs, msg.compressSecs,
            BigInt(msg.seed), msg.gap, function (json) { onMessage({ type: 'report', report: JSON.parse(json) }); });
          onMessage({ type: 'done', solution: JSON.parse(fin) });
        } catch (err) { onMessage({ type: 'error', message: String(err && err.message || err) }); }
      }, 50);
    }, function (err) { onMessage({ type: 'error', message: String(err && err.message || err) }); });
  }

  // ---------------------------------------------------------------- session state
  // state: idle | preparing | running | review | busy
  var S = { state: 'idle', session: false };

  function setState(st) {
    S.state = st;
    var running = st === 'running', review = st === 'review';
    $('btnNest').disabled = st !== 'idle';
    $('btnStop').disabled = !running;
    $('btnApply').disabled = !(running || review);
    $('btnCancel').disabled = !(running || review || st === 'preparing');
    // MODULO 8: + preset, rasterMode
    ['rollWidth', 'gap', 'rotations', 'time', 'shapeSrc', 'merge', 'regmarks', 'preset', 'rasterMode'].forEach(function (id) { $(id).disabled = st !== 'idle'; });
    if ($('useHoles')) $('useHoles').disabled = st !== 'idle' || !m9has('holes');   // MODULO 2 + MODULO 9 (Pro)
    if (QP()) QP().setEnabled(st === 'idle');                     // MODULO 3
  }

  function readParams() {
    var p = {
      rollMm: parseFloat($('rollWidth').value),
      gapMm: parseFloat($('gap').value),
      rot: $('rotations').value,
      time: parseFloat($('time').value),
      shape: $('shapeSrc').value === 'cut' ? 'cut' : 'all',
      merge: !!$('merge').checked,
      rm: ($('regmarks') && $('regmarks').value) || 'none',     // MODULO 6
      holes: !!($('useHoles') && $('useHoles').checked) && m9has('holes'),  // MODULO 2 + MODULO 9 (Pro)
      rasterMode: $('rasterMode').value           // MODULO 8
    };
    try { localStorage.setItem('corvo.opts', JSON.stringify({ shape: p.shape, merge: p.merge })); } catch (e) { /* storage blocked */ }
    try { localStorage.setItem('corvo.holes', p.holes ? '1' : '0'); } catch (e) { /* storage blocked */ }   // MODULO 2
    if (!(p.rollMm > 0) || !(p.gapMm >= 0) || !(p.time >= 2)) throw new Error(t('badInput'));
    return p;
  }

  function resetStats() {
    $('sLength').textContent = '–'; $('sFill').textContent = '–';
    $('sElapsed').textContent = '–'; $('sPhase').textContent = '–';
    $('fillBarFill').style.width = '0%'; $('timeBarFill').style.width = '0%';
    S.phase = null;
  }

  function density(rep) { return rep ? S.areaSum / (rep.strip_width * S.H) : 0; }

  function renderStats() {
    var b = S.best;
    if (b) {
      var d = density(b);
      $('sLength').textContent = fmt(b.strip_width / MM, 0) + ' mm';
      $('sFill').textContent = fmt(d * 100, 1) + ' %';
      $('fillBarFill').style.width = Math.max(0, Math.min(100, d * 100)) + '%';
      if (window.CorvoReportPanel) window.CorvoReportPanel.update(b);   // MODULO 5: live material/cost report
    }
    if (S.t0) {
      var el = ((S.tEnd || Date.now()) - S.t0) / 1000;
      $('sElapsed').textContent = fmt(el, 1) + ' / ' + fmt(S.budget, 0) + ' s';
      $('timeBarFill').style.width = Math.min(100, el / S.budget * 100) + '%';
    }
    if (S.phase) $('sPhase').textContent = t(S.phase);
  }

  function movesFor(rep) {
    if (HO) return HO.movesFor(rep.placements, S.nestPieces, S.origin, S.holes);   // MODULO 2: + children in holes
    var out = [];
    for (var k = 0; k < rep.placements.length; k++) {
      var pl = rep.placements[k], piece = S.pieceById[pl.item_id];
      if (piece) out.push(G.placementToMove(pl, piece, S.origin));
    }
    return out;
  }

  // push the current best layout to Illustrator (at most one in flight)
  function pushBest() {
    var rep = S.best;
    if (!rep || rep === S.lastSent) return Promise.resolve();
    S.lastSent = rep;
    S.pushing = true;
    var calls = [hostCall('corvoApply', movesFor(rep))];
    if (rep.strip_width !== S.lastRollW) {
      S.lastRollW = rep.strip_width;
      calls.push(hostCall('corvoRoll', rollRect(rep)));     // MODULO 6: rotolo intero, crocini compresi
    }
    return Promise.all(calls).then(function (res) {
      S.pushing = false;
      var ap = res[0];                 // partial failure (locked / deleted piece): the rest is applied, tell the user
      if (ap && ap.ok === false && ap.errors && ap.errors.length && !S.warned) {
        S.warned = true;
        setStatus('partialApply', { msg: ap.errors[0], n: ap.errors.length }, 'warn');
      }
    }, function (err) {
      S.pushing = false;
      if (S.state === 'running') failSession(err);   // e.g. the document was closed: stop the search
      else setError(err);
      throw err;
    });
  }

  // ---------------------------------------------------------------- MODULO 3: copie e coppie specchiate
  // corvoExport, oppure l'esportazione di "Leggi selezione" se la selezione non e' cambiata (firma veloce: tipo +
  // ingombro di ogni oggetto): sui file densi l'esportazione costa minuti, non va fatta due volte. Usata una volta sola.
  function m3Export() {
    var c = M3.cache;
    M3.cache = null;
    function fresh() { return hostCall('corvoExport', { flatness: FLATNESS, raster: true }); }
    if (!c) return fresh();
    return hostCall('corvoM3SelSig').then(function (r) { return r && r.sig === c.sig ? c.exp : fresh(); }, fresh);
  }
  // sagome delle copie nell'host (indici base + k), prima del primo corvoApply
  function m3Ghosts() {
    if (!S.qx || !S.qx.copies.length) return Promise.resolve();
    var r2 = function (v) { return Math.round(v * 100) / 100; };
    return hostCall('corvoM3Ghosts', { base: S.qx.base, copies: S.qx.copies.map(function (c) {
      return { src: c.src, mirror: c.mirror, axis: c.axis, ring: c.ring.map(function (q) { return [r2(q[0]), r2(q[1])]; }) };
    }) });
  }
  // "Leggi selezione": esporta e raggruppa (modulo 1) solo per riempire la tabella; nessuna sessione, nulla si muove
  function m3Load() {
    if (S.state !== 'idle' || !QP()) return;
    var p;
    try { p = readParams(); } catch (e) { setError(e); return; }
    setState('busy');
    setStatus('exporting');
    M3.cache = null;
    hostCall('corvoExport', { flatness: FLATNESS, raster: true }).then(function (exp) {
      var keep = JSON.parse(JSON.stringify(exp));   // Nest la riusa intatta (raster.prepareItems lavora sulla copia)
      var items = (exp && exp.items) || [];
      if (!items.length) throw new Error(t('noSelection'));
      if (items.some(function (x) { return x.raster; })) {
        if (!R) throw new Error(t('rasterNoEngine'));
        items = R.prepareItems(items, { mode: p.rasterMode, offset: R.SAFETY_MM * MM }).items;
      }
      var doc = exp.doc || {};
      var plan = CL.planPieces(items, { merge: p.merge, shape: p.shape, artboards: doc.artboards || [], lockedCuts: exp.lockedCuts || [] });
      if (!plan.pieces.length) throw new Error(t('errNothing'));   // altri errori del piano: li mostra Nest
      QP().fill(plan.pieces);
      if ($('m3')) $('m3').open = true;
      return hostCall('corvoM3SelSig').then(function (r) {
        M3.cache = { sig: r && r.sig, exp: keep };
        setState('idle');
        setStatus('qtyLoaded', { n: plan.pieces.length }, 'ok');
      });
    }).catch(function (err) { setState('idle'); setError(err); });
  }

  // ---------------------------------------------------------------- MODULO 6: crocini di registro
  function rmActive() { return !!(RM && S.rm && S.rm.id !== 'none'); }
  function rmLayout(rep) { return RM.layout(S.rm.id, S.rm.rollMm, rep.strip_width / MM); }
  // lunghezza del materiale usato: nest + margini dei crocini
  function rollLengthMm(rep) { return rmActive() ? rmLayout(rep).rollLength : rep.strip_width / MM; }
  function rollRect(rep) {
    if (!rmActive()) return { ox: S.origin[0], oy: S.origin[1], w: rep.strip_width, h: S.H };
    return { ox: S.rollOrigin[0], oy: S.rollOrigin[1], w: rollLengthMm(rep) * MM, h: S.rm.rollMm * MM };
  }
  function rmHostPath() { return baseDir.replace(/\/client$/, '') + '/host/regmarks.jsx'; }
  // disegna i crocini del layout migliore; ritorna (promessa) il testo degli avvisi
  function drawRegmarks() {
    if (!rmActive() || !S.best) return Promise.resolve('');
    var L = rmLayout(S.best), notes = [t('rmMaterial')];
    L.warnings.forEach(function (w) {
      var v = w.vars || {};
      if (w.code === 'rmTooNarrow') v.sys = RM.spec(L.id).label;
      notes.push(t(w.code, v));
    });
    var payload = RM.toDoc(L, S.rollOrigin);
    var script = '(function(){if(typeof corvoRegmarks!=="function"){$.evalFile(new File(' + JSON.stringify(rmHostPath()) + '));}' +
      'return corvoRegmarks(' + JSON.stringify(JSON.stringify(payload)) + ');})()';
    return hostScript(script).then(function () { return notes.join(' '); },
      function (err) { return t('rmError', { msg: String(err && err.message || err) }); });
  }
  // prima di corvoRevert: la sessione conosce ancora il suo documento
  function clearRegmarks() {
    if (!RM) return Promise.resolve();
    return hostScript('(typeof corvoRegmarksClear==="function")?corvoRegmarksClear():"{}"')
      .catch(function () { /* niente crocini da togliere */ });
  }
  function fillRegmarksSelect() {
    var sel = $('regmarks');
    if (!sel || !RM) return;
    var cur = sel.value || 'none';
    try { cur = localStorage.getItem('corvo.regmarks') || cur; } catch (e) { /* storage blocked */ }
    sel.innerHTML = '';
    RM.ORDER.forEach(function (id) {
      var o = document.createElement('option');
      o.value = id;
      o.textContent = id === 'none' ? t('rmNone') : RM.SPECS[id].label;
      sel.appendChild(o);
    });
    sel.value = RM.SPECS[cur] ? cur : 'none';
  }

  function liveTick() {
    renderStats();
    if (S.state !== 'running' || S.pushing || hostBusy) return;
    if (S.best && S.best !== S.lastSent) pushBest().catch(function () { /* shown */ });
  }

  function onEngineMessage(m) {
    if (!m || S.runId !== m._run) return;
    if (m.type === 'report') {
      var r = m.report;
      if (S.wrap) r.placements = Q.expandPlacements(r.placements, S.wrap);   // MODULO 3: demand / cells -> pieces
      S.phase = r.phase || S.phase;
      if (!S.best || r.strip_width <= S.best.strip_width) S.best = r;
      if (S.state === 'running' && lastStatus.key === 'loading') setStatus('running', null, null, S.note);
    } else if (m.type === 'done') {
      S.phase = 'done';
      finishSearch('doneMsg');
    } else if (m.type === 'error') {
      failSession(new Error(t('engineError', { msg: m.message })));
    }
  }

  function stopEngine() {
    if (S.engine && S.engine.worker) S.engine.worker.terminate();
    S.engine = null;
    S.runId = null;
    if (S.loop) { clearInterval(S.loop); S.loop = null; }
    S.tEnd = S.tEnd || Date.now();
  }

  // search over (done or stopped): show the best layout and wait for Apply/Cancel
  function finishSearch(msgKey) {
    if (S.state !== 'running') return;
    stopEngine();
    renderStats();
    if (!S.best) {
      setStatus('noLayout', null, 'warn');
      revert();
      return;
    }
    setState('review');
    hostIdle().then(pushBest).then(drawRegmarks).then(function (note) {   // MODULO 6: anteprima crocini
      setStatus(msgKey, { len: fmt(rollLengthMm(S.best), 0), fill: fmt(density(S.best) * 100, 1) }, note ? 'warn' : 'ok',
        [S.note, note].filter(Boolean).join(' '));
    }, function () { /* error already shown */ });
  }

  function failSession(err) {
    stopEngine();
    var hadSession = S.session;
    setState('busy');
    var p = hadSession ? hostIdle().then(clearRegmarks).then(function () { return hostCall('corvoRevert'); }) : Promise.resolve();
    p.catch(function () { /* keep the original error */ }).then(function () {
      S.session = false;
      if (window.CorvoReportPanel) window.CorvoReportPanel.clear();   // MODULO 5
      setState('idle');
      setError(err);
    });
  }

  function nest() {
    if (S.state !== 'idle') return;
    var p;
    try { p = readParams(); } catch (e) { setError(e); return; }
    resetStats();
    S = { state: 'preparing', session: false, best: null, lastSent: null, lastRollW: null, pushing: false };
    var me = S;                        // guards against a Cancel + new Nest while this one is pending
    setState('preparing');
    setStatus('exporting');

    // MODULO 6: i crocini riservano due fasce laterali e un margine di testa -> striscia del nest ridotta
    var rmRes = RM ? RM.reserve(p.rm, p.rollMm) : { id: 'none', nestHeight: p.rollMm, offset: [0, 0], band: 0 };
    if (!(rmRes.nestHeight > 0)) {
      S.state = 'idle'; setState('idle');
      setError(t('rmTooNarrow', { sys: RM.spec(p.rm).label, band: fmt(rmRes.band, 1) }));
      return;
    }
    var H = rmRes.nestHeight * MM, gapPt = p.gapMm * MM, orient = G.rotationsFor(p.rot);
    m3Export().then(function (exp) {   // MODULO 8: raster (MODULO 3: corvoExport, o quella di "Leggi selezione")
      if (S !== me || S.state !== 'preparing') return;
      S.session = true;
      var items = (exp && exp.items) || [];
      if (!items.length) throw new Error(t('noSelection'));
      var doc = exp.doc || {};

      // MODULO 8: immagini (PlacedItem/RasterItem) -> contorno dalla trasparenza (client/js/raster.js), PRIMA del
      // raggruppamento del modulo 1: l'immagine diventa un oggetto con anelli e si unisce alla sua linea di taglio
      var rasterNote = '';
      if (items.some(function (x) { return x.raster; })) {
        if (!R) throw new Error(t('rasterNoEngine'));
        var rr = R.prepareItems(items, { mode: p.rasterMode, offset: R.SAFETY_MM * MM });
        items = rr.items;
        if (rr.warnings.length) rasterNote = t('rasterNoAlpha', { names: rr.warnings.map(function (x) { return x.name || '?'; }).join(', ') });
      }

      // module 1: registration marks, overlapping objects -> one piece, shape from the cut line
      var plan = CL.planPieces(items, { merge: p.merge, shape: p.shape, artboards: doc.artboards || [], lockedCuts: exp.lockedCuts || [] });
      if (plan.error) {
        var en = plan.error.names || [];
        throw new Error(t({ text: p.shape === 'cut' ? 'errTextCut' : 'errText', lockedCut: 'errLockedCut' }[plan.error.code] || 'errRasterOnly',
          { n: plan.error.n, names: en.slice(0, 3).join(', ') + (en.length > 3 ? '…' : ''), layers: (plan.error.layers || []).join(', ') }));
      }
      if (!plan.pieces.length) throw new Error(t('errNothing'));
      var notes = [], w = plan.warnings, skipped = (exp.excluded || []).length;
      if (w.merged.pieces) notes.push(t('noteMerged', w.merged));
      if (exp.processCuts && exp.processCuts.length) notes.unshift(t('noteProcessCut', { names: exp.processCuts.join(', ') }));
      if (w.regMarks) notes.push(t('noteRegMarks', { n: w.regMarks }));
      if (w.sheetFrames) notes.push(t('noteSheetFrame', { n: w.sheetFrames, names: w.sheetFrameNames.slice(0, 2).join(', ') }));
      if (w.lockedFrames) notes.push(t('noteLockedFrame', { names: w.lockedFrames.spots.join(', '), layers: w.lockedFrames.layers.join(', ') }));
      if (skipped) notes.push(t('noteSkipped', { n: skipped }));
      if (w.cutFallback) notes.push(t('noteFallback', { n: w.cutFallback }));
      if (w.noContour) notes.push(t('noteNoContour', { n: w.noContour }));
      if (rasterNote) notes.push(rasterNote);   // MODULO 8
      S.plan = plan;
      if (QP()) QP().fill(plan.pieces);   // MODULO 3: tabella delle copie
      setStatus('preparing', { n: plan.pieces.length });
      return hostCall('corvoGroup', plan.pieces.map(function (x) { return x.members; })).then(function () {
        return { items: plan.pieces, notes: notes, doc: doc };
      });
    }).then(function (pl) {
      if (!pl || S !== me || S.state !== 'preparing') return;
      var items = pl.items, doc = pl.doc;
      var pieces = G.buildPieces(items, { gap: gapPt, flatness: FLATNESS });
      // pieces whose rings are all degenerate (below minRingArea: specks, zero-area closed paths) stay in place
      var bad = pieces.filter(function (x) { return x.error; });
      if (bad.length === pieces.length) throw new Error(t('badPieces', { names: bad.map(function (x) { return x.name; }).slice(0, 5).join(', ') }));
      if (bad.length) {
        // the engine wants consecutive ids 0..n-1: renumber, keep the host piece index for corvoApply
        pieces = pieces.filter(function (x) { return !x.error; });
        pieces.forEach(function (x, k) { x.hostI = x.id; x.id = k; });
        pl.notes.push(t('noteNoContour', { n: bad.length }));
      }
      // MODULO 3: copie e coppie specchiate VIRTUALI (sagome nell'host agli indici base + k) fino ad Applica
      var qs = QP() ? QP().spec(items) : null;
      S.qx = (Q && qs && qs.any) ? Q.expand(items, pieces, qs, { base: items.length }) : null;
      if (S.qx && S.qx.extra) {
        items = S.qx.items; pieces = S.qx.pieces;
        pl.notes.push(t('qtyNote', { n: S.qx.extra, m: S.qx.mirrored }));
      } else S.qx = null;
      S.keepClose = !!(qs && qs.keepClose);
      var big = pieces.filter(function (x) { return G.minExtent(x.polygon, orient) > H - 1e-6; });
      if (big.length) throw new Error(t('tooBig', { w: fmt(rmRes.nestHeight), names: big.map(function (x) { return x.name; }).join(', ') }));
      var hulls = pieces.filter(function (x) { return /hull/.test(x.method) && x.parts > 1; }).length;

      S.H = H;
      // MODULO 6: rollOrigin = angolo del rotolo intero; origin = angolo della striscia del nest
      S.rm = { id: rmRes.id, rollMm: p.rollMm };
      S.rollOrigin = [+doc.abLeft || 0, (+doc.abBottom || 0) - ROLL_MARGIN_MM * MM - p.rollMm * MM];
      S.origin = [S.rollOrigin[0] + rmRes.offset[0] * MM, S.rollOrigin[1] + rmRes.offset[1] * MM];
      S.pieces = pieces;
      S.m9Count = pieces.length;   // MODULO 9: pezzi che Applica spostera' (limite dopo la prova)
      S.pieceById = {};
      pieces.forEach(function (x) { S.pieceById[x.id] = x; });
      S.areaSum = pieces.reduce(function (s, x) { return s + x.area; }, 0);
      S.budget = p.time;
      if (hulls) pl.notes.push(t('hullNote', { n: hulls }));
      S.note = pl.notes.join(' ');

      // MODULO 2: small pieces inside the holes of big ones; children travel with their parent (one Sparrow item)
      S.holes = (HO && p.holes) ? HO.planHoles(items, pieces, { gap: gapPt, orientations: orient }) : null;
      S.nestPieces = HO ? HO.nestPieces(pieces, S.holes) : pieces;
      S.pieceById = {};
      S.nestPieces.forEach(function (x) { S.pieceById[x.id] = x; });
      if (S.holes && S.holes.children.length) S.note = (S.note ? S.note + ' ' : '') + t('holesNote', { n: S.holes.children.length });
      // MODULO 3: pezzi identici -> un item Sparrow con demand; "tieni vicine" -> celle rigide di 2/4 copie
      S.wrap = Q ? Q.buildNest(S.nestPieces, { keepClose: S.keepClose, gap: gapPt, orientations: orient, stripHeight: H }) : null;
      if (S.wrap && S.wrap.cells) S.note = (S.note ? S.note + ' ' : '') + t('qtyCells', { n: S.wrap.cells });
      // MODULO 5: new report session (rectangle baseline + original length computed once)
      if (window.CorvoReportPanel) window.CorvoReportPanel.begin({ pieces: pieces, items: items, H: H, gapPt: gapPt, orient: orient, docName: doc.name || '',
        expand: S.holes ? function (pls) { return HO.expandPlacements(pls, S.nestPieces, S.holes, pieces); } : null,   // MODULO 2: children in holes
        materialWidthPt: p.rollMm * MM, materialLength: function (w) { return rollLengthMm({ strip_width: w }) * MM; } });   // MODULO 6: marks margins

      var msg = {
        type: 'nest',
        instance: S.wrap ? Q.buildInstance(S.wrap, H, orient) : G.buildInstance(S.nestPieces, H, orient),   // MODULO 2: children excluded; MODULO 3: demand/celle
        exploreSecs: p.time * 0.8,
        compressSecs: p.time * 0.2,
        seed: window.CorvoSeed > 0 ? Math.floor(window.CorvoSeed) : 1 + Math.floor(Math.random() * 1e9),   // fixed seed = tests only
        gap: gapPt
      };
      setStatus('loading');
      return m3Ghosts().then(startEngine).then(function (engine) {   // MODULO 3: sagome delle copie prima della ricerca
        if (S !== me || S.state !== 'preparing') { if (engine.worker) engine.worker.terminate(); return; }
        var runId = {};
        S.runId = runId;
        S.engine = engine;
        S.t0 = Date.now();
        S.phase = 'exploration';
        setState('running');
        S.loop = setInterval(liveTick, LIVE_MS);
        var handler = function (m) { m._run = runId; onEngineMessage(m); };
        if (engine.kind === 'worker') {
          engine.worker.onmessage = function (e) { handler(e.data); };
          engine.worker.onerror = function (ev) { if (ev.preventDefault) ev.preventDefault(); handler({ type: 'error', message: ev.message || 'worker error' }); };
          engine.worker.postMessage(msg);
          setStatus('loading', null, null, S.note);
        } else {
          setStatus('workerFallback', null, 'warn');
          inlineNest(msg, handler);
        }
      });
    }).catch(function (err) {
      if (S === me && (S.state === 'preparing' || S.state === 'running')) failSession(err);
    });
  }

  function stop() {
    if (S.state === 'running') finishSearch('stoppedMsg');
  }

  function apply() {
    // MODULO 9: prova finita senza licenza -> Applica solo fino a LIMITS.freeApplyMax pezzi (il nest resta libero)
    if (LIC && (S.state === 'running' || S.state === 'review') && !LIC.canApply(S.m9Count || 0)) {
      lastStatus = { key: null };
      $('status').textContent = LIC.applyLimitMsg(S.m9Count);
      $('status').className = 'status warn';
      if (LIC.openDialog) LIC.openDialog();
      return;
    }
    if (S.state === 'running') { S.phase = S.phase || 'done'; stopEngine(); }
    if (S.state !== 'running' && S.state !== 'review') return;
    setState('busy');
    var rmNote = '';                   // MODULO 6: crocini definitivi prima di confermare
    hostIdle().then(pushBest).then(drawRegmarks).then(function (note) {
      rmNote = note;
      // corvoFinish conferma anche i crocini ("_rif") nello stesso passo di annullamento (merge moduli 1+6)
      return hostCall('corvoFinish');
    }).then(function (fr) {
      S.session = false;
      setState('idle');
      var warn = !!rmNote;                                        // MODULO 3: copie create / non create
      if (fr && fr.copyErrors && fr.copyErrors.length) { warn = true; rmNote = (rmNote ? rmNote + ' ' : '') + t('qtyCopyErrors', { n: fr.copyErrors.length, msg: fr.copyErrors[0] }); }
      if (fr && fr.copies) rmNote = t('qtyApplied', { n: fr.copies }) + (rmNote ? ' ' + rmNote : '');
      setStatus('applied', null, warn ? 'warn' : 'ok', rmNote);
    }, function (err) {
      setState('review');
      setError(err);
    });
  }

  function revert() {
    stopEngine();
    setState('busy');
    var had = S.session;
    var p = had ? hostIdle().then(clearRegmarks).then(function () { return hostCall('corvoRevert'); }) : Promise.resolve();
    p.then(function () {
      S.session = false;
      if (window.CorvoReportPanel) window.CorvoReportPanel.clear();   // MODULO 5: layout undone
      setState('idle');
      if (had) setStatus('reverted');
    }, function (err) {
      S.session = false;
      setState('idle');
      setError(err);
    });
  }

  function cancel() {
    if (S.state === 'preparing' || S.state === 'running' || S.state === 'review') revert();
  }

  // closing the panel during a session restores the document
  function onUnload() {
    if (S.session && cs) {
      stopEngine();
      try { cs.evalScript('if (typeof corvoRegmarksClear === "function") corvoRegmarksClear();'); } catch (e2) { /* MODULO 6 */ }
      try { cs.evalScript('corvoRevert()'); } catch (e) { /* panel is going away */ }
      S.session = false;
    }
  }

  // ---------------------------------------------------------------- wire up
  $('btnNest').addEventListener('click', nest);
  $('btnStop').addEventListener('click', stop);
  $('btnApply').addEventListener('click', apply);
  $('btnCancel').addEventListener('click', cancel);
  if ($('m3Load')) $('m3Load').addEventListener('click', m3Load);   // MODULO 3
  $('btnLang').addEventListener('click', function () {
    lang = lang === 'en' ? 'it' : 'en';
    try { localStorage.setItem('corvo.lang', lang); } catch (e) { /* storage blocked */ }
    applyLang();
    fillRegmarksSelect();              // MODULO 6
    if (QP()) QP().rerender();         // MODULO 3
  });
  // MODULO 8: preset rotolo DTF -> larghezza e distanza; modificarle a mano torna a "Personalizzato"
  $('preset').addEventListener('change', function () {
    var pr = R && R.PRESETS[$('preset').value];
    if (pr) { $('rollWidth').value = pr.rollMm; $('gap').value = pr.gapMm; }
  });
  ['rollWidth', 'gap'].forEach(function (id) {
    $(id).addEventListener('input', function () { $('preset').value = ''; });
  });
  window.addEventListener('beforeunload', onUnload);
  window.addEventListener('unload', onUnload);

  try {
    var saved = JSON.parse(localStorage.getItem('corvo.opts') || 'null');
    if (saved) { $('shapeSrc').value = saved.shape === 'cut' ? 'cut' : 'all'; $('merge').checked = saved.merge !== false; }
  } catch (e) { /* storage blocked or corrupt */ }
  // MODULO 6
  fillRegmarksSelect();
  if ($('regmarks')) $('regmarks').addEventListener('change', function () {
    try { localStorage.setItem('corvo.regmarks', $('regmarks').value); } catch (e) { /* storage blocked */ }
  });
  try { if ($('useHoles')) $('useHoles').checked = localStorage.getItem('corvo.holes') !== '0'; } catch (e) { /* storage blocked */ }   // MODULO 2
  setState('idle');
  applyLang();
  if (!cs) setStatus('notCep', null, 'warn');
  getWasm().catch(function (e) { console.warn('[corvo] wasm preload failed:', e); });

  // exposed for the verifier / debugging
  window.CorvoPanel = { state: function () { return S; }, hostCall: hostCall, startEngine: startEngine, t: t,
    evalRaw: function (script) { return hostIdle().then(function () { return evalHost(script); }); } };   // MODULO 5: raw read-only host query (document path for the CSV)
})();
