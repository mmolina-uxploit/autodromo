import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCar, stepCar, CarEvent, Assist } from '../../src/domain/car.js';
import { createControls } from '../../src/domain/controls.js';
import { smallWorld, testSpec, JUMP_LAYOUT } from '../helpers.js';

const { rules, track } = smallWorld();
const spec = testSpec();
const h = rules.physicsStep;

/** Corre `seconds` con los mismos controles y junta los eventos. */
function drive(car, controls, seconds, world = { track, rules }, carSpec = spec) {
  const events = [];
  let current = car;
  for (let t = 0; t < seconds; t += h) {
    const result = stepCar(current, controls, carSpec, world.track, world.rules, h);
    current = result.car;
    events.push(...result.events);
  }
  return { car: current, events };
}

const fresh = (extra = {}) => ({ ...createCar({ id: 1, spec, s: 2, height: track.heightAt(2) }), ...extra });

test('acelerando en recta gana velocidad y avanza por la pista', () => {
  const { car } = drive(fresh(), createControls({ throttle: 1 }), 3);
  assert.ok(car.u > 15, `velocidad ${car.u}`);
  assert.ok(car.progress > 20);
  assert.ok(Math.abs(car.n) < 0.5, 'sin volante sigue derecho');
});

test('la caja sube de marcha al acelerar', () => {
  const { car, events } = drive(fresh(), createControls({ throttle: 1 }), 5);
  assert.ok(car.gear >= 2);
  assert.ok(events.some(e => e.type === CarEvent.SHIFT && e.up));
});

test('frenar detiene el auto sin pasar a marcha atrás de golpe', () => {
  const moving = drive(fresh(), createControls({ throttle: 1 }), 3).car;
  const { car } = drive(moving, createControls({ brake: 1 }), 2.2);
  assert.ok(Math.abs(car.u) < 1);
});

test('con el freno sostenido y el auto quieto, entra la marcha atrás', () => {
  const { car } = drive(fresh(), createControls({ brake: 1 }), 2);
  assert.ok(car.u < -0.5);
  assert.ok(car.reversing);
});

test('girar a la derecha lleva el auto a la derecha del eje', () => {
  const moving = drive(fresh(), createControls({ throttle: 0.6 }), 2).car;
  const { car } = drive(moving, createControls({ throttle: 0.6, steer: 1 }), 0.8);
  assert.ok(car.n > moving.n + 0.5);
  assert.ok(car.psi > 0);
});

test('el propulsor de salto despega, gasta energía y avisa', () => {
  const moving = drive(fresh(), createControls({ throttle: 1 }), 1).car;
  const { car, events } = drive(moving, createControls({ throttle: 1, jump: true }), 0.2);
  assert.ok(car.airborne);
  assert.ok(car.z > track.heightAt(car.s));
  assert.ok(car.energy < moving.energy);
  assert.ok(events.some(e => e.type === CarEvent.THRUST_JUMP));
});

test('sin energía no hay salto', () => {
  const { car } = drive(fresh({ energy: 0 }), createControls({ throttle: 1, jump: true }), 0.3);
  assert.ok(!car.airborne);
});

test('el planeo sostiene la caída pero no hace trepar', () => {
  const launched = drive(fresh(), createControls({ jump: true }), 0.02).car;
  const { car } = drive(launched, createControls({ jump: true }), 0.4);
  assert.ok(!car.lifting || car.vz < 1.5);
});

test('después de un salto aterriza y avisa el impacto', () => {
  const moving = drive(fresh(), createControls({ throttle: 1 }), 1).car;
  const jumped = drive(moving, createControls({ throttle: 1, jump: true }), 0.05).car;
  const { car, events } = drive(jumped, createControls({ throttle: 1 }), 3);
  assert.ok(!car.airborne);
  const land = events.find(e => e.type === CarEvent.LAND);
  assert.ok(land && land.airTime > 0.5);
});

test('el empuje acelera más y gasta energía', () => {
  const plain = drive(fresh(), createControls({ throttle: 1 }), 2).car;
  const boosted = drive(fresh(), createControls({ throttle: 1, boost: true }), 2).car;
  assert.ok(boosted.u > plain.u);
  assert.ok(boosted.energy < plain.energy);
});

test('la defensa contiene al auto y avisa el golpe', () => {
  const fast = drive(fresh(), createControls({ throttle: 1 }), 3).car;
  const { car, events } = drive(fast, createControls({ throttle: 1, steer: 1 }), 3);
  assert.ok(Math.abs(car.n) <= track.barrier + 1e-6);
  assert.ok(events.some(e => e.type === CarEvent.WALL));
});

test('al frenar fuerte la trompa se hunde (cabeceo negativo)', () => {
  const moving = drive(fresh(), createControls({ throttle: 1 }), 3).car;
  const { car } = drive(moving, createControls({ brake: 1 }), 0.4);
  assert.ok(car.susp.pitch < 0);
});

test('en el aire la suspensión se estira y al aterrizar se comprime', () => {
  const moving = drive(fresh(), createControls({ throttle: 1 }), 1).car;
  const air = drive(moving, createControls({ throttle: 1, jump: true }), 0.4).car;
  assert.ok(air.susp.heave > 0);
  let current = air;
  let minHeave = Infinity;
  for (let t = 0; t < 3 && (current.airborne || minHeave === Infinity || t < 1.5); t += h) {
    current = stepCar(current, createControls({ throttle: 1 }), spec, track, rules, h).car;
    if (!current.airborne) minHeave = Math.min(minHeave, current.susp.heave);
  }
  assert.ok(minHeave < 0, `compresión ${minHeave}`);
});

test('caer al foso reubica el auto antes de la rampa, sin choques por un rato', () => {
  const world = smallWorld({}, JUMP_LAYOUT);
  const [jump] = world.track.jumps;
  const s = jump.gapStart + 2;
  const over = { ...createCar({ id: 1, spec, s, height: world.track.heightAt(jump.lip - 1) }), airborne: true, u: 3 };
  const { car, events } = drive(over, createControls(), 3, world);
  assert.ok(events.some(e => e.type === CarEvent.FELL));
  assert.ok(car.s < jump.rampStart);
  assert.ok(car.progress < s);
});

test('la ayuda completa limita el derrape más que sin ayudas', () => {
  const slide = assist => {
    const moving = drive({ ...fresh(), assist }, createControls({ throttle: 1 }), 3).car;
    let worst = 0;
    let car = moving;
    for (let t = 0; t < 1.5; t += h) {
      car = stepCar(car, createControls({ throttle: 1, steer: 1 }), spec, track, rules, h).car;
      worst = Math.max(worst, Math.abs(car.v));
    }
    return worst;
  };
  assert.ok(slide(Assist.FULL) <= slide(Assist.NONE) + 1e-9);
});

test('el paso es puro: no muta el auto recibido', () => {
  const car = Object.freeze(fresh());
  const result = stepCar(car, createControls({ throttle: 1 }), spec, track, rules, h);
  assert.notEqual(result.car, car);
  assert.equal(car.u, 0);
});

test('los pedales tienen recorrido: la fuerza llega en unas centésimas, no en un paso', () => {
  const first = stepCar(fresh(), createControls({ throttle: 1 }), spec, track, rules, h).car;
  assert.ok(first.throttle > 0 && first.throttle < 0.1, `acelerador tras un paso: ${first.throttle}`);
  const later = drive(fresh(), createControls({ throttle: 1 }), 0.2).car;
  assert.equal(later.throttle, 1);
  const braking = drive(later, createControls({ brake: 1 }), 0.05).car;
  assert.ok(braking.brake > 0.3 && braking.brake < 1, `freno a los 50 ms: ${braking.brake}`);
});

test('el volante acelera y frena su giro: no salta de golpe al ángulo pedido', () => {
  const moving = drive(fresh(), createControls({ throttle: 1 }), 1).car;
  const one = stepCar(moving, createControls({ throttle: 1, steer: 1 }), spec, track, rules, h).car;
  const two = stepCar(one, createControls({ throttle: 1, steer: 1 }), spec, track, rules, h).car;
  assert.ok(one.steer > 0 && two.steer - one.steer > one.steer, 'el giro del volante se acelera');
  const settled = drive(two, createControls({ throttle: 1, steer: 1 }), 1).car;
  const limit = spec.steerMax / (1 + Math.abs(settled.u) / 22);
  assert.ok(Math.abs(settled.steer - limit) < 0.02, 'termina en el ángulo pedido');
});

test('con la energía vacía el empuje se traba en vez de parpadear', () => {
  const empty = fresh({ energy: 0.002, u: 20 });
  let car = empty;
  let switches = 0;
  for (let t = 0; t < 1; t += h) {
    const next = stepCar(car, createControls({ throttle: 1, boost: true }), spec, track, rules, h).car;
    if (next.boosting !== car.boosting) switches++;
    car = next;
  }
  assert.ok(switches <= 2, `cambios de empuje: ${switches}`);
  assert.equal(car.boostLock, true);
});

test('el empuje enciende con rampa', () => {
  const one = stepCar(fresh({ u: 10 }), createControls({ throttle: 1, boost: true }), spec, track, rules, h).car;
  assert.ok(one.boostLevel > 0 && one.boostLevel < 0.1);
  const full = drive(one, createControls({ throttle: 1, boost: true }), 0.3).car;
  assert.equal(full.boostLevel, 1);
});

test('frenar derecho no cruza el auto, ni sin ayudas', () => {
  for (const brake of [0.5, 1]) {
    const start = fresh({ u: 40, r: 0.03, assist: Assist.NONE });
    let car = start;
    let worst = 0;
    for (let t = 0; t < 2; t += h) {
      car = stepCar(car, createControls({ brake }), spec, track, rules, h).car;
      worst = Math.max(worst, Math.abs(car.psi));
    }
    assert.ok(worst < 0.1, `freno ${brake}: guiñada máxima ${worst.toFixed(3)}`);
    assert.ok(car.u < 40 - 8 * brake, `y frena de verdad: ${car.u.toFixed(1)} m/s`);
  }
});
