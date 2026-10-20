import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveContacts } from '../../src/domain/collision.js';
import { createCar } from '../../src/domain/car.js';
import { smallWorld, testSpec } from '../helpers.js';

const { rules, track } = smallWorld();
const spec = testSpec();
const specOf = () => spec;
const car = (id, s, n, u, extra = {}) => ({ ...createCar({ id, spec, s, n }), u, ...extra });

test('un auto que alcanza a otro lo empuja y pierde velocidad', () => {
  const back = car(1, 10, 0, 40);
  const front = car(2, 13, 0, 20);
  const { cars, events } = resolveContacts([back, front], specOf, track, rules);
  assert.ok(cars[0].u < 40 && cars[1].u > 20);
  assert.ok(cars[1].s - cars[0].s >= 3, 'quedan separados');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'car');
});

test('un toque lateral los separa de costado', () => {
  const left = car(1, 10, -0.5, 30, { v: 3 });
  const right = car(2, 10.5, 0.8, 30);
  const { cars } = resolveContacts([left, right], specOf, track, rules);
  assert.ok(cars[1].n - cars[0].n > 1.3);
});

test('un auto en el aire pasa por encima sin chocar', () => {
  const ground = car(1, 10, 0, 20);
  const flying = car(2, 11, 0, 30, { z: 3 });
  const { cars, events } = resolveContacts([ground, flying], specOf, track, rules);
  assert.deepEqual(events, []);
  assert.equal(cars[0].u, 20);
});

test('un auto recién reubicado atraviesa a los demás', () => {
  const { events } = resolveContacts([car(1, 10, 0, 20, { ghost: 1 }), car(2, 11, 0, 30)], specOf, track, rules);
  assert.deepEqual(events, []);
});

test('el choque funciona a través de la línea de largada', () => {
  const back = car(1, track.length - 2, 0, 40);
  const front = car(2, 1, 0, 10);
  const { events } = resolveContacts([back, front], specOf, track, rules);
  assert.equal(events.length, 1);
});
