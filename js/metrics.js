// Métricas de mecanografía. Módulo PURO: sin DOM ni lectura directa del reloj.

const CHARS_PER_WORD = 5;
const MS_PER_MINUTE = 60_000;

// Solo los números finitos mayores que 0 producen una métrica válida.
function isPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

/**
 * Palabras por minuto: (caracteres correctos / 5) / minutos.
 * Devuelve 0 si alguna entrada no es un número finito positivo.
 * @param {number} correctChars caracteres correctos escritos
 * @param {number} elapsedMs tiempo transcurrido en milisegundos
 * @returns {number} WPM sin redondear
 */
export function calcWpm(correctChars, elapsedMs) {
  if (!isPositiveNumber(correctChars) || !isPositiveNumber(elapsedMs)) {
    return 0;
  }
  const words = correctChars / CHARS_PER_WORD;
  const minutes = elapsedMs / MS_PER_MINUTE;
  return words / minutes;
}

/**
 * Precisión en porcentaje: pulsaciones correctas / pulsaciones totales × 100.
 * Devuelve 0 si alguna entrada no es un número finito positivo; nunca supera 100.
 * @param {number} correctKeystrokes pulsaciones correctas
 * @param {number} totalKeystrokes pulsaciones totales (sin contar retrocesos)
 * @returns {number} porcentaje sin redondear
 */
export function calcAccuracy(correctKeystrokes, totalKeystrokes) {
  if (!isPositiveNumber(correctKeystrokes) || !isPositiveNumber(totalKeystrokes)) {
    return 0;
  }
  const ratio = Math.min(correctKeystrokes / totalKeystrokes, 1);
  return ratio * 100;
}
