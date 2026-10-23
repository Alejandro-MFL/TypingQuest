// Integridad del grafo de módulos ES del navegador. Un import con nombre que no
// existe en su módulo es un error de ENLACE: el navegador no ejecuta ningún módulo,
// main.js no arranca y ninguna sección (Academia, Biblioteca, Historial, Práctica
// libre) se pinta. Se comprueba sin DOM, leyendo el código fuente.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const JS_DIR = new URL('../js/', import.meta.url);
const files = readdirSync(JS_DIR).filter((f) => f.endsWith('.js'));
const sourceOf = (file) => readFileSync(new URL(file, JS_DIR), 'utf8');

// Nombres exportados: export function/const/let/class y listas export { a, b as c }.
function exportedNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  return names;
}

// Imports con nombre de módulos locales: import { a, b as c } from './x.js'.
function namedImports(source) {
  return [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+\.js)'/g)].map((m) => ({
    module: m[2],
    names: m[1].split(',').map((p) => p.trim().split(/\s+as\s+/)[0]).filter(Boolean),
  }));
}

// Importaciones de espacio de nombres (import * as ui from './ui.js') y los
// miembros que el archivo usa (ui.renderStats): un miembro inexistente no rompe
// el enlace, pero lanza TypeError al llamarlo (p. ej. al abrir una sección).
function namespaceUses(source) {
  return [...source.matchAll(/import\s*\*\s*as\s+([\w$]+)\s+from\s*'\.\/([\w-]+\.js)'/g)].map((m) => ({
    module: m[2],
    // «ui.js» en comentarios o rutas es un nombre de archivo, no un miembro.
    names: [...new Set([...source.matchAll(new RegExp(`\\b${m[1]}\\.([\\w$]+)`, 'g'))].map((u) => u[1]))]
      .filter((name) => name !== 'js'),
  }));
}

describe('grafo de módulos de js/', () => {
  it('main.js importa los módulos de la aplicación (el analizador los encuentra)', () => {
    const source = sourceOf('main.js');
    const modules = [...namedImports(source), ...namespaceUses(source)].map((i) => i.module);
    for (const m of ['progress.js', 'course-ui.js', 'ui.js', 'router.js', 'catalog.js']) {
      assert.ok(modules.includes(m), m);
    }
  });

  for (const file of files) {
    it(`${file}: cada import y miembro usado existe en su módulo`, () => {
      const source = sourceOf(file);
      for (const { module, names } of [...namedImports(source), ...namespaceUses(source)]) {
        assert.ok(files.includes(module), `${file} importa ${module}, que no existe`);
        const exported = exportedNames(sourceOf(module));
        for (const name of names) {
          assert.ok(exported.has(name), `${file}: './${module}' no exporta '${name}'`);
        }
      }
    });
  }

  it('detecta un import inexistente (como el de restartCourse con un progress.js antiguo)', () => {
    const exported = exportedNames('export function advanceCourse() {}\nexport const A = 1;');
    const [{ names }] = namedImports("import { advanceCourse, restartCourse } from './progress.js';");
    assert.deepEqual(names.filter((n) => !exported.has(n)), ['restartCourse']);
  });

  it('detecta un miembro inexistente usado a través de un espacio de nombres', () => {
    const [{ names }] = namespaceUses("import * as courseUi from './course-ui.js';\ncourseUi.renderCourseReset(ce);");
    assert.deepEqual(names, ['renderCourseReset']);
  });

  it('main.js usa renderCourseReset y course-ui.js lo exporta', () => {
    const uses = namespaceUses(sourceOf('main.js')).find((u) => u.module === 'course-ui.js');
    assert.ok(uses.names.includes('renderCourseReset'));
    assert.ok(exportedNames(sourceOf('course-ui.js')).has('renderCourseReset'));
  });
});
