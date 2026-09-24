/*
 * Corvo — lato host (ExtendScript, ES3) del pannello di nesting per Illustrator.
 * Contratto: docs/plugin-architecture.md
 *
 *   corvoExport(optsJson)  -> geometria della selezione (anelli discretizzati, coordinate documento, pt, y in alto)
 *   corvoGroup(groupsJson) -> quali elementi esportati formano ciascun pezzo (oggetti sovrapposti, stampa+taglio)
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

if (!$.global.corvo) $.global.corvo = { items: [], raw: [], applied: [], doc: null, probe: null, roll: null, label: null };

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

/* ------------------------------------------------------------------ fedelta' al file (modulo 1) */

/* Nome di tinta piatta che indica una linea di taglio (CutContour, Thru-cut, Kiss-cut, Cut, ...).
   Confronto senza maiuscole, spazi, trattini, punti e underscore. Prefissi specifici (CutContour..., Through Cut Rectangle)
   oppure nomi brevi esatti con numero finale facoltativo (Cut, Cut2, Contour). */
function corvo_isCutName(name) {
    if (name === undefined || name === null) return false;
    var n = String(name).toLowerCase().replace(/[\s\-_.]+/g, '');
    if (/^(cutcontour|contourcut|thrucut|throughcut|kisscut|diecut|cutline|cutpath|perfcut|lineaditaglio|mezzotaglio)/.test(n)) return true;  // anche "Through Cut Rectangle"
    return /^(cut|cuts|cutter|contour|contourline|taglio)\d*$/.test(n);
}

/* nome della tinta piatta di un colore (SpotColor), altrimenti null */
function corvo_spotName(col) {
    var name = null;
    try { if (col && col.typename === 'SpotColor') { var sp = col.spot; name = String(sp.name); } } catch (e) { name = null; }
    return name;
}

/* {cut: nome tinta di taglio o null, visible: ha riempimento o traccia} per un PathItem */
function corvo_pathPaint(p) {
    var res = { cut: null, visible: false }, f = false, s = false, n;
    try { f = !!p.filled; } catch (e) { f = false; }
    try { s = !!p.stroked; } catch (e2) { s = false; }
    res.visible = f || s;
    if (s) { n = null; try { n = corvo_spotName(p.strokeColor); } catch (e3) {} if (corvo_isCutName(n)) res.cut = n; }
    if (!res.cut && f) { n = null; try { n = corvo_spotName(p.fillColor); } catch (e4) {} if (corvo_isCutName(n)) res.cut = n; }
    return res;
}

function corvo_rectRing(b) { return [[b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]]]; }

function corvo_boxAdd(acc, x, y) {
    var b = acc.box;
    if (x < b[0]) b[0] = x;
    if (x > b[2]) b[2] = x;
    if (y > b[1]) b[1] = y;
    if (y < b[3]) b[3] = y;
}
function corvo_boxAddRing(acc, r) { for (var k = 0; k < r.length; k++) corvo_boxAdd(acc, r[k][0], r[k][1]); }
function corvo_boxAddPath(acc, p) {
    // geometricBounds = 1 lettura DOM (le letture dei singoli punti costano ms ciascuna con Illustrator in background)
    try {
        var gb = p.geometricBounds;
        if (gb && gb[2] >= gb[0] && gb[1] >= gb[3]) { corvo_boxAdd(acc, gb[0], gb[1]); corvo_boxAdd(acc, gb[2], gb[3]); }
    } catch (e) { /* tracciato vuoto */ }
}

function corvo_addRing(acc, ring, cutName) {
    acc.rings.push(ring);
    if (acc.rg) acc.rg.push(acc.g || 0);                         // tracciato/tracciato composto di provenienza
    corvo_boxAddRing(acc, ring);
    if (cutName) { acc.cut.push(acc.rings.length - 1); acc.cutSpots[cutName] = true; }
}

/*
 * Visita un oggetto e accumula in acc:
 *   rings  : anelli chiusi dei tracciati visibili (gruppi con maschera: solo il tracciato di maschera)
 *   cut    : indici in rings dei tracciati con tinta piatta di taglio
 *   other  : rettangoli d'ingombro di oggetti non vettoriali (raster, collegati, simboli, mesh, ...)
 *   text   : numero di cornici di testo vivo
 *   box    : ingombro [l,t,r,b] di tutto (anche linee aperte e testo)
 * cutOnly: il contenuto mascherato di un gruppo con maschera serve solo a trovare linee di taglio.
 */
function corvo_scan(it, tol, acc, cutOnly) {
    var t = it.typename, i, k, r, pp;
    if (t === 'PathItem') {
        if (it.guides) return;
        pp = corvo_pathPaint(it);
        if (cutOnly && !pp.cut) return;
        if (!cutOnly) corvo_boxAddPath(acc, it);
        if (!pp.visible && !it.clipping && !pp.cut) return;      // tracciato invisibile: non e' disegno
        acc.g = (acc.g || 0) + 1;
        r = corvo_pathRing(it, tol);
        if (r) corvo_addRing(acc, r, pp.cut);
        return;
    }
    if (t === 'CompoundPathItem') {
        if (it.pathItems.length === 0) return;
        pp = corvo_pathPaint(it.pathItems[0]);                   // l'aspetto sta sul primo sottotracciato
        if (cutOnly && !pp.cut) return;
        var clip = false;
        try { clip = !!it.pathItems[0].clipping; } catch (e0) { clip = false; }
        acc.g = (acc.g || 0) + 1;                                // i sottotracciati formano UNA forma (fori pari-dispari)
        if (!cutOnly) corvo_boxAddPath(acc, it);
        if (!pp.visible && !clip && !pp.cut) return;
        var sub = it.pathItems, ns = sub.length;                 // collezione letta una volta (ogni accesso DOM costa)
        for (i = 0; i < ns; i++) {
            r = corvo_pathRing(sub[i], tol);
            if (r) corvo_addRing(acc, r, pp.cut);
        }
        return;
    }
    if (t === 'GroupItem') {
        if (it.clipped && !cutOnly) {
            var cps = corvo_clipPaths(it);
            if (cps.length > 0) {
                for (i = 0; i < cps.length; i++) {
                    var cp = cps[i], subs = cp.typename === 'PathItem' ? [cp] : cp.pathItems;
                    acc.g = (acc.g || 0) + 1;
                    for (k = 0; k < subs.length; k++) {
                        corvo_boxAddPath(acc, subs[k]);
                        r = corvo_pathRing(subs[k], tol);
                        if (r) corvo_addRing(acc, r, corvo_pathPaint(subs[k]).cut);
                    }
                }
                for (i = 0; i < it.pageItems.length; i++) {
                    var c0 = it.pageItems[i], isClip = false;
                    if (c0.hidden) continue;
                    for (k = 0; k < cps.length; k++) if (cps[k] === c0) isClip = true;
                    if (!isClip) corvo_scan(c0, tol, acc, true);
                }
                return;
            }
        }
        var kids = it.pageItems, nk = kids.length;
        for (i = 0; i < nk; i++) {
            var ch = kids[i];
            if (ch.hidden) continue;
            corvo_scan(ch, tol, acc, cutOnly);
        }
        return;
    }
    if (cutOnly) return;
    var gb = null;
    try { gb = it.geometricBounds; } catch (e1) { gb = null; }
    if (t === 'TextFrame' || t === 'LegacyTextItem') {
        acc.text++;
        if (gb) { corvo_boxAdd(acc, gb[0], gb[1]); corvo_boxAdd(acc, gb[2], gb[3]); }
        return;
    }
    // raster, collegati, simboli, mesh, grafici, plugin: si muovono col pezzo, ingombro = rettangolo
    acc.nonVector++;
    acc.nonVectorTypes[t] = true;
    if (gb && gb[2] > gb[0] && gb[1] > gb[3]) {
        var rr = corvo_rectRing(gb);
        acc.other.push(rr);
        corvo_boxAddRing(acc, rr);
    }
}

/* nascosto o bloccato, direttamente o tramite un livello/gruppo antenato */
function corvo_itemState(it) {
    var res = { hidden: false, locked: false }, o = it, guard = 0, tn;
    while (o && guard++ < 64) {
        tn = '';
        try { tn = o.typename; } catch (e) { break; }
        if (tn === 'Document') break;
        try {
            if (tn === 'Layer') { if (!o.visible) res.hidden = true; if (o.locked) res.locked = true; }
            else { if (o.hidden) res.hidden = true; if (o.locked) res.locked = true; }
        } catch (e2) { /* proprieta' non disponibile */ }
        try { o = o.parent; } catch (e3) { break; }
    }
    return res;
}

function corvo_layerName(it) {
    var n = '';
    try { n = String(it.layer.name); } catch (e) { n = ''; }
    return n;
}

/* Campioni con nome di taglio che NON sono tinte piatte (quadricromia globale o semplice): il RIP/plotter non li
   riconosce come linea di taglio e li stampa (problema n. 1 degli utenti). Solo avviso: Corvo non cambia i campioni. */
function corvo_processCutSwatches(doc) {
    var out = [], seen = {}, i, n;
    try {
        for (i = 0; i < doc.spots.length; i++) {
            var sp = doc.spots[i];
            n = String(sp.name);
            if (corvo_isCutName(n) && sp.colorType !== ColorModel.SPOT && !seen[n]) { seen[n] = true; out.push(n); }
        }
    } catch (e) { /* nessuna tinta */ }
    try {
        for (i = 0; i < doc.swatches.length; i++) {
            var sw = doc.swatches[i];
            n = String(sw.name);
            if (seen[n] || !corvo_isCutName(n)) continue;
            var ct = '';
            try { ct = sw.color.typename; } catch (e2) { ct = ''; }
            if (ct !== 'SpotColor') { seen[n] = true; out.push(n); }
        }
    } catch (e3) { /* nessun campione */ }
    return out;
}

/* true se il documento ha almeno una tinta piatta con nome di taglio (altrimenti niente da cercare) */
function corvo_hasCutSpot(doc) {
    try { for (var i = 0; i < doc.spots.length; i++) if (corvo_isCutName(doc.spots[i].name)) return true; } catch (e) { /* nessuna tinta */ }
    return false;
}

/* true se it o un suo antenato e' in list (confronto per identita') */
function corvo_underAny(it, list) {
    var o = it, guard = 0, tn;
    while (o && guard++ < 64) {
        for (var k = 0; k < list.length; k++) if (list[k] === o) return true;
        tn = '';
        try { tn = o.typename; } catch (e) { return false; }
        if (tn === 'Layer' || tn === 'Document') return false;
        try { o = o.parent; } catch (e2) { return false; }
    }
    return false;
}

/*
 * Linee di taglio (tinta piatta di taglio) BLOCCATE o NASCOSTE (direttamente o via livello/gruppo) che non fanno parte
 * della selezione: Corvo non le sposta e non sblocca nulla. Il pannello decide: se toccano un pezzo -> errore chiaro
 * (la stampa si sposterebbe senza il suo taglio); se contengono piu' pezzi (rettangolo del foglio) -> solo avviso.
 */
function corvo_lockedCuts(doc, raw) {
    var out = [];
    if (!corvo_hasCutSpot(doc)) return out;
    var ps = doc.pathItems, n = 0;
    try { n = ps.length; } catch (e) { n = 0; }
    for (var i = 0; i < n && out.length < 500; i++) {
        var p = ps[i], pp = null;
        try { pp = corvo_pathPaint(p); } catch (e1) { pp = null; }
        if (!pp || !pp.cut) continue;
        var ist = corvo_itemState(p);
        if (!ist.locked && !ist.hidden) continue;
        var ln = corvo_layerName(p);
        if (ln === 'Corvo') continue;
        if (corvo_underAny(p, raw)) continue;                 // dentro un oggetto selezionato: si muove con lui
        var gb = null;
        try { gb = p.geometricBounds; } catch (e2) { gb = null; }
        if (!gb) continue;
        var nm = '';
        try { nm = p.name || ''; } catch (e3) { nm = ''; }
        out.push({ name: nm, spot: pp.cut, layer: ln, reason: ist.hidden ? 'hidden' : 'locked', box: [gb[0], gb[1], gb[2], gb[3]] });
    }
    return out;
}

/* ------------------------------------------------------------------ MODULO 8: immagini raster (DTF) */

// MODULO 8 — PlacedItem (collegato) e RasterItem (incorporato) diventano pezzi il cui contorno viene dalla
// trasparenza. Il contorno lo calcola il pannello (client/js/raster.js); l'host esporta solo DOVE sono i pixel:
//   raster: { path, temp, kind: 'linked'|'render', corners: { tl:[x,y], tr:[x,y], bl:[x,y] } }
// corners = coordinate documento (pt, y in alto) dei vertici (0,0), (W,0), (0,H) dell'immagine (y pixel in basso).
// Percorso veloce: PlacedItem collegato a un .png, senza rotazione/inclinazione (anche specchiato) -> file originale,
// corners dai geometricBounds (scambiati secondo gli specchi). In tutti gli altri casi (incorporato, TIF/PSD/JPG, ruotato o inclinato, link
// mancante) render PNG24 trasparente in un documento temporaneo: i pixel sono allineati agli assi e coprono
// esattamente i visibleBounds dell'oggetto. Limiti: vedi docs/plugin-architecture.md, "Modulo 8".
// Segno di matrix.mValueD per un PNG collegato dritto. VERIFICATO in Illustrator 30.5.1 (2026-09-24): dritto -> D < 0
// (es. 1 / -1 al 100 %), specchiato in verticale -> D > 0; specchiato in orizzontale -> A < 0.
var CORVO_M8_PLACED_DSIGN = -1;

function corvo_m8_isRaster(it) { return it.typename === 'PlacedItem' || it.typename === 'RasterItem'; }

/* PNG collegato allineato agli assi (anche specchiato): il pannello legge il file originale, niente render.
   corners = punti documento dei pixel (0,0), (W,0), (0,H) del file: dipendono dagli specchi (segni di A e D). */
function corvo_m8_linked(it) {
    if (it.typename !== 'PlacedItem') return null;
    var f = null, m = null;
    try { f = it.file; m = it.matrix; } catch (e) { return null; }
    if (!f || !f.exists || !/\.png$/i.test(f.name) || !m) return null;
    if (Math.abs(m.mValueB) > 1e-6 || Math.abs(m.mValueC) > 1e-6) return null;
    if (!(Math.abs(m.mValueA) > 1e-9) || !(Math.abs(m.mValueD) > 1e-9)) return null;
    var gb = it.geometricBounds;
    var mirrorH = m.mValueA < 0, mirrorV = m.mValueD * CORVO_M8_PLACED_DSIGN < 0;
    var xL = mirrorH ? gb[2] : gb[0], xR = mirrorH ? gb[0] : gb[2];
    var yT = mirrorV ? gb[3] : gb[1], yB = mirrorV ? gb[1] : gb[3];
    return { path: f.fsName, temp: false, kind: 'linked', mirror: (mirrorH ? 'H' : '') + (mirrorV ? 'V' : ''),
             corners: { tl: [xL, yT], tr: [xR, yT], bl: [xL, yB] } };
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

/*
 * corvoExport({flatness}) -> un elemento per ogni oggetto di primo livello della selezione (esclusi: livello Corvo,
 * nascosti, bloccati -> "excluded"). Il raggruppamento in pezzi (oggetti sovrapposti, forma di taglio, crocini)
 * lo decide il pannello (client/js/cluster.js) e lo comunica con corvoGroup(); senza corvoGroup ogni elemento
 * e' un pezzo (compatibile v0.1).
 */
function corvoExport(optsJson) {
    return corvo_withDocCoords(function () {
        if (app.documents.length === 0) return corvo_err('Nessun documento aperto');
        var opts = corvo_parse(optsJson);
        var tol = (opts && opts.flatness > 0) ? Number(opts.flatness) : 0.5;
        var doc = app.activeDocument;
        var sel = doc.selection;
        if (!sel || sel.length === undefined || sel.length === 0) return corvo_err('Seleziona gli oggetti da disporre');

        var st = corvo_state();
        var raw = [], out = [], excluded = [], i, k;
        for (i = 0; i < sel.length; i++) {
            var it = sel[i];
            var lname = corvo_layerName(it);
            if (lname === 'Corvo') continue;                     // rotolo di una sessione precedente
            var nm = '';
            try { nm = it.name || ''; } catch (e0) { nm = ''; }
            var ist = corvo_itemState(it);
            if (ist.hidden || ist.locked) {
                excluded.push({ name: nm || it.typename, layer: lname, reason: ist.hidden ? 'hidden' : 'locked' });
                continue;
            }
            // MODULO 8: immagini raster (PlacedItem/RasterItem di primo livello) come oggetti: il contorno dalla
            // trasparenza lo calcola il pannello (client/js/raster.js) PRIMA del raggruppamento del modulo 1.
            // Rasters dentro un gruppo restano "other" (rettangolo d'ingombro) come nel modulo 1.
            if (opts && opts.raster && corvo_m8_isRaster(it)) {
                var ri;
                try { ri = corvo_m8_info(it, doc, i, opts); }
                catch (e8) { return corvo_err('Oggetto ' + (i + 1) + ' (' + (nm || it.typename) + '): ' + e8.message); }
                var vb8 = it.visibleBounds, b8 = [vb8[0], vb8[1], vb8[2], vb8[3]];
                raw.push(it);
                out.push({ i: raw.length - 1, name: nm, type: it.typename, layer: lname, rings: [], raster: ri, bounds: b8, box: b8 });
                continue;
            }
            var acc = { rings: [], rg: [], g: 0, cut: [], cutSpots: {}, other: [], text: 0, nonVector: 0, nonVectorTypes: {},
                        box: [1e30, -1e30, -1e30, 1e30] };
            try { corvo_scan(it, tol, acc, false); }
            catch (e) { return corvo_err('Oggetto ' + (i + 1) + ' (' + (nm || it.typename) + '): ' + e.message); }
            if (!(acc.box[2] >= acc.box[0]) || !(acc.box[1] >= acc.box[3])) continue;   // niente di geometrico
            var spots = [], nv = [];
            for (k in acc.cutSpots) if (acc.cutSpots.hasOwnProperty(k)) spots.push(k);
            for (k in acc.nonVectorTypes) if (acc.nonVectorTypes.hasOwnProperty(k)) nv.push(k);
            var rb = null;
            if (acc.rings.length) {                               // bounds dei soli anelli (compatibile v0.1)
                var l = 1e30, tt = -1e30, rr = -1e30, bb = 1e30;
                for (var q = 0; q < acc.rings.length; q++) {
                    var rg = acc.rings[q];
                    for (var j = 0; j < rg.length; j++) {
                        var x = rg[j][0], y = rg[j][1];
                        if (x < l) l = x;
                        if (x > rr) rr = x;
                        if (y > tt) tt = y;
                        if (y < bb) bb = y;
                    }
                }
                rb = [l, tt, rr, bb];
            }
            var idx = raw.length;
            raw.push(it);
            var o = { i: idx, name: nm, type: it.typename, layer: lname, rings: acc.rings, bounds: rb || acc.box, box: acc.box };
            if (acc.rings.length) o.rg = acc.rg;                  // anello -> tracciato di provenienza (area riempita)
            if (acc.cut.length) { o.cut = acc.cut; o.cutSpots = spots; }
            if (acc.other.length) o.other = acc.other;
            if (acc.text) o.text = acc.text;
            if (acc.nonVector) { o.nonVector = acc.nonVector; o.nonVectorTypes = nv; }
            // MODULO 4: colori di riempimento per il nesting per colore (host/multinest.jsx)
            if (opts && opts.paint && typeof corvo_m4_paint === 'function') { try { o.paint = corvo_m4_paint(it); } catch (eP) { o.paint = []; } }
            out.push(o);
        }
        if (raw.length === 0) {
            if (excluded.length) return corvo_json({ error: 'Gli oggetti selezionati sono nascosti o bloccati', code: 'allExcluded', n: excluded.length });
            return corvo_err('La selezione non contiene oggetti da disporre');
        }

        st.raw = raw;
        st.items = []; st.applied = [];
        for (i = 0; i < raw.length; i++) { st.items.push([raw[i]]); st.applied.push({ a: 0, tx: 0, ty: 0 }); }
        st.doc = doc;
        st.probe = corvo_probe(doc);
        st.steps = 0;                                            // passi di annullamento creati dalla sessione
        st.orig = [];                                            // ingombro originale di ogni elemento (annullo unico)
        for (i = 0; i < raw.length; i++) { var ob = null; try { ob = raw[i].geometricBounds; } catch (eo) { ob = null; } st.orig.push(ob ? [ob[0], ob[1], ob[2], ob[3]] : null); }

        var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
        var abs = [];
        for (i = 0; i < doc.artboards.length; i++) abs.push(doc.artboards[i].artboardRect);
        return corvo_json({
            doc: { name: doc.name, abLeft: ab[0], abTop: ab[1], abRight: ab[2], abBottom: ab[3], artboards: abs },
            items: out,
            excluded: excluded,
            lockedCuts: corvo_lockedCuts(doc, raw),
            processCuts: corvo_processCutSwatches(doc)
        });
    });
}

/*
 * corvoGroup(groupsJson) — [[0,3],[1],[2,4],...]: indici degli elementi di corvoExport che formano ciascun pezzo.
 * Il pezzo k (l'indice usato poi da corvoApply) sposta tutti i suoi membri con la stessa trasformazione; ogni membro
 * resta sul suo livello. Gli elementi non elencati (es. crocini di registro) non vengono mai toccati.
 */
function corvoGroup(groupsJson) {
    return corvo_withDocCoords(function () {
        var st = corvo_state();
        if (!st.raw || st.raw.length === 0) return corvo_err('Nessuna sessione attiva: esegui prima corvoExport');
        if (corvo_docGone(st)) { corvo_resetState(); return corvo_err(CORVO_DOC_CLOSED); }
        corvo_m3_clear(st);                                      // MODULO 3: sagome di un piano precedente
        for (var c = 0; c < st.applied.length; c++) {
            var ap = st.applied[c];
            if (ap.a !== 0 || ap.tx !== 0 || ap.ty !== 0) return corvo_err('corvoGroup va chiamato prima di corvoApply');
        }
        var groups = corvo_parse(groupsJson);
        if (!(groups instanceof Array)) return corvo_err('groupsJson deve essere un array');
        var items = [], applied = [], used = {}, members = 0;
        for (var g = 0; g < groups.length; g++) {
            var gr = groups[g], mem = [];
            if (!(gr instanceof Array) || gr.length === 0) return corvo_err('gruppo ' + g + ' vuoto');
            for (var k = 0; k < gr.length; k++) {
                var ix = Number(gr[k]);
                if (!(ix >= 0 && ix < st.raw.length) || ix !== Math.floor(ix)) return corvo_err('indice ' + gr[k] + ' fuori intervallo');
                if (used[ix]) return corvo_err('elemento ' + ix + ' in due pezzi');
                used[ix] = true;
                mem.push(st.raw[ix]);
                members++;
            }
            items.push(mem);
            applied.push({ a: 0, tx: 0, ty: 0 });
        }
        st.items = items; st.applied = applied;
        return corvo_json({ ok: true, pieces: items.length, members: members });
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
    var mem = st.items[i];                       // pezzo = uno o piu oggetti (corvoGroup), ognuno resta sul suo livello
    if (!(mem instanceof Array)) mem = [mem];
    for (var k = 0; k < mem.length; k++) mem[k].transform(m, true, true, true, true, 1, Transformation.DOCUMENTORIGIN);
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
        if (moved > 0) st.steps = (st.steps || 0) + 1;
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
    $.global.corvo = { items: [], raw: [], applied: [], doc: null, probe: null, roll: null, label: null };
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
        st.steps = (st.steps || 0) + 1;

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
        if (typeof corvo_mnRemove === 'function') { try { corvo_mnRemove(doc); } catch (eMn) {} }   // MODULO 4/7
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
        corvo_m3_clear(st);                                      // MODULO 3: via le sagome delle copie
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

/* true se ogni elemento della sessione e' di nuovo al suo ingombro originale (tolleranza 0.01 pt); max = quanti controllarne */
function corvo_atOrigin(st, max) {
    var n = st.raw ? st.raw.length : 0, step = 1;
    if (max && n > max) step = Math.ceil(n / max);
    for (var i = 0; i < n; i += step) {
        var o = st.orig[i], b = null;
        if (!o) continue;
        try { b = st.raw[i].geometricBounds; } catch (e) { return false; }
        if (!b) return false;
        for (var k = 0; k < 4; k++) if (Math.abs(b[k] - o[k]) > 0.01) return false;
    }
    return true;
}

/*
 * Annullo unico (checklist E2): la ricerca dal vivo ha lasciato st.steps passi nella cronologia (uno per ogni
 * corvoApply/corvoRoll). Li riavvolgiamo con app.undo() finche' tutto e' al punto di partenza e il rotolo non esiste,
 * poi rifacciamo la disposizione finale in QUESTO script = un solo Ctrl+Z per tornare all'originale.
 * Se il riavvolgimento non torna esattamente all'origine entro st.steps passi (es. l'utente ha modificato il
 * documento durante la sessione) si rifanno i passi annullati (app.redo) e si lascia la cronologia com'era.
 */
function corvo_singleUndo(st, keepRoll) {
    var steps = st.steps || 0;
    if (steps <= 0 || steps > 3000 || !st.raw || !st.orig) return 'skip';
    var doc = st.doc, fin = [], rollB = null, k, i;
    for (i = 0; i < st.applied.length; i++) fin.push(st.applied[i]);
    if (corvo_alive(st.roll)) { try { rollB = st.roll.geometricBounds; rollB = [rollB[0], rollB[1], rollB[2], rollB[3]]; } catch (e0) { rollB = null; } }
    // NIENTE margine oltre st.steps: un passo in piu' puo' essere una modifica dell'utente durante la revisione (es. un
    // pezzo spostato a mano) e verrebbe annullata e persa (verificato 24/09). Se non si torna all'origine si rifa' tutto.
    var maxUndo = steps;
    var undone = 0, ok = false, why = '';
    for (k = 0; k < maxUndo; k++) {
        try { app.undo(); } catch (e1) { why = 'undo: ' + e1.message; break; }
        undone++;
        var ly = null;
        try { ly = doc.layers.getByName('Corvo'); } catch (e2) { ly = null; }
        var rollGone = !ly || !corvo_findIn(ly, 'pathItems', 'Corvo_Roll');
        // MODULO 6: anche i crocini di anteprima devono essere spariti (i loro passi sono contati in st.steps)
        var rmGone = !(typeof corvo_rmPresent === 'function' && corvo_rmPresent(doc));
        var ghostsGone = !(st.m3 && ly && corvo_findIn(ly, 'pathItems', 'Corvo_Ghost'));   // MODULO 3
        // MODULO 4/7: anche i contenitori multipli (rotoli per colore, fogli) devono essere spariti
        if (typeof corvo_mnPresent === 'function' && corvo_mnPresent(doc)) rollGone = false;
        if (rollGone && rmGone && ghostsGone && corvo_atOrigin(st, 8) && corvo_atOrigin(st, 0)) { ok = true; break; }
        why = 'roll ' + (rollGone ? 'gone' : 'present') + ', marks ' + (rmGone ? 'gone' : 'present') +
              ', ghosts ' + (ghostsGone ? 'gone' : 'present') + ', origin ' + corvo_atOrigin(st, 0);
    }
    $.global.corvoLastUndo = { steps: steps, undone: undone, ok: ok, why: why };   // diagnostica: perche' l'annullo unico e' saltato
    if (!ok) {
        for (k = 0; k < undone; k++) { try { app.redo(); } catch (e3) { break; } }
        return 'restored';
    }
    // tutto all'origine: stato "nessuna trasformazione", poi la disposizione finale in un colpo solo
    // MODULO 3: le sagome non esistono piu' (annullate): si spostano solo i pezzi, poi si creano le copie vere
    var nPieces = st.m3 ? st.m3.base : fin.length, m3fin = st.m3 ? fin.slice(nPieces) : null;
    if (st.m3) { st.items.length = nPieces; st.applied.length = nPieces; }
    for (i = 0; i < st.applied.length; i++) st.applied[i] = { a: 0, tx: 0, ty: 0 };
    st.roll = null; st.label = null;
    for (i = 0; i < nPieces; i++) corvo_move(st, i, fin[i].a, fin[i].tx, fin[i].ty);
    if (m3fin) st.m3made = corvo_m3_materialize(st, m3fin);
    if (keepRoll && rollB) {
        var cl = corvo_layer(doc, true), r = cl.pathItems.add();
        r.name = 'Corvo_Roll_rif'; r.filled = false; r.stroked = true; r.strokeWidth = 0.75;
        var col = new RGBColor(); col.red = 255; col.green = 128; col.blue = 0; r.strokeColor = col;
        r.setEntirePath([[rollB[0], rollB[3]], [rollB[2], rollB[3]], [rollB[2], rollB[1]], [rollB[0], rollB[1]]]);
        r.closed = true;
    }
    // MODULO 6: crocini confermati ridisegnati nello stesso script (gia' "_rif")
    if (st.rmPayload && typeof corvo_rmDraw === 'function') { try { corvo_rmDraw(doc, st.rmPayload, '_rif'); } catch (eRm) {} }
    // MODULO 4/7: contenitori confermati (con le etichette "Corvo — colore — L mm" / fogli) nello stesso script
    if (keepRoll && st.mnPayload && typeof corvo_mnDraw === 'function') { try { corvo_mnDraw(doc, st.mnPayload, '_rif'); } catch (eMn) {} }
    return 'single';
}

function corvoFinish(optsJson) {
    return corvo_withDocCoords(function () {
        var st = corvo_state();
        if (corvo_docGone(st)) { corvo_resetState(); return corvo_err(CORVO_DOC_CLOSED); }
        var opts = corvo_parse(optsJson);
        var keepRoll = !(opts && opts.keepRoll === false);
        var undo = 'off';
        if (!(opts && opts.singleUndo === false)) {
            try { undo = corvo_singleUndo(st, keepRoll); } catch (eu) { undo = 'error: ' + eu.message; }
            if (undo === 'single') {
                var made1 = st.m3made;                               // MODULO 3
                corvo_resetState(); corvo_redraw();
                return corvo_json(made1 ? { ok: true, undo: undo, copies: made1.made, copyErrors: made1.errors } : { ok: true, undo: undo });
            }
        }
        // MODULO 3: senza annullo unico le copie si creano qui (dalle posizioni delle sagome), poi via le sagome
        var made2 = null;
        if (st.m3) {
            var m3fin2 = st.applied.slice(st.m3.base), m3keep = st.m3;
            corvo_m3_clear(st);
            st.m3 = m3keep;
            made2 = corvo_m3_materialize(st, m3fin2);
            st.m3 = null;
        }
        corvo_removeRollAndLabel(st, !keepRoll);
        if (keepRoll && corvo_alive(st.roll)) { try { st.roll.name = 'Corvo_Roll_rif'; } catch (e) {} }
        if (typeof corvo_rmFinishAll === 'function') { try { corvo_rmFinishAll(st.doc); } catch (eRm) {} }   // MODULO 6
        if (typeof corvo_mnFinishAll === 'function') { try { corvo_mnFinishAll(st.doc, keepRoll); } catch (eMn) {} }   // MODULO 4/7
        corvo_resetState();
        corvo_redraw();
        return corvo_json(made2 ? { ok: true, undo: undo, copies: made2.made, copyErrors: made2.errors } : { ok: true, undo: undo });
    });
}

/* ------------------------------------------------------------------ MODULO 3 */
/*
 * Copie per design e coppie specchiate (client/js/quantity.js). Durante la ricerca le copie sono SAGOME leggere
 * (tracciati "Corvo_Ghost" sul livello Corvo = il poligono di Sparrow, <= 200 punti) agli indici st.m3.base + k:
 * corvoApply le muove con lo stesso contratto assoluto dei pezzi, quindi l'anteprima dal vivo resta veloce anche con
 * centinaia di copie (niente duplicati pesanti di gruppi/maschere ad ogni aggiornamento).
 * Applica (corvoFinish): per ogni copia si duplicano TUTTI i membri del pezzo sorgente con
 * duplicate(membro, PLACEBEFORE) = stesso livello/gruppo, subito sopra l'originale (tinte piatte, livelli e ordine di
 * impilamento dentro la copia conservati), i duplicati tornano alla posizione ORIGINALE del sorgente, si specchiano
 * rispetto alla verticale x = axis se la copia e' specchiata, poi ricevono la mossa finale della loro sagoma.
 * Con l'annullo unico le sagome vengono annullate insieme al resto e i duplicati nascono nello stesso script: un solo
 * Ctrl+Z toglie disposizione, rotolo, crocini e copie. Annulla (corvoRevert) toglie solo le sagome: non esiste
 * nessun duplicato prima di Applica.
 */
function corvoM3Ghosts(json) {
    return corvo_withDocCoords(function () {
        var st = corvo_state();
        if (!st.items || st.items.length === 0) return corvo_err('Nessuna sessione attiva: esegui prima corvoExport');
        if (corvo_docGone(st)) { corvo_resetState(); return corvo_err(CORVO_DOC_CLOSED); }
        corvo_m3_clear(st);
        var o = corvo_parse(json) || {}, list = o.copies || [], base = st.items.length;
        if (o.base !== undefined && Number(o.base) !== base) return corvo_err('corvoM3Ghosts: base ' + o.base + ' ma i pezzi sono ' + base);
        for (var c = 0; c < st.applied.length; c++) {
            var ap = st.applied[c];
            if (ap.a !== 0 || ap.tx !== 0 || ap.ty !== 0) return corvo_err('corvoM3Ghosts va chiamato prima di corvoApply');
        }
        if (list.length === 0) return corvo_json({ ok: true, base: base, n: 0 });
        var ly = corvo_layer(st.doc, true);
        var col = new RGBColor(); col.red = 0; col.green = 150; col.blue = 255;
        var copies = [];
        st.m3 = { base: base, copies: copies };
        for (var k = 0; k < list.length; k++) {
            var cp = list[k], src = Number(cp.src), ring = cp.ring;
            if (!(src >= 0 && src < base) || src !== Math.floor(src)) { corvo_m3_clear(st); return corvo_err('copia ' + k + ': sorgente ' + cp.src + ' fuori intervallo'); }
            if (!(ring instanceof Array) || ring.length < 3) { corvo_m3_clear(st); return corvo_err('copia ' + k + ': sagoma non valida'); }
            var p = ly.pathItems.add();
            p.setEntirePath(ring);
            p.closed = true; p.filled = false; p.stroked = true; p.strokeWidth = 0.5; p.strokeColor = col;
            try { p.strokeDashes = [4, 2]; } catch (eD) {}
            p.name = 'Corvo_Ghost';
            st.items.push([p]);
            st.applied.push({ a: 0, tx: 0, ty: 0 });
            copies.push({ src: src, mirror: !!cp.mirror, axis: Number(cp.axis) || 0 });
        }
        st.steps = (st.steps || 0) + 1;
        corvo_redraw();
        return corvo_json({ ok: true, base: base, n: copies.length });
    });
}

/* rimuove le sagome e riporta items/applied ai soli pezzi */
function corvo_m3_clear(st) {
    if (!st || !st.m3) return;
    var base = st.m3.base;
    for (var i = base; i < st.items.length; i++) {
        var g = st.items[i] && st.items[i][0];
        if (corvo_alive(g)) { try { g.remove(); } catch (e) {} }
    }
    if (st.items.length > base) st.items.length = base;
    if (st.applied.length > base) st.applied.length = base;
    st.m3 = null;
}

/* specchia gli oggetti rispetto alla verticale x = axis (coordinate documento): x' = 2 axis - x */
function corvo_m3_reflect(st, list, axis) {
    var pr = st.probe || { origin: [0, 0], sign: 1, post: true };
    // Illustrator: x' = o + M(x - o) + T con M = diag(-1, 1)  ->  T = (2 axis - 2 o.x, 0)
    var tx = 2 * axis - 2 * pr.origin[0];
    var m = app.getScaleMatrix(-100, 100);
    if (pr.post) m = app.concatenateTranslationMatrix(m, tx, 0);
    else m = app.concatenateTranslationMatrix(m, -tx, 0);          // pre: M·(x + M^-1 T), M^-1 T = (-tx, 0)
    // stesso changeLineWidths di corvo_move (verificato con le rotazioni): |det| = 1, lo spessore non cambia
    for (var k = 0; k < list.length; k++) list[k].transform(m, true, true, true, true, 1, Transformation.DOCUMENTORIGIN);
}

/* crea le copie vere. finals[k] = mossa assoluta {a,tx,ty} della copia k (quella della sua sagoma) */
function corvo_m3_materialize(st, finals) {
    var res = { made: 0, errors: [] };
    if (!st.m3) return res;
    var cps = st.m3.copies;
    for (var k = 0; k < cps.length; k++) {
        var c = cps[k], fin = finals[k], dups = [];
        if (!fin) continue;
        try {
            var mem = st.items[c.src];
            if (!(mem instanceof Array)) mem = [mem];
            for (var j = 0; j < mem.length; j++) dups.push(mem[j].duplicate(mem[j], ElementPlacement.PLACEBEFORE));
            var cur = st.applied[c.src] || { a: 0, tx: 0, ty: 0 };
            var tmp = { items: [dups], applied: [{ a: cur.a, tx: cur.tx, ty: cur.ty }], probe: st.probe };
            corvo_move(tmp, 0, 0, 0, 0);                   // duplicato riportato alla posizione ORIGINALE del sorgente
            if (c.mirror) corvo_m3_reflect(st, dups, c.axis);
            tmp.applied[0] = { a: 0, tx: 0, ty: 0 };
            corvo_move(tmp, 0, Number(fin.a) || 0, Number(fin.tx) || 0, Number(fin.ty) || 0);
            res.made++;
        } catch (e) {
            for (var d = 0; d < dups.length; d++) { try { dups[d].remove(); } catch (e2) {} }
            res.errors.push('copia ' + k + ': ' + e.message);
        }
    }
    return res;
}

/* firma veloce della selezione (nessuna lettura di punti): il pannello riusa l'esportazione di "Leggi selezione" */
function corvoM3SelSig() {
    return corvo_withDocCoords(function () {
        if (app.documents.length === 0) return corvo_json({ sig: '' });
        var doc = app.activeDocument, sel = doc.selection, parts = [doc.name, sel ? sel.length : 0];
        if (sel) for (var i = 0; i < sel.length; i++) {
            var b = null;
            try { b = sel[i].geometricBounds; } catch (e) { b = null; }
            parts.push(sel[i].typename + (b ? ':' + Math.round(b[0] * 100) + ',' + Math.round(b[1] * 100) + ',' + Math.round(b[2] * 100) + ',' + Math.round(b[3] * 100) : ''));
        }
        return corvo_json({ sig: parts.join('|') });
    });
}

/* ------------------------------------------------------------------ MODULO 6 */
// Crocini di registro (host/regmarks.jsx), caricati accanto a questo file. Se $.fileName non e' disponibile
// il pannello carica regmarks.jsx da se' (main.js, rmEnsureHost).
try { $.evalFile(new File(new File($.fileName).parent.fsName + '/regmarks.jsx')); } catch (eRM) { /* vedi pannello */ }

/* ------------------------------------------------------------------ MODULO 4 / MODULO 7 */
// Colori per il nesting per colore e contenitori multipli (host/multinest.jsx); se $.fileName non e' disponibile
// il pannello carica multinest.jsx da se' (main.js, mnEnsureHost).
try { $.evalFile(new File(new File($.fileName).parent.fsName + '/multinest.jsx')); } catch (eMN) { /* vedi pannello */ }
