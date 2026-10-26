// Memoria de la Biblioteca (T12). Módulo PURO: sin DOM ni almacenamiento.
//
// Al abrir una práctica desde la Biblioteca se guarda un «billete de vuelta»
// (búsqueda, filtros, desplazamiento y práctica abierta). Al volver a la
// Biblioteca se usa UNA vez para dejarla como estaba y llevar el foco a esa
// práctica. Solo vive en memoria durante la sesión de la página: tras recargar,
// o en la primera visita, no hay nada que restaurar.

const MAX_QUERY_LENGTH = 200;
const EMPTY_FILTERS = Object.freeze({ query: '', level: null, difficulty: '', category: '' });

/** Billete de vuelta, o null si no se puede identificar la práctica abierta. */
export function createLibraryReturn({ filters, scrollY, exerciseId }) {
  if (typeof exerciseId !== 'string' || exerciseId === '') return null;
  const y = Number.isFinite(scrollY) && scrollY > 0 ? Math.round(scrollY) : 0;
  return Object.freeze({ filters: Object.freeze({ ...EMPTY_FILTERS, ...filters }), scrollY: y, exerciseId });
}

/**
 * Siguiente billete tras un evento:
 * - 'open-library-exercise' (con `ticket`): lo crea o sustituye.
 * - 'library-shown': se consume al mostrarse la Biblioteca.
 * - 'open-other-exercise': un ejercicio de otro origen lo descarta.
 * Cualquier otro (repetir, reiniciar, otras secciones) no lo cambia.
 */
export function nextLibraryReturn(current, event) {
  switch (event?.type) {
    case 'open-library-exercise': return event.ticket ?? null;
    case 'library-shown':
    case 'open-other-exercise': return null;
    default: return current;
  }
}

/** Qué restaurar: desplazamiento y, si sigue visible, la práctica que recibe el foco. */
export function restoreTarget(ticket, visibleExerciseIds) {
  if (!ticket) return null;
  const visible = visibleExerciseIds.includes(ticket.exerciseId);
  return { scrollY: ticket.scrollY, exerciseId: visible ? ticket.exerciseId : null };
}

/** Filtros aplicables: los valores que ya no existen vuelven a «Todos». */
export function sanitizeLibraryFilters(filters, { levels, difficulties, categories }) {
  const f = filters ?? EMPTY_FILTERS;
  return {
    query: typeof f.query === 'string' ? f.query.slice(0, MAX_QUERY_LENGTH) : '',
    level: levels.includes(f.level) ? f.level : null,
    difficulty: difficulties.includes(f.difficulty) ? f.difficulty : '',
    category: categories.includes(f.category) ? f.category : '',
  };
}
