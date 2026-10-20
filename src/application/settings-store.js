import { createSettings, updateSettings } from './settings.js';

/** Caso de uso: leer, cambiar y persistir ajustes, avisando a quien escuche. */
export function createSettingsStore({ repository, catalog }) {
  let current = createSettings(repository.load() ?? {}, catalog);
  const listeners = new Set();

  return {
    get current() { return current; },
    update(patch) {
      current = updateSettings(current, patch, catalog);
      repository.save(current);
      for (const listener of listeners) listener(current);
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
