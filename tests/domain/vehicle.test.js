import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleSpec, powerFraction, engineRpm } from '../../src/domain/vehicle.js';
import { VEHICLES } from '../../src/config/vehicles.js';

test('deriva la geometría: distancias del centro de masa a cada eje', () => {
  const spec = createVehicleSpec('x', { wheelbase: 2.6, weightFront: 0.4 });
  assert.ok(Math.abs(spec.a + spec.b - 2.6) < 1e-9);
  assert.ok(Math.abs(spec.b - 2.6 * 0.4) < 1e-9, 'b es la distancia al eje trasero');
});

test('el arrastre se calcula para que la potencia alcance justo la velocidad final', () => {
  const spec = createVehicleSpec('x', { power: 400, topSpeed: 288, mass: 1300 });
  const v = 288 / 3.6;
  const resist = spec.dragK * v ** 3 + spec.rolling * spec.mass * spec.gravity * v;
  assert.ok(Math.abs(resist - spec.peakPower) / spec.peakPower < 0.01);
});

test('la caja baja la relación marcha a marcha y la última corta apenas arriba de la final', () => {
  const spec = createVehicleSpec('x', { gears: 6, redline: 8000, topSpeed: 300 });
  for (let i = 1; i < 6; i++) assert.ok(spec.gearRatios[i] < spec.gearRatios[i - 1]);
  const rpmAtTop = engineRpm(spec, 300 / 3.6, 6);
  assert.ok(rpmAtTop < 8000 && rpmAtTop > 7000);
});

test('un eléctrico tiene una sola marcha y potencia plana', () => {
  const spec = createVehicleSpec('e', { electric: true, gears: 1, redline: 18000, idle: 600 });
  assert.equal(spec.gearRatios.length, 1);
  assert.equal(powerFraction(spec, 0.1), 1);
  assert.equal(powerFraction(spec, 0.9), 1);
});

test('la curva de potencia de combustión crece con el régimen', () => {
  const spec = createVehicleSpec('c');
  assert.ok(powerFraction(spec, 0.3) < powerFraction(spec, 0.9));
});

test('rechaza atributos desconocidos o fuera de rango', () => {
  assert.throws(() => createVehicleSpec('x', { alas: 2 }), /desconocido/);
  assert.throws(() => createVehicleSpec('x', { grip: 5 }), /inválido/);
  assert.throws(() => createVehicleSpec('x', { drive: 'cuatro' }), /inválido/);
});

test('todas las fichas del juego son válidas', () => {
  for (const vehicle of VEHICLES) assert.doesNotThrow(() => createVehicleSpec(vehicle.id, vehicle.physics), vehicle.id);
});

test('la ficha es inmutable', () => {
  const spec = createVehicleSpec('x');
  assert.throws(() => { 'use strict'; spec.mass = 1; }, TypeError);
  assert.throws(() => { 'use strict'; spec.thrusters.jump = 1; }, TypeError);
});
