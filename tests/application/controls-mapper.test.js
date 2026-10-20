import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Action, Axis, toControls } from '../../src/application/controls-mapper.js';

const set = (...a) => new Set(a);
/** Conjunto de acciones que además publica ejes continuos, como hace un mando. */
const withAxes = (axes, ...held) => Object.assign(new Set(held), { axis: name => axes[name] ?? 0 });

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

test('medio stick es medio giro: el eje continuo no se redondea', () => {
  assert.equal(toControls(withAxes({ [Axis.STEER]: 0.4 })).steer, 0.4);
  assert.equal(toControls(withAxes({ [Axis.STEER]: -0.75 })).steer, -0.75);
});

test('el eje manda sobre el botón del mismo canal', () => {
  // El stick pasado del umbral de botón también enciende la acción; vale el recorrido, no el tope.
  assert.equal(toControls(withAxes({ [Axis.STEER]: 0.82 }, Action.RIGHT)).steer, 0.82);
  assert.equal(toControls(withAxes({ [Axis.BRAKE]: 0.3 }, Action.BRAKE)).brake, 0.3);
});

test('con el eje en reposo decide el botón, para que la cruceta siga sirviendo', () => {
  assert.equal(toControls(withAxes({ [Axis.STEER]: 0 }, Action.LEFT)).steer, -1);
  assert.equal(toControls(withAxes({ [Axis.THROTTLE]: 0 }, Action.THROTTLE)).throttle, 1);
});

test('el gatillo de freno recorta el acelerador en proporción, no de golpe', () => {
  assert.equal(toControls(withAxes({ [Axis.THROTTLE]: 1, [Axis.BRAKE]: 0.25 })).throttle, 0.75);
  assert.equal(toControls(withAxes({ [Axis.THROTTLE]: 1, [Axis.BRAKE]: 1 })).throttle, 0);
});
