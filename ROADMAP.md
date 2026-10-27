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
| T12 | Memoria de la Biblioteca (búsqueda, filtros, desplazamiento y práctica abierta, también con «Atrás») y «Mi evolución» en el Historial: tasa de fallo acumulada y ponderada, dificultades recurrentes, mejora o empeoramiento por carácter y confusiones frecuentes. |
| T13 | Entrenamiento personalizado: «Practicar mis dificultades» en «Mi evolución» recomienda hasta tres prácticas existentes del catálogo para las dificultades detectadas por T11 y T12, con reglas locales y explicables (sin IA); se abren como una práctica de la Biblioteca, sin mover el recorrido de la Academia. |
| T14 | Experiencia pedagógica: introducción inicial, instrucciones por lección (tecla, dedo, movimiento desde la posición de reposo y objetivo), movimiento del dedo en la guía («J → U → J»), consejo «Siguiente paso» en Resultados y recorrido por bloques en la Academia. |
| T15 | Rediseño visual: sistema de diseño con variables y temas claro, oscuro y automático (sin destello al cargar); componentes unificados; pantalla de escritura más compacta y legible, sin avisos de foco falsos; simplificación de Academia (ampliada desbloqueada al superar la base, «Tu recorrido» compacto), Biblioteca (una columna, lecciones numeradas A1…E8, detalles a demanda) y Resultados (análisis detallado plegado, «Práctica ampliada»); cabecera con logo y favicon y navegación centrada. Entregado como T15.1 y T15.2–T15.4. |
| T16 | Ergonomía y hábitos saludables: sección «Ergonomía» en la navegación (postura, brazos y muñecas, pantalla y espacio de trabajo, descansos y fatiga) con consejos breves sin promesas médicas, lista de comprobación opcional que no se guarda, fuentes institucionales verificadas (INSST y CCOHS) y acceso discreto desde la introducción de la Academia. |

## Próximas fases (propuestas)

Pendientes de aprobación, en este orden. No están implementadas.

1. **T17 · Calidad, accesibilidad y compatibilidad:** teclado físico español (teclas
   muertas, AltGr, Mayús), Firefox, Safari y móviles reales; lector de pantalla; estudiar
   la solución de H2.
   Depende de: T15 (diseño definitivo).
2. **T18 · README profesional y publicación:** README, licencia, aviso de privacidad y
   publicación como web estática.
   Depende de: T16 y T17.

## Mejoras futuras (sin fase asignada)

- **Gamificación sutil (propuestas de T15.2, sin implementar):** resumen al completar un
  bloque («Bloque A completado» con sus marcas), racha de días de práctica sin
  penalizaciones, y mejor marca personal destacada en Resultados cuando se supera.
- **Guardar preferencias** (sonido, modo y ayudas) entre sesiones; el tema ya se guarda (T15).
- **Ergonomía:** revisión del contenido por una persona experta y, si aporta valor, un
  esquema SVG sencillo de la postura.
- **Copia de seguridad:** exportar e importar historial y progreso (JSON).
- **Calibrar con datos reales** los umbrales de T11-T13 y `LEVEL_GOALS`.
- **Errores de transición entre letras consecutivas:** necesitaría guardar datos nuevos
  (pares de letras) que T11 no guarda.
- **Medir el efecto de cada práctica recomendada** (T13), no solo la evolución general.
- **Ejercicios específicos de Mayús** para las dificultades con mayúsculas.

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
- **Diagnóstico (T11):** la muestra mínima (5 oportunidades) es provisional; en modo
  libre, un fallo en la última posición termina la partida y queda sin corregir.
- **Mi evolución (T12):** umbrales provisionales (20 oportunidades en 3 sesiones, 10 %,
  1,5 × la media); no tiene en cuenta que los ejercicios recientes pueden ser más
  difíciles; lo que T11 no guardó (más de 64 caracteres u 8 confusiones por sesión) no
  se suma.
- **Recomendaciones (T13):** solo eligen entre los 134 ejercicios existentes; para
  mayúsculas o caracteres que casi no aparecen se practica la misma tecla física (p. ej.
  «Ñ» con «ñ»), sin trabajar específicamente la Mayús. No se mide aún si una práctica
  recomendada concreta ayudó (solo se ve en la evolución general).
- **Memoria de la Biblioteca (T12):** solo dura mientras la página está abierta (no
  sobrevive a recargar).
- **Instrucciones (T14):** generadas por reglas a partir del currículo; conviene que una
  persona revise su redacción. El movimiento del dedo es una recomendación: no se puede
  comprobar qué dedo se usa.
- **Diseño (T15):** probado en Chromium (anchos 375, 768 y 1280 px y texto al 150 %); falta
  revisarlo en Firefox y Safari. Usa `:has()` para detalles de presentación (sin él se
  pierden el subtítulo oculto durante la partida, el estilo secundario de «Repetir» y el
  ancho mayor de la Biblioteca) y `mask` para el texto del logo en el tema claro. En
  pantallas estrechas el subtítulo de Inicio ocupa dos líneas y la cabecera cambia de alto
  al salir de Inicio.
- **Servidor de desarrollo:** usar `python tools/dev-server.py`; con `python -m http.server`
  el navegador puede mezclar módulos de versiones distintas.
