/**
 * Partículas en coordenadas de pista (s, n, z) con velocidad propia. Solo efecto visual:
 * no afectan la carrera. Pila de tamaño fijo para no asignar memoria por cuadro.
 */
export const ParticleKind = Object.freeze({
  SMOKE: 0,
  DUST: 1,
  SPARK: 2,
  VAPOR: 3,
  FLAME: 4,
  WATER: 5
});

export function createParticles(capacity = 700) {
  const pool = Array.from({ length: capacity }, () => ({
    alive: false, kind: 0, s: 0, n: 0, z: 0, vs: 0, vn: 0, vz: 0, life: 0, max: 1, size: 0.3, grow: 0, color: '#fff', drag: 1, gravity: 0
  }));
  let cursor = 0;

  return {
    pool,
    spawn(p) {
      for (let tries = 0; tries < capacity; tries++) {
        const slot = pool[cursor];
        cursor = (cursor + 1) % capacity;
        if (!slot.alive || tries === capacity - 1) {
          Object.assign(slot, { drag: 1, gravity: 0, grow: 0 }, p, { alive: true, life: 0 });
          return slot;
        }
      }
      return null;
    },
    update(dt, wrapS) {
      for (const p of pool) {
        if (!p.alive) continue;
        p.life += dt;
        if (p.life >= p.max) { p.alive = false; continue; }
        const damp = Math.max(0, 1 - p.drag * dt);
        p.vs *= damp;
        p.vn *= damp;
        p.vz = p.vz * damp - p.gravity * dt;
        p.s = wrapS(p.s + p.vs * dt);
        p.n += p.vn * dt;
        p.z += p.vz * dt;
        p.size += p.grow * dt;
      }
    },
    clear() {
      for (const p of pool) p.alive = false;
    }
  };
}
