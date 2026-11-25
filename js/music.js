// Coordinación de la pantalla Música (experimento 02.1): eventos, reproductor de YouTube,
// búsqueda en LRCLIB, importación de .lrc, desfase, comprobación de la sincronización y
// escritura MIENTRAS suena la canción. La lógica está en módulos puros (music-practice,
// music-sync, lrc, youtube-url, lrclib); aquí solo se conectan con el DOM y el reloj.
// Nada de esto se guarda: ni la letra, ni el vídeo, ni el desfase, ni las métricas.
import { parseYouTubeUrl } from './youtube-url.js';
import { loadYouTubeApi, createYouTubePlayer } from './youtube-player.js';
import { createLrclibClient, lrclibErrorMessage } from './lrclib.js';
import { parseLrc } from './lrc.js';
import {
  buildPhrases, phraseIndexAt, phraseTimes, clampOffset, effectiveOffset, estimatePlayerTime, nextTickDelay,
} from './music-sync.js';
import {
  createPractice, startPractice, goToPhrase, repeatPhrase, tickPractice, typePhrase, continuePlayback,
  skipPhrase, practiceTotals, restartPractice,
} from './music-practice.js';
import * as musicUi from './music-ui.js';
import { syncInput } from './ui.js';
import { attachSequentialInput } from './typing-input.js';
import { keySoundFor } from './key-sound.js';
import { createMusicDebugger } from './music-debug.js';

// Identificación ante LRCLIB (cabecera Lrclib-Client): nombre, versión y proyecto.
const LRCLIB_CLIENT = 'TypingQuest Musica (experimento 02) (https://github.com/Alejandro-MFL/TypingQuest)';
// La comprobación de la sincronización empieza un poco antes de la primera frase.
const CHECK_LEAD_MS = 2000;

export function createMusicController({ sound, getMode, doc = document, win = window }) {
  const els = musicUi.getMusicElements(doc);
  const lrclib = createLrclibClient({ fetchImpl: (...args) => win.fetch(...args), clientName: LRCLIB_CLIENT, now: () => Date.now() });
  const diagnosticsOn = new URLSearchParams(win.location.search).get('diagnostico') === '1';
  const media = { player: null, ready: false, state: 'other', videoId: null, reportedMs: NaN, reportedAtMs: 0 };
  let lyrics = null;
  let results = [];
  let userOffsetMs = 0;
  let practice = createPractice([]);
  let checking = false;
  let timer = null;
  let typingControl = null;
  // Diagnóstico de desarrollo (02.3): sin ?diagnostico=1 no hace nada.
  const debug = createMusicDebugger({
    enabled: diagnosticsOn, els, doc, win,
    getState: () => ({ practice, playerState: media.state, videoMs: videoTimeMs(), composing: typingControl?.isComposing() ?? false }),
  });

  const offsetMs = () => effectiveOffset(userOffsetMs, lyrics?.lrcOffsetMs ?? 0);
  const isReady = () => media.ready && lyrics !== null;

  // Tiempo del vídeo: la última lectura más el tiempo local desde que cambió (YouTube
  // actualiza getCurrentTime() a saltos).
  function videoTimeMs() {
    const now = performance.now();
    const reading = media.player?.currentTimeMs() ?? NaN;
    if (reading !== media.reportedMs) Object.assign(media, { reportedMs: reading, reportedAtMs: now });
    return estimatePlayerTime({ reportedMs: media.reportedMs, reportedAtMs: media.reportedAtMs, now, playing: media.state === 'playing' });
  }

  const ctx = () => ({ offsetMs: offsetMs(), now: performance.now(), mode: getMode(), timeMs: videoTimeMs() });

  function render() {
    els.stage.hidden = media.videoId === null && lyrics === null;
    els.checkButton.disabled = !isReady();
    els.checkButton.textContent = checking ? 'Detener comprobación' : 'Comprobar sincronización';
    musicUi.renderSetup(els, { hasVideo: media.ready, hasLyrics: lyrics !== null, song: lyrics?.label });
    musicUi.renderPractice(els, practice, {
      totals: practiceTotals(practice), playing: media.state === 'playing', ready: isReady(), focusNotice: focusNotice(),
    });
  }

  // --- Reproductor y reloj -----------------------------------------------------------

  function execute(command) {
    if (!command || !media.player) return;
    debug.record({ type: 'orden', command: command.type, fromMs: command.fromMs ?? null });
    if (command.type === 'play') media.player.seekTo(command.fromMs);
    if (command.type === 'pause') media.player.pause();
    else media.player.play();
  }

  // Aplica un resultado de music-practice: estado, orden al reproductor y campo de texto.
  function run({ state, command }) {
    const previous = practice;
    practice = state;
    execute(command);
    if (practice.game !== previous.game) {
      typingControl.reset();
      els.input.value = practice.game?.typed ?? '';
    }
    render();
    scheduleTick();
  }

  function needsTimer() {
    if (!media.player) return false;
    const active = practice.status === 'active' && (media.state === 'playing' || practice.resumeAt !== null || practice.seek);
    return checking || active;
  }

  // Milisegundos hasta el próximo momento importante (aparición o límite de la frase).
  function msUntilNext(timeMs) {
    if (practice.status !== 'active' || !Number.isFinite(timeMs)) return null;
    const { showAtMs, deadlineMs } = phraseTimes(practice.phrases, practice.index, ctx());
    const target = practice.shown ? deadlineMs : showAtMs;
    return target === null ? null : target - timeMs;
  }

  // Un solo temporizador encadenado (setTimeout): nunca se acumulan.
  function scheduleTick() {
    win.clearTimeout(timer);
    timer = null;
    if (needsTimer()) timer = win.setTimeout(tick, nextTickDelay(msUntilNext(videoTimeMs())));
  }

  function tickChecking(timeMs) {
    if (media.state === 'ended') stopChecking();
    const index = lyrics ? phraseIndexAt(lyrics.phrases, timeMs, { offsetMs: offsetMs() }) : -1;
    musicUi.renderLiveLine(els, checking ? (index >= 0 ? lyrics.phrases[index].text : '…') : '');
  }

  function tick() {
    timer = null;
    const timeMs = videoTimeMs();
    if (checking) tickChecking(timeMs);
    else if (practice.status === 'active') {
      run(tickPractice(practice, { ...ctx(), timeMs, playerState: media.state }));
      debug.check('lectura');
      renderDiagnostics(timeMs);
      return;
    }
    scheduleTick();
  }

  function renderDiagnostics(timeMs) {
    if (!diagnosticsOn) return;
    const times = practice.status === 'active' ? phraseTimes(practice.phrases, practice.index, ctx()) : null;
    musicUi.renderDiagnostics(els, {
      videoMs: Math.round(timeMs), leidoMs: media.reportedMs, reproductor: media.state, estado: practice.status,
      frase: practice.index, apareceMs: times?.showAtMs, empiezaMs: times?.startMs, limiteMs: times?.deadlineMs,
      mostrada: practice.shown, esperando: practice.waiting, bloqueado: practice.blocked, registros: practice.diagnostics.slice(-5),
    });
  }

  function handlePlayerState(name) {
    media.state = name;
    debug.record({ type: 'reproductor', state: name });
    render();
    tick();
  }

  function handlePlayerError(kind) {
    musicUi.renderStatus(els.videoStatus, musicUi.videoErrorMessage(kind), 'error');
    stopChecking();
    render();
    scheduleTick();
  }

  function handlePlayerReady() {
    media.ready = true;
    musicUi.renderStatus(els.videoStatus, 'Vídeo listo.', 'success');
    updateDurationNote();
    render();
  }

  // Cambiar de vídeo o de letra reinicia la práctica (sin resultados) de forma segura.
  function resetPractice() {
    stopChecking();
    media.player?.pause();
    practice = createPractice(lyrics?.phrases ?? [], { mode: getMode() });
    typingControl.reset();
    els.input.value = '';
  }

  function destroyPlayer() {
    resetPractice();
    media.player?.destroy();
    Object.assign(media, { player: null, ready: false, state: 'other', videoId: null, reportedMs: NaN });
    scheduleTick();
  }

  async function handleVideoSubmit(event) {
    event.preventDefault();
    const parsed = parseYouTubeUrl(els.url.value);
    if (!parsed.ok) {
      musicUi.renderStatus(els.videoStatus, musicUi.videoErrorMessage(parsed.error), 'error');
      return;
    }
    musicUi.renderStatus(els.videoStatus, 'Cargando el reproductor de YouTube…');
    let YT;
    try {
      YT = await loadYouTubeApi({ doc, win });
    } catch {
      musicUi.renderStatus(els.videoStatus, musicUi.videoErrorMessage('load'), 'error');
      return;
    }
    destroyPlayer();
    media.videoId = parsed.videoId;
    render();
    media.player = createYouTubePlayer({
      doc, YT, container: els.video, videoId: parsed.videoId, origin: win.location.origin,
      onReady: handlePlayerReady, onStateChange: handlePlayerState, onError: handlePlayerError,
    });
  }

  // --- Letra -----------------------------------------------------------------------

  function updateDurationNote() {
    musicUi.renderNote(els, lyrics ? musicUi.durationMismatchNote(media.player?.durationMs(), lyrics.durationS) : null);
  }

  function useLyrics(parsed, { label, durationS }) {
    if (!parsed.ok) {
      musicUi.renderStatus(els.lyricsStatus, musicUi.lyricsErrorMessage(parsed.error === 'too-large' ? 'too-large-text' : parsed.error), 'error');
      return;
    }
    const phrases = buildPhrases(parsed.lines);
    if (phrases.length === 0) {
      musicUi.renderStatus(els.lyricsStatus, musicUi.lyricsErrorMessage('no-text'), 'error');
      return;
    }
    lyrics = { label, phrases, lrcOffsetMs: parsed.meta.offsetMs, durationS: durationS ?? (parsed.meta.lengthMs ?? NaN) / 1000 };
    resetPractice();
    const skipped = parsed.duplicates + parsed.malformed;
    const extra = skipped > 0 ? ` Se han omitido ${skipped} líneas repetidas o no válidas.` : '';
    musicUi.renderStatus(els.lyricsStatus, `Letra lista: ${phrases.length} frases.${extra}`, 'success');
    updateDurationNote();
    render();
    scheduleTick();
  }

  function searchStatus(result) {
    if (!result.ok) return [lrclibErrorMessage(result.error, result.retryAfterS), 'error'];
    if (result.results.length === 0) return ['No hay resultados. Revisa el título y el artista o importa un archivo .lrc.', 'error'];
    const usable = result.results.filter((r) => r.synced).length;
    if (usable === 0) return ['Solo hay letras sin sincronizar: hace falta una con marcas de tiempo.', 'error'];
    return [`${result.results.length} resultados (${usable} con letra sincronizada). Elige la versión que corresponda al vídeo.`, 'success'];
  }

  async function handleSearchSubmit(event) {
    event.preventDefault();
    els.searchButton.disabled = true;
    musicUi.renderStatus(els.searchStatus, 'Buscando en LRCLIB…');
    const result = await lrclib.search({ track: els.track.value, artist: els.artist.value });
    els.searchButton.disabled = false;
    results = result.ok ? result.results : [];
    musicUi.renderResults(els, results);
    musicUi.renderStatus(els.searchStatus, ...searchStatus(result));
  }

  function handleResultClick(event) {
    const button = event.target.closest('[data-result-index]');
    const chosen = button ? results[Number(button.dataset.resultIndex)] : null;
    if (!chosen?.synced) return;
    useLyrics(parseLrc(chosen.synced), { label: `${chosen.track} · ${chosen.artist}`, durationS: chosen.durationS });
  }

  async function handleFileChange() {
    const [file] = els.file.files ?? [];
    els.file.value = '';
    const check = musicUi.validateLrcFile(file);
    if (!check.ok) {
      musicUi.renderStatus(els.lyricsStatus, musicUi.lyricsErrorMessage(check.error), 'error');
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      musicUi.renderStatus(els.lyricsStatus, musicUi.lyricsErrorMessage('read'), 'error');
      return;
    }
    const parsed = parseLrc(text);
    const title = parsed.ok ? [parsed.meta.title, parsed.meta.artist].filter(Boolean).join(' · ') : '';
    useLyrics(parsed, { label: title || file.name, durationS: null });
  }

  // --- Desfase y comprobación (dentro del panel) ---------------------------------------

  // Solo cambia los tiempos: el reproductor no se toca ni se reconstruye.
  function setOffset(ms) {
    userOffsetMs = clampOffset(ms);
    musicUi.renderOffset(els, userOffsetMs);
    scheduleTick();
  }

  function stopChecking() {
    if (!checking) return;
    checking = false;
    media.player?.pause();
    musicUi.renderLiveLine(els, '');
  }

  // La práctica no se pierde: mientras se comprueba, no da órdenes al reproductor.
  function handleCheck() {
    if (checking) stopChecking();
    else if (isReady()) {
      checking = true;
      const [first] = lyrics.phrases;
      media.player.seekTo(Math.max(0, first.startMs + offsetMs() - CHECK_LEAD_MS));
      media.player.play();
    }
    render();
    scheduleTick();
  }

  // Abrir el panel durante la práctica pausa el vídeo (los datos se conservan).
  function handleSetupToggle() {
    if (els.setup.open && practice.status === 'active' && !checking && media.state === 'playing') media.player?.pause();
  }

  // --- Práctica --------------------------------------------------------------------

  function handleStart() {
    if (!isReady()) return;
    stopChecking();
    els.setup.open = false;
    run(startPractice(createPractice(lyrics.phrases, { mode: getMode() }), ctx()));
    els.input.focus();
  }

  function handleTyping() {
    const previous = practice;
    const { state, accepted, command } = typePhrase(practice, els.input.value, performance.now(), ctx());
    if (!accepted) {
      syncInput(els.input, practice.game?.typed ?? '');
      debug.record({ type: 'rechazada', valueLen: els.input.value.length });
      debug.check('input');
      return;
    }
    run({ state, command });
    syncInput(els.input, practice.game?.typed ?? '');
    debug.check('input');
    // Los resultados solo se sustituyen al terminar una frase. Exp. 02.4: mientras no
    // termine, sonido de tecla según el motor (misma frase y mismo intento).
    if (state.results === previous.results) {
      if (state.attempt === previous.attempt) sound.playKey(keySoundFor(previous.game, state.game));
      return;
    }
    if (state.status === 'finished') sound.playFinish('exercise');
    else sound.playChunkComplete();
  }

  function control(action) {
    stopChecking();
    run(action(practice, ctx()));
    if (!els.input.disabled) els.input.focus();
  }

  function handlePlayToggle() {
    if (practice.status === 'active' && practice.waiting) control(skipPhrase);
    else if (media.state === 'playing') media.player?.pause();
    else media.player?.play();
  }

  function bindSetup() {
    els.setup.open = musicUi.setupShouldOpen({ hasVideo: false, hasLyrics: false });
    els.setup.addEventListener('toggle', handleSetupToggle);
    els.videoForm.addEventListener('submit', handleVideoSubmit);
    els.searchForm.addEventListener('submit', handleSearchSubmit);
    els.results.addEventListener('click', handleResultClick);
    els.file.addEventListener('change', handleFileChange);
    els.offset.addEventListener('input', () => setOffset(musicUi.offsetFromSlider(els.offset.value)));
    for (const button of els.offsetButtons) {
      button.addEventListener('click', () => setOffset(userOffsetMs + Number(button.dataset.offsetStep)));
    }
    els.offsetReset.addEventListener('click', () => setOffset(0));
    els.checkButton.addEventListener('click', handleCheck);
  }

  // --- Foco del campo (02.3, como en Academia) ---------------------------------------
  // Causa demostrada del marcador «quieto»: un clic en una zona no interactiva dejaba el
  // foco en <body> y las teclas ya no llegaban al campo, sin ningún aviso.

  const practiceActive = () => practice.status === 'active' && !els.setup.open;

  function focusNotice() {
    return musicUi.focusLostNotice({
      practiceActive: practiceActive(), inputFocused: doc.activeElement === els.input, windowFocused: doc.hasFocus(),
    });
  }

  // Un clic en una zona no interactiva de la práctica conserva (o devuelve) el foco.
  function handleStageMouseDown(event) {
    if (!musicUi.clickKeepsTypingFocus({ practiceActive: practiceActive(), inputEnabled: !els.input.disabled, target: event.target })) return;
    event.preventDefault();
    if (doc.activeElement !== els.input) els.input.focus();
  }

  // Al volver a la ventana, si el foco quedó fuera de todo control, vuelve al campo.
  function handleWindowFocus() {
    if (practiceActive() && doc.activeElement === doc.body && !els.input.disabled) els.input.focus();
    render();
  }

  // El foco entra en el iframe del vídeo (la ventana pierde el foco con el documento aún
  // activo): durante la práctica se devuelve al campo, para que las teclas sigan llegando.
  function handleWindowBlur() {
    win.setTimeout(() => {
      const reclaim = musicUi.shouldReclaimTypingFocus({
        screenVisible: !els.screen.hidden, practiceActive: practice.status === 'active',
        focusInPlayer: els.video.contains(doc.activeElement), setupOpen: els.setup.open,
      });
      if (reclaim && !els.input.disabled) els.input.focus();
    }, 0);
  }

  function bind() {
    bindSetup();
    win.addEventListener('blur', handleWindowBlur);
    win.addEventListener('focus', handleWindowFocus);
    els.stage.addEventListener('mousedown', handleStageMouseDown);
    els.input.addEventListener('focus', render);
    els.input.addEventListener('blur', render);
    els.startButton.addEventListener('click', handleStart);
    els.continueButton.addEventListener('click', () => control(continuePlayback));
    els.playButton.addEventListener('click', handlePlayToggle);
    els.repeatButton.addEventListener('click', () => control(repeatPhrase));
    els.prevButton.addEventListener('click', () => control((state, c) => goToPhrase(state, state.index - 1, c)));
    els.nextButton.addEventListener('click', () => control((state, c) => goToPhrase(state, state.index + 1, c)));
    els.restartButton.addEventListener('click', () => control(restartPractice));
    debug.attach();
    typingControl = attachSequentialInput(els.input, { onValue: handleTyping, onKeyDown: () => sound.unlock() });
    els.lane.addEventListener('click', () => { if (!els.input.disabled) els.input.focus(); });
    musicUi.renderOffset(els, userOffsetMs);
    render();
  }

  // Al salir de Música: el vídeo se pausa siempre (también si aún estaba cargando).
  function leave() {
    stopChecking();
    media.player?.pause();
    win.clearTimeout(timer);
    timer = null;
  }

  return { bind, enter: render, leave };
}
