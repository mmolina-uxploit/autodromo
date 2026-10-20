/**
 * Proyección pseudo-3D en metros. La cámara mira a lo largo de la pista; `focal` es la
 * distancia focal en píxeles: un objeto de 1 m a `z` metros mide focal / z píxeles.
 */
export function createCamera({ height, distance, drawDistance, fogDensity }) {
  return Object.freeze({ height, distance, drawDistance, fogDensity });
}

export function createViewport(width, height, { horizonRatio = 0.4, focalHeight = 0.72, focalWidth = 0.95 } = {}) {
  return Object.freeze({
    width,
    height,
    horizon: height * horizonRatio,
    focal: Math.max(1, Math.min(height * focalHeight, width * focalWidth))
  });
}

/** Proyecta un punto relativo a la cámara (x a la derecha, y arriba, z adelante). Escribe en `out`. */
export function projectPoint(out, x, y, z, viewport) {
  const scale = viewport.focal / z;
  out.z = z;
  out.scale = scale;
  out.x = viewport.width / 2 + x * scale;
  out.y = viewport.horizon - y * scale;
  return out;
}

export const fogAt = (n, drawDistance, density) => 1 - 1 / Math.exp(Math.pow(n / drawDistance, 2) * density);

/** Factor para dibujar un sprite hecho a `pixelsPerMeter` a la escala de pantalla (px por metro). */
export const spriteScale = (screenPixelsPerMeter, pixelsPerMeter) => screenPixelsPerMeter / pixelsPerMeter;
