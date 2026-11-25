// Adaptador de la YouTube IFrame Player API con dobles de prueba (nunca carga YouTube).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createYouTubePlayer,
  loadYouTubeApi,
  playerErrorKind,
  playerStateName,
  YOUTUBE_IFRAME_API_URL,
} from '../js/youtube-player.js';

const ID = 'dQw4w9WgXcQ';

// Documento mínimo: crea elementos con atributos y un contenedor con replaceChildren.
function fakeDoc() {
  const appended = [];
  const doc = {
    createElement(tag) {
      const attributes = {};
      return {
        tag, attributes, listeners: {},
        setAttribute(name, value) { attributes[name] = String(value); },
        addEventListener(type, fn) { this.listeners[type] = fn; },
        remove() { this.removed = true; },
      };
    },
    head: { append: (el) => appended.push(el) },
  };
  return { doc, appended };
}

function fakeContainer() {
  return { children: [], replaceChildren(...nodes) { this.children = nodes; } };
}

// YT falso: registra el reproductor y permite disparar sus eventos.
function fakeYT() {
  const log = { players: [] };
  class Player {
    constructor(element, options) {
      this.element = element;
      this.options = options;
      this.calls = [];
      this.time = 0;
      this.duration = 0;
      log.players.push(this);
    }
    playVideo() { this.calls.push(['play']); }
    pauseVideo() { this.calls.push(['pause']); }
    seekTo(s, allow) { this.calls.push(['seek', s, allow]); }
    getCurrentTime() { return this.time; }
    getDuration() { return this.duration; }
    getPlayerState() { return 1; }
    destroy() { this.calls.push(['destroy']); }
  }
  return { YT: { Player }, log };
}

function setup(extra = {}) {
  const { doc } = fakeDoc();
  const { YT, log } = fakeYT();
  const container = fakeContainer();
  const events = { states: [], errors: [], ready: 0 };
  const player = createYouTubePlayer({
    doc, YT, container, videoId: ID, origin: 'http://localhost:8002',
    onReady: () => { events.ready++; }, onStateChange: (s) => events.states.push(s), onError: (e) => events.errors.push(e),
    ...extra,
  });
  return { player, yt: log.players[0], container, events };
}

describe('reproductor oficial', () => {
  it('inserta el iframe oficial (sin cookies) con la API activada y envía el origen como referente', () => {
    const { container, yt } = setup();
    const [iframe] = container.children;
    assert.equal(iframe.tag, 'iframe');
    assert.match(iframe.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    assert.match(iframe.src, /enablejsapi=1/);
    assert.equal(iframe.referrerPolicy, 'strict-origin-when-cross-origin');
    assert.equal(iframe.title, 'Reproductor de vídeo de YouTube');
    assert.match(iframe.attributes.allow, /fullscreen/, 'pantalla completa mediante allow');
    assert.equal(yt.element, iframe, 'la API controla ese iframe');
  });

  it('rechaza un ID no válido sin crear nada', () => {
    assert.throws(() => setup({ videoId: '<script>' }), TypeError);
  });

  it('antes de estar listo no envía órdenes ni lee tiempos', () => {
    const { player, yt } = setup();
    player.play();
    player.seekTo(5000);
    assert.deepEqual(yt.calls, []);
    assert.ok(Number.isNaN(player.currentTimeMs()));
    assert.ok(Number.isNaN(player.durationMs()));
  });

  it('cuando está listo: reproducir, pausar, saltar y leer tiempos en milisegundos', () => {
    const { player, yt, events } = setup();
    yt.options.events.onReady({});
    assert.equal(events.ready, 1);
    yt.time = 12.345;
    yt.duration = 200.5;
    player.seekTo(4500);
    player.play();
    player.pause();
    assert.deepEqual(yt.calls, [['seek', 4.5, true], ['play'], ['pause']]);
    assert.equal(player.currentTimeMs(), 12_345);
    assert.equal(player.durationMs(), 200_500);
  });

  it('duración 0 (aún desconocida) se trata como no disponible', () => {
    const { player, yt } = setup();
    yt.options.events.onReady({});
    yt.duration = 0;
    assert.ok(Number.isNaN(player.durationMs()));
  });

  it('traduce los estados y errores del reproductor', () => {
    const { yt, events } = setup();
    yt.options.events.onStateChange({ data: 1 });
    yt.options.events.onStateChange({ data: 2 });
    yt.options.events.onError({ data: 150 });
    assert.deepEqual(events.states, ['playing', 'paused']);
    assert.deepEqual(events.errors, ['not-embeddable']);
  });

  it('destroy() libera el reproductor y vacía el contenedor; después no hace nada', () => {
    const { player, yt, container } = setup();
    yt.options.events.onReady({});
    player.destroy();
    assert.deepEqual(yt.calls.at(-1), ['destroy']);
    assert.deepEqual(container.children, []);
    player.play();
    assert.equal(yt.calls.filter(([name]) => name === 'play').length, 0);
  });
});

describe('códigos de la API', () => {
  it('errores documentados', () => {
    assert.equal(playerErrorKind(2), 'invalid');
    assert.equal(playerErrorKind(5), 'html5');
    assert.equal(playerErrorKind(100), 'not-found');
    assert.equal(playerErrorKind(101), 'not-embeddable');
    assert.equal(playerErrorKind(150), 'not-embeddable');
    assert.equal(playerErrorKind(153), 'configuration');
    assert.equal(playerErrorKind(999), 'unknown');
  });

  it('estados', () => {
    assert.deepEqual([-1, 0, 1, 2, 3, 5, 42].map(playerStateName),
      ['unstarted', 'ended', 'playing', 'paused', 'buffering', 'cued', 'other']);
  });
});

describe('carga de la API', () => {
  it('añade el script oficial una sola vez y resuelve con YT al avisar de que está lista', async () => {
    const { doc, appended } = fakeDoc();
    const win = {};
    const first = loadYouTubeApi({ doc, win });
    const second = loadYouTubeApi({ doc, win });
    assert.equal(appended.length, 1);
    assert.equal(appended[0].src, YOUTUBE_IFRAME_API_URL);
    assert.equal(YOUTUBE_IFRAME_API_URL, 'https://www.youtube.com/iframe_api');
    win.YT = { Player: class {} };
    win.onYouTubeIframeAPIReady();
    assert.equal(await first, win.YT);
    assert.equal(await second, win.YT);
  });

  it('si el script no carga (red o bloqueador), rechaza y permite reintentar', async () => {
    const { doc, appended } = fakeDoc();
    const win = {};
    const attempt = loadYouTubeApi({ doc, win });
    appended[0].listeners.error();
    await assert.rejects(attempt, /load/);
    const retry = loadYouTubeApi({ doc, win });
    assert.equal(appended.length, 2);
    appended[1].listeners.error();
    await assert.rejects(retry, /load/);
  });

  it('si YT ya existe, no vuelve a cargar nada', async () => {
    const { doc, appended } = fakeDoc();
    const win = { YT: { Player: class {} } };
    assert.equal(await loadYouTubeApi({ doc, win }), win.YT);
    assert.equal(appended.length, 0);
  });
});
