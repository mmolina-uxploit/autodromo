import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRaceSession, bestLapKey } from '../../src/application/race-session.js';
import { Action } from '../../src/application/controls-mapper.js';
import { RaceStatus, RaceEvent, SessionEvent } from '../../src/application/race-events.js';
import { createRace } from '../../src/domain/race.js';
import { createRng } from '../../src/domain/rng.js';
import { Track } from '../../src/domain/track.js';
import { createRules } from '../../src/config/rules.js';
import { SMALL_LAYOUT, JUMP_LAYOUT, TRACK_OPTIONS, testSpec } from '../helpers.js';

const rules = createRules({ countdownSeconds: 1, finishGraceSeconds: 1 });
const tracks = new Map([
  ['corta', Track.fromLayout(SMALL_LAYOUT, TRACK_OPTIONS)],
  ['salto', Track.fromLayout(JUMP_LAYOUT, TRACK_OPTIONS)]
]);
const vehicles = [
  { id: 'agil', model: 'saeta', liveries: [{ id: 'a' }, { id: 'b' }] },
  { id: 'pesado', model: 'bloque', liveries: [{ id: 'c' }] }
];
const specs = new Map([['agil', testSpec({}, 'agil')], ['pesado', testSpec({ mass: 1900, durability: 0.9 }, 'pesado')]]);
const difficulties = [
  { id: 'facil', skill: [0.8, 0.85], assist: 'completa', grid: 0 },
  { id: 'leyenda', skill: [1, 1.04], assist: 'ninguna', grid: 1 }
];

function makeSession({ settings = {}, records = {}, raceFactory } = {}) {
  const store = new Map(Object.entries(records));
  const pulses = [];
  let current = { track: 'corta', vehicle: 'agil', livery: 'a', laps: 2, difficulty: 'facil', rivals: 3, autoThrottle: false, vibration: true, ...settings };
  const session = createRaceSession({
    tracks, vehicles, specs, difficulties, rivalNames: ['Cometa', 'Turbina', 'Ráfaga'], rules,
    createRng: () => createRng(1),
    bestLapRepository: { load: key => store.get(key) ?? null, save: (key, t) => store.set(key, t) },
    haptics: { pulse: ms => pulses.push(ms) },
    getSettings: () => current,
    raceFactory
  });
  return { session, store, pulses, select: patch => { current = { ...current, ...patch }; } };
}

const run = (session, seconds, actions = new Set()) => {
  const events = [];
  for (let t = 0; t < seconds; t += 0.05) events.push(...session.tick(0.05, actions).events);
  return events;
};

test('arma el mundo y la grilla con el auto, las vueltas y los rivales elegidos', () => {
  const { session } = makeSession({ settings: { track: 'salto', vehicle: 'pesado', livery: 'c', rivals: 3 } });
  assert.equal(session.world.track, tracks.get('salto'));
  assert.equal(session.world.vehicleId, 'pesado');
  assert.equal(session.state.cars.length, 4);
  assert.equal(session.state.laps, 2);
  const player = session.state.cars.find(c => c.isPlayer);
  assert.equal(player.model, 'bloque');
  assert.ok(session.state.cars.filter(c => !c.isPlayer).every(c => !(c.model === 'bloque' && c.livery === 'c')), 'ningún rival es idéntico al jugador');
});

test('la dificultad define el ritmo de los rivales, las ayudas y el lugar de largada', () => {
  const easy = makeSession().session.state;
  assert.equal(easy.cars[0].isPlayer, true, 'en fácil larga adelante');
  assert.ok(easy.cars.filter(c => !c.isPlayer).every(c => c.skill <= 0.85));
  const legend = makeSession({ settings: { difficulty: 'leyenda' } }).session.state;
  assert.equal(legend.cars.at(-1).isPlayer, true, 'en leyenda larga último');
  assert.equal(legend.cars.at(-1).assist, 0);
});

test('una selección desconocida cae en la primera pista y el primer auto', () => {
  const { session } = makeSession({ settings: { track: 'nada', vehicle: 'nadie' } });
  assert.deepEqual([session.world.trackId, session.world.vehicleId], ['corta', 'agil']);
});

test('la demostración corre sola, sin eventos para la interfaz', () => {
  const { session } = makeSession();
  const seen = [];
  session.subscribe(e => seen.push(e.type));
  session.startDemo();
  assert.ok(session.isDemo);
  assert.equal(session.state.status, RaceStatus.RUNNING);
  run(session, 1);
  assert.ok(seen.every(type => type === SessionEvent.WORLD_CHANGED));
});

test('start desde la demostración arma la carrera real y pasa por la cuenta regresiva', () => {
  const { session } = makeSession();
  session.startDemo();
  const seen = [];
  session.subscribe(e => seen.push(e.type));
  session.start();
  assert.ok(!session.isDemo);
  run(session, 1.2);
  assert.equal(session.state.status, RaceStatus.RUNNING);
  assert.deepEqual(seen.filter(t => t !== RaceEvent.POSITION_CHANGED).slice(0, 2), [RaceEvent.COUNTDOWN_TICK, RaceEvent.STARTED]);
});

test('la mejor vuelta se guarda por combinación de pista y auto', () => {
  const raceFactory = args => {
    const race = createRace(args);
    if (race.demo) return race;
    const L = args.track.length;
    return { ...race, cars: race.cars.map(c => (c.isPlayer ? { ...c, s: L - 1, progress: L - 1, u: 25 } : c)) };
  };
  const { session, store } = makeSession({ records: { [bestLapKey('corta', 'pesado')]: 50 }, raceFactory });
  session.start();
  run(session, 1.5, new Set([Action.THROTTLE]));
  assert.ok(store.get(bestLapKey('corta', 'agil')) > 0);
  assert.equal(store.get(bestLapKey('corta', 'pesado')), 50);
});

test('bestLapFor consulta cualquier combinación', () => {
  const { session } = makeSession({ records: { [bestLapKey('salto', 'pesado')]: 71.5 } });
  assert.equal(session.bestLapFor('salto', 'pesado'), 71.5);
  assert.equal(session.bestLapFor('salto', 'agil'), null);
});

test('syncSelection reconstruye antes de largar y avisa si cambió la pista', () => {
  const { session, select } = makeSession();
  const seen = [];
  session.subscribe(e => seen.push(e.type));
  select({ track: 'salto' });
  session.syncSelection();
  assert.equal(session.world.trackId, 'salto');
  assert.deepEqual(seen, [SessionEvent.WORLD_CHANGED]);
  select({ rivals: 0 });
  session.syncSelection();
  assert.equal(session.state.cars.length, 1);
});

test('durante la carrera la selección no cambia el mundo', () => {
  const { session, select } = makeSession();
  session.start();
  select({ vehicle: 'pesado' });
  session.syncSelection();
  assert.equal(session.world.vehicleId, 'agil');
});

test('un choque del jugador vibra solo si la vibración está activa', () => {
  for (const vibration of [true, false]) {
    const raceFactory = args => {
      const race = createRace(args);
      if (race.demo) return race;
      const [player, rival] = race.cars.filter(c => c.isPlayer).concat(race.cars.filter(c => !c.isPlayer));
      const placed = race.cars.map(c => (c.id === player.id ? { ...c, s: 20, progress: 20, n: 0, u: 40 }
        : c.id === rival.id ? { ...c, s: 23, progress: 23, n: 0, u: 5 } : { ...c, s: 300, progress: 300 }));
      return { ...race, cars: placed };
    };
    const { session, pulses } = makeSession({ settings: { vibration }, raceFactory });
    session.start();
    const events = run(session, 1.3, new Set([Action.THROTTLE]));
    assert.ok(events.some(e => e.type === RaceEvent.COLLISION && e.player));
    assert.equal(pulses.length > 0, vibration);
  }
});

test('togglePause alterna entre pausa y carrera', () => {
  const { session } = makeSession();
  session.start();
  run(session, 1.2);
  session.togglePause();
  assert.equal(session.state.status, RaceStatus.PAUSED);
  session.togglePause();
  assert.equal(session.state.status, RaceStatus.RUNNING);
});

test('tick devuelve los controles aplicados', () => {
  const { session } = makeSession({ settings: { autoThrottle: true } });
  session.start();
  const { controls } = session.tick(0.05, new Set([Action.LEFT, Action.JUMP]));
  assert.deepEqual([controls.steer, controls.throttle, controls.jump], [-1, 1, true]);
});

test('la física avanza a paso fijo y el estado dibujado se interpola entre pasos', () => {
  const { session } = makeSession();
  session.start();
  run(session, 1.5, new Set([Action.THROTTLE]));
  const before = session.state.cars.find(c => c.isPlayer).s;
  const { state } = session.tick(rules.physicsStep / 2, new Set([Action.THROTTLE]));
  assert.equal(session.state.cars.find(c => c.isPlayer).s, before, 'medio paso no mueve la física');
  const drawn = state.cars.find(c => c.isPlayer).s;
  assert.ok(drawn < before, 'se dibuja entre el paso anterior y el actual');
  session.tick(rules.physicsStep / 2, new Set([Action.THROTTLE]));
  assert.ok(session.state.cars.find(c => c.isPlayer).s > before, 'el otro medio completa el paso');
});
