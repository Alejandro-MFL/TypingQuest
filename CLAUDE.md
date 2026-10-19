# TypingQuest

Videojuego web educativo para entrenar velocidad y precisión de mecanografía.

## Stack

- HTML, CSS y JavaScript vanilla con módulos ES. SIN frameworks ni dependencias npm.
- Persistencia futura: localStorage, accedido solo a través de `js/storage.js`.
- Tests de lógica: `node --test "tests/*.test.js"` (runner nativo de Node 22, sin instalar nada).
- No instalar dependencias, incorporar frameworks ni añadir `package.json` sin aprobación explícita.
- Priorizar soluciones sencillas, mantenibles y adecuadas a la escala del proyecto.

## Ejecutar

- Servidor local: `python -m http.server 8000` → http://localhost:8000
- No abrir `index.html` con `file://`: los módulos ES fallan.

## Estructura

```
index.html
css/styles.css
js/main.js      # Arranque: conecta motor e interfaz. Sin lógica de juego.
js/game.js      # Motor PURO: estados y procesamiento de la entrada.
js/metrics.js   # PURO: calcWpm, calcAccuracy.
js/texts.js     # Textos de práctica.
js/ui.js        # Única capa que toca el DOM.
tests/*.test.js # Tests de game.js y metrics.js.
```

## Arquitectura

- `game.js` y `metrics.js` son puros: sin DOM, sin `Date.now()` ni `performance.now()`
  directos. El instante actual se inyecta como parámetro (`now`) para poder testear.
- Las funciones del motor no mutan el estado recibido: devuelven un estado nuevo.
- Estados del juego: `idle` → `running` → `finished`.
- Toda lógica nueva va en módulos puros y con tests escritos primero.
- Separar la lógica del juego de la interfaz.

## Reglas de juego (decisiones aprobadas)

**Retroceso permitido:** el jugador puede borrar caracteres y corregir errores.
**Errores persistentes en las estadísticas:** una entrada incorrecta sigue contabilizando como error aunque se corrija posteriormente.
**Finalización:** la partida termina únicamente cuando el texto introducido coincide exactamente con el objetivo.
**Cronómetro:** comienza con la primera entrada efectiva del jugador y se detiene al finalizar.
**Reinicio:** comenzar una nueva partida restablece el estado, el cronómetro y los contadores de la sesión.
**Validación:** el sistema debe gestionar correctamente entradas vacías, caracteres especiales y correcciones.

## Métricas

- WPM = (caracteres correctos / 5) / minutos transcurridos.
- Precisión = pulsaciones correctas / pulsaciones totales × 100.
  Las pulsaciones de retroceso no cuentan como pulsaciones totales.
- Con 0 ms o 0 pulsaciones las funciones devuelven 0, nunca `NaN` ni `Infinity`.
- En el navegador el tiempo se mide con `performance.now()`.

## Entrada de teclado

- Capturar con el evento `input` de un `<textarea>` oculto, comparando su valor con
  el texto objetivo. No usar `keydown` para el texto: rompe las teclas muertas (á, é, ñ).

## Convenciones

- Identificadores en inglés; textos de la interfaz y comentarios en español.
- Nunca usar `innerHTML` con texto del juego o del usuario: usar `textContent`.
- Funciones pequeñas (menos de 40 líneas) con una sola responsabilidad.

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