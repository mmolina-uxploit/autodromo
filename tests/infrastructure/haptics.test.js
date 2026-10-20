import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHaptics } from '../../src/infrastructure/haptics.js';

test('vibra cuando el dispositivo lo permite', () => {
  const calls = [];
  createHaptics({ vibrate: ms => calls.push(ms) }).pulse(40);
  assert.deepEqual(calls, [40]);
});

test('sin soporte de vibración no falla', () => {
  assert.doesNotThrow(() => createHaptics({}).pulse(40));
  assert.doesNotThrow(() => createHaptics(undefined).pulse(40));
});
