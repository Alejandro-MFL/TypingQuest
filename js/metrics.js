// Métricas de mecanografía. Módulo PURO: sin DOM ni lectura directa del reloj.

// Convención estándar: una «palabra» son 5 caracteres (también los espacios).
export const CHARS_PER_WORD = 5;
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
 * Pulsaciones por minuto (PPM, experimento 01): caracteres correctos / minutos.
 * Misma base que calcWpm (los caracteres correctos presentes en lo escrito), así
 * que PPM = WPM × 5. Un carácter compuesto con tecla muerta es UNO y los
 * modificadores (Mayús, AltGr) no son caracteres. Devuelve 0 con entradas no válidas.
 * @param {number} correctChars caracteres correctos escritos
 * @param {number} elapsedMs tiempo transcurrido en milisegundos
 * @returns {number} PPM sin redondear
 */
export function calcCpm(correctChars, elapsedMs) {
  if (!isPositiveNumber(correctChars) || !isPositiveNumber(elapsedMs)) {
    return 0;
  }
  return correctChars / (elapsedMs / MS_PER_MINUTE);
}

/**
 * PPM a partir de unas WPM ya calculadas (registros guardados, objetivos del
 * catálogo y mejores marcas, que siguen en WPM). Conversión exacta: × 5.
 * Devuelve null si el valor no es un número finito no negativo: nunca inventa datos.
 * @param {number} wpm palabras por minuto
 * @returns {number | null}
 */
export function wpmToCpm(wpm) {
  if (!Number.isFinite(wpm) || wpm < 0) return null;
  return wpm * CHARS_PER_WORD;
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
