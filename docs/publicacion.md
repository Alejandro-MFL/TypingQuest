# Publicación de TypingQuest

Guía para publicar TypingQuest como web estática en **GitHub Pages**. Cada publicación
requiere tu autorización expresa.

**Web publicada:** <https://alejandro-mfl.github.io/TypingQuest/>

## Estado

| Estado | Qué |
| --- | --- |
| Implementado | `tools/build-site.mjs` construye el artefacto y lo comprueba: solo `index.html`, `css/`, `js/`, `data/` y `assets/`, sin archivos ocultos, de tipos no permitidos ni referencias absolutas o rotas. `.github/workflows/pages.yml` ejecuta las pruebas, construye el artefacto y solo publica si se lanza a mano con la casilla «publicar» marcada desde la rama predeterminada. |
| Comprobado en local | El artefacto, servido en `http://localhost:8010/TypingQuest/` (la misma subruta que en Pages), carga todos los módulos, los JSON, el logo y el favicon, sin errores en consola ni violaciones de la CSP. Funcionan las rutas, una práctica completa con los botones de Resultados y Atrás/Adelante. |
| Publicado | Repositorio público; Pages con origen «GitHub Actions» y «Enforce HTTPS» activo. El workflow se ejecutó a mano el 30-10-2026 (primero sin publicar y después con «publicar»), ambos con éxito. |
| Comprobado en la web real | `https://` responde 200 (con `Strict-Transport-Security`) y `http://` redirige (301). Las seis pantallas cargan, la Biblioteca muestra las 67 lecciones, todos los módulos y JSON responden 200 y la consola no muestra errores ni avisos de CSP (Chromium). `CLAUDE.md`, `tests/`, `tools/dev-server.py` y `.claude/settings.json` devuelven 404. |
| Pendiente | Probar la web publicada en Firefox, Safari y Brave. |

## Decisiones

1. **Visibilidad del repositorio.** El repositorio es **público** (GitHub Pages en repositorios
   privados solo está disponible con planes de pago). Son visibles el historial completo y el
   correo de los commits anteriores; los commits nuevos usan el correo `noreply` de GitHub.
   El historial anterior no se reescribe.
2. **Licencia.** Código bajo MIT ([LICENSE](../LICENSE)); los logotipos y la identidad de
   marca quedan fuera ([TRADEMARKS.md](../TRADEMARKS.md)). Los logotipos se publican con la web
   porque la aplicación los necesita.
3. **Rama.** La rama predeterminada, y la única, es `chore/claude-md`. El workflow publica solo
   desde la rama predeterminada. Si más adelante creas `main` y la haces predeterminada, el
   workflow la seguirá sin cambios.

## Pasos para publicar

Configuración inicial (ya hecha): repositorio público (**Settings → General → Danger Zone**),
**Settings → Pages → Source: «GitHub Actions»** y **«Enforce HTTPS»** marcado.

Para publicar una versión nueva:

1. Sube a GitHub los commits que quieras publicar (con tu autorización).
2. **Prueba sin publicar:** pestaña **Actions → «Publicar en GitHub Pages» → Run workflow**,
   desde la rama predeterminada, con «publicar» **desmarcado**. Deben pasar las pruebas y el
   paso «Contenido del artefacto» debe listar solo `index.html`, `assets/`, `css/`, `data/` y `js/`.
3. **Publicación:** repite con «publicar» **marcado**. Al terminar, el job `deploy` muestra la
   URL: `https://alejandro-mfl.github.io/TypingQuest/`.
4. Repite las comprobaciones de abajo.

Subir commits (push) **no** publica nada: la web solo cambia al lanzar el workflow a mano.

## Auditoría de privacidad del historial (T18)

Revisados los 21 commits de todas las ramas, sus autores y todos los archivos que han existido
(ninguno se ha eliminado):

- **Sin credenciales ni tokens**, sin archivos de entorno y sin rutas locales privadas.
- **Público:** el nombre `AlejandroMFL` y el correo personal de autor y committer de esos
  commits. No se reescribe el historial; los commits posteriores usan el correo `noreply` de
  GitHub (`git config user.email` en este repositorio).
- **También visible:** 15 commits antiguos llevan la línea `Co-Authored-By: Claude …`
  (anterior a la configuración que la desactiva). Los commits actuales ya no la incluyen.
- Los correos que aparecen en los ejercicios (p. ej. `info@typingquest.es`) son textos de
  práctica inventados, no datos de nadie.
- CLAUDE.md y ROADMAP.md (documentación de trabajo) son visibles en el repositorio, pero no
  en la web publicada.

## Comprobaciones tras publicar

```bash
curl -sI https://alejandro-mfl.github.io/TypingQuest/
```

- Responde `200` por `https://`, y `http://` redirige a `https://` si «Enforce HTTPS» está activo.
- Desde la web publicada (F12 → Consola): sin errores ni avisos de «Content Security Policy».
  Recorre Inicio, Academia, Biblioteca, Historial, Ergonomía y Práctica libre, y termina una
  práctica.
- Estas direcciones deben dar 404: `…/TypingQuest/CLAUDE.md`, `…/TypingQuest/tests/`,
  `…/TypingQuest/tools/dev-server.py` y `…/TypingQuest/.claude/settings.json`.
- Abre un enlace de «Fuentes y aviso» en Ergonomía y el favicon de la pestaña.

## Seguridad en GitHub Pages: qué se cubre y qué no

GitHub Pages **no permite configurar cabeceras HTTP**. En la web publicada aparecen, entre
otras, `Access-Control-Allow-Origin: *`, `Strict-Transport-Security` y `Cache-Control: max-age=600`,
pero ninguna de seguridad propia del proyecto.

| Medida | En GitHub Pages |
| --- | --- |
| HTTPS | Sí, con el certificado de GitHub («Enforce HTTPS» activo; `http://` redirige y se envía `Strict-Transport-Security`). |
| CSP | Sí, mediante la `<meta>` de `index.html` (scripts, estilos, imágenes y conexiones solo del propio sitio; sin `unsafe-inline` ni `unsafe-eval`). |
| `Referrer-Policy: no-referrer` | Sí, mediante `<meta name="referrer">`. Los enlaces externos llevan además `noreferrer`. |
| `frame-ancestors 'none'` (evitar que otra web la incruste) | **No**: solo funciona como cabecera. Riesgo bajo, porque no hay cuentas ni datos de otros; como mucho, alguien podría incrustarla y engañar a un usuario para que pulse botones, que piden confirmación al borrar. |
| `X-Content-Type-Options: nosniff` | **No**. Riesgo bajo: todos los archivos son propios, con su tipo correcto, y no hay subidas de usuarios. |
| Caché | `max-age=600`: tras publicar una versión nueva, durante unos minutos un navegador podría combinar módulos antiguos y nuevos. Si ocurre, basta con recargar con Ctrl+F5. |

Si en el futuro hacen falta esas cabeceras, alojamientos estáticos como **Cloudflare Pages** o
**Netlify** permiten definirlas con un archivo `_headers` en el artefacto. **No está
configurado**; solo es una alternativa:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
```

## Qué está en el repositorio y qué se publica

| En GitHub (repositorio) | En la web publicada |
| --- | --- |
| Todo el proyecto: código, `tests/`, `tools/`, `docs/`, `README.md`, `CLAUDE.md`, `ROADMAP.md`, `.claude/` y `.github/` | Solo `index.html`, `css/`, `js/`, `data/` y `assets/` |

## Simulación local del artefacto

```bash
node tools/build-site.mjs .site-preview/TypingQuest
python -m http.server 8010 --bind 127.0.0.1 --directory .site-preview
```

Abre <http://localhost:8010/TypingQuest/>. `_site/` y `.site-preview/` están en `.gitignore`.
