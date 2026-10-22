import { createGranularEngine } from './granular-engine.js';
import { createTireVoice } from './tire-voice.js';

/**
 * Capas de sonido grabado: motores granulares (jugador y tres rivales cercanos, con Doppler),
 * neumáticos, rodadura, viento, propulsores, superficies, mecánica y golpes. Todo sale del
 * banco de assets/audio (grabaciones CC0, ver assets/audio/CREDITOS.md); el chirrido de los
 * neumáticos (tire-voice.js), el zumbido de cordón y el petardeo son síntesis encima de las grabaciones.
 */
const RIVAL_VOICES = 3;
const SOUND_SPEED = 343;
const SURFACE = Object.freeze({ 'distrito-torre': 'pasto', 'costa-rosa': 'grava', 'bajo-autopista': 'grava', 'anillo-neon': 'grava' });

export function createRecordedLayers(ctx, destination, bank) {
  const m = bank.manifest;
  const buffer = name => bank.buffer(name);
  const set = (param, value, time = 0.06) => param.setTargetAtTime(value, ctx.currentTime, time);
  const pick = list => list?.[Math.floor(Math.random() * list.length)];
  const vary = (spread = 0.2) => 1 - spread / 2 + Math.random() * spread;

  function loop(name) {
    const src = ctx.createBufferSource();
    src.buffer = buffer(name);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 18000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(destination);
    src.start(ctx.currentTime + Math.random() * 0.05);
    return { src, filter, gain };
  }

  function play(name, { gain = 0.6, rate = 1, delay = 0, offset = 0, duration, filter } = {}) {
    const data = buffer(name);
    if (!data) return;
    const src = ctx.createBufferSource();
    src.buffer = data;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    const at = ctx.currentTime + delay;
    g.gain.value = Math.min(1.2, gain);
    let chain = src;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.setValueAtTime(filter.from, at);
      if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, at + (duration ?? 0.5));
      f.Q.value = filter.q ?? 1;
      chain = src.connect(f);
    }
    chain.connect(g).connect(destination);
    if (duration) {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), at + duration * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      src.start(at, offset, duration + 0.05);
    } else {
      src.start(at, offset);
    }
  }

  // Ruido corto para el petardeo del escape.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  noise.getChannelData(0).forEach((_, i, data) => { data[i] = Math.random() * 2 - 1; });

  function pop(at, volume) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500 + Math.random() * 700;
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05 + Math.random() * 0.04);
    src.connect(f).connect(g).connect(destination);
    src.start(at, Math.random() * 0.1, 0.1);
  }

  // Zumbido del cordón: pulsos graves cuya frecuencia sigue a la velocidad.
  const curbOsc = ctx.createOscillator();
  curbOsc.type = 'square';
  curbOsc.frequency.value = 30;
  const curbFilter = ctx.createBiquadFilter();
  curbFilter.type = 'lowpass';
  curbFilter.frequency.value = 220;
  const curbGain = ctx.createGain();
  curbGain.gain.value = 0;
  curbOsc.connect(curbFilter).connect(curbGain).connect(destination);
  curbOsc.start();

  // Tono limpio del motor eléctrico, debajo de la textura grabada del inversor.
  const whine = ctx.createOscillator();
  whine.type = 'sine';
  const whine2 = ctx.createOscillator();
  whine2.type = 'sine';
  const whineGain = ctx.createGain();
  whineGain.gain.value = 0;
  whine.connect(whineGain);
  whine2.connect(whineGain);
  whineGain.connect(destination);
  whine.start();
  whine2.start();

  const tires = createTireVoice(ctx, destination);
  const road = loop(m.bucles.rodadura);
  const wind = loop(m.bucles.viento);
  const hover = loop(m.bucles.planeo);
  const boost = loop(m.bucles.empuje);

  const engineFor = (model, options = {}) => {
    const spec = m.motores[model];
    if (!spec) return null;
    if (spec.textura) {
      return createGranularEngine(ctx, destination, {
        sweep: buffer(spec.textura), texture: spec.ventana, rateRange: spec.tasa, spacing: 0.032, ...options
      });
    }
    return createGranularEngine(ctx, destination, {
      sweep: buffer(spec.barrido), idle: buffer(spec.ralenti), map: spec.mapa, idleRate: spec.ralentiTasa, ...options
    });
  };

  const playerEngines = new Map();
  const rivalSlots = Array.from({ length: RIVAL_VOICES }, () => ({ voices: new Map(), model: null }));
  const lastSide = new Map();
  const timers = { skid: 0, crunch: 0, scrape: 0 };
  let currentModel = null;
  let lastThrottle = 0;
  // El acelerador ahora baja en unas centésimas: se recuerda su pico reciente para el petardeo.
  let throttlePeak = 0;

  const toneOf = (car, spec) => (spec.electric ? Math.abs(car.u) / spec.topSpeedMs : car.rpm / spec.redline);

  function updatePlayer(car, spec, zone, dt) {
    if (currentModel !== car.model) {
      playerEngines.get(currentModel)?.silence();
      currentModel = car.model;
      if (!playerEngines.has(car.model)) {
        const engine = engineFor(car.model);
        if (engine) playerEngines.set(car.model, engine);
      }
    }
    const engine = playerEngines.get(car.model);
    const speed = Math.abs(car.u);
    const grounded = !car.airborne;
    if (engine) {
      engine.set({ x: toneOf(car, spec), throttle: car.throttle * (car.driveLevel ?? (car.shift > 0 ? 0.2 : 1)), level: spec.electric ? 0.85 : 0.95 });
      engine.tick();
    }
    if (spec.electric) {
      const f = 140 + speed * 21;
      set(whine.frequency, f, 0.03);
      set(whine2.frequency, f * 2.98, 0.03);
      set(whineGain.gain, 0.012 + car.throttle * 0.03 + Math.min(0.02, speed * 0.0004), 0.05);
    } else {
      set(whineGain.gain, 0, 0.1);
      // Petardeo: al soltar el acelerador con el motor arriba.
      if (lastThrottle > 0 && car.throttle === 0 && throttlePeak > 0.6 && car.rpm / spec.redline > 0.62 && grounded) {
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) pop(ctx.currentTime + 0.04 + i * (0.05 + Math.random() * 0.09), 0.18 + Math.random() * 0.12);
      }
    }
    lastThrottle = car.throttle;
    throttlePeak = Math.max(car.throttle, throttlePeak - dt * 3);

    tires.set({ slip: car.slip, speed, grounded, offroad: car.offroad });
    set(road.gain.gain, grounded ? Math.min(0.4, speed / 80) * (1 + car.offroad * 0.6) : 0, 0.08);
    set(road.src.playbackRate, 0.7 + Math.min(1.2, speed / 90));
    set(road.filter.frequency, car.offroad > 0 ? 800 : 1400 + speed * 35);
    set(wind.gain.gain, Math.min(0.45, (speed / 85) ** 2 * 0.45), 0.1);
    set(wind.src.playbackRate, 0.8 + Math.min(0.7, speed / 160));
    set(hover.gain.gain, 0.75 * (car.liftLevel ?? (car.lifting ? 1 : 0)), 0.04);
    set(boost.gain.gain, 0.8 * (car.boostLevel ?? (car.boosting ? 1 : 0)), 0.05);
    set(curbOsc.frequency, Math.max(8, speed / 0.55), 0.03);
    set(curbGain.gain, grounded && speed > 4 ? car.curb * 0.09 : 0, 0.03);

    for (const key of Object.keys(timers)) timers[key] = Math.max(0, timers[key] - dt);
    if (grounded && car.brake > 0.6 && speed > 18 && car.slip > 0.35 && timers.skid === 0) {
      play(m.unicos.frenada, { gain: 0.5, rate: vary() });
      timers.skid = 1.6;
    }
    if (grounded && car.offroad > 0 && speed > 3 && timers.crunch === 0) {
      play(pick(m.golpes[SURFACE[zone] ?? 'grava']), { gain: 0.12 + car.offroad * 0.22, rate: vary(0.4) });
      timers.crunch = 1 / Math.min(16, 3 + speed * 0.35);
    }
    if (car.wallContact > 2 && timers.scrape === 0) {
      play(pick(m.golpes.roce), { gain: Math.min(0.35, 0.1 + car.wallContact * 0.01), rate: vary(0.6) });
      timers.scrape = 0.07 + Math.random() * 0.05;
    }
  }

  function updateRivals(race, focus, length, demo) {
    const near = race.cars
      .filter(c => c.id !== focus.id)
      .map(c => {
        let ds = c.s - focus.s;
        if (Math.abs(ds) > length / 2) ds -= Math.sign(ds) * length;
        return { car: c, ds, d: Math.hypot(ds, c.n - focus.n), side: c.n - focus.n };
      });
    // Ráfaga de aire cuando un rival pasa pegado.
    for (const item of near) {
      const side = Math.sign(item.ds);
      const before = lastSide.get(item.car.id);
      lastSide.set(item.car.id, side);
      if (!demo && before !== undefined && before !== side && Math.abs(item.side) < 5 && Math.abs(item.ds) < 8 && Math.abs(item.car.u - focus.u) > 6) {
        play(m.bucles.viento, { gain: 0.45, rate: 1.4, offset: Math.random() * 3, duration: 0.6, filter: { type: 'bandpass', from: 600, to: 2600, q: 0.8 } });
      }
    }
    near.sort((a, b) => a.d - b.d);
    rivalSlots.forEach((slot, i) => {
      const item = near[i];
      const model = item && m.motores[item.car.model] ? item.car.model : null;
      if (slot.model && slot.model !== model) slot.voices.get(slot.model)?.silence();
      slot.model = model;
      if (!item || !model || item.d > 120) return;
      if (!slot.voices.has(model)) slot.voices.set(model, engineFor(model, { spacing: 0.05, pan: true }));
      const voice = slot.voices.get(model);
      const spec = race.specs[item.car.specId];
      const closing = item.ds >= 0 ? focus.u - item.car.u : item.car.u - focus.u;
      const doppler = Math.min(1.18, Math.max(0.84, (SOUND_SPEED + closing * 2) / SOUND_SPEED));
      voice.set({
        x: toneOf(item.car, spec),
        throttle: item.car.throttle,
        level: (demo ? 0.35 : 0.75) / (1 + item.d / 9),
        doppler,
        muffle: Math.min(1, item.d / 90)
      });
      voice.setPan(item.side / 8);
      voice.tick();
    });
  }

  function silenceLoops() {
    tires.silence();
    for (const layer of [road, wind, hover, boost]) set(layer.gain.gain, 0, 0.1);
    set(curbGain.gain, 0, 0.05);
    set(whineGain.gain, 0, 0.1);
  }

  return {
    update(race, focus, { demo, trackLength, zone, dt = 1 / 60, over = false }) {
      if (demo) {
        silenceLoops();
        playerEngines.get(currentModel)?.silence();
        updateRivals(race, focus, trackLength, true);
        return;
      }
      if (over) {
        // El jugador ya cruzó la meta: su auto lo lleva la IA y, cuando la carrera termina, el
        // estado queda congelado, así que su motor sonaría a régimen fijo para siempre. Se apaga
        // su voz y sus bucles; los rivales siguen sonando, que es lo que la espera quiere mostrar.
        silenceLoops();
        playerEngines.get(currentModel)?.silence();
        updateRivals(race, focus, trackLength, false);
        return;
      }
      updatePlayer(focus, race.specs[focus.specId], zone, dt);
      updateRivals(race, focus, trackLength, false);
    },
    /** Golpes y efectos únicos grabados. Devuelve true si lo atendió. */
    onEvent(event, mine, race) {
      switch (event.type) {
        case 'collision': {
          if (!mine && event.intensity < 6) return true;
          const level = Math.min(1, 0.25 + event.intensity / 12) * (mine ? 1 : 0.45);
          play(pick(m.golpes.metal), { gain: level, rate: vary() });
          if (event.intensity > 5) play(pick(m.golpes.chapa), { gain: level * 0.8, rate: vary(), delay: 0.02 });
          if (event.intensity > 10 && mine) play(m.unicos.chapa, { gain: level * 0.7, rate: vary(), delay: 0.04 });
          return true;
        }
        case 'landed':
          if (mine && event.impact > 1.5) {
            play(pick(m.golpes.aterrizaje), { gain: Math.min(1, event.impact / 7), rate: 0.85 * vary() });
            if (event.impact > 4) play(pick(m.golpes.cambio), { gain: 0.25, rate: 0.7, delay: 0.03 });
          }
          return mine;
        case 'bottom-out':
          if (mine) play(pick(m.golpes.roce), { gain: 0.5, rate: vary() });
          return mine;
        case 'thrust':
          if (mine) play(m.unicos.salto, { gain: 0.9, rate: vary() });
          return mine;
        case 'shift': {
          if (!mine || !event.up) return mine;
          play(pick(m.golpes.cambio), { gain: 0.14, rate: 1.3 * vary() });
          const car = race?.cars.find(c => c.id === event.carId);
          if (car && ['cuna', 'saeta'].includes(car.model)) {
            play(m.bucles.planeo, { gain: 0.22, rate: 1.5, offset: Math.random(), duration: 0.35, filter: { type: 'highpass', from: 1800 } });
          }
          return true;
        }
        case 'started':
          play(m.unicos.publico, { gain: 0.35 });
          return false;
        case 'finished':
          if (mine) play(m.unicos.publico, { gain: 0.8 });
          return false;
        default:
          return false;
      }
    },
    silence() {
      silenceLoops();
      for (const engine of playerEngines.values()) engine.silence();
      for (const slot of rivalSlots) for (const voice of slot.voices.values()) voice.silence();
    }
  };
}
