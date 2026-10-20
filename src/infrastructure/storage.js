function createJsonStore(storage, key) {
  return {
    read() {
      try {
        const raw = storage?.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        storage?.setItem(key, JSON.stringify(value));
      } catch {
        /* almacenamiento lleno o bloqueado: el juego sigue sin persistir */
      }
    }
  };
}

/** Mejores vueltas por clave (pista/auto), guardadas juntas en un solo registro. */
export function createBestLapRepository(storage, key = 'autodromo.mejores-vueltas') {
  const store = createJsonStore(storage, key);
  const all = () => {
    const value = store.read();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };
  return {
    load(recordKey) {
      const value = all()[recordKey];
      return Number.isFinite(value) && value > 0 ? value : null;
    },
    save(recordKey, seconds) {
      store.write({ ...all(), [recordKey]: seconds });
    }
  };
}

export function createSettingsRepository(storage, key = 'autodromo.ajustes') {
  const store = createJsonStore(storage, key);
  return {
    load() {
      const value = store.read();
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    },
    save: settings => store.write(settings)
  };
}
