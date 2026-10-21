// Pruebas de regresión del Hook check-js.cjs (caja negra: stdin → código + stderr).
// Ejecutar: node --test ".claude/hooks/*.test.cjs"

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, 'check-js.cjs');
const REAL_ROOT = path.resolve(__dirname, '..', '..');

let root;

// Proyecto falso: js/ (navegador), sin-tipo/ (como tests/: package.json sin
// "type"), tipo-module/ y tipo-commonjs/.
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-js-'));
  writeFile('sin-tipo/package.json', '{}');
  writeFile('tipo-module/package.json', '{"type":"module"}');
  writeFile('tipo-commonjs/package.json', '{"type":"commonjs"}');
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

function writeFile(relative, content) {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function runHook(filePath, projectRoot = root, rawInput) {
  const input = rawInput ?? JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: filePath },
  });
  return spawnSync(process.execPath, [HOOK], {
    input,
    encoding: 'utf8',
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
  });
}

function assertSilentPass(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '');
}

function assertSyntaxError(result, filePath) {
  assert.equal(result.status, 2);
  assert.match(result.stderr, /\[check-js\] Error de sintaxis en /);
  assert.ok(result.stderr.includes(filePath), 'el mensaje debe nombrar el archivo');
  assert.match(result.stderr, /SyntaxError/);
  assert.doesNotMatch(result.stderr, /^\s+at /m, 'sin traza interna de Node');
  assert.doesNotMatch(result.stderr, /\[stdin\]/);
}

describe('archivos que no son JavaScript', () => {
  test('ignora CSS aunque contenga sintaxis JS rota', () => {
    assertSilentPass(runHook(writeFile('css/estilo.css', '.a { color: red; const x = {; }\n')));
  });

  test('ignora HTML aunque contenga un <script> roto', () => {
    const html = '<!doctype html>\n<script type="module">import x from "y"; const a = (;</script>\n';
    assertSilentPass(runHook(writeFile('index.html', html)));
  });

  test('ignora otros archivos de texto', () => {
    assertSilentPass(runHook(writeFile('notas.txt', 'const x = {;\n')));
  });
});

describe('entradas sin nada que comprobar', () => {
  test('archivo .js inexistente', () => {
    assertSilentPass(runHook(path.join(root, 'js', 'no-existe.js')));
  });

  test('JSON mal formado', () => {
    assertSilentPass(runHook(null, root, '{no es json'));
  });

  test('evento sin file_path', () => {
    assertSilentPass(runHook(null, root, JSON.stringify({ tool_input: {} })));
  });
});

describe('js/ del proyecto: siempre módulo ES (navegador)', () => {
  test('detecta un error en un archivo con import', () => {
    const file = writeFile('js/con-import.js', 'import { a } from "./b.js";\nconst x = {;\n');
    assertSyntaxError(runHook(file), file);
  });

  test('detecta un error en un archivo con export', () => {
    const file = writeFile('js/con-export.js', 'export function f(a) {\n  return a + ;\n}\n');
    assertSyntaxError(runHook(file), file);
  });

  test('rechaza sintaxis válida solo en CommonJS (with)', () => {
    const file = writeFile('js/con-with.js', 'with (Math) { max(1, 2); }\n');
    assertSyntaxError(runHook(file), file);
  });

  test('rechaza octales heredados (modo estricto)', () => {
    const file = writeFile('js/octal.js', 'export const x = 010;\n');
    assertSyntaxError(runHook(file), file);
  });

  test('acepta un módulo válido en silencio', () => {
    assertSilentPass(runHook(writeFile('js/valido.js', 'import { a } from "./b.js";\nexport const c = a;\n')));
  });
});

describe('.mjs y .cjs respetan su modo', () => {
  test('.mjs con error', () => {
    const file = writeFile('lib/roto.mjs', 'export const a = (;\n');
    assertSyntaxError(runHook(file), file);
  });

  test('.mjs rechaza sintaxis exclusiva de CommonJS', () => {
    const file = writeFile('lib/with.mjs', 'with (Math) { max(1); }\n');
    assertSyntaxError(runHook(file), file);
  });

  test('.mjs válido', () => {
    assertSilentPass(runHook(writeFile('lib/valido.mjs', 'export const a = 1;\n')));
  });

  test('.cjs rechaza export', () => {
    const file = writeFile('lib/export.cjs', 'export const a = 1;\n');
    assertSyntaxError(runHook(file), file);
  });

  test('.cjs con error', () => {
    const file = writeFile('lib/roto.cjs', 'const a = require("fs";\n');
    assertSyntaxError(runHook(file), file);
  });

  test('.cjs válido, incluso fuera de js/ con sintaxis no estricta', () => {
    assertSilentPass(runHook(writeFile('lib/valido.cjs', 'const fs = require("fs");\nwith (Math) {}\nmodule.exports = fs;\n')));
  });
});

describe('.js sin "type" (como tests/): detección de Node 22', () => {
  test('detecta un error en un test con import', () => {
    const source = 'import { test } from "node:test";\ntest("x", () => {\n  const a = {;\n});\n';
    const file = writeFile('sin-tipo/roto.test.js', source);
    assertSyntaxError(runHook(file), file);
  });

  test('detecta un error en un archivo con export', () => {
    const file = writeFile('sin-tipo/export.js', 'export const a = 1;\nconst b = (;\n');
    assertSyntaxError(runHook(file), file);
  });

  test('detecta un error anterior al primer export', () => {
    const file = writeFile('sin-tipo/antes.js', 'const b = (;\nexport const a = 1;\n');
    assertSyntaxError(runHook(file), file);
  });

  test('un módulo detectado sigue las reglas estrictas', () => {
    const file = writeFile('sin-tipo/esm-with.js', 'export const a = 1;\nwith (Math) {}\n');
    assertSyntaxError(runHook(file), file);
  });

  test('acepta un test válido con import', () => {
    const source = 'import { test } from "node:test";\nimport assert from "node:assert/strict";\n' +
      'test("x", () => assert.equal(1, 1));\n';
    assertSilentPass(runHook(writeFile('sin-tipo/valido.test.js', source)));
  });

  test('acepta CommonJS válido (su modo real), aunque no lo sea como módulo ES', () => {
    assertSilentPass(runHook(writeFile('sin-tipo/cjs.js', 'const fs = require("fs");\nwith (Math) {}\n')));
  });
});

describe('.js con "type" en package.json', () => {
  test('"type": "module" fuerza módulo ES', () => {
    const file = writeFile('tipo-module/with.js', 'with (Math) {}\n');
    assertSyntaxError(runHook(file), file);
  });

  test('"type": "commonjs" fuerza CommonJS', () => {
    const file = writeFile('tipo-commonjs/export.js', 'export const a = 1;\n');
    assertSyntaxError(runHook(file), file);
  });
});

describe('seguridad de la ruta', () => {
  test('la ruta con metacaracteres de shell no se ejecuta', () => {
    const marker = path.join(root, 'pwned');
    const file = writeFile('raro/con espacios $(touch pwned) & ;.mjs', 'export const a = (;\n');
    const result = runHook(file);
    assertSyntaxError(result, file);
    assert.equal(fs.existsSync(marker), false);
  });
});

describe('archivos reales de TypingQuest (solo lectura)', () => {
  const realFiles = ['js', 'tests'].flatMap((dir) => fs.readdirSync(path.join(REAL_ROOT, dir))
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(REAL_ROOT, dir, name)));

  test('hay archivos que comprobar', () => assert.ok(realFiles.length > 0));

  for (const file of realFiles) {
    test(`pasa sin avisos: ${path.relative(REAL_ROOT, file)}`, () => {
      assertSilentPass(runHook(file, REAL_ROOT));
    });
  }
});
