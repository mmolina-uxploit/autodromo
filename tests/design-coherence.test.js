import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ZONES } from '../src/config/zones.js';
import { VEHICLES } from '../src/config/vehicles.js';
import { TRACKS } from '../src/config/tracks.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const eco = JSON.parse(read('../design/ecosistema.json'));
const atlas = JSON.parse(read('../assets/sprites/atlas.json'));

test('las zonas del juego son las del ecosistema, con los mismos colores', () => {
  assert.deepEqual(ZONES.map(z => z.id), eco.zonas.map(z => z.id));
  for (const zone of ZONES) {
    const source = eco.zonas.find(z => z.id === zone.id);
    assert.equal(zone.name, source.nombre);
    assert.deepEqual(zone.sky, source.cielo);
    assert.equal(zone.fog, source.niebla);
    assert.deepEqual(zone.road.asphalt, source.pista.asfalto);
    assert.deepEqual(zone.road.rumble, source.pista.cordon);
    assert.equal(zone.road.lane, source.pista.carril);
    assert.deepEqual(zone.road.ground, source.pista.suelo);
  }
});

test('cada pista usa una zona existente y tiene trazado propio', () => {
  const ids = TRACKS.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const layouts = new Set(TRACKS.map(t => JSON.stringify(t.layout)));
  assert.equal(layouts.size, TRACKS.length);
  for (const track of TRACKS) assert.ok(ZONES.some(z => z.id === track.zone), track.id);
});

test('los autos elegibles son los del ecosistema, con sus libreas canónicas', () => {
  assert.deepEqual(VEHICLES.map(v => v.id), Object.keys(eco.vehiculos));
  for (const vehicle of VEHICLES) {
    const canon = eco.vehiculos[vehicle.model];
    assert.equal(vehicle.name, canon.nombre);
    assert.deepEqual(vehicle.liveries.map(l => [l.id, l.swatch]), canon.libreas.map(l => [l.id, l.carroceria]));
  }
});

test('cada librea elegible tiene sus capas, con todas las fases de rueda, en todos los giros e inclinaciones, y su retrato', () => {
  const steps = atlas.giros_grados.length;
  for (const { model, liveries } of VEHICLES) {
    const frames = atlas.hojas[model]?.cuadros ?? {};
    assert.ok(Number.isInteger(atlas.hojas[model]?.rayos), `${model}: rayos de la llanta`);
    for (const { id } of liveries) {
      for (const incline of Object.keys(atlas.inclinaciones_grados)) {
        for (let g = 0; g < steps; g++) {
          const { sufijos, barrido } = atlas.fases_rueda;
          const fases = [...sufijos, barrido];
          // El frente puede no existir (de frente, ninguna rueda tapa la carrocería); si existe,
          // tiene que estar en todas las fases o la rueda cambiaría de forma al girar.
          const frente = frames[`${model}_${id}_${incline}_frente_g${g}`] ? fases.map(s => `frente${s}`) : [];
          for (const layer of ['carroceria', 'freno', ...fases.map(s => `ruedas${s}`), ...frente]) {
            assert.ok(frames[`${model}_${id}_${incline}_${layer}_g${g}`], `${model}/${id} ${incline} ${layer} giro ${g}`);
          }
        }
      }
      assert.ok(existsSync(new URL(`../assets/garage/${model}-${id}.png`, import.meta.url)), `retrato ${model}-${id}`);
    }
  }
});

test('las defensas, fosos y emisivos de las zonas usan colores de la paleta o de su zona', () => {
  const palette = new Set(Object.values(eco.paleta).flat().map(c => c.hex.toLowerCase()));
  for (const zone of ZONES) {
    const own = new Set([...zone.sky, zone.fog, ...zone.road.asphalt, ...zone.road.rumble, zone.road.lane, ...zone.road.ground,
      ...(eco.zonas.find(z => z.id === zone.id).emisivos ?? [])].map(c => c.toLowerCase()));
    for (const color of [...zone.wall.face, zone.wall.top, zone.wall.stripe, zone.gap.top, zone.gap.bottom, zone.gap.shimmer]) {
      assert.ok(palette.has(color.toLowerCase()) || own.has(color.toLowerCase()), `${zone.id}: ${color}`);
    }
  }
});

test('los sonidos grabados tienen sus créditos', () => {
  const credits = read('../assets/audio/CREDITOS.md');
  assert.match(credits, /CC0/);
  assert.match(credits, /BigSoundBank/);
  assert.match(credits, /Kenney/);
});

test('los colores de los tokens CSS salen de la paleta del ecosistema', () => {
  const palette = new Set(Object.values(eco.paleta).flat().map(c => c.hex.toLowerCase()));
  const tokens = [...read('../styles/tokens.css').matchAll(/--color-[\w-]+:\s*(#[0-9a-fA-F]{6})/g)].map(m => m[1].toLowerCase());
  assert.ok(tokens.length > 0);
  for (const hex of tokens) assert.ok(palette.has(hex), `${hex} no está en la paleta`);
});

test('la atmósfera de cada zona es la del ecosistema', () => {
  for (const zone of ZONES) {
    const a = eco.zonas.find(z => z.id === zone.id).atmosfera;
    const own = zone.atmosphere;
    assert.ok(a && own, `${zone.id} sin atmósfera`);
    assert.equal(own.zenith, a.cenit);
    assert.deepEqual(own.glow, a.resplandor);
    assert.deepEqual(own.haze, a.bruma);
    assert.deepEqual(
      { light: own.cloud.light, shade: own.cloud.shade, rim: own.cloud.rim, count: own.cloud.count, lit: own.cloud.lit },
      { light: a.nubes.luz, shade: a.nubes.sombra, rim: a.nubes.borde, count: a.nubes.cantidad, lit: a.nubes.iluminadas === 'desde arriba' ? 'above' : 'below' }
    );
    assert.equal(own.sheen, a.brillo_asfalto);
    assert.equal(own.wet, a.piso_mojado);
    assert.equal(own.moon, a.luna);
    assert.deepEqual(own.windows, a.ventanas);
    assert.deepEqual(own.beams, a.haces);
    assert.equal(own.glass, a.vidrio);
    assert.deepEqual(own.sun, a.sol && { core: a.sol.nucleo, halo: a.sol.halo });
    assert.deepEqual(own.sea, a.mar && { far: a.mar.lejos, near: a.mar.cerca, glitter: a.mar.destello });
  }
});
