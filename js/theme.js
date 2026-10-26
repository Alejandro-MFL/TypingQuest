// Tema visual (T15). Módulo PURO: la preferencia del alumno y el tema resultante.
//
// Preferencias: 'light', 'dark' o 'auto' (sigue al sistema con prefers-color-scheme).
// Sin preferencia guardada, o si el dato no es válido, 'auto'. Se guarda en su
// propia clave (createThemeStore en storage.js), sin tocar historial ni progreso.
// js/theme-boot.js repite esta misma lógica en un script clásico que se ejecuta en
// el <head> antes de pintar (los módulos llegan después): así no hay destello del
// tema equivocado. tests/theme.test.js comprueba que ambos coinciden.

export const THEME_KEY = 'typingquest:theme:v1';
export const THEME_PREFERENCES = Object.freeze(['light', 'dark', 'auto']);
const THEME_VERSION = 1;

/** Preferencia guardada (texto JSON) → 'light' | 'dark' | 'auto'. Nunca lanza. */
export function parseThemePreference(raw) {
  if (typeof raw !== 'string') return 'auto';
  try {
    const data = JSON.parse(raw);
    return data?.version === THEME_VERSION && THEME_PREFERENCES.includes(data.theme) ? data.theme : 'auto';
  } catch {
    return 'auto';
  }
}

export function serializeThemePreference(preference) {
  const theme = THEME_PREFERENCES.includes(preference) ? preference : 'auto';
  return JSON.stringify({ version: THEME_VERSION, theme });
}

/** Tema que se aplica: el elegido, o el del sistema en automático (oscuro si no se sabe). */
export function resolveTheme(preference, { prefersLight }) {
  if (preference === 'light' || preference === 'dark') return preference;
  return prefersLight ? 'light' : 'dark';
}
