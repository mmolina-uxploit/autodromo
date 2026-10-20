import { RaceEvent, RaceStatus } from '../../application/race-events.js';
import { presentHud, describeEvent, formatLapTime, ordinal } from '../../application/hud-presenter.js';
import { findVehicle, findLivery } from '../../config/vehicles.js';
import { RaceLayout } from '../templates/race-layout.js';
import { Hud } from '../organisms/hud.js';
import { TouchControls } from '../organisms/touch-controls.js';
import { TitleScreen } from '../organisms/title-screen.js';
import { CarSelect } from '../organisms/car-select.js';
import { TrackSelect } from '../organisms/track-select.js';
import { RaceSetup } from '../organisms/race-setup.js';
import { ResultsPanel } from '../organisms/results-panel.js';
import { PauseMenu } from '../organisms/pause-menu.js';
import { SettingsPanel } from '../organisms/settings-panel.js';
import { HelpPanel } from '../organisms/help-panel.js';
import { Toast } from '../molecules/toast.js';
import { Countdown } from '../molecules/countdown.js';
import { LiveRegion } from '../atoms/live-region.js';
import { createDialogStack } from '../dialog-stack.js';

const RACING = [RaceStatus.RUNNING, RaceStatus.COUNTDOWN];
const RESULTS_DELAY_MS = 1600;
const FOCUSABLE = 'button:not([hidden]):not([disabled]), input:not([disabled]), [role="switch"]';

/**
 * Página de carrera: título arcade, flujo Auto → Pista → Carrera, carrera, pausa y resultados.
 * Traduce eventos de la sesión en interfaz. `tracks` y `vehicles` llegan con sus resúmenes ya
 * calculados desde la raíz de composición.
 */
export function createRacePage({
  root, canvas, session, settingsStore, vehicles, tracks, difficulties, lapOptions, rivalOptions, portraitUrl, actions, bindHold
}) {
  const layout = RaceLayout({ canvas });
  const hud = Hud({ onPause: requestPause });
  const touch = TouchControls({
    bindHold,
    onAction: (action, pressed) => (pressed ? actions.press(action, 'touch') : actions.release(action, 'touch'))
  });
  const toast = Toast();
  const countdown = Countdown();
  const live = LiveRegion();
  let resultsTimer = 0;

  const title = TitleScreen({ onStart: openFlow, onSettings: openSettings, onHelp: openHelp });
  const carSelect = CarSelect({
    vehicles,
    settings: settingsStore.current,
    portraitUrl,
    onVehicle: vehicle => settingsStore.update({ vehicle }),
    onLivery: livery => settingsStore.update({ livery }),
    onBack: back,
    onNext: () => openStep(trackSelect)
  });
  const trackSelect = TrackSelect({
    tracks,
    settings: settingsStore.current,
    onTrack: track => settingsStore.update({ track }),
    onBack: back,
    onNext: () => openStep(raceSetup)
  });
  const raceSetup = RaceSetup({
    settings: settingsStore.current,
    laps: lapOptions,
    difficulties,
    rivals: rivalOptions,
    onChange: patch => settingsStore.update(patch),
    onBack: back,
    onStart: startRace
  });
  const results = ResultsPanel({ onRematch: rematch, onChange: changeFromResults, onMenu: exitToTitle });
  const pauseMenu = PauseMenu({ onResume: resume, onRestart: restart, onSettings: openSettings, onHelp: openHelp, onExit: exitToTitle });
  const settingsPanel = SettingsPanel({ settings: settingsStore.current, onChange: patch => settingsStore.update(patch), onDone: back });
  const helpPanel = HelpPanel({ onDone: back });

  layout.slots.hud.append(hud.el);
  layout.slots.overlay.append(countdown.el, toast.el);
  layout.slots.controls.append(touch.el);
  layout.slots.live.append(live.el);
  root.replaceChildren(layout.el);

  const dialogs = createDialogStack({
    host: layout.slots.dialogs,
    onEmpty: () => layout.stage.focus({ preventScroll: true })
  });

  const isRacing = () => !session.isDemo && RACING.includes(session.state.status);
  function back() { dialogs.back(); }

  function openStep(panel) {
    dialogs.open(panel, { onCancel: back });
  }

  function openFlow() {
    carSelect.setValues(settingsStore.current);
    openStep(carSelect);
  }

  function startRace() {
    clearTimeout(resultsTimer);
    dialogs.closeAll();
    actions.releaseAll();
    countdown.hide();
    session.start();
  }

  function rematch() {
    clearTimeout(resultsTimer);
    dialogs.closeAll();
    actions.releaseAll();
    countdown.hide();
    session.restart();
  }

  function exitToTitle() {
    clearTimeout(resultsTimer);
    countdown.hide();
    dialogs.closeAll();
    session.startDemo();
    refreshSelection(settingsStore.current);
    dialogs.open(title);
  }

  function changeFromResults() {
    clearTimeout(resultsTimer);
    dialogs.closeAll();
    session.startDemo();
    dialogs.open(title);
    openFlow();
  }

  function requestPause() {
    if (!isRacing()) return;
    actions.releaseAll();
    session.pause();
    dialogs.open(pauseMenu, { onCancel: resume });
  }

  function resume() {
    dialogs.closeAll();
    session.resume();
  }

  function restart() {
    rematch();
  }

  function openSettings() {
    settingsPanel.setValues(settingsStore.current);
    dialogs.open(settingsPanel, { onCancel: back });
  }

  function openHelp() {
    dialogs.open(helpPanel, { onCancel: back });
  }

  function describeSetup(settings) {
    const vehicle = findVehicle(settings.vehicle);
    const track = tracks.find(t => t.id === settings.track) ?? tracks[0];
    const difficulty = difficulties.find(d => d.id === settings.difficulty) ?? difficulties[0];
    const rivals = settings.rivals === 0 ? 'contrarreloj' : `${settings.rivals} rivales`;
    return `${track.name} con ${vehicle.name}: ${settings.laps} ${settings.laps === 1 ? 'vuelta' : 'vueltas'}, ${difficulty.name.toLowerCase()}, ${rivals}.`;
  }

  function refreshSelection(settings) {
    const vehicle = findVehicle(settings.vehicle);
    const trackItem = tracks.find(t => t.id === settings.track) ?? tracks[0];
    const best = formatLapTime(session.bestLapFor(trackItem.id, vehicle.id));
    title.setRecord(best ? `Récord en ${trackItem.name} con ${vehicle.name}: ${best}` : '');
    trackSelect.setBestLaps(trackId => {
      const time = formatLapTime(session.bestLapFor(trackId, vehicle.id));
      return time ? `Mejor con ${vehicle.name}: ${time}` : `Sin vueltas con ${vehicle.name}`;
    });
    raceSetup.setValues(settings, describeSetup);
  }

  function showResults(list) {
    const winner = list[0];
    const mine = list.find(r => r.isPlayer);
    const solo = list.length === 1;
    const rows = list.map(r => {
      const vehicle = findVehicle(r.model);
      const livery = findLivery(vehicle, r.livery);
      const time = r.finished
        ? (r === winner ? formatLapTime(r.time) : `+${(r.time - winner.time).toFixed(2).replace('.', ',')} s`)
        : 'En pista';
      return {
        position: ordinal(r.position),
        name: r.name,
        car: `${vehicle.name} ${livery.name.toLowerCase()}`,
        time,
        best: formatLapTime(r.bestLap) ?? '—',
        isPlayer: r.isPlayer
      };
    });
    const headline = solo ? `Tiempo total: ${formatLapTime(mine.time)}`
      : mine.position === 1 ? '¡Ganaste la carrera!'
        : `Llegaste ${ordinal(mine.position)} de ${list.length}.`;
    results.show({ title: headline, rows });
    dialogs.open(results, { onCancel: exitToTitle });
  }

  function onRaceEvent(event) {
    const announcement = describeEvent(event);
    if (announcement) live.announce(announcement);
    switch (event.type) {
      case RaceEvent.COUNTDOWN_TICK: countdown.show(String(event.value)); break;
      case RaceEvent.STARTED: countdown.show('¡Ya!', 700); break;
      case RaceEvent.LAP_COMPLETED:
        toast.show(`${event.isBest ? '¡Mejor vuelta!' : `Vuelta ${event.lap}`} ${formatLapTime(event.time)}`);
        refreshSelection(settingsStore.current);
        break;
      case RaceEvent.FINAL_LAP: toast.show('¡Última vuelta!', 2600); break;
      case RaceEvent.POSITION_CHANGED:
        if (event.position < event.previous) toast.show(`¡Pasaste a ${ordinal(event.position)}!`, 1400);
        break;
      case RaceEvent.FELL: if (event.player) toast.show('¡Al foso! Volvés antes de la rampa', 2000); break;
      case RaceEvent.LANDED:
        if (event.player && event.airTime > 1.1) toast.show(`Vuelo de ${event.airTime.toFixed(1).replace('.', ',')} s`, 1300);
        break;
      case RaceEvent.FINISHED:
        if (event.player) toast.show('¡Bandera a cuadros!', 2400);
        break;
      case RaceEvent.RACE_OVER:
        resultsTimer = setTimeout(() => showResults(event.results), RESULTS_DELAY_MS);
        break;
      default:
    }
  }

  function applySettings(settings) {
    touch.setSwapped(settings.swapControls);
    touch.setAutoThrottle(settings.autoThrottle);
    document.documentElement.classList.toggle('is-reduced-motion', settings.reducedMotion);
    carSelect.setValues(settings);
    trackSelect.setValues(settings);
    settingsPanel.setValues(settings);
    refreshSelection(settings);
  }

  /** Navegación de menús con mando: mueve el foco, cambia opciones, confirma o vuelve. */
  function navigate(button) {
    const top = layout.slots.dialogs.querySelector('dialog[open]');
    if (!top) return;
    const items = [...top.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
    const active = document.activeElement;
    const index = items.indexOf(active);
    if (button === 'UP' || button === 'DOWN') {
      const step = button === 'DOWN' ? 1 : -1;
      const next = items[(index + step + items.length) % items.length] ?? items[0];
      next?.focus();
    } else if ((button === 'LEFT' || button === 'RIGHT') && active?.type === 'radio') {
      const group = [...top.querySelectorAll(`input[name="${active.name}"]`)];
      const next = group[(group.indexOf(active) + (button === 'RIGHT' ? 1 : -1) + group.length) % group.length];
      next.checked = true;
      next.focus();
      next.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (button === 'A' || button === 'START') {
      active?.click();
    } else if (button === 'B') {
      top.dispatchEvent(new Event('cancel', { cancelable: true }));
    }
  }

  session.subscribe(onRaceEvent);
  settingsStore.subscribe(applySettings);
  applySettings(settingsStore.current);
  document.addEventListener('visibilitychange', () => { if (document.hidden) requestPause(); });

  dialogs.open(title);

  return {
    onFrame(result) {
      layout.el.classList.toggle('is-menu', session.isDemo);
      if (!session.isDemo) hud.update(presentHud(result.state));
    },
    requestPause,
    navigate,
    isGameActive: () => !dialogs.isOpen && !session.isDemo,
    /** Solo para escenas de depuración y pruebas de punta a punta. */
    debug: { startRace, closeMenus: () => dialogs.closeAll() }
  };
}
