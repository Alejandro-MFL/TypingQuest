// Cliente de LRCLIB con dobles de prueba: nunca se llama al servicio real. Las letras
// son INVENTADAS.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLrclibClient, LRCLIB_SEARCH_URL, lrclibErrorMessage, formatTrackDuration } from '../js/lrclib.js';

const record = (overrides = {}) => ({
  id: 1, name: 'Canción', trackName: 'Canción', artistName: 'Artista', albumName: 'Álbum', duration: 185.4,
  instrumental: false, hasWordSync: false, plainLyrics: 'Hola mundo', syncedLyrics: '[00:01.00]Hola mundo', lyricsfile: 'x',
  ...overrides,
});

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

// fetch falso que registra las peticiones y responde con `respond(url, init)`.
function fakeFetch(respond) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    return respond(url, init);
  };
  return { impl, calls };
}

function client(respond, options = {}) {
  const fetch = fakeFetch(respond);
  let now = options.start ?? 1_000_000;
  const instance = createLrclibClient({
    fetchImpl: fetch.impl, clientName: 'TypingQuest test', now: () => now, ...options,
  });
  return { instance, calls: fetch.calls, advance: (ms) => { now += ms; } };
}

describe('búsqueda: petición', () => {
  it('usa el endpoint estable /api/search con título y artista, identificando el cliente', async () => {
    const { instance, calls } = client(() => jsonResponse([]));
    await instance.search({ track: '  Mi canción ', artist: 'Artista Ñ' });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(`${url.origin}${url.pathname}`, LRCLIB_SEARCH_URL);
    assert.equal(LRCLIB_SEARCH_URL, 'https://lrclib.net/api/search');
    assert.equal(url.searchParams.get('track_name'), 'Mi canción');
    assert.equal(url.searchParams.get('artist_name'), 'Artista Ñ');
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(calls[0].init.headers['Lrclib-Client'], 'TypingQuest test');
    assert.equal(Object.keys(calls[0].init.headers).some((h) => h.toLowerCase() === 'user-agent'), false);
    assert.equal(calls[0].init.credentials, 'omit');
  });

  it('sin artista no envía artist_name', async () => {
    const { instance, calls } = client(() => jsonResponse([]));
    await instance.search({ track: 'Solo título', artist: '' });
    assert.equal(new URL(calls[0].url).searchParams.has('artist_name'), false);
  });

  it('sin título no hace ninguna petición', async () => {
    const { instance, calls } = client(() => jsonResponse([]));
    assert.deepEqual(await instance.search({ track: '   ', artist: 'Alguien' }), { ok: false, error: 'missing-track' });
    assert.equal(calls.length, 0);
  });

  it('título demasiado largo: no hace la petición', async () => {
    const { instance, calls } = client(() => jsonResponse([]));
    assert.equal((await instance.search({ track: 'a'.repeat(301), artist: '' })).error, 'too-long');
    assert.equal(calls.length, 0);
  });

  it('una sola petición a la vez: una segunda búsqueda mientras otra sigue en curso se rechaza', async () => {
    let release;
    const { instance, calls } = client(() => new Promise((resolve) => { release = () => resolve(jsonResponse([])); }));
    const first = instance.search({ track: 'uno', artist: '' });
    assert.deepEqual(await instance.search({ track: 'dos', artist: '' }), { ok: false, error: 'busy' });
    release();
    assert.equal((await first).ok, true);
    assert.equal(calls.length, 1);
  });
});

describe('búsqueda: resultados', () => {
  it('devuelve los datos necesarios y prioriza las letras sincronizadas (orden estable)', async () => {
    const { instance } = client(() => jsonResponse([
      record({ id: 1, syncedLyrics: null, plainLyrics: 'solo texto' }),
      record({ id: 2, albumName: null }),
      record({ id: 3, instrumental: true, syncedLyrics: null, plainLyrics: null }),
      record({ id: 4, duration: 200 }),
    ]));
    const result = await instance.search({ track: 'Canción', artist: 'Artista' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.results.map((r) => r.id), [2, 4, 1, 3]);
    assert.deepEqual(result.results[0], {
      id: 2, track: 'Canción', artist: 'Artista', album: null, durationS: 185.4,
      instrumental: false, synced: '[00:01.00]Hola mundo', hasPlain: true,
    });
    assert.equal(result.results[2].synced, null);
    assert.equal(result.results[2].hasPlain, true);
  });

  it('sin resultados: lista vacía (no es un error de red)', async () => {
    const { instance } = client(() => jsonResponse([]));
    assert.deepEqual(await instance.search({ track: 'nada', artist: '' }), { ok: true, results: [], discarded: 0 });
  });

  it('404 también significa sin resultados', async () => {
    const { instance } = client(() => jsonResponse({ name: 'TrackNotFound', statusCode: 404 }, { status: 404 }));
    assert.deepEqual(await instance.search({ track: 'nada', artist: '' }), { ok: true, results: [], discarded: 0 });
  });

  it('descarta registros con datos no válidos y los cuenta', async () => {
    const { instance } = client(() => jsonResponse([
      record({ id: 'x' }), record({ trackName: 42 }), record({ syncedLyrics: 7 }), record({ duration: -3 }), null, 'texto',
      record({ id: 9 }),
    ]));
    const result = await instance.search({ track: 'Canción', artist: '' });
    assert.deepEqual(result.results.map((r) => r.id), [9]);
    assert.equal(result.discarded, 6);
  });

  it('el HTML de los metadatos se conserva como texto (nunca se interpreta)', async () => {
    const { instance } = client(() => jsonResponse([record({ trackName: '<img src=x onerror=alert(1)>' })]));
    const [first] = (await instance.search({ track: 'x', artist: '' })).results;
    assert.equal(first.track, '<img src=x onerror=alert(1)>');
  });
});

describe('búsqueda: errores', () => {
  it('fallo de red', async () => {
    const { instance } = client(() => { throw new TypeError('Failed to fetch'); });
    assert.deepEqual(await instance.search({ track: 'x', artist: '' }), { ok: false, error: 'network' });
  });

  it('tiempo de espera agotado', async () => {
    const { instance } = client((url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Abortado', 'AbortError')));
    }), { timeoutMs: 10 });
    assert.deepEqual(await instance.search({ track: 'x', artist: '' }), { ok: false, error: 'timeout' });
  });

  it('429: respeta Retry-After y no vuelve a pedir hasta que pase (sin reintentos automáticos)', async () => {
    const { instance, calls, advance } = client(() => jsonResponse(
      { name: 'RateLimitExceeded', statusCode: 429 }, { status: 429, headers: { 'Retry-After': '30' } },
    ));
    assert.deepEqual(await instance.search({ track: 'x', artist: '' }), { ok: false, error: 'rate-limited', retryAfterS: 30 });
    assert.equal(calls.length, 1);
    advance(10_000);
    assert.deepEqual(await instance.search({ track: 'x', artist: '' }), { ok: false, error: 'rate-limited', retryAfterS: 20 });
    assert.equal(calls.length, 1, 'no se envía otra petición durante la espera');
    advance(20_000);
    await instance.search({ track: 'x', artist: '' });
    assert.equal(calls.length, 2);
  });

  it('429 sin Retry-After o con un valor raro: espera prudente de 60 s', async () => {
    const { instance } = client(() => new Response('demasiadas', { status: 429, headers: { 'Retry-After': 'mañana' } }));
    assert.equal((await instance.search({ track: 'x', artist: '' })).retryAfterS, 60);
  });

  it('503 o 500: servicio no disponible (503 respeta Retry-After)', async () => {
    const busy = client(() => jsonResponse({}, { status: 503, headers: { 'Retry-After': '2' } }));
    assert.deepEqual(await busy.instance.search({ track: 'x', artist: '' }), { ok: false, error: 'unavailable', retryAfterS: 2 });
    const broken = client(() => jsonResponse({}, { status: 500 }));
    assert.deepEqual(await broken.instance.search({ track: 'x', artist: '' }), { ok: false, error: 'unavailable' });
  });

  it('respuesta que no es JSON o no es una lista: datos no válidos', async () => {
    const plain = client(() => new Response('Failed to deserialize query string', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
    assert.deepEqual(await plain.instance.search({ track: 'x', artist: '' }), { ok: false, error: 'invalid' });
    const object = client(() => jsonResponse({ results: [] }));
    assert.deepEqual(await object.instance.search({ track: 'x', artist: '' }), { ok: false, error: 'invalid' });
    const broken = client(() => new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    assert.deepEqual(await broken.instance.search({ track: 'x', artist: '' }), { ok: false, error: 'invalid' });
  });

  it('400 u otros códigos: error del servicio', async () => {
    const { instance } = client(() => jsonResponse({ name: 'ValidationError', statusCode: 400 }, { status: 400 }));
    assert.deepEqual(await instance.search({ track: 'x', artist: '' }), { ok: false, error: 'http-error' });
  });
});

describe('textos', () => {
  it('mensajes comprensibles para cada error', () => {
    assert.match(lrclibErrorMessage('network'), /conexión/);
    assert.match(lrclibErrorMessage('rate-limited', 42), /42 s/);
    assert.match(lrclibErrorMessage('unavailable'), /no responde/);
    assert.match(lrclibErrorMessage('invalid'), /no válid/);
    assert.match(lrclibErrorMessage('missing-track'), /título/);
    assert.match(lrclibErrorMessage('desconocido'), /No se pudo/);
  });

  it('duración m:ss o «—» si no se conoce', () => {
    assert.equal(formatTrackDuration(185.4), '3:05');
    assert.equal(formatTrackDuration(59.6), '1:00');
    assert.equal(formatTrackDuration(null), '—');
  });
});
