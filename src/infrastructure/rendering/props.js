import { hashNoise } from '../../domain/math.js';
import { paintGlow, glowSprite } from './glow.js';
import { mix } from './backdrop.js';

/**
 * Utilería al costado de la pista, dibujada en pantalla a partir del punto del piso (x, y)
 * y de `ppm` (píxeles por metro a esa distancia). Siluetas planas con tinta (patrón P8).
 * `side` es -1 a la izquierda y 1 a la derecha.
 */
const INK = '#1c1f3a';
const KATAKANA = ['ジェット', 'ターボ', 'ネオン', 'スピード', 'ロケット', 'サーキット'];
// Debajo de este tamaño un texto no se lee: se dibuja una raya que lo sugiere y se ahorra el texto.
const MIN_TEXT = 5;

function label(ctx, text, x, y, size, color, width) {
  ctx.fillStyle = color;
  if (size < MIN_TEXT) {
    ctx.fillRect(x - width / 2, y - size * 0.18, width, Math.max(0.6, size * 0.36));
    return;
  }
  ctx.font = `700 ${size}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function outline(ctx, ppm) {
  ctx.lineWidth = Math.max(1, ppm * 0.06);
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function rect(ctx, x, y, w, h, fill, ppm) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fill();
  if (ppm) outline(ctx, ppm);
}

function glow(ctx, x, y, r, color, alpha = 0.6) {
  const previous = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= alpha;
  paintGlow(ctx, x, y, r, [[0, color], [1, 'rgba(0,0,0,0)']]);
  ctx.globalAlpha /= alpha;
  ctx.globalCompositeOperation = previous;
}

const PROPS = {
  pillar(ctx, x, y, ppm, side, zone, night) {
    const w = 1.6 * ppm;
    const h = 9 * ppm;
    rect(ctx, x - w / 2, y - h, w, h, '#4f5d7a', ppm);
    // Volumen: cara en sombra del lado de afuera, canto iluminado, base más oscura.
    ctx.fillStyle = 'rgba(20,35,51,0.28)';
    ctx.fillRect(side > 0 ? x : x - w / 2, y - h, w / 2, h);
    ctx.fillStyle = 'rgba(199,203,224,0.35)';
    ctx.fillRect(side > 0 ? x - w / 2 : x + w / 2 - w * 0.08, y - h, w * 0.08, h);
    ctx.fillStyle = 'rgba(20,35,51,0.22)';
    ctx.fillRect(x - w / 2, y - h * 0.18, w, h * 0.18);
    rect(ctx, x - w * 0.9, y - h - 0.8 * ppm, w * 1.8, 0.8 * ppm, '#7f93b0', ppm);
    ctx.fillStyle = 'rgba(20,35,51,0.3)';
    ctx.fillRect(x - w * 0.9, y - h - 0.25 * ppm, w * 1.8, 0.25 * ppm);
    rect(ctx, x - w / 2 + w * 0.12, y - h * 0.7, w * 0.12, h * 0.6, '#353a6e');
    if (night) glow(ctx, x, y - h * 0.55, 2.6 * ppm, zone.accent, 0.45);
    ctx.fillStyle = zone.accent;
    ctx.beginPath();
    ctx.arc(x, y - h * 0.55, 0.22 * ppm, 0, Math.PI * 2);
    ctx.fill();
  },

  lamp(ctx, x, y, ppm, side, zone, night) {
    const h = 7.5 * ppm;
    const arm = -side * 2.4 * ppm;
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.5, 0.32 * ppm);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x + arm, y - h - 0.4 * ppm);
    ctx.stroke();
    ctx.strokeStyle = '#7f93b0';
    ctx.lineWidth = Math.max(1, 0.18 * ppm);
    ctx.stroke();
    rect(ctx, x + arm - 0.5 * ppm, y - h - 0.5 * ppm, ppm, 0.3 * ppm, '#ffd36a', ppm);
    if (night) {
      // Cono de luz hasta el piso y charco cálido abajo.
      const previous = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 0.32;
      ctx.drawImage(glowSprite(CONE), x + arm - 2.6 * ppm, y - h, 5.2 * ppm, h * 1.15);
      ctx.globalAlpha /= 0.32;
      ctx.globalCompositeOperation = previous;
      glow(ctx, x + arm, y - h, 4 * ppm, '#ffd36a', 0.55);
      glow(ctx, x + arm, y, 5 * ppm, '#ff7a24', 0.16);
    }
  },

  palm(ctx, x, y, ppm, side) {
    drawSprite(ctx, palmSprite(side < 0 ? -1 : 1), x, y, ppm);
  },

  tree(ctx, x, y, ppm) {
    drawSprite(ctx, treeSprite(), x, y, ppm);
  },

  oak(ctx, x, y, ppm, side, zone, night, seed) {
    drawSprite(ctx, oakSprite(Math.abs(seed) % 2), x, y, ppm);
  },

  house(ctx, x, y, ppm, side, zone, night, seed) {
    drawSprite(ctx, houseSprite(Math.abs(seed) % 3, side), x, y, ppm);
  },

  pole(ctx, x, y, ppm) {
    const h = POLE.height * ppm;
    const w = Math.max(1, 0.32 * ppm);
    // Poste de madera con el lado en sombra.
    rect(ctx, x - w / 2, y - h - 0.5 * ppm, w, h + 0.5 * ppm, '#8a6a4a', ppm);
    ctx.fillStyle = 'rgba(28,31,58,0.3)';
    ctx.fillRect(x, y - h - 0.5 * ppm, w / 2, h + 0.5 * ppm);
    // Cruceta y aisladores.
    const arm = POLE.arm * ppm;
    rect(ctx, x - arm, y - h, arm * 2, Math.max(1, 0.18 * ppm), '#7a5a40', ppm);
    if (ppm > 3) {
      ctx.fillStyle = '#c7cbe0';
      for (const a of POLE.wires) ctx.fillRect(x + a * ppm - 0.06 * ppm, y - h - 0.22 * ppm, 0.12 * ppm, 0.22 * ppm);
      rect(ctx, x - 0.35 * ppm, y - h * 0.72, 0.7 * ppm, 0.9 * ppm, '#7f93b0', ppm);
    }
  },

  beacon(ctx, x, y, ppm, side, zone) {
    const h = 11 * ppm;
    rect(ctx, x - 0.3 * ppm, y - h, 0.6 * ppm, h, '#2b3160', ppm);
    ctx.beginPath();
    ctx.arc(x, y - h, 1.1 * ppm, 0, Math.PI * 2);
    ctx.fillStyle = '#3a2f7a';
    ctx.fill();
    outline(ctx, ppm);
    glow(ctx, x, y - h, 3.4 * ppm, zone.accent, 0.7);
    for (let i = 1; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#ff4fa8' : zone.accent;
      ctx.fillRect(x - 0.3 * ppm, y - h * (i / 5), 0.6 * ppm, 0.25 * ppm);
    }
  },

  screen(ctx, x, y, ppm, side, zone, night, seed) {
    const w = 9 * ppm;
    const h = 4.5 * ppm;
    const top = y - 8 * ppm;
    rect(ctx, x - 0.25 * ppm, top + h, 0.5 * ppm, 8 * ppm - h, '#2b3160');
    const g = ctx.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, '#5fe8f0');
    g.addColorStop(1, '#ff4fa8');
    rect(ctx, x - w / 2, top, w, h, g, ppm);
    label(ctx, KATAKANA[seed % KATAKANA.length], x, top + h / 2, h * 0.42, '#141a3a', w * 0.6);
    glow(ctx, x, top + h / 2, w * 0.6, '#ff4fa8', 0.25);
  },

  billboard(ctx, x, y, ppm, side, zone, night, seed) {
    const w = 8 * ppm;
    const h = 3.6 * ppm;
    const top = y - 6 * ppm;
    for (const dx of [-w * 0.3, w * 0.3]) rect(ctx, x + dx - 0.2 * ppm, top + h, 0.4 * ppm, 6 * ppm - h, '#4f5d7a', ppm * 0.5);
    rect(ctx, x - w / 2, top, w, h, '#efebe4', ppm);
    rect(ctx, x - w / 2, top, w * 0.32, h, '#e8459a', ppm);
    label(ctx, String(10 + (seed * 37) % 89), x - w / 2 + w * 0.16, top + h / 2, h * 0.62, '#efebe4', w * 0.2);
    label(ctx, KATAKANA[seed % KATAKANA.length], x + w * 0.16, top + h / 2, h * 0.4, INK, w * 0.5);
    // Brillo del cartel: reflejo del cielo arriba y sombra del marco abajo.
    if (ppm > 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x - w / 2, top, w, h * 0.16);
      ctx.fillStyle = 'rgba(20,35,51,0.16)';
      ctx.fillRect(x - w / 2, top + h * 0.82, w, h * 0.18);
    }
    if (night) glow(ctx, x, top + h / 2, w * 0.55, '#fff4dc', 0.18);
  },

  /** Cartel de curva: chevrones que apuntan hacia donde dobla la pista (signo de `side` invertido). */
  chevron(ctx, x, y, ppm, side, zone, night, seed, turn) {
    const w = 2.6 * ppm;
    const h = 1.6 * ppm;
    const top = y - 2.4 * ppm;
    // En el campo el cartel es de ruta: placa blanca, chevrones de tinta y poste gris.
    const rural = zone.signs === 'rural';
    rect(ctx, x - 0.12 * ppm, top + h, 0.24 * ppm, 2.4 * ppm - h, rural ? '#7f93b0' : INK);
    rect(ctx, x - w / 2, top, w, h, rural ? '#f4f6fa' : INK, ppm * 0.6);
    ctx.fillStyle = rural ? INK : '#e8459a';
    const dir = turn >= 0 ? 1 : -1;
    for (let i = -1; i <= 1; i++) {
      const cx = x + i * w * 0.28;
      ctx.beginPath();
      ctx.moveTo(cx - dir * w * 0.1, top + h * 0.15);
      ctx.lineTo(cx + dir * w * 0.06, top + h * 0.5);
      ctx.lineTo(cx - dir * w * 0.1, top + h * 0.85);
      ctx.lineTo(cx - dir * w * 0.02, top + h * 0.85);
      ctx.lineTo(cx + dir * w * 0.14, top + h * 0.5);
      ctx.lineTo(cx - dir * w * 0.02, top + h * 0.15);
      ctx.closePath();
      ctx.fill();
    }
    if (night && !rural) glow(ctx, x, top + h / 2, w * 0.7, '#e8459a', 0.3);
  },

  /** Cartel de distancia a la curva: 300, 200 o 100 m, con una franja magenta por cada cien. */
  distance(ctx, x, y, ppm, side, zone, night, seed, turn) {
    const meters = turn;
    const w = 1.5 * ppm;
    const h = 2 * ppm;
    const top = y - 2.6 * ppm;
    rect(ctx, x - 0.1 * ppm, top + h, 0.2 * ppm, 2.6 * ppm - h, INK);
    rect(ctx, x - w / 2, top, w, h, '#efebe4', ppm * 0.6);
    const bars = Math.round(meters / 100);
    for (let i = 0; i < bars; i++) {
      ctx.fillStyle = '#e8459a';
      ctx.fillRect(x - w / 2 + w * 0.12, top + h * (0.58 + i * 0.13), w * 0.76, h * 0.08);
    }
    label(ctx, String(meters), x, top + h * 0.3, h * 0.36, INK, w * 0.6);
    if (night) glow(ctx, x, top + h / 2, w, '#fff4dc', 0.2);
  },

  grandstand(ctx, x, y, ppm, side, zone, night, seed, turn, clock) {
    const w = 14 * ppm;
    const h = 6 * ppm;
    const left = x - w / 2;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + w, y);
    ctx.lineTo(left + w, y - h);
    ctx.lineTo(left, y - h * 0.45);
    ctx.closePath();
    ctx.fillStyle = '#4f5d7a';
    ctx.fill();
    outline(ctx, ppm);
    const colors = ['#e8459a', '#5fe3f0', '#b6e03a', '#ff7a24', '#efebe4', '#e0b54a'];
    const rows = 5;
    const cols = 16;
    const dot = Math.max(1, ppm * 0.42);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fx = (c + 0.5) / cols;
        const rowTop = y - h * 0.45 - (h * 0.55) * fx;
        const fy = y - (r + 0.6) / rows * (y - rowTop) * 0.92;
        const bounce = Math.max(0, hashNoise(c * 3 + r, Math.floor(clock * 6) + seed)) * dot * 0.8;
        ctx.fillStyle = colors[(c * 7 + r * 3 + seed) % colors.length];
        ctx.fillRect(left + fx * w - dot / 2, fy - bounce - dot / 2, dot, dot);
      }
    }
    // Sombra del techo sobre las filas de arriba.
    ctx.fillStyle = 'rgba(20,35,51,0.22)';
    ctx.beginPath();
    ctx.moveTo(left, y - h * 0.45);
    ctx.lineTo(left + w, y - h);
    ctx.lineTo(left + w, y - h * 0.72);
    ctx.lineTo(left, y - h * 0.3);
    ctx.closePath();
    ctx.fill();
    rect(ctx, left - 0.3 * ppm, y - h - 0.6 * ppm, w + 0.6 * ppm, 0.6 * ppm, '#efebe4', ppm * 0.5);
  }
};

// Ancho de la huella de cada objeto (m) para su sombra, y sus luces (altura en m, color) para el
// reflejo en el piso mojado de noche.
/**
 * Postes de campo: uno cada `step` segmentos del lado `side`, con los cables en `wires` (m sobre
 * la cruceta desde el eje del poste) a `height` m. El renderizador tiende el cable hasta el
 * poste siguiente, que está `step` bandas más lejos.
 */
export const POLE = Object.freeze({ step: 13, side: 1, offset: 1.4, height: 8.4, arm: 0.95, wires: [-0.8, -0.28, 0.28, 0.8], sag: 0.55 });

const FOOTPRINT = { pole: 0.8, oak: 6.5, house: 9, pillar: 2, lamp: 1.2, palm: 3.2, tree: 4.4, beacon: 1.6, screen: 6, billboard: 8, chevron: 2.6, distance: 1.6, grandstand: 15 };
const LIGHTS = {
  lamp: (zone, side) => [[7.8, '#ffd36a', -side * 2.4, 1]],
  pillar: zone => [[4.95, zone.accent, 0, 0.6]],
  beacon: zone => [[11, zone.accent, 0, 0.9]],
  screen: () => [[5.75, '#ff4fa8', 0, 0.8], [5.75, '#5fe8f0', 0, 0.4]],
  billboard: () => [[4.2, '#fff4dc', 0, 0.35]]
};
// ───────────── árboles y palmeras pintados una vez ─────────────

// Se pintan a esta escala (píxeles por metro) y después se copian estirados: con formas
// orgánicas y degradés suaves, la copia escalada se ve igual y cuesta mucho menos.
const SPRITE_PPM = 36;
const sprites = new Map();

function spriteCanvas(width, height) {
  const w = Math.ceil(width);
  const h = Math.ceil(height);
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function radialFill(g, x, y, r, stops) {
  const gradient = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  return gradient;
}

/** Árbol con copa sombreada: luz arriba a la izquierda, sombra azulada abajo, racimos de hojas. */
function treeSprite() {
  return sprites.get('arbol') ?? (() => {
    const P = SPRITE_PPM;
    const s = 7 * P;
    const w = s * 0.82;
    const h = s * 1.02;
    const c = spriteCanvas(w, h);
    const g = c.getContext('2d');
    const cx = w / 2;
    const base = h - 2;
    // Tronco con su lado en sombra.
    g.fillStyle = '#353a6e';
    g.fillRect(cx - s * 0.045, base - s * 0.44, s * 0.09, s * 0.44);
    g.fillStyle = '#4f5d7a';
    g.fillRect(cx - s * 0.045, base - s * 0.44, s * 0.035, s * 0.44);
    const cy = base - s * 0.66;
    const R = s * 0.3;
    const clumps = [[0, 0, 1], [-0.55, 0.2, 0.62], [0.58, 0.18, 0.6], [-0.3, -0.55, 0.58], [0.32, -0.5, 0.56], [0, 0.45, 0.6]];
    // Silueta de follaje en racimos, con tinta fina.
    g.fillStyle = '#7fa83a';
    g.strokeStyle = 'rgba(20,35,51,0.55)';
    g.lineWidth = Math.max(1.5, s * 0.008);
    g.beginPath();
    for (const [dx, dy, k] of clumps) {
      g.moveTo(cx + dx * R + k * R, cy + dy * R);
      g.arc(cx + dx * R, cy + dy * R, k * R, 0, Math.PI * 2);
    }
    g.stroke();
    g.fill();
    // Luz y volumen dentro del follaje.
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = radialFill(g, cx - R * 0.45, cy - R * 0.55, R * 2, [[0, '#f0ffa0'], [0.3, '#c6ec4a'], [0.62, '#8fbf38'], [1, '#4f7a6a']]);
    g.fillRect(0, 0, w, h);
    for (const [dx, dy, k] of clumps) {
      g.fillStyle = radialFill(g, cx + (dx - 0.3 * k) * R, cy + (dy - 0.35 * k) * R, k * R, [[0, 'rgba(240,255,170,0.55)'], [1, 'rgba(240,255,170,0)']]);
      g.fillRect(cx + (dx - k) * R - R, cy + (dy - k) * R - R, k * R * 2 + R * 2, k * R * 2 + R * 2);
    }
    g.fillStyle = radialFill(g, cx + R * 0.55, cy + R * 0.75, R * 1.15, [[0, 'rgba(84,107,139,0.3)'], [0.6, 'rgba(84,107,139,0.16)'], [1, 'rgba(84,107,139,0)']]);
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    sprites.set('arbol', c);
    return c;
  })();
}

/**
 * Árbol de campo: copa ancha de racimos verde oscuro con las tapas al sol, como los de los
 * fondos de mediodía. Dos variantes para que la fila no se vea copiada.
 */
function oakSprite(variant) {
  const key = `roble:${variant}`;
  return sprites.get(key) ?? (() => {
    const P = SPRITE_PPM;
    const s = 9 * P;
    const w = s * 1.05;
    const h = s * 1.0;
    const c = spriteCanvas(w, h);
    const g = c.getContext('2d');
    const cx = w / 2;
    const base = h - 2;
    g.fillStyle = '#6b4f3a';
    g.beginPath();
    g.moveTo(cx - s * 0.06, base);
    g.lineTo(cx - s * 0.035, base - s * 0.45);
    g.lineTo(cx + s * 0.035, base - s * 0.45);
    g.lineTo(cx + s * 0.06, base);
    g.fill();
    g.fillStyle = 'rgba(28,31,58,0.35)';
    g.fillRect(cx, base - s * 0.45, s * 0.05, s * 0.45);
    const cy = base - s * 0.62;
    const R = s * 0.26;
    const clumps = variant
      ? [[0, 0, 1], [-0.95, 0.25, 0.7], [0.95, 0.2, 0.72], [-0.5, -0.65, 0.68], [0.45, -0.7, 0.66], [0, 0.5, 0.7], [-1.3, 0.5, 0.45], [1.3, 0.45, 0.48]]
      : [[0, 0, 1.05], [-0.8, 0.3, 0.72], [0.85, 0.15, 0.7], [-0.35, -0.7, 0.7], [0.4, -0.6, 0.62], [0.1, 0.55, 0.65], [1.25, 0.55, 0.45]];
    const blob = () => {
      g.beginPath();
      for (const [dx, dy, k] of clumps) {
        g.moveTo(cx + dx * R + k * R, cy + dy * R);
        g.arc(cx + dx * R, cy + dy * R, k * R, 0, Math.PI * 2);
      }
    };
    g.fillStyle = '#2f6a3c';
    g.strokeStyle = 'rgba(20,35,51,0.5)';
    g.lineWidth = Math.max(1.5, s * 0.007);
    blob();
    g.stroke();
    g.fill();
    g.globalCompositeOperation = 'source-atop';
    // Cada racimo: tapa iluminada arriba a la izquierda y sombra azulada abajo.
    for (const [dx, dy, k] of [...clumps].sort((a, b) => b[1] - a[1])) {
      const x = cx + dx * R;
      const y = cy + dy * R;
      g.fillStyle = radialFill(g, x + k * R * 0.3, y + k * R * 0.45, k * R, [[0, 'rgba(26,58,58,0.55)'], [1, 'rgba(26,58,58,0)']]);
      g.fillRect(x - k * R * 1.2, y - k * R * 1.2, k * R * 2.6, k * R * 2.6);
      g.fillStyle = radialFill(g, x - k * R * 0.3, y - k * R * 0.4, k * R * 0.85, [[0, 'rgba(150,214,90,0.95)'], [0.5, 'rgba(104,178,72,0.7)'], [1, 'rgba(104,178,72,0)']]);
      g.fillRect(x - k * R * 1.2, y - k * R * 1.3, k * R * 2.2, k * R * 2.2);
    }
    g.globalCompositeOperation = 'source-over';
    sprites.set(key, c);
    return c;
  })();
}

/**
 * Casa de campo vista desde la ruta: hastial con techo a dos aguas y, del lado de la ruta, la
 * pared larga en sombra con el alero. `side` dice de qué lado de la ruta está.
 */
function houseSprite(variant, side) {
  const key = `casa:${variant}:${side}`;
  return sprites.get(key) ?? (() => {
    const P = SPRITE_PPM;
    const wall = ['#efebe4', '#e6d9c4', '#f4efe6'][variant];
    const roof = ['#8a4f3e', '#4f5d7a', '#6b4f3a'][variant];
    const gw = 6 * P;          // ancho del hastial
    const lw = 4 * P;          // pared larga en escorzo
    const wh = 2.9 * P;        // alto de pared
    const rh = 2.2 * P;        // alto del techo
    const w = gw + lw + 0.8 * P;
    const h = wh + rh + lw * 0.32 + 0.6 * P;
    const c = spriteCanvas(w, h);
    const g = c.getContext('2d');
    const base = h - 2;
    const toward = -side;      // la pared larga mira hacia la ruta
    const gx = toward > 0 ? 0.4 * P : w - gw - 0.4 * P;
    const lx = toward > 0 ? gx + gw : gx;
    const rise = lw * 0.32;    // la pared larga se aleja y sube
    const ink = 'rgba(20,35,51,0.6)';
    g.lineWidth = Math.max(1.5, P * 0.06);
    g.strokeStyle = ink;
    // Pared larga en sombra, en escorzo.
    const far = lx + toward * lw;
    g.fillStyle = mix(wall, '#4f5d7a', 0.35);
    g.beginPath();
    g.moveTo(lx, base);
    g.lineTo(far, base - rise);
    g.lineTo(far, base - rise - wh);
    g.lineTo(lx, base - wh);
    g.closePath();
    g.fill();
    g.stroke();
    // Faldón del techo sobre la pared larga.
    g.fillStyle = mix(roof, '#1c1f3a', 0.25);
    g.beginPath();
    g.moveTo(lx + toward * -0.3 * P, base - wh + 0.15 * P);
    g.lineTo(far + toward * 0.4 * P, base - rise - wh + 0.1 * P);
    g.lineTo(far + toward * 0.4 * P - toward * gw * 0.5, base - rise - wh - rh);
    g.lineTo(gx + gw / 2, base - wh - rh);
    g.closePath();
    g.fill();
    g.stroke();
    // Hastial.
    g.fillStyle = wall;
    g.beginPath();
    g.moveTo(gx, base);
    g.lineTo(gx, base - wh);
    g.lineTo(gx + gw / 2, base - wh - rh);
    g.lineTo(gx + gw, base - wh);
    g.lineTo(gx + gw, base);
    g.closePath();
    g.fill();
    g.stroke();
    // Alero del hastial y ventanas.
    g.strokeStyle = roof;
    g.lineWidth = 0.35 * P;
    g.beginPath();
    g.moveTo(gx - 0.35 * P, base - wh + 0.2 * P);
    g.lineTo(gx + gw / 2, base - wh - rh - 0.1 * P);
    g.lineTo(gx + gw + 0.35 * P, base - wh + 0.2 * P);
    g.stroke();
    g.fillStyle = '#353a6e';
    g.fillRect(gx + gw * 0.18, base - wh * 0.72, gw * 0.2, wh * 0.36);
    g.fillRect(gx + gw * 0.62, base - wh * 0.72, gw * 0.2, wh * 0.36);
    g.fillStyle = 'rgba(169,207,224,0.55)';
    g.fillRect(gx + gw * 0.18, base - wh * 0.72, gw * 0.08, wh * 0.36);
    g.fillRect(gx + gw * 0.62, base - wh * 0.72, gw * 0.08, wh * 0.36);
    g.fillStyle = 'rgba(20,35,51,0.12)';
    g.fillRect(gx, base - wh * 0.18, gw, wh * 0.18);
    sprites.set(key, c);
    return c;
  })();
}

/** Palmera: tronco anillado con su lado en sombra y hojas en dos tonos (envés oscuro, haz claro). */
function palmSprite(side) {
  const key = `palmera:${side}`;
  return sprites.get(key) ?? (() => {
    const P = SPRITE_PPM;
    const s = 8.5 * P;
    const w = s * 1.25;
    const h = s * 1.12;
    const c = spriteCanvas(w, h);
    const g = c.getContext('2d');
    const x = w / 2;
    const y = h - 2;
    const lean = side * 0.12 * s;
    const top = { x: x + lean, y: y - s };
    g.lineCap = 'round';
    const trunk = (width, color, dx) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x + dx, y);
      g.quadraticCurveTo(x - lean * 0.4 + dx, y - s * 0.55, top.x + dx, top.y);
      g.stroke();
    };
    trunk(s * 0.06, '#b0569f', 0);
    trunk(s * 0.03, '#e48ad8', -s * 0.012);
    // Anillos del tronco.
    g.strokeStyle = 'rgba(20,35,51,0.28)';
    g.lineWidth = Math.max(1, s * 0.006);
    for (let t = 0.08; t < 0.95; t += 0.07) {
      const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * (x - lean * 0.4) + t * t * top.x;
      const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y - s * 0.55) + t * t * top.y;
      g.beginPath();
      g.moveTo(px - s * 0.028, py);
      g.lineTo(px + s * 0.028, py - s * 0.006);
      g.stroke();
    }
    const fronds = (lineWidth, color, dy, droop) => {
      g.strokeStyle = color;
      g.lineWidth = lineWidth;
      for (const angle of [-2.8, -2.2, -1.5, -0.9, -0.25, 0.3]) {
        g.beginPath();
        g.moveTo(top.x, top.y);
        g.quadraticCurveTo(
          top.x + Math.cos(angle) * s * 0.3, top.y + Math.sin(angle) * s * 0.22 + dy,
          top.x + Math.cos(angle) * s * 0.5, top.y + Math.sin(angle) * s * 0.08 + s * droop + dy);
        g.stroke();
      }
    };
    fronds(s * 0.085, '#a8509a', s * 0.02, 0.17);
    fronds(s * 0.06, '#e48ad8', 0, 0.16);
    fronds(s * 0.022, '#ffd9ef', -s * 0.012, 0.15);
    g.fillStyle = '#7a3f75';
    for (const [dx, dy] of [[-0.02, 0.02], [0.02, 0.025], [0, 0.04]]) {
      g.beginPath();
      g.arc(top.x + dx * s, top.y + dy * s, s * 0.018, 0, Math.PI * 2);
      g.fill();
    }
    sprites.set(key, c);
    return c;
  })();
}

function drawSprite(ctx, sprite, x, y, ppm) {
  const k = ppm / SPRITE_PPM;
  ctx.drawImage(sprite, x - (sprite.width * k) / 2, y - sprite.height * k + 2 * k, sprite.width * k, sprite.height * k);
}

const CONE = Object.freeze([[0, 'rgba(255,211,106,0.9)'], [0.55, 'rgba(255,170,80,0.25)'], [1, 'rgba(255,122,36,0)']]);
const SHADOW = Object.freeze([[0, 'rgba(32,44,86,0.34)'], [0.6, 'rgba(32,44,86,0.16)'], [1, 'rgba(32,44,86,0)']]);

/** Sombra suave en el piso: larga hacia la cámara con el sol bajo de frente, corta con el sol alto. */
function groundShadow(ctx, kind, x, y, ppm, zone) {
  const width = (FOOTPRINT[kind] ?? 2) * ppm;
  const low = Boolean(zone.atmosphere?.sun);
  const w = width * (low ? 1.1 : 1.35);
  const h = width * (low ? 0.9 : 0.32);
  ctx.drawImage(glowSprite(SHADOW), x - w / 2 + (low ? 0 : width * 0.18), y - h * (low ? 0.25 : 0.5), w, h);
}

/** Reflejo de cada luz en el piso mojado: una estela vertical bajo el punto espejo. */
function wetReflections(ctx, kind, x, y, ppm, zone, side, wet) {
  const lights = LIGHTS[kind]?.(zone, side);
  if (!lights) return;
  const previous = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (const [height, color, dx, strength] of lights) {
    const mirror = height * ppm;
    const w = Math.max(2, ppm * 1.1);
    ctx.globalAlpha *= wet * strength * 0.55;
    ctx.drawImage(glowSprite([[0, color], [0.5, color.length === 7 ? `${color}66` : color], [1, 'rgba(0,0,0,0)']]), x + dx * ppm - w / 2, y + mirror * 0.15, w, mirror * 1.5);
    ctx.globalAlpha /= wet * strength * 0.55;
  }
  ctx.globalCompositeOperation = previous;
}

export function paintProp(ctx, kind, x, y, ppm, options) {
  if (ppm < 0.4) return;
  const { side = 1, zone, night = false, seed = 0, turn = 0, clock = 0 } = options;
  const atm = zone.atmosphere;
  if (!night && atm && ppm > 1.2) groundShadow(ctx, kind, x, y, ppm, zone);
  if (night && atm?.wet && ppm > 1) wetReflections(ctx, kind, x, y, ppm, zone, side, atm.wet);
  PROPS[kind]?.(ctx, x, y, ppm, side, zone, night, seed, turn, clock);
}

/**
 * Qué hay al costado de cada segmento. Determinista por índice: el mismo segmento
 * siempre muestra lo mismo. Devuelve una lista de { kind, side, offset (m desde la defensa) }.
 *
 * `out` permite pasar un arreglo propio y reutilizarlo: así no se arma uno nuevo por banda
 * y por cuadro.
 */
export function propsAt(segment, zone, track, boards = null, out = []) {
  const i = segment.index;
  out.length = 0;
  if (segment.gap) return out;
  const board = boards?.get(i);
  if (board) out.push({ kind: 'distance', side: board.side, offset: 0.8, turn: board.meters });
  const turn = segment.curvature;
  if (Math.abs(turn) > 1 / 160 && i % 5 === 0) {
    out.push({ kind: 'chevron', side: turn > 0 ? -1 : 1, offset: 0.6, turn });
  }
  if (i * track.segmentLength < 90 || (track.length - i * track.segmentLength) < 60) {
    if (i % 6 === 3) out.push({ kind: 'grandstand', side: i % 12 === 3 ? -1 : 1, offset: 9 });
    return out;
  }
  const kinds = zone.props;
  if (i % 7 === 0) {
    const kind = kinds[Math.abs(Math.floor(hashNoise(i, 3) * 100)) % kinds.length];
    out.push({ kind, side: i % 14 === 0 ? -1 : 1, offset: 3 + Math.abs(hashNoise(i, 5)) * 6 });
  }
  if (zone.lamps && i % 11 === 0) out.push({ kind: 'lamp', side: i % 22 === 0 ? 1 : -1, offset: 0.8 });
  if (zone.poles && i % POLE.step === 0) out.push({ kind: 'pole', side: POLE.side, offset: POLE.offset });
  return out;
}

/**
 * Carteles de distancia antes de cada curva cerrada (radio menor a 90 m) que llega después de
 * una recta: índice de segmento → { metros, lado de afuera }.
 */
export function distanceBoards(track) {
  const boards = new Map();
  const n = track.segmentCount;
  const L = track.segmentLength;
  const sharp = i => Math.abs(track.segment(i).curvature) > 1 / 90;
  const straight = i => Math.abs(track.segment(i).curvature) < 1 / 500 && !track.segment(i).gap;
  for (let i = 0; i < n; i++) {
    if (!sharp(i) || sharp(i - 1)) continue;
    const outside = track.segment(i).curvature > 0 ? -1 : 1;
    for (const meters of [100, 200, 300]) {
      const at = ((i - Math.round(meters / L)) % n + n) % n;
      if (straight(at) && straight(at - 3)) boards.set(at, { meters, side: outside });
    }
  }
  return boards;
}
