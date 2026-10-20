import { approach, clamp, hashNoise, lerp, sign, signedWrap } from './math.js';
import { engineRpm, powerFraction } from './vehicle.js';

/** Ayudas de manejo: control de tracción y de estabilidad. Los rivales usan LIGHT. */
export const Assist = Object.freeze({ NONE: 0, LIGHT: 1, FULL: 2 });

export const CarEvent = Object.freeze({
  THRUST_JUMP: 'thrust-jump',
  LAUNCH: 'launch',
  LAND: 'land',
  WALL: 'wall',
  FELL: 'fell',
  BOTTOM_OUT: 'bottom-out',
  SHIFT: 'shift',
  RESPAWN: 'respawn'
});

const PSI_SOFT = 0.42;
const PSI_HARD = 0.65;

/**
 * Respuesta de los mandos, en unidades por segundo. Un pedal o un propulsor no pasa de 0 a 1
 * en un paso: tiene recorrido, y eso evita tirones aunque se maneje con teclado (todo o nada).
 */
const PEDAL = Object.freeze({ throttleUp: 7, throttleDown: 10, brakeUp: 9, brakeDown: 14 });
const THRUST = Object.freeze({ boostUp: 5, boostDown: 8, liftUp: 10, liftDown: 12, relock: 0.2 });
const STEER = Object.freeze({ rate: 2.6, returnRate: 4.5, gain: 14, accel: 40 });
// La fuerza del motor baja al 35 % durante un cambio y vuelve en unas centésimas, sin corte seco.
const SHIFT_DIP = 0.35;
const DRIVE_RATE = 14;
// Transferencia de carga con la aceleración filtrada: el auto se asienta, no vibra.
const LOAD_TAU = 0.06;
// Neumáticos: uno más cargado agarra proporcionalmente menos, y los traseros son algo más
// rígidos. Con eso los autos tienden a subvirar un poco y frenar no les hace perder la cola.
// La rigidez lateral además crece menos que la carga (el neumático cargado necesita más deriva).
const LOAD_SENSITIVITY = 0.12;
const STIFFNESS_EXPONENT = 0.45;
const REAR_STIFFNESS = 1.2;
const sensitivity = ratio => clamp(1 - LOAD_SENSITIVITY * (ratio - 1), 0.8, 1.12);
const stiffness = ratio => Math.pow(clamp(ratio, 0.3, 3), -STIFFNESS_EXPONENT);

const REST_SUSPENSION = Object.freeze({ heave: 0, heaveV: 0, pitch: 0, pitchV: 0, roll: 0, rollV: 0 });

/**
 * Estado de un auto en coordenadas de pista:
 * s = distancia por el eje, n = desplazamiento lateral (positivo a la derecha),
 * psi = rumbo respecto de la tangente, u/v = velocidad longitudinal y lateral del auto,
 * r = velocidad de giro, z/vz = altura y velocidad vertical.
 */
export function createCar({
  id, spec, model = spec.id, livery = null, s, n = 0, progress = 0, height = 0,
  isPlayer = false, autopilot = false, skill = 1, assist = Assist.LIGHT, name = null
}) {
  return Object.freeze({
    id, specId: spec.id, model, livery, name, isPlayer, autopilot, skill, assist,
    s, n, psi: 0, u: 0, v: 0, r: 0,
    z: height, vz: 0, airborne: false, airTime: 0, lastAirTime: 0,
    steer: 0, steerRate: 0, throttle: 0, brake: 0, reversing: false, reverseHold: 0,
    gear: 1, rpm: spec.idle, shift: 0, driveLevel: 1,
    energy: 1, jumpHeld: false, lifting: false, boosting: false, liftLevel: 0, boostLevel: 0, boostLock: false,
    susp: REST_SUSPENSION,
    ax: 0, ay: 0, axLoad: 0, slip: 0, wheelspin: 0, offroad: 0, curb: 0, wallContact: 0,
    progress, lap: 0, lapStart: 0, lastLap: null, bestLap: null, finished: false, finishTime: null,
    ghost: 0, stuck: 0,
    ai: Object.freeze({ avoid: 0, wobble: 0 })
  });
}

/** Coeficiente de agarre y fracción fuera de pista de una rueda según su posición lateral. */
function wheelSurface(nw, track, rules, spec) {
  const edge = Math.abs(nw);
  if (edge <= track.halfWidth) return { mu: 1, off: 0, curb: 0 };
  if (edge <= track.halfWidth + rules.rumbleWidth) return { mu: 0.93, off: 0, curb: 1 };
  return { mu: spec.offroad, off: 1, curb: 0 };
}

function surfaces(car, spec, track, rules) {
  const sp = Math.sin(car.psi);
  const cp = Math.cos(car.psi);
  const half = spec.width * 0.42 * cp;
  const front = car.n + spec.a * sp;
  const rear = car.n - spec.b * sp;
  const fl = wheelSurface(front - half, track, rules, spec);
  const fr = wheelSurface(front + half, track, rules, spec);
  const rl = wheelSurface(rear - half, track, rules, spec);
  const rr = wheelSurface(rear + half, track, rules, spec);
  return {
    muF: (fl.mu + fr.mu) / 2,
    muR: (rl.mu + rr.mu) / 2,
    off: (fl.off + fr.off + rl.off + rr.off) / 4,
    curb: (fl.curb + fr.curb + rl.curb + rr.curb) / 4
  };
}

/** Caja automática: sube cerca del corte, baja cuando la marcha inferior entra holgada. */
function shiftGears(car, spec, h) {
  let { gear } = car;
  let shift = Math.max(0, car.shift - h);
  let shifted = 0;
  if (!spec.electric && shift === 0 && car.u > 1) {
    const rpm = engineRpm(spec, car.u, gear);
    if (rpm > spec.redline * 0.95 && gear < spec.gearRatios.length) {
      gear += 1;
      shift = 0.16;
      shifted = 1;
    } else if (gear > 1 && engineRpm(spec, car.u, gear - 1) < spec.redline * 0.78 && rpm < spec.redline * 0.5) {
      gear -= 1;
      shift = 0.08;
      shifted = -1;
    }
  }
  if (!spec.electric && car.u <= 1) gear = 1;
  return { gear, shift, shifted };
}

/** Avanza un auto un paso fijo `h`. Devuelve el auto nuevo y sus eventos. Puro. */
export function stepCar(car, input, spec, track, rules, h) {
  const events = [];
  const g = rules.gravity;
  const m = spec.mass;
  const L = spec.wheelbase;
  const th = spec.thrusters;
  const kappa = track.curvatureAt(car.s);

  let { s, n, psi, u, v, r, z, vz, airborne, energy, progress } = car;
  let airTime = car.airTime;
  let lastAirTime = car.lastAirTime;

  // Dirección: el volante tiene inercia (acelera y frena su giro) y velocidad máxima,
  // se asienta suave sobre el ángulo pedido, y el ángulo útil baja con la velocidad.
  const steerLimit = spec.steerMax / (1 + Math.abs(u) / 22);
  const steerTarget = input.steer * steerLimit;
  const maxRate = input.steer === 0 ? STEER.returnRate : STEER.rate;
  const wantRate = clamp((steerTarget - car.steer) * STEER.gain, -maxRate, maxRate);
  const steerRate = approach(car.steerRate ?? 0, wantRate, STEER.accel * h);
  const steer = car.steer + steerRate * h;

  // Pedales con recorrido: la intención es instantánea, la fuerza llega en un décimo de segundo.
  const throttle = approach(car.throttle, input.throttle, (input.throttle > car.throttle ? PEDAL.throttleUp : PEDAL.throttleDown) * h);
  const brake = approach(car.brake, input.brake, (input.brake > car.brake ? PEDAL.brakeUp : PEDAL.brakeDown) * h);

  // Propulsores: un toque despega, sostenido planea; el empuje trasero suma fuerza en cualquier momento.
  const cost = x => x / th.capacity;
  const onGap = track.isGapAt(s);
  let jumped = false;
  if (input.jump && !car.jumpHeld && !airborne && energy >= cost(th.jumpCost) && !onGap) {
    vz = Math.max(vz, 0) + th.jump;
    airborne = true;
    energy -= cost(th.jumpCost);
    jumped = true;
    events.push({ type: CarEvent.THRUST_JUMP });
  }
  // El planeo sostiene: frena la caída y alarga el vuelo, pero no hace trepar al auto.
  // Los dos propulsores encienden y se apagan con rampa; si el empuje vacía la energía,
  // queda trabado hasta recargar un poco (sin eso parpadearía con cada gota de recarga).
  const wantsLift = input.jump && airborne && energy > 0 && vz < 1.5;
  const liftLevel = approach(car.liftLevel ?? 0, wantsLift ? 1 : 0, (wantsLift ? THRUST.liftUp : THRUST.liftDown) * h);
  let boostLock = car.boostLock ?? false;
  if (energy <= 0) boostLock = true;
  else if (energy >= THRUST.relock) boostLock = false;
  const wantsBoost = input.boost && !boostLock && energy > 0;
  const boostLevel = approach(car.boostLevel ?? 0, wantsBoost ? 1 : 0, (wantsBoost ? THRUST.boostUp : THRUST.boostDown) * h);
  const lifting = liftLevel > 0.05;
  const boosting = boostLevel > 0.05;
  energy -= (cost(th.liftDrain) * liftLevel + cost(th.boostDrain) * boostLevel) * h;
  if (!lifting && !boosting && !airborne) energy += th.regen * h;
  energy = clamp(energy, 0, 1);

  // Motor y caja.
  const gears = shiftGears(car, spec, h);
  if (gears.shifted) events.push({ type: CarEvent.SHIFT, up: gears.shifted > 0 });
  const driveLevel = approach(car.driveLevel ?? 1, gears.shift > 0 ? SHIFT_DIP : 1, DRIVE_RATE * h);
  const launchRpm = spec.idle + throttle * (spec.redline * 0.55 - spec.idle);
  let rpm = engineRpm(spec, u, gears.gear);
  if (gears.gear === 1) rpm = Math.max(rpm, launchRpm);
  rpm = clamp(rpm, spec.idle, spec.redline * 1.02);

  const stopped = Math.abs(u) < 0.5;
  const reverseHold = stopped && input.brake > 0 && input.throttle === 0 ? car.reverseHold + h : 0;
  const reversing = reverseHold > 0.35 || (car.reversing && input.brake > 0 && input.throttle === 0);

  let drive = 0;
  if (!airborne) {
    if (reversing) {
      drive = u > -7 ? -m * 3.5 * brake : 0;
    } else if (throttle > 0) {
      const gearCap = spec.launchForce * spec.gearRatios[gears.gear - 1] / spec.gearRatios[0];
      // El limitador recorta en una franja, no de golpe.
      const limiter = gears.gear === spec.gearRatios.length ? clamp((spec.redline * 1.02 - rpm) / (spec.redline * 0.02), 0, 1) : 1;
      drive = limiter * driveLevel * throttle * Math.min(gearCap, spec.peakPower * powerFraction(spec, rpm / spec.redline) / Math.max(Math.abs(u), 1));
    }
  }
  const boostForce = m * th.boost * boostLevel;

  const surf = surfaces(car, spec, track, rules);
  let ax = 0;
  let ay = 0;
  let slip = 0;
  let wheelspin = 0;

  const axLoad = (car.axLoad ?? car.ax) + (car.ax - (car.axLoad ?? car.ax)) * Math.min(1, h / LOAD_TAU);
  if (!airborne) {
    const down = spec.downforce * u * u;
    const loadF = Math.max(0.15 * m * g, m * g * spec.b / L - m * axLoad * spec.cgHeight / L + down * 0.45);
    const loadR = Math.max(0.15 * m * g, m * g * spec.a / L + m * axLoad * spec.cgHeight / L + down * 0.55);
    const muF = spec.grip * surf.muF;
    const muR = spec.grip * surf.muR;

    const brakeTotal = reversing ? 0 : brake * spec.brake * m * g;
    const dir = u > 0.05 ? 1 : u < -0.05 ? -1 : 0;
    let fxF = drive * (1 - spec.driveRear) - brakeTotal * 0.62 * dir;
    let fxR = drive * spec.driveRear - brakeTotal * 0.38 * dir;

    const ratioF = loadF / (m * g * spec.b / L + down * 0.45);
    const ratioR = loadR / (m * g * spec.a / L + down * 0.55);
    const capF = muF * loadF * sensitivity(ratioF);
    const capR = muR * loadR * sensitivity(ratioR);
    const tc = car.assist >= Assist.LIGHT;

    // Repartidor de frenada: el eje trasero, que se descarga al frenar, nunca frena con más
    // que una parte de su agarre y el resto pasa adelante. Así frenar derecho no cruza el auto
    // (con ayudas se reserva más, como un repartidor electrónico).
    const rearBrakeMax = (tc ? 0.7 : 0.88) * capR;
    const rearBrake = brakeTotal * 0.38;
    if (dir !== 0 && rearBrake > rearBrakeMax) {
      const moved = rearBrake - rearBrakeMax;
      fxR += moved * dir;
      fxF -= moved * dir;
    }

    const uAbs = Math.max(Math.abs(u), 1);
    const forward = u >= 0 ? 1 : -1;
    const alphaF = Math.atan2(v + spec.a * r, uAbs) - steer * forward;
    const alphaR = Math.atan2(v - spec.b * r, uAbs);
    const curve = a => Math.sin(spec.tireC * Math.atan(spec.tireB * a));
    const shapeF = curve(alphaF * stiffness(ratioF));
    const shapeR = curve(alphaR * REAR_STIFFNESS * stiffness(ratioR));

    // Con ayudas, tracción y ABS reservan el agarre lateral que pide la deriva de cada eje
    // (elipse de fricción). Sin ayudas el eje puede patinar y perder agarre lateral.
    const reserve = (cap, shape) => Math.max(0.15 * cap, 0.97 * cap * Math.sqrt(Math.max(0, 1 - shape * shape)));
    const allowF = tc ? reserve(capF, shapeF) : capF;
    const allowR = tc ? reserve(capR, shapeR) : capR;
    let spinR = 0;
    let spinF = 0;
    if (Math.abs(fxR) > allowR) {
      spinR = !tc && drive * spec.driveRear > capR ? (Math.abs(fxR) - capR) / capR : 0;
      fxR = sign(fxR) * allowR;
    }
    if (Math.abs(fxF) > allowF) {
      spinF = !tc && drive * (1 - spec.driveRear) > capF ? (Math.abs(fxF) - capF) / capF : 0;
      fxF = sign(fxF) * allowF;
    }
    wheelspin = tc ? 0 : clamp(Math.max(spinR, spinF), 0, 1);
    const latF = Math.sqrt(Math.max(0, capF * capF - fxF * fxF)) * (tc ? 1 : 1 - spinF * 0.6);
    const latR = Math.sqrt(Math.max(0, capR * capR - fxR * fxR)) * (tc ? 1 : 1 - spinR * 0.75);

    let fyF = -latF * shapeF;
    let fyR = -latR * shapeR;
    // Sin esta cota el paso explícito haría oscilar la goma a baja velocidad.
    // La velocidad lateral del neumático delantero se mide en el sentido de la rueda girada.
    const capStepF = (m * spec.b / L) * Math.abs((v + spec.a * r) * Math.cos(steer) - u * Math.sin(steer)) / h;
    const capStepR = (m * spec.a / L) * Math.abs(v - spec.b * r) / h;
    fyF = clamp(fyF, -capStepF, capStepF);
    fyR = clamp(fyR, -capStepR, capStepR);

    const resist = spec.dragK * u * Math.abs(u)
      + spec.rolling * m * g * clamp(u, -1, 1)
      + surf.off * m * (0.6 + 0.04 * Math.abs(u)) * clamp(u, -1, 1);
    const cs = Math.cos(steer);
    const sn = Math.sin(steer);
    const fx = fxF * cs - fyF * sn + fxR - resist + boostForce;
    const fy = fxF * sn + fyF * cs + fyR;
    const mz = spec.a * (fyF * cs + fxF * sn) - spec.b * fyR;
    ax = fx / m;
    ay = fy / m;
    u += (ax + v * r) * h;
    v += (ay - u * r) * h;
    r += (mz / spec.inertia) * h;

    // Control de estabilidad: lleva la guiñada hacia la que pide el volante sin pasar el límite de agarre.
    if (car.assist >= Assist.LIGHT && Math.abs(u) > 3) {
      const limit = (spec.grip * g * 1.05) / Math.abs(u);
      const target = clamp(u * Math.tan(steer) / L, -limit, limit);
      r += (target - r) * (car.assist === Assist.FULL ? 4 : 2.5) * h;
    }

    // A baja velocidad manda la cinemática: sin deslizamiento de goma.
    const k = clamp((Math.abs(u) - 1.5) / 4, 0, 1);
    if (k < 1) {
      const rKin = u * Math.tan(steer) / L;
      r = lerp(rKin, r, k);
      v = lerp(rKin * spec.b, v, k);
    }
    if (!reversing && input.brake > 0 && input.throttle === 0 && Math.abs(u) < 0.4) {
      u = 0;
      v *= 0.5;
      r *= 0.5;
    } else if (input.throttle === 0 && input.brake === 0 && Math.abs(u) < 0.15) {
      u = 0;
    }

    slip = Math.abs(u) > 4 ? clamp(Math.max(Math.abs(alphaR) - 0.12, Math.abs(alphaF) - 0.14, 0) * 5 + wheelspin, 0, 1) : 0;
  } else {
    // En el aire solo actúan el arrastre, el empuje y los propulsores laterales de actitud.
    const fx = -spec.dragK * u * Math.abs(u) + boostForce;
    ax = fx / m;
    u += ax * h;
    v *= 1 - 0.3 * h;
    r *= 1 - 0.6 * h;
    if (input.steer !== 0 && energy > 0) {
      r += input.steer * 1.4 * h;
      energy = Math.max(0, energy - cost(0.05) * h);
    }
  }

  // Guiñada acotada: la cámara siempre mira hacia adelante, así que el auto no puede quedar cruzado.
  // Pasado el ángulo blando, un resorte progresivo con amortiguación lo devuelve sin tocar el tope.
  if (Math.abs(psi) > PSI_SOFT) {
    const excess = Math.abs(psi) - PSI_SOFT;
    r -= sign(psi) * excess * (10 + 120 * excess) * h;
    if (sign(r) === sign(psi)) r *= 1 - Math.min(1, 6 * excess / (PSI_HARD - PSI_SOFT)) * 4 * h;
  }

  // Avance en coordenadas de pista.
  const sdot = (u * Math.cos(psi) - v * Math.sin(psi)) / Math.max(0.2, 1 - n * kappa);
  const ndot = u * Math.sin(psi) + v * Math.cos(psi);
  const ds = sdot * h;
  s = track.wrap(s + ds);
  progress += ds;
  n += ndot * h;
  psi += (r - kappa * sdot) * h;
  if (Math.abs(psi) > PSI_HARD) {
    psi = sign(psi) * PSI_HARD;
    if (sign(r) === sign(psi)) r = 0;
  }

  // Defensas: rebote lateral, roce que frena y alineación con el muro.
  let wallContact = 0;
  const extent = spec.halfWidth * Math.abs(Math.cos(psi)) + spec.halfLength * Math.abs(Math.sin(psi));
  const limit = track.barrier - extent;
  if (Math.abs(n) > limit) {
    const side = sign(n);
    n = side * limit;
    let tv = u * Math.cos(psi) - v * Math.sin(psi);
    let nv = u * Math.sin(psi) + v * Math.cos(psi);
    if (nv * side > 0) {
      const hit = Math.abs(nv);
      nv = -side * hit * rules.wallRestitution;
      tv -= sign(tv) * Math.min(Math.abs(tv), hit * rules.wallFriction);
      r *= 0.5;
      // El golpe endereza el auto contra el muro en unas décimas, no en un cuadro.
      r -= psi * Math.min(0.5, hit * 0.04) * 5;
      if (hit > 1.2) events.push({ type: CarEvent.WALL, intensity: hit, side });
    }
    tv *= 1 - 0.5 * h;
    wallContact = Math.abs(tv);
    u = tv * Math.cos(psi) + nv * Math.sin(psi);
    v = -tv * Math.sin(psi) + nv * Math.cos(psi);
  }

  // Eje vertical: el piso empuja, la gravedad tira; si el piso cae más rápido que la gravedad, el auto vuela.
  const seg = track.segmentAt(s);
  const ground = track.heightAt(s);
  const gap = seg.gap;
  let roadAccel = 0;
  let landing = null;
  if (!airborne) {
    const before = track.segmentAt(car.s);
    const step = seg !== before && seg.startHeight < before.endHeight - 0.3;
    const vertical = track.bendAt(s) * sdot * sdot;
    if (gap || step || vertical < -g) {
      airborne = true;
      vz -= g * h;
      z += vz * h;
      if (!jumped) events.push({ type: CarEvent.LAUNCH, speed: u });
    } else {
      roadAccel = vertical;
      vz = seg.slope * sdot;
      z = ground;
    }
  } else {
    vz += (th.lift * liftLevel - g) * h;
    z += vz * h;
    airTime += h;
    if (!gap && z <= ground) {
      const vzRoad = seg.slope * sdot;
      const impact = Math.max(0, vzRoad - vz);
      landing = { impact, airTime };
      z = ground;
      vz = vzRoad;
      airborne = false;
      lastAirTime = airTime;
      airTime = 0;
      if (impact > 7) u *= 0.97;
      events.push({ type: CarEvent.LAND, impact, airTime: lastAirTime });
    }
  }

  // Suspensión: resorte y amortiguador en altura, cabeceo y rolido, con tope de recorrido.
  const sp = spec.suspension;
  const w = 2 * Math.PI * sp.frequency;
  const c = 2 * sp.damping * w;
  let { heave, heaveV, pitch, pitchV, roll, rollV } = car.susp;
  const speedFactor = clamp(Math.abs(u) / 12, 0, 1);
  const bumps = airborne ? 0
    : hashNoise(Math.floor(s / 1.5), car.id) * 60 * surf.curb * speedFactor
      + hashNoise(Math.floor(s / 0.9), car.id + 7) * 45 * surf.off * speedFactor;
  const heaveTarget = airborne ? sp.travel * 0.85 : 0;
  heaveV += (-w * w * (heave - heaveTarget) - c * heaveV - roadAccel + bumps) * h;
  if (landing) heaveV -= landing.impact * 0.9;
  heave += heaveV * h;
  if (heave < -sp.travel) {
    if (heaveV < -1.2) events.push({ type: CarEvent.BOTTOM_OUT, intensity: -heaveV });
    heave = -sp.travel;
    heaveV = Math.max(0, heaveV);
  } else if (heave > sp.travel) {
    heave = sp.travel;
    heaveV = Math.min(0, heaveV);
  }
  const pitchTarget = airborne ? 0 : clamp(ax * sp.pitch, -0.07, 0.07);
  const rollTarget = airborne ? 0 : clamp(-ay * sp.roll, -0.09, 0.09);
  pitchV += (-w * w * (pitch - pitchTarget) - c * pitchV) * h;
  rollV += (-w * w * (roll - rollTarget) - c * rollV + bumps * 0.02 * hashNoise(s, car.id + 3)) * h;
  pitch += pitchV * h;
  roll += rollV * h;

  let next = {
    ...car,
    s, n, psi, u, v, r, z, vz, airborne, airTime, lastAirTime,
    steer, steerRate, throttle, brake, reversing, reverseHold,
    gear: gears.gear, rpm, shift: gears.shift, driveLevel,
    energy, jumpHeld: input.jump, lifting, boosting, liftLevel, boostLevel, boostLock,
    susp: Object.freeze({ heave, heaveV, pitch, pitchV, roll, rollV }),
    ax, ay, axLoad, slip, wheelspin, offroad: surf.off, curb: surf.curb, wallContact,
    progress,
    ghost: Math.max(0, car.ghost - h),
    stuck: !airborne && Math.abs(u) < 1 && (input.throttle > 0.5 || input.brake > 0.5) ? car.stuck + h : 0
  };

  // Caída al foso o auto trabado: vuelve a la pista antes de la rampa, sin choques por un rato.
  if (airborne && gap && z < ground + rules.gapDepth - rules.fallDepth) {
    events.push({ type: CarEvent.FELL });
    next = respawn(next, track, rules, 'fell');
  } else if (next.stuck > rules.stuckSeconds) {
    next = respawn(next, track, rules, 'stuck');
  }
  if (next.ghost === rules.ghostSeconds) events.push({ type: CarEvent.RESPAWN });
  return { car: Object.freeze(next), events };
}

/** Reubica el auto sobre el eje: antes del salto si cayó, en el mismo lugar si quedó trabado. */
export function respawn(car, track, rules, reason) {
  const jump = track.jumpAt(car.s);
  const target = reason === 'fell' && jump ? track.wrap(jump.rampStart - rules.respawnBack) : car.s;
  const back = signedWrap(target - car.s, track.length);
  return {
    ...car,
    s: target,
    n: 0, psi: 0, u: reason === 'fell' ? rules.respawnSpeed : 0, v: 0, r: 0,
    z: track.heightAt(target), vz: 0, airborne: false, airTime: 0,
    steer: 0, steerRate: 0, susp: REST_SUSPENSION, ax: 0, ay: 0, axLoad: 0,
    throttle: 0, brake: 0, liftLevel: 0, boostLevel: 0, driveLevel: 1,
    progress: car.progress + back,
    ghost: rules.ghostSeconds,
    stuck: 0
  };
}
