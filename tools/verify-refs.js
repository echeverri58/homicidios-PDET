/** Comprueba que todos los selectores #id y .clase usados en js/ existan en index.html. */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync('index.html', 'utf8');

// Ids y clases declarados estáticamente en el HTML (los dinámicos los crea el JS).
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const htmlClasses = new Set(
  [...html.matchAll(/\bclass="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean)
);

// Clases que el propio JS genera en plantillas HTML.
const jsSource = ['app.js', 'ui.js', 'charts.js', 'data.js', 'utils.js']
  .map((f) => fs.readFileSync(path.join('js', f), 'utf8'))
  .join('\n');
const jsClasses = new Set([...jsSource.matchAll(/class="([^"$]*?)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
const allClasses = new Set([...htmlClasses, ...jsClasses]);

const problems = [];
for (const file of ['app.js', 'ui.js', 'charts.js', 'utils.js']) {
  const src = fs.readFileSync(path.join('js', file), 'utf8');
  for (const m of src.matchAll(/\$\$?\(\s*['"]([^'"]+)['"]/g)) {
    const sel = m[1];
    for (const id of sel.matchAll(/#([\w-]+)/g)) {
      if (!htmlIds.has(id[1])) problems.push(`${file}: id inexistente "${id[1]}" en el selector "${sel}"`);
    }
    for (const cls of sel.matchAll(/\.([\w-]+)/g)) {
      if (!allClasses.has(cls[1])) problems.push(`${file}: clase inexistente "${cls[1]}" en el selector "${sel}"`);
    }
  }
  // getElementById
  for (const m of src.matchAll(/getElementById\(\s*['"]([^'"]+)['"]/g)) {
    if (!htmlIds.has(m[1])) problems.push(`${file}: getElementById("${m[1]}") no existe en index.html`);
  }
}

// Clases usadas en las hojas de estilo que el JS referencia por nombre.
const css = fs.readFileSync('css/styles.css', 'utf8');
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const jsQueryClasses = new Set([...jsSource.matchAll(/querySelector(?:All)?\(\s*['"]\.([\w-]+)/g)].map((m) => m[1]));
for (const c of jsQueryClasses) {
  if (!cssClasses.has(c)) problems.push(`css/styles.css: falta el estilo para la clase ".${c}" consultada por el JS`);
}

// Balance de llaves en el CSS.
let depth = 0;
let line = 1;
for (const ch of css) {
  if (ch === '\n') line++;
  if (ch === '{') depth++;
  if (ch === '}') depth--;
  if (depth < 0) { problems.push(`css/styles.css: llave de cierre sobrante cerca de la línea ${line}`); break; }
}
if (depth > 0) problems.push(`css/styles.css: faltan ${depth} llaves de cierre`);

if (problems.length) {
  console.log('\n  ✖ Referencias rotas encontradas:\n');
  for (const p of problems) console.log(`    · ${p}`);
  process.exit(1);
}
console.log(`\n  ✓ Referencias OK: ${htmlIds.size} ids, ${allClasses.size} clases, CSS balanceado.\n`);
