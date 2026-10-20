/**
 * Secuenciador de música arcade: bajo arpegiado, acordes, melodía y batería sintetizados.
 * Programa las notas un poco por adelantado (técnica de "lookahead") para no depender del cuadro.
 * Intensidad 0 = menú (bajo, acordes y bombo suave); 1 = carrera (todo).
 */
const BPM = 126;
const STEP = 60 / BPM / 4;
const LOOKAHEAD = 0.14;

const midi = n => 440 * 2 ** ((n - 69) / 12);
// La menor · Fa · Do · Sol, un compás cada uno.
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const BASS = [45, 41, 48, 43];
const LEAD = [
  76, null, 74, 76, null, 72, null, 69, 72, null, 74, null, 76, null, 79, null,
  77, null, 76, 74, null, 72, null, 69, 72, null, 69, null, 65, null, 69, null,
  72, null, 74, 76, null, 79, null, 76, 74, null, 72, null, 74, null, 76, null,
  74, null, 71, 74, null, 79, null, 74, 71, null, 67, null, 71, null, 74, null
];

export function createMusic(ctx, destination) {
  let playing = false;
  let nextTime = 0;
  let step = 0;
  let intensity = 0;
  let noise = null;

  const out = ctx.createGain();
  out.gain.value = 0.9;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP * 3;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(out);
  out.connect(destination);

  function noiseBuffer() {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function note(frequency, at, duration, { type = 'square', volume = 0.1, cutoff = 2400, echo = false } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = frequency;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(volume, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    o.connect(f).connect(g).connect(out);
    if (echo) g.connect(delay);
    o.start(at);
    o.stop(at + duration + 0.05);
  }

  function kick(at, volume) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.25);
  }

  function hit(at, { cutoff, volume, duration, type = 'highpass' }) {
    if (!noise) noise = noiseBuffer();
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(f).connect(g).connect(out);
    src.start(at);
    src.stop(at + duration + 0.02);
  }

  function schedule(s, at) {
    const bar = Math.floor(s / 16) % 4;
    const pos = s % 16;
    const chord = CHORDS[bar];
    const race = intensity >= 1;
    // Bajo en corcheas, octava alternada.
    if (pos % 2 === 0) note(midi(BASS[bar] + (pos % 4 === 2 ? 12 : 0)), at, STEP * 1.8, { type: 'sawtooth', volume: 0.11, cutoff: 700 });
    // Acordes en los tiempos 1 y 3, largos y oscuros.
    if (pos === 0 || pos === 8) for (const n of chord) note(midi(n), at, STEP * 7, { type: 'sawtooth', volume: 0.025, cutoff: 1300 });
    // Arpegio en semicorcheas.
    if (intensity > 0.3) note(midi(chord[pos % 3] + 12), at, STEP * 0.9, { type: 'square', volume: 0.03, cutoff: 3000, echo: true });
    // Batería.
    if (pos % 4 === 0) kick(at, race ? 0.5 : 0.25);
    if (race && (pos === 4 || pos === 12)) hit(at, { cutoff: 1500, volume: 0.22, duration: 0.16, type: 'bandpass' });
    if (intensity > 0.3 && pos % 2 === 1) hit(at, { cutoff: 7000, volume: 0.06, duration: 0.04 });
    // Melodía solo en carrera.
    if (race) {
      const lead = LEAD[s % LEAD.length];
      if (lead) note(midi(lead), at, STEP * 1.7, { type: 'square', volume: 0.05, cutoff: 3600, echo: true });
    }
  }

  return {
    start() {
      if (playing) return;
      playing = true;
      nextTime = ctx.currentTime + 0.1;
    },
    stop() { playing = false; },
    setIntensity(value) { intensity = value; },
    /** Se llama en cada cuadro: programa las notas que caen en la ventana de anticipación. */
    tick() {
      if (!playing) return;
      if (nextTime < ctx.currentTime - 0.5) nextTime = ctx.currentTime + 0.05;
      while (nextTime < ctx.currentTime + LOOKAHEAD) {
        schedule(step, nextTime);
        nextTime += STEP;
        step = (step + 1) % 64;
      }
    }
  };
}
