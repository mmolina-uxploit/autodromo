import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../../src/domain/track.js';
import { SMALL_LAYOUT, JUMP_LAYOUT, TRACK_OPTIONS } from '../helpers.js';

const track = Track.fromLayout(SMALL_LAYOUT, TRACK_OPTIONS);
const jumpy = Track.fromLayout(JUMP_LAYOUT, TRACK_OPTIONS);
const all = t => Array.from({ length: t.segmentCount }, (_, i) => t.segment(i));

test('el circuito cierra en el plano: el final vuelve al punto de largada', () => {
  const end = track.pointAt(track.length - 1e-9);
  assert.ok(Math.hypot(end.x, end.y) < 0.05, `queda abierto ${Math.hypot(end.x, end.y)} m`);
});

test('el rumbo da una vuelta completa', () => {
  const turned = all(track).reduce((sum, s) => sum + s.curvature * track.segmentLength, 0);
  assert.ok(Math.abs(turned - 2 * Math.PI) < 1e-6);
});

test('el largo es la cantidad de segmentos por su longitud, cerca de la pedida', () => {
  assert.ok(Math.abs(track.length - track.segmentCount * track.segmentLength) < 1e-9);
  assert.ok(Math.abs(track.segmentLength - 3) < 0.05);
});

test('las curvas entran por clotoide: la curvatura sube de a poco hasta 1/R', () => {
  const k = all(track).map(s => s.curvature);
  const max = Math.max(...k);
  assert.ok(Math.abs(max - 1 / 60) < 1e-4);
  for (let i = 1; i < k.length; i++) assert.ok(Math.abs(k[i] - k[i - 1]) < max * 0.25, `salto de curvatura en ${i}`);
});

test('las rectas tienen curvatura cero', () => {
  assert.equal(track.segment(5).curvature, 0);
});

test('segmentAt e indexAt envuelven posiciones fuera del circuito', () => {
  assert.equal(track.segmentAt(track.length + 4).index, 1);
  assert.equal(track.segmentAt(-1).index, track.segmentCount - 1);
});

test('la altura empieza y termina en cero y es continua sin saltos', () => {
  assert.ok(Math.abs(track.segment(0).startHeight) < 1e-9);
  assert.ok(Math.abs(track.segment(track.segmentCount - 1).endHeight) < 1e-6);
  for (let i = 1; i < track.segmentCount; i++) {
    assert.ok(Math.abs(track.segment(i).startHeight - track.segment(i - 1).endHeight) < 1e-6);
  }
});

test('una loma tiene curvatura vertical negativa en la cima', () => {
  const crest = all(track).find(s => s.bend < -1e-4);
  assert.ok(crest, 'no hay cima');
});

test('el salto arma rampa, foso y aterrizaje con su velocidad mínima', () => {
  const kinds = all(jumpy).map(s => (s.ramp ? 'r' : s.gap ? 'g' : s.landing ? 'l' : '.')).join('');
  assert.match(kinds, /\.r+g+l+\./);
  const [jump] = jumpy.jumps;
  assert.ok(jump.lip > jump.rampStart && jump.gapEnd > jump.lip && jump.landingEnd > jump.gapEnd);
  const lip = jumpy.segment(Math.round(jump.lip / jumpy.segmentLength) - 1);
  const base = jumpy.segment(Math.round(jump.rampStart / jumpy.segmentLength)).startHeight;
  assert.ok(Math.abs(lip.endHeight - base - 3) < 0.2, 'la rampa sube 3 m sobre su base');
  assert.ok(jump.requiredSpeed > 10 && jump.requiredSpeed < 60, `velocidad mínima ${jump.requiredSpeed}`);
  assert.equal(jumpy.jumpAt(jump.gapStart + 1), jump);
  assert.ok(jumpy.isGapAt(jump.gapStart + 1));
});

test('pointAt desplaza a la derecha del eje con n positivo', () => {
  const center = track.pointAt(10);
  const right = track.pointAt(10, 5);
  assert.ok(Math.abs(Math.hypot(right.x - center.x, right.y - center.y) - 5) < 1e-6);
  assert.ok(right.y > center.y, 'con rumbo este, la derecha queda hacia abajo del plano');
});

test('rechaza curvas que no suman 360°', () => {
  assert.throws(() => Track.fromLayout([{ kind: 'straight', length: 100 }, { kind: 'turn', radius: 50, angle: 90 }], TRACK_OPTIONS), /360/);
});

test('rechaza tramos inválidos', () => {
  assert.throws(() => Track.fromLayout([{ kind: 'turn', radius: 0, angle: 360 }], TRACK_OPTIONS), /radio/);
  assert.throws(() => Track.fromLayout([{ kind: 'loop' }], TRACK_OPTIONS), /desconocida/);
  assert.throws(() => Track.fromLayout([], TRACK_OPTIONS), /al menos un tramo/);
});

test('rechaza un cierre que pediría rectas negativas', () => {
  const bad = [SMALL_LAYOUT[0], { kind: 'straight', length: 2000 }, ...SMALL_LAYOUT.slice(1)];
  assert.throws(() => Track.fromLayout(bad, TRACK_OPTIONS), /rediseñá/);
});

test('los segmentos son inmutables', () => {
  assert.throws(() => { 'use strict'; track.segment(0).curvature = 9; }, TypeError);
});
