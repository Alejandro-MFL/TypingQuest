// Memoria de la Biblioteca (T12): «billete de vuelta» que se crea al abrir una
// práctica desde la Biblioteca y se usa una sola vez al volver a ella.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLibraryReturn,
  nextLibraryReturn,
  restoreTarget,
  sanitizeLibraryFilters,
} from '../js/library-memory.js';

const FILTERS = { query: 'ñ', level: 2, difficulty: 'basic', category: 'fila-central' };
const ticket = (overrides = {}) => createLibraryReturn({ filters: FILTERS, scrollY: 1840, exerciseId: 'l2-asdf', ...overrides });

describe('createLibraryReturn', () => {
  it('guarda búsqueda, filtros, desplazamiento y la práctica abierta (base o ampliada)', () => {
    assert.deepEqual(ticket(), { filters: FILTERS, scrollY: 1840, exerciseId: 'l2-asdf' });
    assert.equal(ticket({ exerciseId: 'l2-asdf-ampliada' }).exerciseId, 'l2-asdf-ampliada');
  });

  it('copia los filtros: cambiarlos después no altera el billete', () => {
    const filters = { ...FILTERS };
    const saved = createLibraryReturn({ filters, scrollY: 0, exerciseId: 'a' });
    filters.query = 'otra';
    assert.equal(saved.filters.query, 'ñ');
    assert.ok(Object.isFrozen(saved) && Object.isFrozen(saved.filters));
  });

  it('desplazamiento no válido → 0; sin práctica identificable → null', () => {
    assert.equal(ticket({ scrollY: -5 }).scrollY, 0);
    assert.equal(ticket({ scrollY: Number.NaN }).scrollY, 0);
    assert.equal(ticket({ scrollY: 12.7 }).scrollY, 13);
    assert.equal(ticket({ exerciseId: '' }), null);
    assert.equal(ticket({ exerciseId: undefined }), null);
  });
});

describe('nextLibraryReturn: cuándo se usa y cuándo se olvida', () => {
  it('abrir una práctica de la Biblioteca crea (o sustituye) el billete', () => {
    const first = nextLibraryReturn(null, { type: 'open-library-exercise', ticket: ticket() });
    const second = nextLibraryReturn(first, { type: 'open-library-exercise', ticket: ticket({ exerciseId: 'b-u' }) });
    assert.equal(first.exerciseId, 'l2-asdf');
    assert.equal(second.exerciseId, 'b-u', 'cambiar de ejercicio no restaura el anterior');
  });

  it('se usa UNA vez: al mostrarse la Biblioteca se consume', () => {
    assert.equal(nextLibraryReturn(ticket(), { type: 'library-shown' }), null);
  });

  it('abrir un ejercicio desde otro origen (Academia, práctica libre) lo descarta', () => {
    assert.equal(nextLibraryReturn(ticket(), { type: 'open-other-exercise' }), null);
  });

  it('repetir o reiniciar la partida, o pasar por otras secciones, no lo toca', () => {
    const current = ticket();
    for (const type of ['restart', 'route-shown', 'desconocido']) {
      assert.equal(nextLibraryReturn(current, { type }), current);
    }
  });

  it('sin billete, entrar en la Biblioteca no restaura nada (primera visita)', () => {
    assert.equal(nextLibraryReturn(null, { type: 'library-shown' }), null);
    assert.equal(restoreTarget(null, ['l2-asdf']), null);
  });
});

describe('restoreTarget', () => {
  it('con la práctica visible: desplazamiento y práctica a la que devolver el foco', () => {
    assert.deepEqual(restoreTarget(ticket(), ['x', 'l2-asdf']), { scrollY: 1840, exerciseId: 'l2-asdf' });
  });

  it('si la práctica ya no está visible: solo el desplazamiento (sin foco inventado)', () => {
    assert.deepEqual(restoreTarget(ticket(), ['x']), { scrollY: 1840, exerciseId: null });
  });
});

describe('sanitizeLibraryFilters', () => {
  const available = { levels: [1, 2, 3], difficulties: ['basic', 'advanced'], categories: ['fila-central'] };

  it('conserva los valores que existen', () => {
    assert.deepEqual(sanitizeLibraryFilters(FILTERS, available), FILTERS);
  });

  it('valores que ya no existen vuelven a «Todos»; la búsqueda se acota', () => {
    const odd = { query: 'x'.repeat(500), level: 9, difficulty: 'imposible', category: 'otra' };
    assert.deepEqual(sanitizeLibraryFilters(odd, available), {
      query: 'x'.repeat(200), level: null, difficulty: '', category: '',
    });
  });

  it('entradas no válidas no lanzan', () => {
    assert.deepEqual(sanitizeLibraryFilters(null, available), { query: '', level: null, difficulty: '', category: '' });
  });
});
