import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gamepadActions, createGamepadInput, GAMEPAD_MAP } from '../../src/infrastructure/input/gamepad.js';
import { createActionSet } from '../../src/application/action-set.js';
import { Action } from '../../src/application/controls-mapper.js';

const pad = ({ axes = [0, 0], pressed = [] } = {}) => ({
  connected: true,
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }))
});

test('el stick dirige con zona muerta y los gatillos aceleran y frenan', () => {
  assert.deepEqual([...gamepadActions(pad({ axes: [0.2, 0] }))], []);
  assert.ok(gamepadActions(pad({ axes: [-0.8, 0] })).has(Action.LEFT));
  assert.ok(gamepadActions(pad({ pressed: [GAMEPAD_MAP.RT] })).has(Action.THROTTLE));
  assert.ok(gamepadActions(pad({ pressed: [GAMEPAD_MAP.LT] })).has(Action.BRAKE));
});

test('A salta y X o RB empujan', () => {
  assert.ok(gamepadActions(pad({ pressed: [GAMEPAD_MAP.A] })).has(Action.JUMP));
  assert.ok(gamepadActions(pad({ pressed: [GAMEPAD_MAP.X] })).has(Action.BOOST));
  assert.ok(gamepadActions(pad({ pressed: [GAMEPAD_MAP.RB] })).has(Action.BOOST));
});

test('en carrera sostiene acciones; en menú manda botones de navegación', () => {
  const actions = createActionSet();
  let current = pad({ pressed: [GAMEPAD_MAP.RT] });
  let active = true;
  const menu = [];
  const input = createGamepadInput({ actions, isGameActive: () => active, onMenu: b => menu.push(b), getPads: () => [current] });
  input.poll();
  assert.ok(actions.has(Action.THROTTLE));
  current = pad();
  input.poll();
  assert.ok(!actions.has(Action.THROTTLE));
  active = false;
  current = pad({ pressed: [GAMEPAD_MAP.DOWN] });
  input.poll();
  assert.deepEqual(menu, ['DOWN']);
  assert.ok(!actions.has(Action.BRAKE), 'en el menú no maneja');
});
