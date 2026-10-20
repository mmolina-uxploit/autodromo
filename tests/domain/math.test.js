import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, lerp, easeIn, easeInOut, wrap, signedWrap } from '../../src/domain/math.js';

test('clamp limita el valor al rango', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

test('lerp interpola linealmente', () => {
  assert.equal(lerp(10, 20, 0.25), 12.5);
});

test('easeIn y easeInOut parten y llegan a los extremos', () => {
  assert.equal(easeIn(0, 8, 0), 0);
  assert.equal(easeIn(0, 8, 1), 8);
  assert.equal(easeInOut(2, 6, 0), 2);
  assert.ok(Math.abs(easeInOut(2, 6, 1) - 6) < 1e-12);
  assert.ok(Math.abs(easeInOut(2, 6, 0.5) - 4) < 1e-12);
});

test('wrap devuelve siempre un valor dentro de [0, largo)', () => {
  assert.equal(wrap(12, 10), 2);
  assert.equal(wrap(-3, 10), 7);
  assert.equal(wrap(10, 10), 0);
});

test('signedWrap elige el camino más corto en un circuito cerrado', () => {
  assert.equal(signedWrap(9, 10), -1);
  assert.equal(signedWrap(-9, 10), 1);
  assert.equal(signedWrap(3, 10), 3);
});
