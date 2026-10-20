/** Registro de acciones sostenidas por varias fuentes de entrada (teclado, táctil). */
export function createActionSet() {
  const holders = new Map();

  return {
    press(action, source = 'default') {
      if (!holders.has(action)) holders.set(action, new Set());
      holders.get(action).add(source);
    },
    release(action, source = 'default') {
      const sources = holders.get(action);
      if (!sources) return;
      sources.delete(source);
      if (sources.size === 0) holders.delete(action);
    },
    releaseSource(source) {
      for (const action of [...holders.keys()]) this.release(action, source);
    },
    releaseAll() {
      holders.clear();
    },
    has(action) {
      return holders.has(action);
    },
    snapshot() {
      return new Set(holders.keys());
    }
  };
}
