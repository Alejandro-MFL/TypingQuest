// Artefacto de publicación (T18): solo los archivos de la web, nada interno.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, checkSite, listFiles, PUBLIC_ENTRIES } from '../tools/build-site.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('build-site: artefacto mínimo de la web', () => {
  let out;
  before(() => {
    out = join(mkdtempSync(join(tmpdir(), 'tq-site-')), '_site');
    buildSite(ROOT, out);
  });
  after(() => rmSync(join(out, '..'), { recursive: true, force: true }));

  it('publica solo index.html, css, js, data y assets', () => {
    assert.deepEqual(PUBLIC_ENTRIES, ['index.html', 'css', 'js', 'data', 'assets']);
    const top = new Set(listFiles(out).map((f) => f.split('/')[0]));
    assert.deepEqual([...top].sort(), ['assets', 'css', 'data', 'index.html', 'js']);
  });

  it('nunca incluye archivos internos, tests, herramientas ni documentación', () => {
    for (const file of listFiles(out)) {
      assert.doesNotMatch(file, /(^|\/)\.|^(tests|tools|docs)\/|\.test\.|\.md$|\.py$|\.cjs$/, file);
    }
  });

  it('el artefacto real pasa la comprobación (referencias locales existentes y relativas)', () => {
    assert.deepEqual(checkSite(out), []);
  });
});

describe('checkSite: detecta artefactos inseguros o rotos', () => {
  let dir;
  const write = (path, content = '') => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  before(() => { dir = mkdtempSync(join(tmpdir(), 'tq-check-')); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('archivos ocultos, de tipos no permitidos, rutas absolutas y referencias rotas', () => {
    write('index.html', '<link rel="stylesheet" href="/css/a.css"><script src="js/no-existe.js"></script>');
    write('.env', 'SECRET=1');
    write('js/notas.md', '#');
    write('css/a.css', 'a { background: url("../assets/falta.webp"); }');
    const errors = checkSite(dir).join('\n');
    assert.match(errors, /\.env/);
    assert.match(errors, /notas\.md/);
    assert.match(errors, /\/css\/a\.css/);
    assert.match(errors, /no-existe\.js/);
    assert.match(errors, /falta\.webp/);
  });
});
