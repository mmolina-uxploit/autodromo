import { assetUrl } from './assets.js';

/**
 * Autos elegibles. Libreas tomadas de design/ecosistema.json (verificado por
 * tests/design-coherence.test.js). `physics` es la ficha técnica que valida
 * domain/vehicle.js: la misma física rige al jugador y a los rivales.
 */
export const VEHICLES = Object.freeze([
  {
    id: 'cuna',
    name: 'Cuña',
    model: 'cuna',
    tagline: 'Motor central y alerón con apoyo: la más rápida en curva veloz. Tracción trasera que pide pie fino.',
    physics: {
      mass: 1250, power: 430, topSpeed: 305, grip: 1.12, drive: 'rwd', weightFront: 0.42, cgHeight: 0.45,
      wheelbase: 2.6, length: 4.3, width: 2.2, wheelRadius: 0.35, gears: 6, redline: 8500, brake: 1.2,
      downforce: 1.4, steer: 30, durability: 0.55, offroad: 0.58,
      thrusters: { capacity: 1, jump: 6.5, lift: 6.5, boost: 6.5, regen: 0.08 },
      suspension: { travel: 0.09, frequency: 2, damping: 0.42, roll: 0.005, pitch: 0.004 }
    },
    liveries: [
      { id: 'lima', name: 'Lima', swatch: '#a1ba4b' },
      { id: 'coral', name: 'Coral', swatch: '#da604d' }
    ]
  },
  {
    id: 'saeta',
    name: 'Saeta',
    model: 'saeta',
    tagline: 'Liviana y con tracción integral: sale disparada de cada curva. En un choque pierde mucho.',
    physics: {
      mass: 1150, power: 340, topSpeed: 270, grip: 1.2, drive: 'awd', weightFront: 0.5, cgHeight: 0.48,
      wheelbase: 2.7, length: 4.45, width: 2.05, wheelRadius: 0.33, gears: 6, redline: 7800, brake: 1.25,
      downforce: 0.9, steer: 33, durability: 0.45, offroad: 0.66,
      thrusters: { capacity: 1, jump: 6.8, lift: 6.2, boost: 6, regen: 0.09 },
      suspension: { travel: 0.1, frequency: 1.9, damping: 0.45, roll: 0.006, pitch: 0.0045 }
    },
    liveries: [
      { id: 'hormigon', name: 'Hormigón', swatch: '#91a9bd' },
      { id: 'grafito', name: 'Grafito', swatch: '#344b61' },
      { id: 'magenta', name: 'Magenta', swatch: '#a34a76' }
    ]
  },
  {
    id: 'bloque',
    name: 'Bloque',
    model: 'bloque',
    tagline: 'Furgón pesado de suspensión larga: lento, pero aterriza sin despeinarse y empuja en los choques.',
    physics: {
      mass: 1950, power: 330, topSpeed: 225, grip: 1, drive: 'rwd', weightFront: 0.52, cgHeight: 0.78,
      wheelbase: 2.9, length: 4.35, width: 1.95, wheelRadius: 0.31, gears: 5, redline: 6200, brake: 1,
      downforce: 0.2, steer: 34, durability: 0.88, offroad: 0.78,
      thrusters: { capacity: 1.2, jump: 6, lift: 6, boost: 5.5, regen: 0.08 },
      suspension: { travel: 0.15, frequency: 1.4, damping: 0.35, roll: 0.009, pitch: 0.006 }
    },
    liveries: [
      { id: 'crema', name: 'Crema', swatch: '#e5e7dd' },
      { id: 'turquesa', name: 'Turquesa', swatch: '#438c92' },
      { id: 'mostaza', name: 'Mostaza', swatch: '#c5a34e' }
    ]
  },
  {
    id: 'volta',
    name: 'Volta',
    model: 'volta',
    tagline: 'Roadster eléctrico con paquete de propulsores de aire frío: salta más alto, planea más lejos y empuja como nadie.',
    physics: {
      mass: 1750, power: 720, topSpeed: 320, grip: 1.15, drive: 'awd', electric: true, weightFront: 0.46,
      cgHeight: 0.42, wheelbase: 2.65, length: 4.2, width: 2, wheelRadius: 0.34, gears: 1, redline: 18000,
      idle: 600, brake: 1.25, downforce: 1, steer: 31, durability: 0.6, offroad: 0.6,
      thrusters: { capacity: 1.6, jump: 8.2, lift: 8.5, boost: 9, regen: 0.12, jumpCost: 0.22 },
      suspension: { travel: 0.1, frequency: 1.8, damping: 0.42, roll: 0.005, pitch: 0.004 }
    },
    liveries: [
      { id: 'rubi', name: 'Rubí', swatch: '#b93843' },
      { id: 'perla', name: 'Perla', swatch: '#e9f0ed' },
      { id: 'noche', name: 'Noche', swatch: '#172e48' }
    ]
  }
].map(v => Object.freeze({ ...v, physics: Object.freeze(v.physics), liveries: Object.freeze(v.liveries.map(Object.freeze)) })));

export const findVehicle = id => VEHICLES.find(v => v.id === id) ?? VEHICLES[0];
export const findLivery = (vehicle, id) => vehicle.liveries.find(l => l.id === id) ?? vehicle.liveries[0];

/** Retrato de tres cuartos generado por design/generador (contrato_sprites.retratos). */
export const portraitUrl = (vehicle, liveryId) => assetUrl(`assets/garage/${vehicle.model}-${liveryId}.png`);
