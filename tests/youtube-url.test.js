import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeUrl, embedUrl } from '../js/youtube-url.js';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeUrl: formatos habituales', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc123`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}?start=10`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `http://www.youtube.com/watch?v=${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
    `  https://youtu.be/${ID}  `,
    ID,
  ]) {
    it(url.trim() || 'id', () => {
      assert.deepEqual(parseYouTubeUrl(url), { ok: true, videoId: ID });
    });
  }
});

describe('parseYouTubeUrl: entradas no válidas o peligrosas', () => {
  const invalid = [
    ['vacía', ''],
    ['solo espacios', '   '],
    ['no es texto', null],
    ['otro dominio', `https://evil.example/watch?v=${ID}`],
    ['dominio que imita a YouTube', `https://youtube.com.evil.example/watch?v=${ID}`],
    ['subdominio falso', `https://notyoutube.com/watch?v=${ID}`],
    ['esquema javascript', `javascript:alert('${ID}')`],
    ['esquema data', `data:text/html,<script>${ID}</script>`],
    ['credenciales en la URL', `https://user:pass@www.youtube.com/watch?v=${ID}`],
    ['puerto no estándar', `https://www.youtube.com:8443/watch?v=${ID}`],
    ['ID demasiado corto', 'https://youtu.be/abc'],
    ['ID demasiado largo', `https://youtu.be/${ID}x`],
    ['ID con caracteres no permitidos', 'https://youtu.be/dQw4w9WgX<Q'],
    ['HTML en el ID', `https://www.youtube.com/watch?v=<img src=x onerror=alert(1)>`],
    ['canal o lista sin vídeo', 'https://www.youtube.com/@canal'],
    ['watch sin v', 'https://www.youtube.com/watch?list=PL123'],
    ['texto libre', 'mi canción favorita'],
    ['demasiado larga', `https://youtu.be/${ID}?x=${'a'.repeat(3000)}`],
  ];
  for (const [label, input] of invalid) {
    it(label, () => {
      const result = parseYouTubeUrl(input);
      assert.equal(result.ok, false);
      assert.equal(typeof result.error, 'string');
      assert.equal(result.videoId, undefined);
    });
  }
});

describe('embedUrl', () => {
  it('reproductor oficial sin cookies, con la API activada y el origen de la página', () => {
    const url = new URL(embedUrl(ID, 'http://localhost:8002'));
    assert.equal(url.origin, 'https://www.youtube-nocookie.com');
    assert.equal(url.pathname, `/embed/${ID}`);
    assert.equal(url.searchParams.get('enablejsapi'), '1');
    assert.equal(url.searchParams.get('origin'), 'http://localhost:8002');
    assert.equal(url.searchParams.get('playsinline'), '1');
    assert.equal(url.searchParams.get('autoplay'), null, 'sin reproducción automática');
    // 02.2: sin atajos de teclado del reproductor. Si el foco acaba en el vídeo, letras como
    // «l», «j», «k» o el espacio lo movían o pausaban mientras se escribía la frase.
    assert.equal(url.searchParams.get('disablekb'), '1');
  });

  it('rechaza un ID no válido', () => {
    assert.throws(() => embedUrl('<script>', 'http://localhost:8002'), TypeError);
  });
});
