// Diagnóstico de DESARROLLO de Música (02.3): solo con ?diagnostico=1. Conecta el registro
// puro (music-trace.js) con el DOM: eventos del campo de escritura, comprobación de que el
// campo, el motor y el marcador pintado coinciden, y botones para copiar o descargar el
// informe. Nunca envía nada a ningún sitio y no registra el texto de las letras.
import { createTrace, traceEvent, recordCheck, recordLostKey, exportTrace, charClass } from './music-trace.js';

const INPUT_EVENTS = ['keydown', 'beforeinput', 'input', 'keyup', 'compositionstart', 'compositionend', 'focus', 'blur'];

// Sin diagnóstico: los mismos métodos, sin hacer nada (el comportamiento no cambia).
const DISABLED = Object.freeze({
  enabled: false, record() {}, check() {}, attach() {}, summary: () => null,
});

function keyLabel(key) {
  if (typeof key !== 'string') return null;
  return key.length === 1 ? charClass(key) : key;
}

/**
 * @param {{ enabled: boolean, els: object, doc: Document, win: Window,
 *   getState: () => { practice: object, playerState: string, videoMs: number, composing: boolean } }} options
 */
export function createMusicDebugger({ enabled, els, doc, win, getState }) {
  if (!enabled) return DISABLED;
  let trace = createTrace();
  let previous = null;
  let lastDeletion = false;

  const activeName = () => {
    const el = doc.activeElement;
    return el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` : null;
  };

  function record(entry) {
    trace = traceEvent(trace, { t: Math.round(win.performance.now()), ...entry });
  }

  function inputEntry(event) {
    const { input } = els;
    return {
      type: event.type, key: keyLabel(event.key), code: event.code ?? null, inputType: event.inputType ?? null,
      data: charClass(event.data), composing: Boolean(event.isComposing), focus: activeName(),
      valueLen: input.value.length, caret: [input.selectionStart, input.selectionEnd],
    };
  }

  // Lo que se ve y lo que sabe el motor justo ahora (sin textos).
  function snapshot() {
    const { practice, playerState, videoMs, composing } = getState();
    const spans = [...els.chunkActive.querySelectorAll('.char')];
    const typed = practice.game?.typed ?? '';
    return {
      composing, valueMatchesEngine: els.input.value === typed, valueLen: els.input.value.length,
      engineTypedLen: typed.length, markerIndex: spans.findIndex((s) => s.classList.contains('char-current')),
      paintedLen: spans.length, phraseIndex: practice.index, phraseLen: practice.game?.text.length ?? 0,
      gameId: practice.attempt, transition: previous && practice.attempt !== previous.gameId ? practice.attemptReason : null,
      shown: practice.shown, status: practice.status, waiting: practice.waiting, player: playerState,
      videoMs: Math.round(videoMs),
    };
  }

  /** Tras procesar un evento: registra el estado y congela la evidencia si algo no coincide. */
  function check(cause) {
    const now = snapshot();
    if (now.transition) record({ type: 'transición', reason: now.transition, from: previous?.phraseIndex, to: now.phraseIndex });
    record({ type: `estado:${cause}`, ...now });
    trace = recordCheck(trace, now, previous, { cause, deletion: cause === 'input' && lastDeletion });
    previous = now;
    renderSummary();
  }

  function attach() {
    for (const type of INPUT_EVENTS) {
      els.input.addEventListener(type, (event) => {
        if (type === 'beforeinput') lastDeletion = String(event.inputType).startsWith('delete');
        record(inputEntry(event));
      }, { capture: true });
    }
    // 02.3: teclas que llegan FUERA del campo durante la práctica (no llegan al motor).
    doc.addEventListener('keydown', (event) => {
      const { practice } = getState();
      if (event.target === els.input || practice.status !== 'active' || els.setup.open) return;
      trace = recordLostKey(trace, { t: Math.round(win.performance.now()), key: keyLabel(event.key), code: event.code, focus: activeName() }, snapshot());
      renderSummary();
    }, { capture: true });
    for (const type of ['blur', 'focus']) win.addEventListener(type, () => record({ type: `ventana-${type}`, focus: activeName() }));
    els.stage.addEventListener('mousedown', (event) => record({ type: 'clic', target: event.target.tagName.toLowerCase(), focus: activeName() }), { capture: true });
    els.traceCopy.addEventListener('click', copyReport);
    els.traceDownload.addEventListener('click', downloadReport);
    els.traceActions.hidden = false;
    // Solo en modo diagnóstico: el informe también desde la consola del navegador.
    win.typingquestMusicTrace = () => JSON.parse(report());
  }

  function report() {
    return JSON.stringify(exportTrace(trace, { userAgent: win.navigator.userAgent, url: win.location.pathname }), null, 2);
  }

  async function copyReport() {
    try {
      await win.navigator.clipboard.writeText(report());
      els.traceStatus.textContent = 'Diagnóstico copiado al portapapeles.';
    } catch {
      els.traceStatus.textContent = 'No se pudo copiar: usa «Descargar diagnóstico».';
    }
  }

  function downloadReport() {
    const url = win.URL.createObjectURL(new win.Blob([report()], { type: 'application/json' }));
    const link = doc.createElement('a');
    link.href = url;
    link.download = 'typingquest-musica-diagnostico.json';
    link.click();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
  }

  function renderSummary() {
    const count = trace.frozen.length;
    const text = count === 0 ? 'Sin divergencias detectadas.' : `Divergencias guardadas: ${count} (${trace.frozen.map((f) => f.divergences.map((d) => d.element).join('+')).join(', ')}).`;
    if (els.traceStatus.dataset.summary !== text) {
      els.traceStatus.dataset.summary = text;
      els.traceStatus.textContent = text;
    }
  }

  return { enabled: true, record, check, attach, summary: () => ({ frozen: trace.frozen.length, events: trace.seq }) };
}
