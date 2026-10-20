// Configuración centralizada de TypingQuest.
export const CONFIG = Object.freeze({
  wordsPerChunk: 7,
  maxTextLength: 5000,
  // Reservados para T5d (animación) y T5e (sonido); aún no se usan.
  chunkAnimationMs: 350,
  soundEnabled: true,
  // Frecuencia de refresco del cronómetro y las estadísticas en vivo.
  statsRefreshMs: 250,
  // Tiempo mínimo antes de mostrar el WPM en vivo (evita picos al empezar).
  minWpmElapsedMs: 1000,
});
