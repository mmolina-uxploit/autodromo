/**
 * Niveles de dificultad. `skill` es el rango de ritmo de los rivales (1 = línea ideal al límite),
 * `assist` las ayudas del jugador (completa, ligera o ninguna) y `grid` en qué parte de la
 * grilla larga el jugador (0 = adelante, 1 = último).
 */
export const DIFFICULTIES = Object.freeze([
  { id: 'facil', name: 'Fácil', tagline: 'Rivales tranquilos y todas las ayudas. Largás adelante.', skill: [0.8, 0.86], assist: 'completa', grid: 0.25 },
  { id: 'normal', name: 'Normal', tagline: 'Rivales parejos, control de tracción y estabilidad.', skill: [0.88, 0.94], assist: 'ligera', grid: 0.5 },
  { id: 'dificil', name: 'Difícil', tagline: 'Rivales al límite. Largás desde el fondo.', skill: [0.95, 1], assist: 'ligera', grid: 0.8 },
  { id: 'leyenda', name: 'Leyenda', tagline: 'Sin ayudas y rivales que no perdonan. Largás último.', skill: [1, 1.04], assist: 'ninguna', grid: 1 }
].map(level => Object.freeze({ ...level, skill: Object.freeze(level.skill) })));

export const findDifficulty = id => DIFFICULTIES.find(d => d.id === id) ?? DIFFICULTIES[1];

export const LAP_OPTIONS = Object.freeze([1, 2, 3, 5, 8]);
export const RIVAL_OPTIONS = Object.freeze([0, 3, 5, 7]);

/** Apodos de los pilotos rivales; nunca nombres de personas reales. */
export const RIVAL_NAMES = Object.freeze(['Cometa', 'Turbina', 'Ráfaga', 'Centella', 'Zafiro', 'Brújula', 'Voltio', 'Sirena', 'Tifón', 'Faro']);
