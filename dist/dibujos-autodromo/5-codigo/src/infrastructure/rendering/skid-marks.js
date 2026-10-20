/**
 * Marcas de goma sobre el asfalto: tramos cortos entre dos posiciones de una rueda, en
 * coordenadas de pista. Se desvanecen solas. Pila de tamaño fijo, sin asignar por cuadro.
 */
export function createSkidMarks(capacity = 1200, lifetime = 18) {
  const pool = Array.from({ length: capacity }, () => ({ alive: false, s0: 0, n0: 0, s1: 0, n1: 0, strength: 0, age: 0 }));
  let cursor = 0;
  return {
    pool,
    lifetime,
    add(s0, n0, s1, n1, strength) {
      const mark = pool[cursor];
      cursor = (cursor + 1) % capacity;
      Object.assign(mark, { alive: true, s0, n0, s1, n1, strength, age: 0 });
    },
    update(dt) {
      for (const mark of pool) {
        if (!mark.alive) continue;
        mark.age += dt;
        if (mark.age > lifetime) mark.alive = false;
      }
    },
    clear() {
      for (const mark of pool) mark.alive = false;
    }
  };
}
