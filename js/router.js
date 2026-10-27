// Rutas hash de la navegación principal. Módulo PURO: traduce entre el hash de
// la URL y el nombre de la pantalla. La partida y los resultados no son rutas:
// son estados de un ejercicio o práctica abiertos desde una de ellas.

const ROUTE_HASHES = Object.freeze({
  home: '#/inicio',
  academy: '#/academia',
  library: '#/biblioteca',
  history: '#/historial',
  practice: '#/practica-libre',
  ergonomics: '#/ergonomia',
});

export const ROUTES = Object.freeze(Object.keys(ROUTE_HASHES));
const DEFAULT_ROUTE = 'home';

/** Nombre de la ruta para un hash; cualquier hash desconocido lleva a Inicio. */
export function parseRoute(hash) {
  const entry = Object.entries(ROUTE_HASHES).find(([, value]) => value === hash);
  return entry ? entry[0] : DEFAULT_ROUTE;
}

export function routeHash(name) {
  return ROUTE_HASHES[name] ?? ROUTE_HASHES[DEFAULT_ROUTE];
}
