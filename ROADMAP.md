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
| T17 | Calidad, navegación y seguridad. Navegación: botones de Resultados según el origen, «Siguiente ejercicio» también tras la ampliada de la lección actual de la Academia, «Siguiente ejercicio de la Biblioteca» (respeta búsqueda y filtros), «Siguiente recomendación» (lista recalculada) y protección frente a dobles clics, sin tocar el progreso académico ni el historial. Calidad y seguridad (revisión de alcance limitado, referencia OWASP): navegación y accesibilidad básica revisadas en Chromium, validación de datos locales, eliminación de controles bidi, CSP estricta y pruebas automatizadas de seguridad con entradas peligrosas. Entregado como T17 y T17.2. |
| T18 | README profesional con capturas reales (datos de prueba), licencia MIT para el código con el nombre y los logotipos excluidos (`TRADEMARKS.md`), guía de publicación con auditoría de privacidad del historial, artefacto mínimo comprobado (`tools/build-site.mjs`, con tests) y workflow de GitHub Pages manual y sin publicar por defecto. Comprobado en local bajo `/TypingQuest/` (solo Chromium). Lanzamiento público pendiente. |

## Lanzamiento público (pendiente)

La implementación de T18 está completada; la publicación aún no se ha hecho. Pasos y
comprobaciones en `docs/publicacion.md`:

1. Hacer público el repositorio (decidido; revisar antes la auditoría de privacidad: el
   correo de los commits y 15 líneas antiguas `Co-Authored-By` serán visibles).
2. Activar GitHub Pages con origen «GitHub Actions» y ejecutar el workflow, primero sin
   publicar y después con «publicar».
3. Verificar en la web real: HTTPS («Enforce HTTPS»), CSP sin violaciones, 404 de los
   archivos internos y navegación completa. GitHub Pages no permite cabeceras:
   `frame-ancestors` y `nosniff` quedan sin aplicar (riesgo bajo, documentado).

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

- **Pendiente tras T17 (no resuelto):** H2 (abajo), pruebas manuales en Firefox, Safari y
  Brave, pruebas con lectores de pantalla reales, comprobación con un teclado español ISO
  real y seguridad en producción (HTTPS y CSP en la web real, cabeceras que GitHub Pages no
  permite y 404 de los archivos internos tras publicar).
- **TODO H2 (`tests/game.test.js`):** el motor solo compara el prefijo común; la escritura
  secuencial la impone la interfaz (cursor al final, sin selecciones ni borrado hacia delante).
  Revisado en T17: desde la interfaz no se puede reproducir (`beforeinput` rechaza editar con
  el cursor fuera del final y el cursor vuelve al final en `select` y `focus`); solo un
  valor manipulado directamente lo provocaría, contando una pulsación de más. Corregirlo
  exige que `applyInput` calcule la diferencia real entre el valor anterior y el nuevo
  (posición de la edición) y redefinir qué es una pulsación en ese caso; cambia el núcleo
  de las métricas, así que se deja para una fase propia con tests de regresión.
- **Seguridad (riesgos que permanecen, T17.2):** los datos viven sin cifrar en el
  localStorage del navegador (cualquiera con acceso al equipo o una extensión puede leerlos o
  cambiarlos; la app solo valida su forma); `parseHistory` no recorta al cargar más de
  `maxHistorySessions` registros (lo limita la cuota del navegador); el correo del autor
  aparece en los commits públicos de GitHub; el servidor de desarrollo sirve toda la carpeta
  (también `.git/`), pero solo en 127.0.0.1.
- **Composición de varios caracteres:** IME (chino, japonés), algunos teclados Android y
  tecla muerta + letra no combinable se rechazan como pegado.
- **Teclado físico:** falta verificar con un teclado español real las teclas muertas
  (´ ¨), AltGr y la guía; las pruebas automatizadas simulan la entrada.
- **Compatibilidad entre navegadores:** probado en Chromium (también en T17); Firefox,
  Safari y Brave sin verificar (no disponibles en el entorno de desarrollo).
- **Lectores de pantalla:** sin probar con lectores reales (NVDA, VoiceOver); la revisión de
  T17 fue de nombres, foco, encabezados y regiones vivas.
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
