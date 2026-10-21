// Objetivos de aprendizaje de un ejercicio. Módulo PURO.
//
// Cada ejercicio tiene una precisión mínima (`targetAccuracy`) y, si su texto es
// lo bastante largo, unas WPM mínimas (`targetWpm`; null = no aplicable). Para
// superarlo hay que cumplir TODOS los objetivos aplicables. Terminar un ejercicio
// sin superarlo no bloquea nada: solo cambia su estado (ver progress.js).

// Por debajo de esta longitud (caracteres) la velocidad no es estable: un error o
// una pausa cambian mucho las WPM, así que el catálogo no admite objetivo de WPM.
export const MIN_WPM_TEXT_LENGTH = 40;
// Por debajo de este tiempo la medición no es humana ni fiable (40 caracteres en
// 3 s ≈ 160 WPM): las WPM no se dan por cumplidas aunque el número sea alto.
export const MIN_RELIABLE_WPM_MS = 3000;

/** true si el texto es lo bastante largo para tener objetivo de WPM. */
export function isWpmGoalAllowed(text) {
  return [...text.normalize('NFC')].length >= MIN_WPM_TEXT_LENGTH;
}

/**
 * Evalúa una práctica terminada frente a los objetivos del ejercicio.
 * @param {{ accuracy: number, wpm: number, elapsedMs: number }} stats de getStats
 * @param {{ targetAccuracy: number, targetWpm: number | null }} goals
 */
export function evaluateObjectives({ accuracy, wpm, elapsedMs }, { targetAccuracy, targetWpm }) {
  const accuracyMet = accuracy >= targetAccuracy;
  const applicable = targetWpm !== null && targetWpm !== undefined;
  const reliable = elapsedMs >= MIN_RELIABLE_WPM_MS;
  const wpmMet = applicable && reliable && wpm >= targetWpm;
  return {
    accuracy: { target: targetAccuracy, value: accuracy, met: accuracyMet },
    wpm: { target: applicable ? targetWpm : null, value: wpm, applicable, reliable, met: wpmMet },
    passed: accuracyMet && (!applicable || wpmMet),
  };
}
