import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_KEY,
  RECORD_FIELDS,
  EXERCISE_CUSTOM_TEXT,
  createSessionRecord,
  isValidRecord,
  parseHistory,
  createHistoryStore,
} from '../js/storage.js';

// Almacenamiento falso con la interfaz de localStorage. `fail` permite simular
// fallos por operación: { getItem, setItem, removeItem } → error a lanzar.
class FakeStorage {
  constructor(initial = {}, fail = {}) {
    this.data = new Map(Object.entries(initial));
    this.fail = fail;
    this.writes = 0;
  }

  getItem(key) {
    if (this.fail.getItem) throw this.fail.getItem;
    return this.data.has(key) ? this.data.get(key) : null;
  }

  setItem(key, value) {
    if (this.fail.setItem) throw this.fail.setItem;
    this.writes++;
    this.data.set(key, String(value));
  }

  removeItem(key) {
    if (this.fail.removeItem) throw this.fail.removeItem;
    this.data.delete(key);
  }
}

function domError(name) {
  const error = new Error(name);
  error.name = name;
  return error;
}

const STATS = { wpm: 42.123456, accuracy: 96.66666, elapsedMs: 61_234.5, errors: 3, corrections: 2 };
const FINISHED_AT = Date.UTC(2026, 9, 21, 10, 30, 0);

function record(overrides = {}) {
  return createSessionRecord({ id: 'id-1', finishedAt: FINISHED_AT, stats: STATS, mode: 'free', ...overrides });
}

function storedJson(storage) {
  return JSON.parse(storage.data.get(HISTORY_KEY));
}

describe('HISTORY_KEY', () => {
  it('es una clave versionada', () => {
    assert.match(HISTORY_KEY, /^typingquest:history:v\d+$/);
  });
});

describe('createSessionRecord', () => {
  it('crea un registro con los campos del historial', () => {
    assert.deepEqual(record(), {
      id: 'id-1',
      finishedAt: '2026-10-21T10:30:00.000Z',
      wpm: 42.12,
      accuracy: 96.67,
      elapsedMs: 61_235,
      errors: 3,
      mode: 'free',
      exercise: EXERCISE_CUSTOM_TEXT,
    });
  });

  it('el ejercicio inicial es «Texto personalizado»', () => {
    assert.equal(EXERCISE_CUSTOM_TEXT, 'custom-text');
  });

  it('no incluye el texto practicado aunque se le pase', () => {
    const withText = createSessionRecord({
      id: 'x', finishedAt: FINISHED_AT, stats: STATS, mode: 'strict', text: 'secreto',
    });
    assert.equal(JSON.stringify(withText).includes('secreto'), false);
  });

  it('produce un registro válido', () => {
    assert.equal(isValidRecord(record()), true);
  });
});

describe('isValidRecord', () => {
  it('rechaza registros incompletos o con tipos incorrectos', () => {
    const base = record();
    const bad = [
      null, 'x', [], {},
      { ...base, id: '' },
      { ...base, id: 7 },
      { ...base, finishedAt: 'ayer' },
      { ...base, wpm: -1 },
      { ...base, wpm: 'NaN' },
      { ...base, accuracy: 101 },
      { ...base, elapsedMs: Infinity },
      { ...base, errors: 1.5 },
      { ...base, mode: 'otro' },
      { ...base, exercise: '' },
    ];
    for (const value of bad) assert.equal(isValidRecord(value), false, JSON.stringify(value));
  });

  it('un campo desconocido no invalida el registro (se descarta al sanear)', () => {
    assert.equal(isValidRecord({ ...record(), keyStats: { a: { errors: 1 } } }), true);
  });
});

describe('parseHistory', () => {
  it('sin datos devuelve un historial vacío', () => {
    assert.deepEqual(parseHistory(null), { sessions: [], status: 'empty', discarded: 0 });
  });

  it('JSON corrupto se trata como historial vacío y se informa', () => {
    assert.deepEqual(parseHistory('{no json'), { sessions: [], status: 'corrupt', discarded: 0 });
  });

  it('una estructura inesperada se informa como corrupta', () => {
    for (const raw of ['[]', '42', '{"version":1}', '{"version":99,"sessions":[]}']) {
      assert.equal(parseHistory(raw).status, 'corrupt', raw);
    }
  });

  it('descarta los registros no válidos y conserva el resto', () => {
    const raw = JSON.stringify({ version: 1, sessions: [record(), { id: 'roto' }, record({ id: 'id-2' })] });
    const result = parseHistory(raw);
    assert.equal(result.status, 'ok');
    assert.equal(result.discarded, 1);
    assert.deepEqual(result.sessions.map((s) => s.id), ['id-1', 'id-2']);
  });

  it('al recuperar solo conserva los campos permitidos', () => {
    const raw = JSON.stringify({
      version: 1,
      sessions: [{ ...record(), keyStats: { a: 1 }, text: 'texto personalizado', __proto__x: 1 }],
    });
    assert.deepEqual(parseHistory(raw).sessions, [record()]);
  });

  it('es compatible con los registros válidos creados antes del esquema explícito', () => {
    const legacy = {
      id: 'a4b0f745-c940-48b3-a72c-0a4d1649bc79',
      finishedAt: '2026-10-21T13:11:49.268Z',
      wpm: 13.39,
      accuracy: 91.67,
      elapsedMs: 39438,
      errors: 4,
      mode: 'free',
      exercise: 'custom-text',
    };
    const raw = JSON.stringify({ version: 1, sessions: [legacy] });
    assert.deepEqual(parseHistory(raw), { sessions: [legacy], status: 'ok', discarded: 0 });
  });
});

describe('createHistoryStore: load', () => {
  it('lee las sesiones guardadas', () => {
    const storage = new FakeStorage();
    createHistoryStore(storage).add(record());
    assert.deepEqual(createHistoryStore(storage).load().sessions, [record()]);
  });

  it('sin almacenamiento informa de que no está disponible', () => {
    assert.deepEqual(createHistoryStore(null).load(), { sessions: [], status: 'unavailable', discarded: 0 });
  });

  it('si leer lanza (almacenamiento deshabilitado) informa de que no está disponible', () => {
    const store = createHistoryStore(new FakeStorage({}, { getItem: domError('SecurityError') }));
    assert.equal(store.load().status, 'unavailable');
  });

  it('con JSON corrupto no lanza', () => {
    const store = createHistoryStore(new FakeStorage({ [HISTORY_KEY]: '{{{' }));
    assert.equal(store.load().status, 'corrupt');
  });
});

describe('createHistoryStore: add', () => {
  it('guarda un registro en formato versionado', () => {
    const storage = new FakeStorage();
    assert.deepEqual(createHistoryStore(storage).add(record()), { ok: true, saved: true });
    assert.deepEqual(storedJson(storage), { version: 1, sessions: [record()] });
  });

  it('añade al final en orden de finalización', () => {
    const storage = new FakeStorage();
    const store = createHistoryStore(storage);
    store.add(record({ id: 'a' }));
    store.add(record({ id: 'b' }));
    assert.deepEqual(store.load().sessions.map((s) => s.id), ['a', 'b']);
  });

  it('no guarda dos veces la misma finalización', () => {
    const storage = new FakeStorage();
    const store = createHistoryStore(storage);
    store.add(record());
    assert.deepEqual(store.add(record()), { ok: true, saved: false, reason: 'duplicate' });
    assert.equal(store.load().sessions.length, 1);
    assert.equal(storage.writes, 1);
  });

  it('rechaza registros no válidos sin escribir', () => {
    const storage = new FakeStorage();
    assert.deepEqual(createHistoryStore(storage).add({ id: 'x' }), { ok: false, error: 'invalid' });
    assert.equal(storage.writes, 0);
  });

  it('informa de un error de cuota sin lanzar', () => {
    const store = createHistoryStore(new FakeStorage({}, { setItem: domError('QuotaExceededError') }));
    assert.deepEqual(store.add(record()), { ok: false, error: 'quota' });
  });

  it('reconoce el error de cuota de Firefox', () => {
    const store = createHistoryStore(new FakeStorage({}, { setItem: domError('NS_ERROR_DOM_QUOTA_REACHED') }));
    assert.deepEqual(store.add(record()), { ok: false, error: 'quota' });
  });

  it('informa de otros fallos de escritura sin lanzar', () => {
    const store = createHistoryStore(new FakeStorage({}, { setItem: new Error('x') }));
    assert.deepEqual(store.add(record()), { ok: false, error: 'write-failed' });
  });

  it('sin almacenamiento no lanza', () => {
    assert.deepEqual(createHistoryStore(null).add(record()), { ok: false, error: 'unavailable' });
  });

  it('sustituye un historial corrupto por uno válido', () => {
    const storage = new FakeStorage({ [HISTORY_KEY]: 'basura' });
    createHistoryStore(storage).add(record());
    assert.deepEqual(storedJson(storage).sessions, [record()]);
  });

  it('conserva solo las sesiones más recientes al superar el máximo', () => {
    const storage = new FakeStorage();
    const store = createHistoryStore(storage, { maxSessions: 2 });
    for (const id of ['a', 'b', 'c']) store.add(record({ id }));
    assert.deepEqual(store.load().sessions.map((s) => s.id), ['b', 'c']);
  });

  it('no guarda el texto practicado: solo los campos del registro', () => {
    const storage = new FakeStorage();
    createHistoryStore(storage).add(record());
    assert.deepEqual(Object.keys(storedJson(storage).sessions[0]).sort(), [
      'accuracy', 'elapsedMs', 'errors', 'exercise', 'finishedAt', 'id', 'mode', 'wpm',
    ]);
  });
});

describe('createHistoryStore: clear', () => {
  it('borra el historial', () => {
    const storage = new FakeStorage();
    const store = createHistoryStore(storage);
    store.add(record());
    assert.deepEqual(store.clear(), { ok: true });
    assert.equal(storage.data.has(HISTORY_KEY), false);
    assert.equal(store.load().status, 'empty');
  });

  it('no toca otras claves', () => {
    const storage = new FakeStorage({ otra: '1' });
    createHistoryStore(storage).clear();
    assert.equal(storage.data.get('otra'), '1');
  });

  it('informa de fallos sin lanzar', () => {
    assert.deepEqual(createHistoryStore(null).clear(), { ok: false, error: 'unavailable' });
    const failing = createHistoryStore(new FakeStorage({}, { removeItem: domError('SecurityError') }));
    assert.deepEqual(failing.clear(), { ok: false, error: 'unavailable' });
  });
});

describe('RECORD_FIELDS', () => {
  it('es la lista explícita de campos de una sesión', () => {
    assert.deepEqual(RECORD_FIELDS, [
      'id', 'finishedAt', 'wpm', 'accuracy', 'elapsedMs', 'errors', 'mode', 'exercise',
    ]);
    assert.ok(Object.isFrozen(RECORD_FIELDS));
  });
});

describe('createHistoryStore: esquema al guardar', () => {
  it('descarta propiedades desconocidas, incluido un texto, antes de escribir', () => {
    const storage = new FakeStorage();
    const result = createHistoryStore(storage).add({ ...record(), text: 'mi texto secreto', extra: 1 });
    assert.deepEqual(result, { ok: true, saved: true });
    assert.deepEqual(storedJson(storage).sessions, [record()]);
    assert.equal(storage.data.get(HISTORY_KEY).includes('secreto'), false);
  });

  it('al reescribir también limpia los registros antiguos con campos de más', () => {
    const dirty = { ...record({ id: 'viejo' }), text: 'antiguo' };
    const storage = new FakeStorage({ [HISTORY_KEY]: JSON.stringify({ version: 1, sessions: [dirty] }) });
    createHistoryStore(storage).add(record({ id: 'nuevo' }));
    assert.deepEqual(storedJson(storage).sessions.map(Object.keys), [
      [...RECORD_FIELDS], [...RECORD_FIELDS],
    ]);
  });
});

// --- Revisión T7: defectos confirmados -------------------------------------------

describe('createSessionRecord: entradas no válidas (no lanza)', () => {
  it('con finishedAt NaN devuelve null', () => {
    assert.equal(createSessionRecord({ id: 'a', finishedAt: NaN, stats: STATS, mode: 'free' }), null);
  });

  it('sin estadísticas devuelve null', () => {
    assert.equal(createSessionRecord({ id: 'a', finishedAt: FINISHED_AT, mode: 'free' }), null);
    assert.equal(createSessionRecord({ id: 'a', finishedAt: FINISHED_AT, stats: null, mode: 'free' }), null);
  });

  it('add() lo convierte en un error controlado, sin escribir', () => {
    const storage = new FakeStorage();
    const store = createHistoryStore(storage);
    const bad = createSessionRecord({ id: 'a', finishedAt: NaN, stats: STATS, mode: 'free' });
    assert.deepEqual(store.add(bad), { ok: false, error: 'invalid' });
    assert.deepEqual(store.add(createSessionRecord({ id: 'b', finishedAt: FINISHED_AT, mode: 'free' })), {
      ok: false, error: 'invalid',
    });
    assert.equal(storage.writes, 0);
  });
});

describe('createHistoryStore: límite de sesiones no válido', () => {
  function addAll(store, ids) {
    for (const id of ids) store.add(record({ id }));
    return store.load().sessions.map((s) => s.id);
  }

  it('maxSessions 0 conserva como mínimo 1 sesión, no todo el historial', () => {
    assert.deepEqual(addAll(createHistoryStore(new FakeStorage(), { maxSessions: 0 }), ['a', 'b']), ['b']);
  });

  it('un límite negativo también se lleva al mínimo de 1', () => {
    assert.deepEqual(addAll(createHistoryStore(new FakeStorage(), { maxSessions: -3 }), ['a', 'b']), ['b']);
  });

  it('un límite que no es un número usa el valor por defecto', () => {
    assert.deepEqual(addAll(createHistoryStore(new FakeStorage(), { maxSessions: NaN }), ['a', 'b']), ['a', 'b']);
  });
});

describe('isValidRecord: fecha ISO real', () => {
  it('rechaza fechas ambiguas o no ISO', () => {
    const invalid = [
      '1', '2026', '2026-10-21', '21/10/2026', 'Wed Oct 21 2026 10:30:00 GMT+0200',
      '2026-10-21 10:30:00Z', '2026-10-21T10:30:00+02:00', '2026-10-21T10:30:00.000',
    ];
    for (const finishedAt of invalid) {
      assert.equal(isValidRecord({ ...record(), finishedAt }), false, finishedAt);
    }
  });

  it('rechaza fechas con formato ISO que no existen', () => {
    for (const finishedAt of ['2026-02-30T10:00:00.000Z', '2026-13-01T10:00:00.000Z', '2026-10-21T25:00:00.000Z']) {
      assert.equal(isValidRecord({ ...record(), finishedAt }), false, finishedAt);
    }
  });

  it('acepta las fechas que genera toISOString, con o sin milisegundos', () => {
    assert.equal(isValidRecord({ ...record(), finishedAt: '2026-10-21T13:11:49.268Z' }), true);
    assert.equal(isValidRecord({ ...record(), finishedAt: '2024-02-29T00:00:00Z' }), true);
  });

  it('al recuperar descarta solo el registro con fecha no válida', () => {
    const raw = JSON.stringify({ version: 1, sessions: [record(), { ...record({ id: 'b' }), finishedAt: '1' }] });
    const result = parseHistory(raw);
    assert.deepEqual(result.sessions.map((s) => s.id), ['id-1']);
    assert.equal(result.discarded, 1);
  });
});
