import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createSoundPlayer, SOUNDS, KEY_SOUNDS, MAX_COMBINED_PEAK, peakSum, finishSoundKind,
  softLimitCurve, LIMIT_THRESHOLD, LIMIT_CEILING,
} from '../js/sound.js';
import { MAX_KEY_VOICES } from '../js/key-sound.js';
import { volumeGain } from '../js/volume.js';

// AudioContext falso que registra los nodos y la programación de la envolvente.
function createFakeAudio() {
  const log = { contexts: 0, oscillators: [], gains: [], resumes: 0, noises: [], filters: [], limiters: [], buffers: 0 };
  class FakeParam {
    constructor() { this.events = []; }
    setValueAtTime(v, t) { this.events.push(['set', v, t]); }
    linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); }
    setTargetAtTime(v, t, c) { this.events.push(['target', v, t, c]); this.value = v; }
    exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); }
  }
  class FakeContext {
    constructor() {
      log.contexts++;
      this.state = 'suspended';
      this.currentTime = 10;
      this.destination = {};
      this.sampleRate = 48000;
    }
    // Exp. 02.5: ruido (golpe del error), filtros y limitador de salida.
    createBuffer(channels, length, rate) {
      log.buffers++;
      const data = new Float32Array(length);
      return { length, sampleRate: rate, getChannelData: () => data };
    }
    createBufferSource() {
      const src = { buffer: null, connect(node) { this.target = node; return node; },
        start(t) { this.startAt = t; }, stop(t) { this.stopAt = t; } };
      log.noises.push(src);
      return src;
    }
    createBiquadFilter() {
      const filter = { type: '', frequency: new FakeParam(), Q: new FakeParam(), connect(node) { this.target = node; return node; } };
      log.filters.push(filter);
      return filter;
    }
    createWaveShaper() {
      const limiter = { curve: null, oversample: 'none', connect(node) { this.target = node; return node; } };
      log.limiters.push(limiter);
      return limiter;
    }
    resume() { log.resumes++; this.state = 'running'; return Promise.resolve(); }
    createOscillator() {
      const osc = { type: '', frequency: new FakeParam(), connect(node) { this.target = node; return node; },
        start(t) { this.startAt = t; }, stop(t) { this.stopAt = t; } };
      log.oscillators.push(osc);
      return osc;
    }
    createGain() {
      const gain = { gain: new FakeParam(), connect(node) { this.target = node; return node; } };
      log.gains.push(gain);
      return gain;
    }
  }
  return { FakeContext, log };
}

// Ganancia final de un tono: pico de su envolvente × ganancia del volumen general.
function peakOf(log, toneIndex = 0) {
  const tone = log.gains[toneIndex + 1].gain.events; // gains[0] = volumen general
  return Math.max(...tone.map((e) => e[1]));
}

describe('createSoundPlayer', () => {
  it('no crea el AudioContext hasta unlock() (tras una interacción)', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 70, AudioContextClass: FakeContext });
    assert.equal(player.getVolume(), 70);
    assert.equal(player.isEnabled(), true);
    assert.equal(log.contexts, 0);
    player.unlock();
    assert.equal(log.contexts, 1);
    assert.equal(log.resumes, 1);
  });

  it('reproduce un tono breve con envolvente suave al completar un fragmento', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 100, AudioContextClass: FakeContext });
    player.unlock();
    player.playChunkComplete();
    assert.equal(log.oscillators.length, 1);
    const [osc] = log.oscillators;
    const events = log.gains[1].gain.events;
    assert.deepEqual(events[0], ['set', 0, 10]);            // empieza en silencio: sin clic
    assert.equal(events.at(-1)[0], 'exp');                  // se apaga de forma gradual
    const durationMs = (osc.stopAt - osc.startAt) * 1000;
    assert.ok(durationMs >= 50 && durationMs <= 100, `confirmación breve: ${durationMs} ms`);
  });

  // Exp. 02.5: al 100 % el tono llega mucho más alto que antes (pico 0,2), con margen.
  it('volumen máximo: claramente más fuerte que antes, sin pasar de la escala completa', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 100, AudioContextClass: FakeContext });
    player.playChunkComplete();
    const master = log.gains[0].gain.value;
    assert.equal(master, 1);
    const peak = peakOf(log) * master;
    assert.ok(peak >= 0.4 && peak <= MAX_COMBINED_PEAK, `pico ${peak}`);
  });

  it('volumen intermedio: ganancia general gradual con la curva calibrada', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 50, AudioContextClass: FakeContext });
    player.playChunkComplete();
    assert.equal(log.gains[0].gain.value, volumeGain(50));
  });

  it('protección de picos: limitador en la salida (volumen general → limitador → altavoces)', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 100, AudioContextClass: FakeContext });
    player.playChunkComplete();
    player.playChunkComplete();
    assert.equal(log.limiters.length, 1, 'uno por contexto, reutilizado');
    const [limiter] = log.limiters;
    assert.equal(log.gains[0].target, limiter);
    assert.ok(limiter.target && !log.gains.includes(limiter.target), 'el limitador va a la salida');
    assert.equal(limiter.curve.length, softLimitCurve().length);
  });

  it('curva del limitador: intacta por debajo del umbral, suave y sin llegar nunca a 1', () => {
    const curve = softLimitCurve(2001);
    const at = (x) => curve[Math.round(((x + 1) / 2) * (curve.length - 1))];
    for (const x of [0, 0.1, 0.42, 0.79]) assert.ok(Math.abs(at(x) - x) < 1e-6, `sin tocar ${x}`);
    assert.ok(Math.abs(at(-0.5) + 0.5) < 1e-6, 'simétrica');
    for (let i = 1; i < curve.length; i++) assert.ok(curve[i] >= curve[i - 1], 'monótona: sin saltos');
    assert.ok(Math.max(...curve.map(Math.abs)) < 1, 'nunca la escala completa');
    assert.ok(at(1) > LIMIT_THRESHOLD && at(1) <= LIMIT_CEILING);
    assert.ok(curve.every(Number.isFinite), 'sin valores inválidos');
  });

  it('sin limitador disponible, el volumen general va directo a la salida', () => {
    const { FakeContext, log } = createFakeAudio();
    class NoLimiter extends FakeContext {}
    NoLimiter.prototype.createWaveShaper = undefined;
    const player = createSoundPlayer({ volume: 100, AudioContextClass: NoLimiter });
    assert.doesNotThrow(() => player.playChunkComplete());
    assert.equal(log.oscillators.length, 1);
    assert.equal(log.limiters.length, 0);
  });

  it('un solo volumen general para todos los tonos: no crea un contexto por efecto', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 60, AudioContextClass: FakeContext });
    player.playChunkComplete();
    player.playChunkComplete();
    assert.equal(log.contexts, 1);
    assert.equal(log.gains.length, 3, '1 general + 1 por tono');
  });

  it('setVolume cambia la ganancia de forma suave (sin clics) y la devuelve normalizada', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 100, AudioContextClass: FakeContext });
    player.unlock();
    assert.equal(player.setVolume(40.4), 40);
    const last = log.gains[0].gain.events.at(-1);
    assert.equal(last[0], 'target');
    assert.ok(Math.abs(last[1] - volumeGain(40)) < 1e-9, 'misma curva que al crear el audio');
  });

  it('setVolume ignora valores no válidos', () => {
    const player = createSoundPlayer({ volume: 30, AudioContextClass: undefined });
    assert.equal(player.setVolume('x'), 30);
    assert.equal(player.setVolume(150), 30);
  });

  it('volumen 0 %: no reproduce nada y no crea el AudioContext', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 0, AudioContextClass: FakeContext });
    assert.equal(player.isEnabled(), false);
    player.unlock();
    player.playChunkComplete();
    player.playPreview();
    assert.equal(log.contexts, 0);
    assert.equal(log.oscillators.length, 0);
  });

  it('al bajar a 0 % deja de sonar; al subir de nuevo vuelve a sonar', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 50, AudioContextClass: FakeContext });
    player.unlock();
    player.setVolume(0);
    player.playChunkComplete();
    assert.equal(log.oscillators.length, 0);
    player.setVolume(20);
    player.playChunkComplete();
    assert.equal(log.oscillators.length, 1);
  });

  it('sin interacción no suena nada: crear el reproductor no reproduce', () => {
    const { FakeContext, log } = createFakeAudio();
    createSoundPlayer({ volume: 100, AudioContextClass: FakeContext }).setVolume(80);
    assert.equal(log.contexts, 0);
    assert.equal(log.oscillators.length, 0);
  });

  it('playPreview reproduce el mismo tono para oír el volumen elegido', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 60, AudioContextClass: FakeContext });
    player.playPreview();
    assert.equal(log.oscillators.length, 1);
  });

  it('funciona sin errores si la Web Audio API no está disponible', () => {
    const player = createSoundPlayer({ AudioContextClass: undefined });
    assert.doesNotThrow(() => {
      player.unlock();
      player.playChunkComplete();
      player.setVolume(10);
      player.playPreview();
    });
  });

  it('no propaga errores del navegador al crear o usar el audio', () => {
    class BrokenContext { constructor() { throw new Error('bloqueado'); } }
    const player = createSoundPlayer({ AudioContextClass: BrokenContext });
    assert.doesNotThrow(() => {
      player.unlock();
      player.playChunkComplete();
    });
  });
});

// --- Experimento 01.1: sonidos de recompensa --------------------------------------

describe('sonidos por evento', () => {
  it('cada evento tiene su sonido: fragmento breve, ejercicio ascendente, objetivo más largo', () => {
    assert.equal(SOUNDS.chunk.length, 1, 'confirmación de una sola nota');
    const ascending = (notes) => notes.every((n, i) => i === 0 || n.frequencyHz >= notes[i - 1].frequencyHz);
    assert.ok(SOUNDS.exercise.length >= 2 && ascending(SOUNDS.exercise));
    assert.ok(ascending(SOUNDS.objective));
    const end = (notes) => Math.max(...notes.map((n) => n.startS + n.durationS));
    assert.ok(end(SOUNDS.chunk) < end(SOUNDS.exercise) && end(SOUNDS.exercise) < end(SOUNDS.objective));
    assert.ok(end(SOUNDS.objective) <= 0.7, 'sin melodías largas');
  });

  it('más agudos que el tono anterior (880 Hz): ninguna nota por debajo de 1000 Hz ni estridente (> 2500 Hz)', () => {
    for (const notes of Object.values(SOUNDS)) {
      for (const n of notes) assert.ok(n.frequencyHz >= 1000 && n.frequencyHz <= 2500, `${n.frequencyHz} Hz`);
    }
  });

  it('sin clipping: la suma de picos que pueden sonar a la vez queda bajo el límite prudente', () => {
    assert.ok(MAX_COMBINED_PEAK < 1);
    for (const [name, notes] of Object.entries(SOUNDS)) {
      assert.ok(peakSum(notes) <= MAX_COMBINED_PEAK, `${name}: ${peakSum(notes)}`);
    }
    // Exp. 02.5: los solapes poco probables (p. ej. una frase y un final seguidos) los
    // contiene el limitador de salida (ver «protección de picos»).
    assert.ok(MAX_COMBINED_PEAK >= 0.8, 'con margen, pero aprovechando la escala');
  });

  it('peakSum suma solo las notas que coinciden en el tiempo', () => {
    const a = { frequencyHz: 1000, startS: 0, durationS: 0.1, peakGain: 0.2 };
    const b = { frequencyHz: 1100, startS: 0.05, durationS: 0.1, peakGain: 0.2 };
    const c = { frequencyHz: 1200, startS: 0.2, durationS: 0.1, peakGain: 0.2 };
    assert.equal(peakSum([a, b, c]), 0.4);
    assert.equal(peakSum([a, c]), 0.2);
  });

  it('cada nota con envolvente suave: ataque desde 0 y caída exponencial', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 100, AudioContextClass: FakeContext });
    player.playObjectivePassed();
    const noteGains = log.gains.slice(1);
    assert.equal(noteGains.length, SOUNDS.objective.length);
    for (const g of noteGains) {
      const [first, attack, release] = g.gain.events;
      assert.equal(first[0], 'set');
      assert.equal(first[1], 0);
      assert.equal(attack[0], 'linear');
      assert.ok(attack[2] - first[2] >= 0.005, 'ataque de al menos 5 ms');
      assert.equal(release[0], 'exp');
    }
  });

  it('cada evento suena una vez y con sus notas (sin duplicados)', () => {
    for (const [method, notes] of [
      ['playChunkComplete', SOUNDS.chunk], ['playExerciseComplete', SOUNDS.exercise],
      ['playObjectivePassed', SOUNDS.objective], ['playPreview', SOUNDS.chunk],
    ]) {
      const { FakeContext, log } = createFakeAudio();
      createSoundPlayer({ volume: 80, AudioContextClass: FakeContext })[method]();
      assert.deepEqual(log.oscillators.map((o) => o.frequency.events[0][1]), notes.map((n) => n.frequencyHz), method);
    }
  });

  it('todas las notas pasan por el volumen general, que aplica la curva calibrada', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 60, AudioContextClass: FakeContext });
    player.playExerciseComplete();
    const [master, ...notes] = log.gains;
    assert.equal(master.gain.value, volumeGain(60));
    assert.ok(Math.abs(volumeGain(60) - 0.6 ** 1.5) < 1e-12, 'curva de potencia 1,5 (exp. 02.5)');
    for (const n of notes) assert.equal(n.target, master);
    for (const o of log.oscillators) assert.ok(log.gains.includes(o.target));
  });

  it('volumen 0 %: ningún sonido de recompensa suena', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 0, AudioContextClass: FakeContext });
    player.playExerciseComplete();
    player.playObjectivePassed();
    assert.equal(log.contexts, 0);
    assert.equal(log.oscillators.length, 0);
  });
});

describe('finishSoundKind', () => {
  it('objetivo superado → recompensa; terminado sin superar o práctica libre → ejercicio', () => {
    assert.equal(finishSoundKind({ passed: true }), 'objective');
    assert.equal(finishSoundKind({ passed: false }), 'exercise');
    assert.equal(finishSoundKind(null), 'exercise');
  });
});

describe('main.js: un solo sonido por evento', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

  it('al terminar suena SOLO el sonido final (no también el de fragmento)', () => {
    const finished = main.slice(main.indexOf("if (session.state.status === 'finished') {"));
    const branch = finished.slice(0, finished.indexOf('}'));
    assert.doesNotMatch(branch, /sound\./);
    assert.equal(main.match(/playFinish\(/g).length, 1, 'finishGame lo reproduce una vez');
  });

  it('el sonido de fragmento solo suena al completar un fragmento intermedio', () => {
    assert.equal(main.match(/sound\.playChunkComplete\(\)/g).length, 1);
  });
});

// Experimento 02.4: sonidos de teclado sintetizados, con su propio volumen relativo.
describe('sonidos de teclado', () => {
  const kinds = ['correct', 'error', 'backspace'];
  const durationMs = (notes) => Math.max(...notes.map((n) => (n.startS + n.durationS) * 1000));

  it('tres sonidos muy breves, sin resonancias largas', () => {
    assert.deepEqual(Object.keys(KEY_SOUNDS).sort(), [...kinds].sort());
    assert.ok(durationMs(KEY_SOUNDS.correct) <= 60, 'clic correcto');
    assert.ok(durationMs(KEY_SOUNDS.backspace) <= 60, 'retroceso seco');
    const error = durationMs(KEY_SOUNDS.error);
    assert.ok(error >= 180 && error <= 350, `error: «clonk» de 180-350 ms (${error})`);
  });

  // Exp. 02.5: tecla mecánica defectuosa: golpe de ruido filtrado + parciales inarmónicos
  // (metálico), seco y amortiguado; sin melodía ni tonos ascendentes.
  it('error: golpe inicial, cuerpo grave y parciales metálicos que se apagan antes', () => {
    const notes = KEY_SOUNDS.error;
    const hit = notes.filter((n) => n.type === 'noise');
    const tones = notes.filter((n) => n.type !== 'noise');
    assert.equal(hit.length, 1, 'un golpe de ruido');
    assert.ok(hit[0].startS === 0 && hit[0].durationS <= 0.02, 'golpe inicial muy breve');
    assert.ok(tones.length >= 3, 'cuerpo + parciales');
    const [body, ...partials] = tones;
    assert.ok(body.frequencyHz >= 150 && body.frequencyHz <= 250, 'ligeramente grave, no un zumbido');
    for (const p of partials) {
      const ratio = p.frequencyHz / body.frequencyHz;
      assert.ok(Math.abs(ratio - Math.round(ratio)) > 0.1, `parcial inarmónico (metálico): ${ratio}`);
      assert.ok(p.durationS < body.durationS, 'los agudos se apagan antes (amortiguado)');
      assert.ok(p.peakGain < body.peakGain);
    }
    for (const n of tones) assert.ok(!n.endFrequencyHz || n.endFrequencyHz <= n.frequencyHz, 'sin tonos ascendentes');
    assert.ok(tones.every((n) => n.startS === 0), 'un golpe, no una melodía');
    assert.ok(Math.max(...tones.map((n) => n.frequencyHz)) <= 1500, 'sin campanillas agudas');
  });

  it('error claramente distinto del clic correcto; retroceso más grave que el correcto', () => {
    const main = (kind) => KEY_SOUNDS[kind].find((n) => n.type !== 'noise');
    assert.ok(main('error').frequencyHz < main('correct').frequencyHz, 'el error es más grave que el acierto');
    assert.ok(durationMs(KEY_SOUNDS.error) > 3 * durationMs(KEY_SOUNDS.correct));
    assert.ok(main('backspace').frequencyHz < main('correct').frequencyHz);
  });

  it('equilibrio: error ≥ acierto (se distingue) y retroceso más discreto que el acierto', () => {
    assert.ok(peakSum(KEY_SOUNDS.error) >= peakSum(KEY_SOUNDS.correct) * 0.9);
    assert.ok(peakSum(KEY_SOUNDS.backspace) < peakSum(KEY_SOUNDS.correct));
    assert.ok(peakSum(KEY_SOUNDS.correct) >= 0.35, 'clic audible al 100 %');
  });

  it('el golpe del error: ruido filtrado con un búfer creado una vez por contexto', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 100, AudioContextClass: FakeContext, keySound: { enabled: true, volume: 100 } });
    player.playKey('error');
    player.playKey('error');
    assert.equal(log.buffers, 1);
    assert.equal(log.noises.length, 2, 'un golpe por pulsación errónea');
    assert.equal(log.filters[0].type, 'bandpass');
    assert.equal(log.noises[0].target, log.filters[0]);
  });

  it('volumen moderado y sin clipping aunque se solapen varias pulsaciones', () => {
    for (const kind of kinds) {
      assert.ok(peakSum(KEY_SOUNDS[kind]) * MAX_KEY_VOICES <= MAX_COMBINED_PEAK, kind);
    }
  });

  it('cada pulsación suena una vez por el bus del teclado (creado una vez) y este, por el volumen general', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 100, AudioContextClass: FakeContext, keySound: { enabled: true, volume: 100 } });
    player.playKey('correct');
    player.playKey('error');
    assert.equal(log.contexts, 1);
    const [master, keys] = log.gains;
    assert.equal(keys.target, master, 'teclado → volumen general');
    const tones = (kind) => KEY_SOUNDS[kind].filter((n) => n.type !== 'noise').length;
    assert.equal(log.oscillators.length, tones('correct') + tones('error'));
    assert.equal(log.noises.length, 1, 'el golpe del error');
    const toneGains = log.gains.slice(2);
    assert.ok(toneGains.every((g) => g.target === keys));
  });

  it('volumen del teclado intermedio: ganancia relativa (lineal) sobre la general', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 80, AudioContextClass: FakeContext, keySound: { enabled: true, volume: 50 } });
    player.playKey('correct');
    assert.equal(log.gains[0].gain.value, volumeGain(80));
    assert.equal(log.gains[1].gain.value, 0.5);
    player.setKeySound({ enabled: true, volume: 100 });
    assert.deepEqual(log.gains[1].gain.events.at(-1).slice(0, 2), ['target', 1], 'cambio suave');
  });

  it('desactivados, al 0 % o con el volumen general a 0: silencio y sin crear el audio', () => {
    for (const options of [
      { volume: 70, keySound: { enabled: false, volume: 80 } },
      { volume: 70, keySound: { enabled: true, volume: 0 } },
      { volume: 0, keySound: { enabled: true, volume: 80 } },
    ]) {
      const { FakeContext, log } = createFakeAudio();
      const player = createSoundPlayer({ ...options, AudioContextClass: FakeContext });
      for (const kind of kinds) player.playKey(kind);
      assert.equal(log.contexts, 0, JSON.stringify(options));
      assert.equal(log.oscillators.length, 0);
    }
  });

  it('el volumen del teclado no afecta a la frase completada ni al final', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 70, AudioContextClass: FakeContext, keySound: { enabled: false, volume: 0 } });
    player.playChunkComplete();
    player.playFinish('exercise');
    assert.equal(log.oscillators.length, SOUNDS.chunk.length + SOUNDS.exercise.length);
    assert.ok(log.gains.slice(1).every((g) => g.target === log.gains[0]), 'directos al volumen general');
  });

  it('pulsaciones rápidas: como mucho MAX_KEY_VOICES sonidos de tecla a la vez', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 100, AudioContextClass: FakeContext, keySound: { enabled: true, volume: 100 } });
    for (let i = 0; i < 10; i++) player.playKey('correct');
    assert.equal(log.oscillators.length, MAX_KEY_VOICES * KEY_SOUNDS.correct.length);
  });

  it('tipos desconocidos o nulos: silencio', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 100, AudioContextClass: FakeContext, keySound: { enabled: true, volume: 100 } });
    player.playKey(null);
    player.playKey('pato');
    assert.equal(log.oscillators.length, 0);
  });

  it('el tono baja de forma suave (sin clics) y cada nota sigue su envolvente', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 100, AudioContextClass: FakeContext, keySound: { enabled: true, volume: 100 } });
    player.playKey('error');
    const [osc] = log.oscillators;
    assert.equal(osc.frequency.events.at(-1)[0], 'exp');
    const events = log.gains[2].gain.events;
    assert.deepEqual(events[0], ['set', 0, 10]);
    assert.equal(events.at(-1)[0], 'exp');
  });

  it('sin Web Audio no falla', () => {
    const player = createSoundPlayer({ volume: 70, AudioContextClass: undefined, keySound: { enabled: true, volume: 50 } });
    assert.doesNotThrow(() => { player.playKey('correct'); player.setKeySound({ enabled: false, volume: 0 }); });
  });
});

describe('main.js y music.js: sonidos de tecla según el motor', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const music = readFileSync(new URL('../js/music.js', import.meta.url), 'utf8');

  it('una sola llamada a playKey por archivo, con el resultado del motor (keySoundFor)', () => {
    for (const source of [main, music]) {
      assert.equal(source.match(/sound\.playKey\(/g).length, 1);
      assert.match(source, /sound\.playKey\(keySoundFor\(/);
    }
  });

  it('nunca desde keydown ni desde las lecturas del vídeo', () => {
    assert.doesNotMatch(main, /onKeyDown:[^\n]*playKey/);
    const typing = music.slice(music.indexOf('function handleTyping'), music.indexOf('function control('));
    assert.match(typing, /playKey/, 'Música: solo al procesar lo escrito, nunca en tick() ni en los eventos del vídeo');
  });
});

describe('vista previa del teclado', () => {
  it('playKeyPreview suena como una tecla correcta y respeta el ajuste del teclado', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 70, AudioContextClass: FakeContext, keySound: { enabled: true, volume: 50 } });
    player.playKeyPreview();
    assert.equal(log.oscillators.length, KEY_SOUNDS.correct.length);
    player.setKeySound({ enabled: false, volume: 50 });
    player.playKeyPreview();
    assert.equal(log.oscillators.length, KEY_SOUNDS.correct.length);
  });
});

// Exp. 02.5: botones «Probar» del panel y separación del audio del vídeo.
describe('prueba de los efectos en el panel', () => {
  it('playTest suena con los volúmenes elegidos y respeta la casilla del teclado', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 50, AudioContextClass: FakeContext, keySound: { enabled: false, volume: 50 } });
    player.playTest('error');
    player.playTest('correct');
    assert.equal(log.contexts, 0, 'teclado desactivado: silencio');
    player.playTest('finish');
    assert.equal(log.oscillators.length, SOUNDS.objective.length, 'el final depende solo del general');
    player.setKeySound({ enabled: true, volume: 50 });
    player.playTest('error');
    assert.equal(log.noises.length, 1);
    assert.equal(log.gains[0].gain.value, volumeGain(50));
  });

  it('volumen general a 0 %: ninguna prueba suena', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 0, AudioContextClass: FakeContext, keySound: { enabled: true, volume: 100 } });
    for (const kind of ['correct', 'error', 'backspace', 'finish']) player.playTest(kind);
    assert.equal(log.contexts, 0);
  });

  it('index.html: cuatro botones de prueba dentro del panel de volumen', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const panel = html.slice(html.indexOf('id="volume-panel"'), html.indexOf('<nav'));
    const kinds = [...panel.matchAll(/data-sound-test="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(kinds, ['correct', 'error', 'backspace', 'finish']);
  });
});

describe('el audio del vídeo es independiente de los efectos', () => {
  const read = (file) => readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');

  it('ni los efectos ni Música cambian el volumen del reproductor de YouTube', () => {
    for (const file of ['music.js', 'youtube-player.js', 'sound.js', 'main.js']) {
      assert.doesNotMatch(read(file), /player[^\n]*\.(setVolume|mute|unMute)\(/, file);
      assert.doesNotMatch(read(file), /media\.player\?\.(setVolume|mute|unMute)/, file);
    }
    assert.doesNotMatch(read('sound.js'), /youtube|iframe|media\./i, 'sound.js no conoce el reproductor de vídeo');
  });
});

// Exp. 02.5: el límite de voces cuenta solo la parte fuerte (inicio) de cada sonido: errores
// seguidos a ritmo humano (cada 100 ms) suenan todos aunque la cola del anterior siga.
describe('errores seguidos a ritmo humano', () => {
  it('cada error suena aunque el anterior no haya terminado de apagarse', () => {
    const { FakeContext, log } = createFakeAudio();
    let ctx = null;
    class Clock extends FakeContext { constructor() { super(); ctx = this; } }
    const player = createSoundPlayer({ volume: 100, AudioContextClass: Clock, keySound: { enabled: true, volume: 100 } });
    for (let i = 0; i < 5; i++) {
      player.playKey('error');
      ctx.currentTime += 0.1;
    }
    assert.equal(log.noises.length, 5);
  });
});
