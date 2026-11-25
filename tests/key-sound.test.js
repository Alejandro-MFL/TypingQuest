// Experimento 02.4: sonidos de teclado. Preferencias por contexto (mecanografía y Música),
// ganancia relativa al volumen general y clasificación de la pulsación según el motor.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_SOUND_KEY, DEFAULT_KEY_SOUND, keySoundContext, parseKeySoundPreference, serializeKeySoundPreference,
  resolveKeySound, updateKeySound, keySoundGain, classifyKeystroke, keySoundContextText, allowKeyVoice, MAX_KEY_VOICES, keySoundFor,
} from '../js/key-sound.js';
import { createGame, applyInput } from '../js/game.js';
import { createKeySoundStore } from '../js/storage.js';
import { volumeGain } from '../js/volume.js';

describe('preferencias de los sonidos de teclado', () => {
  it('clave versionada propia, distinta del volumen general', () => {
    assert.equal(KEY_SOUND_KEY, 'typingquest:keys:v1');
  });

  it('por defecto: activados en la mecanografía y desactivados en Música, volumen moderado', () => {
    assert.deepEqual(resolveKeySound({}), DEFAULT_KEY_SOUND);
    assert.equal(DEFAULT_KEY_SOUND.typing.enabled, true);
    assert.equal(DEFAULT_KEY_SOUND.music.enabled, false);
    assert.ok(DEFAULT_KEY_SOUND.typing.volume > 0 && DEFAULT_KEY_SOUND.typing.volume <= 60);
  });

  it('contexto según la ruta: Música aparte; Academia, Biblioteca, Práctica libre y el resto, mecanografía', () => {
    assert.equal(keySoundContext('music'), 'music');
    for (const route of ['academy', 'library', 'practice', 'home', 'history', 'ergonomics', null]) {
      assert.equal(keySoundContext(route), 'typing');
    }
  });

  it('una preferencia explícita se conserva y no afecta al otro contexto', () => {
    const stored = updateKeySound({}, 'music', { enabled: true });
    assert.deepEqual(stored, { music: { enabled: true, volume: DEFAULT_KEY_SOUND.music.volume } });
    const prefs = resolveKeySound(stored);
    assert.equal(prefs.music.enabled, true);
    assert.deepEqual(prefs.typing, DEFAULT_KEY_SOUND.typing);
    const again = updateKeySound(stored, 'typing', { volume: 20 });
    assert.deepEqual(resolveKeySound(again), { typing: { enabled: true, volume: 20 }, music: { enabled: true, volume: 50 } });
  });

  it('serializa y recupera solo lo elegido por el usuario', () => {
    const stored = updateKeySound(updateKeySound({}, 'music', { enabled: true }), 'typing', { volume: 35 });
    assert.deepEqual(parseKeySoundPreference(serializeKeySoundPreference(stored)), stored);
  });

  it('localStorage no fiable: datos dañados o raros se descartan sin lanzar', () => {
    for (const raw of [null, '', '{', '[]', '"x"', '{"version":2,"music":{"enabled":true,"volume":5}}',
      '{"version":1,"__proto__":{"enabled":true}}']) {
      assert.deepEqual(parseKeySoundPreference(raw), {}, String(raw));
    }
    const mixed = '{"version":1,"music":{"enabled":"sí","volume":5},"typing":{"enabled":false,"volume":40},"otro":{"enabled":true,"volume":1}}';
    assert.deepEqual(parseKeySoundPreference(mixed), { typing: { enabled: false, volume: 40 } });
    assert.deepEqual(parseKeySoundPreference('{"version":1,"typing":{"enabled":true,"volume":140}}'), {});
  });

  it('updateKeySound ignora contextos y valores no válidos', () => {
    assert.deepEqual(updateKeySound({}, 'otro', { enabled: true }), {});
    assert.deepEqual(updateKeySound({}, 'typing', { volume: -5 }), { typing: DEFAULT_KEY_SOUND.typing });
  });

  it('texto del contexto del ajuste en el panel', () => {
    assert.match(keySoundContextText('music'), /Música/);
    assert.match(keySoundContextText('typing'), /Academia, Biblioteca y Práctica libre/);
  });
});

describe('keySoundGain: relativa al volumen general', () => {
  it('desactivados o al 0 %: silencio', () => {
    assert.equal(keySoundGain({ enabled: false, volume: 80 }), 0);
    assert.equal(keySoundGain({ enabled: true, volume: 0 }), 0);
  });

  // Exp. 02.5: el teclado es un AJUSTE relativo y lineal: con la curva del general, 50 % y 50 %
  // dan 0,35 × 0,5 ≈ −15 dB (antes, dos curvas cuadráticas: 0,0625 ≈ −24 dB, casi inaudible).
  it('al 100 % no cambia el volumen general; intermedio, proporcional (sin doble curva)', () => {
    assert.equal(keySoundGain({ enabled: true, volume: 100 }), 1);
    assert.equal(keySoundGain({ enabled: true, volume: 50 }), 0.5);
    assert.equal(keySoundGain({ enabled: true, volume: 20 }), 0.2);
    const combined = volumeGain(50) * keySoundGain({ enabled: true, volume: 50 });
    assert.ok(combined > 2.5 * 0.25 * 0.25, `50 % y 50 %: ${combined} (antes 0,0625)`);
  });
});

describe('classifyKeystroke: solo el resultado real del motor', () => {
  const start = createGame('casa mesa', { mode: 'free' });

  it('pulsación correcta → correct', () => {
    assert.equal(classifyKeystroke(start, applyInput(start, 'c', 1000)), 'correct');
  });

  it('pulsación incorrecta aceptada → error (nunca correct a la vez)', () => {
    assert.equal(classifyKeystroke(start, applyInput(start, 'x', 1000)), 'error');
  });

  it('retroceso que cambia el estado → backspace', () => {
    const typed = applyInput(applyInput(start, 'c', 1000), 'ca', 1000);
    assert.equal(classifyKeystroke(typed, applyInput(typed, 'c', 1000)), 'backspace');
  });

  it('entrada rechazada (mismo estado: pegado, retroceso sin efecto, bloqueo) → sin sonido', () => {
    assert.equal(classifyKeystroke(start, applyInput(start, 'casa', 1000)), null, 'pegado');
    assert.equal(classifyKeystroke(start, applyInput(start, '', 1000)), null, 'retroceso sin efecto');
    const strict = createGame('ab cd', { mode: 'strict', segmentEnds: [3, 5] });
    const wrong = applyInput(applyInput(strict, 'a', 1000), 'ax', 1000);
    const full = applyInput(wrong, 'ax ', 1000);
    assert.equal(classifyKeystroke(full, applyInput(full, 'ax c', 1000)), null, 'bloqueo del modo estricto');
  });

  it('sin estados válidos → sin sonido', () => {
    assert.equal(classifyKeystroke(null, start), null);
    assert.equal(classifyKeystroke(start, null), null);
  });
});

describe('allowKeyVoice: pulsaciones rápidas sin acumulación', () => {
  it('admite hasta MAX_KEY_VOICES sonidos de tecla simultáneos y descarta los ya terminados', () => {
    const ends = Array.from({ length: MAX_KEY_VOICES }, () => 1.05);
    assert.equal(allowKeyVoice(ends, 1.0), false);
    assert.equal(allowKeyVoice(ends, 1.06), true);
    assert.equal(allowKeyVoice([], 0), true);
  });
});

describe('createKeySoundStore', () => {
  function memoryStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), data };
  }

  it('guarda y recupera las preferencias sin tocar el volumen general', () => {
    const storage = memoryStorage({ 'typingquest:sound:v1': '{"version":1,"volume":80}' });
    const store = createKeySoundStore(storage);
    assert.deepEqual(store.load(), {});
    const stored = updateKeySound({}, 'music', { enabled: true, volume: 30 });
    assert.deepEqual(store.save(stored), { ok: true });
    assert.deepEqual(store.load(), stored);
    assert.equal(storage.data.get('typingquest:sound:v1'), '{"version":1,"volume":80}');
  });

  it('nunca lanza: sin almacenamiento o con errores del navegador', () => {
    assert.deepEqual(createKeySoundStore(null).load(), {});
    assert.deepEqual(createKeySoundStore(null).save({}), { ok: false, error: 'unavailable' });
    const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
    assert.deepEqual(createKeySoundStore(broken).load(), {});
    assert.equal(createKeySoundStore(broken).save({}).ok, false);
  });
});

describe('keySoundFor: un solo sonido por entrada', () => {
  it('la pulsación que completa un fragmento o termina la partida no suena como tecla (suena su confirmación)', () => {
    const game = createGame('ab cd', { mode: 'free', segmentEnds: [3, 5] });
    const typed = applyInput(applyInput(game, 'a', 1000), 'ab', 1000);
    const chunk = applyInput(typed, 'ab ', 1000);
    assert.equal(chunk.segmentIndex, 1);
    assert.equal(keySoundFor(typed, chunk), null);
    const almost = applyInput(chunk, 'ab c', 1000);
    assert.equal(keySoundFor(chunk, almost), 'correct');
    const done = applyInput(almost, 'ab cx', 1000);
    assert.equal(done.status, 'finished');
    assert.equal(keySoundFor(almost, done), null);
  });

  it('en el resto de casos, la clasificación de la pulsación', () => {
    const game = createGame('casa', { mode: 'free' });
    assert.equal(keySoundFor(game, applyInput(game, 'x', 1000)), 'error');
    assert.equal(keySoundFor(game, game), null);
  });
});

// Exp. 02.5: la nueva calibración no cambia el formato guardado.
describe('compatibilidad con las preferencias guardadas en 02.4', () => {
  it('lee igual los datos escritos antes de recalibrar', () => {
    const before = '{"version":1,"music":{"enabled":true,"volume":30},"typing":{"enabled":true,"volume":50}}';
    assert.deepEqual(parseKeySoundPreference(before), { music: { enabled: true, volume: 30 }, typing: { enabled: true, volume: 50 } });
    assert.equal(keySoundGain(resolveKeySound(parseKeySoundPreference(before)).music), 0.3);
  });
});
