import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLapTimer, tickLapTimer, completeLap } from '../../src/domain/lap-timer.js';

test('el reloj acumula tiempo de vuelta', () => {
  const t = tickLapTimer(tickLapTimer(createLapTimer(), 0.5), 0.25);
  assert.equal(t.current, 0.75);
  assert.equal(t.lap, 1);
});

test('completar una vuelta registra el tiempo y reinicia el reloj', () => {
  const { timer, completed } = completeLap({ ...createLapTimer(), current: 42 }, 10);
  assert.deepEqual(completed, { lap: 1, time: 42, isBest: true });
  assert.equal(timer.lap, 2);
  assert.equal(timer.current, 0);
  assert.equal(timer.best, 42);
  assert.equal(timer.last, 42);
});

test('una vuelta más corta que el mínimo no cuenta', () => {
  const start = { ...createLapTimer(), current: 3 };
  const { timer, completed } = completeLap(start, 10);
  assert.equal(completed, null);
  assert.equal(timer, start);
});

test('la mejor vuelta solo mejora', () => {
  const slower = completeLap({ ...createLapTimer(30), current: 40 }, 10);
  assert.equal(slower.timer.best, 30);
  assert.equal(slower.completed.isBest, false);
  const faster = completeLap({ ...createLapTimer(30), current: 25 }, 10);
  assert.equal(faster.timer.best, 25);
  assert.equal(faster.completed.isBest, true);
});
