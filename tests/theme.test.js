// Temas claro, oscuro y automático (T15): preferencia, valor por defecto, datos
// corruptos, persistencia y script de arranque (evita el destello del tema).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  THEME_KEY,
  THEME_PREFERENCES,
  parseThemePreference,
  serializeThemePreference,
  resolveTheme,
} from '../js/theme.js';
import { createThemeStore, HISTORY_KEY, PROGRESS_KEY } from '../js/storage.js';

class FakeStorage {
  constructor(initial = {}, { failRead = false, failWrite = false } = {}) {
    this.data = new Map(Object.entries(initial));
    this.failRead = failRead;
    this.failWrite = failWrite;
  }

  getItem(key) {
    if (this.failRead) throw new Error('SecurityError');
    return this.data.has(key) ? this.data.get(key) : null;
  }

  setItem(key, value) {
    if (this.failWrite) throw new Error('QuotaExceededError');
    this.data.set(key, String(value));
  }
}

describe('preferencia de tema', () => {
  it('tres opciones: claro, oscuro y automático', () => {
    assert.deepEqual(THEME_PREFERENCES, ['light', 'dark', 'auto']);
    assert.match(THEME_KEY, /^typingquest:theme:v\d+$/);
  });

  it('sin preferencia guardada: automático', () => {
    assert.equal(parseThemePreference(null), 'auto');
    assert.equal(parseThemePreference(undefined), 'auto');
  });

  it('datos corruptos o desconocidos: automático (valor seguro)', () => {
    for (const raw of ['{', 'dark', '"dark"', '{"version":2,"theme":"dark"}', '{"version":1,"theme":"azul"}', '[]', 'null']) {
      assert.equal(parseThemePreference(raw), 'auto', raw);
    }
  });

  it('ida y vuelta de cada preferencia', () => {
    for (const pref of THEME_PREFERENCES) assert.equal(parseThemePreference(serializeThemePreference(pref)), pref);
    assert.equal(parseThemePreference(serializeThemePreference('rosa')), 'auto');
  });

  it('automático sigue al sistema; claro y oscuro lo ignoran', () => {
    assert.equal(resolveTheme('auto', { prefersLight: true }), 'light');
    assert.equal(resolveTheme('auto', { prefersLight: false }), 'dark');
    assert.equal(resolveTheme('light', { prefersLight: false }), 'light');
    assert.equal(resolveTheme('dark', { prefersLight: true }), 'dark');
    assert.equal(resolveTheme('rosa', { prefersLight: true }), 'light');
  });
});

describe('createThemeStore (persistencia)', () => {
  it('guarda y recupera tras «recargar» (otra instancia del almacén)', () => {
    const storage = new FakeStorage();
    assert.deepEqual(createThemeStore(storage).save('light'), { ok: true });
    assert.equal(createThemeStore(storage).load(), 'light');
  });

  it('almacenamiento bloqueado o lleno: automático y sin lanzar', () => {
    assert.equal(createThemeStore(null).load(), 'auto');
    assert.equal(createThemeStore(new FakeStorage({}, { failRead: true })).load(), 'auto');
    assert.deepEqual(createThemeStore(null).save('dark'), { ok: false, error: 'unavailable' });
    assert.equal(createThemeStore(new FakeStorage({}, { failWrite: true })).save('dark').ok, false);
  });

  it('el tema no toca historial ni progreso (estadísticas independientes)', () => {
    const history = JSON.stringify({ version: 1, sessions: [] });
    const progress = JSON.stringify({ version: 1, currentExerciseId: 'b-u', exercises: [] });
    const storage = new FakeStorage({ [HISTORY_KEY]: history, [PROGRESS_KEY]: progress });
    createThemeStore(storage).save('dark');
    assert.equal(storage.data.get(HISTORY_KEY), history);
    assert.equal(storage.data.get(PROGRESS_KEY), progress);
  });
});

describe('arranque sin destello (js/theme-boot.js)', () => {
  const source = readFileSync(new URL('../js/theme-boot.js', import.meta.url), 'utf8');

  // Ejecuta el script clásico como en el <head>, con un documento y un sistema simulados.
  function boot({ stored = null, prefersLight = false, storageThrows = false, noMatchMedia = false } = {}) {
    const dataset = {};
    const context = {
      document: { documentElement: { dataset } },
      localStorage: {
        getItem: (key) => {
          if (storageThrows) throw new Error('SecurityError');
          return key === THEME_KEY ? stored : null;
        },
      },
      matchMedia: noMatchMedia ? undefined : (query) => ({ matches: query === '(prefers-color-scheme: light)' && prefersLight }),
    };
    context.window = context;
    vm.runInNewContext(source, context);
    return { ...dataset };
  }

  it('aplica el mismo tema que resolveTheme para todas las combinaciones', () => {
    for (const pref of [...THEME_PREFERENCES, null, 'rosa']) {
      for (const prefersLight of [true, false]) {
        const stored = pref === null ? null : serializeThemePreference(pref);
        const expectedPref = parseThemePreference(stored);
        assert.deepEqual(boot({ stored, prefersLight }), {
          theme: resolveTheme(expectedPref, { prefersLight }), themePreference: expectedPref,
        }, `${pref} / claro del sistema: ${prefersLight}`);
      }
    }
  });

  it('almacenamiento bloqueado, datos corruptos o sin matchMedia: valor seguro', () => {
    assert.deepEqual(boot({ storageThrows: true, prefersLight: true }), { theme: 'light', themePreference: 'auto' });
    assert.deepEqual(boot({ stored: '{roto', prefersLight: false }), { theme: 'dark', themePreference: 'auto' });
    assert.deepEqual(boot({ noMatchMedia: true }), { theme: 'dark', themePreference: 'auto' });
  });
});
