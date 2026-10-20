/**
 * Neumáticos sintetizados. Una goma que desliza sobre asfalto suena a un roce de banda ancha
 * (el "shhh" del caucho arrastrado) con un chillido grave y casi fijo encima, que aparece recién
 * cuando el derrape es fuerte. El tono no salta: solo deriva un poco y tiembla con la textura
 * del piso. Un chillido agudo que sube y baja (como el de la grabación anterior) suena a gaviota.
 *
 * Todo sale de ruido rosado filtrado: no hay osciladores, así que nunca suena a silbido puro.
 */
const NOISE_SECONDS = 3;

/** Ruido rosado (filtro de Paul Kellet) en un buffer que se repite sin costura audible. */
function pinkNoise(ctx, seconds) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  // Fundido cruzado del final con el principio para que el bucle no haga clic.
  const fade = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[length - fade + i] = data[length - fade + i] * (1 - t) + data[i] * t;
  }
  return buffer;
}

function filter(ctx, type, frequency, q) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

export function createTireVoice(ctx, destination) {
  const buffer = pinkNoise(ctx, NOISE_SECONDS);
  const source = offset => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start(ctx.currentTime, offset);
    return src;
  };
  const gainNode = () => {
    const g = ctx.createGain();
    g.gain.value = 0;
    return g;
  };

  // Roce: banda ancha entre 600 Hz y 4 kHz.
  const scrubGain = gainNode();
  source(0).connect(filter(ctx, 'highpass', 600, 0.7)).connect(filter(ctx, 'lowpass', 4200, 0.6)).connect(scrubGain).connect(destination);

  // Chillido: ruido en una banda angosta (dos filtros en serie), más su armónico.
  const squealGain = gainNode();
  const bandA = filter(ctx, 'bandpass', 820, 9);
  const bandB = filter(ctx, 'bandpass', 820, 9);
  source(NOISE_SECONDS * 0.37).connect(bandA).connect(bandB).connect(squealGain).connect(destination);
  const harmonicGain = gainNode();
  const harmonic = filter(ctx, 'bandpass', 1640, 12);
  source(NOISE_SECONDS * 0.71).connect(harmonic).connect(harmonicGain).connect(destination);

  // Temblor de la goma: el chillido late suave unas siete veces por segundo.
  const judder = ctx.createOscillator();
  judder.frequency.value = 7.3;
  const judderDepth = ctx.createGain();
  judderDepth.gain.value = 0;
  judder.connect(judderDepth).connect(squealGain.gain);
  judder.start();

  const set = (param, value, time = 0.06) => param.setTargetAtTime(value, ctx.currentTime, time);
  let drift = 0;

  return {
    /** slip 0..1, speed m/s, grounded, offroad 0..1 (en pasto o grava no chilla: solo raspa). */
    set({ slip, speed, grounded, offroad = 0 }) {
      const on = grounded && speed > 3 ? 1 : 0;
      const paved = 1 - Math.min(1, offroad);
      const scrub = on * Math.min(0.55, Math.max(0, slip - 0.06) * 1);
      const squeal = on * paved * Math.min(1, Math.max(0, slip - 0.3) * 1.6);
      // Deriva lenta del tono (±1,5 %) y una leve subida con la velocidad.
      drift += (Math.random() - 0.5) * 0.004;
      drift = Math.max(-0.015, Math.min(0.015, drift * 0.995));
      const pitch = (780 + Math.min(60, speed) * 1.6) * (1 + drift);
      set(bandA.frequency, pitch, 0.15);
      set(bandB.frequency, pitch, 0.15);
      set(harmonic.frequency, pitch * 2.02, 0.15);
      set(scrubGain.gain, scrub, 0.05);
      set(squealGain.gain, squeal * 3.2, 0.07);
      set(judderDepth.gain, squeal * 0.65, 0.07);
      set(harmonicGain.gain, squeal * 0.7, 0.07);
    },
    silence() {
      for (const g of [scrubGain, squealGain, harmonicGain, judderDepth]) set(g.gain, 0, 0.08);
    }
  };
}
