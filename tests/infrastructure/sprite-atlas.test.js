import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAtlas, steerFrameIndex, frameKey, findFrame, framePoints, loadSpriteAtlas, wheelFrame } from '../../src/infrastructure/rendering/sprite-atlas.js';

const json = JSON.parse(readFileSync(new URL('../../assets/sprites/atlas.json', import.meta.url)));
const atlas = parseAtlas(json);

test('parseAtlas expone cuadro, ancla, escala, capas y hojas', () => {
  assert.equal(atlas.frameWidth, json.cuadro.ancho);
  assert.deepEqual([atlas.anchorX, atlas.anchorY], json.cuadro.ancla);
  assert.equal(atlas.pixelsPerMeter, json.px_por_metro_en_ancla);
  assert.deepEqual(atlas.layers, ['carroceria', 'freno', 'ruedas', 'frente']);
  assert.deepEqual(Object.keys(atlas.sheets).sort(), ['bloque', 'cuna', 'saeta', 'volta']);
});

test('steerFrameIndex elige el giro más cercano y acota a los extremos', () => {
  const angles = [-21, -14, -7, 0, 7, 14, 21];
  assert.equal(steerFrameIndex(0, angles), 3);
  assert.equal(steerFrameIndex(9, angles), 4);
  assert.equal(steerFrameIndex(-40, angles), 0);
  assert.equal(steerFrameIndex(90, angles), 6);
});

test('wheelFrame recorre las fases hacia adelante y cierra el ciclo cada período de llanta', () => {
  const phases = { steps: 3, suffixes: ['', '_f1', '_f2'], blur: '_barrido' };
  const r = 0.3;
  const step = (2 * Math.PI / 5 / 3) * r; // metros recorridos por fase con 5 rayos
  const at = d => wheelFrame(phases, 5, d, 0, r).suffix;
  assert.deepEqual([0, 1, 2, 3, 4].map(i => at((i + 0.5) * step)), ['', '_f1', '_f2', '', '_f1']);
  assert.equal(at(-0.5 * step), '_f2', 'marcha atrás recorre las fases al revés');
});

test('wheelFrame funde con la rueda barrida según la cadencia de fases', () => {
  const phases = { steps: 3, suffixes: ['', '_f1', '_f2'], blur: '_barrido' };
  const r = 0.3;
  const step = 2 * Math.PI / 5 / 3;
  assert.equal(wheelFrame(phases, 5, 0, 0, r).blur, 0);
  assert.equal(wheelFrame(phases, 5, 0, 10 * step * r, r).blur, 0, '10 fases por segundo se ven girar');
  assert.equal(wheelFrame(phases, 5, 0, 80 * step * r, r).blur, 1, '80 fases por segundo ya titilan');
  const mid = wheelFrame(phases, 5, 0, 35 * step * r, r).blur;
  assert.ok(mid > 0 && mid < 1);
  assert.ok(wheelFrame(phases, 10, 0, 4, r).blur > wheelFrame(phases, 5, 0, 4, r).blur, 'más rayos, antes se barre');
});

test('wheelFrame sin fases en el atlas deja la rueda fija', () => {
  assert.deepEqual(wheelFrame(null, 5, 12, 30, 0.3), { suffix: '', blur: 0 });
  assert.deepEqual(wheelFrame(atlas.wheelPhases, null, 12, 30, 0.3), { suffix: '', blur: 0 });
});

test('frameKey sigue la nomenclatura por capas', () => {
  assert.equal(frameKey({ model: 'cuna', livery: 'lima', incline: 'plano', layer: 'ruedas', steerIndex: 3 }), 'cuna_lima_plano_ruedas_g3');
});

test('findFrame cae en terreno plano cuando falta la inclinación pedida', () => {
  const rect = { x: 0, y: 0, w: 10, h: 10, ox: 1, oy: 2 };
  const synthetic = { sheets: { auto: { image: 'img', frames: { auto_a_plano_carroceria_g0: rect } } } };
  assert.deepEqual(findFrame(synthetic, { model: 'auto', livery: 'a', incline: 'subida', layer: 'carroceria', steerIndex: 0 }), { image: 'img', rect });
  assert.equal(findFrame(synthetic, { model: 'tanque', livery: 'x', incline: 'plano', layer: 'carroceria', steerIndex: 0 }), null);
});

test('cada recorte entra en su hoja y en el cuadro lógico', () => {
  for (const sheet of Object.values(json.hojas)) {
    for (const [key, c] of Object.entries(sheet.cuadros)) {
      assert.ok(c.ox >= 0 && c.oy >= 0 && c.ox + c.w <= json.cuadro.ancho && c.oy + c.h <= json.cuadro.alto, key);
    }
  }
});

test('los puntos de anclaje traen ruedas, pivote y toberas', () => {
  const points = framePoints(atlas, 'volta', 'plano', 3);
  assert.equal(points.ruedas.length, 4);
  assert.equal(points.pivote.length, 1);
  assert.ok(points.toberas_traseras.length >= 2);
  assert.equal(points.toberas_bajas.length, 4);
});

test('loadSpriteAtlas carga una imagen por hoja', async () => {
  const loaded = await loadSpriteAtlas('assets/sprites', { fetchJson: async () => json, loadImage: async url => ({ url }) });
  assert.equal(loaded.sheets.volta.image.url, 'assets/sprites/volta.png');
});
