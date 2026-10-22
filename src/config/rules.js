/**
 * Reglas del juego en unidades reales: metros, segundos, metros por segundo.
 * La física corre a paso fijo (physicsStep) aunque el cuadro dure otra cosa.
 */
const DEFAULT_RULES = {
  // Pista
  segmentLength: 3,
  rumbleSegments: 2,
  startLineSegments: 2,
  rumbleWidth: 1.2,
  gapDepth: 14,

  // Física
  gravity: 9.81,
  physicsStep: 1 / 120,
  maxSubsteps: 12,
  wallRestitution: 0.22,
  wallFriction: 0.4,
  carRestitution: 0.3,
  fallDepth: 4,
  respawnBack: 110,
  respawnSpeed: 22,
  ghostSeconds: 2,
  stuckSeconds: 4,

  // Carrera
  countdownSeconds: 3,
  minLapSeconds: 10,
  gridFirstGap: 10,
  gridRowGap: 9,
  gridColumnOffset: 3,
  // Cuánto espera la carrera a los rivales después de que el jugador cruza la meta. Medido con
  // 25 s: la gracia se consumía entera en la enorme mayoría de las carreras (siempre, en Fácil),
  // así que la espera no servía para ver llegar a nadie, solo para esperar.
  finishGraceSeconds: 7,
  maxRivals: 7
};

export function createRules(overrides = {}) {
  return Object.freeze({ ...DEFAULT_RULES, ...overrides });
}
