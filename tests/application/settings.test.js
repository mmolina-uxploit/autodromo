import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, updateSettings } from '../../src/application/settings.js';
import { createSettingsStore } from '../../src/application/settings-store.js';

const catalog = {
  tracks: ['t1', 't2'],
  vehicles: ['v1', 'v2'],
  liveries: { v1: ['a', 'b'], v2: ['c'] },
  laps: [1, 3, 5],
  defaultLaps: 3,
  difficulties: ['facil', 'normal'],
  defaultDifficulty: 'normal',
  rivals: [0, 5],
  defaultRivals: 5,
  prefersReducedMotion: false
};

test('sin datos usa los valores por defecto del catálogo', () => {
  assert.deepEqual({ ...createSettings({}, catalog) }, {
    track: 't1', vehicle: 'v1', livery: 'a', laps: 3, difficulty: 'normal', rivals: 5,
    autoThrottle: false, swapControls: false, vibration: true, reducedMotion: false, sound: true, music: true
  });
});

test('el movimiento reducido arranca según la preferencia del sistema', () => {
  assert.equal(createSettings({}, { ...catalog, prefersReducedMotion: true }).reducedMotion, true);
});

test('migra la zona guardada por la versión anterior a la pista equivalente', () => {
  assert.equal(createSettings({ zone: 't2' }, catalog).track, 't2');
});

test('el color tiene que pertenecer al auto elegido', () => {
  assert.equal(createSettings({ vehicle: 'v2', livery: 'a' }, catalog).livery, 'c');
});

test('al cambiar de auto, el color pasa al primero del auto nuevo', () => {
  const next = updateSettings(createSettings({ vehicle: 'v1', livery: 'b' }, catalog), { vehicle: 'v2' }, catalog);
  assert.deepEqual([next.vehicle, next.livery], ['v2', 'c']);
});

test('vueltas, dificultad y rivales aceptan solo valores del catálogo', () => {
  const base = createSettings({}, catalog);
  const next = updateSettings(base, { laps: 5, difficulty: 'facil', rivals: 0 }, catalog);
  assert.deepEqual([next.laps, next.difficulty, next.rivals], [5, 'facil', 0]);
  const rejected = updateSettings(next, { laps: 99, difficulty: 'imposible', rivals: 3 }, catalog);
  assert.deepEqual([rejected.laps, rejected.difficulty, rejected.rivals], [5, 'facil', 0]);
});

test('un dato guardado fuera de catálogo cae en el valor por defecto', () => {
  const s = createSettings({ laps: 42, difficulty: 'x', rivals: -1 }, catalog);
  assert.deepEqual([s.laps, s.difficulty, s.rivals], [3, 'normal', 5]);
});

test('sonido y música se pueden apagar', () => {
  const s = updateSettings(createSettings({}, catalog), { sound: false, music: false }, catalog);
  assert.deepEqual([s.sound, s.music], [false, false]);
});

test('los valores inválidos conservan el valor anterior', () => {
  const previous = createSettings({ track: 't2', livery: 'b' }, catalog);
  const next = updateSettings(previous, { track: 'zzz', livery: 'c', vibration: 0 }, catalog);
  assert.deepEqual([next.track, next.livery, next.vibration], ['t2', 'b', true]);
});

test('el almacén carga, guarda y avisa cambios', () => {
  const saved = [];
  const store = createSettingsStore({ repository: { load: () => ({ vehicle: 'v2' }), save: s => saved.push(s) }, catalog });
  const seen = [];
  store.subscribe(s => seen.push(s.track));
  assert.equal(store.current.vehicle, 'v2');
  store.update({ track: 't2' });
  assert.deepEqual(seen, ['t2']);
  assert.equal(saved.at(-1).track, 't2');
});
