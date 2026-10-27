import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, parseRoute, routeHash } from '../js/router.js';

describe('router', () => {
  it('reconoce las rutas principales', () => {
    assert.equal(parseRoute('#/inicio'), 'home');
    assert.equal(parseRoute('#/academia'), 'academy');
    assert.equal(parseRoute('#/biblioteca'), 'library');
    assert.equal(parseRoute('#/historial'), 'history');
    assert.equal(parseRoute('#/practica-libre'), 'practice');
    assert.equal(parseRoute('#/ergonomia'), 'ergonomics');
  });

  it('sin hash o con uno desconocido va a Inicio', () => {
    for (const hash of ['', '#', '#/', '#/otra', 'academia', '#/ACADEMIA', '#/academia/extra', null, undefined]) {
      assert.equal(parseRoute(hash), 'home', String(hash));
    }
  });

  it('routeHash es el inverso de parseRoute', () => {
    for (const name of ROUTES) assert.equal(parseRoute(routeHash(name)), name);
  });

  it('routeHash de una ruta desconocida lleva a Inicio', () => {
    assert.equal(routeHash('nada'), '#/inicio');
  });
});
