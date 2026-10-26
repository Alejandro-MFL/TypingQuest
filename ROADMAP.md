# TypingQuest · Roadmap

Estado del proyecto y siguientes pasos. Las decisiones técnicas detalladas están en
`CLAUDE.md`.

## Fases completadas

| Fase | Contenido |
|---|---|
| T0–T6 | Fundamentos: motor puro con tests, preparación y validación de textos, fragmentos, interfaz jugable con estadísticas en vivo, métricas (WPM y precisión), animaciones y sonido, accesibilidad y Hook de comprobación de sintaxis JS. |
| T7 | Modos de escritura (libre y estricto), historial persistente de sesiones y gráficas de evolución. |
| T8 | Academia (recorrido con progreso y objetivos) y Biblioteca (prácticas base y ampliada, búsqueda y filtros). |
| T9 | Teclado visual español (ISO) y manos SVG con guía de dedos y teclas muertas. |
| T10 | Currículo progresivo de 67 lecciones y 134 ejercicios en cinco bloques (A–E), validación de teclas por lección, migración del progreso y del historial anteriores, «Repetir ejercicio», «Reiniciar ejercicio» durante la partida, «Reiniciar Academia» y servidor local sin caché heurística. |
| T11 | Diagnóstico de escritura por carácter y tecla: oportunidades, fallos al primer intento, correcciones y confusiones; tecla y dedo recomendados; «Análisis de escritura» en Resultados y en el Historial; guardado opcional y versionado sin el texto practicado. |

## Propuestas para las siguientes fases

Son propuestas pendientes de aprobación, no funcionalidades comprometidas.

- **T12 · Continuidad y evolución del diagnóstico (próxima prioridad):**
  - Conservar la búsqueda, los filtros y la posición de desplazamiento de la Biblioteca
    al abrir un ejercicio y volver.
  - Analizar los errores acumulados de varias sesiones.
  - Mostrar la evolución de las dificultades por carácter.
  - Las recomendaciones automáticas de ejercicios quedan para una fase posterior.
- **T13 · Interfaz, accesibilidad y experiencia de usuario:** mejoras generales.
- **T14 · Revisión integral y publicación:** auditoría completa y preparación para publicar.

## Deuda técnica y limitaciones conocidas

- **TODO H2 (`tests/game.test.js`):** el motor solo compara el prefijo común; la escritura
  secuencial la impone la interfaz (cursor al final, sin selecciones ni borrado hacia delante).
- **Composición de varios caracteres:** IME (chino, japonés), algunos teclados Android y
  tecla muerta + letra no combinable se rechazan como pegado.
- **Teclado físico:** falta verificar con un teclado español real las teclas muertas
  (´ ¨), AltGr y la guía; las pruebas automatizadas simulan la entrada.
- **Compatibilidad entre navegadores:** probado en Chromium; Firefox y Safari sin verificar.
- **Preferencias sin persistencia:** sonido, modo de escritura y ayudas visuales se
  reinician al recargar.
- **Objetivos pedagógicos:** `LEVEL_GOALS` (precisión y WPM) son provisionales y deben
  revisarse con uso real.
- **Estadísticas por dedo:** no se pueden medir (el navegador no sabe qué dedo se usa);
  T11 solo muestra el dedo recomendado.
- **Diagnóstico (T11):** por sesión, sin agregado entre sesiones; la muestra mínima
  (5 oportunidades) es provisional; en modo libre, un fallo en la última posición
  termina la partida y queda sin corregir.
- **Servidor de desarrollo:** usar `python tools/dev-server.py`; con `python -m http.server`
  el navegador puede mezclar módulos de versiones distintas.
