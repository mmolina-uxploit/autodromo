import { hashNoise } from '../../domain/math.js';

/**
 * Utilería al costado de la pista, dibujada en pantalla a partir del punto del piso (x, y)
 * y de `ppm` (píxeles por metro a esa distancia). Siluetas planas con tinta (patrón P8).
 * `side` es -1 a la izquierda y 1 a la derecha.
 */
const INK = '#1c1f3a';
const KATAKANA = ['ジェット', 'ターボ', 'ネオン', 'スピード', 'ロケット', 'サーキット'];

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
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  const previous = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha /= alpha;
  ctx.globalCompositeOperation = previous;
}

const PROPS = {
  pillar(ctx, x, y, ppm, side, zone, night) {
    const w = 1.6 * ppm;
    const h = 9 * ppm;
    rect(ctx, x - w / 2, y - h, w, h, '#4f5d7a', ppm);
    rect(ctx, x - w * 0.9, y - h - 0.8 * ppm, w * 1.8, 0.8 * ppm, '#7f93b0', ppm);
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
      glow(ctx, x + arm, y - h, 4 * ppm, '#ffd36a', 0.55);
      glow(ctx, x + arm, y, 5 * ppm, '#ff7a24', 0.12);
    }
  },

  palm(ctx, x, y, ppm, side) {
    const s = 8.5 * ppm;
    const lean = side * 0.12 * s;
    const top = { x: x + lean, y: y - s };
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#e48ad8';
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - lean * 0.4, y - s * 0.55, top.x, top.y);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    for (const angle of [-2.8, -2.2, -1.5, -0.9, -0.25, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.quadraticCurveTo(
        top.x + Math.cos(angle) * s * 0.3, top.y + Math.sin(angle) * s * 0.22,
        top.x + Math.cos(angle) * s * 0.5, top.y + Math.sin(angle) * s * 0.08 + s * 0.16);
      ctx.stroke();
    }
  },

  tree(ctx, x, y, ppm) {
    const s = 7 * ppm;
    rect(ctx, x - s * 0.04, y - s * 0.4, s * 0.08, s * 0.4, '#353a6e', ppm * 0.6);
    ctx.beginPath();
    ctx.arc(x, y - s * 0.68, s * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = '#b6e03a';
    ctx.fill();
    outline(ctx, ppm);
    ctx.beginPath();
    ctx.arc(x - s * 0.1, y - s * 0.78, s * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,244,220,.35)';
    ctx.fill();
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
    ctx.fillStyle = '#141a3a';
    ctx.font = `700 ${Math.max(6, h * 0.42)}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(KATAKANA[seed % KATAKANA.length], x, top + h / 2);
    glow(ctx, x, top + h / 2, w * 0.6, '#ff4fa8', 0.25);
  },

  billboard(ctx, x, y, ppm, side, zone, night, seed) {
    const w = 8 * ppm;
    const h = 3.6 * ppm;
    const top = y - 6 * ppm;
    for (const dx of [-w * 0.3, w * 0.3]) rect(ctx, x + dx - 0.2 * ppm, top + h, 0.4 * ppm, 6 * ppm - h, '#4f5d7a', ppm * 0.5);
    rect(ctx, x - w / 2, top, w, h, '#efebe4', ppm);
    rect(ctx, x - w / 2, top, w * 0.32, h, '#e8459a', ppm);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#efebe4';
    ctx.font = `700 ${Math.max(6, h * 0.62)}px "Barlow Condensed", sans-serif`;
    ctx.fillText(String(10 + (seed * 37) % 89), x - w / 2 + w * 0.16, top + h / 2);
    ctx.fillStyle = INK;
    ctx.font = `700 ${Math.max(5, h * 0.4)}px "Barlow Condensed", sans-serif`;
    ctx.fillText(KATAKANA[seed % KATAKANA.length], x + w * 0.16, top + h / 2);
    if (night) glow(ctx, x, top + h / 2, w * 0.55, '#fff4dc', 0.18);
  },

  /** Cartel de curva: chevrones que apuntan hacia donde dobla la pista (signo de `side` invertido). */
  chevron(ctx, x, y, ppm, side, zone, night, seed, turn) {
    const w = 2.6 * ppm;
    const h = 1.6 * ppm;
    const top = y - 2.4 * ppm;
    rect(ctx, x - 0.12 * ppm, top + h, 0.24 * ppm, 2.4 * ppm - h, INK);
    rect(ctx, x - w / 2, top, w, h, INK, ppm * 0.6);
    ctx.fillStyle = '#e8459a';
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
    if (night) glow(ctx, x, top + h / 2, w * 0.7, '#e8459a', 0.3);
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
    ctx.fillStyle = INK;
    ctx.font = `700 ${Math.max(5, h * 0.36)}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(meters), x, top + h * 0.3);
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
    rect(ctx, left - 0.3 * ppm, y - h - 0.6 * ppm, w + 0.6 * ppm, 0.6 * ppm, '#efebe4', ppm * 0.5);
  }
};

export function paintProp(ctx, kind, x, y, ppm, options) {
  if (ppm < 0.4) return;
  const { side = 1, zone, night = false, seed = 0, turn = 0, clock = 0 } = options;
  PROPS[kind]?.(ctx, x, y, ppm, side, zone, night, seed, turn, clock);
}

/**
 * Qué hay al costado de cada segmento. Determinista por índice: el mismo segmento
 * siempre muestra lo mismo. Devuelve una lista de { kind, side, offset (m desde la defensa) }.
 */
export function propsAt(segment, zone, track, boards = null) {
  const i = segment.index;
  const out = [];
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
