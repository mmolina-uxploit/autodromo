/**
 * Empaqueta Autódromo en un solo HTML autocontenido, sin dependencias externas de compilación.
 *
 * - Los módulos ES de src/ se convierten en funciones encadenadas en orden de dependencias
 *   (el código solo usa `import { a, b as c } from`, `export function|const|class` y
 *   `export { … } from`; cualquier otra forma corta el empaquetado con un error claro).
 * - Los estilos se incrustan en orden.
 * - Hojas de sprites, retratos y banco de sonido viajan como data URI en
 *   globalThis.AUTODROMO_ASSETS, que src/config/assets.js consulta antes de pedir a la red.
 *
 * Salidas:
 *   dist/autodromo.html  documento completo: se abre con doble clic en cualquier navegador.
 *   dist/artifact.html   el mismo contenido sin <html>/<head>/<body>, para publicarlo como página.
 *
 * Uso: node tools/empaquetar.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const ENTRY = join(ROOT, 'src/main.js');

const IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g;
const REEXPORT = /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g;
const DECLARED = /^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

const modules = new Map();
const order = [];

function specifiers(list) {
  return list.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const [name, alias] = s.split(/\s+as\s+/);
    return { name: name.trim(), alias: (alias ?? name).trim() };
  });
}

function load(file, stack = []) {
  if (modules.has(file)) return;
  if (stack.includes(file)) throw new Error(`Dependencia circular: ${[...stack, file].map(f => relative(ROOT, f)).join(' → ')}`);
  const source = readFileSync(file, 'utf8');
  const deps = [];
  for (const re of [IMPORT, REEXPORT]) {
    for (const [, , spec] of source.matchAll(re)) {
      if (!spec.startsWith('.')) throw new Error(`${relative(ROOT, file)}: import no relativo ${spec}`);
      deps.push(resolve(dirname(file), spec));
    }
  }
  for (const dep of deps) load(dep, [...stack, file]);
  modules.set(file, source);
  order.push(file);
}

function transform(file, source) {
  const id = relative(ROOT, file);
  const exported = [];
  let code = source.replace(REEXPORT, (_, list, spec) => {
    const dep = relative(ROOT, resolve(dirname(file), spec));
    const names = specifiers(list);
    exported.push(...names.map(n => n.alias));
    return `const { ${names.map(n => (n.name === n.alias ? n.name : `${n.name}: ${n.alias}`)).join(', ')} } = __m[${JSON.stringify(dep)}];`;
  });
  code = code.replace(IMPORT, (_, list, spec) => {
    const dep = relative(ROOT, resolve(dirname(file), spec));
    const names = specifiers(list);
    return `const { ${names.map(n => (n.name === n.alias ? n.name : `${n.name}: ${n.alias}`)).join(', ')} } = __m[${JSON.stringify(dep)}];`;
  });
  code = code.replace(/^export\s*\{\s*\};?\s*$/gm, '');
  code = code.replace(DECLARED, (_, kind, name) => {
    exported.push(name);
    return `${kind} ${name}`;
  });
  const leftover = code.match(/^\s*(import|export)\b.*$/m);
  if (leftover) throw new Error(`${id}: forma de módulo no soportada: ${leftover[0].trim()}`);
  return `__m[${JSON.stringify(id)}] = (() => {\n${code}\nreturn { ${exported.join(', ')} };\n})();`;
}

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

const MIME = { '.png': 'image/png', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.json': 'application/json' };

function assets() {
  const map = {};
  const take = dir => files(join(ROOT, dir)).filter(f => MIME[extname(f)]);
  for (const file of [...take('assets/sprites'), ...take('assets/garage'), ...take('assets/audio')]) {
    const key = relative(ROOT, file).split('\\').join('/');
    map[key] = extname(file) === '.json'
      ? JSON.parse(readFileSync(file, 'utf8'))
      : `data:${MIME[extname(file)]};base64,${readFileSync(file).toString('base64')}`;
  }
  return map;
}

load(ENTRY);
const bundle = `(() => {\n'use strict';\nconst __m = {};\n${order.map(f => transform(f, modules.get(f))).join('\n')}\n})();`;
const styles = ['tokens', 'base', 'atoms', 'molecules', 'organisms', 'templates']
  .map(name => readFileSync(join(ROOT, `styles/${name}.css`), 'utf8')).join('\n');
const assetScript = `globalThis.AUTODROMO_ASSETS = ${JSON.stringify(assets())};`;
// Cierre seguro: ningún texto embebido puede cerrar la etiqueta <script> antes de tiempo.
const safe = text => text.replace(/<\/script/gi, '<\\/script');

const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&display=swap" rel="stylesheet">';
const body = `<noscript><p class="noscript">Autódromo necesita JavaScript activado para correr.</p></noscript>\n<div id="app"></div>\n<script>${safe(assetScript)}</script>\n<script>${safe(bundle)}</script>`;
const description = 'Carreras pseudo-3D en el navegador: cuatro circuitos, autos con propulsores de aire, rivales y física real.';

const full = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#05060f">
<meta name="description" content="${description}">
<title>Autódromo</title>
${fonts}
<style>${styles}</style>
</head>
<body>
${body}
</body>
</html>
`;
const fragment = `<title>Autódromo</title>\n${fonts}\n<style>${styles}</style>\n${body}\n`;

mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'autodromo.html'), full);
writeFileSync(join(DIST, 'artifact.html'), fragment);
const mb = n => (n / 1024 / 1024).toFixed(1);
console.log(`${order.length} módulos, bundle ${(bundle.length / 1024).toFixed(0)} KB, recursos ${mb(assetScript.length)} MB`);
console.log(`dist/autodromo.html ${mb(full.length)} MB · dist/artifact.html ${mb(fragment.length)} MB`);
