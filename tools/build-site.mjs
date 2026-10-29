// Artefacto de publicación (T18): copia SOLO los archivos de la web a un directorio
// y comprueba su contenido. Sin dependencias (Node 22).
//
// Uso: node tools/build-site.mjs [directorio]   (por defecto _site)
// El directorio de salida se borra y se vuelve a crear; debe estar dentro del proyecto
// o del directorio temporal del sistema.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Lo único que necesita la web en el navegador. Todo lo demás (.git, .claude, tests,
// tools, documentación) se queda en el repositorio.
export const PUBLIC_ENTRIES = ['index.html', 'css', 'js', 'data', 'assets'];
const ALLOWED_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.webp', '.png', '.svg', '.ico']);

/** Rutas relativas (con «/») de todos los archivos bajo `dir`. */
export function listFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [relative(base, full).split(sep).join('/')];
  });
}

/** Copia las entradas públicas de `root` a `out` (que se vacía antes). */
export function buildSite(root, out) {
  const target = resolve(out);
  const inside = (parent) => target.startsWith(resolve(parent) + sep);
  if (!inside(root) && !inside(tmpdir())) throw new Error(`Salida fuera del proyecto: ${target}`);
  rmSync(target, { recursive: true, force: true });
  for (const entry of PUBLIC_ENTRIES) cpSync(join(root, entry), join(target, entry), { recursive: true });
  return target;
}

// Referencias locales de index.html (src/href) y de las hojas de estilo (url()).
function localReferences(site, files) {
  const refs = [];
  const html = readFileSync(join(site, 'index.html'), 'utf8');
  for (const [, ref] of html.matchAll(/\s(?:src|href)="([^"#][^"]*)"/g)) refs.push({ from: 'index.html', ref });
  for (const css of files.filter((f) => f.endsWith('.css'))) {
    for (const [, ref] of readFileSync(join(site, css), 'utf8').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      refs.push({ from: css, ref });
    }
  }
  return refs.filter(({ ref }) => !/^(?:https:|data:)/.test(ref));
}

function referenceErrors(site, files) {
  return localReferences(site, files).flatMap(({ from, ref }) => {
    if (/^(?:[a-z]+:|\/)/i.test(ref)) return [`${from}: referencia absoluta o insegura «${ref}» (no funciona bajo una subruta)`];
    const path = resolve(site, dirname(from), ref.split(/[?#]/)[0]);
    return existsSync(path) && statSync(path).isFile() ? [] : [`${from}: no existe «${ref}»`];
  });
}

/** Errores del artefacto (lista vacía = correcto). */
export function checkSite(site) {
  const files = listFiles(site);
  const errors = files.flatMap((file) => {
    if (file.split('/').some((part) => part.startsWith('.'))) return [`archivo oculto: ${file}`];
    const ext = file.slice(file.lastIndexOf('.'));
    return ALLOWED_EXTENSIONS.has(ext) ? [] : [`tipo no permitido: ${file}`];
  });
  if (!files.includes('index.html')) return [...errors, 'falta index.html'];
  return [...errors, ...referenceErrors(site, files)];
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const out = buildSite(root, resolve(root, process.argv[2] ?? '_site'));
  const errors = checkSite(out);
  const files = listFiles(out);
  const bytes = files.reduce((sum, f) => sum + statSync(join(out, f)).size, 0);
  console.log(`Artefacto en ${out}: ${files.length} archivos, ${(bytes / 1024).toFixed(0)} KiB`);
  if (errors.length > 0) {
    console.error(`Artefacto NO válido:\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
