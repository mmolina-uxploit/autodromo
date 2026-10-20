/**
 * Raíz de composición: el único lugar que conoce todas las capas y las conecta.
 */
import { createRules } from './config/rules.js';
import { CAMERA } from './config/camera.js';
import { findZone } from './config/zones.js';
import { TRACKS, findTrack, trackOptions } from './config/tracks.js';
import { VEHICLES, findVehicle, findLivery, portraitUrl } from './config/vehicles.js';
import { DIFFICULTIES, LAP_OPTIONS, RIVAL_OPTIONS, RIVAL_NAMES } from './config/difficulty.js';
import { Track } from './domain/track.js';
import { createVehicleSpec } from './domain/vehicle.js';
import { createRng } from './domain/rng.js';
import { createRaceSession } from './application/race-session.js';
import { createSettingsStore } from './application/settings-store.js';
import { createActionSet } from './application/action-set.js';
import { describeTrack, presentVehicleStats, presentVehicleFacts } from './application/selection-presenters.js';
import { SessionEvent } from './application/race-events.js';
import { createBestLapRepository, createSettingsRepository } from './infrastructure/storage.js';
import { createHaptics } from './infrastructure/haptics.js';
import { createGameLoop } from './infrastructure/game-loop.js';
import { createQualityGovernor } from './infrastructure/quality.js';
import { bindKeyboard, Command } from './infrastructure/input/keyboard.js';
import { bindHoldControl } from './infrastructure/input/touch.js';
import { createGamepadInput } from './infrastructure/input/gamepad.js';
import { createCanvasRenderer } from './infrastructure/rendering/canvas-renderer.js';
import { loadSpriteAtlas } from './infrastructure/rendering/sprite-atlas.js';
import { createAudio } from './infrastructure/audio/audio-engine.js';
import { createRacePage } from './presentation/pages/race-page.js';

function safeLocalStorage() {
  try { return window.localStorage; } catch { return undefined; }
}

/** ?semilla=123 fija la grilla y los rivales para reproducir una carrera; sin ella cada carrera es distinta. */
function seedSource() {
  const fixed = Number.parseInt(new URLSearchParams(window.location.search).get('semilla'), 10);
  return Number.isInteger(fixed) ? () => fixed : () => Date.now();
}

const nextSeed = seedSource();
const rules = createRules();
const storage = safeLocalStorage();
const tracks = new Map(TRACKS.map(t => [t.id, Track.fromLayout(t.layout, trackOptions(t, rules))]));
const specs = new Map(VEHICLES.map(v => [v.id, createVehicleSpec(v.id, v.physics)]));

const settingsStore = createSettingsStore({
  repository: createSettingsRepository(storage),
  catalog: {
    tracks: TRACKS.map(t => t.id),
    vehicles: VEHICLES.map(v => v.id),
    liveries: Object.fromEntries(VEHICLES.map(v => [v.id, v.liveries.map(l => l.id)])),
    laps: LAP_OPTIONS,
    defaultLaps: 3,
    difficulties: DIFFICULTIES.map(d => d.id),
    defaultDifficulty: 'normal',
    rivals: RIVAL_OPTIONS,
    defaultRivals: 5,
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
});

const actions = createActionSet();
const session = createRaceSession({
  tracks,
  vehicles: VEHICLES,
  specs,
  difficulties: DIFFICULTIES,
  rivalNames: RIVAL_NAMES,
  rules,
  createRng: () => createRng(nextSeed()),
  bestLapRepository: createBestLapRepository(storage),
  haptics: createHaptics(navigator),
  getSettings: () => settingsStore.current
});

const swatchOf = car => findLivery(findVehicle(car.model), car.livery).swatch;
const canvas = document.createElement('canvas');
const renderer = createCanvasRenderer(canvas, { rules, cameraConfig: CAMERA, colorOf: swatchOf });
const audio = createAudio();

const page = createRacePage({
  root: document.getElementById('app'),
  canvas,
  session,
  settingsStore,
  vehicles: VEHICLES.map(v => ({ ...v, stats: presentVehicleStats(specs.get(v.id)), facts: presentVehicleFacts(specs.get(v.id)) })),
  tracks: TRACKS.map(t => ({ ...t, zone: findZone(t.zone), info: describeTrack(tracks.get(t.id)) })),
  difficulties: DIFFICULTIES,
  lapOptions: LAP_OPTIONS,
  rivalOptions: RIVAL_OPTIONS,
  portraitUrl,
  actions,
  bindHold: bindHoldControl
});

function applyWorld() {
  const { track, trackId } = session.world;
  renderer.setTrack(track);
  renderer.setZone(findZone(findTrack(trackId).zone));
}

function applySettings(settings) {
  session.syncSelection();
  renderer.setReducedMotion(settings.reducedMotion);
  audio.configure({ sound: settings.sound, music: settings.music });
}

session.subscribe(event => { if (event.type === SessionEvent.WORLD_CHANGED) applyWorld(); });
settingsStore.subscribe(applySettings);
session.startDemo();
applyWorld();
applySettings(settingsStore.current);

bindKeyboard(window, {
  actions,
  isGameActive: page.isGameActive,
  onCommand: command => { if (command === Command.PAUSE) page.requestPause(); }
});
window.addEventListener('blur', () => actions.releaseAll());
const gamepad = createGamepadInput({ actions, isGameActive: page.isGameActive, onPause: page.requestPause, onMenu: page.navigate });

// El audio del navegador solo arranca tras un gesto del jugador.
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => audio.unlock(), { passive: true });

function frame(dt) {
  gamepad.poll();
  const result = session.tick(dt, actions.snapshot());
  renderer.render(result.state, { dt, events: result.events, minimap: !session.isDemo });
  audio.update(result.state, result.events, dt, { demo: session.isDemo, trackLength: session.world.track.length, zone: findTrack(session.world.trackId).zone });
  page.onFrame(result);
}

// Calidad gráfica: alta por defecto; ?calidad=alta|media|baja la fija (sin ajuste automático).
const QUALITY = { alta: 2, media: 1, baja: 0 };
const forcedQuality = QUALITY[new URLSearchParams(window.location.search).get('calidad')];
const quality = createQualityGovernor({ initial: forcedQuality ?? 2, onChange: level => renderer.setQuality(level) });
renderer.setQuality(quality.level);

const loop = createGameLoop({ onFrame: dt => { if (forcedQuality === undefined) quality.sample(dt); frame(dt); } });

new ResizeObserver(() => renderer.resize()).observe(canvas);
renderer.resize();
loop.start();


document.addEventListener('visibilitychange', () => {
  if (document.hidden) { loop.stop(); audio.suspend(); } else if (!new URLSearchParams(window.location.search).get('escena')) { loop.start(); audio.resume(); }
});

const atlasReady = loadSpriteAtlas('assets/sprites')
  .then(atlas => renderer.setAtlas(atlas))
  .catch(error => console.warn('Sprites no disponibles; se usa el dibujo de respaldo.', error));

// ?depurar expone la sesión y permite avanzar cuadros a mano (pruebas en navegadores sin animación).
// Con &escena=demo|carrera arma una situación y congela el ciclo para capturarla:
// &pista=, &auto=, &hasta=metros recorridos, &segundos=, &acelerar, &saltar=segundos, &empujar.
const debug = new URLSearchParams(window.location.search);
if (debug.has('depurar')) {
  const frames = (count = 1, dt = 1 / 60) => { for (let i = 0; i < count; i++) frame(dt); return session.state; };
  window.autodromo = { session, settingsStore, actions, frames, audio, renderer };
  const scene = debug.get('escena');
  if (scene) {
    if (debug.get('pista')) settingsStore.update({ track: debug.get('pista') });
    if (debug.get('auto')) settingsStore.update({ vehicle: debug.get('auto') });
    loop.stop();
    if (scene === 'carrera') {
      page.debug.startRace();
      frames(200);
      if (debug.has('acelerar')) actions.press('throttle', 'depurar');
    } else {
      session.startDemo();
      page.debug.closeMenus();
    }
    const player = () => session.state.cars.find(c => c.id === session.state.playerId);
    const target = Number(debug.get('hasta') ?? 0);
    // Se simula sin dibujar hasta el punto pedido; solo los últimos cuadros se dibujan.
    for (let i = 0; i < 20000 && player().progress < target; i++) session.tick(1 / 60, actions.snapshot());
    frames(30);
    const jumpAt = Number(debug.get('saltar') ?? -1);
    const seconds = Number(debug.get('segundos') ?? 0);
    for (let i = 0; i < seconds * 60; i++) {
      if (i === Math.round(jumpAt * 60)) actions.press('jump', 'depurar');
      if (!debug.has('planear') && i === Math.round(jumpAt * 60) + 12) actions.release('jump', 'depurar');
      if (debug.has('empujar') && i === 0) actions.press('boost', 'depurar');
      frame(1 / 60);
    }
    page.debug.closeMenus();
    atlasReady.then(() => {
      frame(1 / 60);
      document.documentElement.dataset.escena = 'lista';
    });
  }
}
