import { createMusic } from './music.js';
import { createSampleBank } from './sample-bank.js';
import { createRecordedLayers } from './recorded-audio.js';

/**
 * Sonido con Web Audio. Motores, neumáticos, viento, propulsores y golpes salen de grabaciones
 * reales (assets/audio, CC0) en cuanto el banco termina de decodificarse; mientras tanto, y para
 * el zumbido eléctrico del Volta, suena la síntesis de osciladores y ruido filtrado. La música
 * y los pitidos de largada son sintetizados. El contexto se crea con el primer gesto del jugador,
 * como exigen los navegadores.
 */
const ENGINES = Object.freeze({
  cuna: { pulses: 4, shape: 'sawtooth', drive: 3.2, cutoff: 2600 },
  saeta: { pulses: 3, shape: 'sawtooth', drive: 2.4, cutoff: 3200 },
  bloque: { pulses: 2, shape: 'square', drive: 4, cutoff: 1500 },
  volta: { electric: true }
});

const RIVAL_VOICES = 3;

/** Cuánto eco tiene cada zona: bajo el viaducto rebota todo, junto al mar casi nada. */
const REVERB = Object.freeze({ 'bajo-autopista': 0.32, 'distrito-torre': 0.2, 'anillo-neon': 0.16, 'costa-rosa': 0.05, 'valle-alto': 0.04 });

function softClip(amount) {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

export function createAudio({ createContext = () => {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}, bankUrl = 'assets/audio' } = {}) {
  let ctx = null;
  let nodes = null;
  let music = null;
  let recorded = null;
  let bank = null;
  try {
    bank = bankUrl ? createSampleBank(bankUrl) : null;
    bank?.ready.catch(error => console.warn('Sonidos grabados no disponibles; se usa la síntesis.', error));
  } catch {
    bank = null;
  }
  let settings = { sound: true, music: true };
  let lastModel = null;

  const ramp = (param, value, time = 0.05) => {
    if (!ctx) return;
    param.setTargetAtTime(value, ctx.currentTime, time);
  };

  function noiseBuffer() {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function impulse(seconds, decay) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
    return buffer;
  }

  function noiseSource() {
    const src = ctx.createBufferSource();
    src.buffer = nodes.noise;
    src.loop = true;
    src.start();
    return src;
  }

  function filter(type, frequency, q = 1) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  function gain(value = 0) {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  }

  function osc(type, frequency) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = frequency;
    o.start();
    return o;
  }

  /** Ruido continuo filtrado que se abre y cierra con un gain. */
  function noiseLayer(type, frequency, q, destination) {
    const src = noiseSource();
    const f = filter(type, frequency, q);
    const g = gain();
    src.connect(f).connect(g).connect(destination);
    return { filter: f, gain: g };
  }

  function buildPlayerEngine() {
    const out = gain();
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClip(2.6);
    const low = filter('lowpass', 800, 3);
    const a = osc('sawtooth', 60);
    const b = osc('square', 30);
    const c = osc('sawtooth', 120);
    const ga = gain(0.5); const gb = gain(0.35); const gc = gain(0.18);
    a.connect(ga).connect(shaper);
    b.connect(gb).connect(shaper);
    c.connect(gc).connect(shaper);
    shaper.connect(low).connect(out).connect(nodes.sfx);
    const whine = osc('sine', 300);
    const whine2 = osc('triangle', 450);
    const whineGain = gain();
    whine.connect(whineGain);
    whine2.connect(gain(0.4)).connect(whineGain);
    whineGain.connect(nodes.sfx);
    const intake = noiseLayer('bandpass', 400, 1.2, nodes.sfx);
    return { out, low, a, b, c, shaper, whine, whine2, whineGain, intake };
  }

  function buildRivalVoice() {
    const o = osc('sawtooth', 80);
    const low = filter('lowpass', 900, 1.5);
    const g = gain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(low).connect(g);
    if (pan) g.connect(pan).connect(nodes.sfx); else g.connect(nodes.sfx);
    return { o, low, g, pan };
  }

  function build() {
    const master = gain(0.9);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    const sfx = gain(settings.sound ? 1 : 0);
    const musicBus = gain(settings.music ? 0.32 : 0);
    sfx.connect(master);
    musicBus.connect(master);
    nodes = { master, sfx, musicBus, noise: null };
    nodes.noise = noiseBuffer();
    nodes.engine = buildPlayerEngine();
    nodes.rivals = Array.from({ length: RIVAL_VOICES }, buildRivalVoice);
    nodes.tires = noiseLayer('bandpass', 1500, 5, sfx);
    nodes.wind = noiseLayer('lowpass', 520, 0.7, sfx);
    nodes.rumble = noiseLayer('lowpass', 150, 1, sfx);
    nodes.hiss = noiseLayer('highpass', 1900, 0.8, sfx);
    nodes.roar = noiseLayer('bandpass', 320, 0.9, sfx);
    nodes.scrape = noiseLayer('bandpass', 2600, 3, sfx);
    // Reverberación por zona: respuesta al impulso de ruido con caída exponencial, sin archivos.
    nodes.reverb = ctx.createConvolver();
    nodes.reverb.buffer = impulse(2.2, 2.6);
    nodes.wet = gain(0);
    sfx.connect(nodes.reverb).connect(nodes.wet).connect(master);
    music = createMusic(ctx, musicBus);
    bank?.decode(ctx)
      .then(() => { recorded = createRecordedLayers(ctx, sfx, bank); })
      .catch(error => console.warn('No se pudieron decodificar los sonidos grabados.', error));
  }

  // ───────────── efectos puntuales ─────────────

  function envelope(g, peak, attack, release, at = ctx.currentTime) {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
  }

  function beep(frequency, duration, type = 'square', volume = 0.18, at = ctx.currentTime) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = frequency;
    const g = gain();
    o.connect(g).connect(nodes.sfx);
    envelope(g, volume, 0.008, duration, at);
    o.start(at);
    o.stop(at + duration + 0.05);
  }

  function burst({ type = 'lowpass', from = 800, to = 200, q = 1, volume = 0.3, duration = 0.3 }) {
    const src = ctx.createBufferSource();
    src.buffer = nodes.noise;
    const f = filter(type, from, q);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), ctx.currentTime + duration);
    const g = gain();
    src.connect(f).connect(g).connect(nodes.sfx);
    envelope(g, volume, 0.005, duration);
    src.start();
    src.stop(ctx.currentTime + duration + 0.05);
  }

  function thump(volume) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.25);
    const g = gain();
    o.connect(g).connect(nodes.sfx);
    envelope(g, volume, 0.004, 0.28);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  }

  function crash(intensity) {
    const v = Math.min(0.55, 0.12 + intensity * 0.03);
    burst({ type: 'bandpass', from: 1600, to: 500, q: 0.8, volume: v, duration: 0.35 });
    thump(v * 0.9);
    beep(1870 + Math.random() * 300, 0.25, 'triangle', v * 0.25);
    beep(2930 + Math.random() * 300, 0.18, 'triangle', v * 0.18);
  }

  function arpeggio(notes, step = 0.09, type = 'square', volume = 0.12) {
    notes.forEach((f, i) => beep(f, 0.16, type, volume, ctx.currentTime + i * step));
  }

  function onEvent(event, race) {
    const mine = event.player || event.carId === race.playerId;
    if (recorded?.onEvent(event, mine, race)) return;
    switch (event.type) {
      case 'countdown-tick': beep(440, 0.22, 'square', 0.16); break;
      case 'started': beep(880, 0.55, 'square', 0.18); break;
      case 'collision': if (mine || event.intensity > 6) crash(event.intensity * (mine ? 1 : 0.4)); break;
      case 'landed': if (mine && event.impact > 1.5) { thump(Math.min(0.5, event.impact * 0.06)); burst({ from: 600, to: 120, volume: Math.min(0.3, event.impact * 0.03), duration: 0.25 }); } break;
      case 'bottom-out': if (mine) burst({ type: 'bandpass', from: 3000, to: 1200, q: 2, volume: 0.18, duration: 0.2 }); break;
      case 'thrust': if (mine) { burst({ type: 'bandpass', from: 400, to: 3200, q: 0.7, volume: 0.35, duration: 0.45 }); thump(0.25); } break;
      case 'fell': if (mine) burst({ type: 'lowpass', from: 2400, to: 90, volume: 0.4, duration: 0.9 }); break;
      case 'shift': if (mine && event.up) beep(180, 0.05, 'square', 0.05); break;
      case 'lap-completed': arpeggio(event.isBest ? [523, 659, 784, 1047] : [523, 784]); break;
      case 'final-lap': arpeggio([659, 659, 880, 880, 1175], 0.11); break;
      case 'position-changed': if (event.position < event.previous) arpeggio([784, 1047], 0.07, 'triangle', 0.1); break;
      case 'finished': if (mine) arpeggio([523, 659, 784, 1047, 784, 1047, 1319], 0.12, 'square', 0.14); break;
      default:
    }
  }

  // ───────────── sonido continuo ─────────────

  function updatePlayer(car, spec, model) {
    const e = nodes.engine;
    const profile = ENGINES[model] ?? ENGINES.cuna;
    const speed = Math.abs(car.u);
    const throttle = car.throttle ?? 0;
    if (model !== lastModel) {
      lastModel = model;
      for (const o of [e.a, e.c]) o.type = profile.shape ?? 'sawtooth';
      e.shaper.curve = softClip(profile.drive ?? 2.6);
    }
    if (profile.electric) {
      ramp(e.out.gain, 0);
      const f = 90 + speed * 24;
      ramp(e.whine.frequency, f, 0.03);
      ramp(e.whine2.frequency, f * 1.5, 0.03);
      ramp(e.whineGain.gain, 0.03 + throttle * 0.05 + Math.min(0.04, speed * 0.0008));
      ramp(e.intake.gain.gain, throttle * 0.02);
    } else {
      ramp(e.whineGain.gain, 0);
      const f0 = (car.rpm / 60) * profile.pulses;
      ramp(e.a.frequency, f0, 0.02);
      ramp(e.b.frequency, f0 / 2, 0.02);
      ramp(e.c.frequency, f0 * 2.01, 0.02);
      const shifting = car.shift > 0;
      ramp(e.low.frequency, 260 + throttle * profile.cutoff + car.rpm * 0.12, 0.04);
      ramp(e.out.gain, shifting ? 0.06 : 0.1 + throttle * 0.13, 0.03);
      ramp(e.intake.filter.frequency, f0 * 3, 0.03);
      ramp(e.intake.gain.gain, throttle * 0.07);
    }
    ramp(nodes.tires.gain.gain, car.airborne ? 0 : Math.min(0.16, car.slip * 0.2));
    ramp(nodes.tires.filter.frequency, 1300 + car.slip * 900);
    ramp(nodes.wind.gain.gain, Math.min(0.14, (speed / 90) ** 2 * 0.14));
    ramp(nodes.rumble.gain.gain, car.airborne ? 0 : Math.min(0.3, (car.curb * 0.6 + car.offroad) * speed * 0.012));
    ramp(nodes.hiss.gain.gain, 0.16 * (car.liftLevel ?? (car.lifting ? 1 : 0)), 0.03);
    ramp(nodes.roar.gain.gain, 0.26 * (car.boostLevel ?? (car.boosting ? 1 : 0)), 0.04);
    ramp(nodes.scrape.gain.gain, car.wallContact > 2 ? Math.min(0.2, car.wallContact * 0.008) : 0, 0.03);
  }

  function silencePlayer() {
    const e = nodes.engine;
    for (const g of [e.out.gain, e.whineGain.gain, e.intake.gain.gain, nodes.tires.gain.gain, nodes.wind.gain.gain,
      nodes.rumble.gain.gain, nodes.hiss.gain.gain, nodes.roar.gain.gain, nodes.scrape.gain.gain]) ramp(g, 0, 0.1);
  }

  function updateRivals(race, focus, demo, length) {
    const near = race.cars
      .filter(c => c.id !== focus.id)
      .map(c => {
        let ds = c.s - focus.s;
        if (Math.abs(ds) > length / 2) ds -= Math.sign(ds) * length;
        return { car: c, d: Math.hypot(ds, c.n - focus.n), side: c.n - focus.n };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, RIVAL_VOICES);
    nodes.rivals.forEach((voice, i) => {
      const item = near[i];
      if (!item || item.d > 90) { ramp(voice.g.gain, 0, 0.1); return; }
      const spec = race.specs[item.car.specId];
      const f = spec.electric ? 140 + Math.abs(item.car.u) * 18 : (item.car.rpm / 60) * 3;
      ramp(voice.o.frequency, f, 0.05);
      ramp(voice.low.frequency, 500 + item.car.throttle * 1400);
      ramp(voice.g.gain, (demo ? 0.025 : 0.06) / (1 + item.d / 10), 0.08);
      if (voice.pan) ramp(voice.pan.pan, Math.max(-1, Math.min(1, item.side / 8)), 0.08);
    });
  }

  return {
    unlock() {
      if (!ctx) {
        try {
          ctx = createContext();
        } catch {
          ctx = null;
        }
        if (!ctx) return;
        build();
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (settings.music) music.start();
    },
    configure(next) {
      settings = { ...settings, ...next };
      if (!ctx || !nodes) return;
      ramp(nodes.sfx.gain, settings.sound ? 1 : 0, 0.1);
      ramp(nodes.musicBus.gain, settings.music ? 0.32 : 0, 0.2);
      if (settings.music) music.start(); else music.stop();
    },
    update(race, events, dt, { demo = false, trackLength = Infinity, zone = null } = {}) {
      if (!ctx || !nodes || ctx.state !== 'running') return;
      const focus = race.cars.find(c => c.id === race.playerId) ?? race.cars[0];
      // El indicador viene del dominio (race.js marca el auto al cruzar la meta) y sobrevive a la
      // interpolación. Mirar el estado de la carrera no alcanza: entre la bandera a cuadros y el
      // final pasan varios segundos en los que el auto ya no es del jugador.
      const over = Boolean(focus.finished);
      music.setIntensity(demo || over ? 0.5 : race.status === 'running' ? 1 : 0.5);
      music.tick();
      const spec = race.specs[focus.specId];
      ramp(nodes.wet.gain, REVERB[zone] ?? 0.1, 0.5);
      if (recorded) {
        recorded.update(race, focus, { demo, trackLength, zone, dt, over });
        silencePlayer();
        for (const voice of nodes.rivals) ramp(voice.g.gain, 0, 0.1);
      } else {
        if (demo || over) silencePlayer();
        else updatePlayer(focus, spec, focus.model);
        updateRivals(race, focus, demo, trackLength);
      }
      if (!demo) for (const event of events ?? []) onEvent(event, race);
    },
    /** Estado para depuración: contexto y si las grabaciones ya suenan. */
    get status() { return { context: ctx?.state ?? 'sin crear', recorded: Boolean(recorded), bank: Boolean(bank?.manifest) }; },
    suspend() { ctx?.suspend?.().catch(() => {}); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }
  };
}
