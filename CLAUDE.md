# TypingQuest

Videojuego web educativo para entrenar velocidad y precisión de mecanografía.

## Stack

- HTML, CSS y JavaScript vanilla con módulos ES. SIN frameworks ni dependencias npm.
- Persistencia: localStorage, accedido solo a través de `js/storage.js`.
- Tests de lógica: `node --test "tests/*.test.js"` (runner nativo de Node 22, sin instalar nada).
- Tests del Hook de sintaxis: `node --test ".claude/hooks/*.test.cjs"` (no entran en la suite anterior).
- No instalar dependencias, incorporar frameworks ni añadir `package.json` sin aprobación explícita.
- Priorizar soluciones sencillas, mantenibles y adecuadas a la escala del proyecto.

## Ejecutar

- Servidor local: `python tools/dev-server.py` → http://localhost:8000 (biblioteca estándar;
  envía `Cache-Control: no-cache`). NO usar `python -m http.server`: sin esa cabecera el
  navegador reutiliza módulos ES antiguos junto a otros nuevos y la aplicación no arranca
  (p. ej. «progress.js does not provide an export named …»). Si ocurre, Ctrl+F5 una vez.
- No abrir `index.html` con `file://`: los módulos ES fallan.

## Estructura

```
index.html            # Navegación principal y pantallas: Inicio, Academia, Biblioteca,
                      # Práctica libre (preparación), partida, resultados e Historial.
css/styles.css        # Tema oscuro, carril, avisos, animaciones, catálogo, historial, responsive.
data/exercises.json   # Catálogo de ejercicios (contenido; sin código).
data/course.json      # Organización del curso: bloques, lecciones, teclas introducidas y retirados.
js/config.js          # Parámetros configurables (CONFIG congelado).
js/text-prep.js       # PURO: sanitizeText, validateText, prepareText, findUnsupportedChars.
js/chunks.js          # PURO: splitIntoChunks (fragmentos de N palabras).
js/game.js            # Motor PURO: estados, modos, segmentos y procesamiento de la entrada.
js/metrics.js         # PURO: calcWpm, calcAccuracy.
js/history.js         # PURO: resumen del historial, escala y puntos de las gráficas, fechas.
js/catalog.js         # PURO: validación del catálogo y del curso; lecciones y filtros de la Biblioteca.
js/progress.js        # PURO: estados de los ejercicios, posición del recorrido y vista de la Academia.
js/objectives.js      # PURO: objetivos de precisión y WPM (aplicabilidad y fiabilidad).
js/router.js          # PURO: rutas hash (#/inicio, #/academia, #/biblioteca, #/historial, #/practica-libre).
js/keyboard.js        # PURO: teclado español ISO, dedos, resolución carácter → teclas y ayudas.
js/keyboard-ui.js     # Guía visual: teclado (HTML/CSS) y manos (SVG propio), solo presentación.
js/storage.js         # Persistencia del historial y del progreso (almacenamiento inyectado; nunca lanza).
js/ui.js              # Renderizado y DOM de partida, resultados e historial; helpers puros testeables.
js/course-ui.js       # Renderizado de Inicio, Academia, Biblioteca y del ejercicio en partida/resultados.
js/sound.js           # Efectos con Web Audio API (sin archivos ni librerías).
js/main.js            # Coordinación: rutas, eventos, temporizadores, catálogo, progreso y pantallas.
tests/*.test.js       # Tests de text-prep, chunks, game, metrics, ui, sound, storage, history,
                      # catalog (incluye los JSON reales), curriculum (pedagogía del temario real),
                      # migration (posiciones y registros de T8/T9), progress, objectives,
                      # router, course-ui, keyboard, modules (imports y exports del grafo de
                      # js/) y dev-server (cabeceras del servidor local; se omite sin python).
tools/dev-server.py   # Servidor local sin caché heurística (solo desarrollo).
.claude/launch.json   # Servidor de vista previa para Claude Code (usa tools/dev-server.py).
.claude/settings.json # Hook PostToolUse (Edit|Write) → .claude/hooks/check-js.cjs.
.claude/hooks/        # check-js.cjs (sintaxis JS en su modo real) y sus tests .test.cjs.
```

## Arquitectura

- Módulos puros (sin DOM, sin `Date.now()` ni `performance.now()` directos):
  `text-prep.js`, `chunks.js`, `game.js`, `metrics.js`, `history.js`, `catalog.js`,
  `progress.js`, `objectives.js`, `router.js`, `keyboard.js`. El instante actual se inyecta
  como parámetro (`now`).
- `storage.js` recibe el almacenamiento inyectado (`localStorage` o un doble en los
  tests) y la fecha ya calculada; no toca el DOM ni lee el reloj.
- Módulos de interfaz: `ui.js`, `course-ui.js` y `keyboard-ui.js` (pintan el DOM), `main.js`
  (escucha eventos, gestiona rutas, foco, temporizadores y pantallas) y `sound.js` (audio).
- `ui.js` y `course-ui.js` exportan además helpers PUROS (`charStates`, `spaceHintPosition`,
  `isFragmentBlocked`, `resolveNotice`, `statusInfo`, `formatTargetResult`, formatos)
  que se testean con Node.
- Navegación por rutas hash (`router.js`): Inicio, Academia, Biblioteca, Historial y
  Práctica libre. La partida y los resultados NO son rutas: cambiar de ruta (navegación,
  botón Atrás) descarta la partida en pantalla (`leaveGame`) sin guardar nada.
- `main.js` descarga `data/*.json` con `fetch` y los valida con `createCatalog`; si
  fallan, Academia y Biblioteca muestran un error y el resto sigue funcionando.
- Flujo: fuente de texto → `prepareText` → `splitIntoChunks` → `createGame(text, { segmentEnds, mode })`
  → `applyInput` en cada evento `input`. Cualquier fuente futura solo entrega un string.
- Las funciones del motor no mutan el estado recibido: devuelven un estado nuevo.
  Una entrada RECHAZADA devuelve el MISMO objeto (`resultado === state`).
- Estados del juego: `idle` → `running` → `finished`.
- Animaciones, sonido y avisos son solo presentación: nunca modifican el estado del
  motor, las métricas ni el cronómetro.
- Toda lógica nueva va en módulos puros y con tests escritos primero.

## Configuración (`js/config.js`)

- `wordsPerChunk: 7` — palabras por fragmento.
- `maxTextLength: 5000` — límite de caracteres (puntos de código) tras sanear.
- `chunkAnimationMs: 350` — duración de la animación al completar un fragmento.
- `blockOnErrorsDefault: false` — estado inicial de «Bloquear avance con errores» (modo libre).
- `maxHistorySessions: 500` y `historyChartSessions: 20` — sesiones guardadas y graficadas.
- `soundEnabled: true` — estado inicial del sonido (aún sin persistencia).
- `spaceHintDelayMs: 1500` — espera antes de mostrar «Pulsa espacio».
- `statsRefreshMs: 250` y `minWpmElapsedMs: 1000` — refresco y umbral del WPM en vivo.

## Preparación del texto

- `prepareText(raw, maxLength)` sanea y DESPUÉS valida (siempre usar esta función):
  NFC, comillas/rayas/«…» tipográficos → equivalentes escribibles, saltos de línea y
  tabulaciones → espacio, espacios repetidos → uno, recorte de extremos, eliminación
  de invisibles y controles. Conserva tildes, ñ, ü, ¿ y ¡.
- Rechaza: texto vacío, más de `maxTextLength` caracteres (sin recortar) y caracteres
  que el motor no puede procesar: emojis y otros fuera del plano básico, marcas
  combinantes sin componer y marcas aisladas (p. ej. al inicio del texto).

## Fragmentos

- `splitIntoChunks(text, wordsPerChunk)` devuelve rangos `[start, end)` contiguos que
  reconstruyen el texto. El espacio final pertenece al fragmento que se completa; el
  último fragmento no tiene espacio final.
- El motor recibe `segmentEnds = chunks.map(c => c.end)`. Solo se edita dentro del
  segmento activo y los fragmentos cerrados no se pueden modificar. En modo estricto
  no se puede escribir más allá del final del activo mientras tenga errores.
- Al completar el espacio final (en estricto, correctamente), el siguiente segmento se
  activa en la MISMA entrada: la primera letra del siguiente nunca queda bloqueada.

## Modos de entrenamiento

- Casilla «Bloquear avance con errores» en el menú desplegable «Opciones» de la cabecera
  (junto al sonido). La preparación y la partida muestran el modo elegido.
  `createGame(text, { mode })` con `mode: 'free' | 'strict'` (`MODES` en `game.js`).
  Por defecto del motor: `'strict'`; la interfaz arranca en libre
  (`blockOnErrorsDefault: false`; la elección no se guarda entre recargas).
- Se puede cambiar fuera de la partida y en ella antes de la primera pulsación (la
  partida se recrea con `restartGame(state, { mode })`). Desde la primera pulsación
  hasta terminar, la casilla está deshabilitada (`isModeLocked`). Las partidas nuevas usan
  el modo elegido en ese momento; «Repetir» usa el MISMO modo de la partida terminada
  y la casilla se sincroniza con él (se puede cambiar antes de la primera pulsación).
- Terminar un ejercicio (llegar al final) no equivale a superar sus objetivos de
  precisión y WPM (ver «Objetivos»).
- Estricto (casilla marcada): comportamiento anterior; un fragmento solo se completa, y
  la partida solo termina, cuando lo escrito coincide con el objetivo.
- Libre: un fragmento se completa al recorrerlo, aunque tenga errores (también en el
  espacio final), y la partida termina al recorrer todo el texto. Se mantiene el
  retroceso dentro del fragmento activo, los cerrados siguen sin poder modificarse y los
  errores y pulsaciones cuentan igual.
- Fragmentos = divisiones visuales de UNA partida: cronómetro y métricas globales.

## Reglas de juego (decisiones aprobadas)

**Retroceso permitido:** el jugador puede borrar caracteres y corregir errores.
**Errores persistentes en las estadísticas:** una entrada incorrecta sigue contabilizando como error aunque se corrija posteriormente.
**Finalización:** en modo estricto, la partida termina únicamente cuando el texto introducido coincide exactamente con el objetivo; en modo libre, al recorrer todo el texto.
**Cronómetro:** comienza con la primera entrada efectiva del jugador y se detiene al finalizar.
**Reinicio:** comenzar una nueva partida restablece el estado, el cronómetro y los contadores de la sesión.
**Validación:** el sistema debe gestionar correctamente entradas vacías, caracteres especiales y correcciones.

## Métricas

- WPM = (caracteres correctos / 5) / minutos transcurridos.
- Precisión = pulsaciones correctas / pulsaciones totales × 100.
  Las pulsaciones de retroceso no cuentan como pulsaciones totales.
- Con 0 ms o 0 pulsaciones las funciones devuelven 0, nunca `NaN` ni `Infinity`.
- WPM usa los caracteres correctos ACTUALES (neto); la precisión, todas las pulsaciones.
- Las entradas rechazadas (pegado, exceso, fragmento cerrado) no cuentan como pulsaciones.
- Progreso (`getProgress`): `ratio = typedChars / longitud`, es decir, texto recorrido y
  no su corrección; `correctChars` se informa aparte.
- En el navegador el tiempo se mide con `performance.now()`. El WPM en vivo muestra «—»
  hasta `minWpmElapsedMs` para evitar picos al empezar (solo presentación).

## Entrada de teclado

- Capturar con el evento `input` de un `<textarea>` oculto, comparando su valor con
  el texto objetivo. No usar `keydown` para el texto: rompe las teclas muertas (á, é, ñ).
- Escritura SECUENCIAL: el motor solo compara el prefijo común (limitación H2, ver
  test `todo` en `tests/game.test.js`). La UI la controla:
  - `beforeinput` solo admite insertar texto, componer y borrar hacia atrás; bloquea
    pegar, soltar, Intro, deshacer y borrado hacia delante, y cualquier edición con el
    cursor fuera del final.
  - `keydown` bloquea flechas, Inicio/Fin, RePág/AvPág y Ctrl/Cmd+A/Z/Y.
  - El cursor se recoloca al final en `select` y `focus`. El textarea tiene
    `pointer-events: none`; el ratón enfoca a través del carril.
- Composición (teclas muertas, IME): entre `compositionstart` y `compositionend` no se
  llama al motor; se procesa el valor final.
- Limitaciones conocidas: una composición que entrega varios caracteres a la vez (IME
  de chino/japonés, teclados Android, tecla muerta + letra no combinable en algunos
  navegadores) se rechaza como pegado. Comportamiento aceptado por ahora.

## Interfaz de juego

- Carril: vista previa del siguiente fragmento arriba y fragmento activo en una
  posición estable debajo (altura reservada de 3 líneas por posición).
- Colores: correcto en verde, incorrecto en rojo (espacios erróneos con fondo rojo),
  cursor en el siguiente carácter, pendientes y vista previa con contraste ≥ 4,5:1.
- Zona única de avisos (`#lane-notice`, `role="status"`, alto fijo), por prioridad:
  1. «Haz clic aquí para seguir escribiendo» si el campo pierde el foco.
  2. «Corrige los errores en rojo» al intentar avanzar con el fragmento lleno de errores
     (solo en estricto: en libre nunca se bloquea).
  3. «Pulsa espacio» tras `spaceHintDelayMs` en el espacio final de un fragmento correcto
     (en libre, aunque tenga errores, porque el espacio también avanza).
  Se actualiza solo al cambiar el aviso, para no anunciarlo en cada tecla.
- El modo de la partida se muestra sobre las estadísticas y en los resultados.
- Resultados: bajo el resumen y las acciones, «Tu evolución» permanente con las gráficas
  de WPM y precisión de las últimas `historyChartSessions` sesiones guardadas (incluida
  la recién terminada). El SVG es decorativo (`aria-hidden`); su descripción textual
  visible (`describeSeries`: tendencia, mínimo y máximo) da los datos. El listado de
  sesiones solo está en Historial. Sin sesiones, un mensaje.
- En ejercicios del catálogo, Resultados muestra el tipo de práctica, el ejercicio y
  cada objetivo con icono y texto (cumplido, pendiente, no aplicable o no fiable), y
  el título «Objetivo superado» o «Ejercicio terminado, objetivo pendiente». Precisión
  truncada a un decimal y WPM truncadas a entero para no redondear hacia el objetivo.
- Animación al completar un fragmento: copia decorativa dorada (`aria-hidden`) que baja
  la distancia real entre posiciones del carril y se desvanece en `chunkAnimationMs`.
  El siguiente fragmento es escribible al instante. `prefers-reduced-motion`: solo fundido.
- Sonido: un tono breve y suave por fragmento completado (y al terminar), nunca por tecla.
  Botón de altavoz con `aria-pressed`. Sin `AudioContext` hasta interactuar y con el
  sonido activado; si la Web Audio API falta o falla, el juego continúa sin errores.
- Resultados: precisión, tiempo y errores; debajo, el WPM destacado (300 %) en dorado.
  `corrections` se mantiene en el motor pero no se muestra. Un anunciador `role="status"`
  lee el resumen a lectores de pantalla.
- Acciones por origen (`session.origin`, rótulo con `retryLabel`):
  - Práctica libre: «Repetir texto» y «Nuevo texto» (vuelve a la preparación con el texto).
  - Biblioteca: «Repetir ejercicio» y «Volver a la Biblioteca».
  - Academia: «Repetir ejercicio» y «Volver a la Academia». Solo en la lección actual
    (`session.courseStep`), además «Siguiente ejercicio» (oculto en el último) y, en la
    partida, «Saltar ejercicio». La práctica ampliada nunca los ofrece.
  «Repetir» (Resultados, `handleRetry`) y «Reiniciar ejercicio» (partida, con icono de
  flecha circular, `handleRestart`) comparten `restartSession`: la MISMA sesión (texto,
  ejercicio, origen, paso del recorrido y modo; sonido y ayudas no cambian) vuelve a
  empezar con `restartGame` y `enterPlay`: cronómetro, entrada, métricas, fragmentos,
  avisos, animaciones y guía a cero, y el foco vuelve al campo. La partida descartada
  no se guarda; no mueve la posición ni toca historial o marcas; si la nueva termina,
  se guarda como otra sesión. «Repetir» solo actúa desde Resultados y «Reiniciar»
  solo con la partida en curso (`isPlaying`), sin confirmación: los clics repetidos
  no duplican nada.
  «Salir de la partida» vuelve al origen. Todas detienen cronómetro, avisos y efectos y
  descartan la partida.

## Historial

- Clave versionada `typingquest:history:v1` con `{ version: 1, sessions: [...] }` en orden
  de finalización (máximo `maxHistorySessions`, se descartan las más antiguas).
- Registro: `id`, `finishedAt` (ISO), `wpm`, `accuracy` (2 decimales), `elapsedMs`,
  `errors`, `mode` y `exercise`: ID estable del catálogo o `'custom-text'` (práctica
  libre y registros de T7, «Texto personalizado»). NUNCA el texto.
  Lista explícita `RECORD_FIELDS`: al guardar y al recuperar se descarta cualquier otra
  propiedad. Añadir un campo (p. ej. análisis de teclas) exige ampliar la lista, la
  validación y los tests.
- Solo se guardan partidas terminadas (en `finishGame`), una vez por finalización:
  `session.savedRecordId` en `main.js` y rechazo de `id` duplicados en `storage.js`.
  Abandonar no guarda nada.
- `createHistoryStore(storage)` nunca lanza: `load()` devuelve `status`
  (`ok`/`empty`/`corrupt`/`unavailable`) y descarta registros no válidos; `add()` y
  `clear()` devuelven `{ ok, error }` (`quota`, `unavailable`, `write-failed`, `invalid`).
  Sin `localStorage` el juego funciona y el historial informa de ello.
- Pantalla Historial (ruta `#/historial`): sesiones, mejor WPM, precisión media,
  gráficas SVG sin librerías (con descripción textual) y el listado completo de sesiones
  con el nombre del ejercicio. El borrado pide confirmación en la propia pantalla (sin
  `confirm()`) y no borra el progreso de la Academia.
- «Recorrido de la Academia» (al final del Historial, solo con el curso cargado):
  «Reiniciar Academia» pide confirmación en la propia pantalla (grupo con «Cancelar»,
  que recibe el foco, y «Reiniciar Academia»). Al confirmar, `restartCourse`
  (`progress.js`) devuelve la posición a la primera lección y se guarda; historial,
  estados, mejores marcas y preferencias se conservan. Resultado en `#course-reset-status`.
- Gráficas compartidas por resultados e historial (`renderTrendCharts` en `ui.js`,
  geometría en `history.js`).

## Catálogo y curso (`data/*.json`, `js/catalog.js`)

- `exercises.json` (`schemaVersion: 2`): `contentVersion` y `exercises`, cada uno con
  `id` estable (minúsculas, dígitos y guiones), `version`, `kind` (`base` o `extended`),
  `title`, `description`, `level` (1-5), `difficulty` (`basic`/`intermediate`/`advanced`),
  `category` (lista en `CATEGORIES`), `targetAccuracy` (entero 50-100), `targetWpm`
  (entero o `null`) y `text`. Campos desconocidos = error. Una sola definición por
  ejercicio, compartida por Academia y Biblioteca.
- `course.json` (`schemaVersion: 4`): niveles en orden (un nivel = un bloque del temario)
  con `title`, `summary` y `lessons: [{ exercise, extended, introduces }]`. `exercise` es
  la práctica base (breve, forma el recorrido); `extended`, la práctica ampliada opcional
  (más larga; no forma parte del recorrido ni lo hace avanzar). Hoy hay 67 lecciones,
  TODAS con las dos (134 ejercicios); el esquema admite una lección sin ampliada. No hay
  tercer tipo de práctica. `introduces`: entradas NUEVAS de la lección (lista, puede
  estar vacía en repasos y consolidaciones).
- Temario (T10): una tecla nueva por lección, combinada con las conocidas; primero una
  mano, luego la otra y después las dos; consolidaciones intercaladas; la velocidad no
  se exige en el primer contacto.
  - Bloque A (17): postura F/J y espacio; mano derecha J, K, L, Ñ y consolidación;
    izquierda F, D, S, A y consolidación; ambas manos (combinaciones, alternancia), G, H,
    patrones variados y palabras.
  - Bloque B (14): U I O P Y (derecha), consolidación; R E W Q T (izquierda),
    consolidación; palabras con ambas manos y fila superior.
  - Bloque C (16): N M , . - (derecha) y V B C X Z (izquierda), cada mano con su
    consolidación; fila inferior; tres filas por mano y con las dos.
  - Bloque D (12): espacios, Mayús izquierda y derecha, tildes, diéresis, puntuación,
    números (1-5 y 6-0), ¿? ¡!, símbolos y AltGr (@ €), cada uno explicado.
  - Bloque E (8): palabras frecuentes, alternancia, frases, textos, precisión y ritmo.
- Entradas (`requiredInputs(char)` en `keyboard.js`): `KeyboardEvent.code` de las teclas
  físicas, del modificador (`ShiftLeft`, `ShiftRight`, `AltRight`) y habilidades de
  tecla muerta (`acute`, `diaeresis`). P. ej. «á» → Quote + acute + KeyA; «Ü» exige
  también Mayús. Se valida por teclas físicas, no por caracteres visibles.
- `course.json` → `retired: [{ exercise, title, continueAt? }]`: ejercicios eliminados.
  Ya no están en el catálogo ni en el recorrido, pero sus registros de historial y de
  progreso se conservan; el Historial los muestra como «<título> · ejercicio retirado»
  (`exerciseTitle`). `continueAt` (práctica base del curso) es adonde se traslada una
  posición guardada en ellos: `resolveRetiredPosition` al cargar el catálogo,
  determinista e idempotente. Retirados hoy: «Alternar F y J» (→ `a-der-j`), y de T9
  «Mayúsculas y puntuación» (→ `d-mayus-izq`), «Interrogación y exclamación»
  (→ `d-interrogacion`) y «Números» (→ `d-numeros-izq`), con sus ampliadas.
- Migración (T10): los ejercicios equivalentes conservan su ID (posición y logros siguen
  valiendo sin convertir nada: `l1-postura-fj`, `l2-*`, `l3-*`, `l4-tildes`, `l5-*`);
  los demás se retiran con continuación en el MISMO bloque, nunca al inicio. Las
  lecciones nuevas empiezan sin realizar: nunca se marcan superadas. Formatos de
  historial y progreso sin cambios (`tests/migration.test.js`).
- La validación exige que la ampliada sea más larga que su base y de la misma
  categoría y nivel. ID de la ampliada: `<id de la base>-ampliada`.
  La organización está separada del catálogo.
- Versionado: `schemaVersion` cambia con la forma de los datos; `contentVersion` con
  cualquier cambio de contenido; la `version` de un ejercicio sube cuando cambian su
  texto o sus condiciones de superación. Los logros ya guardados se conservan (no se
  reevalúan con las condiciones nuevas).
- `validateCatalog` comprueba IDs (formato y duplicados), referencias del curso, tipos
  (base/ampliada), repetidos, que cada ejercicio esté en su nivel, campos y objetivos
  (sin `targetWpm` en textos de menos de `MIN_WPM_TEXT_LENGTH` = 40 caracteres), que
  el texto sea válido Y ya esté en la forma de `prepareText`, y las teclas: `introduces`
  con entradas válidas y no repetidas en el curso, ningún texto (base ni ampliada) con
  entradas aún no introducidas, y cada entrada nueva usada al menos
  `MIN_NEW_INPUT_USES` (2) veces en su práctica base. `tests/catalog.test.js` valida los
  JSON reales, que los objetivos sigan `LEVEL_GOALS` (las bases de los bloques A-C sin
  objetivo de WPM: primer contacto), que la ampliada sea al menos 1,5 veces más larga,
  que tenga la longitud de su nivel (N1 100-140, N2 120-180, N3 160-240, N4 220-320,
  N5 300-450 caracteres) y que no repita mecánicamente un mismo bloque.
  `tests/curriculum.test.js` comprueba el orden aprobado de las teclas, una por lección
  en A-C, la cobertura de las 27 letras, las consolidaciones por mano y con ambas, y que
  la descripción nombre el dedo del modelo de T9.
- Categorías (`CATEGORIES`): teclas guía, fila central, superior, inferior, tres filas,
  palabras y espacios, mayúsculas, tildes, puntuación, signos, números, símbolos,
  frases, textos, precisión y ritmo.

## Objetivos (`js/objectives.js`)

- `LEVEL_GOALS` (provisionales): N1 85 % / 8 WPM, N2 90 % / 12, N3 90 % / 18,
  N4 92 % / 22, N5 95 % / 30. WPM siempre con caracteres correctos.
- `evaluateObjectives(stats, exercise)`: superado = precisión ≥ `targetAccuracy` Y, si
  `targetWpm` no es null, WPM ≥ `targetWpm` con una medición fiable (≥
  `MIN_RELIABLE_WPM_MS` = 3000 ms; con menos tiempo las WPM no se dan por cumplidas).
- Terminado ≠ superado ≠ saltado. No alcanzar el objetivo nunca bloquea el avance.

## Academia y progreso (`js/progress.js`)

- Separado del historial: clave `typingquest:progress:v1` con
  `{ version: 1, currentExerciseId, exercises: [{ id, status, bestAccuracy, bestWpm }] }`.
  Campos permitidos explícitos; entradas no válidas o repetidas se descartan.
- Estado individual (solo mejora): `not-started` (gris, ○ «No realizado») < `skipped`
  (blanco, ↷ «Saltado») < `completed` (naranja, ◐ «Terminado»: sin objetivo) < `passed`
  (verde, ✓ «Objetivo superado»: `evaluateObjectives().passed`). Siempre con icono y
  texto. Mejores marcas redondeadas a 2 decimales y conservadas. Biblioteca y Academia
  (base y ampliada) actualizan el estado al terminar.
- Posición del recorrido (`currentExerciseId`): SOLO cambia con `advanceCourse` y
  `skipCurrent`, que avanzan EXACTAMENTE un elemento desde la posición actual (nunca
  desde el ejercicio jugado: era la causa de los saltos de la primera versión de T8).
  Terminar o salir no avanza; la Biblioteca y la práctica ampliada nunca la mueven.
- La Academia muestra SOLO la lección actual (`academyView`) en UNA tarjeta: nivel,
  posición «Ejercicio N de M», título y descripción, el estado y los objetivos de cada
  práctica, y dos botones sin requisitos previos: «Práctica base» (también para
  repetirla) y «Práctica ampliada» (opcional; nunca ofrece Siguiente ni Saltar). Si la
  base ya está terminada aparece «Siguiente ejercicio»: avanza uno y abre la siguiente
  base.
- La Biblioteca muestra UNA tarjeta por lección (`libraryLessons`, 67), agrupadas por
  bloque con un encabezado por bloque (`groupLessonsByLevel`, `blockLabel`): título,
  descripción, bloque y categoría de la lección, y sus dos prácticas, cada una con su
  propio estado, dificultad, objetivos y botón «Empezar» (abre esa práctica; nunca
  mueve el recorrido ni ofrece Saltar/Siguiente). Búsqueda y filtros (`filterLessons`)
  muestran la lección si CUALQUIERA de sus prácticas coincide. Los objetos son los del
  catálogo: no se duplican ejercicios. Todo se hace sin bloqueos.
- Saltar (solo dentro de la lección actual) registra `skipped` si no había un logro
  superior, avanza uno y abre el nuevo actual (en el último, vuelve a la Academia).

## Guía de teclado y dedos (`js/keyboard.js`, `js/keyboard-ui.js`)

- Modelo PURO del teclado español de España (QWERTY ISO) por `KeyboardEvent.code`:
  `KEYBOARD_ROWS` (5 filas de 15 unidades: numérica con º y ¡, superior con ` ^ y +,
  central con Ñ, ´ ¨ y Ç, inferior con < > y - _, y la de control con espacio y AltGr).
  Cada tecla: `base`, `shift`, `altGr`, `dead` (marca combinante) y dedos.
- Dedos (`FINGERS`): reposo A S D F (meñique a índice izquierdos) y J K L Ñ (índice a
  meñique derechos), índices sobre F y J (también G/H y sus columnas); 6 y 7 con el
  índice derecho; números, símbolos y teclas de la derecha de la Ñ con el meñique
  derecho; espacio con los pulgares; AltGr con el pulgar derecho.
- `resolveCharacter(char)` distingue carácter, tecla física, modificadores, dedo y mano:
  - Mayús siempre de la mano CONTRARIA a la tecla (A → Mayús derecha; Ñ → izquierda).
  - Vocales con tilde, diéresis, grave o circunflejo: DOS pasos (tecla muerta y vocal).
    `code` identifica la posición física, pero no basta para acentos ni modificadores.
  - Lo que no se puede resolver con fiabilidad devuelve `known: false` y una indicación
    genérica («Busca «x» en tu teclado»), nunca una posición inventada. Todos los
    caracteres del catálogo actual se resuelven (lo comprueba un test).
- `guideTarget(state, { blocked })` lee el estado del motor sin mutarlo: el siguiente
  carácter esperado, Retroceso si el fragmento está bloqueado (estricto) o null al
  terminar. `describeResolution` da el texto («Pulsa Ñ con el meñique derecho.»).
- `keyboard-ui.js`: teclado HTML/CSS y manos SVG ORIGINALES (palma y cinco dedos por
  mano; la derecha es el reflejo de la izquierda), sin imágenes ni `innerHTML`. Objetivo
  en dorado; tecla muerta con borde discontinuo; modificadores en azul discontinuo;
  error (última tecla física errónea, `KeyboardEvent.code`) en rojo con borde. Zonas de
  dedo con un borde inferior de color sutil y marca de reposo en la fila central.
- Integración (`main.js`): la guía se pinta en cada `render()`; es SOLO presentación:
  no cambia el texto, no pulsa nada, no toca métricas ni cronómetro, y se limpia al
  terminar, salir o reiniciar. Va debajo del carril (no lo desplaza) y su texto tiene
  alto reservado. El texto NO es región viva: el campo de escritura lo usa como
  `aria-describedby`; teclado y manos son `aria-hidden`.
- Ayudas (`HELP_MODES`: `full`, `keyboard`, `none`) en Opciones, cambiables durante la
  partida sin reiniciarla. Preferencia por contexto (`helpContext`): ejercicios
  (Academia y Biblioteca) por defecto `full`; práctica libre por defecto `none`. No se
  guarda entre recargas. Recordatorio de reposo solo en los bloques A y B, niveles 1-2 (`showsRestReminder`).
- Móvil: el teclado se ajusta al ancho (sin scroll horizontal) y oculta los rótulos
  secundarios; las manos se reducen. `prefers-reduced-motion`: sin transiciones.
- Pendiente (no T9): estadísticas por dedo.

## Convenciones

- Identificadores en inglés; textos de la interfaz y comentarios en español.
- Nunca usar `innerHTML` con texto del juego o del usuario: usar `textContent`.
- Funciones pequeñas (menos de 40 líneas) con una sola responsabilidad.
- Accesibilidad: no usar `aria-label` en elementos sin rol (`<p>`, `<div>`); usar
  `role="group"` o texto `visually-hidden`. Regiones vivas siempre presentes en el DOM.

## Flujo de trabajo (ECC)

### Planificación

- Utilizar `/everything-claude-code:plan` para funcionalidades nuevas, modificaciones arquitectónicas o tareas complejas.
- No es obligatorio ejecutar la Skill para modificaciones triviales.
- Presentar las decisiones técnicas relevantes antes de implementar cambios significativos.

### Desarrollo

- Utilizar `/everything-claude-code:tdd` para implementar y verificar lógica del juego mediante pruebas.
- Priorizar cambios pequeños y verificables.
- No modificar archivos fuera del proyecto.
- No instalar dependencias ni ejecutar scripts externos desconocidos sin aprobación.
- Informar cuando una funcionalidad requiera modificar la arquitectura existente.

### Testing

- Ejecutar las pruebas relacionadas con los módulos modificados.
- Comprobar casos normales, errores y casos límite.
- No afirmar que una prueba ha pasado si no se ha ejecutado.
- Documentar los fallos y sus posibles causas.

### Revisión de código

- Utilizar el agente `code-reviewer` al finalizar bloques importantes de funcionalidades.
- No ejecutar revisiones completas después de cada pequeño cambio.
- Priorizar la identificación de errores reales, riesgos de seguridad y problemas de mantenimiento.

### Control de versiones

- No realizar commits sin aprobación del usuario.
- Pregunta cada vez que consideres que se debe hacer un commit
- No realizar push sin aprobación del usuario.
- Mostrar los cambios relevantes antes de cada commit.
- Realizar commits pequeños, coherentes y con mensajes descriptivos.
- No descartar cambios existentes sin aprobación.

## Uso eficiente de Claude Code

El usuario utiliza Claude Pro, por lo que debe priorizarse el uso eficiente del contexto y de las herramientas.

- No activar Skills innecesarias.
- No utilizar múltiples subagentes para tareas sencillas.
- Evitar análisis repetidos cuando ya existe información suficiente.
- No explorar todo el repositorio si basta con consultar unos pocos archivos.
- Reutilizar resultados de pruebas y decisiones arquitectónicas existentes.
- Evitar generar documentación adicional que no aporte valor.
- Utilizar Hooks únicamente cuando exista una necesidad concreta de automatización.
- Solicitar autorización antes de introducir integraciones MCP nuevas.