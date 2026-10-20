/**
 * Registro de acciones sostenidas por varias fuentes de entrada (teclado, táctil, mando).
 * Además de los botones lleva ejes continuos: el stick y los gatillos de un mando publican
 * ahí su recorrido, que de otro modo se perdería al reducirlo a apretado o suelto.
 */
export function createActionSet() {
  const holders = new Map();
  const axes = new Map();

  /** De todas las fuentes del eje, la que más lejos esté del reposo. */
  function strongest(sources) {
    let best = 0;
    for (const value of sources.values()) if (Math.abs(value) > Math.abs(best)) best = value;
    return best;
  }

  function dropAxes(source) {
    for (const [name, sources] of axes) {
      sources.delete(source);
      if (sources.size === 0) axes.delete(name);
    }
  }

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
      dropAxes(source);
    },
    releaseAll() {
      holders.clear();
      axes.clear();
    },
    has(action) {
      return holders.has(action);
    },
    /** Publica el recorrido de un eje continuo. */
    setAxis(name, value, source = 'default') {
      if (!axes.has(name)) axes.set(name, new Map());
      axes.get(name).set(source, value);
    },
    /** Recorrido del eje, o null si ninguna fuente lo publica (teclado y táctil no lo hacen). */
    axis(name) {
      const sources = axes.get(name);
      return sources?.size ? strongest(sources) : null;
    },
    snapshot() {
      return new Set(holders.keys());
    }
  };
}
