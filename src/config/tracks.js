/**
 * Pistas elegibles. Cada una combina un trazado propio con una zona del ecosistema.
 *
 * Unidades: metros y grados. Ángulo positivo = curva a la derecha. `hill` es el desnivel que
 * gana o pierde el tramo. Las dos rectas con `adjust` se calculan solas para que el circuito
 * cierre: el largo escrito ahí es solo orientativo. Ver src/domain/track.js.
 */
const straight = (length, extra = {}) => Object.freeze({ kind: 'straight', length, ...extra });
const turn = (radius, angle, extra = {}) => Object.freeze({ kind: 'turn', radius, angle, ...extra });
const jump = (spec) => Object.freeze({ kind: 'jump', ...spec });

export const TRACKS = Object.freeze([
  {
    id: 'bajo-autopista',
    name: 'Bajo Autopista',
    zone: 'bajo-autopista',
    tagline: 'Equilibrada. Curvas medias, una ese rápida, una horquilla y un salto sobre el canal del viaducto.',
    width: 13,
    runoff: 8,
    layout: [
      straight(300, { adjust: true, boost: 0.55 }),
      turn(95, 90, { hill: 6 }),
      straight(150),
      turn(55, -55),
      turn(55, 55, { hill: -4 }),
      straight(100),
      jump({ ramp: 42, height: 3.4, gap: 26, landing: 38, landingHeight: 2.2 }),
      turn(130, 90, { hill: 4 }),
      straight(150),
      turn(32, 120),
      straight(120, { hill: -6 }),
      turn(75, -60),
      straight(160, { adjust: true }),
      turn(120, 120, { hill: 2 }),
      straight(60, { hill: -2 })
    ]
  },
  {
    id: 'costa-rosa',
    name: 'Costa Rosa',
    zone: 'costa-rosa',
    tagline: 'Rápida. Curvas largas junto al mar, un tobogán costero y dos saltos sobre la bahía.',
    width: 14,
    runoff: 10,
    layout: [
      straight(300, { adjust: true, boost: [0.3, 0.75] }),
      turn(180, 70, { hill: 3 }),
      straight(120),
      turn(160, 50, { hill: -5 }),
      jump({ ramp: 48, height: 3.8, gap: 32, landing: 44, landingHeight: 2.4 }),
      turn(220, -40),
      turn(140, 80, { hill: 8 }),
      straight(520, { hill: -8, boost: 0.4 }),
      turn(60, 100),
      straight(120, { boost: 0.5 }),
      jump({ ramp: 40, height: 3, gap: 24, landing: 36, landingHeight: 2 }),
      turn(300, 60, { hill: -3 }),
      turn(120, -30),
      straight(250, { adjust: true }),
      turn(140, 70)
    ]
  },
  {
    id: 'distrito-torre',
    name: 'Distrito Torre',
    zone: 'distrito-torre',
    tagline: 'Técnica. Chicanas y curvas encadenadas entre torres, una horquilla y un salto entre edificios.',
    width: 12,
    runoff: 6,
    layout: [
      straight(200, { adjust: true }),
      turn(40, 90),
      straight(80),
      turn(28, -70, { hill: 3 }),
      turn(28, 70),
      straight(180, { hill: 4 }),
      turn(50, 50),
      straight(60),
      turn(24, 160, { hill: -3 }),
      straight(130, { boost: 0.5 }),
      turn(36, -120),
      jump({ ramp: 36, height: 3, gap: 20, landing: 30, landingHeight: 2 }),
      turn(45, 70, { hill: -4 }),
      turn(30, -60),
      turn(40, 60),
      straight(90, { adjust: true }),
      turn(60, 110)
    ]
  },
  {
    id: 'anillo-neon',
    name: 'Anillo Neón',
    zone: 'anillo-neon',
    tagline: 'Exigente. Lomas altas que despegan el auto, curvas ciegas y tres saltos de neón.',
    width: 13,
    runoff: 8,
    layout: [
      straight(240, { adjust: true, boost: 0.6 }),
      turn(80, 75, { hill: 12 }),
      straight(200, { hill: -12 }),
      jump({ ramp: 44, height: 3.6, gap: 28, landing: 40, landingHeight: 2.4 }),
      turn(45, 105, { hill: 8 }),
      jump({ ramp: 36, height: 2.8, gap: 20, landing: 32, landingHeight: 1.8, hill: -10 }),
      turn(35, -80),
      turn(70, 120, { hill: 6 }),
      straight(120, { hill: -6 }),
      jump({ ramp: 40, height: 3.2, gap: 24, landing: 36, landingHeight: 2 }),
      turn(55, 100, { hill: 10 }),
      straight(90, { hill: -14 }),
      turn(40, -60),
      straight(100, { adjust: true }),
      turn(70, 100, { hill: 4 })
    ]
  }
].map(track => Object.freeze({ ...track, layout: Object.freeze(track.layout) })));

export const findTrack = id => TRACKS.find(t => t.id === id) ?? TRACKS[0];

/** Opciones de construcción de la pista: ancho y escape propios sobre las reglas. */
export const trackOptions = (track, rules) => Object.freeze({
  segmentLength: rules.segmentLength,
  rumbleSegments: rules.rumbleSegments,
  startLineSegments: rules.startLineSegments,
  gapDepth: rules.gapDepth,
  halfWidth: track.width / 2,
  barrier: track.width / 2 + track.runoff
});
