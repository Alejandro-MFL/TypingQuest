import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSoundPlayer, SOUNDS, MAX_COMBINED_PEAK, peakSum, finishSoundKind } from '../js/sound.js';
import { volumeGain } from '../js/volume.js';

// AudioContext falso que registra los nodos y la programación de la envolvente.
function createFakeAudio() {
  const log = { contexts: 0, oscillators: [], gains: [], resumes: 0 };
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

  it('volumen máximo: más fuerte que antes (0,06) pero sin saturar aunque se solapen dos tonos', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 100, AudioContextClass: FakeContext });
    player.playChunkComplete();
    const master = log.gains[0].gain.value;
    assert.equal(master, 1);
    const peak = peakOf(log) * master;
    assert.ok(peak > 0.06 && peak * 2 <= 0.8, `pico ${peak}`);
  });

  it('volumen intermedio: ganancia general gradual (curva cuadrática)', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 50, AudioContextClass: FakeContext });
    player.playChunkComplete();
    assert.equal(log.gains[0].gain.value, 0.25);
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
    assert.ok(Math.abs(last[1] - 0.16) < 1e-9);
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
    // Aun solapando un fragmento con el sonido de objetivo, por debajo de 1 (escala completa).
    assert.ok(peakSum(SOUNDS.chunk) + peakSum(SOUNDS.objective) < 1);
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

  it('todas las notas pasan por el volumen general, que aplica la curva cuadrática', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ volume: 60, AudioContextClass: FakeContext });
    player.playExerciseComplete();
    const [master, ...notes] = log.gains;
    assert.equal(master.gain.value, volumeGain(60));
    assert.ok(Math.abs(volumeGain(60) - 0.36) < 1e-12, 'curva cuadrática conservada');
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
