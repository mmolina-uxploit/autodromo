import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActionSet } from '../../src/application/action-set.js';

test('una acción sigue activa mientras alguna fuente la sostenga', () => {
  const actions = createActionSet();
  actions.press('left', 'keyboard');
  actions.press('left', 'touch');
  actions.release('left', 'keyboard');
  assert.ok(actions.has('left'));
  actions.release('left', 'touch');
  assert.ok(!actions.has('left'));
});

test('releaseSource suelta solo lo que sostenía esa fuente', () => {
  const actions = createActionSet();
  actions.press('left', 'keyboard');
  actions.press('brake', 'touch');
  actions.releaseSource('keyboard');
  assert.deepEqual([...actions.snapshot()], ['brake']);
});

test('snapshot es una copia que no cambia después', () => {
  const actions = createActionSet();
  actions.press('throttle', 'keyboard');
  const before = actions.snapshot();
  actions.releaseAll();
  assert.ok(before.has('throttle'));
  assert.equal(actions.snapshot().size, 0);
});
