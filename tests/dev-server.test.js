// Servidor local de desarrollo (tools/dev-server.py). Sin Cache-Control, el
// navegador reutiliza por heurística módulos ES antiguos junto a otros nuevos
// (p. ej. main.js nuevo con progress.js antiguo) y la aplicación no arranca.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../tools/dev-server.py', import.meta.url));
const hasPython = spawnSync('python', ['--version']).status === 0;

// Arranca el servidor en un puerto libre (0) y devuelve la URL que anuncia.
function startServer() {
  const child = spawn('python', ['-u', SERVER, '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.on('exit', (code) => reject(new Error(`El servidor terminó (${code})`)));
  });
  return { child, url };
}

describe('servidor de desarrollo', { skip: !hasPython && 'python no está disponible' }, () => {
  let server;
  let base;

  before(async () => {
    server = startServer();
    base = await server.url;
  });

  after(() => server?.child.kill());

  for (const path of ['/', '/js/main.js', '/js/progress.js', '/data/course.json']) {
    it(`${path}: se sirve y obliga a revalidar (Cache-Control: no-cache)`, async () => {
      const response = await fetch(base + path);
      await response.arrayBuffer();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
    });
  }

  it('los módulos se sirven como JavaScript', async () => {
    const response = await fetch(`${base}/js/main.js`);
    await response.arrayBuffer();
    assert.match(response.headers.get('content-type'), /javascript/);
  });
});
