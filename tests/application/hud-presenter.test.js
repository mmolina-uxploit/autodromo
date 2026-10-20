import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLapTime, toKmh, ordinal, presentHud, describeEvent, suspensionCompression } from '../../src/application/hud-presenter.js';
import { RaceEvent, createRace } from '../../src/domain/race.js';
import { smallWorld, testSpec } from '../helpers.js';

const { track, rules } = smallWorld();
const spec = testSpec();
const race = createRace({ track, rules, laps: 3, entries: [
  { id: 0, spec, model: 'cuna', livery: 'lima', name: 'Vos', isPlayer: true },
  { id: 1, spec, model: 'saeta', livery: 'grafito', name: 'Cometa' }
] });

test('formatLapTime escribe minutos, segundos y centésimas', () => {
  assert.equal(formatLapTime(65.4321), '1:05.43');
  assert.equal(formatLapTime(9.999), '0:10.00');
  assert.equal(formatLapTime(null), null);
  assert.equal(formatLapTime(Infinity), null);
});

test('toKmh convierte metros por segundo', () => {
  assert.equal(toKmh(25), 90);
  assert.equal(toKmh(-10), 36);
});

test('ordinal agrega el indicador', () => {
  assert.equal(ordinal(2), '2º');
});

test('presentHud arma el modelo del tablero del jugador', () => {
  const model = presentHud({ ...race, cars: race.cars.map(c => (c.isPlayer ? { ...c, u: 20, energy: 0.5 } : c)) });
  assert.equal(model.speed, '72');
  assert.equal(model.position, '1º');
  assert.equal(model.total, '2');
  assert.equal(model.lap, 'Vuelta 1/3');
  assert.equal(model.best, 'sin registro');
  assert.equal(model.energy, 0.5);
  assert.equal(model.gear, '1');
  assert.equal(model.suspension.length, 4);
});

test('la compresión de suspensión sigue al cabeceo y al rolido', () => {
  const car = race.cars[0];
  const nose = suspensionCompression({ ...car, susp: { ...car.susp, pitch: -0.03 } }, spec);
  assert.ok(nose[0] > 0 && nose[2] < 0, 'la trompa abajo comprime adelante');
  const right = suspensionCompression({ ...car, susp: { ...car.susp, roll: 0.03 } }, spec);
  assert.ok(right[1] > right[0], 'rolido a la derecha comprime la derecha');
});

test('describeEvent redacta anuncios para lector de pantalla', () => {
  assert.equal(describeEvent({ type: RaceEvent.COUNTDOWN_TICK, value: 2 }), '2');
  assert.equal(describeEvent({ type: RaceEvent.STARTED }), 'Largada');
  assert.equal(describeEvent({ type: RaceEvent.LAP_COMPLETED, lap: 1, time: 61.5, isBest: true }), 'Vuelta 1 en 1:01.50. Mejor vuelta.');
  assert.equal(describeEvent({ type: RaceEvent.FINAL_LAP }), 'Última vuelta');
  assert.equal(describeEvent({ type: RaceEvent.POSITION_CHANGED, position: 3, total: 6 }), 'Vas 3º de 6');
  assert.equal(describeEvent({ type: RaceEvent.COLLISION, player: true, intensity: 8 }), 'Choque');
  assert.equal(describeEvent({ type: RaceEvent.COLLISION, player: false, intensity: 8 }), null);
  assert.equal(describeEvent({ type: RaceEvent.RACE_OVER, results: [{ isPlayer: false }, { isPlayer: true, position: 2 }] }), 'Carrera terminada. Puesto 2º de 2.');
  assert.equal(describeEvent({ type: 'otro' }), null);
});
