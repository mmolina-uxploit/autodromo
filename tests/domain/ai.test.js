import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRacingLine, driveAi } from '../../src/domain/ai.js';
import { createCar, stepCar, CarEvent } from '../../src/domain/car.js';
import { smallWorld, testSpec, JUMP_LAYOUT } from '../helpers.js';

const spec = testSpec();

test('la línea de carrera queda dentro de la calzada', () => {
  const { rules, track } = smallWorld();
  const plan = planRacingLine(track, spec, rules);
  const limit = track.halfWidth - spec.halfWidth;
  for (const n of plan.offset) assert.ok(Math.abs(n) <= limit + 1e-9);
});

test('la velocidad objetivo baja en las curvas y sube en las rectas', () => {
  const { rules, track } = smallWorld();
  const plan = planRacingLine(track, spec, rules);
  const inTurn = Math.round((160 + 60) / track.segmentLength);
  assert.ok(plan.speed[inTurn] < Math.max(...plan.speed));
  assert.ok(Math.min(...plan.speed) > 10);
});

/** Un auto con piloto automático da vueltas sin ayuda humana. */
function autopilotLap(world, seconds) {
  const plan = planRacingLine(world.track, spec, world.rules);
  let car = createCar({ id: 1, spec, s: 2, skill: 1 });
  const h = world.rules.physicsStep;
  const events = [];
  let clock = 0;
  while (car.progress < world.track.length && clock < seconds) {
    const { controls, ai } = driveAi(car, { plan, track: world.track, spec, cars: [car], clock, h });
    const result = stepCar({ ...car, ai }, controls, spec, world.track, world.rules, h);
    car = result.car;
    events.push(...result.events);
    clock += h;
  }
  return { car, events, clock };
}

test('el piloto automático completa una vuelta sin chocar las defensas', () => {
  const { car, events, clock } = autopilotLap(smallWorld(), 90);
  assert.ok(car.progress >= car.progress && clock < 90, 'no terminó la vuelta');
  assert.equal(events.filter(e => e.type === CarEvent.WALL).length, 0);
});

test('el piloto automático cruza el foso sin caer', () => {
  const { events, clock } = autopilotLap(smallWorld({}, JUMP_LAYOUT), 90);
  assert.ok(clock < 90);
  assert.equal(events.filter(e => e.type === CarEvent.FELL).length, 0);
  assert.ok(events.some(e => e.type === CarEvent.LAND));
});

test('un rival lento adelante hace que el piloto busque un costado', () => {
  const { rules, track } = smallWorld();
  const plan = planRacingLine(track, spec, rules);
  const me = { ...createCar({ id: 1, spec, s: 10, n: plan.offset[3] }), u: 30 };
  const slow = { ...createCar({ id: 2, spec, s: 22, n: plan.offset[7] }), u: 5 };
  let state = me;
  for (let i = 0; i < 30; i++) state = { ...state, ai: driveAi(state, { plan, track, spec, cars: [state, slow], clock: 0, h: 1 / 60 }).ai };
  assert.ok(Math.abs(state.ai.avoid) > 0.5);
});
