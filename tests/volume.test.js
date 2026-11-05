import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VOLUME,
  VOLUME_KEY,
  normalizeVolume,
  parseVolumePreference,
  serializeVolumePreference,
  initialVolume,
  volumeGain,
  volumeLevel,
  formatVolume,
  volumeButtonLabel,
} from '../js/volume.js';
import { createVolumeStore } from '../js/storage.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data,
  };
}

describe('normalizeVolume', () => {
  it('acepta enteros de 0 a 100 y redondea los decimales', () => {
    assert.equal(normalizeVolume(0), 0);
    assert.equal(normalizeVolume(55), 55);
    assert.equal(normalizeVolume(100), 100);
    assert.equal(normalizeVolume(42.6), 43);
    assert.equal(normalizeVolume('35'), 35, 'el valor de un <input type="range"> llega como texto');
  });

  it('rechaza lo que no es un volumen válido', () => {
    for (const value of [-1, 101, NaN, Infinity, null, undefined, '', 'alto', {}]) {
      assert.equal(normalizeVolume(value), null, String(value));
    }
  });
});

describe('preferencia guardada', () => {
  it('formato versionado en su propia clave', () => {
    assert.equal(VOLUME_KEY, 'typingquest:sound:v1');
    assert.deepEqual(JSON.parse(serializeVolumePreference(35)), { version: 1, volume: 35 });
  });

  it('lee el volumen guardado, también 0 (silencio)', () => {
    assert.equal(parseVolumePreference(serializeVolumePreference(0)), 0);
    assert.equal(parseVolumePreference(serializeVolumePreference(80)), 80);
  });

  it('sin dato, dañado o con otra versión: null (se usa el valor inicial)', () => {
    for (const raw of [null, '', '{', '[]', '"x"', '{"version":2,"volume":50}', '{"version":1,"volume":500}',
      '{"version":1}', '{"__proto__":{"volume":50},"version":1}']) {
      assert.equal(parseVolumePreference(raw), null, raw);
    }
  });
});

describe('initialVolume (compatibilidad con la preferencia anterior)', () => {
  it('usa el volumen guardado si existe', () => {
    assert.equal(initialVolume({ stored: 25, legacyEnabled: true }), 25);
    assert.equal(initialVolume({ stored: 0, legacyEnabled: true }), 0, 'el silencio guardado se respeta');
  });

  it('sin preferencia guardada: volumen por defecto si el sonido estaba activado', () => {
    assert.equal(initialVolume({ stored: null, legacyEnabled: true }), DEFAULT_VOLUME);
  });

  it('sin preferencia guardada y sonido desactivado: no se activa por sorpresa', () => {
    assert.equal(initialVolume({ stored: null, legacyEnabled: false }), 0);
  });
});

describe('volumeGain (curva de volumen)', () => {
  it('0 % es silencio y 100 % el máximo definido (ganancia 1 sobre el tono)', () => {
    assert.equal(volumeGain(0), 0);
    assert.equal(volumeGain(100), 1);
  });

  it('curva cuadrática: los niveles intermedios suenan graduales, no lineales', () => {
    assert.equal(volumeGain(50), 0.25);
    assert.ok(volumeGain(20) < volumeGain(40) && volumeGain(40) < volumeGain(80));
  });

  it('valores no válidos se tratan como silencio', () => {
    assert.equal(volumeGain(NaN), 0);
    assert.equal(volumeGain(-10), 0);
  });
});

describe('textos e icono del volumen', () => {
  it('nivel del icono: silencio, bajo y alto', () => {
    assert.equal(volumeLevel(0), 'muted');
    assert.equal(volumeLevel(1), 'low');
    assert.equal(volumeLevel(49), 'low');
    assert.equal(volumeLevel(50), 'high');
    assert.equal(volumeLevel(100), 'high');
  });

  it('valor visible y nombre accesible del botón', () => {
    assert.equal(formatVolume(70), '70 %');
    assert.equal(volumeButtonLabel(70), 'Volumen: 70 %');
    assert.equal(volumeButtonLabel(0), 'Volumen: silenciado');
  });
});

describe('createVolumeStore', () => {
  it('guarda y recupera el volumen sin tocar otras preferencias', () => {
    const storage = memoryStorage({ 'typingquest:theme:v1': '{"version":1,"theme":"dark"}' });
    const store = createVolumeStore(storage);
    assert.equal(store.load(), null);
    assert.deepEqual(store.save(40), { ok: true });
    assert.equal(store.load(), 40);
    assert.equal(storage.data.get('typingquest:theme:v1'), '{"version":1,"theme":"dark"}');
  });

  it('no guarda valores no válidos', () => {
    const storage = memoryStorage();
    assert.deepEqual(createVolumeStore(storage).save(150), { ok: false, error: 'invalid' });
    assert.equal(storage.data.size, 0);
  });

  it('nunca lanza: sin almacenamiento o con errores del navegador', () => {
    assert.equal(createVolumeStore(null).load(), null);
    assert.deepEqual(createVolumeStore(null).save(50), { ok: false, error: 'unavailable' });
    const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
    assert.equal(createVolumeStore(broken).load(), null);
    assert.equal(createVolumeStore(broken).save(50).ok, false);
  });
});
