import { wrap } from '../../domain/math.js';

const gradientCache = new Map();

function skyGradient(ctx, zone, horizon) {
  const key = `${zone.id}:${horizon}`;
  if (!gradientCache.has(key)) {
    const gradient = ctx.createLinearGradient(0, 0, 0, horizon);
    zone.sky.forEach((color, i) => gradient.addColorStop(i / (zone.sky.length - 1), color));
    gradientCache.set(key, gradient);
  }
  return gradientCache.get(key);
}

/** Dibuja `draw(x)` en la posición repetida, con paralaje según `factor`. */
function repeatX(width, offset, factor, nx, draw) {
  const x = wrap(nx * width - offset * factor, width);
  draw(x);
  draw(x - width);
}

function capsule(ctx, x, w, h, horizon) {
  ctx.fillRect(x, horizon - h + w / 2, w, h - w / 2);
  ctx.beginPath();
  ctx.arc(x + w / 2, horizon - h + w / 2, w / 2, Math.PI, 0);
  ctx.fill();
}

function palm(ctx, x, base, size, color) {
  const top = { x: x + size * 0.12, y: base - size };
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x - size * 0.04, base - size * 0.55, top.x, top.y);
  ctx.stroke();
  ctx.lineWidth = Math.max(2, size * 0.06);
  for (const angle of [-2.7, -2.1, -1.4, -0.7, -0.1]) {
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(
      top.x + Math.cos(angle) * size * 0.3, top.y + Math.sin(angle) * size * 0.25,
      top.x + Math.cos(angle) * size * 0.48, top.y + Math.sin(angle) * size * 0.1 + size * 0.14
    );
    ctx.stroke();
  }
}

const PAINTERS = {
  viaduct(ctx, zone, { width: W, height: H, horizon: hy, unit }, offset) {
    ctx.fillStyle = '#353a6e';
    for (const [nx, nw, nh] of [[0.02, 0.07, 0.1], [0.11, 0.05, 0.16], [0.2, 0.08, 0.08], [0.36, 0.06, 0.13], [0.5, 0.09, 0.07], [0.63, 0.05, 0.18], [0.76, 0.08, 0.11], [0.9, 0.06, 0.09]]) {
      repeatX(W, offset, 0.35, nx, x => ctx.fillRect(x, hy - nh * H, nw * W, nh * H));
    }
    const deckTop = hy - H * 0.15;
    const deck = H * 0.035;
    ctx.fillStyle = '#4f5d7a';
    ctx.fillRect(0, deckTop, W, deck);
    for (let i = 0; i < 5; i++) {
      repeatX(W, offset, 0.8, i * 0.2 + 0.1, x => ctx.fillRect(x - W * 0.012, deckTop + deck, W * 0.024, hy - deckTop - deck));
    }
    ctx.fillStyle = zone.accent;
    for (let i = 0; i < 10; i++) {
      repeatX(W, offset, 0.8, i * 0.1 + 0.05, x => {
        ctx.beginPath();
        ctx.arc(x, deckTop + deck + H * 0.012, Math.max(2, unit * 0.007), 0, Math.PI * 2);
        ctx.fill();
      });
    }
  },

  coast(ctx, zone, { width: W, height: H, horizon: hy, unit }, offset) {
    ctx.fillStyle = zone.accent;
    repeatX(W, offset, 0.15, 0.5, x => {
      ctx.beginPath();
      ctx.arc(x, hy - H * 0.015, unit * 0.17, Math.PI, 0);
      ctx.fill();
    });
    ctx.fillStyle = '#ee9fde';
    ctx.fillRect(0, hy - H * 0.045, W, H * 0.045);
    for (const [nx, s] of [[0.12, 1], [0.38, 0.55], [0.7, 0.8], [0.86, 0.6]]) {
      repeatX(W, offset, 0.7, nx, x => palm(ctx, x, hy, unit * 0.32 * s, '#e48ad8'));
    }
  },

  towers(ctx, zone, { width: W, height: H, horizon: hy }, offset) {
    const colors = ['#52c1c4', '#d98fb8', '#e6b54a', '#c7cbe0'];
    ctx.globalAlpha = 0.5;
    [[0.05, 0.05, 0.2], [0.27, 0.04, 0.26], [0.47, 0.05, 0.17], [0.66, 0.04, 0.24], [0.88, 0.05, 0.19]].forEach(([nx, nw, nh], i) => {
      ctx.fillStyle = colors[(i + 2) % colors.length];
      repeatX(W, offset, 0.3, nx, x => capsule(ctx, x, nw * W, nh * H, hy));
    });
    ctx.globalAlpha = 0.85;
    [[0.14, 0.07, 0.3], [0.36, 0.06, 0.22], [0.58, 0.07, 0.34], [0.8, 0.06, 0.26]].forEach(([nx, nw, nh], i) => {
      ctx.fillStyle = colors[i % colors.length];
      repeatX(W, offset, 0.6, nx, x => capsule(ctx, x, nw * W, nh * H, hy));
    });
    ctx.globalAlpha = 1;
  },

  neon(ctx, zone, { width: W, height: H, horizon: hy, unit }, offset) {
    const top = hy - H * 0.2;
    const bottom = hy - H * 0.07;
    const screen = ctx.createLinearGradient(0, top, 0, bottom);
    screen.addColorStop(0, '#5fe8f0');
    screen.addColorStop(1, '#ff4fa8');
    ctx.fillStyle = screen;
    for (const [nx, nw] of [[0.05, 0.14], [0.42, 0.08], [0.72, 0.18]]) {
      repeatX(W, offset, 0.4, nx, x => ctx.fillRect(x, top, nw * W, bottom - top));
    }
    repeatX(W, offset, 0.55, 0.3, x => {
      ctx.fillStyle = '#2b3160';
      ctx.fillRect(x - unit * 0.015, hy - H * 0.3, unit * 0.03, H * 0.3);
      ctx.fillStyle = '#3a2f7a';
      ctx.beginPath();
      ctx.arc(x, hy - H * 0.3, unit * 0.04, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = zone.accent;
    ctx.fillRect(0, hy - 3, W, 3);
  }
};

/** Estrellas fijas de las zonas nocturnas, con paralaje mínimo. */
export function paintStars(ctx, { width: W, horizon: hy }, offset) {
  ctx.fillStyle = '#fff4dc';
  for (let i = 0; i < 70; i++) {
    const x = wrap(((i * 977) % 1000) / 1000 * W - offset * 0.05, W);
    const y = ((i * 613) % 1000) / 1000 * hy * 0.75;
    const r = i % 7 === 0 ? 1.6 : 0.9;
    ctx.globalAlpha = 0.35 + ((i * 37) % 10) / 20;
    ctx.fillRect(x, y, r, r);
  }
  ctx.globalAlpha = 1;
}

/** Nubes planas de día que derivan despacio, con paralaje mínimo. */
export function paintClouds(ctx, { width: W, horizon: hy }, offset, clock) {
  ctx.fillStyle = 'rgba(255,244,220,0.55)';
  for (let i = 0; i < 6; i++) {
    const w = W * (0.12 + ((i * 37) % 10) / 70);
    const x = wrap(((i * 211) % 1000) / 1000 * W * 1.4 - offset * 0.06 + clock * (4 + i), W * 1.4) - W * 0.2;
    const y = hy * (0.12 + ((i * 53) % 10) / 22);
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.5, w * 0.09, 0, 0, Math.PI * 2);
    ctx.ellipse(x - w * 0.18, y - w * 0.06, w * 0.22, w * 0.08, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.15, y - w * 0.05, w * 0.18, w * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Destello del sol bajo, solo donde hay disco solar en el horizonte. */
export function paintSunGlare(ctx, zone, { width: W, horizon: hy, unit }, offset) {
  const x = wrap(0.5 * W - offset * 0.15, W);
  const y = hy - unit * 0.06;
  const r = unit * 0.32;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255,244,220,0.22)');
  g.addColorStop(1, 'rgba(255,244,220,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'source-over';
}

/** Las capas del fondo se exportan sueltas para el catálogo de dibujos (tools/catalogo). */
export const withUnit = viewport => ({ ...viewport, unit: viewport.unit ?? Math.min(viewport.width, viewport.height * 0.62) });

export function paintSky(ctx, zone, viewport) {
  ctx.fillStyle = skyGradient(ctx, zone, viewport.horizon);
  ctx.fillRect(0, 0, viewport.width, viewport.horizon + 1);
}

/** Siluetas del horizonte propias de cada zona: viaducto, costa, torres o pantallas de neón. */
export function paintSkyline(ctx, zone, viewport, offset) {
  PAINTERS[zone.backdrop]?.(ctx, zone, withUnit(viewport), offset);
}

export function paintBackdrop(ctx, zone, viewport, offset, clock = 0) {
  const vp = withUnit(viewport);
  paintSky(ctx, zone, vp);
  if (zone.time === 'noche') paintStars(ctx, vp, offset);
  else paintClouds(ctx, vp, offset, clock);
  paintSkyline(ctx, zone, vp, offset);
  if (zone.backdrop === 'coast') paintSunGlare(ctx, zone, vp, offset);
  ctx.fillStyle = zone.road.ground[0];
  ctx.fillRect(0, vp.horizon, vp.width, vp.height - vp.horizon);
}
