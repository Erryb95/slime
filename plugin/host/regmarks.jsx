/*
 * Corvo — Modulo 6: crocini di registro print&cut, lato host (ExtendScript, ES3).
 * Caricato da corvo.jsx ($.evalFile relativo a $.fileName) o, in mancanza, dal pannello.
 * Usa gli helper di corvo.jsx (corvo_json, corvo_err, corvo_parse, corvo_withDocCoords, corvo_state, corvo_alive).
 * La geometria la calcola il pannello (client/js/regmarks.js): qui si disegna e basta.
 *
 *   corvoRegmarks(payloadJson) -> disegna i crocini (sostituisce quelli precedenti)
 *       payload: {"system":"graphtec","layer":"Regmarks","printable":true,"color":{"c":0,"m":0,"y":0,"k":100},
 *                 "marks":[{"poly":[[x,y],...]} | {"circle":[cx,cy,r]}, ...],
 *                 "frame":[x0,y0,x1,y1]}            (frame solo per Mimaki: rettangolo per "Crea crocini" di FineCut)
 *       coordinate documento, pt, y in alto. Ritorna {"ok":true,"marks":n,"layer":"..."}.
 *   corvoRegmarksClear()       -> rimuove crocini e rettangolo FineCut; toglie i livelli Corvo rimasti vuoti.
 *   corvoRegmarksFinish()      -> conferma (Applica): rinomina in "..._rif", cosi' una sessione successiva non li tocca.
 *                                 Dal merge 1+6 lo fa gia' corvoFinish (stesso passo di annullamento); resta per compatibilita'.
 *
 * Oggetti creati: gruppo "Corvo_Regmarks" (tracciati pieni nero K100 / RGB 0,0,0, senza traccia) e, se richiesto,
 * il tracciato "Corvo_FineCut_Area", sul livello indicato dal payload (creato in cima se manca).
 */

var CORVO_RM_GROUP = 'Corvo_Regmarks';
var CORVO_RM_FRAME = 'Corvo_FineCut_Area';
var CORVO_RM_LAYERS = ['Regmarks', 'Regmarks FineCut (guida)'];

function corvo_rmDoc() {
    var st = (typeof corvo_state === 'function') ? corvo_state() : null;
    if (st && st.doc && corvo_alive(st.doc)) return st.doc;
    return app.activeDocument;
}

function corvo_rmBlack(doc, c) {
    c = c || { c: 0, m: 0, y: 0, k: 100 };
    var isCmyk = false;
    try { isCmyk = doc.documentColorSpace === DocumentColorSpace.CMYK; } catch (e) { isCmyk = false; }
    if (isCmyk) {
        var k = new CMYKColor();
        k.cyan = Number(c.c) || 0; k.magenta = Number(c.m) || 0; k.yellow = Number(c.y) || 0; k.black = Number(c.k);
        if (isNaN(k.black)) k.black = 100;
        return k;
    }
    var r = new RGBColor(); r.red = 0; r.green = 0; r.blue = 0;   // K100 in un documento RGB = nero pieno
    return r;
}

function corvo_rmIsOurLayer(name) {
    for (var i = 0; i < CORVO_RM_LAYERS.length; i++) if (CORVO_RM_LAYERS[i] === name) return true;
    return false;
}

/* rimuove gruppo/rettangolo da tutti i livelli di primo livello; toglie i nostri livelli rimasti vuoti */
function corvo_rmRemove(doc, extraLayer) {
    var removed = 0;
    for (var i = doc.layers.length - 1; i >= 0; i--) {
        var ly = doc.layers[i], name = ly.name;
        var ours = corvo_rmIsOurLayer(name) || name === extraLayer;
        var g = null, f = null;
        try { g = ly.groupItems.getByName(CORVO_RM_GROUP); } catch (e1) { g = null; }
        try { f = ly.pathItems.getByName(CORVO_RM_FRAME); } catch (e2) { f = null; }
        if ((g || f) && (ly.locked || !ly.visible)) { try { ly.locked = false; ly.visible = true; } catch (e3) {} }
        while (g) {
            try { g.remove(); removed++; } catch (e4) { break; }
            try { g = ly.groupItems.getByName(CORVO_RM_GROUP); } catch (e5) { g = null; }
        }
        while (f) {
            try { f.remove(); } catch (e6) { break; }
            try { f = ly.pathItems.getByName(CORVO_RM_FRAME); } catch (e7) { f = null; }
        }
        if (ours) { try { if (ly.pageItems.length === 0 && ly.layers.length === 0) ly.remove(); } catch (e8) {} }
    }
    return removed;
}

function corvo_rmLayer(doc, name, printable) {
    var ly = null;
    try { ly = doc.layers.getByName(name); } catch (e) { ly = null; }
    if (!ly) {
        var prev = doc.activeLayer;
        ly = doc.layers.add();
        ly.name = name;
        try { doc.activeLayer = prev; } catch (e2) {}
    }
    try { if (ly.locked) ly.locked = false; if (!ly.visible) ly.visible = true; } catch (e3) {}
    try { ly.printable = !!printable; } catch (e4) {}
    return ly;
}

/* sessione Corvo attiva (per contare i passi di annullamento, vedi corvo_singleUndo in corvo.jsx) */
function corvo_rmSession() {
    var st = (typeof corvo_state === 'function') ? corvo_state() : null;
    return (st && st.doc && st.items && st.items.length && corvo_alive(st.doc)) ? st : null;
}

/* disegna crocini (+ rettangolo FineCut) del payload; suffix '' = anteprima, '_rif' = confermati. Ritorna n. */
function corvo_rmDraw(doc, p, suffix) {
    suffix = suffix || '';
    var name = String(p.layer || 'Regmarks');
    var ly = corvo_rmLayer(doc, name, p.printable !== false);
    var grp = ly.groupItems.add();
    grp.name = CORVO_RM_GROUP + suffix;
    var col = corvo_rmBlack(doc, p.color);
    var n = 0;
    for (var i = 0; i < p.marks.length; i++) {
        var m = p.marks[i], it;
        if (m.circle) {
            var cx = Number(m.circle[0]), cy = Number(m.circle[1]), r = Number(m.circle[2]);
            it = grp.pathItems.ellipse(cy + r, cx - r, 2 * r, 2 * r);   // top, left, width, height
        } else if (m.poly && m.poly.length >= 3) {
            it = grp.pathItems.add();
            it.setEntirePath(m.poly);
            it.closed = true;
        } else continue;
        it.filled = true;
        it.fillColor = col;
        it.stroked = false;
        it.name = 'Corvo_Regmark_' + i;
        n++;
    }
    if (p.frame && p.frame.length === 4) {
        var f = ly.pathItems.add();
        var x0 = Number(p.frame[0]), y0 = Number(p.frame[1]), x1 = Number(p.frame[2]), y1 = Number(p.frame[3]);
        f.setEntirePath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
        f.closed = true;
        f.filled = false;
        f.stroked = true;
        f.strokeWidth = 0.5;
        f.strokeColor = corvo_rmBlack(doc, p.color);
        f.name = CORVO_RM_FRAME + suffix;
    }
    return n;
}

/* ci sono crocini di anteprima (non ancora confermati) nel documento? */
function corvo_rmPresent(doc) {
    for (var i = 0; i < doc.layers.length; i++) {
        var ly = doc.layers[i], g = null, f = null;
        try { g = ly.groupItems.getByName(CORVO_RM_GROUP); } catch (e1) { g = null; }
        try { f = ly.pathItems.getByName(CORVO_RM_FRAME); } catch (e2) { f = null; }
        if (g || f) return true;
    }
    return false;
}

/* conferma: rinomina in "..._rif" cosi' una sessione successiva non li tocca */
function corvo_rmFinishAll(doc) {
    var kept = 0;
    for (var i = 0; i < doc.layers.length; i++) {
        var ly = doc.layers[i], g = null, f = null;
        try { g = ly.groupItems.getByName(CORVO_RM_GROUP); } catch (e1) { g = null; }
        try { f = ly.pathItems.getByName(CORVO_RM_FRAME); } catch (e2) { f = null; }
        if (g) { try { g.name = CORVO_RM_GROUP + '_rif'; kept++; } catch (e3) {} }
        if (f) { try { f.name = CORVO_RM_FRAME + '_rif'; } catch (e4) {} }
    }
    return kept;
}

function corvoRegmarks(payloadJson) {
    return corvo_withDocCoords(function () {
        if (app.documents.length === 0) return corvo_err('Nessun documento aperto');
        var p = corvo_parse(payloadJson);
        if (!p || !(p.marks instanceof Array)) return corvo_err('payload crocini non valido');
        var doc = corvo_rmDoc();
        var name = String(p.layer || 'Regmarks');
        var st = corvo_rmSession();
        var removed = corvo_rmRemove(doc, name);
        // merge moduli 1+6: ogni disegno/rimozione e' un passo di annullamento della sessione; corvoFinish lo
        // riavvolge insieme alle mosse e ridisegna st.rmPayload confermato nello stesso script (un solo Ctrl+Z)
        if (st) { st.rmPayload = p.marks.length ? p : null; if (removed || p.marks.length) st.steps = (st.steps || 0) + 1; }
        if (p.marks.length === 0) { try { app.redraw(); } catch (e0) {} return corvo_json({ ok: true, marks: 0 }); }
        var n = corvo_rmDraw(doc, p, '');
        try { app.redraw(); } catch (e1) {}
        return corvo_json({ ok: true, marks: n, layer: name });
    });
}

function corvoRegmarksClear() {
    return corvo_withDocCoords(function () {
        if (app.documents.length === 0) return corvo_json({ ok: true, removed: 0 });
        var doc;
        try { doc = corvo_rmDoc(); } catch (e) { return corvo_json({ ok: true, removed: 0 }); }
        var st = corvo_rmSession();
        var n = corvo_rmRemove(doc, null);
        if (st) { st.rmPayload = null; if (n) st.steps = (st.steps || 0) + 1; }
        try { app.redraw(); } catch (e1) {}
        return corvo_json({ ok: true, removed: n });
    });
}

function corvoRegmarksFinish() {
    return corvo_withDocCoords(function () {
        if (app.documents.length === 0) return corvo_json({ ok: true, kept: 0 });
        return corvo_json({ ok: true, kept: corvo_rmFinishAll(corvo_rmDoc()) });
    });
}
