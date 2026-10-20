import { clamp, hashNoise, lerp, signedWrap } from './math.js';
import { createControls } from './controls.js';

/**
 * Línea de carrera y velocidad objetivo por segmento para un auto en una pista.
 * La línea se obtiene relajando los puntos hacia el medio de sus vecinos (menos curvatura,
 * más velocidad) y la velocidad sale del agarre en cada radio y de la distancia de frenado.
 */
export function planRacingLine(track, spec, rules) {
  const N = track.segmentCount;
  const L = track.segmentLength;
  const segs = Array.from({ length: N }, (_, i) => track.segment(i));
  const nx = segs.map(s => -Math.sin(s.heading));
  const ny = segs.map(s => Math.cos(s.heading));
  const limit = Math.max(0, track.halfWidth - spec.halfWidth - 0.5);
  const offset = new Float64Array(N);
  const locked = new Uint8Array(N);
  for (const jump of track.jumps) {
    const from = Math.floor(jump.rampStart / L) - Math.ceil(40 / L);
    const to = Math.ceil(jump.landingEnd / L) + 2;
    for (let i = from; i <= to; i++) locked[((i % N) + N) % N] = 1;
  }
  const at = i => ((i % N) + N) % N;
  for (const span of [16, 10, 6, 3]) {
    for (let iter = 0; iter < 40; iter++) {
      for (let i = 0; i < N; i++) {
        if (locked[i]) continue;
        const a = at(i - span);
        const b = at(i + span);
        const mx = (segs[a].x + nx[a] * offset[a] + segs[b].x + nx[b] * offset[b]) / 2;
        const my = (segs[a].y + ny[a] * offset[a] + segs[b].y + ny[b] * offset[b]) / 2;
        const target = (mx - segs[i].x) * nx[i] + (my - segs[i].y) * ny[i];
        offset[i] = clamp(lerp(offset[i], target, 0.5), -limit, limit);
      }
    }
  }

  const g = rules.gravity;
  const mu = spec.grip * 0.9;
  const px = i => segs[at(i)].x + nx[at(i)] * offset[at(i)];
  const py = i => segs[at(i)].y + ny[at(i)] * offset[at(i)];
  const m = 3;
  const curvature = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const ax = px(i - m); const ay = py(i - m);
    const bx = px(i); const by = py(i);
    const cx = px(i + m); const cy = py(i + m);
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    const d = Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by) * Math.hypot(cx - ax, cy - ay);
    curvature[i] = d > 0 ? Math.abs(2 * cross / d) : 0;
  }
  const speed = new Float64Array(N);
  const aero = mu * spec.downforce / spec.mass;
  for (let i = 0; i < N; i++) {
    const k = Math.max(curvature[at(i - 1)], curvature[i], curvature[at(i + 1)]);
    const room = k - aero;
    speed[i] = room > 1e-5 ? Math.min(spec.topSpeedMs, Math.sqrt(mu * g / room)) : spec.topSpeedMs;
    if (segs[i].gap) speed[i] = spec.topSpeedMs;
  }
  const decel = Math.min(spec.brake, spec.grip) * g * 0.82;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = N - 1; i >= 0; i--) {
      const next = speed[at(i + 1)];
      speed[i] = Math.min(speed[i], Math.sqrt(next * next + 2 * decel * L));
    }
  }
  for (const jump of track.jumps) {
    const from = Math.floor(jump.rampStart / L) - Math.ceil(30 / L);
    const lip = Math.floor(jump.lip / L);
    for (let i = from; i < lip; i++) speed[at(i)] = Math.max(speed[at(i)], jump.requiredSpeed * 1.08);
  }
  return Object.freeze({ specId: spec.id, offset, speed, curvature });
}

const index = (track, s) => track.indexAt(s);

/** Desvío de la línea de carrera en `s`, interpolado entre segmentos (sin escalones cada 3 m). */
function lineOffset(plan, track, s) {
  const x = track.wrap(s) / track.segmentLength;
  const i = Math.floor(x);
  const n = plan.offset.length;
  return lerp(plan.offset[i % n], plan.offset[(i + 1) % n], x - i);
}

/** Ruido suave en el tiempo: interpola valores al azar fijos con una curva sin quiebres. */
function smoothNoise(t, seed) {
  const i = Math.floor(t);
  const f = t - i;
  return lerp(hashNoise(i, seed), hashNoise(i + 1, seed), f * f * (3 - 2 * f));
}

/** Empujón lateral para no quedar pegado a un auto que va al costado. */
function personalSpace(car, cars, track) {
  let push = 0;
  for (const other of cars) {
    if (other.id === car.id || other.ghost > 0 || Math.abs(other.z - car.z) > 1.5) continue;
    const ds = signedWrap(other.s - car.s, track.length);
    const dn = car.n - other.n;
    if (Math.abs(ds) > 6.5 || Math.abs(dn) > 3.4) continue;
    push += (Math.sign(dn) || (car.id < other.id ? -1 : 1)) * (3.4 - Math.abs(dn)) * (1 - Math.abs(ds) / 6.5) * 0.9;
  }
  return push;
}

/** Auto adelante en el mismo carril al que no se puede pasar: devuelve hasta qué velocidad seguirlo. */
function followSpeed(car, cars, track, lateral) {
  let limit = Infinity;
  for (const other of cars) {
    if (other.id === car.id || other.ghost > 0 || Math.abs(other.z - car.z) > 1.5) continue;
    const ds = signedWrap(other.s - car.s, track.length);
    if (ds <= 0 || ds > 10 + car.u * 0.5) continue;
    if (Math.abs(other.n - lateral) > 2.3) continue;
    limit = Math.min(limit, Math.max(0, other.u) + (ds - 7) * 0.6);
  }
  return limit;
}

/** Busca un auto que tape la línea por delante y devuelve el desvío lateral para pasarlo. */
function avoidance(car, cars, track, wanted) {
  const reach = 18 + car.u * 0.6;
  let best = null;
  for (const other of cars) {
    if (other.id === car.id || other.ghost > 0) continue;
    if (Math.abs(other.z - car.z) > 1.5) continue;
    const ds = signedWrap(other.s - car.s, track.length);
    if (ds <= 0 || ds > reach) continue;
    if (car.u < other.u - 2) continue;
    if (Math.abs(other.n - wanted) > 2.8) continue;
    if (!best || ds < best.ds) best = { ds, n: other.n };
  }
  if (!best) return 0;
  const room = track.halfWidth - 1.4;
  const left = best.n - 3;
  const right = best.n + 3;
  const options = [left, right].filter(x => Math.abs(x) <= room);
  if (options.length === 0) return 0;
  const pick = options.reduce((a, b) => (Math.abs(a - wanted) <= Math.abs(b - wanted) ? a : b));
  return pick - wanted;
}

/**
 * Piloto automático: devuelve los controles del cuadro y el estado de IA actualizado.
 * `skill` escala la velocidad objetivo; por debajo de 1 además agrega pequeñas imprecisiones.
 */
export function driveAi(car, { plan, track, spec, cars, clock, h }) {
  const u = Math.max(0, car.u);
  const look = clamp(7 + u * 0.55, 8, 60);
  const ahead = track.wrap(car.s + look);
  const lineAhead = lineOffset(plan, track, ahead);
  const avoidTarget = avoidance(car, cars, track, lineAhead) + personalSpace(car, cars, track);
  const avoid = car.ai.avoid + clamp(avoidTarget - car.ai.avoid, -4 * h, 4 * h);
  const wobble = (1 - Math.min(1, car.skill)) * smoothNoise(clock * 1.3, car.id) * 1.6;
  const lateral = clamp(lineAhead + avoid + wobble, -(track.halfWidth - 1), track.halfWidth - 1);

  const target = track.pointAt(ahead, lateral);
  const pos = track.pointAt(car.s, car.n);
  const heading = track.headingAt(car.s) + car.psi;
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const fx = dx * Math.cos(heading) + dy * Math.sin(heading);
  const fy = -dx * Math.sin(heading) + dy * Math.cos(heading);
  const alpha = Math.atan2(fy, fx);
  const delta = Math.atan(2 * spec.wheelbase * Math.sin(alpha) / Math.max(1, Math.hypot(fx, fy)));
  const steerLimit = spec.steerMax / (1 + u / 22);
  const steer = clamp(delta / steerLimit, -1, 1);

  let wantSpeed = Infinity;
  const first = index(track, car.s + u * 0.25 + 3);
  for (let j = 0; j < 6; j++) wantSpeed = Math.min(wantSpeed, plan.speed[(first + j) % plan.speed.length]);
  wantSpeed = Math.min(wantSpeed * car.skill, followSpeed(car, cars, track, lateral));
  const throttle = car.airborne ? 1 : wantSpeed > u + 1 ? 1 : clamp((wantSpeed - u) * 0.5 + 0.3, 0, 1);
  const brake = !car.airborne && u > wantSpeed + 1.5 ? clamp((u - wantSpeed) * 0.25, 0.2, 1) : 0;

  let jump = false;
  const zone = track.jumpAt(car.s);
  if (zone) {
    if (!car.airborne) {
      const toLip = signedWrap(zone.lip - car.s, track.length);
      jump = toLip > 0 && toLip < Math.max(4, u * 0.08) && u < zone.requiredSpeed * 1.04;
    } else {
      const remaining = signedWrap(zone.gapEnd - car.s, track.length);
      if (remaining > -2) {
        const ground = track.heightAt(zone.gapEnd + 1);
        const drop = Math.max(0, car.z - ground);
        const t = (car.vz + Math.sqrt(car.vz * car.vz + 2 * 9.81 * drop)) / 9.81;
        jump = u * t < remaining + 4;
      }
    }
  }

  // Empuje con histéresis: arranca con energía de sobra y sigue mientras la recta lo pida.
  let boost = false;
  if (!car.airborne && car.skill >= 0.9 && !zone) {
    let open = Infinity;
    for (let j = 0; j < 40; j += 4) open = Math.min(open, plan.speed[(first + j) % plan.speed.length]);
    boost = car.ai.boost
      ? car.energy > 0.2 && open > u + 6
      : car.energy > 0.55 && open > u + 12 && hashNoise(Math.floor(clock / 3), car.id + 11) > 0.1;
  }

  return {
    controls: createControls({ steer, throttle: brake > 0 ? 0 : throttle, brake, jump, boost }),
    ai: Object.freeze({ avoid, wobble, boost })
  };
}
