import { clamp, degToRad } from './math.js';

const positive = v => Number.isFinite(v) && v > 0;
const ratio = (min, max) => v => Number.isFinite(v) && v >= min && v <= max;

/** Atributos de ficha técnica que puede declarar un auto y la condición que debe cumplir cada uno. */
const FIELDS = Object.freeze({
  mass: positive,                 // kg
  power: positive,                // kW en las ruedas, al pico
  topSpeed: positive,             // km/h que limita el arrastre
  grip: ratio(0.4, 2),            // coeficiente de fricción del neumático
  drive: v => ['rwd', 'fwd', 'awd'].includes(v),
  weightFront: ratio(0.3, 0.7),   // fracción del peso sobre el eje delantero
  cgHeight: ratio(0.2, 1.2),      // m
  wheelbase: ratio(2, 3.6),       // m
  length: ratio(3, 6),            // m
  width: ratio(1.5, 2.5),         // m
  wheelRadius: ratio(0.25, 0.5),  // m
  gears: v => Number.isInteger(v) && v >= 1 && v <= 8,
  redline: ratio(4000, 22000),    // rpm
  idle: ratio(500, 2000),         // rpm
  brake: ratio(0.5, 2),           // desaceleración máxima en g
  downforce: ratio(0, 5),         // N por (m/s)²
  steer: ratio(15, 45),           // grados de giro de rueda a baja velocidad
  electric: v => typeof v === 'boolean',
  durability: ratio(0.1, 0.95),   // fracción de velocidad que conserva en un choque fuerte
  offroad: ratio(0.3, 1),         // agarre fuera del asfalto relativo al asfalto
  thrusters: v => v && typeof v === 'object',
  suspension: v => v && typeof v === 'object'
});

const DEFAULT_TUNING = Object.freeze({
  mass: 1300,
  power: 360,
  topSpeed: 280,
  grip: 1.1,
  drive: 'rwd',
  weightFront: 0.45,
  cgHeight: 0.5,
  wheelbase: 2.65,
  length: 4.4,
  width: 2,
  wheelRadius: 0.33,
  gears: 6,
  redline: 7800,
  idle: 900,
  brake: 1.15,
  downforce: 0.8,
  steer: 32,
  electric: false,
  durability: 0.6,
  offroad: 0.62,
  thrusters: Object.freeze({ capacity: 1, jump: 6.5, lift: 6, boost: 6, regen: 0.08, jumpCost: 0.28, liftDrain: 0.45, boostDrain: 0.3 }),
  suspension: Object.freeze({ travel: 0.1, frequency: 1.8, damping: 0.4, roll: 0.006, pitch: 0.004 })
});

const GRAVITY = 9.81;
const DRIVETRAIN = 0.9;
const ROLLING = 0.015;

/**
 * Ficha física completa de un auto: valida lo declarado y deriva lo demás
 * (arrastre a partir de potencia y velocidad final, relaciones de caja, inercia).
 */
export function createVehicleSpec(id, tuning = {}) {
  for (const [key, value] of Object.entries(tuning)) {
    const valid = FIELDS[key];
    if (!valid) throw new RangeError(`Atributo desconocido: ${key}`);
    if (!valid(value)) throw new RangeError(`Valor inválido para ${key}: ${value}`);
  }
  const t = {
    ...DEFAULT_TUNING,
    ...tuning,
    thrusters: { ...DEFAULT_TUNING.thrusters, ...tuning.thrusters },
    suspension: { ...DEFAULT_TUNING.suspension, ...tuning.suspension }
  };
  const power = t.power * 1000 * DRIVETRAIN;
  const top = t.topSpeed / 3.6;
  const dragK = Math.max(0.05, (power - ROLLING * t.mass * GRAVITY * top) / (top ** 3));
  const b = t.wheelbase * t.weightFront;
  const a = t.wheelbase - b;
  const gearCount = t.electric ? 1 : t.gears;
  const first = t.electric ? 1 : 3.4;
  const last = t.electric ? 1 : 0.78;
  const gearRatios = Array.from({ length: gearCount }, (_, i) =>
    gearCount === 1 ? 1 : first * (last / first) ** (i / (gearCount - 1)));
  // La relación final pone el corte de la última marcha apenas por encima de la velocidad final.
  const finalDrive = (t.redline * 2 * Math.PI / 60) * t.wheelRadius / (top * 1.06 * gearRatios[gearCount - 1]);

  return Object.freeze({
    id,
    ...t,
    thrusters: Object.freeze(t.thrusters),
    suspension: Object.freeze(t.suspension),
    gravity: GRAVITY,
    a,
    b,
    inertia: t.mass * (t.length ** 2 + t.width ** 2) / 12 * 1.1,
    halfLength: t.length / 2,
    halfWidth: t.width / 2,
    peakPower: power,
    topSpeedMs: top,
    dragK,
    rolling: ROLLING,
    gearRatios: Object.freeze(gearRatios),
    finalDrive,
    steerMax: degToRad(t.steer),
    driveRear: t.drive === 'rwd' ? 1 : t.drive === 'fwd' ? 0 : 0.6,
    // Fuerza máxima de arranque: la primera marcha a fondo, limitada por el par.
    launchForce: t.mass * GRAVITY * clamp(power / (t.mass * 300), 0.55, 1.25),
    tireB: 11,
    tireC: 1.5
  });
}

/** Curva de potencia normalizada por régimen (0 a 1 sobre el corte). Plana en los eléctricos. */
export function powerFraction(spec, rpmFraction) {
  if (spec.electric) return 1;
  const x = clamp(rpmFraction, 0, 1.05);
  return clamp(0.35 + 1.25 * x - 0.6 * x * x, 0, 1);
}

/** Régimen del motor que corresponde a una velocidad en una marcha dada. */
export function engineRpm(spec, speed, gear) {
  const ratioTotal = spec.gearRatios[gear - 1] * spec.finalDrive;
  return Math.abs(speed) / spec.wheelRadius * ratioTotal * 60 / (2 * Math.PI);
}
