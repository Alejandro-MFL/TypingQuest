"""Servidor local de desarrollo de TypingQuest.

Igual que `python -m http.server`, pero envía `Cache-Control: no-cache`: el
navegador revalida cada archivo (304 si no ha cambiado) en lugar de reutilizar
por heurística módulos ES antiguos junto a otros nuevos, lo que impide arrancar
la aplicación (p. ej. main.js nuevo con un progress.js antiguo en caché).

Uso: python tools/dev-server.py [puerto]   (8000 por defecto; 0 = puerto libre)
Solo biblioteca estándar; sirve la carpeta del proyecto en localhost.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"TypingQuest en http://localhost:{server.server_address[1]}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
