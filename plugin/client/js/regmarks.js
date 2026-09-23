/* Corvo — Modulo 6: crocini di registro print&cut (docs/plugin-architecture.md, "Modulo 6").
 *
 * Funzioni pure, niente DOM: nel pannello CEP e' window.CorvoRegmarks, in Node module.exports.
 * Unita' interne: MILLIMETRI, sistema del ROTOLO: x lungo il rotolo (direzione di avanzamento, 0 = bordo di
 * testa/origine), y sulla larghezza (0 = bordo inferiore, H = larghezza rotolo). La conversione in punti del
 * documento la fa toDoc().
 *
 * Idea: i crocini stanno in due FASCE laterali (in basso e in alto) lungo tutto il rotolo. Il nest riceve una
 * striscia piu' bassa (H - 2·fascia) spostata in su di una fascia e in avanti di un margine di testa, quindi
 * nessun pezzo puo' entrare in una zona di rispetto: reserve() prima del nest, layout() dopo (quando si conosce
 * la lunghezza del nest).
 */
(function (root) {
  'use strict';

  var MM = 72 / 25.4;              // 1 mm in pt
  var K100 = { c: 0, m: 0, y: 0, k: 100 };

  /* Specifiche per sistema. Ogni valore ha la sua fonte in `src` (manuali in bench/real/regmarks/,
   * sintesi in bench/real/FINDINGS-modulo4-6.md). "Corvo" = scelta nostra dove il manuale non da' un numero.
   *   shape  'L'      angolo a L, vertice interno (verso la grafica), bracci verso l'esterno (Graphtec tipo 1,
   *                   Mimaki tipo 1 "outward"): ancora = vertice.
   *          'square' quadrato pieno (Summa OPOS): ancora = centro.
   *          'circle' cerchio pieno (Roland): ancora = centro, size = diametro.
   *   size   lato / lunghezza del braccio / diametro;  line = spessore della linea (solo L)
   *   edge   bordo laterale del materiale -> bordo esterno del crocino
   *   lead   bordo di testa (lato origine) -> bordo esterno del primo crocino
   *   trail  bordo esterno dell'ultimo crocino -> fine del materiale
   *   clear  zona di rispetto attorno al crocino, senza grafica
   *   maxSpan / minSpan  distanza massima / minima tra crocini consecutivi lungo il rotolo
   *   minCross / maxCross distanza ammessa tra i crocini sui due lati (trasversale)
   */
  var SPECS = {
    none: { id: 'none', label: 'Nessuno / None' },

    graphtec: {
      id: 'graphtec', label: 'Graphtec ARMS (Cutting Master)',
      shape: 'L', size: 10, sizeRange: [5, 20], line: 0.5, lineRange: [0.3, 1.0],
      edge: 30, lead: 15, trail: 35, clear: 6, maxSpan: 1000, minSpan: 0, minCross: 0, maxCross: null,
      color: K100, layer: 'Regmarks', printable: true, guideOnly: false,
      src: {
        shape: 'CE7000 manuale p.5-3: MARK TYPE 1, linea singola 0.3-1.0 mm, lato 5-20 mm',
        clear: 'p.5-4/5-5: area di scansione a = 6 mm, non stampare',
        lead: 'p.5-6: 15 mm lato origine, 35 mm lato opposto (tipo 1)',
        edge: 'p.4-5: rulli pressori >= 15 mm dal bordo + p.5-6: 15 mm rullo -> crocino',
        maxSpan: 'Corvo: il manuale non fissa un massimo; 1000 mm per la regolazione a segmenti di Cutting Master'
      },
      note: 'ARMS legge crocini tipo 1 disegnati in Illustrator: in Cutting Master / sul plotter impostare MARK TYPE 1 e lato 10 mm.'
    },

    summa: {
      id: 'summa', label: 'Summa OPOS',
      shape: 'square', size: 3, sizeRange: [3, 10], line: 0,
      edge: 20, lead: 10, trail: 40, clear: 3, maxSpan: 500, minSpan: 0, minCross: 0, maxCross: null,
      color: K100, layer: 'Regmarks', printable: true, guideOnly: false,
      src: {
        shape: 'SummaCut manuale cap.3: quadrati stampati attorno alla grafica, nero su bianco',
        size: 'Corvo: il lato non e\' nel manuale (3 mm = valore tipico dei plug-in Summa, da verificare)',
        edge: 'p.3-5: margine laterale >= 1 cm, preferibile 2 cm',
        lead: 'p.3-5: margine anteriore 1 cm; coda >= 4 cm',
        maxSpan: 'Corvo: il manuale lega solo il pannello OPOS alla distanza tra i marchi X; 500 mm'
      },
      note: 'Impostare in GoSign/WinPlug/Cutter Control lato e distanza dei marchi uguali a quelli disegnati.'
    },

    roland: {
      id: 'roland', label: 'Roland (VersaWorks / CutStudio)',
      shape: 'circle', size: 10, sizeRange: [10, 12.5], line: 0,
      edge: 10, lead: 20, trail: 50, clear: 5, maxSpan: 1600, minSpan: 0, minCross: 0, maxCross: null,
      color: K100, layer: 'Regmarks', printable: true, guideOnly: false,
      src: {
        shape: 'GS2-24 manuale p.15: cerchio pieno nero, diametro 10-12.5 mm',
        edge: 'p.161: C 10-60 mm, D 10-42.5 mm dal bordo',
        lead: 'p.161: F margine prima del crocino 20 mm, E dopo il crocino >= 50 mm',
        clear: 'Corvo: il manuale chiede l\'area dei crocini libera, senza un numero; 5 mm',
        maxSpan: 'p.160: precisione garantita fino a 1600 mm'
      },
      note: 'Se VersaWorks aggiunge i propri crocini, rendere non stampabile il livello Regmarks per non averli doppi.'
    },

    mimaki: {
      id: 'mimaki', label: 'Mimaki (FineCut / CG-AR)',
      shape: 'L', size: 10, sizeRange: [4, 40], line: 0.5, lineRange: [0.5, 1.0],
      edge: 10, lead: 20, trail: 45, clear: 10, maxSpan: 3000, minSpan: 50, minCross: 50, maxCross: 3000,
      color: K100, layer: 'Regmarks FineCut (guida)', printable: false, guideOnly: true,
      src: {
        shape: 'CSD200035 p.5: tipo 1 "outward"; p.3: linea 0.5-1.0 mm; p.7: lato default 10 mm (4-40)',
        clear: 'p.6: area non stampabile attorno al crocino = lunghezza del lato',
        lead: 'p.5: TP1 -> bordo anteriore >= 20 mm, TP2 -> bordo posteriore >= 45 mm',
        edge: 'p.5: rullo >= 5 mm dal crocino; Corvo 10 mm dal bordo',
        maxSpan: 'p.5: TP1-TP2 e TP1-TP3 tra 50 e 3000 mm'
      },
      note: 'FineCut legge solo crocini creati da FineCut: Corvo disegna una guida non stampabile e il rettangolo ' +
        'Corvo_FineCut_Area; selezionarlo e usare "Crea crocini" di FineCut con lato 10 mm.'
    }
  };

  var ORDER = ['none', 'graphtec', 'summa', 'roland', 'mimaki'];

  function spec(id) {
    var s = SPECS[id];
    if (!s) throw new Error('sistema crocini sconosciuto: ' + id);
    return s;
  }
  function active(s) { return !!(s && s.shape); }

  // estensione del crocino attorno all'ancora: `out` verso il bordo del materiale, `inn` verso la grafica
  function extents(s) {
    if (s.shape === 'L') return { out: s.size, inn: s.line / 2 };
    return { out: s.size / 2, inn: s.size / 2 };
  }

  /* Riserva PRIMA del nest (solo larghezza rotolo nota).
   * band   = altezza di ciascuna fascia laterale (crocino + rispetto) -> striscia del nest = H - 2·band
   * startX = x del primo allineamento di crocini = inizio del nest lungo il rotolo
   * endPad = dal fondo del nest alla fine del materiale (ancora finale + crocino + coda)
   */
  function reserve(id, rollWidthMm) {
    var s = spec(id), H = +rollWidthMm;
    if (!active(s)) return { id: 'none', band: 0, startX: 0, endPad: 0, nestHeight: H, offset: [0, 0] };
    var e = extents(s);
    var band = s.edge + e.out + e.inn + s.clear;
    var startX = s.lead + e.out;
    return {
      id: s.id, band: band, startX: startX, endPad: e.out + s.trail, nestHeight: H - 2 * band,
      offset: [startX, band]           // origine del nest nel sistema del rotolo
    };
  }

  function rect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
  function bboxOf(poly) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    for (var i = 0; i < poly.length; i++) {
      b[0] = Math.min(b[0], poly[i][0]); b[1] = Math.min(b[1], poly[i][1]);
      b[2] = Math.max(b[2], poly[i][0]); b[3] = Math.max(b[3], poly[i][1]);
    }
    return b;
  }

  // L pieno: vertice V, bracci lunghi s verso (dx, dy) = direzione esterna, spessore w centrato sulle linee
  function lShape(V, dx, dy, s, w) {
    var h = w / 2, x = V[0], y = V[1];
    // contorno a 6 vertici: angolo interno a (x - dx·h, y - dy·h), punte a distanza s dal vertice
    var xi = x - dx * h, yi = y - dy * h, xo = x + dx * h, yo = y + dy * h;
    var poly = [[xi, yi], [x + dx * s, yi], [x + dx * s, yo], [xo, yo], [xo, y + dy * s], [xi, y + dy * s]];
    if (signedArea(poly) < 0) poly.reverse();
    return poly;
  }
  // croce piena (crocini intermedi dei sistemi a L): centro C, lunghezza totale s, spessore w
  function crossShape(C, s, w) {
    var a = s / 2, h = w / 2, x = C[0], y = C[1];
    return [[x - h, y - a], [x + h, y - a], [x + h, y - h], [x + a, y - h], [x + a, y + h], [x + h, y + h],
      [x + h, y + a], [x - h, y + a], [x - h, y + h], [x - a, y + h], [x - a, y - h], [x - h, y - h]];
  }
  function signedArea(r) {
    var s = 0;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
    return s / 2;
  }

  /* Disposizione DOPO il nest.
   * nestLengthMm = lunghezza della striscia di Sparrow (strip_width in mm).
   * Ritorna { id, rollWidth, rollLength, nestOrigin:[x,y], nestHeight, nestLength, span, segments,
   *           anchorsX:[...], marks:[{kind:'corner'|'mid', side:'bottom'|'top', shape, anchor, poly|circle, box,
   *           keepOut}], frame:[x0,y0,x1,y1], warnings:[{code, vars}] }
   */
  function layout(id, rollWidthMm, nestLengthMm) {
    var s = spec(id), H = +rollWidthMm, Ln = Math.max(0, +nestLengthMm || 0);
    var r = reserve(id, H);
    var out = {
      id: s.id, rollWidth: H, nestOrigin: r.offset.slice(), nestHeight: r.nestHeight, nestLength: Ln,
      marks: [], anchorsX: [], warnings: [], segments: 0, span: 0, frame: null
    };
    if (!active(s)) { out.rollLength = Ln; return out; }
    if (!(r.nestHeight > 0)) {
      out.rollLength = Ln;
      out.warnings.push({ code: 'rmTooNarrow', vars: { w: round1(H), band: round1(r.band) } });
      return out;
    }
    var e = extents(s);
    var x0 = r.startX;
    var span = Math.max(Ln, s.minSpan || 0);
    var n = s.maxSpan ? Math.max(1, Math.ceil(span / s.maxSpan - 1e-9)) : 1;
    var x1 = x0 + span;
    out.span = span; out.segments = n;
    out.rollLength = x1 + r.endPad;
    for (var k = 0; k <= n; k++) out.anchorsX.push(x0 + span * k / n);

    var yB = s.edge + e.out, yT = H - s.edge - e.out;     // ancore (vertici o centri) lato basso / alto
    out.frame = [x0, yB, x1, yT];
    var sides = [{ side: 'bottom', y: yB, dy: -1 }, { side: 'top', y: yT, dy: 1 }];
    for (var si = 0; si < 2; si++) {
      var sd = sides[si];
      for (k = 0; k <= n; k++) {
        var x = out.anchorsX[k], corner = k === 0 || k === n, m = { kind: corner ? 'corner' : 'mid', side: sd.side };
        if (s.shape === 'L') {
          if (corner) {
            m.shape = 'L'; m.anchor = [x, sd.y];
            m.poly = lShape(m.anchor, k === 0 ? -1 : 1, sd.dy, s.size, s.line);
          } else {                     // croce centrata nella riga dei bracci
            m.shape = 'cross'; m.anchor = [x, sd.y + sd.dy * s.size / 2];
            m.poly = crossShape(m.anchor, s.size, s.line);
          }
          m.box = bboxOf(m.poly);
        } else if (s.shape === 'square') {
          m.shape = 'square'; m.anchor = [x, sd.y];
          m.poly = rect(x - s.size / 2, sd.y - s.size / 2, x + s.size / 2, sd.y + s.size / 2);
          m.box = bboxOf(m.poly);
        } else {
          m.shape = 'circle'; m.anchor = [x, sd.y];
          m.circle = [x, sd.y, s.size / 2];
          m.box = [x - s.size / 2, sd.y - s.size / 2, x + s.size / 2, sd.y + s.size / 2];
        }
        m.keepOut = [m.box[0] - s.clear, m.box[1] - s.clear, m.box[2] + s.clear, m.box[3] + s.clear];
        out.marks.push(m);
      }
    }
    if (n > 1) out.warnings.push({ code: 'rmIntermediate', vars: { n: n - 1, len: Math.round(span), max: s.maxSpan } });
    if (s.maxCross && yT - yB > s.maxCross) out.warnings.push({ code: 'rmCrossTooWide', vars: { d: Math.round(yT - yB), max: s.maxCross } });
    if (s.minCross && yT - yB < s.minCross) out.warnings.push({ code: 'rmCrossTooNarrow', vars: { d: Math.round(yT - yB), min: s.minCross } });
    if (s.guideOnly) out.warnings.push({ code: 'rmFineCut', vars: {} });
    return out;
  }

  /* Controllo delle regole della specifica su una disposizione (usato dai test e come sicurezza nel pannello).
   * pieceBoxes opzionale: bounding box [x0,y0,x1,y1] dei pezzi nel sistema del rotolo (mm).
   * Ritorna un array di stringhe (vuoto = tutto ok). */
  function check(L, pieceBoxes) {
    var errs = [], s = spec(L.id), eps = 1e-6;
    if (!active(s)) return errs;
    var H = L.rollWidth, R = L.rollLength;
    var xs = L.anchorsX;
    for (var k = 1; k < xs.length; k++) {
      var d = xs[k] - xs[k - 1];
      if (s.maxSpan && d > s.maxSpan + eps) errs.push('distanza ' + d.toFixed(2) + ' > max ' + s.maxSpan);
      if (s.minSpan && xs[xs.length - 1] - xs[0] < s.minSpan - eps) errs.push('campata totale < min ' + s.minSpan);
    }
    if (L.marks.length !== 2 * xs.length) errs.push('numero crocini ' + L.marks.length + ' != ' + 2 * xs.length);
    var minX = Infinity, maxX = -Infinity;
    for (var i = 0; i < L.marks.length; i++) {
      var m = L.marks[i], b = m.box, ko = m.keepOut;
      // bordo laterale: distanza dal bordo del materiale al bordo esterno del crocino
      var edgeD = m.side === 'bottom' ? b[1] : H - b[3];
      if (edgeD < s.edge - 1e-3) errs.push('crocino ' + i + ' a ' + edgeD.toFixed(2) + ' mm dal bordo (< ' + s.edge + ')');
      if (ko[0] < -eps || ko[1] < -eps || ko[3] > H + eps || ko[2] > R + eps) errs.push('zona di rispetto ' + i + ' fuori dal materiale');
      if (m.kind === 'corner') { minX = Math.min(minX, b[0]); maxX = Math.max(maxX, b[2]); }
      if (m.shape === 'circle' && (m.circle[2] * 2 < s.sizeRange[0] - eps || m.circle[2] * 2 > s.sizeRange[1] + eps)) errs.push('diametro fuori specifica');
      if (pieceBoxes) {
        for (var p = 0; p < pieceBoxes.length; p++) {
          var q = pieceBoxes[p];
          if (q[0] < ko[2] - eps && q[2] > ko[0] + eps && q[1] < ko[3] - eps && q[3] > ko[1] + eps) {
            errs.push('pezzo ' + p + ' invade la zona di rispetto del crocino ' + i);
          }
        }
      }
    }
    if (minX < s.lead - 1e-3) errs.push('margine di testa ' + minX.toFixed(2) + ' < ' + s.lead);
    if (R - maxX < s.trail - 1e-3) errs.push('margine di coda ' + (R - maxX).toFixed(2) + ' < ' + s.trail);
    if (pieceBoxes) {             // i pezzi devono stare dentro il telaio dei crocini (area di taglio)
      var f = L.frame;
      for (p = 0; p < pieceBoxes.length; p++) {
        q = pieceBoxes[p];
        if (q[0] < f[0] - 1e-3 || q[2] > f[2] + 1e-3 || q[1] < f[1] - 1e-3 || q[3] > f[3] + 1e-3) errs.push('pezzo ' + p + ' fuori dal telaio dei crocini');
      }
    }
    return errs;
  }

  /* Payload per l'host (corvoRegmarks in host/regmarks.jsx): tutto in punti documento.
   * rollOriginPt = angolo in basso a sinistra del rotolo nel documento. */
  function toDoc(L, rollOriginPt) {
    var s = spec(L.id), ox = rollOriginPt[0], oy = rollOriginPt[1];
    function P(p) { return [ox + p[0] * MM, oy + p[1] * MM]; }
    var marks = [];
    for (var i = 0; i < L.marks.length; i++) {
      var m = L.marks[i];
      if (m.circle) marks.push({ circle: [ox + m.circle[0] * MM, oy + m.circle[1] * MM, m.circle[2] * MM] });
      else marks.push({ poly: m.poly.map(P) });
    }
    var res = { system: s.id, layer: s.layer || 'Regmarks', printable: s.printable !== false, color: s.color || K100, marks: marks };
    if (s.guideOnly && L.frame) {
      var a = P([L.frame[0], L.frame[1]]), b = P([L.frame[2], L.frame[3]]);
      res.frame = [a[0], a[1], b[0], b[1]];
    }
    return res;
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  var api = { SPECS: SPECS, ORDER: ORDER, MM: MM, spec: spec, reserve: reserve, layout: layout, check: check, toDoc: toDoc,
    _lShape: lShape, _crossShape: crossShape };
  // nel pannello CEP con Node attivo esiste anche `module`: esporta su entrambi (come geometry.js)
  if (root) root.CorvoRegmarks = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));
