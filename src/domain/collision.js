import { clamp, sign, signedWrap } from './math.js';

/** Medio largo y medio ancho de la huella del auto proyectados sobre la pista según su rumbo. */
function extents(car, spec) {
  const c = Math.abs(Math.cos(car.psi));
  const s = Math.abs(Math.sin(car.psi));
  return { along: spec.halfLength * c + spec.halfWidth * s, across: spec.halfWidth * c + spec.halfLength * s };
}

const toTrack = car => ({
  t: car.u * Math.cos(car.psi) - car.v * Math.sin(car.psi),
  n: car.u * Math.sin(car.psi) + car.v * Math.cos(car.psi)
});

const toCar = (psi, t, n) => ({ u: t * Math.cos(psi) + n * Math.sin(psi), v: -t * Math.sin(psi) + n * Math.cos(psi) });

// Separación blanda: se corrige el 80 % de la penetración por paso y se toleran 2 cm,
// así dos autos que se rozan se empujan sin temblar de un lado al otro.
const SLOP = 0.02;
const CORRECTION = 0.8;
const separation = overlap => Math.max(0, overlap - SLOP) * CORRECTION;

/**
 * Choques entre autos: cajas en coordenadas de pista, separación por la menor penetración
 * e impulso con restitución. Los autos a distinta altura (uno saltando) no chocan.
 * Devuelve autos nuevos y un evento por choque.
 */
export function resolveContacts(cars, specOf, track, rules) {
  const next = cars.map(car => ({ ...car }));
  const events = [];
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i];
      const b = next[j];
      if (a.ghost > 0 || b.ghost > 0 || Math.abs(a.z - b.z) > 1.1) continue;
      const sa = specOf(a);
      const sb = specOf(b);
      const ds = signedWrap(b.s - a.s, track.length);
      const dn = b.n - a.n;
      const ea = extents(a, sa);
      const eb = extents(b, sb);
      const overlapAlong = ea.along + eb.along - Math.abs(ds);
      const overlapAcross = ea.across + eb.across - Math.abs(dn);
      if (overlapAlong <= 0 || overlapAcross <= 0) continue;

      const ma = sa.mass;
      const mb = sb.mass;
      const shareA = mb / (ma + mb);
      const shareB = ma / (ma + mb);
      const va = toTrack(a);
      const vb = toTrack(b);
      let closing = 0;

      if (overlapAlong < overlapAcross) {
        const dir = sign(ds);
        const push = separation(overlapAlong);
        a.s = track.wrap(a.s - dir * push * shareA);
        a.progress -= dir * push * shareA;
        b.s = track.wrap(b.s + dir * push * shareB);
        b.progress += dir * push * shareB;
        const rel = (vb.t - va.t) * dir;
        if (rel < 0) {
          const impulse = -(1 + rules.carRestitution) * rel / (1 / ma + 1 / mb);
          va.t -= dir * impulse / ma;
          vb.t += dir * impulse / mb;
          // Un toque descentrado hace girar: el de atrás empuja una esquina del de adelante.
          const lever = clamp(dn, -1.5, 1.5);
          a.r += dir * lever * impulse / (sa.inertia * 2);
          b.r -= dir * lever * impulse / (sb.inertia * 2);
          closing = -rel;
        }
      } else {
        const dir = sign(dn) || 1;
        const push = separation(overlapAcross);
        a.n -= dir * push * shareA;
        b.n += dir * push * shareB;
        const rel = (vb.n - va.n) * dir;
        if (rel < 0) {
          const impulse = -(1 + rules.carRestitution) * rel / (1 / ma + 1 / mb);
          va.n -= dir * impulse / ma;
          vb.n += dir * impulse / mb;
          const rub = (vb.t - va.t) * 0.15;
          va.t += rub * shareA;
          vb.t -= rub * shareB;
          closing = -rel;
        }
      }
      if (closing <= 0) continue;

      // Lo que aguanta cada auto: los frágiles pierden más velocidad en un golpe fuerte.
      const severity = clamp(closing / 15, 0, 1) * 0.5;
      va.t *= 1 - (1 - sa.durability) * severity;
      vb.t *= 1 - (1 - sb.durability) * severity;
      Object.assign(a, toCar(a.psi, va.t, va.n));
      Object.assign(b, toCar(b.psi, vb.t, vb.n));
      if (closing > 0.8) events.push({ type: 'car', a: a.id, b: b.id, intensity: closing });
    }
  }
  return { cars: next.map(car => Object.freeze(car)), events };
}
