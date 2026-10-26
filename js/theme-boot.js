// Arranque del tema (T15). Script CLÁSICO, cargado de forma síncrona en el <head>
// antes de la hoja de estilos: aplica el tema antes del primer pintado para que no
// haya destello. Es la única lectura de localStorage fuera de storage.js y repite la
// lógica de js/theme.js (parseThemePreference + resolveTheme); tests/theme.test.js
// comprueba que ambos coinciden. Ante cualquier fallo: automático.
(function () {
  var preference = 'auto';
  try {
    var data = JSON.parse(localStorage.getItem('typingquest:theme:v1'));
    if (data && data.version === 1 && (data.theme === 'light' || data.theme === 'dark' || data.theme === 'auto')) {
      preference = data.theme;
    }
  } catch (error) {
    preference = 'auto';
  }
  var prefersLight = typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches;
  var theme = preference === 'auto' ? (prefersLight ? 'light' : 'dark') : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
})();
