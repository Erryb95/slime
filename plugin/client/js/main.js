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
      rasterNoEngine: 'Images selected but raster.js is not loaded.'
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
      rasterNoEngine: 'Immagini selezionate ma raster.js non è caricato.'
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
    if ($('useHoles')) $('useHoles').disabled = st !== 'idle';   // MODULO 2
    // MODULO 4/7: raggruppamento, fogli, preset; Applica solo a fine sequenza multi-job
    MN_IDS.forEach(function (id) { if ($(id)) $(id).disabled = st !== 'idle'; });
    if (S.mn && running) $('btnApply').disabled = true;
    if (MN && $('container')) mnSyncUi();
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
      holes: !!($('useHoles') && $('useHoles').checked),  // MODULO 2
      rasterMode: $('rasterMode').value,          // MODULO 8
      // MODULO 4: nesting per colore / livello
      group: ($('groupBy') && $('groupBy').value) || 'none',
      colorTol: $('colorTol') ? parseFloat($('colorTol').value) : 8,
      // MODULO 7: fogli
      container: ($('container') && $('container').value) || 'roll',
      sheetId: $('sheetPreset') ? $('sheetPreset').value : '600x400',
      sheetW: $('sheetW') ? parseFloat($('sheetW').value) : 0,
      sheetH: $('sheetH') ? parseFloat($('sheetH').value) : 0,
      sheetMargin: $('sheetMargin') ? parseFloat($('sheetMargin').value) : 10,
      grain: !!($('grain') && $('grain').checked)
    };
    try { localStorage.setItem('corvo.opts', JSON.stringify({ shape: p.shape, merge: p.merge })); } catch (e) { /* storage blocked */ }
    try { localStorage.setItem('corvo.holes', p.holes ? '1' : '0'); } catch (e) { /* storage blocked */ }   // MODULO 2
    if (!(p.rollMm > 0) || !(p.gapMm >= 0) || !(p.time >= 2)) throw new Error(t('badInput'));
    mnReadParams(p);                   // MODULO 4/7: validation + panel settings remembered
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
    if (S.mn) { mnRenderStats(); return; }   // MODULO 4/7
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
    if (S.mn) return mnMoves(rep);     // MODULO 4/7: finished jobs + the current one
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
    if (S.mn) {                        // MODULO 4/7: all the containers (rolls per colour / sheets) with their labels
      var pay = mnContainers(rep), js = JSON.stringify(pay);
      if (js !== S.mn.lastPay) { S.mn.lastPay = js; calls.push(mnHostCall('corvoContainers', pay)); }
    } else if (rep.strip_width !== S.lastRollW) {
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

    // MODULO 4/7: multi-job (per colore/livello, fogli) = contenitori separati, niente crocini (nota nella riga di stato)
    if (mnMode(p) && p.rm !== 'none') { p.rmSkipped = true; p.rm = 'none'; }
    // MODULO 6: i crocini riservano due fasce laterali e un margine di testa -> striscia del nest ridotta
    var rmRes = RM ? RM.reserve(p.rm, p.rollMm) : { id: 'none', nestHeight: p.rollMm, offset: [0, 0], band: 0 };
    if (!(rmRes.nestHeight > 0)) {
      S.state = 'idle'; setState('idle');
      setError(t('rmTooNarrow', { sys: RM.spec(p.rm).label, band: fmt(rmRes.band, 1) }));
      return;
    }
    var H = rmRes.nestHeight * MM, gapPt = p.gapMm * MM, orient = G.rotationsFor(p.rot);
    if (p.container === 'sheets' && p.sheet) H = p.sheet.Hu * MM;   // MODULO 7: striscia = altezza utile del foglio
    hostCall('corvoExport', { flatness: FLATNESS, raster: true, paint: p.group === 'color' }).then(function (exp) {   // MODULO 8: raster, MODULO 4: colori
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
      var planOpts = { merge: p.merge, shape: p.shape, artboards: doc.artboards || [], lockedCuts: exp.lockedCuts || [] };
      // MODULO 4: un piano per gruppo (colore o livello): l'unione del modulo 1 non incolla mai due colori
      var plan = (p.group !== 'none' && CG) ? CG.planGroups(items, { by: p.group, tol: p.colorTol }, planOpts, CL) : CL.planPieces(items, planOpts);
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
      if (plan.groups && plan.mixed && plan.mixed.length) notes.push(t('mnMixed', { n: plan.mixed.length }));   // MODULO 4
      if (p.rmSkipped) notes.push(t('mnNoRegmarks'));   // MODULO 4/7
      S.plan = plan;
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
      var big = pieces.filter(function (x) { return G.minExtent(x.polygon, orient) > H - 1e-6; });
      if (big.length && p.container === 'sheets') throw new Error(t('mnTooBig', { w: fmt(p.sheet.Lu), h: fmt(p.sheet.Hu), names: big.map(function (x) { return x.name; }).join(', ') }));   // MODULO 7
      if (big.length) throw new Error(t('tooBig', { w: fmt(rmRes.nestHeight), names: big.map(function (x) { return x.name; }).join(', ') }));
      var hulls = pieces.filter(function (x) { return /hull/.test(x.method) && x.parts > 1; }).length;

      S.H = H;
      // MODULO 6: rollOrigin = angolo del rotolo intero; origin = angolo della striscia del nest
      S.rm = { id: rmRes.id, rollMm: p.rollMm };
      S.rollOrigin = [+doc.abLeft || 0, (+doc.abBottom || 0) - ROLL_MARGIN_MM * MM - p.rollMm * MM];
      S.origin = [S.rollOrigin[0] + rmRes.offset[0] * MM, S.rollOrigin[1] + rmRes.offset[1] * MM];
      S.pieces = pieces;
      S.pieceById = {};
      pieces.forEach(function (x) { S.pieceById[x.id] = x; });
      S.areaSum = pieces.reduce(function (s, x) { return s + x.area; }, 0);
      S.budget = p.time;
      if (hulls) pl.notes.push(t('hullNote', { n: hulls }));
      S.note = pl.notes.join(' ');
      if (mnMode(p)) return mnStart(me, p, pieces, items, doc, gapPt, orient);   // MODULO 4/7: sequenza di nest

      // MODULO 2: small pieces inside the holes of big ones; children travel with their parent (one Sparrow item)
      S.holes = (HO && p.holes) ? HO.planHoles(items, pieces, { gap: gapPt, orientations: orient }) : null;
      S.nestPieces = HO ? HO.nestPieces(pieces, S.holes) : pieces;
      S.pieceById = {};
      S.nestPieces.forEach(function (x) { S.pieceById[x.id] = x; });
      if (S.holes && S.holes.children.length) S.note = (S.note ? S.note + ' ' : '') + t('holesNote', { n: S.holes.children.length });
      // MODULO 5: new report session (rectangle baseline + original length computed once)
      if (window.CorvoReportPanel) window.CorvoReportPanel.begin({ pieces: pieces, items: items, H: H, gapPt: gapPt, orient: orient, docName: doc.name || '',
        expand: S.holes ? function (pls) { return HO.expandPlacements(pls, S.nestPieces, S.holes, pieces); } : null,   // MODULO 2: children in holes
        materialWidthPt: p.rollMm * MM, materialLength: function (w) { return rollLengthMm({ strip_width: w }) * MM; } });   // MODULO 6: marks margins

      var msg = {
        type: 'nest',
        instance: G.buildInstance(S.nestPieces, H, orient),   // MODULO 2: children excluded
        exploreSecs: p.time * 0.8,
        compressSecs: p.time * 0.2,
        seed: window.CorvoSeed > 0 ? Math.floor(window.CorvoSeed) : 1 + Math.floor(Math.random() * 1e9),   // fixed seed = tests only
        gap: gapPt
      };
      setStatus('loading');
      return startEngine().then(function (engine) {
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
    if (S.mn && S.state === 'running') { mnHurry(); return; }   // MODULO 4/7
    if (S.state === 'running') finishSearch('stoppedMsg');
  }

  function apply() {
    if (S.mn && S.state === 'running') return;   // MODULO 4/7: Applica a fine sequenza
    if (S.state === 'running') { S.phase = S.phase || 'done'; stopEngine(); }
    if (S.state !== 'running' && S.state !== 'review') return;
    setState('busy');
    var rmNote = '';                   // MODULO 6: crocini definitivi prima di confermare
    hostIdle().then(pushBest).then(drawRegmarks).then(function (note) {
      rmNote = note;
      // corvoFinish conferma anche i crocini ("_rif") nello stesso passo di annullamento (merge moduli 1+6)
      return hostCall('corvoFinish');
    }).then(function () {
      S.session = false;
      setState('idle');
      setStatus('applied', null, rmNote ? 'warn' : 'ok', rmNote);
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

  // ---------------------------------------------------------------- MODULO 4 / MODULO 7: multi-job
  // Nesting per colore/livello (un rotolo per gruppo, impilati sotto la tavola) e multi-foglio (fogli in fila, una
  // riga per gruppo). Logica pura in js/multinest.js, js/colorgroups.js, js/sheets.js; disegno dei contenitori in
  // host/multinest.jsx (corvoContainers). Stato in S.mn; la ricerca live mostra il gruppo / foglio corrente.
  var CG = window.CorvoColorGroups, MN = window.CorvoMultinest, SH = window.CorvoSheets;
  var MN_IDS = ['groupBy', 'colorTol', 'container', 'sheetPreset', 'sheetW', 'sheetH', 'sheetMargin', 'grain',
    'mnPreset', 'mnName', 'mnSave', 'mnDel', 'mnExport', 'mnImport'];
  var MN_STR = {
    en: {
      groupBy: 'Nest by', grpNone: 'All together', grpColor: 'Fill colour', grpLayer: 'Layer', colorTol: 'Colour tolerance',
      container: 'Material', contRoll: 'Roll', contSheets: 'Sheets', sheetSize: 'Sheet', sheetCustom: 'Custom',
      sheetW: 'Sheet length', sheetH: 'Sheet width', sheetMargin: 'Sheet margin',
      grain: 'Grain: 0/180° only (also pieces named or on a layer "grain"/"venatura")',
      presets: 'Presets', mnSave: 'Save', mnDel: 'Delete', mnExport: 'Export', mnImport: 'Import', mnPresetNone: '(current settings)',
      mnPresetName: 'New preset name', mnPresetSaved: 'Preset "{name}" saved.', mnPresetLoaded: 'Preset "{name}" loaded.',
      mnImported: '{n} preset(s) imported.', mnImportBad: 'Not a Corvo presets file.', mnExported: 'Presets saved to {path}',
      mnBadSheet: 'Check the sheet: length and width > 0, margin ≥ 0 and smaller than half the sheet.',
      mnTooBig: 'Larger than the usable sheet ({w} × {h} mm, margins excluded): {names}',
      mnMixed: '{n} object(s) with more than one colour: nested with their main colour.',
      mnNoRegmarks: 'Registration marks are not drawn with several rolls/sheets.',
      mnNoColor: 'no colour', mnNoLayer: 'no layer',
      mnRunColor: 'Group {k}/{n}: {label} — {pieces} pieces… Stop = finish quickly.',
      mnRunSheet: '{group}Sheet {k} ({phase}), {n} pieces… Stop = finish quickly.',
      mnHurry: 'Finishing quickly: the current nest keeps its best layout, the rest gets a short search.',
      mnDoneRoll: '{n} rolls: {list}. Total {len} mm, fill {fill}%. Apply to keep, Cancel to restore.',
      mnDoneSheets: '{n} sheet(s) (lower bound from the usable area: {lb}): fill {fills} %, last sheet {last} mm used. Apply to keep, Cancel to restore.',
      mnSheetLabel: 'Sheet {k}', mnSheetUsed: 'used {len} mm',
      phSplit: 'split', phFill: 'fill', phConsolidate: 'fewer sheets', phFinal: 'final check'
    },
    it: {
      groupBy: 'Nest per', grpNone: 'Tutto insieme', grpColor: 'Colore di riempimento', grpLayer: 'Livello', colorTol: 'Tolleranza colore',
      container: 'Materiale', contRoll: 'Rotolo', contSheets: 'Fogli', sheetSize: 'Foglio', sheetCustom: 'Personalizzato',
      sheetW: 'Lunghezza foglio', sheetH: 'Larghezza foglio', sheetMargin: 'Margine foglio',
      grain: 'Venatura: solo 0/180° (anche pezzi con nome o livello "venatura"/"grain")',
      presets: 'Preset', mnSave: 'Salva', mnDel: 'Elimina', mnExport: 'Esporta', mnImport: 'Importa', mnPresetNone: '(impostazioni correnti)',
      mnPresetName: 'Nome nuovo preset', mnPresetSaved: 'Preset «{name}» salvato.', mnPresetLoaded: 'Preset «{name}» caricato.',
      mnImported: '{n} preset importati.', mnImportBad: 'Non è un file di preset Corvo.', mnExported: 'Preset salvati in {path}',
      mnBadSheet: 'Controlla il foglio: lunghezza e larghezza > 0, margine ≥ 0 e minore di metà foglio.',
      mnTooBig: 'Più grandi del foglio utile ({w} × {h} mm, margini esclusi): {names}',
      mnMixed: '{n} oggetti con più di un colore: disposti col colore prevalente.',
      mnNoRegmarks: 'Con più rotoli/fogli i crocini di registro non vengono disegnati.',
      mnNoColor: 'senza colore', mnNoLayer: 'senza livello',
      mnRunColor: 'Gruppo {k}/{n}: {label} — {pieces} pezzi… Stop = chiudi in fretta.',
      mnRunSheet: '{group}Foglio {k} ({phase}), {n} pezzi… Stop = chiudi in fretta.',
      mnHurry: 'Chiusura rapida: il nest corrente tiene la disposizione migliore, il resto ha una ricerca breve.',
      mnDoneRoll: '{n} rotoli: {list}. Totale {len} mm, riempimento {fill}%. Applica per tenere, Annulla per ripristinare.',
      mnDoneSheets: '{n} fogli (minimo teorico dall’area utile: {lb}): riempimento {fills} %, ultimo foglio usato per {last} mm. Applica per tenere, Annulla per ripristinare.',
      mnSheetLabel: 'Foglio {k}', mnSheetUsed: 'usati {len} mm',
      phSplit: 'taglio', phFill: 'riempimento', phConsolidate: 'meno fogli', phFinal: 'verifica finale'
    }
  };
  ['en', 'it'].forEach(function (l) { for (var k in MN_STR[l]) STR[l][k] = MN_STR[l][k]; });
  var MN_GRAIN_RE = /grain|venatur|vena\b|fibra/i;

  function mnMode(p) { return !!(MN && ((p.group !== 'none' && CG) || (p.container === 'sheets' && SH))); }

  function mnReadParams(p) {
    if (p.container === 'sheets' && SH) {
      var sz = SH.sheetSize(p.sheetId, p.sheetW, p.sheetH), m = p.sheetMargin;
      if (!sz || !(m >= 0) || sz.w - 2 * m <= 0 || sz.h - 2 * m <= 0) throw new Error(t('mnBadSheet'));
      p.sheet = { w: sz.w, h: sz.h, margin: m, Lu: sz.w - 2 * m, Hu: sz.h - 2 * m };
    }
    if (!(p.colorTol >= 0)) p.colorTol = CG ? CG.DEFAULT_TOL : 8;
    try { localStorage.setItem('corvo.mn.opts', JSON.stringify(mnCollect())); } catch (e) { /* storage blocked */ }
  }

  // pieces (renumbered after the degenerate ones) -> groups [{key, label, hex, pieces:[piece]}]
  function mnGroups(pieces) {
    var gs = S.plan && S.plan.groups;
    if (!gs) return [{ key: 'all', label: '', hex: null, pieces: pieces.slice() }];
    var byPlan = {};
    pieces.forEach(function (x) { byPlan[x.hostI !== undefined ? x.hostI : x.id] = x; });
    return gs.map(function (g) {
      var lab = g.label || (g.key === 'none' ? t(S.mn0.group === 'layer' ? 'mnNoLayer' : 'mnNoColor') : '?');
      return { key: g.key, label: lab, hex: g.hex, pieces: g.pieces.map(function (i) { return byPlan[i]; }).filter(Boolean) };
    }).filter(function (g) { return g.pieces.length; });
  }

  // engine for a sequence of nests: one worker reused; Stop aborts the current nest keeping its best layout
  function mnRunner(me) {
    var eng = null, hang = function () { return new Promise(function () { /* session cancelled */ }); };
    return function (instance, secs, onReport) {
      if (S !== me) return hang();
      if (S.mn.hurry) secs = Math.min(secs, 1);
      return (eng ? Promise.resolve(eng) : startEngine().then(function (e) { eng = e; return e; })).then(function (engine) {
        if (S !== me || S.state !== 'running') { if (engine.worker) engine.worker.terminate(); eng = null; return hang(); }
        S.engine = engine;
        return new Promise(function (resolve, reject) {
          var best = null, runId = {};
          S.runId = runId;
          function end() { S.runId = null; S.mn.abort = null; }
          function handler(m) {
            if (S.runId !== runId) return;
            if (m.type === 'report') {
              var r = m.report;
              S.phase = r.phase || S.phase;
              if (!best || r.strip_width <= best.strip_width) { best = r; S.best = r; if (onReport) onReport(r); }
              if (S.mn.hurry && S.mn.abort) S.mn.abort();
            } else if (m.type === 'done') { end(); resolve(best); }
            else if (m.type === 'error') { end(); reject(new Error(t('engineError', { msg: m.message }))); }
          }
          S.mn.abort = function () {              // only with a layout in hand (otherwise at the first report)
            if (!best || S.runId !== runId || !engine.worker) return;
            end();
            engine.worker.terminate(); eng = null; S.engine = null;
            resolve(best);
          };
          var msg = { type: 'nest', instance: instance, exploreSecs: secs * 0.8, compressSecs: secs * 0.2,
            seed: window.CorvoSeed > 0 ? Math.floor(window.CorvoSeed) : 1 + Math.floor(Math.random() * 1e9), gap: S.mn.gapPt };
          if (engine.kind === 'worker') {
            engine.worker.onmessage = function (e) { handler(e.data); };
            engine.worker.onerror = function (ev) { if (ev.preventDefault) ev.preventDefault(); handler({ type: 'error', message: ev.message || 'worker error' }); };
            engine.worker.postMessage(msg);
          } else inlineNest(msg, handler);
        });
      });
    };
  }

  function mnUnitMoves(pls, origin) {
    if (HO) return HO.movesFor(pls, S.nestPieces, origin, S.holes);
    return pls.map(function (pl) { return G.placementToMove(pl, S.pieceById[pl.item_id], origin); });
  }
  function mnMoves(rep) {
    var out = [], M = S.mn;
    Object.keys(M.fixed).forEach(function (k) { out = out.concat(M.fixed[k]); });
    if (M.cur && rep && !rep.mnFinal) out = out.concat(mnUnitMoves(MN.mapPlacements(rep, M.cur.units), M.cur.origin));
    return out;
  }
  function mnContainers(rep) {
    var M = S.mn, list = M.done.slice();
    if (M.cur && rep && !rep.mnFinal) {
      if (M.p.container === 'sheets') list.push(M.cur.box);
      else list.push({ ox: M.cur.origin[0], oy: M.cur.origin[1], w: rep.strip_width, h: M.W, label: MN.rollLabel(M.cur.label, rep.strip_width / MM) });
    }
    return { list: list };
  }
  function mnHostPath() { return baseDir.replace(/\/client$/, '') + '/host/multinest.jsx'; }
  function mnHostCall(fn, arg) {
    return hostScript('(function(){if(typeof ' + fn + '!=="function"){$.evalFile(new File(' + JSON.stringify(mnHostPath()) + '));}' +
      'return ' + fn + '(' + JSON.stringify(JSON.stringify(arg)) + ');})()');
  }
  function mnRenderStats() {
    var M = S.mn, b = S.best;
    if (M.final) {
      $('sLength').textContent = M.p.container === 'sheets' ? M.sheetsN + ' × ' + fmt(M.p.sheet.w) + '×' + fmt(M.p.sheet.h) : fmt(M.totalMm, 0) + ' mm';
      $('sFill').textContent = fmt(M.fill * 100, 1) + ' %';
      $('fillBarFill').style.width = Math.max(0, Math.min(100, M.fill * 100)) + '%';
    } else if (b && M.cur) {
      var d = M.cur.area / (b.strip_width * M.cur.H);
      $('sLength').textContent = fmt(b.strip_width / MM, 0) + ' mm';
      $('sFill').textContent = fmt(d * 100, 1) + ' %';
      $('fillBarFill').style.width = Math.max(0, Math.min(100, d * 100)) + '%';
    }
    if (S.t0) {
      var el = ((S.tEnd || Date.now()) - S.t0) / 1000;
      $('sElapsed').textContent = fmt(el, 1) + ' s';
      $('timeBarFill').style.width = Math.min(100, el / Math.max(1, M.budget) * 100) + '%';
    }
    if (S.phase) $('sPhase').textContent = t(S.phase);
  }
  function mnHurry() {
    if (!S.mn || S.mn.hurry) return;
    S.mn.hurry = true;
    if (S.mn.abort) S.mn.abort();
    setStatus('mnHurry', null, 'warn');
  }

  function mnStart(me, p, pieces, items, doc, gapPt, orient) {
    S.mn0 = p;
    var groups = mnGroups(pieces);
    // MODULO 2 per gruppo: un pezzo di un colore non finisce nel foro di un altro colore
    var holes = null;
    if (HO && p.holes) {
      holes = { children: [], parents: {}, regions: 0, usedRegions: 0, emptyRegions: 0 };
      groups.forEach(function (g) {
        var hp = HO.planHoles(items, g.pieces, { gap: gapPt, orientations: orient });
        holes.children = holes.children.concat(hp.children);
        for (var k in hp.parents) holes.parents[k] = hp.parents[k];
        holes.regions += hp.regions; holes.usedRegions += hp.usedRegions; holes.emptyRegions += hp.emptyRegions;
      });
    }
    S.holes = holes;
    S.nestPieces = HO ? HO.nestPieces(pieces, holes) : pieces;
    S.pieceById = {};
    S.nestPieces.forEach(function (x) { S.pieceById[x.id] = x; });
    if (holes && holes.children.length) S.note = (S.note ? S.note + ' ' : '') + t('holesNote', { n: holes.children.length });
    var unitOf = {};                                     // piece id -> nest unit
    S.nestPieces.forEach(function (u) { unitOf[u.srcId !== undefined ? u.srcId : u.id] = u; });
    groups.forEach(function (g) {
      g.units = g.pieces.map(function (x) { return unitOf[x.id]; }).filter(Boolean);
      g.units.forEach(function (u) {                   // venatura per pezzo: nome o livello "grain"/"venatura"
        var pp = S.plan && S.plan.pieces[u.hostI !== undefined ? u.hostI : (u.srcId !== undefined ? u.srcId : u.id)];
        if (MN_GRAIN_RE.test(u.name || '') || (pp && (pp.layers || []).some(function (l) { return MN_GRAIN_RE.test(l || ''); }))) u.grain = true;
      });
      g.area = MN.areaOf(g.units);
    });
    groups = groups.filter(function (g) { return g.units.length; });

    var left = +doc.abLeft || 0, top = (+doc.abBottom || 0) - ROLL_MARGIN_MM * MM;
    var W = p.rollMm * MM, sheets = p.container === 'sheets';
    var labelPt = Math.max(12, Math.min(72, (sheets ? p.sheet.h * MM : W) * 0.04));
    var spacing = Math.max(20 * MM, labelPt * 2.5);
    var M = S.mn = { p: p, gapPt: gapPt, orient: orient, groups: groups, fixed: {}, done: [], cur: null, hurry: false,
      lastPay: '', W: W, results: [], budget: p.time, sheetsN: 0 };
    S.docName = doc.name || '';
    S.items = items; S.pieces = pieces;
    var run = mnRunner(me);
    var chain;
    if (!sheets) {
      var origins = MN.stackRolls(groups.length, W, left, top, spacing);
      var secs = MN.timeShares(groups.map(function (g) { return g.area; }), p.time, 3);
      M.budget = secs.reduce(function (s, x) { return s + x; }, 0);
      var jobs = groups.map(function (g, k) { return { g: g, units: g.units, H: W, orient: orient, secs: secs[k], origin: origins[k] }; });
      chain = MN.runJobs(jobs, run, {
        onStart: function (k, job) {
          if (S !== me) return;
          S.best = null; S.lastSent = null;              // the previous job's report has other item ids
          M.cur = { units: job.units, origin: job.origin, label: job.g.label, area: job.g.area, H: W };
          setStatus('mnRunColor', { k: k + 1, n: jobs.length, label: job.g.label, pieces: job.units.length }, null, S.note);
        },
        onDone: function (k, job) {
          if (S !== me) return;
          var L = job.report.strip_width;
          M.fixed['r' + k] = mnUnitMoves(job.placements, job.origin);
          M.done.push({ ox: job.origin[0], oy: job.origin[1], w: L, h: W, label: MN.rollLabel(job.g.label, L / MM) });
          M.results.push({ label: job.g.label, hex: job.g.hex, lengthPt: L, placements: job.placements, units: job.units,
            H: W, materialWidthPt: W, materialLengthPt: L });
          M.cur = null;
        }
      });
    } else {
      var sw = p.sheet.w * MM, sh = p.sheet.h * MM, mg = p.sheet.margin * MM;
      var splitSecs = Math.max(1, Math.min(5, p.time * 0.1));
      M.budget = p.time * 2;
      chain = groups.reduce(function (prev, g, gi) {
        return prev.then(function () {
          if (S !== me) return null;
          var rowTop = top - gi * (sh + spacing);
          var corner = function (k) { return [left + k * (sw + spacing), rowTop - sh]; };
          var gLab = groups.length > 1 || g.key !== 'all' ? g.label + ' — ' : '';
          var box = function (k, used) {
            var c = corner(k);
            return { ox: c[0], oy: c[1], w: sw, h: sh, label: 'Corvo — ' + gLab + t('mnSheetLabel', { k: k + 1 }) + ' — ' +
              fmt(p.sheet.w) + ' × ' + fmt(p.sheet.h) + ' mm' + (used ? ' — ' + t('mnSheetUsed', { len: fmt(used / MM) }) : '') };
          };
          var doneBase = M.done.length;
          return SH.planSheets(g.units, { sheetW: sw, sheetH: sh, margin: mg, orient: orient, grain: p.grain,
            splitSecs: splitSecs, finalSecs: p.time, fillTries: 4, finalPass: 'all', hurry: function () { return M.hurry; } }, run, {
            onPhase: function (info) {
              if (S !== me) return;
              S.phase = info.phase === 'final' ? 'compression' : 'exploration';
              setStatus('mnRunSheet', { group: gLab, k: info.sheet + 1, n: info.n, phase: t({ split: 'phSplit', fill: 'phFill', consolidate: 'phConsolidate', final: 'phFinal' }[info.phase]) }, null, S.note);
            },
            onReport: function (info) {
              if (S !== me) return;
              var c = corner(info.sheet);
              M.cur = { units: info.units, origin: [c[0] + mg, c[1] + mg], label: g.label, area: MN.areaOf(info.units), H: sh - 2 * mg, box: box(info.sheet) };
            },
            onSheet: function (k, sheet) {
              if (S !== me) return;
              var c = corner(k);
              M.fixed['s' + gi + '_' + k] = mnUnitMoves(sheet.placements, [c[0] + mg, c[1] + mg]);
              M.done[doneBase + k] = box(k);
              M.cur = null;
            }
          }).then(function (res) {
            if (S !== me) return;
            if (res.error) {
              if (res.error.code === 'tooBig') throw new Error(t('mnTooBig', { w: fmt(res.error.LuMm), h: fmt(res.error.HuMm), names: res.error.names.slice(0, 5).join(', ') }));
              throw new Error(t('mnBadSheet'));
            }
            // rebuild this group's sheets from the final result (the consolidation may have dropped the last sheet)
            Object.keys(M.fixed).forEach(function (key) { if (key.indexOf('s' + gi + '_') === 0) delete M.fixed[key]; });
            M.done.length = doneBase;
            res.sheets.forEach(function (s, k) {
              var last = k === res.sheets.length - 1, c0 = corner(k);
              M.fixed['s' + gi + '_' + k] = mnUnitMoves(s.placements, [c0[0] + mg, c0[1] + mg]);
              M.done[doneBase + k] = box(k, last ? s.usedLength : 0);
              M.results.push({ label: g.label + (groups.length > 1 || g.key !== 'all' ? ' — ' : '') + t('mnSheetLabel', { k: k + 1 }),
                lengthPt: s.usedLength, placements: s.placements, units: s.units, H: sh - 2 * mg, materialWidthPt: sh, materialLengthPt: sw,
                sheetFill: s.fillSheet, last: last });
            });
            M.sheetsN += res.sheets.length;
            M.lowerBound = (M.lowerBound || 0) + res.lowerBoundUsable;
            M.lastUsed = res.sheets.length ? res.sheets[res.sheets.length - 1].usedLength : 0;
          });
        });
      }, Promise.resolve());
    }
    S.t0 = Date.now();
    S.phase = 'exploration';
    setState('running');
    S.loop = setInterval(liveTick, LIVE_MS);
    return chain.then(function () { if (S === me) mnFinish(me); });
  }

  function mnFinish(me) {
    var M = S.mn;
    stopEngine();
    M.cur = null; M.final = true;
    var areaAll = 0, usedAll = 0;
    M.results.forEach(function (r) { areaAll += MN.areaOf(r.units); usedAll += r.materialLengthPt * r.materialWidthPt; });
    M.fill = usedAll > 0 ? areaAll / usedAll : 0;
    M.totalMm = M.results.reduce(function (s, r) { return s + r.lengthPt / MM; }, 0);
    S.best = { strip_width: 0, placements: [], mnFinal: true };
    setState('review');
    renderStats();
    mnReport();
    var key, vars;
    if (M.p.container === 'sheets') {
      key = 'mnDoneSheets';
      vars = { n: M.sheetsN, lb: M.lowerBound, fills: M.results.map(function (r) { return fmt(r.sheetFill * 100); }).join(' / '), last: fmt(M.lastUsed / MM) };
    } else {
      key = 'mnDoneRoll';
      vars = { n: M.results.length, list: M.results.map(function (r) { return r.label + ' ' + fmt(r.lengthPt / MM) + ' mm'; }).join(', '),
        len: fmt(M.totalMm), fill: fmt(M.fill * 100, 1) };
    }
    hostIdle().then(pushBest).then(function () {
      if (S === me) setStatus(key, vars, 'ok', S.note);
    }, function () { /* error already shown */ });
  }

  // MODULO 5 x 4/7: one report per colour / sheet + TOTAL (CorvoReportPanel.multi)
  function mnReport() {
    var RP = window.CorvoReportPanel;
    if (!RP || !RP.multi) return;
    var M = S.mn, itemById = {};
    (S.items || []).forEach(function (it) { itemById[it.i] = it; });
    RP.multi(M.results.map(function (r) {
      var pls = HO ? HO.expandPlacements(r.placements, S.nestPieces, S.holes, S.pieces) : r.placements;
      var ids = {};
      pls.forEach(function (pl) { ids[pl.item_id] = true; });
      var pcs = S.pieces.filter(function (x) { return ids[x.id]; });
      return { label: r.label, color: r.hex || '', pieces: pcs, placements: pls, stripLengthPt: r.lengthPt, H: r.H, gapPt: M.gapPt,
        orient: M.orient, materialWidthPt: r.materialWidthPt, materialLengthPt: r.materialLengthPt,
        items: pcs.map(function (x) { return itemById[x.hostI !== undefined ? x.hostI : x.id]; }).filter(Boolean) };
    }), S.docName);
  }

  // ---------------------------------------------------------------- MODULO 4: preset (localStorage + JSON)
  function mnCollect() {
    var p = {
      rollMm: parseFloat($('rollWidth').value), gapMm: parseFloat($('gap').value), rot: $('rotations').value,
      time: parseFloat($('time').value)
    };
    if ($('groupBy')) { p.group = $('groupBy').value; p.colorTol = parseFloat($('colorTol').value); }
    if ($('container')) {
      p.container = $('container').value; p.sheet = $('sheetPreset').value;
      p.sheetW = parseFloat($('sheetW').value); p.sheetH = parseFloat($('sheetH').value);
      p.sheetMargin = parseFloat($('sheetMargin').value); p.grain = !!$('grain').checked;
    }
    return p;
  }
  function mnApplySettings(pr) {
    if (!pr) return;
    var set = function (id, v) { if ($(id) && v !== undefined && v !== null) $(id).value = v; };
    set('rollWidth', pr.rollMm); set('gap', pr.gapMm); set('rotations', pr.rot); set('time', pr.time);
    set('groupBy', pr.group); set('colorTol', pr.colorTol); set('container', pr.container);
    if (pr.sheet && SH && (SH.PRESETS[pr.sheet] || pr.sheet === 'custom')) set('sheetPreset', pr.sheet);
    set('sheetW', pr.sheetW); set('sheetH', pr.sheetH); set('sheetMargin', pr.sheetMargin);
    if ($('grain') && pr.grain !== undefined) $('grain').checked = !!pr.grain;
    if ($('preset')) $('preset').value = '';                   // MODULO 8 roll preset no longer matches
    mnSyncUi();
  }
  function mnSyncUi() {
    if (!$('container')) return;
    var sheets = $('container').value === 'sheets';
    var els = document.querySelectorAll('[data-mn7]');
    for (var i = 0; i < els.length; i++) els[i].hidden = !sheets;
    var rw = $('rollWidth').closest ? $('rollWidth').closest('label') : null;
    if (rw) rw.hidden = sheets;
    if ($('colorTolWrap')) $('colorTolWrap').hidden = $('groupBy').value !== 'color';
    var custom = $('sheetPreset').value === 'custom';
    $('sheetW').disabled = $('sheetH').disabled = !custom || S.state !== 'idle';
    var pr = SH && SH.PRESETS[$('sheetPreset').value];
    if (pr) { $('sheetW').value = pr.w; $('sheetH').value = pr.h; }
  }
  function mnPresetMap() { return MN.Presets.load(localStorage); }
  function mnFillPresets(sel) {
    var el = $('mnPreset');
    if (!el) return;
    var map = {}, names;
    try { map = mnPresetMap(); } catch (e) { map = {}; }
    names = Object.keys(map).sort();
    el.innerHTML = '';
    var o = document.createElement('option'); o.value = ''; o.textContent = t('mnPresetNone'); el.appendChild(o);
    names.forEach(function (n) { var q = document.createElement('option'); q.value = n; q.textContent = n; el.appendChild(q); });
    el.value = sel && map[sel] ? sel : '';
  }
  function mnMaterial(set) {                                  // MODULO 5 material travels with the preset
    var RP = window.CorvoReportPanel;
    if (!RP || !RP.material) return undefined;
    return RP.material(set);
  }
  function mnPresetSave() {
    // nome dal campo accanto (window.prompt non e' affidabile in CEP), altrimenti il preset scelto o la data
    var name = ($('mnName').value || '').trim() || $('mnPreset').value || 'Corvo ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
    var map = mnPresetMap(), pr = mnCollect();
    var mat = mnMaterial();
    if (mat) pr.material = mat;
    name = MN.Presets.put(map, name, pr);
    if (!name) return;
    MN.Presets.save(localStorage, map);
    mnFillPresets(name);
    $('mnName').value = '';
    setStatus('mnPresetSaved', { name: name }, 'ok');
  }
  function mnPresetLoad() {
    var n = $('mnPreset').value, map = mnPresetMap();
    if (!n || !map[n]) return;
    mnApplySettings(map[n]);
    if (map[n].material) mnMaterial(map[n].material);
    setStatus('mnPresetLoaded', { name: n }, 'ok');
  }
  function mnPresetDelete() {
    var n = $('mnPreset').value, map = mnPresetMap();
    if (!n) return;
    MN.Presets.remove(map, n); MN.Presets.save(localStorage, map); mnFillPresets('');
  }
  function mnPresetExport() {
    var json = MN.Presets.toJSON(mnPresetMap()), fsx = window.cep && window.cep.fs;
    var nodePath = null, os = null;
    try { nodePath = require('path'); os = require('os'); } catch (e) { /* browser */ }
    if (!nodeFs || !nodePath) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'corvo-presets.json'; a.click();
      return;
    }
    var target = nodePath.join(os.homedir(), 'Desktop', 'corvo-presets.json');
    if (fsx && fsx.showSaveDialogEx) {
      var res = fsx.showSaveDialogEx(t('mnExport'), nodePath.dirname(target), ['json'], 'corvo-presets.json', 'JSON');
      if (!res || res.err || !res.data) return;
      target = String(res.data);
      if (!/\.json$/i.test(target)) target += '.json';
    }
    try { nodeFs.writeFileSync(target, json, 'utf8'); setStatus('mnExported', { path: target }, 'ok'); }
    catch (e) { setError(e); }
  }
  function mnPresetImportText(text) {
    var map = mnPresetMap(), r = MN.Presets.fromJSON(text, map);
    if (r.error) { setStatus('mnImportBad', null, 'error'); return; }
    MN.Presets.save(localStorage, map);
    mnFillPresets(r.added[0]);
    setStatus('mnImported', { n: r.added.length }, 'ok');
  }
  function mnPresetImport() {
    var fsx = window.cep && window.cep.fs;
    if (nodeFs && fsx && fsx.showOpenDialogEx) {
      var res = fsx.showOpenDialogEx(false, false, t('mnImport'), '', ['json']);
      if (!res || res.err || !res.data || !res.data.length) return;
      try { mnPresetImportText(nodeFs.readFileSync(String(res.data[0]), 'utf8')); } catch (e) { setError(e); }
      return;
    }
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { mnPresetImportText(String(rd.result)); };
      rd.readAsText(f);
    };
    inp.click();
  }

  function mnInit() {
    if (!MN || !$('groupBy')) return;
    var sp = $('sheetPreset');
    if (sp && SH) {
      sp.innerHTML = '';
      SH.ORDER.forEach(function (id) {
        var o = document.createElement('option');
        o.value = id;
        if (id === 'custom') { o.textContent = t('sheetCustom'); o.setAttribute('data-i18n', 'sheetCustom'); }
        else o.textContent = SH.PRESETS[id].label;
        sp.appendChild(o);
      });
    }
    try { mnApplySettings(JSON.parse(localStorage.getItem('corvo.mn.opts') || 'null')); } catch (e) { /* none or corrupt */ }
    ['groupBy', 'container', 'sheetPreset'].forEach(function (id) { $(id).addEventListener('change', mnSyncUi); });
    $('mnPreset').addEventListener('change', mnPresetLoad);
    $('mnSave').addEventListener('click', mnPresetSave);
    $('mnDel').addEventListener('click', mnPresetDelete);
    $('mnExport').addEventListener('click', mnPresetExport);
    $('mnImport').addEventListener('click', mnPresetImport);
    $('btnLang').addEventListener('click', function () { mnFillPresets($('mnPreset').value); });
    mnFillPresets('');
    mnSyncUi();
    $('mnName').placeholder = t('mnPresetName');
    $('btnLang').addEventListener('click', function () { $('mnName').placeholder = t('mnPresetName'); });
  }

  // ---------------------------------------------------------------- wire up
  $('btnNest').addEventListener('click', nest);
  $('btnStop').addEventListener('click', stop);
  $('btnApply').addEventListener('click', apply);
  $('btnCancel').addEventListener('click', cancel);
  $('btnLang').addEventListener('click', function () {
    lang = lang === 'en' ? 'it' : 'en';
    try { localStorage.setItem('corvo.lang', lang); } catch (e) { /* storage blocked */ }
    applyLang();
    fillRegmarksSelect();              // MODULO 6
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
  mnInit();                            // MODULO 4/7
  setState('idle');
  applyLang();
  if (!cs) setStatus('notCep', null, 'warn');
  getWasm().catch(function (e) { console.warn('[corvo] wasm preload failed:', e); });

  // exposed for the verifier / debugging
  window.CorvoPanel = { state: function () { return S; }, hostCall: hostCall, startEngine: startEngine, t: t,
    evalRaw: function (script) { return hostIdle().then(function () { return evalHost(script); }); } };   // MODULO 5: raw read-only host query (document path for the CSV)
})();
