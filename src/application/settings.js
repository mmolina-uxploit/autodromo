const isBoolean = value => typeof value === 'boolean';
const pick = (value, allowed) => (allowed.includes(value) ? value : allowed[0]);
const pickOr = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

const FLAGS = Object.freeze({
  autoThrottle: () => false,
  swapControls: () => false,
  vibration: () => true,
  reducedMotion: catalog => Boolean(catalog.prefersReducedMotion),
  sound: () => true,
  music: () => true
});

/**
 * Ajustes del jugador, siempre válidos respecto del catálogo.
 * El color depende del auto: si no le pertenece, se usa el primero del auto.
 * `zone` es el nombre que usaba la versión anterior para la pista.
 * Vueltas, dificultad y rivales caen en su valor por defecto si llegan fuera del catálogo.
 */
export function createSettings(input = {}, catalog) {
  const vehicle = pick(input.vehicle, catalog.vehicles);
  const flags = Object.entries(FLAGS).map(([key, fallback]) =>
    [key, isBoolean(input[key]) ? input[key] : fallback(catalog)]);
  return Object.freeze({
    track: pick(input.track ?? input.zone, catalog.tracks),
    vehicle,
    livery: pick(input.livery, catalog.liveries[vehicle]),
    laps: pickOr(input.laps, catalog.laps ?? [3], catalog.defaultLaps ?? 3),
    difficulty: pickOr(input.difficulty, catalog.difficulties ?? ['normal'], catalog.defaultDifficulty ?? 'normal'),
    rivals: pickOr(input.rivals, catalog.rivals ?? [5], catalog.defaultRivals ?? 5),
    ...Object.fromEntries(flags)
  });
}

function acceptedFields(settings, patch, catalog) {
  const vehicle = catalog.vehicles.includes(patch.vehicle) ? patch.vehicle : settings.vehicle;
  const valid = {
    track: v => catalog.tracks.includes(v),
    vehicle: v => catalog.vehicles.includes(v),
    livery: v => catalog.liveries[vehicle].includes(v),
    laps: v => (catalog.laps ?? []).includes(v),
    difficulty: v => (catalog.difficulties ?? []).includes(v),
    rivals: v => (catalog.rivals ?? []).includes(v),
    ...Object.fromEntries(Object.keys(FLAGS).map(key => [key, isBoolean]))
  };
  return Object.fromEntries(Object.entries(patch).filter(([key, value]) => valid[key]?.(value)));
}

/** Aplica los campos válidos del parche; los inválidos conservan su valor anterior. */
export function updateSettings(settings, patch, catalog) {
  return createSettings({ ...settings, ...acceptedFields(settings, patch, catalog) }, catalog);
}
