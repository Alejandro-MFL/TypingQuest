// Ergonomía (T16). Módulo PURO: textos de la lista de comprobación opcional.
// La lista no se guarda: solo ayuda a repasar la postura antes de escribir.

/** Resumen visible de la lista: cuántos puntos se han revisado (acotado a 0…total). */
export function checklistSummary(checked, total) {
  const count = Math.min(total, Math.max(0, checked));
  if (count === 0) return 'Marca lo que ya tengas en cuenta. Es opcional y no se guarda.';
  const base = `${count} de ${total} puntos revisados.`;
  return count === total ? `${base} Listo para escribir con comodidad.` : base;
}
