import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameLoop } from '../../src/infrastructure/game-loop.js';

function fakeFrames() {
  let queue = [];
  let id = 0;
  return {
    requestFrame: cb => { queue.push({ id: ++id, cb }); return id; },
    cancelFrame: h => { queue = queue.filter(f => f.id !== h); },
    flush(now) { const current = queue; queue = []; current.forEach(f => f.cb(now)); },
    get pending() { return queue.length; }
  };
}

test('entrega el tiempo transcurrido en segundos, con tope', () => {
  const frames = fakeFrames();
  const steps = [];
  const loop = createGameLoop({ onFrame: dt => steps.push(dt), ...frames, maxStep: 0.05 });
  loop.start();
  frames.flush(1000);
  frames.flush(1016);
  frames.flush(2000);
  assert.deepEqual(steps.map(s => +s.toFixed(3)), [0, 0.016, 0.05]);
});

test('stop detiene el ciclo y start no duplica', () => {
  const frames = fakeFrames();
  const loop = createGameLoop({ onFrame() {}, ...frames });
  loop.start();
  loop.start();
  assert.equal(frames.pending, 1);
  loop.stop();
  assert.equal(frames.pending, 0);
  assert.equal(loop.running, false);
});

test('el ruido de las marcas de tiempo no llega a la física; un cuadro perdido sí', () => {
  const frames = fakeFrames();
  const steps = [];
  const loop = createGameLoop({ onFrame: dt => steps.push(dt), ...frames });
  loop.start();
  let now = 1000;
  frames.flush(now);
  for (let i = 0; i < 120; i++) {
    now += 1000 / 60 + (i % 2 ? 0.6 : -0.6);
    frames.flush(now);
  }
  const tail = steps.slice(-30);
  const spread = Math.max(...tail) - Math.min(...tail);
  assert.ok(spread < 0.0001, `cuadros parejos: varían ${(spread * 1000).toFixed(3)} ms en vez de 1,2 ms`);
  assert.ok(Math.abs(tail[0] - 1 / 60) < 0.0005);
  now += 2000 / 60;
  frames.flush(now);
  assert.ok(Math.abs(steps.at(-1) - 2 / 60) < 0.001, 'el cuadro perdido conserva su duración');
});

test('la calidad automática baja un nivel si los cuadros no llegan, y no oscila', async () => {
  const { createQualityGovernor } = await import('../../src/infrastructure/quality.js');
  const changes = [];
  const fast = createQualityGovernor({ onChange: level => changes.push(level) });
  for (let i = 0; i < 600; i++) fast.sample(1 / 60);
  assert.equal(fast.level, 2, 'a 60 cuadros por segundo no cambia');
  const slow = createQualityGovernor({ onChange: level => changes.push(level) });
  for (let i = 0; i < 200; i++) slow.sample(1 / 30);
  assert.equal(slow.level, 1, 'a 30 cuadros por segundo baja el resplandor');
  for (let i = 0; i < 600; i++) slow.sample(1 / 60);
  assert.equal(slow.level, 1, 'y no vuelve a subir sola');
  assert.deepEqual(changes, [1]);
});
