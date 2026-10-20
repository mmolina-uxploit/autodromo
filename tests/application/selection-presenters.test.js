import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentVehicleStats, presentVehicleFacts, describeTrack } from '../../src/application/selection-presenters.js';
import { createVehicleSpec } from '../../src/domain/vehicle.js';
import { VEHICLES } from '../../src/config/vehicles.js';
import { smallWorld } from '../helpers.js';

const specs = Object.fromEntries(VEHICLES.map(v => [v.id, createVehicleSpec(v.id, v.physics)]));

test('cada auto tiene cinco medidores de 1 a 5 explicados en texto', () => {
  for (const spec of Object.values(specs)) {
    const stats = presentVehicleStats(spec);
    assert.deepEqual(stats.map(s => s.id), ['speed', 'acceleration', 'handling', 'thrusters', 'durability']);
    for (const s of stats) {
      assert.ok(s.value >= 1 && s.value <= 5);
      assert.equal(s.text, `${s.value} de 5`);
    }
  }
});

test('las fichas reflejan el carácter de cada auto', () => {
  const value = (id, stat) => presentVehicleStats(specs[id]).find(s => s.id === stat).value;
  assert.ok(value('volta', 'thrusters') > value('cuna', 'thrusters'), 'el Volta tiene el mejor paquete de propulsores');
  assert.ok(value('bloque', 'durability') > value('saeta', 'durability'), 'el Bloque aguanta más los choques');
  assert.ok(value('cuna', 'speed') > value('bloque', 'speed'));
});

test('los datos técnicos dicen potencia, peso, final, caja y tracción', () => {
  const facts = presentVehicleFacts(specs.volta);
  assert.ok(facts.includes('Eléctrico'));
  assert.ok(facts.includes('Tracción integral'));
  assert.ok(facts.some(f => f.endsWith('CV')));
});

test('describeTrack resume largo, curvas, saltos, desnivel, perfil y plano', () => {
  const { track } = smallWorld();
  const info = describeTrack(track, 24, 80);
  assert.match(info.length, /^\d,\d\d km$/);
  assert.equal(info.curves, 4);
  assert.equal(info.jumps, 0);
  assert.equal(info.profile.length, 24);
  assert.ok(info.profile.every(p => p >= 0 && p <= 1));
  assert.equal(info.map.length, 80);
  assert.ok(info.map.flat().every(v => v >= -1e-9 && v <= 1 + 1e-9));
  assert.ok(Math.max(...info.aspect) > 0.999);
});
