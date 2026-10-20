import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRace, startCountdown, stepRace, pauseRace, resumeRace, RaceStatus, RaceEvent, playerOf, raceResults
} from '../../src/domain/race.js';
import { createControls } from '../../src/domain/controls.js';
import { smallWorld, testSpec } from '../helpers.js';

const world = smallWorld({ countdownSeconds: 3, finishGraceSeconds: 5 });
const { track, rules } = world;
const spec = testSpec();
const gas = createControls({ throttle: 1 });
const entries = count => Array.from({ length: count }, (_, i) => ({
  id: i, spec, model: 'cuna', livery: 'lima', name: i === 0 ? 'Vos' : `Rival ${i}`, isPlayer: i === 0, skill: 0.9
}));

const running = (race, patch = {}) => ({ ...race, status: RaceStatus.RUNNING, ...patch });
const withPlayer = (race, patch) => ({ ...race, cars: race.cars.map(c => (c.isPlayer ? { ...c, ...patch } : c)) });

function run(race, seconds, controls = gas, dt = 1 / 30) {
  const events = [];
  let current = race;
  for (let t = 0; t < seconds; t += dt) {
    const step = stepRace(current, controls, dt, world);
    current = step.race;
    events.push(...step.events);
  }
  return { race: current, events };
}

test('la grilla larga detrás de la línea, de a dos, en el orden recibido', () => {
  const race = createRace({ track, rules, entries: entries(4) });
  assert.equal(race.status, RaceStatus.READY);
  assert.deepEqual(race.cars.map(c => c.id), [0, 1, 2, 3]);
  for (const car of race.cars) {
    assert.ok(car.s > track.length - 40 && car.progress < 0, 'detrás de la línea');
  }
  assert.ok(race.cars[0].n * race.cars[1].n < 0, 'dos columnas');
  assert.equal(playerOf(race).id, 0);
  assert.equal(race.position, 1);
});

test('rechaza una carrera sin autos', () => {
  assert.throws(() => createRace({ track, rules, entries: [] }), /al menos un auto/);
});

test('la cuenta regresiva anuncia 3, 2, 1 y larga; los autos no se mueven antes', () => {
  let { race, events } = startCountdown(createRace({ track, rules, entries: entries(2) }));
  const seen = [...events];
  const before = race.cars.map(c => c.s);
  const result = run(race, 3.1, gas, 0.5);
  seen.push(...result.events);
  assert.deepEqual(seen.filter(e => e.type === RaceEvent.COUNTDOWN_TICK).map(e => e.value), [3, 2, 1]);
  assert.ok(seen.some(e => e.type === RaceEvent.STARTED));
  ({ race } = stepRace(startCountdown(createRace({ track, rules, entries: entries(2) })).race, gas, 1, world));
  assert.deepEqual(race.cars.map(c => c.s), before);
  assert.ok(playerOf(race).rpm > spec.idle, 'acelerar en la largada sube el régimen');
});

test('en carrera los autos avanzan y el reloj corre', () => {
  const race = running(createRace({ track, rules, entries: entries(3) }));
  const { race: after } = run(race, 2);
  assert.ok(after.clock > 1.9);
  for (const car of after.cars) assert.ok(car.progress > race.cars.find(c => c.id === car.id).progress + 5);
  assert.ok(after.timer.current > 1.9);
});

test('cruzar la línea completa la vuelta, guarda el tiempo y avisa la última', () => {
  const race = createRace({ track, rules, entries: entries(1), laps: 2 });
  const near = withPlayer(running(race, { clock: 40 }), { s: track.length - 1, progress: track.length - 1, u: 30, lapStart: 0 });
  const { race: after, events } = run(near, 0.3);
  const lap = events.find(e => e.type === RaceEvent.LAP_COMPLETED);
  assert.equal(lap.lap, 1);
  assert.ok(lap.time > 40 && lap.isBest);
  assert.ok(events.some(e => e.type === RaceEvent.FINAL_LAP));
  assert.equal(after.timer.lap, 2);
  assert.equal(playerOf(after).lastLap, lap.time);
});

test('al completar las vueltas el jugador llega y la carrera termina con resultados', () => {
  const race = createRace({ track, rules, entries: entries(2), laps: 1 });
  const near = withPlayer(running(race, { clock: 50 }), { s: track.length - 1, progress: track.length - 1, u: 30 });
  const { race: after, events } = run(near, 6);
  assert.ok(events.some(e => e.type === RaceEvent.FINISHED && e.player));
  const over = events.find(e => e.type === RaceEvent.RACE_OVER);
  assert.ok(over, 'la gracia de 5 s termina la carrera');
  assert.equal(after.status, RaceStatus.FINISHED);
  assert.equal(over.results[0].isPlayer, true);
  assert.equal(over.results[0].position, 1);
  assert.ok(over.results[1].time > over.results[0].time, 'al que no llegó se le estima un tiempo mayor');
  assert.equal(playerOf(after).autopilot, true, 'después de llegar maneja solo');
});

test('raceResults ordena a los que llegaron por tiempo', () => {
  const race = createRace({ track, rules, entries: entries(2), laps: 1 });
  const done = { ...race, clock: 80, cars: race.cars.map((c, i) => ({ ...c, finished: true, finishTime: i ? 70 : 75, progress: track.length })) };
  assert.deepEqual(raceResults(done, track).map(r => r.id), [1, 0]);
});

test('pasar a un rival avisa el cambio de puesto', () => {
  const race = createRace({ track, rules, entries: entries(2) });
  const behind = { ...running(race), position: 2, cars: [
    { ...race.cars[0], progress: 10, s: 10, u: 40 },
    { ...race.cars[1], progress: 12, s: 12, u: 0, n: 5 }
  ] };
  const { events } = run(behind, 0.5);
  const change = events.find(e => e.type === RaceEvent.POSITION_CHANGED);
  assert.equal(change.position, 1);
});

test('la pausa congela el mundo y se reanuda en el mismo estado', () => {
  const live = running(createRace({ track, rules, entries: entries(2) }));
  const paused = pauseRace(live);
  assert.equal(paused.race.status, RaceStatus.PAUSED);
  assert.deepEqual(stepRace(paused.race, gas, 1, world).race, paused.race);
  assert.equal(resumeRace(paused.race).race.status, RaceStatus.RUNNING);
});

test('la demostración larga corriendo, maneja sola y no termina', () => {
  const demo = createRace({ track, rules, entries: entries(3), demo: true });
  assert.equal(demo.status, RaceStatus.RUNNING);
  assert.ok(demo.cars.every(c => c.autopilot));
  const { race, events } = run(demo, 3);
  assert.ok(playerOf(race).progress > playerOf(demo).progress + 10);
  assert.ok(!events.some(e => e.type === RaceEvent.RACE_OVER));
});

test('un paso de tiempo nulo no cambia nada', () => {
  const race = running(createRace({ track, rules, entries: entries(1) }));
  assert.deepEqual(stepRace(race, gas, 0, world), { race, events: [] });
});

test('interpolar dibuja cada auto entre su paso anterior y el actual', async () => {
  const { interpolateRace } = await import('../../src/domain/race.js');
  let race = running(createRace({ track, rules, entries: entries(2), laps: 3 }));
  race = run(race, 2).race;
  const { race: next, previous } = stepRace(race, gas, rules.physicsStep, world);
  const half = interpolateRace(next, previous, 0.5, track);
  next.cars.forEach((car, i) => {
    const expected = previous[i].s + (car.s - previous[i].s) / 2;
    assert.ok(Math.abs(half.cars[i].s - expected) < 1e-9);
  });
  assert.equal(interpolateRace(next, previous, 1, track), next);
  const teleported = previous.map(c => ({ ...c, s: track.wrap(c.s + 60) }));
  assert.equal(interpolateRace(next, teleported, 0.5, track).cars[0].s, next.cars[0].s, 'no interpola un auto que reapareció lejos');
});
