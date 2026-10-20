import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/domain/rng.js';

test('la misma semilla produce la misma secuencia', () => {
  const a = createRng(42);
  const b = createRng(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('los valores quedan en [0, 1)', () => {
  const next = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = next();
    assert.ok(v >= 0 && v < 1);
  }
});
