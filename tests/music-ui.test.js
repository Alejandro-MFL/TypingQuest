// Textos y validaciones puras de la interfaz de Música (experimento 02).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLrcFile,
  MAX_LRC_FILE_BYTES,
  lyricsErrorMessage,
  videoErrorMessage,
  durationMismatchNote,
  practicePhaseText,
  phraseProgressText,
  resultAvailability,
  offsetFromSlider,
  sliderValue,
  offsetValueText,
  setupShouldOpen,
  setupStatusText,
  shouldReclaimTypingFocus,
  clickKeepsTypingFocus,
  focusLostNotice,
} from '../js/music-ui.js';
import { readFileSync } from 'node:fs';
import { createPractice, startPractice, tickPractice, typePhrase } from '../js/music-practice.js';
import { buildPhrases } from '../js/music-sync.js';

describe('validateLrcFile', () => {
  it('acepta un .lrc de tamaño razonable (también en mayúsculas)', () => {
    assert.deepEqual(validateLrcFile({ name: 'cancion.lrc', size: 2048 }), { ok: true });
    assert.deepEqual(validateLrcFile({ name: 'CANCION.LRC', size: 10 }), { ok: true });
  });

  it('rechaza otras extensiones, archivos vacíos y demasiado grandes', () => {
    assert.deepEqual(validateLrcFile({ name: 'letra.txt', size: 100 }), { ok: false, error: 'extension' });
    assert.deepEqual(validateLrcFile({ name: 'cancion.lrc.exe', size: 100 }), { ok: false, error: 'extension' });
    assert.deepEqual(validateLrcFile({ name: 'vacia.lrc', size: 0 }), { ok: false, error: 'empty' });
    assert.deepEqual(validateLrcFile({ name: 'grande.lrc', size: MAX_LRC_FILE_BYTES + 1 }), { ok: false, error: 'too-large' });
    assert.deepEqual(validateLrcFile(null), { ok: false, error: 'empty' });
  });
});

describe('mensajes de error', () => {
  it('letra: archivo y contenido', () => {
    assert.match(lyricsErrorMessage('extension'), /\.lrc/);
    assert.match(lyricsErrorMessage('too-large'), /grande/);
    assert.match(lyricsErrorMessage('not-synced'), /marcas de tiempo/);
    assert.match(lyricsErrorMessage('no-text'), /no tiene frases/);
    assert.match(lyricsErrorMessage('empty'), /vac/);
    assert.match(lyricsErrorMessage('read'), /leer/);
  });

  it('vídeo: URL no válida y errores del reproductor', () => {
    assert.match(videoErrorMessage('empty'), /Pega/);
    assert.match(videoErrorMessage('not-youtube'), /YouTube/);
    assert.match(videoErrorMessage('no-video'), /vídeo concreto/);
    assert.match(videoErrorMessage('not-embeddable'), /no permite/);
    assert.match(videoErrorMessage('not-found'), /no existe o es privado/);
    assert.match(videoErrorMessage('load'), /bloqueador/);
    assert.match(videoErrorMessage('configuration'), /configuración/);
    assert.match(videoErrorMessage('otro'), /No se puede reproducir/);
  });
});

describe('durationMismatchNote', () => {
  it('avisa si la duración del vídeo y la de la letra difieren más de 5 s', () => {
    assert.match(durationMismatchNote(220_000, 205), /3:40.*3:25/);
    assert.equal(durationMismatchNote(207_000, 205), null);
  });

  it('sin alguno de los datos no dice nada', () => {
    assert.equal(durationMismatchNote(NaN, 205), null);
    assert.equal(durationMismatchNote(220_000, null), null);
  });
});

describe('estado de la práctica en una frase (02.1)', () => {
  const phrases = buildPhrases([{ timeMs: 15_000, text: 'ab' }, { timeMs: 20_000, text: 'cd' }]);
  const tick = (state, t, playerState = 'playing') => tickPractice(state, { offsetMs: 0, now: t, timeMs: t, playerState }).state;
  const started = () => startPractice(createPractice(phrases), { offsetMs: 0, now: 13_000 }).state;

  it('antes de empezar y esperando a que aparezca la frase', () => {
    assert.match(practicePhaseText(createPractice(phrases)), /Empezar práctica/);
    assert.match(practicePhaseText(tick(started(), 13_000)), /aparecerá/);
  });

  it('escribiendo mientras suena, en pausa por el límite y con la canción terminada', () => {
    const shown = tick(tick(started(), 13_000), 14_000);
    assert.match(practicePhaseText(shown), /mientras suena/);
    const waiting = tick(shown, 19_700);
    assert.match(practicePhaseText(waiting), /pausa.*termina la frase/i);
    assert.match(practicePhaseText({ ...waiting, waitReason: 'ended' }), /canción ha terminado/);
  });

  it('frase completada a la espera de la siguiente, reproducción bloqueada y final', () => {
    const shown = tick(tick(started(), 13_000), 14_000);
    const done = ['a', 'ab'].reduce((state, value, i) => typePhrase(state, value, 15_000 + i, { offsetMs: 0, timeMs: 15_000 }).state, shown);
    assert.match(practicePhaseText(done), /siguiente aparecerá/);
    assert.match(practicePhaseText({ ...done, blocked: true }), /Continuar/);
    assert.match(practicePhaseText({ ...done, status: 'finished' }), /terminada/);
  });

  it('progreso', () => {
    // 02.4: solo la frase actual; las completadas ya están en las métricas (sin duplicar).
    assert.equal(phraseProgressText(started()), 'Frase 1 de 2');
  });
});

describe('deslizador de desfase (02.1)', () => {
  it('convierte segundos del control en milisegundos limitados y redondeados', () => {
    assert.equal(offsetFromSlider('1.3'), 1300);
    assert.equal(offsetFromSlider('-0.1'), -100);
    assert.equal(offsetFromSlider('45'), 30_000);
    assert.equal(offsetFromSlider('x'), 0);
    assert.equal(sliderValue(-2500), '-2.5');
    assert.equal(sliderValue(0), '0');
  });

  it('texto accesible con el signo y su significado', () => {
    assert.equal(offsetValueText(300), '+0,3 s: la letra aparece 0,3 s más tarde');
    assert.equal(offsetValueText(-1500), '−1,5 s: la letra aparece 1,5 s antes');
    assert.equal(offsetValueText(0), '0,0 s: sin desfase');
  });
});

describe('panel «Vídeo y letra» (02.1)', () => {
  it('abierto mientras falte el vídeo o la letra', () => {
    assert.equal(setupShouldOpen({ hasVideo: false, hasLyrics: false }), true);
    assert.equal(setupShouldOpen({ hasVideo: true, hasLyrics: false }), true);
    assert.equal(setupShouldOpen({ hasVideo: false, hasLyrics: true }), true);
    assert.equal(setupShouldOpen({ hasVideo: true, hasLyrics: true }), false);
  });

  it('mensaje de preparación dentro del panel', () => {
    assert.equal(setupStatusText({ hasVideo: false, hasLyrics: false }), 'Carga un vídeo y elige una letra para empezar.');
    assert.equal(setupStatusText({ hasVideo: true, hasLyrics: false }), 'Elige una letra sincronizada para empezar.');
    assert.equal(setupStatusText({ hasVideo: false, hasLyrics: true }), 'Carga el vídeo de YouTube para empezar.');
    assert.match(setupStatusText({ hasVideo: true, hasLyrics: true }), /Todo listo/);
  });
});

describe('estructura de la pantalla (index.html)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const screen = html.slice(html.indexOf('id="music-screen"'), html.indexOf('<!-- Ergonomía (T16)'));
  const setup = screen.slice(screen.indexOf('id="music-setup"'), screen.indexOf('</details>'));
  const stage = screen.slice(screen.indexOf('id="music-stage"'));

  it('toda la configuración está dentro del desplegable', () => {
    for (const id of ['music-url', 'music-video-button', 'music-video-status', 'music-track', 'music-artist',
      'music-search-button', 'music-results', 'music-file', 'music-lyrics-status', 'music-setup-status',
      'music-offset', 'music-offset-reset', 'music-check-button', 'music-live-line', 'music-note']) {
      assert.ok(setup.includes(`id="${id}"`), `${id} debe estar en «Vídeo y letra»`);
      assert.ok(!stage.includes(`id="${id}"`), `${id} no debe estar en la práctica`);
    }
    assert.match(setup, /<summary>Vídeo y letra/);
  });

  it('la práctica solo tiene vídeo, frase, escritura, controles, progreso y métricas', () => {
    for (const id of ['music-video', 'music-chunk-active', 'music-input', 'music-progress', 'music-phase',
      'music-play-button', 'music-repeat-button', 'music-prev-button', 'music-next-button', 'music-restart-button',
      'music-cpm', 'music-accuracy']) {
      assert.ok(stage.includes(`id="${id}"`), id);
    }
    assert.doesNotMatch(stage, /Elige una letra sincronizada|Carga un vídeo y elige/);
    assert.doesNotMatch(stage, /data-offset-step|type="range"/);
  });

  it('deslizador de −30 a +30 s con pasos de 0,1 s, etiqueta y valor visible', () => {
    const slider = setup.match(/<input[^>]*id="music-offset"[^>]*>/)[0];
    assert.match(slider, /type="range"/);
    assert.match(slider, /min="-30"/);
    assert.match(slider, /max="30"/);
    assert.match(slider, /step="0\.1"/);
    assert.ok(setup.includes('<label class="music-label" for="music-offset">'));
    assert.ok(setup.includes('<output class="music-offset-value" id="music-offset-value" for="music-offset">'));
  });

  // 02.4: una sola columna: vídeo, frase, estado, métricas y controles, en ese orden.
  it('orden vertical de la práctica', () => {
    const order = ['id="music-video"', 'id="music-lane"', 'id="music-progress"', 'id="music-phase"',
      'class="stats music-stats"', 'class="music-controls"'].map((marker) => stage.indexOf(marker));
    assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(screen.indexOf('id="music-setup"') < screen.indexOf('id="music-stage"'), '«Vídeo y letra», encima');
  });

  it('controles agrupados: principal, navegación por frases y reiniciar al final', () => {
    const controls = stage.slice(stage.indexOf('class="music-controls"'), stage.indexOf('class="music-diagnostics"'));
    const main = controls.slice(controls.indexOf('music-controls-main'), controls.indexOf('music-controls-nav'));
    const nav = controls.slice(controls.indexOf('music-controls-nav'), controls.indexOf('music-restart-button'));
    for (const id of ['music-start-button', 'music-continue-button', 'music-play-button']) assert.ok(main.includes(id), id);
    for (const id of ['music-prev-button', 'music-repeat-button', 'music-next-button']) assert.ok(nav.includes(id), id);
    assert.match(nav, /role="group" aria-label="Navegación por frases"/);
    assert.match(stage, /<span class="stat-label">frases completadas<\/span>/);
  });

  it('el diagnóstico de desarrollo está oculto por defecto', () => {
    assert.match(stage, /<pre class="music-diagnostics" id="music-diagnostics" hidden>/);
  });
});

describe('resultAvailability', () => {
  it('distingue letra sincronizada, solo texto e instrumental', () => {
    assert.deepEqual(resultAvailability({ synced: '[00:01.00]x', hasPlain: true, instrumental: false }),
      { usable: true, label: 'Letra sincronizada' });
    assert.deepEqual(resultAvailability({ synced: null, hasPlain: true, instrumental: false }),
      { usable: false, label: 'Solo letra sin sincronizar' });
    assert.deepEqual(resultAvailability({ synced: null, hasPlain: false, instrumental: true }),
      { usable: false, label: 'Instrumental (sin letra)' });
    assert.deepEqual(resultAvailability({ synced: null, hasPlain: false, instrumental: false }),
      { usable: false, label: 'Sin letra' });
  });
});

// 02.2: si el foco entra en el reproductor durante la práctica, las teclas ya no llegan al
// campo de escritura (y el marcador parecía retroceder): se devuelve al campo.
describe('shouldReclaimTypingFocus', () => {
  const base = { screenVisible: true, practiceActive: true, focusInPlayer: true, setupOpen: false };

  it('práctica en curso con el foco en el vídeo: se devuelve al campo', () => {
    assert.equal(shouldReclaimTypingFocus(base), true);
  });

  it('no se toca el foco fuera de la práctica, con el panel abierto o si el foco no está en el vídeo', () => {
    assert.equal(shouldReclaimTypingFocus({ ...base, practiceActive: false }), false);
    assert.equal(shouldReclaimTypingFocus({ ...base, screenVisible: false }), false);
    assert.equal(shouldReclaimTypingFocus({ ...base, setupOpen: true }), false);
    assert.equal(shouldReclaimTypingFocus({ ...base, focusInPlayer: false }), false, 'p. ej. cambiar de ventana');
  });
});

// 02.3: causa demostrada con la traza del usuario y un clic real. Un clic en una zona no
// interactiva de la práctica dejaba el foco en <body>: las teclas dejaban de llegar al campo
// y el marcador se quedaba quieto (parecía señalar letras ya escritas). En Academia ese clic
// no quita el foco (keepsTypingFocus) y una pérdida de foco muestra un aviso.
describe('foco del campo durante la práctica (como en Academia)', () => {
  // Elemento falso con closest(), como el del DOM.
  const target = (interactive) => ({ closest: (selector) => (interactive && selector.includes('button') ? {} : null) });

  it('un clic en una zona no interactiva conserva (o devuelve) el foco al campo', () => {
    assert.equal(clickKeepsTypingFocus({ practiceActive: true, inputEnabled: true, target: target(false) }), true);
  });

  it('botones, enlaces y campos sí reciben el foco; fuera de la práctica no se toca', () => {
    assert.equal(clickKeepsTypingFocus({ practiceActive: true, inputEnabled: true, target: target(true) }), false);
    assert.equal(clickKeepsTypingFocus({ practiceActive: false, inputEnabled: true, target: target(false) }), false);
    assert.equal(clickKeepsTypingFocus({ practiceActive: true, inputEnabled: false, target: target(false) }), false);
  });

  it('aviso visible si el foco se pierde dentro de la página, nunca al cambiar de ventana', () => {
    assert.equal(focusLostNotice({ practiceActive: true, inputFocused: false, windowFocused: true }), 'Haz clic aquí para seguir escribiendo');
    assert.equal(focusLostNotice({ practiceActive: true, inputFocused: false, windowFocused: false }), '');
    assert.equal(focusLostNotice({ practiceActive: true, inputFocused: true, windowFocused: true }), '');
    assert.equal(focusLostNotice({ practiceActive: false, inputFocused: false, windowFocused: true }), '');
  });
});

// 02.4: diseño en una sola columna (también en escritorio) y orden de la navegación.
describe('distribución de Música y navegación', () => {
  const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('la práctica es una sola columna centrada en cualquier ancho', () => {
    const rules = [...css.matchAll(/\.music-stage\s*\{([^}]*)\}/g)].map((m) => m[1]);
    assert.ok(rules.length > 0);
    for (const body of rules) {
      const columns = body.match(/grid-template-columns:\s*([^;]+);/);
      if (columns) assert.equal(columns[1].trim(), 'minmax(0, 1fr)', 'nunca dos columnas');
    }
    assert.match(rules.join(''), /max-width:/);
    assert.match(rules.join(''), /margin-inline:\s*auto/);
  });

  it('orden de la navegación: … Práctica libre → Música → Ergonomía', () => {
    const routes = [...html.matchAll(/class="main-nav-link" href="[^"]+" data-route="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(routes, ['home', 'academy', 'library', 'history', 'practice', 'music', 'ergonomics']);
  });
});
