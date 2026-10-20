/**
 * Recursos estáticos. La versión de un solo archivo (`npm run build`) define
 * globalThis.AUTODROMO_ASSETS con cada ruta ya embebida como data URI u objeto JSON;
 * sin ese mapa las rutas se sirven tal cual.
 */
const embedded = () => globalThis.AUTODROMO_ASSETS ?? null;

export const assetUrl = path => {
  const value = embedded()?.[path];
  return typeof value === 'string' ? value : path;
};

export const embeddedJson = path => {
  const value = embedded()?.[path];
  return value && typeof value === 'object' ? value : null;
};
