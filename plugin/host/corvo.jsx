/*
 * Corvo — lato host (ExtendScript, ES3) del pannello di nesting per Illustrator.
 * Contratto: docs/plugin-architecture.md
 *
 *   corvoExport(optsJson)  -> geometria della selezione (anelli discretizzati, coordinate documento, pt, y in alto)
 *   corvoApply(movesJson)  -> trasformazioni ASSOLUTE per pezzo, applicate come delta con una sola transform()
 *   corvoRoll(rollJson)    -> rettangolo del rotolo + etichetta sul livello "Corvo"
 *   corvoRevert()          -> riporta i pezzi alla posizione originale, rimuove rotolo ed etichetta
 *   corvoFinish(optsJson)  -> conferma le posizioni, rimuove l'etichetta, svuota lo stato
 *
 * Tutte le funzioni restituiscono una stringa JSON; errori come {"error":"..."}.
 */

/* ------------------------------------------------------------------ JSON */

function corvo_num(n) {
    if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return 'null';
    var r = Math.round(n * 1000) / 1000;
    if (r === 0) return '0';
    return String(r);
}

function corvo_str(s) {
    s = String(s);
    var out = '"';
    for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i), code = s.charCodeAt(i);
        if (c === '"') out += '\\"';
        else if (c === '\\') out += '\\\\';
        else if (c === '\n') out += '\\n';
        else if (c === '\r') out += '\\r';
        else if (c === '\t') out += '\\t';
        else if (code < 32) out += '\\u' + ('0000' + code.toString(16)).slice(-4);
        else out += c;
    }
    return out + '"';
}

function corvo_json(v) {
    if (v === null || v === undefined) return 'null';
    var t = typeof v;
    if (t === 'number') return corvo_num(v);
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return corvo_str(v);
    var parts = [], i;
    if (v instanceof Array) {
        for (i = 0; i < v.length; i++) parts.push(corvo_json(v[i]));
        return '[' + parts.join(',') + ']';
    }
    for (var k in v) {
        if (v.hasOwnProperty(k) && typeof v[k] !== 'function') parts.push(corvo_str(k) + ':' + corvo_json(v[k]));
    }
    return '{' + parts.join(',') + '}';
}

function corvo_parse(s) {
    if (s === undefined || s === null || s === '') return {};
    if (typeof s !== 'string') return s;
    if (typeof JSON !== 'undefined' && JSON.parse) return JSON.parse(s);
    return eval('(' + s + ')');
}

function corvo_err(msg) { return corvo_json({ error: String(msg) }); }

/* ------------------------------------------------------------------ stato */

if (!$.global.corvo) $.global.corvo = { items: [], applied: [], doc: null, probe: null, roll: null, label: null };

function corvo_state() { return $.global.corvo; }

function corvo_redraw() { try { app.redraw(); } catch (e) { /* nessun documento */ } }

/* Lavoriamo sempre nel sistema di coordinate DOCUMENTO; quello dell'utente viene ripristinato. */
function corvo_withDocCoords(fn) {
    var prev = null;
    try { prev = app.coordinateSystem; app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM; } catch (e) { prev = null; }
    try { return fn(); }
    catch (e2) { return corvo_err(e2.message + (e2.line ? ' (riga ' + e2.line + ')' : '')); }
    finally { if (prev !== null) { try { app.coordinateSystem = prev; } catch (e3) {} } }
}

/* ------------------------------------------------------------------ Bézier */

function corvo_flatCubic(out, p0, c1, c2, p3, tol, depth) {
    // scostamento della curva dalla corda = 3t(1-t)^2*d1 + 3t^2(1-t)*d2 <= 3/4*max(d1,d2)
    // (d = distanze con segno dei punti di controllo dalla corda) -> piatta se max(d1,d2) <= tol*4/3
    var dx = p3[0] - p0[0], dy = p3[1] - p0[1];
    var len2 = dx * dx + dy * dy, d1, d2;
    if (len2 < 1e-12) {
        d1 = Math.sqrt((c1[0] - p0[0]) * (c1[0] - p0[0]) + (c1[1] - p0[1]) * (c1[1] - p0[1]));
        d2 = Math.sqrt((c2[0] - p0[0]) * (c2[0] - p0[0]) + (c2[1] - p0[1]) * (c2[1] - p0[1]));
    } else {
        var inv = 1 / Math.sqrt(len2);
        d1 = Math.abs((c1[0] - p0[0]) * dy - (c1[1] - p0[1]) * dx) * inv * 0.75;
        d2 = Math.abs((c2[0] - p0[0]) * dy - (c2[1] - p0[1]) * dx) * inv * 0.75;
    }
    if ((d1 <= tol && d2 <= tol) || depth >= 16) { out.push([p3[0], p3[1]]); return; }
    // de Casteljau a t = 0.5
    var a = [(p0[0] + c1[0]) / 2, (p0[1] + c1[1]) / 2];
    var b = [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2];
    var c = [(c2[0] + p3[0]) / 2, (c2[1] + p3[1]) / 2];
    var ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    var bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    var m = [(ab[0] + bc[0]) / 2, (ab[1] + bc[1]) / 2];
    corvo_flatCubic(out, p0, a, ab, m, tol, depth + 1);
    corvo_flatCubic(out, m, bc, c, p3, tol, depth + 1);
}

function corvo_same(p, q) { return Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9; }

/* PathItem -> un anello chiuso (i tracciati aperti vengono chiusi con un segmento retto). null se < 3 punti. */
function corvo_pathRing(path, tol) {
    var pts = path.pathPoints, n = pts.length;
    if (n < 3) return null;
    var A = [], L = [], R = [], i;
    for (i = 0; i < n; i++) {
        var pp = pts[i];
        A.push(pp.anchor); L.push(pp.leftDirection); R.push(pp.rightDirection);
    }
    var closed = path.closed;
    var ring = [[A[0][0], A[0][1]]];
    var segs = closed ? n : n - 1;
    for (i = 0; i < segs; i++) {
        var j = (i + 1) % n;
        if (corvo_same(R[i], A[i]) && corvo_same(L[j], A[j])) ring.push([A[j][0], A[j][1]]);
        else corvo_flatCubic(ring, A[i], R[i], L[j], A[j], tol, 0);
    }
    // togli la chiusura duplicata
    if (ring.length > 1 && corvo_same(ring[0], ring[ring.length - 1])) ring.pop();
    return ring.length >= 3 ? ring : null;
}

/* ------------------------------------------------------------------ raccolta anelli */

function corvo_unsupported(it) {
    switch (it.typename) {
        case 'TextFrame': return 'Converti il testo in tracciati (Maiusc+Ctrl+O)';
        case 'LegacyTextItem': return 'Converti il testo in tracciati (Maiusc+Ctrl+O)';
        // MODULO 8: con "Immagini: contorno" attivo nel pannello le immagini diventano pezzi (vedi corvo_m8_*)
        case 'PlacedItem': return 'Immagine collegata: attiva "Immagini" nel pannello (contorno dalla trasparenza) o vettorializzala';
        case 'RasterItem': return 'Immagine raster: attiva "Immagini" nel pannello (contorno dalla trasparenza) o vettorializzala';
        case 'SymbolItem': return 'Scollega il simbolo (Oggetto > Espandi) prima del nesting';
        case 'MeshItem': return 'Le trame (mesh) non sono supportate: espandi l\'oggetto';
        case 'GraphItem': return 'I grafici non sono supportati: espandi l\'oggetto';
        case 'PluginItem': return 'Espandi l\'oggetto (Oggetto > Espandi) prima del nesting';
        case 'NonNativeItem': return 'Oggetto non nativo: espandilo prima del nesting';
    }
    return null;
}

function corvo_clipPaths(group) {
    // i tracciati di maschera di un gruppo con maschera (PathItem o CompoundPathItem)
    var res = [], its = group.pageItems;
    for (var i = 0; i < its.length; i++) {
        var it = its[i];
        if (it.typename === 'PathItem' && it.clipping) res.push(it);
        else if (it.typename === 'CompoundPathItem' && it.pathItems.length > 0 && it.pathItems[0].clipping) res.push(it);
    }
    return res;
}

function corvo_collect(it, tol, rings) {
    var t = it.typename, i, r;
    if (t === 'PathItem') {
        if (it.guides) return;
        r = corvo_pathRing(it, tol);
        if (r) rings.push(r);
        return;
    }
    if (t === 'CompoundPathItem') {
        for (i = 0; i < it.pathItems.length; i++) {
            r = corvo_pathRing(it.pathItems[i], tol);
            if (r) rings.push(r);
        }
        return;
    }
    if (t === 'GroupItem') {
        if (it.clipped) {
            var cps = corvo_clipPaths(it);
            if (cps.length > 0) {
                for (i = 0; i < cps.length; i++) corvo_collect(cps[i], tol, rings);
                return;
            }
        }
        for (i = 0; i < it.pageItems.length; i++) {
            var ch = it.pageItems[i];
            if (ch.hidden) continue;
            corvo_collect(ch, tol, rings);
        }
        return;
    }
    var msg = corvo_unsupported(it);
    throw new Error(msg || ('Tipo di oggetto non supportato: ' + t));
}

/* ------------------------------------------------------------------ sonda trasformazioni */

/*
 * Misura empiricamente come transform(..., DOCUMENTORIGIN) si comporta nel sistema di coordinate corrente:
 *   origin : punto fisso della rotazione (atteso 0,0)
 *   sign   : +1 se getRotationMatrix(+θ) ruota in senso antiorario (y in alto), -1 altrimenti
 *   post   : true se concatenateTranslationMatrix(M,tx,ty) applica la traslazione DOPO M
 */
function corvo_probe(doc) {
    var res = { origin: [0, 0], sign: 1, post: true, ok: false };
    var m = app.concatenateTranslationMatrix(app.getRotationMatrix(90), 10, 0);
    res.post = Math.abs(m.mValueTX - 10) < 1e-6 && Math.abs(m.mValueTY) < 1e-6;
    var layer = null, tmpLayer = null, prevActive = null;
    try {
        for (var i = 0; i < doc.layers.length; i++) {
            var ly = doc.layers[i];
            if (!ly.locked && ly.visible) { layer = ly; break; }
        }
        if (!layer) {
            prevActive = doc.activeLayer;
            tmpLayer = doc.layers.add(); layer = tmpLayer;
        }
        var p = layer.pathItems.add();
        p.setEntirePath([[137, 251], [138, 251]]);
        var pos = p.pathPoints[0].anchor;             // la stessa coordinata letta (dopo arrotondamenti interni)
        p.transform(app.getRotationMatrix(180), true, true, true, true, 1, Transformation.DOCUMENTORIGIN);
        var q = p.pathPoints[0].anchor;
        var o = [(pos[0] + q[0]) / 2, (pos[1] + q[1]) / 2];
        p.transform(app.getRotationMatrix(180), true, true, true, true, 1, Transformation.DOCUMENTORIGIN);
        p.transform(app.getRotationMatrix(90), true, true, true, true, 1, Transformation.DOCUMENTORIGIN);
        var s = p.pathPoints[0].anchor;
        // antiorario: o + (-(y-oy), x-ox)
        var ccw = [o[0] - (pos[1] - o[1]), o[1] + (pos[0] - o[0])];
        res.sign = (Math.abs(s[0] - ccw[0]) + Math.abs(s[1] - ccw[1]) < 0.01) ? 1 : -1;
        res.origin = o;
        res.ok = true;
        p.remove();
    } catch (e) {
        res.error = e.message;
    } finally {
        if (tmpLayer) { try { tmpLayer.remove(); } catch (e2) {} }
        if (prevActive) { try { doc.activeLayer = prevActive; } catch (e3) {} }
    }
    return res;
}

/* ------------------------------------------------------------------ MODULO 8: immagini raster (DTF) */

// MODULO 8 — PlacedItem (collegato) e RasterItem (incorporato) diventano pezzi il cui contorno viene dalla
// trasparenza. Il contorno lo calcola il pannello (client/js/raster.js); l'host esporta solo DOVE sono i pixel:
//   raster: { path, temp, kind: 'linked'|'render', corners: { tl:[x,y], tr:[x,y], bl:[x,y] } }
// corners = coordinate documento (pt, y in alto) dei vertici (0,0), (W,0), (0,H) dell'immagine (y pixel in basso).
// Percorso veloce: PlacedItem collegato a un .png, senza rotazione/inclinazione/specchiatura -> file originale,
// corners dai geometricBounds. In tutti gli altri casi (incorporato, TIF/PSD/JPG, ruotato, specchiato, link
// mancante) render PNG24 trasparente in un documento temporaneo: i pixel sono allineati agli assi e coprono
// esattamente i visibleBounds dell'oggetto. Limiti: vedi docs/plugin-architecture.md, "Modulo 8".
var CORVO_M8_PLACED_DSIGN = 1;   // segno di matrix.mValueD per un PNG collegato dritto: DA VERIFICARE in Illustrator

function corvo_m8_isRaster(it) { return it.typename === 'PlacedItem' || it.typename === 'RasterItem'; }

function corvo_m8_linked(it) {
    if (it.typename !== 'PlacedItem') return null;
    var f = null, m = null;
    try { f = it.file; m = it.matrix; } catch (e) { return null; }
    if (!f || !f.exists || !/\.png$/i.test(f.name) || !m) return null;
    if (Math.abs(m.mValueB) > 1e-6 || Math.abs(m.mValueC) > 1e-6) return null;
    if (!(m.mValueA > 0) || !(m.mValueD * CORVO_M8_PLACED_DSIGN > 0)) return null;
    var gb = it.geometricBounds;
    return { path: f.fsName, temp: false, kind: 'linked',
             corners: { tl: [gb[0], gb[1]], tr: [gb[2], gb[1]], bl: [gb[0], gb[3]] } };
}

function corvo_m8_render(it, doc, idx, opts) {
    var vb = it.visibleBounds, w = vb[2] - vb[0], h = vb[1] - vb[3];
    if (!(w > 0.01 && h > 0.01)) throw new Error('immagine vuota');
    var ppi = opts.rasterPpi > 0 ? Number(opts.rasterPpi) : 150;
    var maxPx = opts.rasterMaxPx > 0 ? Number(opts.rasterMaxPx) : 4000;
    var scale = ppi / 72 * 100, lim = maxPx / Math.max(w, h) * 100;
    if (scale > lim) scale = lim;
    if (scale > 776) scale = 776;                  // limiti di ExportOptionsPNG24
    if (scale < 1) scale = 1;
    var base = 'corvo_m8_' + (new Date()).getTime() + '_' + idx;
    var file = new File(Folder.temp.fsName + '/' + base + '.png');
    var tmp = app.documents.add(DocumentColorSpace.RGB, Math.max(w, 1), Math.max(h, 1));
    try {
        var dup = it.duplicate(tmp.layers[0], ElementPlacement.PLACEATEND);
        var dvb = dup.visibleBounds;
        dup.translate(-dvb[0], -dvb[3]);           // in basso a sinistra sull'origine, dentro la tela
        tmp.artboards[0].artboardRect = dup.visibleBounds;
        var o = new ExportOptionsPNG24();
        o.transparency = true; o.antiAliasing = true; o.artBoardClipping = true; o.saveAsHTML = false;
        o.horizontalScale = scale; o.verticalScale = scale;
        tmp.exportFile(file, ExportType.PNG24, o);
    } finally {
        try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e1) {}
        try { doc.activate(); } catch (e2) {}
    }
    if (!file.exists) {                            // alcune versioni aggiungono un suffisso al nome
        var alt = Folder.temp.getFiles(base + '*.png');
        if (alt && alt.length) file = alt[0];
        else throw new Error('export del PNG temporaneo non riuscito');
    }
    return { path: file.fsName, temp: true, kind: 'render', ppi: scale * 72 / 100,
             corners: { tl: [vb[0], vb[1]], tr: [vb[2], vb[1]], bl: [vb[0], vb[3]] } };
}

function corvo_m8_info(it, doc, idx, opts) {
    var r = opts.rasterRender ? null : corvo_m8_linked(it);
    return r || corvo_m8_render(it, doc, idx, opts);
}

/* ------------------------------------------------------------------ export */

function corvoExport(optsJson) {
    return corvo_withDocCoords(function () {
        if (app.documents.length === 0) return corvo_err('Nessun documento aperto');
        var opts = corvo_parse(optsJson);
        var tol = (opts && opts.flatness > 0) ? Number(opts.flatness) : 0.5;
        var doc = app.activeDocument;
        var sel = doc.selection;
        if (!sel || sel.length === undefined || sel.length === 0) return corvo_err('Seleziona gli oggetti da disporre');

        var st = corvo_state();
        var items = [], applied = [], out = [], i;
        for (i = 0; i < sel.length; i++) {
            var it = sel[i];
            // MODULO 8: immagini raster come pezzi (il contorno dalla trasparenza lo calcola il pannello)
            if (opts && opts.raster && corvo_m8_isRaster(it)) {
                var ri;
                try { ri = corvo_m8_info(it, doc, i, opts); }
                catch (e8) { return corvo_err('Oggetto ' + (i + 1) + ' (' + (it.name || it.typename) + '): ' + e8.message); }
                var vb8 = it.visibleBounds;
                items.push(it);
                applied.push({ a: 0, tx: 0, ty: 0 });
                out.push({ i: items.length - 1, name: it.name || '', type: it.typename, rings: [], raster: ri,
                           bounds: [vb8[0], vb8[1], vb8[2], vb8[3]] });
                continue;
            }
            var rings = [];
            try { corvo_collect(it, tol, rings); }
            catch (e) { return corvo_err('Oggetto ' + (i + 1) + ' (' + (it.name || it.typename) + '): ' + e.message); }
            if (rings.length === 0) continue;               // niente di chiuso da disporre (linee, punti)
            var l = 1e30, t = -1e30, r = -1e30, b = 1e30;
            for (var k = 0; k < rings.length; k++) {
                var rg = rings[k];
                for (var j = 0; j < rg.length; j++) {
                    var x = rg[j][0], y = rg[j][1];
                    if (x < l) l = x; if (x > r) r = x; if (y > t) t = y; if (y < b) b = y;
                }
            }
            var idx = items.length;
            items.push(it);
            applied.push({ a: 0, tx: 0, ty: 0 });
            out.push({ i: idx, name: it.name || '', type: it.typename, rings: rings, bounds: [l, t, r, b] });
        }
        if (items.length === 0) return corvo_err('La selezione non contiene tracciati chiusi');

        st.items = items; st.applied = applied; st.doc = doc;
        st.probe = corvo_probe(doc);

        var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
        return corvo_json({
            doc: { name: doc.name, abLeft: ab[0], abTop: ab[1], abRight: ab[2], abBottom: ab[3] },
            items: out
        });
    });
}

/* ------------------------------------------------------------------ apply */

/* Porta ogni pezzo dalla trasformazione applied[i] a quella desiderata con UNA transform(). */
function corvo_move(st, i, aNew, txNew, tyNew) {
    var old = st.applied[i];
    var da = aNew - old.a;
    // normalizza in (-180, 180]
    da = da % 360; if (da > 180) da -= 360; if (da <= -180) da += 360;
    var rad = da * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    // D(x) = R(da)x + (t_new - R(da) t_old)
    var tx = txNew - (c * old.tx - s * old.ty);
    var ty = tyNew - (s * old.tx + c * old.ty);
    if (Math.abs(da) < 1e-9 && Math.abs(tx) < 1e-6 && Math.abs(ty) < 1e-6) {
        st.applied[i] = { a: aNew, tx: txNew, ty: tyNew };
        return false;
    }
    var pr = st.probe || { origin: [0, 0], sign: 1, post: true };
    // Illustrator ruota attorno a o: x' = o + M(x - o) + T  ->  T = t + R o - o
    var ox = pr.origin[0], oy = pr.origin[1];
    tx += (c * ox - s * oy) - ox;
    ty += (s * ox + c * oy) - oy;
    var m = app.getRotationMatrix(pr.sign * da);
    if (pr.post) m = app.concatenateTranslationMatrix(m, tx, ty);
    else m = app.concatenateTranslationMatrix(m, c * tx + s * ty, -s * tx + c * ty); // pre: M·(x + R⁻¹T)
    st.items[i].transform(m, true, true, true, true, 1, Transformation.DOCUMENTORIGIN);
    st.applied[i] = { a: aNew, tx: txNew, ty: tyNew };
    return true;
}

function corvoApply(movesJson) {
    return corvo_withDocCoords(function () {
        var t0 = new Date().getTime();
        var st = corvo_state();
        if (!st.items || st.items.length === 0) return corvo_err('Nessuna sessione attiva: esegui prima corvoExport');
        if (corvo_docGone(st)) { corvo_resetState(); return corvo_err(CORVO_DOC_CLOSED); }
        var moves = corvo_parse(movesJson);
        if (!(moves instanceof Array)) return corvo_err('movesJson deve essere un array');
        var moved = 0, errors = [];
        for (var k = 0; k < moves.length; k++) {
            var mv = moves[k], i = mv.i;
            if (i < 0 || i >= st.items.length) { errors.push('indice ' + i + ' fuori intervallo'); continue; }
            try {
                if (corvo_move(st, i, Number(mv.a) || 0, Number(mv.tx) || 0, Number(mv.ty) || 0)) moved++;
            } catch (e) {
                errors.push('pezzo ' + i + ': ' + e.message);
            }
        }
        var t1 = new Date().getTime();
        corvo_redraw();
        var t2 = new Date().getTime();
        var res = { ok: errors.length === 0, ms: t2 - t0, msTransform: t1 - t0, moved: moved };
        if (errors.length) res.errors = errors;
        return corvo_json(res);
    });
}

/* ------------------------------------------------------------------ rotolo */

/* NB: in ExtendScript l'errore "Object is invalid" lanciato dentro l'espressione di un `return` NON viene
   intercettato dal try/catch della stessa funzione: le letture vanno fatte in istruzioni separate. */
function corvo_alive(it) {
    var ok = false;
    try { if (it) { var t = it.typename; var p = it.parent; ok = !!(t && p); } } catch (e) { ok = false; }
    return ok;
}

var CORVO_DOC_CLOSED = 'Il documento della sessione Corvo è stato chiuso: sessione annullata';

/* true se c'è una sessione legata a un documento che non esiste più */
function corvo_docGone(st) { return !!st.doc && !corvo_alive(st.doc); }

function corvo_resetState() {
    $.global.corvo = { items: [], applied: [], doc: null, probe: null, roll: null, label: null };
}

function corvo_layer(doc, create) {
    var ly = null;
    try { ly = doc.layers.getByName('Corvo'); } catch (e) { ly = null; }
    if (!ly && create) {
        var prev = doc.activeLayer;
        ly = doc.layers.add();
        ly.name = 'Corvo';
        try { doc.activeLayer = prev; } catch (e2) {}
    }
    if (ly) { try { if (ly.locked) ly.locked = false; if (!ly.visible) ly.visible = true; } catch (e3) {} }
    return ly;
}

function corvo_findIn(ly, coll, name) {
    try { return ly[coll].getByName(name); } catch (e) { return null; }
}

function corvoRoll(rollJson) {
    return corvo_withDocCoords(function () {
        if (app.documents.length === 0) return corvo_err('Nessun documento aperto');
        var o = corvo_parse(rollJson);
        var ox = Number(o.ox), oy = Number(o.oy), w = Number(o.w), h = Number(o.h);
        if (isNaN(ox) || isNaN(oy) || !(w > 0) || !(h > 0)) return corvo_err('rollJson non valido');
        var st = corvo_state();
        if (corvo_docGone(st)) { corvo_resetState(); return corvo_err(CORVO_DOC_CLOSED); }
        var doc = st.doc || app.activeDocument;
        var ly = corvo_layer(doc, true);

        var rect = corvo_alive(st.roll) ? st.roll : corvo_findIn(ly, 'pathItems', 'Corvo_Roll');
        if (!rect) {
            rect = ly.pathItems.add();
            rect.name = 'Corvo_Roll';
            rect.filled = false;
            rect.stroked = true;
            rect.strokeWidth = 0.75;
            var col = new RGBColor(); col.red = 255; col.green = 128; col.blue = 0;
            rect.strokeColor = col;
        }
        rect.setEntirePath([[ox, oy], [ox + w, oy], [ox + w, oy + h], [ox, oy + h]]);
        rect.closed = true;
        st.roll = rect;

        var lab = corvo_alive(st.label) ? st.label : corvo_findIn(ly, 'textFrames', 'Corvo_Label');
        var size = Math.max(12, Math.min(72, h * 0.04));
        if (!lab) {
            lab = ly.textFrames.add();
            lab.name = 'Corvo_Label';
            lab.contents = ' ';
            var tc = new RGBColor(); tc.red = 255; tc.green = 128; tc.blue = 0;
            lab.textRange.characterAttributes.fillColor = tc;
        }
        lab.contents = 'Corvo: ' + (Math.round(w * 25.4 / 72 * 10) / 10) + ' mm';
        if (Math.abs(lab.textRange.characterAttributes.size - size) > 0.01) lab.textRange.characterAttributes.size = size;
        // appoggiata sopra il lato superiore del rotolo, allineata a sinistra
        lab.position = [ox, oy + h + size * 1.3];
        st.label = lab;
        corvo_redraw();
        return corvo_json({ ok: true });
    });
}

function corvo_removeRollAndLabel(st, removeRoll) {
    var doc = st.doc;
    if (!doc) { try { doc = app.activeDocument; } catch (e) { return; } }
    var ly = corvo_layer(doc, false);
    var lab = corvo_alive(st.label) ? st.label : (ly ? corvo_findIn(ly, 'textFrames', 'Corvo_Label') : null);
    if (lab) { try { lab.remove(); } catch (e1) {} }
    st.label = null;
    if (removeRoll) {
        var rect = corvo_alive(st.roll) ? st.roll : (ly ? corvo_findIn(ly, 'pathItems', 'Corvo_Roll') : null);
        if (rect) { try { rect.remove(); } catch (e2) {} }
        st.roll = null;
    }
    if (ly) { try { if (ly.pageItems.length === 0 && ly.layers.length === 0) ly.remove(); } catch (e3) {} }
}

/* ------------------------------------------------------------------ revert / finish */

function corvoRevert() {
    return corvo_withDocCoords(function () {
        var t0 = new Date().getTime();
        var st = corvo_state();
        if (corvo_docGone(st)) { corvo_resetState(); return corvo_json({ ok: true, ms: 0, docClosed: true }); }
        if (!st.doc) { corvo_resetState(); return corvo_json({ ok: true, ms: 0, noSession: true }); }
        var errors = [];
        if (st.items) {
            for (var i = 0; i < st.items.length; i++) {
                try { corvo_move(st, i, 0, 0, 0); } catch (e) { errors.push('pezzo ' + i + ': ' + e.message); }
            }
        }
        corvo_removeRollAndLabel(st, true);
        corvo_redraw();
        var res = { ok: errors.length === 0, ms: new Date().getTime() - t0 };
        if (errors.length) res.errors = errors;
        return corvo_json(res);
    });
}

function corvoFinish(optsJson) {
    return corvo_withDocCoords(function () {
        var st = corvo_state();
        if (corvo_docGone(st)) { corvo_resetState(); return corvo_err(CORVO_DOC_CLOSED); }
        var opts = corvo_parse(optsJson);
        var keepRoll = !(opts && opts.keepRoll === false);
        corvo_removeRollAndLabel(st, !keepRoll);
        if (keepRoll && corvo_alive(st.roll)) { try { st.roll.name = 'Corvo_Roll_rif'; } catch (e) {} }
        corvo_resetState();
        corvo_redraw();
        return corvo_json({ ok: true });
    });
}
