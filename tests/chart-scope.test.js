// Experimentos 01.1 y 01.2: las escalas adaptativas (precisión y PPM) son SOLO de las
// gráficas de Resultados («Tu evolución», siempre visible). El Historial y Mi evolución conservan la
// escala de la rama estable. Las funciones de pintado tocan el DOM, así que se
// comprueba el código fuente de cada llamada.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const ui = read('../js/ui.js');

// Cuerpo de una función exportada de ui.js (hasta la siguiente declaración de nivel superior).
function functionBody(source, name) {
  const start = source.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `no se encuentra ${name}`);
  const next = source.indexOf('\n/**', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('alcance de las escalas adaptativas (precisión y PPM)', () => {
  it('Resultados pide la escala ajustada', () => {
    assert.match(functionBody(ui, 'renderResultsTrends'), /renderTrendCharts\([^)]*adaptiveScale: true/);
  });

  it('Historial usa la escala original (sin ajuste)', () => {
    const body = functionBody(ui, 'renderHistory');
    assert.match(body, /renderTrendCharts\(h, sessions\.slice\(-chartSessions\)\)/);
    assert.doesNotMatch(body, /adaptiveScale/);
  });

  it('solo hay una llamada con escala ajustada en toda la interfaz', () => {
    assert.equal(ui.match(/adaptiveScale: true/g).length, 1);
  });

  it('Mi evolución no usa ninguna escala experimental', () => {
    for (const file of ['../js/trends-ui.js', '../js/typing-trends.js']) {
      assert.doesNotMatch(read(file), /accuracyScale|accuracyAxis|speedScale|speedAxis|adaptiveScale/, file);
    }
  });
});

// Exp. 01.2: «Tu evolución» (gráficas y comparación) fuera de «Ver análisis detallado».
describe('Resultados: gráficas visibles sin abrir el desplegable', () => {
  const html = read('../index.html');
  const details = html.slice(html.indexOf('id="results-details"'), html.indexOf('</details>', html.indexOf('id="results-details"')));
  const results = html.slice(html.indexOf('id="results-screen"'), html.indexOf('id="ergonomics-screen"'));

  it('las dos gráficas y la comparación están en Resultados, fuera del desplegable', () => {
    for (const id of ['results-trends', 'results-chart-wpm', 'results-chart-accuracy', 'result-compare']) {
      assert.ok(results.includes(`id="${id}"`), id);
      assert.ok(!details.includes(`id="${id}"`), `${id} no debe estar dentro del desplegable`);
    }
  });

  it('sin gráficas duplicadas', () => {
    assert.equal(html.match(/id="results-chart-wpm"/g).length, 1);
    assert.equal(html.match(/id="results-chart-accuracy"/g).length, 1);
    assert.equal(details.match(/chart-svg/g), null);
  });

  it('el desplegable conserva los objetivos y el análisis por carácter', () => {
    assert.ok(details.includes('id="results-objectives"'));
    assert.ok(details.includes('id="results-diagnosis"'));
  });

  it('«Tu evolución» va después de los botones de Resultados', () => {
    assert.ok(results.indexOf('id="retry-button"') < results.indexOf('id="results-trends"'));
    assert.ok(results.indexOf('id="results-trends"') < results.indexOf('id="results-details"'));
  });
});
