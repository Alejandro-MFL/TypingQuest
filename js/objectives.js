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

// --- Consejo al terminar (T14) --------------------------------------------------------

const ADVICE_TEXTS = {
  continue: 'Objetivo superado. Puedes seguir con el siguiente ejercicio; repetirlo de vez en cuando también ayuda.',
  fluency: 'La precisión ya está. Ahora trabaja la fluidez: repite buscando un ritmo constante, sin pararte entre letras.',
  'slow-down': 'Vas rápido, pero fallas más de lo previsto: baja un poco el ritmo y céntrate en no fallar.',
  calm: 'Repite con calma: primero escribe sin errores; la velocidad llegará con la práctica.',
  unreliable: 'La precisión está bien, pero la práctica fue demasiado corta para medir la velocidad con fiabilidad.',
};

/**
 * Qué conviene hacer a continuación según el resultado de evaluateObjectives:
 * { kind, text }. Solo usa esta partida (no compara con sesiones anteriores) y
 * nunca cambia los objetivos ni bloquea el avance.
 */
export function practiceAdvice(evaluation) {
  const { accuracy, wpm } = evaluation;
  let kind;
  if (evaluation.passed) kind = 'continue';
  else if (!accuracy.met) kind = wpm.applicable && wpm.reliable && wpm.met ? 'slow-down' : 'calm';
  else kind = wpm.reliable ? 'fluency' : 'unreliable';
  return { kind, text: ADVICE_TEXTS[kind] };
}
