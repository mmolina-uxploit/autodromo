import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyToAction, keyToCommand, bindKeyboard, Command } from '../../src/infrastructure/input/keyboard.js';
import { createActionSet } from '../../src/application/action-set.js';
import { Action } from '../../src/application/controls-mapper.js';

const key = (type, props) => Object.assign(new Event(type, { cancelable: true }), props);

test('flechas y WASD se traducen en acciones de manejo', () => {
  assert.equal(keyToAction({ key: 'ArrowLeft', code: 'ArrowLeft' }), Action.LEFT);
  assert.equal(keyToAction({ key: 'q', code: 'KeyA' }), Action.LEFT);
  assert.equal(keyToAction({ key: 'w', code: 'KeyW' }), Action.THROTTLE);
  assert.equal(keyToAction({ key: 'ArrowDown', code: 'ArrowDown' }), Action.BRAKE);
  assert.equal(keyToAction({ key: 'x', code: 'KeyX' }), null);
});

test('Espacio salta con el propulsor y Shift empuja', () => {
  assert.equal(keyToAction({ key: ' ', code: 'Space' }), Action.JUMP);
  assert.equal(keyToAction({ key: 'j', code: 'KeyJ' }), Action.JUMP);
  assert.equal(keyToAction({ key: 'Shift', code: 'ShiftLeft' }), Action.BOOST);
  assert.equal(keyToAction({ key: 'Shift', code: 'ShiftRight' }), Action.BOOST);
});

test('la posición física de WASD vale en cualquier distribución de teclado', () => {
  assert.equal(keyToAction({ key: 'z', code: 'KeyW' }), Action.THROTTLE);
});

test('Escape y P pausan', () => {
  assert.equal(keyToCommand({ key: 'Escape', code: 'Escape' }), Command.PAUSE);
  assert.equal(keyToCommand({ key: 'p', code: 'KeyP' }), Command.PAUSE);
  assert.equal(keyToCommand({ key: 'Enter', code: 'Enter' }), null);
});

test('bindKeyboard sostiene acciones solo con el juego activo', () => {
  const target = new EventTarget();
  const actions = createActionSet();
  let active = true;
  const commands = [];
  const unbind = bindKeyboard(target, { actions, onCommand: c => commands.push(c), isGameActive: () => active });

  const down = key('keydown', { key: 'ArrowUp', code: 'ArrowUp' });
  target.dispatchEvent(down);
  assert.ok(actions.has(Action.THROTTLE));
  assert.ok(down.defaultPrevented);

  target.dispatchEvent(key('keyup', { key: 'ArrowUp', code: 'ArrowUp' }));
  assert.ok(!actions.has(Action.THROTTLE));

  active = false;
  target.dispatchEvent(key('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));
  target.dispatchEvent(key('keydown', { key: 'Escape', code: 'Escape' }));
  assert.ok(!actions.has(Action.THROTTLE));
  assert.deepEqual(commands, []);

  active = true;
  target.dispatchEvent(key('keydown', { key: 'Escape', code: 'Escape' }));
  assert.deepEqual(commands, [Command.PAUSE]);
  unbind();
});
