import { clamp } from './math.js';

/**
 * Intención de manejo en un cuadro: dirección [-1, 1], acelerador y freno [0, 1],
 * propulsor de salto y propulsor de empuje (sostenidos).
 */
export function createControls({ steer = 0, throttle = 0, brake = 0, jump = false, boost = false } = {}) {
  return Object.freeze({
    steer: clamp(steer, -1, 1),
    throttle: clamp(throttle, 0, 1),
    brake: clamp(brake, 0, 1),
    jump: Boolean(jump),
    boost: Boolean(boost)
  });
}

export const NEUTRAL_CONTROLS = createControls();
