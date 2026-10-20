import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindHoldControl } from '../../src/infrastructure/input/touch.js';

const pointer = (type, pointerId) => Object.assign(new Event(type, { cancelable: true }), { pointerId });

test('mantener presionado activa y soltar libera, con varios dedos', () => {
  const el = new EventTarget();
  const log = [];
  bindHoldControl(el, { onPress: () => log.push('press'), onRelease: () => log.push('release') });
  el.dispatchEvent(pointer('pointerdown', 1));
  el.dispatchEvent(pointer('pointerdown', 2));
  el.dispatchEvent(pointer('pointerup', 1));
  assert.deepEqual(log, ['press']);
  el.dispatchEvent(pointer('pointercancel', 2));
  assert.deepEqual(log, ['press', 'release']);
});

test('el menú contextual queda bloqueado sobre el control', () => {
  const el = new EventTarget();
  bindHoldControl(el, { onPress() {}, onRelease() {} });
  const e = new Event('contextmenu', { cancelable: true });
  el.dispatchEvent(e);
  assert.ok(e.defaultPrevented);
});

test('si el navegador rechaza la captura del puntero, el control sigue funcionando', () => {
  const el = new EventTarget();
  el.setPointerCapture = () => { throw new DOMException('No active pointer', 'NotFoundError'); };
  const log = [];
  bindHoldControl(el, { onPress: () => log.push('press'), onRelease: () => log.push('release') });
  assert.doesNotThrow(() => el.dispatchEvent(pointer('pointerdown', 9)));
  el.dispatchEvent(pointer('pointerup', 9));
  assert.deepEqual(log, ['press', 'release']);
});
