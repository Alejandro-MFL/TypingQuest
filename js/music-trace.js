// Diagnóstico de DESARROLLO de Música (02.3, solo con ?diagnostico=1). Módulo PURO: sin DOM.
// Registro limitado de eventos (entrada, motor, vídeo, transiciones) y detector de
// divergencias entre el campo de escritura, el motor y el marcador del carril. Al detectar
// una, se congela la evidencia (ventana de eventos previos + estado posterior) sin
// sobrescribirla. No guarda letras: solo longitudes, índices, estados y clases de carácter.

export const TRACE_CAPACITY = 300;
export const TRACE_WINDOW = 25;
export const MAX_FROZEN = 5;

export function createTrace() {
  return { seq: 0, entries: [], frozen: [] };
}

/** Añade un evento numerado; el registro nunca supera TRACE_CAPACITY. */
export function traceEvent(trace, entry) {
  const seq = trace.seq + 1;
  const entries = [...trace.entries, { seq, ...entry }].slice(-TRACE_CAPACITY);
  // Recuperar el foco cierra un periodo de teclas perdidas (02.3).
  const lostKeyOpen = entry.type === 'focus' ? false : trace.lostKeyOpen ?? false;
  return { ...trace, seq, entries, lostKeyOpen };
}

/** Clase de un carácter (nunca el carácter): suficiente para el diagnóstico. */
export function charClass(char) {
  if (typeof char !== 'string' || char === '') return null;
  if (char === ' ') return 'espacio';
  if (/^\d$/.test(char)) return 'número';
  if (/^\p{L}$/u.test(char)) {
    if (char !== char.toLowerCase()) return 'mayúscula';
    return /^[a-zñ]$/.test(char) ? 'letra' : 'acentuada';
  }
  return 'puntuación';
}

function expectedMarker(s) {
  return s.engineTypedLen < s.phraseLen ? s.engineTypedLen : -1;
}

/**
 * Divergencias entre lo que debería coincidir, con el estado tras un evento (`now`) y el
 * anterior (`before`). `cause.deletion`: el evento fue un borrado (retroceso legítimo).
 * @returns {{ element: 'campo'|'marcador'|'motor'|'frase', detail: string }[]}
 */
export function findDivergences(now, before, cause = {}) {
  const found = [];
  if (!now.composing && !now.valueMatchesEngine) found.push({ element: 'campo', detail: 'el valor del campo no es el texto del motor' });
  if (now.status === 'active' && now.shown && now.markerIndex !== expectedMarker(now)) {
    found.push({ element: 'marcador', detail: `marcador ${now.markerIndex}, motor ${now.engineTypedLen}` });
  }
  if (!before || before.status !== 'active') return found;
  const samePhrase = now.phraseIndex === before.phraseIndex;
  if (!samePhrase && !now.transition) found.push({ element: 'frase', detail: `${before.phraseIndex} → ${now.phraseIndex} sin motivo` });
  const reset = samePhrase && now.gameId !== before.gameId && !now.transition;
  const backwards = samePhrase && now.gameId === before.gameId && now.engineTypedLen < before.engineTypedLen && !cause.deletion;
  if (reset || backwards) {
    found.push({ element: 'motor', detail: `${before.engineTypedLen} → ${now.engineTypedLen}${reset ? ' (motor reiniciado)' : ''}` });
  }
  return found;
}

/**
 * Comprueba el estado tras un evento; si hay divergencias, congela la evidencia (máx.
 * MAX_FROZEN): la ventana de los últimos eventos, el estado posterior y qué no coincide.
 */
export function recordCheck(trace, now, before, cause = {}) {
  const divergences = findDivergences(now, before, cause);
  if (divergences.length === 0 || trace.frozen.length >= MAX_FROZEN) return trace;
  const evidence = {
    atSeq: trace.seq, cause: cause.cause ?? null, divergences, before, after: now,
    window: trace.entries.slice(-TRACE_WINDOW),
  };
  return { ...trace, frozen: [...trace.frozen, evidence] };
}

/**
 * 02.3: una tecla pulsada durante la práctica con el foco FUERA del campo no llega al motor
 * (el marcador se queda quieto). Se registra y, la primera de cada pérdida de foco, congela
 * la evidencia: los eventos previos (normalmente el blur) y el estado.
 */
export function recordLostKey(trace, info, now) {
  const opened = trace.lostKeyOpen ?? false;
  const next = { ...traceEvent(trace, { type: 'tecla-fuera-del-campo', ...info }), lostKeyOpen: true };
  if (opened || next.frozen.length >= MAX_FROZEN) return next;
  const evidence = {
    atSeq: next.seq, cause: 'tecla-fuera-del-campo', before: null, after: now,
    divergences: [{ element: 'foco', detail: `tecla con el foco en ${info.focus ?? 'otro elemento'}` }],
    window: next.entries.slice(-TRACE_WINDOW),
  };
  return { ...next, frozen: [...next.frozen, evidence] };
}

/** Informe exportable (JSON) del diagnóstico. */
export function exportTrace(trace, context = {}) {
  return { version: 1, context, frozen: trace.frozen, entries: trace.entries };
}
