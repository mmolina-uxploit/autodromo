import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBestLapRepository, createSettingsRepository } from '../../src/infrastructure/storage.js';

function fakeStorage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data };
}
const brokenStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };

test('las mejores vueltas se guardan por clave', () => {
  const repo = createBestLapRepository(fakeStorage());
  assert.equal(repo.load('pista/auto'), null);
  repo.save('pista/auto', 61.25);
  repo.save('otra/auto', 70);
  assert.equal(repo.load('pista/auto'), 61.25);
  assert.equal(repo.load('otra/auto'), 70);
});

test('valores corruptos se ignoran', () => {
  const storage = fakeStorage();
  storage.setItem('autodromo.mejores-vueltas', '{"pista/auto":"rápido"}');
  assert.equal(createBestLapRepository(storage).load('pista/auto'), null);
  storage.setItem('autodromo.ajustes', '{roto');
  assert.equal(createSettingsRepository(storage).load(), null);
});

test('un almacenamiento bloqueado no rompe el juego', () => {
  const repo = createSettingsRepository(brokenStorage);
  assert.equal(repo.load(), null);
  assert.doesNotThrow(() => repo.save({ track: 'x' }));
  assert.doesNotThrow(() => createBestLapRepository(brokenStorage).save('a', 1));
});

test('sin almacenamiento disponible también funciona', () => {
  const repo = createBestLapRepository(undefined);
  assert.equal(repo.load('a'), null);
  assert.doesNotThrow(() => repo.save('a', 10));
});
