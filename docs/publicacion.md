# Publicación de TypingQuest

Guía para publicar TypingQuest como web estática en **GitHub Pages**. Cada paso requiere tu
autorización expresa. **Hoy no hay ninguna versión publicada.**

## Estado

| Estado | Qué |
| --- | --- |
| Implementado | `tools/build-site.mjs` construye el artefacto y lo comprueba: solo `index.html`, `css/`, `js/`, `data/` y `assets/`, sin archivos ocultos, de tipos no permitidos ni referencias absolutas o rotas. `.github/workflows/pages.yml` ejecuta las pruebas, construye el artefacto y solo publica si se lanza a mano con la casilla «publicar» marcada desde la rama predeterminada. |
| Comprobado en local | El artefacto, servido en `http://localhost:8010/TypingQuest/` (la misma subruta que tendría en Pages), carga todos los módulos, los JSON, el logo y el favicon (todas las peticiones con 200), sin errores en consola ni violaciones de la CSP. Funcionan las rutas, una práctica completa con los botones de Resultados y Atrás/Adelante. CLAUDE.md, ROADMAP.md, `tests/`, `tools/`, `.git/` y `.claude/` devuelven 404. |
| Pendiente | Hacer público el repositorio (decidido, sin aplicar), activar Pages, ejecutar el workflow, comprobar la web publicada (HTTPS, CSP, cabeceras) y probar en Firefox, Safari y Brave. |

## Antes de publicar: decisiones

1. **Visibilidad del repositorio.** Hoy es **privado**; se ha decidido hacerlo público. GitHub Pages en repositorios privados
   solo está disponible con los planes de pago (GitHub Pro, Team o Enterprise); con el plan
   gratuito hay que hacerlo **público**. En cualquier caso, la web publicada es pública.
   Al hacer público el repositorio, también serán visibles el historial completo y el correo
   de los commits; si prefieres ocultarlo en adelante, usa el correo `noreply` de GitHub
   (Settings → Emails). El historial anterior no se reescribe.
2. **Licencia.** Código bajo MIT ([LICENSE](../LICENSE)); los logotipos y la identidad de
   marca quedan fuera ([TRADEMARKS.md](../TRADEMARKS.md)). Los logotipos se publican con la web
   porque la aplicación los necesita.
3. **Rama.** La rama predeterminada, y la única, es `chore/claude-md`. El workflow publica solo
   desde la rama predeterminada. Si más adelante creas `main` y la haces predeterminada, el
   workflow la seguirá sin cambios.

## Pasos para publicar

1. Sube a GitHub el commit de T18 (con tu autorización).
2. **Hacer público el repositorio:** **Settings → General → Danger Zone → Change repository
   visibility → Make public**. Antes, revisa la auditoría de privacidad (abajo).
3. En GitHub: **Settings → Pages → Build and deployment → Source: «GitHub Actions»**.
4. **Prueba sin publicar:** pestaña **Actions → «Publicar en GitHub Pages» → Run workflow**,
   desde la rama predeterminada, con «publicar» **desmarcado**. Deben pasar las pruebas y el
   paso «Contenido del artefacto» debe listar solo `index.html`, `assets/`, `css/`, `data/` y `js/`.
5. **Publicación:** repite con «publicar» **marcado**. Al terminar, el job `deploy` muestra la
   URL, previsiblemente `https://alejandro-mfl.github.io/TypingQuest/`.
6. En **Settings → Pages**, marca **«Enforce HTTPS»** si aparece disponible.

## Auditoría de privacidad del historial (T18)

Revisados los 21 commits de todas las ramas, sus autores y todos los archivos que han existido
(ninguno se ha eliminado):

- **Sin credenciales ni tokens**, sin archivos de entorno y sin rutas locales privadas.
- **Será público:** el nombre `AlejandroMFL` y el correo personal de autor y committer de
  todos los commits. No se reescribe el historial; para los commits futuros se puede usar el
  correo `noreply` de GitHub (Settings → Emails y `git config user.email`).
- **También visible:** 15 commits antiguos llevan la línea `Co-Authored-By: Claude …`
  (anterior a la configuración que la desactiva). Los commits actuales ya no la incluyen.
- Los correos que aparecen en los ejercicios (p. ej. `info@typingquest.es`) son textos de
  práctica inventados, no datos de nadie.
- CLAUDE.md y ROADMAP.md (documentación de trabajo) quedarán visibles en el repositorio,
  pero no en la web publicada.

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

GitHub Pages **no permite configurar cabeceras HTTP**. En una web de `github.io` observada en
T18 solo aparecían `Server`, `Access-Control-Allow-Origin: *` y `Cache-Control: max-age=600`.

| Medida | En GitHub Pages |
| --- | --- |
| HTTPS | Sí, con el certificado de GitHub («Enforce HTTPS»). Pendiente de comprobar en la web real. |
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
