// node plugin/tools/check_jsx.js [acorn-dir]
// Controllo di sintassi dei file ExtendScript (host/*.jsx). Con acorn (npm install acorn in una cartella temporanea,
// passata come argomento o via ACORN_DIR) il parse e' ES3 vero; senza acorn fa un controllo di parentesi bilanciate
// che salta stringhe, commenti e regex semplici.
'use strict';
const fs = require('fs'), path = require('path');
const HOST = path.join(__dirname, '..', 'host');
let acorn = null;
for (const d of [process.argv[2], process.env.ACORN_DIR].filter(Boolean)) {
  try { acorn = require(path.join(d, 'node_modules', 'acorn')); break; } catch (e) { try { acorn = require(d); break; } catch (e2) { /* next */ } }
}
if (!acorn) { try { acorn = require('acorn'); } catch (e) { acorn = null; } }

function balanced(src) {
  const st = [], pairs = { ')': '(', ']': '[', '}': '{' };
  let line = 1, prev = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '\n') { line++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; line++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i++; continue; }
    if (c === '"' || c === "'") { i++; while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '/' && /[(,=:[!&|?{};]/.test(prev)) {   // regex letterale
      i++; let cls = false; while (i < src.length && (cls || src[i] !== '/')) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
      prev = 'r'; continue;
    }
    if ('([{'.includes(c)) st.push([c, line]);
    else if (')]}'.includes(c)) { const o = st.pop(); if (!o || o[0] !== pairs[c]) return `riga ${line}: '${c}' non bilanciata`; }
    if (!/\s/.test(c)) prev = c;
  }
  return st.length ? `riga ${st[st.length - 1][1]}: '${st[st.length - 1][0]}' non chiusa` : null;
}

let fails = 0;
for (const f of fs.readdirSync(HOST).filter((x) => /\.jsx$/.test(x))) {
  const src = fs.readFileSync(path.join(HOST, f), 'utf8');
  let err = null;
  if (acorn) { try { acorn.parse(src, { ecmaVersion: 3, allowReserved: true, allowReturnOutsideFunction: false }); } catch (e) { err = e.message; } }
  else err = balanced(src);
  console.log((err ? '  FAIL ' : '  OK   ') + f + (acorn ? ' (acorn ES3)' : ' (parentesi)') + (err ? ': ' + err : ''));
  if (err) fails++;
}
process.exit(fails ? 1 : 0);
