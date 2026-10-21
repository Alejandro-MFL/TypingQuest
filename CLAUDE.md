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

- Servidor local: `python -m http.server 8000` → http://localhost:8000
- No abrir `index.html` con `file://`: los módulos ES fallan.

## Estructura

```
index.html            # Cuatro pantallas: preparación, partida, resultados e historial.
css/styles.css        # Tema oscuro, carril, avisos, animaciones, historial, responsive.
js/config.js          # Parámetros configurables (CONFIG congelado).
js/text-prep.js       # PURO: sanitizeText, validateText, prepareText, findUnsupportedChars.
js/chunks.js          # PURO: splitIntoChunks (fragmentos de N palabras).
js/game.js            # Motor PURO: estados, modos, segmentos y procesamiento de la entrada.
js/metrics.js         # PURO: calcWpm, calcAccuracy.
js/history.js         # PURO: resumen del historial, escala y puntos de las gráficas, fechas.
js/storage.js         # Persistencia del historial (almacenamiento inyectado; nunca lanza).
js/ui.js              # Renderizado y DOM; incluye helpers puros testeables.
js/sound.js           # Efectos con Web Audio API (sin archivos ni librerías).
js/main.js            # Coordinación: eventos, temporizadores y flujo entre pantallas.
tests/*.test.js       # Tests de text-prep, chunks, game, metrics, ui, sound, storage e history.
.claude/launch.json   # Servidor de vista previa para Claude Code.
.claude/settings.json # Hook PostToolUse (Edit|Write) → .claude/hooks/check-js.cjs.
.claude/hooks/        # check-js.cjs (sintaxis JS en su modo real) y sus tests .test.cjs.
```

## Arquitectura

- Módulos puros (sin DOM, sin `Date.now()` ni `performance.now()` directos):
  `text-prep.js`, `chunks.js`, `game.js`, `metrics.js`, `history.js`. El instante actual
  se inyecta como parámetro (`now`) para poder testear.
- `storage.js` recibe el almacenamiento inyectado (`localStorage` o un doble en los
  tests) y la fecha ya calculada; no toca el DOM ni lee el reloj.
- Módulos de interfaz: `ui.js` (pinta y manipula el DOM), `main.js` (escucha eventos,
  gestiona foco, temporizadores y pantallas) y `sound.js` (audio).
- `ui.js` exporta además helpers PUROS (`charStates`, `spaceHintPosition`,
  `isFragmentBlocked`, `resolveNotice`, formatos) que se testean con Node.
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
  hasta terminar, la casilla está deshabilitada (`isModeLocked`). Las partidas nuevas y
  «Reintentar» usan el modo elegido en ese momento.
- Completar un ejercicio (llegar al final) no equivale a superar un objetivo: todavía
  no hay umbrales por porcentaje de errores; los criterios pedagógicos llegan en T8.
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
  la recién terminada) y sus datos en una tabla desplegable; sin sesiones, un mensaje.
- Animación al completar un fragmento: copia decorativa dorada (`aria-hidden`) que baja
  la distancia real entre posiciones del carril y se desvanece en `chunkAnimationMs`.
  El siguiente fragmento es escribible al instante. `prefers-reduced-motion`: solo fundido.
- Sonido: un tono breve y suave por fragmento completado (y al terminar), nunca por tecla.
  Botón de altavoz con `aria-pressed`. Sin `AudioContext` hasta interactuar y con el
  sonido activado; si la Web Audio API falta o falla, el juego continúa sin errores.
- Resultados: precisión, tiempo y errores; debajo, el WPM destacado (300 %) en dorado.
  `corrections` se mantiene en el motor pero no se muestra. Un anunciador `role="status"`
  lee el resumen a lectores de pantalla.
- Navegación: «Salir de la partida» (durante la partida) y «Nuevo texto» vuelven a la
  preparación conservando el texto; «Reintentar» repite el mismo texto. Todas detienen
  cronómetro, avisos y efectos y descartan el progreso.

## Historial

- Clave versionada `typingquest:history:v1` con `{ version: 1, sessions: [...] }` en orden
  de finalización (máximo `maxHistorySessions`, se descartan las más antiguas).
- Registro: `id`, `finishedAt` (ISO), `wpm`, `accuracy` (2 decimales), `elapsedMs`,
  `errors`, `mode` y `exercise` (`'custom-text'` = «Texto personalizado»). NUNCA el texto.
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
- Pantalla de historial: sesiones, mejor WPM, precisión media, gráficas SVG sin
  librerías (con descripción textual) y el listado completo de sesiones. El borrado pide
  confirmación en la propia pantalla (sin `confirm()`). Acceso PROVISIONAL desde
  Opciones → «Historial (provisional)», oculto durante la partida, hasta la página
  Inicio de T8; «Volver» regresa a preparación o resultados.
- Gráficas compartidas por resultados e historial (`renderTrendCharts` en `ui.js`,
  geometría en `history.js`).

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