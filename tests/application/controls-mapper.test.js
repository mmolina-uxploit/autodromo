import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Action, toControls } from '../../src/application/controls-mapper.js';

const set = (...a) => new Set(a);

test('las acciones se traducen en controles', () => {
  assert.deepEqual({ ...toControls(set(Action.LEFT, Action.THROTTLE)) }, { steer: -1, throttle: 1, brake: 0, jump: false, boost: false });
  assert.deepEqual({ ...toControls(set(Action.RIGHT, Action.BRAKE)) }, { steer: 1, throttle: 0, brake: 1, jump: false, boost: false });
});

test('salto y empuje se sostienen junto con el resto', () => {
  const controls = toControls(set(Action.THROTTLE, Action.JUMP, Action.BOOST));
  assert.deepEqual([controls.throttle, controls.jump, controls.boost], [1, true, true]);
});

test('izquierda y derecha juntas se anulan', () => {
  assert.equal(toControls(set(Action.LEFT, Action.RIGHT)).steer, 0);
});

test('la aceleración automática acelera salvo al frenar', () => {
  assert.equal(toControls(set(), { autoThrottle: true }).throttle, 1);
  assert.equal(toControls(set(Action.BRAKE), { autoThrottle: true }).throttle, 0);
});
