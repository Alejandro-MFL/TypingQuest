// Configuración centralizada de TypingQuest.
export const CONFIG = Object.freeze({
  wordsPerChunk: 7,
  maxTextLength: 5000,
  // Duración de la animación al completar un fragmento.
  chunkAnimationMs: 350,
  // Estado inicial de «Bloquear avance con errores»: false = modo libre.
  blockOnErrorsDefault: false,
  // Sesiones que se conservan en el historial y que se muestran en las gráficas.
  maxHistorySessions: 500,
  historyChartSessions: 20,
  // Estado inicial del sonido (aún no se guarda la preferencia).
  soundEnabled: true,
  // Espera en el espacio final antes de mostrar la tecla de espacio.
  spaceHintDelayMs: 1500,
  // Frecuencia de refresco del cronómetro y las estadísticas en vivo.
  statsRefreshMs: 250,
  // Tiempo mínimo antes de mostrar el WPM en vivo (evita picos al empezar).
  minWpmElapsedMs: 1000,
});
