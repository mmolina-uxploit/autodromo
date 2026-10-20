import { createRules } from '../src/config/rules.js';
import { Track } from '../src/domain/track.js';
import { createVehicleSpec } from '../src/domain/vehicle.js';

const straight = (length, extra = {}) => ({ kind: 'straight', length, ...extra });
const turn = (radius, angle, extra = {}) => ({ kind: 'turn', radius, angle, ...extra });

/** Circuito cuadrado de prueba: cuatro curvas de 60 m de radio; dos rectas cierran solas. */
export const SMALL_LAYOUT = Object.freeze([
  straight(160, { adjust: true }),
  turn(60, 90),
  straight(100, { adjust: true, hill: 4 }),
  turn(60, 90),
  straight(160, { hill: -4 }),
  turn(60, 90),
  straight(100),
  turn(60, 90)
]);

/** El mismo cuadrado con un salto (rampa, foso y aterrizaje) en la tercera recta. */
export const JUMP_LAYOUT = Object.freeze([
  ...SMALL_LAYOUT.slice(0, 4),
  { kind: 'jump', ramp: 40, height: 3, gap: 20, landing: 30, landingHeight: 2 },
  ...SMALL_LAYOUT.slice(5)
]);

export const TRACK_OPTIONS = Object.freeze({ segmentLength: 3, halfWidth: 6, barrier: 13, gapDepth: 14 });

export function smallWorld(overrides = {}, layout = SMALL_LAYOUT) {
  const rules = createRules(overrides);
  const track = Track.fromLayout(layout, { ...TRACK_OPTIONS, segmentLength: rules.segmentLength });
  return { rules, track };
}

export const testSpec = (tuning = {}, id = 'prueba') => createVehicleSpec(id, tuning);
