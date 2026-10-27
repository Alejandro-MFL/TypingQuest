// Seguridad (T17.2): comprobaciones estáticas del código y entradas peligrosas.
// Prevención de regresiones: la aplicación pinta todo con textContent y valida
// lo que lee de localStorage; estos tests impiden que eso cambie sin darse cuenta.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { prepareText } from '../js/text-prep.js';
import { parseHistory, parseProgress } from '../js/storage.js';
import { parseThemePreference } from '../js/theme.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const jsFiles = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js'));
const html = read('../index.html');

// Quita los comentarios para no confundir una advertencia («sin innerHTML») con su uso.
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('código: sin sumideros de HTML ni evaluación de código', () => {
  const FORBIDDEN = [
    /\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/,
    /new\s+Function\s*\(/, /set(?:Timeout|Interval)\s*\(\s*['"`]/, /createContextualFragment/, /\bsrcdoc\b/,
  ];

  for (const file of jsFiles) {
    it(`js/${file}`, () => {
      const code = stripComments(read(`../js/${file}`));
      for (const pattern of FORBIDDEN) assert.doesNotMatch(code, pattern, `${file}: ${pattern}`);
    });
  }
});

describe('index.html: recursos y enlaces', () => {
  it('sin manejadores de eventos, estilos ni scripts en línea, ni URLs javascript:', () => {
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
    assert.doesNotMatch(html, /\sstyle\s*=/i);
    assert.doesNotMatch(html, /<style/i);
    assert.doesNotMatch(html, /javascript:/i);
    for (const tag of html.match(/<script\b[^>]*>/gi)) assert.match(tag, /\ssrc="js\/[a-z-]+\.js"/);
  });

  it('scripts, estilos e iconos son locales (sin CDN ni recursos de terceros)', () => {
    const sources = [...html.matchAll(/<(?:script|link|img)\b[^>]*\s(?:src|href)="([^"]+)"/gi)].map((m) => m[1]);
    assert.ok(sources.length > 0);
    for (const src of sources) assert.doesNotMatch(src, /^(?:[a-z]+:|\/\/)/i, src);
  });

  it('los enlaces externos usan https y se abren con noopener noreferrer', () => {
    const external = [...html.matchAll(/<a\b[^>]*href="(?:[a-z]+:)?\/\/[^"]*"[^>]*>/gi)].map((m) => m[0]);
    assert.ok(external.length > 0);
    for (const tag of external) {
      assert.match(tag, /href="https:\/\//, tag);
      assert.match(tag, /rel="noopener noreferrer"/, tag);
    }
  });

  it('declara una política de seguridad de contenidos (CSP) estricta', () => {
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
    assert.ok(csp, 'falta la CSP');
    for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
      assert.ok(csp.includes(directive), directive);
    }
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  });
});

describe('entradas peligrosas en la práctica libre', () => {
  it('el HTML se trata como texto literal que escribir (se pinta con textContent)', () => {
    const result = prepareText('<img src=x onerror=alert(1)>', 5000);
    assert.equal(result.ok, true);
    assert.equal(result.text, '<img src=x onerror=alert(1)>');
  });

  it('elimina los controles de dirección (bidi), invisibles e imposibles de teclear', () => {
    const bidi = '‎‏‪‫‬‭‮⁦⁧⁨⁩؜';
    const result = prepareText(`ho${bidi}la`, 5000);
    assert.deepEqual([result.ok, result.text], [true, 'hola']);
  });

  it('un texto solo de controles queda vacío y se rechaza', () => {
    assert.equal(prepareText('‮​\u0000', 5000).error, 'empty');
  });
});

describe('datos dañados o manipulados en localStorage', () => {
  const record = (extra) => ({
    id: 'r1', finishedAt: '2026-01-01T00:00:00.000Z', wpm: 10, accuracy: 90, elapsedMs: 1000,
    errors: 1, mode: 'free', exercise: 'custom-text', ...extra,
  });

  it('un ID de ejercicio con HTML descarta el registro (nunca llega a la interfaz)', () => {
    const parsed = parseHistory(JSON.stringify({ version: 1, sessions: [record({ exercise: '<img src=x onerror=alert(1)>' })] }));
    assert.deepEqual([parsed.sessions.length, parsed.discarded], [0, 1]);
  });

  it('«__proto__» en un registro no contamina Object.prototype ni se conserva', () => {
    const raw = `{"version":1,"sessions":[{"__proto__":{"polluted":true},${JSON.stringify(record()).slice(1)}]}`;
    const parsed = parseHistory(raw);
    assert.equal(parsed.sessions.length, 1);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.getPrototypeOf(parsed.sessions[0]), Object.prototype);
    assert.equal(Object.hasOwn(parsed.sessions[0], '__proto__'), false);
  });

  it('JSON roto o con otra forma: estado controlado, sin lanzar', () => {
    for (const raw of ['{', 'null', '[]', '"x"', '{"version":1,"sessions":"no"}']) {
      assert.doesNotThrow(() => parseHistory(raw));
      assert.doesNotThrow(() => parseProgress(raw));
    }
    assert.equal(parseProgress('{"version":1,"currentExerciseId":"<b>","exercises":[]}').status, 'corrupt');
  });

  it('una preferencia de tema manipulada vuelve a «auto»', () => {
    assert.equal(parseThemePreference('{"version":1,"theme":"\\"><script>"}'), 'auto');
  });
});
