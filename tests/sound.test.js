import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSoundPlayer } from '../js/sound.js';

// AudioContext falso que registra los nodos y la programación de la envolvente.
function createFakeAudio() {
  const log = { contexts: 0, oscillators: [], gains: [], resumes: 0 };
  class FakeParam {
    constructor() { this.events = []; }
    setValueAtTime(v, t) { this.events.push(['set', v, t]); }
    linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); }
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
      const osc = { type: '', frequency: new FakeParam(), connect() { return this; },
        start(t) { this.startAt = t; }, stop(t) { this.stopAt = t; } };
      log.oscillators.push(osc);
      return osc;
    }
    createGain() {
      const gain = { gain: new FakeParam(), connect() { return this; } };
      log.gains.push(gain);
      return gain;
    }
  }
  return { FakeContext, log };
}

describe('createSoundPlayer', () => {
  it('está activado por defecto y no crea el AudioContext hasta unlock()', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ AudioContextClass: FakeContext });
    assert.equal(player.isEnabled(), true);
    assert.equal(log.contexts, 0);
    player.unlock();
    assert.equal(log.contexts, 1);
    assert.equal(log.resumes, 1);
  });

  it('respeta el estado inicial configurado', () => {
    const { FakeContext } = createFakeAudio();
    assert.equal(createSoundPlayer({ enabled: false, AudioContextClass: FakeContext }).isEnabled(), false);
  });

  it('reproduce un tono breve con envolvente suave al completar un fragmento', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ AudioContextClass: FakeContext });
    player.unlock();
    player.playChunkComplete();
    assert.equal(log.oscillators.length, 1);
    const [osc] = log.oscillators;
    const events = log.gains[0].gain.events;
    assert.deepEqual(events[0], ['set', 0, 10]);            // empieza en silencio: sin clic
    assert.equal(events.at(-1)[0], 'exp');                  // se apaga de forma gradual
    const durationMs = (osc.stopAt - osc.startAt) * 1000;
    assert.ok(durationMs >= 80 && durationMs <= 130, `duración ${durationMs} ms`);
    const peak = Math.max(...events.map((e) => e[1]));
    assert.ok(peak > 0 && peak <= 0.1, `volumen bajo (${peak})`);
  });

  it('no reproduce nada cuando está silenciado', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ AudioContextClass: FakeContext });
    player.unlock();
    player.setEnabled(false);
    player.playChunkComplete();
    assert.equal(log.oscillators.length, 0);
  });

  it('toggle alterna el estado y lo devuelve', () => {
    const { FakeContext } = createFakeAudio();
    const player = createSoundPlayer({ AudioContextClass: FakeContext });
    assert.equal(player.toggle(), false);
    assert.equal(player.toggle(), true);
  });

  it('crea el contexto al reproducir si aún no existía', () => {
    const { FakeContext, log } = createFakeAudio();
    const player = createSoundPlayer({ AudioContextClass: FakeContext });
    player.playChunkComplete();
    assert.equal(log.contexts, 1);
    assert.equal(log.oscillators.length, 1);
  });

  it('funciona sin errores si la Web Audio API no está disponible', () => {
    const player = createSoundPlayer({ AudioContextClass: undefined });
    assert.doesNotThrow(() => {
      player.unlock();
      player.playChunkComplete();
      player.toggle();
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
