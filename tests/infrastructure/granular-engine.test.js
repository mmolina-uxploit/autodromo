import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { positionForFrequency } from '../../src/infrastructure/audio/granular-engine.js';

const bank = JSON.parse(readFileSync(new URL('../../assets/audio/banco.json', import.meta.url)));

test('el mapa de tono de cada barrido sube sin retroceder', () => {
  for (const [model, engine] of Object.entries(bank.motores)) {
    if (!engine.mapa) continue;
    for (let i = 1; i < engine.mapa.length; i++) assert.ok(engine.mapa[i][1] >= engine.mapa[i - 1][1], model);
    assert.ok(engine.mapa.at(-1)[1] > engine.mapa[0][1] * 1.3, `${model} tiene un barrido real`);
  }
});

test('positionForFrequency ubica el tono dentro del barrido y afina fuera de rango', () => {
  const map = [[0, 100], [1, 150], [2, 200]];
  assert.deepEqual(positionForFrequency(map, 125), { time: 0.5, rate: 1 });
  assert.deepEqual(positionForFrequency(map, 50), { time: 0, rate: 0.5 });
  assert.deepEqual(positionForFrequency(map, 300), { time: 2, rate: 1.5 });
});

test('el banco nombra solo archivos que existen', () => {
  const names = [
    ...Object.values(bank.motores).flatMap(e => [e.barrido, e.ralenti, e.textura].filter(Boolean)),
    ...Object.values(bank.bucles), ...Object.values(bank.unicos), ...Object.values(bank.golpes).flat()
  ];
  for (const name of names) assert.doesNotThrow(() => readFileSync(new URL(`../../assets/audio/${name}`, import.meta.url)), name);
});
