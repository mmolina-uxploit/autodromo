/**
 * Halos de luz pre-dibujados: un degradé radial por combinación de colores, guardado una vez
 * en un canvas chico y estirado con drawImage. Crear un degradé nuevo por halo y por cuadro
 * cuesta bastante más que copiar una imagen, y el halo es tan suave que no pierde nada.
 */
const SIZE = 128;
const cache = new Map();

function canvasOf(size) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

/** `stops`: lista de [posición 0..1, color] del centro hacia afuera. */
export function glowSprite(stops) {
  const key = stops.map(([at, color]) => `${at}@${color}`).join('|');
  let sprite = cache.get(key);
  if (!sprite) {
    sprite = canvasOf(SIZE);
    const g = sprite.getContext('2d');
    const half = SIZE / 2;
    const gradient = g.createRadialGradient(half, half, 0, half, half, half);
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    g.fillStyle = gradient;
    g.fillRect(0, 0, SIZE, SIZE);
    cache.set(key, sprite);
  }
  return sprite;
}

/** Dibuja un halo de radio `r` centrado en (x, y) con el modo y la opacidad que tenga el contexto. */
export function paintGlow(ctx, x, y, r, stops) {
  if (r <= 0.5) return;
  ctx.drawImage(glowSprite(stops), x - r, y - r, r * 2, r * 2);
}
