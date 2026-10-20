import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gamepadActions, gamepadAxes, createGamepadInput, GAMEPAD_MAP } from '../../src/infrastructure/input/gamepad.js';
import { createActionSet } from '../../src/application/action-set.js';
import { Action, Axis } from '../../src/application/controls-mapper.js';

const pad = ({ axes = [0, 0], pressed = [], values = {} } = {}) => ({
  connected: true,
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: pressed.includes(i),
    value: values[i] ?? (pressed.includes(i) ? 1 : 0)
  }))
});

test('el stick dirige con zona muerta y los gatillos aceleran y frenan', () => {
  assert.deepEqual([...gamepadActions(pad({ axes: [0.2, 0] }))], []);
  assert.ok(gamepadActions(pad({ axes: [-0.8, 0] })).has(Action.LEFT));
  assert.ok(gamepadActions(pad({ pressed: [GAMEPAD_MAP.RT] })).has(Action.THROTTLE));
  assert.ok(gamepadActions(pad({ pressed: [GAMEPAD_MAP.LT] })).has(Action.BRAKE));
});

test('los ejes conservan el recorrido del stick y de los gatillos', () => {
  assert.equal(gamepadAxes(pad({ axes: [0.04, 0] }))[Axis.STEER], 0, 'el reposo del stick descarta el ruido');
  const half = gamepadAxes(pad({ axes: [0.5, 0] }))[Axis.STEER];
  assert.ok(half > 0.2 && half < 0.5, `medio stick da un valor intermedio, dio ${half}`);
  assert.equal(gamepadAxes(pad({ axes: [1, 0] }))[Axis.STEER], 1, 'a fondo llega al tope');
  assert.equal(gamepadAxes(pad({ axes: [-1, 0] }))[Axis.STEER], -1);
  const soft = gamepadAxes(pad({ values: { [GAMEPAD_MAP.RT]: 0.4 } }))[Axis.THROTTLE];
  assert.ok(soft > 0.3 && soft < 0.4, `el gatillo a medias no se redondea, dio ${soft}`);
});

test('un mando sin ejes analógicos deja los tres en reposo', () => {
  const axes = gamepadAxes(pad({ pressed: [GAMEPAD_MAP.LEFT] }));
  assert.deepEqual([axes[Axis.STEER], axes[Axis.THROTTLE], axes[Axis.BRAKE]], [0, 0, 0]);
  assert.equal(gamepadAxes(null), null);
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

test('al soltar el mando los ejes vuelven al reposo aunque no hubiera botones', () => {
  const actions = createActionSet();
  let current = pad({ axes: [0.6, 0] });
  const input = createGamepadInput({
    actions, isGameActive: () => true, getPads: () => [current]
  });
  input.poll();
  assert.ok(actions.axis(Axis.STEER) > 0, 'el stick movido publica su eje');
  current = null;
  input.poll();
  assert.equal(actions.axis(Axis.STEER), null, 'sin mando no queda ningún eje publicado');
});
