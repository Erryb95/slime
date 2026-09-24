/*
 * Corvo — Moduli 4 + 7: lato host (ExtendScript, ES3). Caricato da corvo.jsx a livello globale ($.evalFile, percorso assoluto da $.fileName) o,
 * in mancanza, dal pannello. Usa gli helper di corvo.jsx (corvo_json, corvo_err, corvo_parse, corvo_withDocCoords,
 * corvo_state, corvo_alive, corvo_docGone, corvo_layer, corvo_isCutName, corvo_spotName, corvo_redraw).
 *
 *   corvo_m4_paint(item)          -> [{c: colore, a: area pt²}] colori di riempimento dei tracciati visibili di un
 *                                    oggetto (tinte di taglio escluse; colori di traccia solo se non c'e' nessun
 *                                    riempimento). Chiamata da corvoExport con opts.paint (modulo 4).
 *       colore = {t:'spot',name,tint,base} | {t:'rgb',v:[r,g,b]} | {t:'cmyk',v:[c,m,y,k]} | {t:'gray',v:k%} | {t:'lab',v:[L,a,b]}
 *   corvoContainers(payloadJson)  -> disegna TUTTI i contenitori di una sessione multi-job (rotoli per colore impilati,
 *                                    fogli in fila): {"list":[{"ox","oy","w","h","label"}]} in pt documento.
 *                                    Sostituisce il disegno precedente; gruppo "Corvo_Containers" sul livello "Corvo".
 *                                    Conta un passo di annullamento della sessione (st.steps) e memorizza il payload
 *                                    (st.mnPayload) per l'annullo unico di corvoFinish.
 * Agganci in corvo.jsx marcati MODULO 4/7: corvoExport (paint), corvo_removeRollAndLabel (corvo_mnRemove),
 * corvo_singleUndo (corvo_mnPresent / corvo_mnDraw "_rif"), corvoFinish (corvo_mnFinishAll).
 */

var CORVO_MN_GROUP = 'Corvo_Containers';
var CORVO_M4_MAXPATHS = 3000;

/* ------------------------------------------------------------------ MODULO 4: colori di un oggetto */
function corvo_m4_color(c) {
    if (!c) return null;
    var t = '';
    try { t = c.typename; } catch (e) { return null; }
    try {
        if (t === 'SpotColor') {
            var sp = c.spot, base = null;
            try { base = corvo_m4_color(sp.color); } catch (e1) { base = null; }
            return { t: 'spot', name: String(sp.name), tint: Number(c.tint), base: base };
        }
        if (t === 'CMYKColor') return { t: 'cmyk', v: [Number(c.cyan), Number(c.magenta), Number(c.yellow), Number(c.black)] };
        if (t === 'RGBColor') return { t: 'rgb', v: [Number(c.red), Number(c.green), Number(c.blue)] };
        if (t === 'GrayColor') return { t: 'gray', v: Number(c.gray) };
        if (t === 'LabColor') return { t: 'lab', v: [Number(c.l), Number(c.a), Number(c.b)] };
    } catch (e2) { return null; }
    return null;                                               // NoColor, GradientColor, PatternColor
}

function corvo_m4_key(c) {
    if (!c) return 'none';
    if (c.t === 'spot') return 'spot:' + String(c.name).toLowerCase();
    if (c.v && c.v.length) { var s = c.t + ':'; for (var i = 0; i < c.v.length; i++) s += Math.round(c.v[i] * 10) / 10 + ','; return s; }
    return c.t + ':' + Math.round(Number(c.v) * 10) / 10;
}

/* visita i tracciati visibili (come corvo_scan: niente guide, figli nascosti esclusi; gruppo con maschera = contenuto) */
function corvo_m4_walk(it, acc) {
    if (acc.n > CORVO_M4_MAXPATHS) return;
    var t = it.typename, i;
    if (t === 'PathItem' || t === 'CompoundPathItem') {
        var p = t === 'PathItem' ? it : (it.pathItems.length ? it.pathItems[0] : null);
        if (!p) return;
        if (t === 'PathItem') { try { if (it.guides || it.clipping) return; } catch (e0) {} }
        acc.n++;
        var a = 0;
        try { a = Math.abs(Number(it.area)); } catch (e1) { a = 0; }   // CompoundPathItem.area non esiste in tutte le versioni
        if (!(a > 0) && t === 'CompoundPathItem') {
            var s = 0;
            try { for (i = 0; i < it.pathItems.length; i++) s += Number(it.pathItems[i].area); } catch (e2) {}
            a = Math.abs(s);
        }
        if (!(a > 0)) { try { var gb = it.geometricBounds; a = Math.abs((gb[2] - gb[0]) * (gb[1] - gb[3])); } catch (e3) { a = 0; } }
        var f = false, sk = false;
        try { f = !!p.filled; } catch (e4) {}
        try { sk = !!p.stroked; } catch (e5) {}
        if (f) {
            var fc = null;
            try { fc = p.fillColor; } catch (e6) {}
            if (!corvo_isCutName(corvo_spotName(fc))) corvo_m4_add(acc.fill, corvo_m4_color(fc), a);
        }
        if (sk) {
            var sc = null;
            try { sc = p.strokeColor; } catch (e7) {}
            if (!corvo_isCutName(corvo_spotName(sc))) corvo_m4_add(acc.stroke, corvo_m4_color(sc), a);
        }
        return;
    }
    if (t === 'GroupItem') {
        var kids = it.pageItems, nk = kids.length;
        for (i = 0; i < nk; i++) {
            var ch = kids[i];
            try { if (ch.hidden) continue; } catch (e8) {}
            corvo_m4_walk(ch, acc);
        }
    }
    // testo, raster, simboli: nessun colore di vinile (restano nel gruppo del loro colore dominante o "nessun colore")
}

function corvo_m4_add(map, c, a) {
    if (!c) return;
    var k = corvo_m4_key(c);
    if (!map[k]) map[k] = { c: c, a: 0 };
    map[k].a += a;
}

function corvo_m4_paint(it) {
    var acc = { fill: {}, stroke: {}, n: 0 }, out = [], k, src;
    corvo_m4_walk(it, acc);
    src = acc.fill;
    var any = false;
    for (k in src) if (src.hasOwnProperty(k)) { any = true; break; }
    if (!any) src = acc.stroke;                               // solo tracce (es. disegni al tratto per laser)
    for (k in src) if (src.hasOwnProperty(k)) out.push({ c: src[k].c, a: src[k].a });
    return out;
}

/* ------------------------------------------------------------------ MODULI 4 + 7: contenitori multipli */
function corvo_mnFind(doc, name) {
    var ly = null;
    try { ly = doc.layers.getByName('Corvo'); } catch (e) { ly = null; }
    if (!ly) return null;
    try { return ly.groupItems.getByName(name); } catch (e2) { return null; }
}

function corvo_mnRemove(doc) {
    var g = corvo_mnFind(doc, CORVO_MN_GROUP), guard = 0;
    while (g && guard++ < 20) {
        try { g.remove(); } catch (e) { break; }
        g = corvo_mnFind(doc, CORVO_MN_GROUP);
    }
}

function corvo_mnPresent(doc) { return !!corvo_mnFind(doc, CORVO_MN_GROUP); }

function corvo_mnOrange() { var c = new RGBColor(); c.red = 255; c.green = 128; c.blue = 0; return c; }

/* disegna i contenitori del payload; suffix '' = sessione, '_rif' = confermati */
function corvo_mnDraw(doc, p, suffix) {
    suffix = suffix || '';
    var ly = corvo_layer(doc, true);
    var grp = ly.groupItems.add();
    grp.name = CORVO_MN_GROUP + suffix;
    var list = p.list || [], n = 0;
    for (var i = 0; i < list.length; i++) {
        var o = list[i], ox = Number(o.ox), oy = Number(o.oy), w = Number(o.w), h = Number(o.h);
        if (isNaN(ox) || isNaN(oy) || !(w > 0) || !(h > 0)) continue;
        var r = grp.pathItems.add();
        r.setEntirePath([[ox, oy], [ox + w, oy], [ox + w, oy + h], [ox, oy + h]]);
        r.closed = true; r.filled = false; r.stroked = true; r.strokeWidth = 0.75;
        r.strokeColor = corvo_mnOrange();
        r.name = 'Corvo_Container_' + (i + 1);
        if (o.label) {
            var size = Math.max(12, Math.min(72, Math.min(h, 2000) * 0.04));
            var lab = grp.textFrames.add();
            lab.contents = String(o.label);
            lab.textRange.characterAttributes.size = size;
            lab.textRange.characterAttributes.fillColor = corvo_mnOrange();
            lab.position = [ox, oy + h + size * 1.3];
            lab.name = 'Corvo_Container_Label_' + (i + 1);
        }
        n++;
    }
    return n;
}

function corvoContainers(payloadJson) {
    return corvo_withDocCoords(function () {
        if (app.documents.length === 0) return corvo_err('Nessun documento aperto');
        var p = corvo_parse(payloadJson);
        if (!p || !p.list) return corvo_err('payload contenitori non valido');
        var st = corvo_state();
        if (corvo_docGone(st)) { corvo_resetState(); return corvo_err(CORVO_DOC_CLOSED); }
        var doc = st.doc || app.activeDocument;
        if (st.doc) st.steps = (st.steps || 0) + 1;
        corvo_mnRemove(doc);
        var n = corvo_mnDraw(doc, p, '');
        st.mnPayload = p;
        corvo_redraw();
        return corvo_json({ ok: true, n: n });
    });
}

/* Applica senza annullo unico: conferma (rinomina "_rif") o toglie i contenitori */
function corvo_mnFinishAll(doc, keep) {
    var g = corvo_mnFind(doc, CORVO_MN_GROUP);
    if (!g) return;
    if (keep) { try { g.name = CORVO_MN_GROUP + '_rif'; } catch (e) {} }
    else corvo_mnRemove(doc);
}
