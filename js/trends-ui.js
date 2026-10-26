// «Mi evolución» (T12) en el Historial. Exporta helpers PUROS (textos, testeados
// con Node) y el pintado en el DOM con textContent. Solo presenta el informe de
// typing-trends.js: no recomienda ejercicios todavía.
import { MIN_TREND_OPPORTUNITIES, MIN_TREND_SESSIONS } from './typing-trends.js';
import { charName, createMarkedKeyboard } from './analysis-ui.js';

export const EVOLUTION_DEFINITIONS = Object.freeze([
  'Tasa de fallo: porcentaje de veces que no escribiste correctamente una letra al primer intento.',
  `Solo se valora una letra con al menos ${MIN_TREND_OPPORTUNITIES} oportunidades repartidas en `
    + `${MIN_TREND_SESSIONS} sesiones; con menos, los porcentajes engañan.`,
  'Dificultad recurrente: falla al menos el 10 % de las veces y bastante más que tu media.',
  'Mejora o empeora: se comparan tus primeras prácticas con las más recientes, con un número de '
    + 'oportunidades parecido; si la diferencia es pequeña, se indica «sin cambios claros».',
  'Ten en cuenta que las prácticas recientes pueden ser más difíciles que las primeras.',
]);

export function formatPercent(rate) {
  return `${String(Math.round(rate * 1000) / 10).replace('.', ',')} %`;
}

export function failCount(fails, opportunities) {
  return `${fails} de ${opportunities} veces (${formatPercent(fails / opportunities)})`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function statusText(report) {
  if (report.status === 'empty') {
    return 'Todavía no hay sesiones con diagnóstico. Termina algunas prácticas y aquí verás cómo '
      + 'evolucionan tus dificultades.';
  }
  if (report.status === 'insufficient') {
    return `Aún no hay datos suficientes: una letra necesita al menos ${MIN_TREND_OPPORTUNITIES} oportunidades `
      + `repartidas en ${MIN_TREND_SESSIONS} sesiones. Llevas ${plural(report.sessionsAnalyzed, 'sesión', 'sesiones')} con diagnóstico.`;
  }
  return '';
}

export function summaryText(report) {
  const base = `${plural(report.sessionsAnalyzed, 'sesión', 'sesiones')} con diagnóstico: `
    + `${plural(report.charsAnalyzed, 'carácter', 'caracteres')} y ${plural(report.opportunities, 'oportunidad', 'oportunidades')}.`;
  const old = report.sessionsWithoutDiagnosis;
  if (old === 0) return base;
  return `${base} No ${old === 1 ? 'cuenta 1 sesión' : `cuentan ${old} sesiones`} sin diagnóstico válido `
    + '(las anteriores a esta función o con datos dañados).';
}

export function recurrentText(c) {
  const text = `${charName(c.char)}: fallas ${failCount(c.firstTryErrors, c.opportunities)} en ${plural(c.sessions, 'sesión', 'sesiones')}.`;
  const status = c.evolution?.status;
  return status && status !== 'insufficient' ? `${text} Evolución: ${trendLabel(status)}.` : text;
}

const EVOLUTION_ENDINGS = {
  improving: 'Parece que estás mejorando.',
  worsening: 'Parece que te está costando más que antes.',
  stable: 'Sin cambios claros.',
};

/** Primeras prácticas frente a las recientes; `reason: 'high'` para las que siguen altas. */
export function evolutionText(c, reason = null) {
  if (reason === 'high') {
    return `${charName(c.char)}: sigue alta, ${failCount(c.firstTryErrors, c.opportunities)}, sin cambios claros.`;
  }
  const { early, recent, status } = c.evolution;
  return `${charName(c.char)}: en tus primeras prácticas fallaste ${failCount(early.firstTryErrors, early.opportunities)}; `
    + `en las más recientes, ${failCount(recent.firstTryErrors, recent.opportunities)}. ${EVOLUTION_ENDINGS[status]}`;
}

export function confusionText(c) {
  return `Esperabas ${charName(c.expected)} y escribiste ${charName(c.typed)}: ${c.count} veces `
    + `(en ${plural(c.sessions, 'sesión', 'sesiones')}).`;
}

const TREND_LABELS = {
  improving: '↓ Mejora', worsening: '↑ Empeora', stable: '→ Sin cambios claros', insufficient: '· Datos insuficientes',
};

export function trendLabel(status) {
  return TREND_LABELS[status];
}

// --- DOM --------------------------------------------------------------------------------

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Barras «antes / ahora» (decorativas: el texto de la lista ya da los datos).
function createRateBars(evolution) {
  const bars = element('div', 'rate-bars');
  bars.setAttribute('aria-hidden', 'true');
  for (const [label, period] of [['Antes', evolution.early], ['Ahora', evolution.recent]]) {
    const row = element('div', 'rate-bar-row');
    const track = element('div', 'rate-bar-track');
    const fill = element('div', 'rate-bar-fill');
    fill.style.width = `${Math.min(100, period.rate * 100)}%`;
    track.append(fill);
    row.append(element('span', 'rate-bar-label', label), track, element('span', 'rate-bar-value', formatPercent(period.rate)));
    bars.append(row);
  }
  return bars;
}

function createGroup(title, items, emptyText) {
  const group = element('section', 'evolution-group');
  group.append(element('h4', 'evolution-group-title', title));
  if (items.length === 0) group.append(element('p', 'evolution-empty', emptyText));
  else group.append(...items);
  return group;
}

function listOf(tag, chars, render) {
  if (chars.length === 0) return [];
  const list = element(tag, 'evolution-list');
  list.append(...chars.map(render));
  return [list];
}

function evolutionItem(c, reason = null) {
  const item = element('li', 'evolution-item', evolutionText(c, reason));
  if (c.evolution.early && c.evolution.recent) item.append(createRateBars(c.evolution));
  return item;
}

// Detalle plegado por defecto (sin tablas enormes): solo letras con muestra suficiente.
function createDetail(chars) {
  const sufficient = chars.filter((c) => c.sufficient);
  const details = element('details', 'evolution-detail');
  details.append(element('summary', null, `Detalle por carácter (${sufficient.length} con datos suficientes)`));
  const table = element('table', 'evolution-table');
  const head = element('tr');
  for (const h of ['Carácter', 'Oportunidades', 'Fallos', 'Tasa', 'Evolución']) {
    const th = element('th', null, h);
    th.scope = 'col';
    head.append(th);
  }
  const body = element('tbody');
  for (const c of sufficient) {
    const row = element('tr');
    for (const text of [charName(c.char), String(c.opportunities), String(c.firstTryErrors), formatPercent(c.rate), trendLabel(c.evolution.status)]) {
      row.append(element('td', null, text));
    }
    body.append(row);
  }
  table.append(element('thead'), body);
  table.tHead.append(head);
  details.append(table);
  return details;
}

function createDefinitions() {
  const list = element('ul', 'evolution-definitions');
  list.append(...EVOLUTION_DEFINITIONS.map((text) => element('li', null, text)));
  return list;
}

function createReportGroups(report) {
  const recurrent = listOf('ol', report.recurrent, (c) => element('li', 'evolution-item', recurrentText(c)));
  if (report.recurrent.length > 0) recurrent.push(createMarkedKeyboard(report.recurrent.map((c) => c.char)));
  const groups = [
    createGroup('Dificultades recurrentes', recurrent, 'Ninguna letra destaca por encima de tu media con datos suficientes.'),
    createGroup('En mejora', listOf('ul', report.improving, (c) => evolutionItem(c)),
      'Todavía no hay mejoras claras, o faltan datos para comparar.'),
    createGroup('Necesitan atención', listOf('ul', report.attention, (c) => evolutionItem(c, c.reason)),
      'Ninguna letra empeora ni se mantiene alta.'),
  ];
  if (report.confusions.length > 0) {
    groups.push(createGroup('Confusiones frecuentes',
      listOf('ul', report.confusions, (c) => element('li', 'evolution-item', confusionText(c))), ''));
  }
  return groups;
}

/** Pinta el informe de analyzeTrends dentro de `container`. */
export function renderEvolution(container, report) {
  const nodes = [];
  const status = statusText(report);
  if (status) nodes.push(element('p', 'evolution-status', status));
  if (report.sessionsAnalyzed > 0) nodes.push(element('p', 'evolution-summary', summaryText(report)));
  if (report.status === 'ok') nodes.push(...createReportGroups(report), createDetail(report.chars));
  if (report.status !== 'empty') nodes.push(createDefinitions());
  container.replaceChildren(...nodes);
}
