// Cálculos del historial para la pantalla de historial. Módulo PURO: sin DOM
// ni almacenamiento. Las sesiones llegan de storage.js en orden de finalización.

/** Totales del historial. Con 0 sesiones, los valores agregados son null. */
export function summarizeHistory(sessions) {
  if (sessions.length === 0) return { count: 0, bestWpm: null, averageAccuracy: null };
  const totalAccuracy = sessions.reduce((sum, s) => sum + s.accuracy, 0);
  return {
    count: sessions.length,
    bestWpm: Math.max(...sessions.map((s) => s.wpm)),
    averageAccuracy: totalAccuracy / sessions.length,
  };
}

/** Máximo del eje vertical: el mayor valor redondeado a la decena, mínimo 10. */
export function chartScaleMax(values) {
  const max = values.length > 0 ? Math.max(...values) : 0;
  return Math.max(10, Math.ceil(max / 10) * 10);
}

/**
 * Coordenadas de una línea dentro de una caja width × height (origen arriba a
 * la izquierda, como en SVG). Los valores se limitan a [0, maxValue].
 */
export function chartPoints(values, { width, height, maxValue }) {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, i) => {
    const clamped = Math.min(Math.max(value, 0), maxValue);
    return {
      x: values.length > 1 ? i * step : width / 2,
      y: height - (clamped / maxValue) * height,
    };
  });
}

/** Resumen textual de una serie, como alternativa accesible al gráfico. */
export function describeSeries(label, values) {
  if (values.length === 0) return `${label}: sin sesiones.`;
  const last = Math.round(values.at(-1));
  if (values.length === 1) return `${label} en la última sesión: ${last}.`;
  const min = Math.round(Math.min(...values));
  const max = Math.round(Math.max(...values));
  return `${label} en las últimas ${values.length} sesiones: mínimo ${min}, máximo ${max}, última ${last}.`;
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Fecha y hora locales de un registro (ISO 8601), p. ej. «21/10/2026, 09:05». */
export function formatDateTime(iso) {
  return DATE_TIME_FORMAT.format(new Date(iso));
}
