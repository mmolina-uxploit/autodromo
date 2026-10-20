/**
 * Voz de motor por síntesis granular sobre grabaciones reales.
 *
 * Modo barrido (motores de combustión): el generador guarda, junto con una aceleración grabada,
 * un mapa tiempo → tono. La voz busca el punto cuyo tono coincide con el que pide el régimen
 * y toca granos cortos de ese lugar, superpuestos con ventana de Hann. Por debajo del barrido
 * suena el ralentí grabado en bucle; ambos se funden según el régimen.
 *
 * Modo textura (eléctrico): los granos salen de lugares al azar de una ventana de la grabación
 * y se afinan con la velocidad, como sube el silbido de un inversor real.
 *
 * Para los rivales se aplica Doppler (tono según velocidad relativa) y un filtro que apaga
 * los agudos con la distancia.
 */
const GRAIN = 0.085;
const LOW_X = 0.22;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hannCurve(size = 64) {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) curve[i] = Math.sin((Math.PI * i) / (size - 1)) ** 2;
  return curve;
}

/** Tiempo del barrido cuyo tono es `f` (búsqueda binaria; el mapa es monótono). */
export function positionForFrequency(map, f) {
  if (f <= map[0][1]) return { time: map[0][0], rate: f / map[0][1] };
  const last = map[map.length - 1];
  if (f >= last[1]) return { time: last[0], rate: f / last[1] };
  let lo = 0;
  let hi = map.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (map[mid][1] < f) lo = mid; else hi = mid;
  }
  const [t0, f0] = map[lo];
  const [t1, f1] = map[hi];
  const k = f1 > f0 ? (f - f0) / (f1 - f0) : 0;
  return { time: t0 + (t1 - t0) * k, rate: 1 };
}

export function createGranularEngine(ctx, destination, {
  sweep, idle = null, map = null, idleRate = 1, texture = null, rateRange = [0.6, 1.6], spacing = 0.04, pan = false
}) {
  const out = ctx.createGain();
  out.gain.value = 0;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 6000;
  tone.Q.value = 0.5;
  const panner = pan && ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  out.connect(tone);
  if (panner) tone.connect(panner).connect(destination); else tone.connect(destination);

  const grainBus = ctx.createGain();
  grainBus.connect(out);
  const idleGain = ctx.createGain();
  idleGain.gain.value = 0;
  idleGain.connect(out);
  let idleSource = null;
  if (idle) {
    idleSource = ctx.createBufferSource();
    idleSource.buffer = idle;
    idleSource.loop = true;
    idleSource.connect(idleGain);
    idleSource.start();
  }

  const hann = hannCurve();
  const fMin = map ? map[0][1] : 1;
  const fMax = map ? map[map.length - 1][1] : 1;
  const state = { x: 0.1, throttle: 0, level: 0, doppler: 1 };
  let next = ctx.currentTime + 0.05;

  function placement() {
    if (texture) {
      const span = Math.max(0.01, texture[1] - texture[0] - GRAIN);
      const x = Math.min(1.1, Math.max(0, state.x));
      return { offset: texture[0] + Math.random() * span, rate: rateRange[0] + (rateRange[1] - rateRange[0]) * x };
    }
    const f = fMin + (fMax - fMin) * Math.min(1.25, Math.max(0, (state.x - LOW_X) / (1 - LOW_X)));
    const { time, rate } = positionForFrequency(map, f);
    const jitter = (Math.random() - 0.5) * 0.008;
    return { offset: Math.min(sweep.duration - GRAIN, Math.max(0, time - GRAIN / 2 + jitter)), rate: Math.min(1.35, Math.max(0.7, rate)) };
  }

  function grain(at, amplitude) {
    const { offset, rate } = placement();
    const src = ctx.createBufferSource();
    src.buffer = sweep;
    src.playbackRate.value = rate * state.doppler * (1 + (Math.random() - 0.5) * 0.012);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueCurveAtTime(hann.map(v => v * amplitude), at, GRAIN);
    src.connect(env).connect(grainBus);
    src.start(at, offset, GRAIN * 2);
    src.stop(at + GRAIN + 0.02);
  }

  return {
    /**
     * x: régimen sobre el corte (o fracción de velocidad en modo textura), throttle 0..1,
     * level 0..1, doppler: factor de tono, muffle 0..1: cuánto apaga los agudos la distancia.
     */
    set({ x, throttle, level, doppler = 1, muffle = 0 }) {
      state.x = x;
      state.throttle = throttle;
      state.level = level;
      state.doppler = doppler;
      const now = ctx.currentTime;
      if (idleSource) {
        const idleMix = 1 - smooth(LOW_X - 0.06, LOW_X + 0.08, x);
        idleGain.gain.setTargetAtTime(idleMix * 0.9, now, 0.05);
        idleSource.playbackRate.setTargetAtTime(idleRate * (0.85 + Math.min(x, 0.4) * 1.4) * doppler, now, 0.05);
      }
      const drive = texture ? 0.35 + 0.65 * throttle : 0.55 + 0.45 * throttle;
      out.gain.setTargetAtTime(level * drive, now, 0.04);
      const bright = (texture ? 2500 + x * 7000 : 1300 + throttle * 5200 + x * 1500) * (1 - muffle * 0.85);
      tone.frequency.setTargetAtTime(Math.max(300, bright), now, 0.06);
    },
    setPan(value) { panner?.pan.setTargetAtTime(Math.max(-1, Math.min(1, value)), ctx.currentTime, 0.08); },
    /** Programa los granos que caen en la ventana de anticipación. Se llama cada cuadro. */
    tick() {
      if (next < ctx.currentTime - 0.3) next = ctx.currentTime + 0.02;
      const grainMix = texture ? 1 : smooth(LOW_X - 0.08, LOW_X + 0.06, state.x);
      while (next < ctx.currentTime + 0.12) {
        if (state.level > 0.001 && grainMix > 0.01) grain(next, grainMix * 0.85);
        next += spacing;
      }
    },
    silence() { out.gain.setTargetAtTime(0, ctx.currentTime, 0.08); state.level = 0; }
  };
}
