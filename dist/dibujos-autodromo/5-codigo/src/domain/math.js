export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeIn = (a, b, t) => a + (b - a) * t * t;
export const easeInOut = (a, b, t) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);
export const wrap = (value, length) => ((value % length) + length) % length;
export const sign = value => (value < 0 ? -1 : 1);

/** Distancia con signo por el camino más corto en un circuito de largo dado. */
export function signedWrap(delta, length) {
  const d = wrap(delta, length);
  return d > length / 2 ? d - length : d;
}

/** Mueve `value` hacia `target` sin pasarse más de `step`. */
export function approach(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  return Math.max(target, value - step);
}

/** Ruido determinista en [-1, 1] a partir de dos números: sirve para baches y decisiones sin estado oculto. */
export function hashNoise(a, b = 0) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

export const degToRad = deg => (deg * Math.PI) / 180;
