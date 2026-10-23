import { clamp, hashNoise, lerp, wrap } from '../../domain/math.js';

/**
 * Fondo pintado con acabado de animé realista: cielo con cenit profundo y resplandor en el
 * horizonte, estrellas y luna de noche, nubes con volumen iluminadas por el sol o por la ciudad,
 * el horizonte propio de cada zona en capas con paralaje y una bruma de distancia que lo funde
 * con el piso.
 *
 * Lo que no cambia de un cuadro a otro (siluetas, ventanas, nubes) se pinta una sola vez en
 * lienzos fuera de pantalla y después solo se copia: más detalle con menos trabajo por cuadro.
 * Lo que se mueve (sol, destellos del mar, haces de luz) se dibuja en cada cuadro.
 */

const gradients = new Map();
const sprites = new Map();

function offscreen(width, height) {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function cached(map, key, make) {
  if (!map.has(key)) map.set(key, make());
  return map.get(key);
}

/** '#rrggbb' con opacidad → 'rgba(r,g,b,a)'. */
export function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Mezcla dos colores '#rrggbb' (t = 0 → a, t = 1 → b). */
export function mix(a, b, t) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = shift => Math.round(lerp((x >> shift) & 255, (y >> shift) & 255, t));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Números al azar fijos por semilla, en [0, 1). */
function seeded(seed) {
  let i = 0;
  return () => (hashNoise(seed, i++ * 1.618) + 1) / 2;
}

function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

export const withUnit = viewport => ({ ...viewport, unit: viewport.unit ?? Math.min(viewport.width, viewport.height * 0.62) });

// ───────────── cielo ─────────────

export function paintSky(ctx, zone, viewport) {
  const { width: W, horizon: hy } = viewport;
  const atm = zone.atmosphere;
  const key = `${zone.id}:${W}:${hy}`;
  const base = cached(gradients, `cielo:${key}`, () =>
    linear(ctx, 0, 0, 0, hy, zone.sky.map((color, i) => [i / (zone.sky.length - 1), color])));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, hy + 1);
  if (!atm) return;
  // Cenit más profundo: el cielo de animé se oscurece y satura hacia arriba.
  ctx.fillStyle = cached(gradients, `cenit:${key}`, () =>
    linear(ctx, 0, 0, 0, hy * 0.8, [[0, rgba(atm.zenith, 0.85)], [0.55, rgba(atm.zenith, 0.25)], [1, rgba(atm.zenith, 0)]]));
  ctx.fillRect(0, 0, W, hy * 0.8);
  // Resplandor del horizonte: sol bajo, luz de la ciudad o del neón.
  const [glow, alpha] = atm.glow;
  ctx.fillStyle = cached(gradients, `resplandor:${key}`, () =>
    linear(ctx, 0, hy * 0.35, 0, hy, [[0, rgba(glow, 0)], [0.7, rgba(glow, alpha * 0.55)], [1, rgba(glow, alpha)]]));
  ctx.fillRect(0, hy * 0.35, W, hy * 0.65 + 1);
}

/** Estrellas fijas de las zonas nocturnas, con paralaje mínimo; las más brillantes titilan. */
export function paintStars(ctx, { width: W, horizon: hy }, offset, clock = 0) {
  ctx.fillStyle = '#fff4dc';
  for (let i = 0; i < 90; i++) {
    const x = wrap(((i * 977) % 1000) / 1000 * W - offset * 0.05, W);
    const y = ((i * 613) % 1000) / 1000 * hy * 0.72;
    const bright = i % 9 === 0;
    const r = bright ? 1.8 : i % 3 ? 0.8 : 1.1;
    const twinkle = bright ? 0.75 + 0.25 * Math.sin(clock * 2.3 + i) : 1;
    // Cerca del horizonte la bruma las apaga.
    ctx.globalAlpha = (0.3 + ((i * 37) % 10) / 18) * twinkle * clamp(1.15 - y / (hy * 0.72), 0.25, 1);
    ctx.fillRect(x, y, r, r);
    if (bright) {
      ctx.globalAlpha *= 0.35;
      ctx.fillRect(x - r, y + r / 2 - 0.3, r * 3, 0.6);
      ctx.fillRect(x + r / 2 - 0.3, y - r, 0.6, r * 3);
    }
  }
  ctx.globalAlpha = 1;
}

/** Luna con halo, para las noches que la tienen. */
function paintMoon(ctx, zone, { width: W, horizon: hy, unit }, offset) {
  const color = zone.atmosphere?.moon;
  if (!color) return;
  const r = unit * 0.032;
  const sprite = cached(sprites, `luna:${zone.id}:${Math.round(r)}`, () => {
    const size = r * 14;
    const c = offscreen(size, size);
    const g = c.getContext('2d');
    const m = size / 2;
    g.fillStyle = radial(g, m, m, m, [[0, rgba(color, 0.35)], [0.12, rgba(color, 0.18)], [0.4, rgba(color, 0.05)], [1, rgba(color, 0)]]);
    g.fillRect(0, 0, size, size);
    g.fillStyle = radial(g, m - r * 0.3, m - r * 0.3, r * 1.3, [[0, '#ffffff'], [0.6, color], [1, mix(color, '#9fb0d8', 0.35)]]);
    g.beginPath();
    g.arc(m, m, r, 0, Math.PI * 2);
    g.fill();
    // Mares lunares apenas marcados.
    g.fillStyle = rgba('#9fb0d8', 0.22);
    for (const [dx, dy, s] of [[-0.3, -0.1, 0.32], [0.25, 0.2, 0.22], [0.05, -0.35, 0.18]]) {
      g.beginPath();
      g.arc(m + dx * r, m + dy * r, s * r, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  });
  const x = wrap(W * 0.88 - offset * 0.05, W);
  ctx.drawImage(sprite, x - sprite.width / 2, hy * 0.14 - sprite.height / 2);
}

// ───────────── nubes ─────────────

/**
 * Un cúmulo pintado: muchos bollos suaves con base plana, sombreado de abajo hacia arriba (o al
 * revés si los ilumina el sol bajo o la ciudad), luces en cada bollo y un borde luminoso.
 */
/**
 * Cúmulo pintado bollo por bollo: cada uno es un disco de borde neto en blanco cálido con su
 * media luna de sombra azulada abajo a la derecha. Se pintan de arriba hacia abajo, así el bollo
 * de adelante tapa la sombra del de atrás y queda la forma de coliflor. La panza de la nube va
 * en sombra plana, y al final el grano de pintura.
 */
function paintTallCloud(cloud, puffs, width, height, base) {
  const c = offscreen(width, height);
  const g = c.getContext('2d');
  const shade = cloud.shade;
  const mid = mix(cloud.light, shade, 0.35);
  const disc = (x, y, r, color) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  // Toda la nube en sombra; encima la luz, cada bollo corrido hacia el sol y algo achicado.
  // Lo que queda sin cubrir abajo a la derecha es la masa en sombra, con borde festoneado.
  // Cada bollo, de atrás (arriba) hacia adelante (abajo): sombra entera, tono medio y luz
  // corridos hacia el sol. El bollo de adelante deja su festón de sombra sobre la luz del de atrás.
  for (const p of [...puffs].sort((a, b) => a.y - b.y)) {
    disc(p.x, p.y, p.r, shade);
    disc(p.x - p.r * 0.13, p.y - p.r * 0.17, p.r * 0.9, mid);
    disc(p.x - p.r * 0.25, p.y - p.r * 0.31, p.r * 0.76, cloud.light);
  }
  // Volumen de toda la masa: se apaga hacia abajo y hacia el lado contrario al sol.
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = linear(g, width * 0.2, height * 0.1, width * 0.85, base, [[0, rgba(shade, 0)], [0.55, rgba(shade, 0.12)], [1, rgba(shade, 0.45)]]);
  g.fillRect(0, 0, width, height);
  g.globalCompositeOperation = 'source-over';
  // Panza: todo lo que está abajo de la base de luz queda en sombra plana.
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = linear(g, 0, base - height * 0.22, 0, base, [[0, rgba(shade, 0)], [0.35, rgba(shade, 0.75)], [1, rgba(mix(shade, '#7f93b0', 0.3), 0.95)]]);
  g.fillRect(0, base - height * 0.22, width, height * 0.3);
  // Tapa al sol: un toque cálido arriba a la izquierda de la torre.
  g.fillStyle = linear(g, 0, 0, width * 0.6, height * 0.6, [[0, rgba('#fff4dc', 0.5)], [1, rgba('#fff4dc', 0)]]);
  g.fillRect(0, 0, width, height);
  // La base es chata pero no cortada: se deshace en pocos píxeles.
  g.globalCompositeOperation = 'destination-out';
  const soft = Math.max(2, height * 0.04);
  g.fillStyle = linear(g, 0, base - soft, 0, base + 1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
  g.fillRect(0, base - soft, width, height - base + soft);
  g.globalCompositeOperation = 'source-over';
  gouache(c, Math.round(width * 7 + height), 0.7);
  return c;
}

function paintCloud(cloud, seed, width) {
  const rnd = seeded(seed);
  // `tower` va de 0 (cúmulo chato) a 1 (torre de mediodía).
  const tower = cloud.tower ?? 1;
  const height = width * (cloud.tall ? 0.36 + 0.5 * tower : 0.42);
  const c = offscreen(width, height);
  const g = c.getContext('2d');
  const base = height * (cloud.tall ? 0.9 : 0.8);
  const puffs = [];
  if (cloud.tall) {
    // Cúmulo de mediodía en tres tamaños, como se pinta: una base chata de bollos desparejos,
    // pocos lóbulos grandes apilados que se angostan y se corren al subir, y bollitos chicos
    // asomando por el borde de arriba de cada lóbulo. La jerarquía de tamaños es lo que evita
    // que se vea como una grilla de bollos iguales.
    const lean = (rnd() - 0.5) * 0.22;
    const count = 2 + Math.floor(tower * 4 + rnd() * 1.5);
    const lobes = [];
    for (let j = 0; j < count; j++) {
      const u = j / (count - 1);
      // Un cúmulo chato reparte los lóbulos a lo ancho; una torre los apila.
      const r = width * (0.21 - 0.11 * u * tower) * (0.75 + 0.5 * rnd()) * (0.75 + 0.25 * tower);
      const spread = 0.34 + 0.4 * (1 - tower);
      const x = width * (0.5 + lean * u + (rnd() - 0.5) * spread * (1 - u * 0.6 * tower));
      const y = base - (height - r) * 0.85 * u + r * 0.25;
      lobes.push({ x: clamp(x, r, width - r), y: Math.max(r, y), r });
    }
    puffs.push(...lobes);
    // La base va después de los lóbulos y solo a lo ancho que ellos ocupan, con bollos que se
    // pisan: así no quedan bolitas en fila asomando a los costados.
    const avg = lobes.reduce((a, l) => a + l.r, 0) / lobes.length;
    const left = Math.max(avg * 0.6, Math.min(...lobes.map(l => l.x - l.r * 0.75)));
    const right = Math.min(width - avg * 0.6, Math.max(...lobes.map(l => l.x + l.r * 0.75)));
    const n = Math.max(3, Math.round((right - left) / (avg * 0.7)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const r = avg * (0.5 + 0.3 * Math.sin(Math.PI * t) + 0.2 * rnd());
      puffs.push({ x: left + (right - left) * t, y: base - r * (0.55 + 0.25 * rnd()), r });
    }
    for (const lobe of lobes) {
      const m = 4 + Math.floor(rnd() * 5);
      for (let k = 0; k < m; k++) {
        // Sobre el arco de arriba del lóbulo, más del lado del sol.
        const ang = -Math.PI * (0.08 + 0.84 * rnd() ** 1.3);
        const r = lobe.r * (0.16 + 0.32 * rnd() ** 1.6);
        const d = lobe.r - r * 0.55;
        const x = lobe.x + Math.cos(ang) * d;
        const y = lobe.y + Math.sin(ang) * d;
        if (y - r < 1 || x - r < 1 || x + r > width - 1) continue;
        puffs.push({ x, y, r });
      }
    }
    return paintTallCloud(cloud, puffs, width, height, base);
  } else {
    const n = 9 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const dome = Math.sin(Math.PI * t);
      const r = height * (0.14 + 0.24 * dome * (0.75 + 0.5 * rnd()));
      puffs.push({ x: width * (0.1 + 0.8 * t + (rnd() - 0.5) * 0.05), y: base - r * (0.45 + 0.4 * rnd()), r });
    }
    for (let i = 0; i < n / 2; i++) {
      const t = 0.3 + 0.4 * rnd();
      const r = height * (0.16 + 0.12 * rnd());
      puffs.push({ x: width * t, y: base - height * (0.32 + 0.18 * rnd()) - r * 0.3, r });
    }
  }
  // Silueta: bollos de borde suave, cortados en la base.
  const silhouette = (target, color, dx = 0, dy = 0) => {
    target.save();
    target.beginPath();
    target.rect(0, 0, width, base + height * 0.04 + dy);
    target.clip();
    for (const p of puffs) {
      const x = p.x + dx;
      const y = p.y + dy;
      target.fillStyle = radial(target, x, y, p.r, [[0, color], [cloud.tall ? 0.9 : 0.78, color], [1, rgba(color, 0)]]);
      target.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2);
    }
    target.restore();
  };
  silhouette(g, cloud.shade);
  // Luz dentro de la silueta.
  g.globalCompositeOperation = 'source-atop';
  const above = cloud.lit === 'above';
  g.fillStyle = linear(g, 0, 0, 0, base, above
    ? [[0, cloud.light], [0.55, mix(cloud.light, cloud.shade, 0.35)], [1, cloud.shade]]
    : [[0, cloud.shade], [0.6, mix(cloud.shade, cloud.light, 0.35)], [1, cloud.light]]);
  g.globalAlpha = 0.85;
  g.fillRect(0, 0, width, height);
  g.globalAlpha = 1;
  if (cloud.tall) {
    // Cada bollo con su media luna de sombra abajo a la derecha: es lo que lo hace coliflor.
    // De abajo hacia arriba, así los de arriba tapan la sombra de los de abajo.
    for (const p of [...puffs].sort((a, b) => b.y - a.y)) {
      g.fillStyle = radial(g, p.x + p.r * 0.35, p.y + p.r * 0.4, p.r * 0.95, [[0, rgba(cloud.shade, 0.5)], [0.7, rgba(cloud.shade, 0.22)], [1, rgba(cloud.shade, 0)]]);
      g.fillRect(p.x - p.r * 0.7, p.y - p.r * 0.6, p.r * 2, p.r * 2);
      g.fillStyle = radial(g, p.x - p.r * 0.25, p.y - p.r * 0.35, p.r * 0.75, [[0, rgba(cloud.light, 0.95)], [0.6, rgba(cloud.light, 0.6)], [1, rgba(cloud.light, 0)]]);
      g.fillRect(p.x - p.r, p.y - p.r * 1.1, p.r * 1.5, p.r * 1.5);
    }
  }
  for (const p of cloud.tall ? [] : puffs) {
    const lx = p.x - p.r * 0.3;
    const ly = above ? p.y - p.r * 0.35 : p.y + p.r * 0.45;
    g.fillStyle = radial(g, lx, ly, p.r * 0.95, [[0, rgba(cloud.light, above ? 0.9 : 0.55)], [1, rgba(cloud.light, 0)]]);
    g.fillRect(lx - p.r, ly - p.r, p.r * 2, p.r * 2);
  }
  // Borde luminoso del lado de la luz: la silueta menos ella misma corrida en contra de la luz
  // deja una media luna suave sobre el borde iluminado.
  const rim = offscreen(width, height);
  const r = rim.getContext('2d');
  const shift = height * 0.05;
  silhouette(r, cloud.rim);
  r.globalCompositeOperation = 'destination-out';
  silhouette(r, '#000000', shift * 0.4, above ? shift : -shift);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = above ? 0.6 : 0.7;
  g.drawImage(rim, 0, 0);
  g.globalAlpha = 1;
  // La base se deshace en bruma en vez de terminar en una línea recta.
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = linear(g, 0, base - height * 0.1, 0, base + height * 0.04, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
  g.fillRect(0, base - height * 0.1, width, height * 0.3);
  g.globalCompositeOperation = 'source-over';
  return c;
}

function cloudSet(zone, unit, W) {
  const cloud = zone.atmosphere.cloud;
  return cached(sprites, `nubes:${zone.id}:${Math.round(W)}`, () => Array.from({ length: cloud.count }, (_, i) => {
    const depth = (i + 0.5) / cloud.count;
    const vary = 0.8 + 0.4 * ((i * 37) % 10) / 10;
    if (!cloud.tall) {
      const width = W * (0.14 + 0.26 * depth) * vary;
      return { depth, sprite: paintCloud(cloud, i * 17 + zone.id.length, width), seed: i };
    }
    // Cielo de mediodía: muchas nubes lejanas y chicas, pocas cercanas y grandes. Cada una con
    // su grado de torre: la mayoría son cúmulos chatos y unas pocas crecen hacia arriba.
    const tower = ((i * 53 + 11) % 10) / 10 > 0.62 ? 0.65 + 0.35 * ((i * 29) % 10) / 10 : 0.1 + 0.3 * ((i * 41) % 10) / 10;
    const width = W * (0.07 + 0.24 * depth * depth) * vary * (0.85 + 0.3 * (1 - tower));
    return { depth, sprite: paintCloud({ ...cloud, tower }, i * 17 + zone.id.length, width), seed: i };
  }));
}

/** Nubes que derivan despacio, con paralaje mínimo: las cercanas más grandes y altas. */
export function paintClouds(ctx, zone, viewport, offset, clock = 0) {
  const { width: W, horizon: hy, unit } = withUnit(viewport);
  if (!zone.atmosphere?.cloud) return;
  for (const { depth, sprite, seed } of cloudSet(zone, unit, W)) {
    const span = W + sprite.width;
    const x = wrap(((seed * 211) % 1000) / 1000 * span - offset * (0.03 + 0.05 * depth) + clock * (2 + 4 * depth), span) - sprite.width;
    // Los cúmulos tienen la base chata a una misma altitud; vista desde abajo, esa base sube en
    // pantalla cuanto más cerca está la nube. Solo las lejanas tocan el horizonte.
    const y = zone.atmosphere.cloud.tall
      ? hy * (0.86 - 0.66 * depth) - sprite.height * 0.9
      : hy * (0.58 - 0.5 * depth) - sprite.height * 0.5;
    ctx.globalAlpha = zone.atmosphere.cloud.tall ? 0.7 + 0.3 * depth : 0.55 + 0.45 * depth;
    ctx.drawImage(sprite, x, y);
  }
  ctx.globalAlpha = 1;
}

// ───────────── sol ─────────────

function sunX(W, offset) {
  return wrap(0.5 * W - offset * 0.15, W);
}

/** Dónde está el sol en pantalla (solo en las zonas con sol bajo), o null. */
export function sunPosition(zone, viewport, offset) {
  if (!zone.atmosphere?.sun) return null;
  const { width: W, height: H, horizon: hy } = viewport;
  return { x: sunX(W, offset), y: hy - H * 0.02 };
}

/** Disco solar con halo y rayos suaves, apoyado en el horizonte. */
export function paintSunGlare(ctx, zone, viewport, offset) {
  const sun = zone.atmosphere?.sun;
  if (!sun) return;
  const { width: W, height: H, horizon: hy, unit } = withUnit(viewport);
  const x = sunX(W, offset);
  const y = hy - H * 0.02;
  const r = unit * 0.1;
  const halo = cached(sprites, `halo:${zone.id}:${Math.round(unit)}`, () => {
    const size = unit * 1.1;
    const c = offscreen(size, size);
    const g = c.getContext('2d');
    const m = size / 2;
    g.fillStyle = radial(g, m, m, m, [[0, rgba(sun.core, 0.55)], [0.12, rgba(sun.halo, 0.42)], [0.35, rgba(sun.halo, 0.14)], [1, rgba(sun.halo, 0)]]);
    g.fillRect(0, 0, size, size);
    // Rayos: cuñas muy tenues que salen del sol hacia arriba.
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.28 + hashNoise(i, 3) * 0.08;
      const spread = 0.035 + 0.025 * (hashNoise(i, 5) + 1) / 2;
      g.fillStyle = linear(g, m, m, m + Math.cos(a) * m * 0.8, m + Math.sin(a) * m * 0.8, [[0, rgba(sun.core, 0.07)], [0.5, rgba(sun.core, 0.025)], [1, rgba(sun.core, 0)]]);
      g.beginPath();
      g.moveTo(m, m);
      g.lineTo(m + Math.cos(a - spread) * m, m + Math.sin(a - spread) * m);
      g.lineTo(m + Math.cos(a + spread) * m, m + Math.sin(a + spread) * m);
      g.closePath();
      g.fill();
    }
    return c;
  });
  const disc = cached(sprites, `sol:${zone.id}:${Math.round(r)}`, () => {
    const c = offscreen(r * 2 + 4, r * 2 + 4);
    const g = c.getContext('2d');
    const m = r + 2;
    g.fillStyle = radial(g, m, m, r, [[0, '#ffffff'], [0.55, sun.core], [1, sun.halo]]);
    g.beginPath();
    g.arc(m, m, r, 0, Math.PI * 2);
    g.fill();
    return c;
  });
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(halo, x - halo.width / 2, y - halo.height / 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(disc, x - disc.width / 2, y - disc.height / 2);
}

/** Destellos del sol sobre el mar: un camino de reflejos que titila. */
function paintGlitter(ctx, zone, { width: W, height: H, horizon: hy, unit }, offset, clock) {
  const sea = zone.atmosphere?.sea;
  if (!sea) return;
  const x = sunX(W, offset);
  const top = hy - H * 0.045;
  const band = H * 0.045;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = sea.glitter;
  const tick = Math.floor(clock * 7);
  for (let i = 0; i < 34; i++) {
    const d = ((i * 0.61803) % 1);
    const y = top + band * (0.05 + 0.9 * d);
    const spread = unit * (0.04 + 0.22 * d);
    const dx = hashNoise(i, tick) * spread;
    const w = unit * (0.01 + 0.03 * d) * (0.6 + 0.4 * Math.abs(hashNoise(i + 9, tick)));
    ctx.globalAlpha = 0.25 + 0.45 * Math.abs(hashNoise(i + 3, tick));
    ctx.fillRect(x + dx - w / 2, y, w, Math.max(1, unit * 0.0025));
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ───────────── horizonte por zona ─────────────

/** Dibuja `draw(x)` en x, x − W y x + W: la capa se repite sin costura al desplazarse. */
const tile = (W, x, draw) => { draw(x); draw(x - W); draw(x + W); };

/** Fachada con ventanas: unas encendidas, otras no, siempre las mismas. */
function windowsOn(g, x, top, w, h, colors, seed, size, chance) {
  if (!colors) return;
  const cols = Math.max(1, Math.floor(w / (size * 2.2)));
  const rows = Math.max(1, Math.floor(h / (size * 2.6)));
  const gapX = w / cols;
  const gapY = h / rows;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const n = (hashNoise(seed + c * 13.1, r * 7.7) + 1) / 2;
      if (n > chance) continue;
      g.globalAlpha = 0.45 + 0.55 * ((n * 7.3) % 1);
      g.fillStyle = colors[Math.floor(n * 97) % colors.length];
      g.fillRect(x + c * gapX + gapX * 0.25, top + r * gapY + gapY * 0.35, gapX * 0.5, gapY * 0.4);
    }
  }
  g.globalAlpha = 1;
}

function palm(g, x, base, size, color, rim) {
  const top = { x: x + size * 0.12, y: base - size };
  g.lineCap = 'round';
  const fronds = (lineWidth, dx, dy, stroke) => {
    g.strokeStyle = stroke;
    g.lineWidth = Math.max(2, size * lineWidth);
    g.beginPath();
    g.moveTo(x + dx, base);
    g.quadraticCurveTo(x - size * 0.04 + dx, base - size * 0.55 + dy, top.x + dx, top.y + dy);
    g.stroke();
    g.lineWidth = Math.max(2, size * (lineWidth + 0.01));
    for (const angle of [-2.7, -2.1, -1.4, -0.7, -0.1]) {
      g.beginPath();
      g.moveTo(top.x + dx, top.y + dy);
      g.quadraticCurveTo(
        top.x + Math.cos(angle) * size * 0.3 + dx, top.y + Math.sin(angle) * size * 0.25 + dy,
        top.x + Math.cos(angle) * size * 0.48 + dx, top.y + Math.sin(angle) * size * 0.1 + size * 0.14 + dy
      );
      g.stroke();
    }
  };
  // Contraluz: borde claro del lado del sol, cuerpo un poco más oscuro encima.
  fronds(0.05, size * 0.012, -size * 0.008, rim);
  fronds(0.05, 0, 0, color);
}

function capsule(g, x, w, h, base, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x, base);
  g.lineTo(x, base - h + w / 2);
  g.arc(x + w / 2, base - h + w / 2, w / 2, Math.PI, 0);
  g.lineTo(x + w, base);
  g.closePath();
  g.fill();
}

/**
 * Perfil de cresta que se repite cada W: suma de senos con frecuencias enteras, así la capa
 * cierra sin costura al desplazarse. Devuelve alturas en [0, 1] por píxel.
 */
function ridgeProfile(W, seed, octaves) {
  const rnd = seeded(seed);
  const waves = octaves.map(([cycles, weight]) => ({ k: cycles, w: weight, phase: rnd() * Math.PI * 2 }));
  const total = waves.reduce((a, b) => a + b.w, 0);
  const h = new Float32Array(Math.ceil(W) + 1);
  for (let x = 0; x < h.length; x++) {
    let v = 0;
    for (const { k, w, phase } of waves) v += w * Math.sin((x / W) * Math.PI * 2 * k + phase);
    h[x] = 0.5 + 0.5 * v / total;
  }
  return h;
}

/**
 * Textura de pintura sobre un lienzo ya pintado: manchas grandes de color que suben y bajan
 * como el pigmento que no se repartió parejo, y grano fino como el del papel. Solo toca lo
 * que tiene dibujo. Es lo que separa un fondo pintado de un degradé de computadora.
 */
function gouache(canvas, seed, strength = 1) {
  const g = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  if (!w || !h) return;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  // Manchas: ruido de valor en una grilla gruesa, interpolado.
  const cell = 22;
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const rnd = seeded(seed);
  const grid = new Float32Array(gw * gh * 2);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd() * 2 - 1;
  const sample = (x, y, o) => {
    const fx = x / cell, fy = y / cell;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (a, b) => grid[((b * gw + a) * 2) + o];
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
    const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return top + (bot - top) * sy;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 8) continue;
      const blot = sample(x, y, 0) * 9 * strength;
      const warm = sample(x * 0.7, y * 0.7, 1) * 6 * strength;
      const grain = (((x * 73856093) ^ (y * 19349663) ^ seed) & 255) / 255 - 0.5;
      const n = blot + grain * 7 * strength;
      d[i] = clamp(d[i] + n + warm, 0, 255);
      d[i + 1] = clamp(d[i + 1] + n, 0, 255);
      d[i + 2] = clamp(d[i + 2] + n - warm, 0, 255);
    }
  }
  g.putImageData(img, 0, 0);
}

const rgbOf = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/**
 * Cordón de montañas pintado como en un fondo de animé. La luz viene de la izquierda y se
 * calcula por píxel: la pendiente de la cresta decide qué ladera mira al sol, y los espolones
 * (aristas que bajan del pico abriéndose en abanico) parten cada ladera en caras claras y
 * oscuras. Abajo la bruma lava el color. `height(x)` da la altura en píxeles sobre `base`.
 */
function paintRange(g, W, base, height, { lit, shade, haze, hazeAlpha, spurs = 0, dots, forest }) {
  const n = Math.ceil(W);
  const hs = new Float32Array(n + 1);
  let top = base;
  for (let x = 0; x <= n; x++) { hs[x] = height(x); top = Math.min(top, base - hs[x]); }
  // Pendiente de la cresta, suavizada: la forma grande de la ladera, sin el serrucho fino.
  const span = Math.max(2, Math.round(W * 0.012));
  const slope = new Float32Array(n + 1);
  for (let x = 0; x <= n; x++) {
    const a = hs[Math.max(0, x - span)];
    const b = hs[Math.min(n, x + span)];
    slope[x] = (b - a) / (2 * span);
  }
  const y0 = Math.max(0, Math.floor(top));
  const rows = Math.ceil(base) - y0;
  if (rows <= 0) return;
  const img = g.createImageData(n, rows);
  const L = rgbOf(lit), S = rgbOf(shade), Hz = rgbOf(haze);
  const rnd = seeded(Math.round(W) + Math.round(base));
  const ribs = [[7, 1, rnd() * 6.3], [13, 0.55, rnd() * 6.3], [23, 0.3, rnd() * 6.3]];
  // Cumbre que manda en cada columna: la más alta a menos de un séptimo de pantalla.
  // Cumbres: máximos de la cresta suavizada, así solo cuentan los picos grandes y no cada
  // diente del serrucho.
  const reach = Math.round(W / 7);
  const wide = Math.max(3, Math.round(W * 0.03));
  const at = x => ((x % (n + 1)) + n + 1) % (n + 1);
  const smooth = new Float32Array(n + 1);
  for (let x = 0; x <= n; x++) {
    let acc = 0;
    for (let d = -wide; d <= wide; d += 2) acc += hs[at(x + d)];
    smooth[x] = acc / (wide + 1);
  }
  const peaks = [];
  for (let x = 0; x <= n; x++) {
    let top = true;
    for (let d = -reach; d <= reach && top; d += 2) if (d && smooth[at(x + d)] > smooth[x]) top = false;
    if (top && smooth[x] > 2 && (!peaks.length || x - peaks[peaks.length - 1] > reach / 2)) peaks.push(x);
  }
  if (!peaks.length) peaks.push(0);
  // Cada columna toma las aristas de las dos cumbres que la encierran y las mezcla a lo largo
  // del valle entre ellas: el abanico de una se apaga mientras crece el de la otra, sin costura.
  const fan = (x, y, px, h) => {
    let dx = x - px;
    if (dx > n / 2) dx -= n + 1; else if (dx < -n / 2) dx += n + 1;
    const ang = Math.atan2(dx, y - (base - hs[px]) + h * 0.15);
    let rib = 0;
    for (const [k, w, ph] of ribs) rib += w * Math.cos(ang * k + ph + Math.sin(dx * 0.02 + ph) * 0.4);
    return rib;
  };
  for (let x = 0; x < n; x++) {
    const h = hs[x];
    if (h <= 0.5) continue;
    const ridgeY = base - h;
    let left = peaks[peaks.length - 1] - (n + 1);
    let right = peaks[0] + (n + 1);
    for (const p of peaks) {
      if (p <= x && p > left) left = p;
      if (p > x && p < right) right = p;
    }
    const tt = clamp(((x - left) / (right - left) - 0.3) / 0.4, 0, 1);
    const blend = tt * tt * (3 - 2 * tt);
    for (let y = Math.max(y0, Math.floor(ridgeY)); y < base; y++) {
      const v = Math.min(1, (base - y) / h);  // 1 en la cresta, 0 al pie
      // Espolones: rayos que bajan desde la cumbre y se abren en abanico, como el agua que
      // fue tallando la ladera.
      const rib = fan(x, y, at(left), h) * (1 - blend) + fan(x, y, at(right), h) * blend;
      const face = clamp(slope[x] * 2.2, -1, 1) * (0.35 + 0.65 * v);
      let light = 0.55 + 0.55 * face + spurs * 0.32 * rib * (0.3 + 0.7 * v);
      light = clamp(light, 0, 1);
      // Tres tonos con transición corta: se lee como celda pintada, no como degradé de foto.
      const t = light < 0.42 ? light * 0.45 : light > 0.62 ? 0.75 + (light - 0.62) * 0.65 : 0.19 + (light - 0.42) * 2.8;
      const hz = hazeAlpha * (1 - v) ** 1.6;
      const i = ((y - y0) * n + x) * 4;
      for (let c = 0; c < 3; c++) {
        const col = S[c] + (L[c] - S[c]) * clamp(t, 0, 1);
        img.data[i + c] = col + (Hz[c] - col) * hz;
      }
      // Borde de la cresta suavizado medio píxel.
      img.data[i + 3] = y < ridgeY + 1 ? 255 * (1 - (ridgeY - Math.floor(ridgeY))) : 255;
    }
  }
  const layer = offscreen(n, rows);
  layer.getContext('2d').putImageData(img, 0, 0);
  g.drawImage(layer, 0, y0);
  // Bosque: la ladera no es un degradé sino cientos de copas, cada una del color de la luz que
  // le toca, con su lado en sombra y su tapa al sol. Más chicas hacia la cresta, que está lejos.
  if (forest) {
    const r = seeded(forest.seed);
    const count = Math.round(n * rows * forest.density / 100);
    const dabs = [];
    for (let i = 0; i < count; i++) {
      const x = Math.floor(r() * n);
      const h = hs[x];
      if (h < 3) continue;
      const v = r() ** 0.85 * 0.94;
      const y = Math.floor(base - h * v);
      const j = ((y - y0) * n + x) * 4;
      if (j < 0 || j >= img.data.length || img.data[j + 3] < 200) continue;
      dabs.push([x, y, v, j, r()]);
    }
    // De arriba hacia abajo: cada fila de copas tapa el pie de la de atrás.
    dabs.sort((a, b) => a[1] - b[1]);
    for (const [x, y, v, j, q] of dabs) {
      const cr = img.data[j], cg = img.data[j + 1], cb = img.data[j + 2];
      const size = forest.size * (1.2 - 0.65 * v) * (0.7 + 0.6 * q);
      g.fillStyle = `rgb(${cr * 0.86 | 0},${cg * 0.87 | 0},${cb * 0.9 | 0})`;
      g.beginPath();
      g.ellipse(x, y + size * 0.15, size * 1.15, size, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgb(${Math.min(255, cr * 1.07 + 6) | 0},${Math.min(255, cg * 1.06 + 8) | 0},${Math.min(255, cb * 1.0) | 0})`;
      g.beginPath();
      g.ellipse(x - size * 0.2, y - size * 0.3, size * 0.75, size * 0.55, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Monte: pocos manchones de árboles achatados, en la parte baja y siempre del mismo verde.
  if (dots) {
    const r = seeded(dots.seed);
    for (let i = 0; i < dots.count; i++) {
      const x = r() * n;
      const h = hs[Math.floor(x)];
      if (h < 4) continue;
      const v = 0.05 + 0.4 * r() ** 1.8;
      const y = base - h * v;
      const s = dots.size * (0.6 + 0.9 * r());
      g.fillStyle = rgba(mix(dots.color, haze, hazeAlpha * (1 - v) ** 1.6), 0.3);
      g.beginPath();
      g.ellipse(x, y, s * 2.2, s * 0.8, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Copa de árbol en el horizonte: bollos oscuros con la tapa iluminada. */
function crown(g, x, base, r, dark, light) {
  g.fillStyle = dark;
  for (const [dx, dy, s] of [[-0.55, -0.55, 0.7], [0.5, -0.6, 0.75], [0, -1.05, 0.85], [-0.2, -0.3, 0.8], [0.35, -0.25, 0.7]]) {
    g.beginPath();
    g.arc(x + dx * r, base + dy * r, s * r, 0, Math.PI * 2);
    g.fill();
  }
  // Tapas al sol: degradé dentro de cada bollo, sin borde, para que no se lean como burbujas.
  for (const [dx, dy, s] of [[-0.35, -1.3, 0.55], [0.35, -0.95, 0.42], [-0.75, -0.8, 0.38]]) {
    const cx = x + dx * r;
    const cy = base + dy * r;
    g.fillStyle = radial(g, cx, cy, s * r, [[0, rgba(light, 0.85)], [0.6, rgba(light, 0.35)], [1, rgba(light, 0)]]);
    g.fillRect(cx - s * r, cy - s * r, s * r * 2, s * r * 2);
  }
}

/** Casa baja de campo: pared clara, techo a dos aguas con alero oscuro. */
function farmhouse(g, x, base, w, wall, roof) {
  const h = w * 0.42;
  g.fillStyle = wall;
  g.fillRect(x, base - h, w, h);
  g.fillStyle = rgba('#1c1f3a', 0.18);
  g.fillRect(x + w * 0.62, base - h, w * 0.38, h);
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(x - w * 0.08, base - h);
  g.lineTo(x + w * 0.3, base - h - w * 0.3);
  g.lineTo(x + w * 1.02, base - h - w * 0.3);
  g.lineTo(x + w * 1.1, base - h);
  g.closePath();
  g.fill();
  g.fillStyle = rgba('#1c1f3a', 0.35);
  g.fillRect(x - w * 0.08, base - h, w * 1.18, Math.max(1, w * 0.04));
  g.fillStyle = rgba('#1c1f3a', 0.55);
  for (let i = 0; i < 2; i++) g.fillRect(x + w * (0.14 + i * 0.26), base - h * 0.62, w * 0.12, h * 0.3);
}

/** Capas de cada zona: { factor de paralaje, pintar(g, W, H, hy, unit) }. */
const SKYLINES = {
  viaduct(zone) {
    const atm = zone.atmosphere;
    const haze = atm.haze[0];
    return [
      { factor: 0.18, paint(g, W, H, hy) {
        // Ciudad lejana: edificios brumosos con ventanas encendidas y balizas rojas en las azoteas.
        const rnd = seeded(41);
        for (let i = 0; i < 46; i++) {
          const w = W * (0.018 + 0.03 * rnd());
          const h = H * (0.04 + 0.12 * rnd() ** 1.6);
          const x0 = rnd() * W;
          tile(W, x0, x => {
            g.fillStyle = mix('#1d2347', haze, 0.35);
            g.fillRect(x, hy - h, w, h);
            windowsOn(g, x, hy - h, w, h, atm.windows, i * 3.1, Math.max(1.2, H * 0.0035), 0.22);
          });
          if (i % 7 === 0) tile(W, x0, x => { g.fillStyle = '#ff4f5e'; g.fillRect(x + w / 2 - 1, hy - h - 3, 2, 2); });
        }
      } },
      { factor: 0.35, paint(g, W, H, hy) {
        for (const [nx, nw, nh, seed] of [[0.02, 0.07, 0.1, 1], [0.11, 0.05, 0.16, 2], [0.2, 0.08, 0.08, 3], [0.36, 0.06, 0.13, 4], [0.5, 0.09, 0.07, 5], [0.63, 0.05, 0.18, 6], [0.76, 0.08, 0.11, 7], [0.9, 0.06, 0.09, 8]]) {
          tile(W, nx * W, x => {
            const w = nw * W;
            const h = nh * H;
            g.fillStyle = '#353a6e';
            g.fillRect(x, hy - h, w, h);
            g.fillStyle = rgba('#7f93b0', 0.35);
            g.fillRect(x, hy - h, Math.max(1.5, w * 0.06), h);
            g.fillRect(x, hy - h, w, Math.max(1, H * 0.003));
            windowsOn(g, x + w * 0.08, hy - h + H * 0.01, w * 0.84, h - H * 0.01, atm.windows, seed * 11.3, Math.max(1.6, H * 0.005), 0.32);
          });
        }
      } },
      { factor: 0, paint(g, W, H, hy) {
        // Tablero del viaducto: canto iluminado arriba, panza oscura abajo.
        const deckTop = hy - H * 0.15;
        const deck = H * 0.035;
        g.fillStyle = '#4f5d7a';
        g.fillRect(0, deckTop, W, deck);
        g.fillStyle = linear(g, 0, deckTop + deck * 0.55, 0, deckTop + deck, [[0, rgba('#1c1f3a', 0)], [1, rgba('#1c1f3a', 0.55)]]);
        g.fillRect(0, deckTop + deck * 0.55, W, deck * 0.45);
        g.fillStyle = '#7f93b0';
        g.fillRect(0, deckTop, W, Math.max(1.5, H * 0.003));
      } },
      { factor: 0.8, paint(g, W, H, hy, unit) {
        const deckTop = hy - H * 0.15;
        const deck = H * 0.035;
        for (let i = 0; i < 5; i++) {
          tile(W, (i * 0.2 + 0.1) * W, x => {
            const w = W * 0.024;
            const top = deckTop + deck;
            g.fillStyle = '#4f5d7a';
            g.fillRect(x - w / 2, top, w, hy - top);
            g.fillStyle = rgba('#1c1f3a', 0.35);
            g.fillRect(x, top, w / 2, hy - top);
            // Luz cálida de los faroles subiendo por la columna.
            g.fillStyle = linear(g, 0, hy, 0, top, [[0, rgba('#ff7a24', 0.3)], [1, rgba('#ff7a24', 0)]]);
            g.fillRect(x - w / 2, top, w, hy - top);
          });
        }
        for (let i = 0; i < 10; i++) {
          tile(W, (i * 0.1 + 0.05) * W, x => {
            const y = deckTop + deck + H * 0.012;
            const r = Math.max(2, unit * 0.007);
            g.fillStyle = radial(g, x, y, r * 5, [[0, rgba(zone.accent, 0.45)], [1, rgba(zone.accent, 0)]]);
            g.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
            g.fillStyle = zone.accent;
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
          });
        }
      } }
    ];
  },

  coast(zone) {
    const atm = zone.atmosphere;
    const sea = atm.sea;
    return [
      { factor: 0.06, paint(g, W, H, hy) {
        // Islas y cabos lejanos, casi borrados por la bruma.
        const base = hy - H * 0.045;
        g.fillStyle = mix('#c99cc6', atm.haze[0], 0.45);
        for (const [nx, nw, nh] of [[0.08, 0.22, 0.022], [0.42, 0.12, 0.012], [0.66, 0.3, 0.03]]) {
          tile(W, nx * W, x => {
            g.beginPath();
            g.moveTo(x, base);
            g.bezierCurveTo(x + nw * W * 0.25, base - nh * H * 1.6, x + nw * W * 0.6, base - nh * H, x + nw * W, base);
            g.closePath();
            g.fill();
          });
        }
      } },
      { factor: 0, paint(g, W, H, hy) {
        // Mar: más claro y rosado al fondo, más profundo cerca, con líneas de oleaje.
        const top = hy - H * 0.045;
        g.fillStyle = linear(g, 0, top, 0, hy, [[0, sea.far], [1, sea.near]]);
        g.fillRect(0, top, W, hy - top + 1);
        g.fillStyle = rgba('#ffffff', 0.18);
        const rnd = seeded(9);
        for (let i = 0; i < 40; i++) {
          const d = rnd();
          g.fillRect(rnd() * W, top + (hy - top) * d, W * (0.02 + 0.06 * d), Math.max(1, H * 0.0015));
        }
      } },
      { factor: 0.7, paint(g, W, H, hy, unit) {
        for (const [nx, s] of [[0.12, 1], [0.38, 0.55], [0.7, 0.8], [0.86, 0.6]]) {
          tile(W, nx * W, x => palm(g, x, hy, unit * 0.32 * s, '#d97fcb', '#ffd9ef'));
        }
      } }
    ];
  },

  towers(zone) {
    const atm = zone.atmosphere;
    const haze = atm.haze[0];
    const colors = ['#52c1c4', '#d98fb8', '#e6b54a', '#c7cbe0'];
    const tower = (g, x, w, h, hy, color, far) => {
      const lit = mix(color, '#ffffff', far ? 0.25 : 0.18);
      const shade = mix(color, '#546b8b', far ? 0.2 : 0.38);
      capsule(g, x, w, h, hy, linear(g, x, 0, x + w, 0, [[0, lit], [0.45, color], [1, shade]]));
      if (far) return;
      // Vidrio: franja que refleja el cielo y pisos marcados.
      g.save();
      g.beginPath();
      g.rect(x, hy - h + w / 2, w, h);
      g.clip();
      g.fillStyle = linear(g, 0, hy - h, 0, hy, [[0, rgba(atm.glass, 0.55)], [1, rgba(atm.glass, 0.1)]]);
      g.fillRect(x + w * 0.12, hy - h, w * 0.16, h);
      g.fillStyle = rgba('#1c1f3a', 0.12);
      for (let y = hy - h + w * 0.6; y < hy; y += Math.max(4, w * 0.12)) g.fillRect(x, y, w, Math.max(1, w * 0.015));
      g.restore();
      g.fillStyle = rgba('#ffffff', 0.45);
      g.beginPath();
      g.arc(x + w * 0.4, hy - h + w * 0.42, w * 0.18, Math.PI * 1.1, Math.PI * 1.6);
      g.lineTo(x + w * 0.4, hy - h + w * 0.42);
      g.fill();
    };
    return [
      { factor: 0.3, paint(g, W, H, hy) {
        [[0.05, 0.05, 0.2], [0.27, 0.04, 0.26], [0.47, 0.05, 0.17], [0.66, 0.04, 0.24], [0.88, 0.05, 0.19]].forEach(([nx, nw, nh], i) => {
          const color = mix(colors[(i + 2) % colors.length], haze, 0.5);
          tile(W, nx * W, x => tower(g, x, nw * W, nh * H, hy, color, true));
        });
      } },
      { factor: 0.6, paint(g, W, H, hy) {
        [[0.14, 0.07, 0.3], [0.36, 0.06, 0.22], [0.58, 0.07, 0.34], [0.8, 0.06, 0.26]].forEach(([nx, nw, nh], i) => {
          const color = mix(colors[i % colors.length], haze, 0.12);
          tile(W, nx * W, x => tower(g, x, nw * W, nh * H, hy, color, false));
        });
      } }
    ];
  },

  valley(zone) {
    const haze = zone.atmosphere.haze[0];
    return [
      // Cordillera lejana, casi celeste por la distancia.
      { factor: 0.03, grain: 0.6, paint(g, W, H, hy) {
        const p = ridgeProfile(W, 11, [[2, 1], [5, 0.45], [11, 0.18]]);
        paintRange(g, W, hy, x => H * (0.06 + 0.07 * p[x % p.length]), {
          lit: mix('#8db3cf', haze, 0.3), shade: '#5d7fa6', haze, hazeAlpha: 0.7, spurs: 0.5,
          forest: { seed: 3, density: 2, size: Math.max(1, H * 0.0025) }
        });
      } },
      // La montaña: un pico grande con hombros y uno menor al costado.
      { factor: 0.07, grain: 1, paint(g, W, H, hy) {
        const p = ridgeProfile(W, 23, [[3, 0.5], [7, 0.3], [17, 0.12], [31, 0.05]]);
        const peak = (x, cx, half, h) => {
          const t = Math.abs(((x - cx + W * 1.5) % W) - W / 2) / half;
          return t >= 1 ? 0 : h * (1 - t ** 1.35);
        };
        paintRange(g, W, hy, x => {
          const xi = x % p.length;
          const m = Math.max(peak(x, W * 0.52, W * 0.34, H * 0.24), peak(x, W * 0.14, W * 0.2, H * 0.13), peak(x, W * 0.86, W * 0.22, H * 0.15));
          return m > 0 ? m * (0.88 + 0.24 * p[xi]) + H * 0.02 : H * 0.02 * p[xi];
        }, {
          lit: '#5fae52', shade: '#1f4f4c', haze, hazeAlpha: 0.6, spurs: 0.24,
          forest: { seed: 5, density: 6, size: Math.max(1.2, H * 0.0034) }
        });
      } },
      // Lomas cercanas, más verdes y con montes de árboles.
      { factor: 0.16, grain: 1, paint(g, W, H, hy) {
        const p = ridgeProfile(W, 41, [[4, 1], [9, 0.5], [19, 0.2]]);
        paintRange(g, W, hy, x => H * (0.015 + 0.055 * p[x % p.length]), {
          lit: '#74bd4c', shade: '#2f6e44', haze, hazeAlpha: 0.3, spurs: 0.25,
          forest: { seed: 9, density: 5, size: Math.max(1.4, H * 0.0045) }
        });
      } },
      // Arboleda y casas sobre el borde del campo.
      { factor: 0.3, grain: 0.8, paint(g, W, H, hy) {
        const rnd = seeded(61);
        const base = hy + 1;
        for (let i = 0; i < 18; i++) {
          const x = rnd() * W;
          const w = H * (0.022 + 0.016 * rnd());
          const roof = ['#8a4f3e', '#4f5d7a', '#7a5a40', '#353a6e'][Math.floor(rnd() * 4)];
          if (i % 3 === 0) tile(W, x, xx => farmhouse(g, xx, base, w, mix('#efebe4', haze, 0.15), roof));
        }
        for (let i = 0; i < 70; i++) {
          const x = rnd() * W;
          const r = H * (0.008 + 0.014 * rnd() ** 1.5);
          tile(W, x, xx => crown(g, xx, base, r, mix('#2f6e3c', haze, 0.12), mix('#7cc35a', haze, 0.1)));
        }
      } },
      // Franja de campo al pie: une el horizonte con el pasto de la pista.
      { factor: 0, paint(g, W, H, hy) {
        g.fillStyle = linear(g, 0, hy - H * 0.006, 0, hy + 1, [[0, rgba('#8fd05a', 0)], [1, rgba('#8fd05a', 0.7)]]);
        g.fillRect(0, hy - H * 0.006, W, H * 0.006 + 1);
      } }
    ];
  },

  neon(zone) {
    const atm = zone.atmosphere;
    return [
      { factor: 0.2, paint(g, W, H, hy) {
        const rnd = seeded(77);
        for (let i = 0; i < 40; i++) {
          const w = W * (0.02 + 0.03 * rnd());
          const h = H * (0.04 + 0.13 * rnd() ** 1.5);
          tile(W, rnd() * W, x => {
            g.fillStyle = '#16153a';
            g.fillRect(x, hy - h, w, h);
            windowsOn(g, x, hy - h, w, h, atm.windows, i * 5.3, Math.max(1.2, H * 0.0035), 0.28);
          });
        }
      } },
      { factor: 0.4, paint(g, W, H, hy, unit) {
        const top = hy - H * 0.2;
        const bottom = hy - H * 0.07;
        for (const [nx, nw] of [[0.05, 0.14], [0.42, 0.08], [0.72, 0.18]]) {
          tile(W, nx * W, x => {
            const w = nw * W;
            const glow = radial(g, x + w / 2, (top + bottom) / 2, w * 0.9, [[0, rgba('#ff4fa8', 0.28)], [1, rgba('#ff4fa8', 0)]]);
            g.fillStyle = glow;
            g.fillRect(x - w * 0.4, top - w * 0.9, w * 1.8, w * 1.8 + bottom - top);
            g.fillStyle = linear(g, 0, top, 0, bottom, [[0, '#5fe8f0'], [1, '#ff4fa8']]);
            g.fillRect(x, top, w, bottom - top);
            g.fillStyle = rgba('#141a3a', 0.18);
            for (let y = top; y < bottom; y += Math.max(3, unit * 0.006)) g.fillRect(x, y, w, 1);
            g.strokeStyle = rgba('#fff4dc', 0.6);
            g.lineWidth = 1;
            g.strokeRect(x + 0.5, top + 0.5, w - 1, bottom - top - 1);
          });
        }
      } },
      { factor: 0.55, paint(g, W, H, hy, unit) {
        tile(W, 0.3 * W, x => {
          g.fillStyle = '#2b3160';
          g.fillRect(x - unit * 0.015, hy - H * 0.3, unit * 0.03, H * 0.3);
          g.fillStyle = radial(g, x, hy - H * 0.3, unit * 0.12, [[0, rgba(zone.accent, 0.4)], [1, rgba(zone.accent, 0)]]);
          g.fillRect(x - unit * 0.12, hy - H * 0.3 - unit * 0.12, unit * 0.24, unit * 0.24);
          g.fillStyle = '#3a2f7a';
          g.beginPath();
          g.arc(x, hy - H * 0.3, unit * 0.04, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = zone.accent;
          g.lineWidth = Math.max(1, unit * 0.004);
          g.stroke();
        });
      } },
      { factor: 0, paint(g, W, H, hy) {
        g.fillStyle = linear(g, 0, hy - H * 0.02, 0, hy, [[0, rgba(zone.accent, 0)], [1, rgba(zone.accent, 0.45)]]);
        g.fillRect(0, hy - H * 0.02, W, H * 0.02);
        g.fillStyle = zone.accent;
        g.fillRect(0, hy - 3, W, 3);
      } }
    ];
  }
};

/**
 * Cada capa se pinta una vez y se recorta a la franja que tiene dibujo: copiar en cada cuadro
 * un lienzo casi vacío del alto del cielo costaba más que todo lo demás junto.
 */
function croppedLayer(layer, W, H, hy, unit) {
  const full = offscreen(W, hy + 2);
  const g = full.getContext('2d');
  layer.paint(g, W, H, hy, unit);
  if (layer.grain) gouache(full, Math.round(layer.factor * 1000) + 7, layer.grain);
  const data = g.getImageData(0, 0, full.width, full.height).data;
  let top = full.height;
  let bottom = -1;
  for (let y = 0; y < full.height; y++) {
    const row = y * full.width * 4;
    for (let x = 3; x < full.width * 4; x += 16) {
      if (data[row + x] > 2) {
        if (y < top) top = y;
        bottom = y;
        break;
      }
    }
  }
  if (bottom < 0) return null;
  top = Math.max(0, top - 2);
  const height = bottom - top + 3;
  const canvas = offscreen(W, height);
  canvas.getContext('2d').drawImage(full, 0, top, full.width, height, 0, 0, full.width, height);
  return { factor: layer.factor, canvas, top };
}

function skylineLayers(zone, vp) {
  const { width: W, height: H, horizon: hy, unit } = vp;
  return cached(sprites, `horizonte:${zone.id}:${W}:${H}`, () =>
    (SKYLINES[zone.backdrop]?.(zone) ?? []).map(layer => croppedLayer(layer, W, H, hy, unit)).filter(Boolean));
}

/** Haces de reflectores que barren el cielo (zonas con `beams`). */
function paintBeams(ctx, zone, { width: W, height: H, horizon: hy }, offset, clock) {
  const beams = zone.atmosphere?.beams;
  if (!beams) return;
  ctx.globalCompositeOperation = 'lighter';
  beams.forEach((color, i) => {
    const x = wrap((0.2 + 0.55 * i) * W - offset * 0.3, W);
    const angle = -Math.PI / 2 + Math.sin(clock * (0.35 + 0.12 * i) + i * 2) * 0.45;
    const length = H * 0.9;
    const spread = 0.05;
    ctx.fillStyle = linear(ctx, x, hy, x + Math.cos(angle) * length, hy + Math.sin(angle) * length, [[0, rgba(color, 0.2)], [1, rgba(color, 0)]]);
    ctx.beginPath();
    ctx.moveTo(x, hy);
    ctx.lineTo(x + Math.cos(angle - spread) * length, hy + Math.sin(angle - spread) * length);
    ctx.lineTo(x + Math.cos(angle + spread) * length, hy + Math.sin(angle + spread) * length);
    ctx.closePath();
    ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
}

/** Siluetas del horizonte propias de cada zona, en capas con paralaje. */
export function paintSkyline(ctx, zone, viewport, offset) {
  const vp = withUnit(viewport);
  for (const { factor, canvas, top } of skylineLayers(zone, vp)) {
    if (factor === 0) {
      ctx.drawImage(canvas, 0, top);
      continue;
    }
    const x = wrap(-offset * factor, vp.width);
    ctx.drawImage(canvas, x, top);
    ctx.drawImage(canvas, x - vp.width, top);
  }
}

/** Bruma de distancia: funde la base de las siluetas con el horizonte. */
function paintHaze(ctx, zone, { width: W, height: H, horizon: hy }) {
  const haze = zone.atmosphere?.haze;
  if (!haze) return;
  ctx.fillStyle = cached(gradients, `bruma:${zone.id}:${W}:${hy}`, () =>
    linear(ctx, 0, hy - H * 0.08, 0, hy, [[0, rgba(haze[0], 0)], [1, rgba(haze[0], haze[1])]]));
  ctx.fillRect(0, hy - H * 0.08, W, H * 0.08 + 1);
}

/** `quality`: 2 alta, 1 media (sin resplandor de pantalla), 0 baja (además sin nubes, haces ni halo). */
export function paintBackdrop(ctx, zone, viewport, offset, clock = 0, quality = 2) {
  const vp = withUnit(viewport);
  paintSky(ctx, zone, vp);
  if (zone.time === 'noche') {
    paintStars(ctx, vp, offset, clock);
    paintMoon(ctx, zone, vp, offset);
  }
  if (quality > 0) {
    paintBeams(ctx, zone, vp, offset, clock);
    paintClouds(ctx, zone, vp, offset, clock);
    paintSunGlare(ctx, zone, vp, offset);
  }
  paintSkyline(ctx, zone, vp, offset);
  paintGlitter(ctx, zone, vp, offset, clock);
  paintHaze(ctx, zone, vp);
  ctx.fillStyle = zone.road.ground[0];
  ctx.fillRect(0, vp.horizon, vp.width, vp.height - vp.horizon);
}
