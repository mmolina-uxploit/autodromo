import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, createViewport, projectPoint, fogAt, spriteScale } from '../../src/infrastructure/rendering/projection.js';

test('la cámara conserva altura, distancia y alcance', () => {
  const camera = createCamera({ height: 2.5, distance: 6, drawDistance: 200, fogDensity: 4 });
  assert.deepEqual({ ...camera }, { height: 2.5, distance: 6, drawDistance: 200, fogDensity: 4 });
});

test('la distancia focal se adapta a pantallas anchas y angostas', () => {
  const wide = createViewport(1600, 900, { horizonRatio: 0.4, focalHeight: 0.7, focalWidth: 0.95 });
  assert.equal(wide.horizon, 360);
  assert.equal(wide.focal, 630);
  const tall = createViewport(400, 900, { horizonRatio: 0.4, focalHeight: 0.7, focalWidth: 0.95 });
  assert.equal(tall.focal, 380);
});

test('un punto a la altura de la cámara cae en el horizonte central', () => {
  const vp = createViewport(1000, 600);
  const out = projectPoint({}, 0, 0, 20, vp);
  assert.equal(out.x, 500);
  assert.equal(out.y, vp.horizon);
});

test('un metro a la derecha se ve más chico cuanto más lejos', () => {
  const vp = createViewport(1000, 600);
  const near = projectPoint({}, 1, 0, 5, vp);
  const far = projectPoint({}, 1, 0, 50, vp);
  assert.ok(near.x - 500 > far.x - 500);
  assert.ok(Math.abs(near.scale - vp.focal / 5) < 1e-9);
});

test('el piso por debajo de la cámara se proyecta bajo el horizonte', () => {
  const vp = createViewport(1000, 600);
  assert.ok(projectPoint({}, 0, -2.5, 10, vp).y > vp.horizon);
});

test('la niebla crece con la distancia', () => {
  assert.equal(fogAt(0, 100, 4), 0);
  assert.ok(fogAt(50, 100, 4) < fogAt(90, 100, 4));
});

test('spriteScale lleva píxeles del sprite a píxeles de pantalla', () => {
  assert.equal(spriteScale(50, 100), 0.5);
});
