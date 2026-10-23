import { findFrame, framePoints, steerFrameIndex, wheelFrame } from './sprite-atlas.js';
import { hashNoise } from '../../domain/math.js';
import { glowSprite, paintGlow } from './glow.js';

/**
 * Dibuja un auto por capas: sombra en el piso, ruedas que ruedan, carrocería que sube, baja y rola
 * sobre la suspensión, y la parte de las ruedas que va por delante. Los propulsores se dibujan
 * en las toberas que marca el generador. La suspensión se exagera para que se lea a distancia.
 */
const HEAVE_GAIN = 2.4;
const ROLL_GAIN = 1.8;
const MAX_ROLL = 0.1;
// Sombra: núcleo tenue y caída larga. Casi toda la mancha es penumbra, así que el borde se
// deshace en el asfalto en vez de recortarse como un disco.
const SHADOW = Object.freeze([
  [0, 'rgba(42,45,85,0.78)'], [0.38, 'rgba(42,45,85,0.6)'], [0.72, 'rgba(42,45,85,0.22)'], [1, 'rgba(42,45,85,0)']
]);

function glow(ctx, x, y, r, inner, outer, alpha = 1) {
  ctx.globalAlpha = alpha;
  paintGlow(ctx, x, y, r, [[0, inner], [0.35, outer], [1, 'rgba(0,0,0,0)']]);
  ctx.globalAlpha = 1;
}

function drawLayer(ctx, atlas, key, ox, oy, k) {
  const frame = findFrame(atlas, key);
  if (!frame) return false;
  const r = frame.rect;
  ctx.drawImage(frame.image, r.x, r.y, r.w, r.h, ox + r.ox * k, oy + r.oy * k, r.w * k, r.h * k);
  return true;
}

/**
 * Ruedas (o su parte de adelante) en la fase de giro que toca. Sobre la fase va la rueda barrida
 * con la opacidad del fundido: a velocidad los rayos se vuelven un disco en vez de titilar.
 */
function drawWheels(ctx, atlas, key, layer, spin, ox, oy, k, alpha) {
  if (spin.blur < 1 && !drawLayer(ctx, atlas, key(layer + spin.suffix), ox, oy, k)) {
    drawLayer(ctx, atlas, key(layer), ox, oy, k);
  }
  if (spin.blur > 0) {
    ctx.globalAlpha = alpha * spin.blur;
    if (!drawLayer(ctx, atlas, key(layer + atlas.wheelPhases.blur), ox, oy, k) && spin.blur >= 1) {
      ctx.globalAlpha = alpha;
      drawLayer(ctx, atlas, key(layer), ox, oy, k);
    }
    ctx.globalAlpha = alpha;
  }
}

/**
 * Sombra en el piso, del mismo modelo que la de la utilería: un óvalo achatado que el sol bajo
 * estira hacia la cámara y corre al lado opuesto a la luz. `light` es { lean, stretch }: cuánto
 * se corre de costado (−1 a 1, en anchos de huella) y cuánto se alarga. Sin luz direccional
 * queda la huella de contacto. Al despegar se achica, se acorta y se aclara.
 */
export function paintShadow(ctx, x, groundY, ppm, spec, height, light) {
  const lift = Math.max(0, height);
  const shrink = 1 / (1 + lift * 0.14);
  const w = spec.width * 1.34 * ppm * shrink;
  if (w < 2) return;
  const fade = 1 / (1 + lift * 0.5);
  const stretch = (light?.stretch ?? 0) * fade;
  const h = w * (0.26 + stretch);
  // Con el sol bajo la sombra sale hacia la cámara, así que casi toda cae por debajo del
  // punto de apoyo; con el sol alto se reparte alrededor.
  const drop = h * 0.5 * Math.min(0.5, stretch * 0.8);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * fade;
  ctx.drawImage(
    glowSprite(SHADOW),
    x - w / 2 + (light?.lean ?? 0) * w * 0.22,
    groundY - h / 2 + drop,
    w, h
  );
  ctx.globalAlpha = prev;
}

function liftJets(ctx, points, toScreen, groundY, ppm, clock, strength) {
  ctx.globalCompositeOperation = 'lighter';
  for (const [i, p] of (points ?? []).entries()) {
    const [x, y] = toScreen(p);
    const flicker = 0.8 + 0.2 * hashNoise(Math.floor(clock * 40), i);
    const length = Math.max(0.6 * ppm, Math.min(groundY - y, 2.4 * ppm)) * flicker * strength;
    const w = 0.32 * ppm;
    const g = ctx.createLinearGradient(0, y, 0, y + length);
    g.addColorStop(0, 'rgba(255,244,220,0.95)');
    g.addColorStop(0.3, 'rgba(95,227,240,0.65)');
    g.addColorStop(1, 'rgba(95,227,240,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.4, y);
    ctx.lineTo(x + w * 0.4, y);
    ctx.lineTo(x + w * 1.4, y + length);
    ctx.lineTo(x - w * 1.4, y + length);
    ctx.closePath();
    ctx.fill();
    glow(ctx, x, y, 0.5 * ppm * strength, 'rgba(255,244,220,1)', 'rgba(95,227,240,0.5)', 0.9);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function boostFlames(ctx, points, toScreen, ppm, clock) {
  ctx.globalCompositeOperation = 'lighter';
  for (const [i, p] of (points ?? []).entries()) {
    const [x, y] = toScreen(p);
    const flicker = 0.75 + 0.25 * hashNoise(Math.floor(clock * 50), i + 4);
    glow(ctx, x, y, 0.9 * ppm * flicker, 'rgba(255,244,220,1)', 'rgba(95,227,240,0.7)', 0.95);
    glow(ctx, x, y + 0.15 * ppm, 1.8 * ppm * flicker, 'rgba(95,227,240,0.55)', 'rgba(232,69,154,0.18)', 0.7);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function backfire(ctx, points, toScreen, ppm, clock, seed) {
  if (hashNoise(Math.floor(clock * 14), seed) < 0.55) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const p of points ?? []) {
    const [x, y] = toScreen(p);
    glow(ctx, x, y, 0.45 * ppm, 'rgba(255,244,220,1)', 'rgba(255,122,36,0.8)', 0.9);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * `view`: { x, y (punto del piso bajo el auto, en el aire incluido), groundY, ppm (px/m),
 * yaw (grados aparentes), incline, spec, swatch, clock, alpha, light }
 */
export function paintCar(ctx, atlas, car, view) {
  const { x, y, groundY, ppm, spec, clock } = view;
  ctx.globalAlpha = view.alpha ?? 1;
  paintShadow(ctx, x, groundY, ppm, spec, (groundY - y) / ppm, view.light);
  ctx.globalAlpha = 1;

  const sheet = atlas?.sheets[car.model];
  if (!sheet || !sheet.image) {
    paintFallbackCar(ctx, x, y, spec.width * ppm, view.swatch);
    return;
  }
  const steerIndex = steerFrameIndex(view.yaw, atlas.steerAngles);
  const k = ppm / atlas.pixelsPerMeter;
  const ox = x - atlas.anchorX * k;
  const oy = y - atlas.anchorY * k;
  const points = framePoints(atlas, car.model, view.incline, steerIndex) ?? {};
  const toScreen = ([px, py]) => [ox + px * k, oy + py * k];
  const key = layer => ({ model: car.model, livery: car.livery, incline: view.incline, layer, steerIndex });
  const alpha = view.alpha ?? 1;
  const spin = wheelFrame(atlas.wheelPhases, sheet.spokes, car.progress,
    car.u * (1 + 2 * car.wheelspin), spec.wheelRadius);

  const { heave, pitch, roll } = car.susp;
  const lift = (heave - pitch * spec.b) * HEAVE_GAIN;
  const [pivotX, pivotY] = points.pivote?.[0] ? toScreen(points.pivote[0]) : [x, y - 0.55 * ppm];

  ctx.globalAlpha = alpha;
  drawWheels(ctx, atlas, key, 'ruedas', spin, ox, oy, k, alpha);
  if (car.lifting || (car.airborne && car.vz > 3 && car.airTime < 0.35)) {
    liftJets(ctx, points.toberas_bajas, toScreen, groundY, ppm, clock, car.lifting ? 1 : 0.7);
  }
  ctx.save();
  ctx.translate(pivotX, pivotY - lift * ppm);
  ctx.rotate(Math.max(-MAX_ROLL, Math.min(MAX_ROLL, roll * ROLL_GAIN)));
  ctx.translate(-pivotX, -pivotY);
  ctx.globalAlpha = alpha;
  drawLayer(ctx, atlas, key('carroceria'), ox, oy, k);
  if (car.brake > 0 || car.reversing) drawLayer(ctx, atlas, key('freno'), ox, oy, k);
  if (car.boosting) boostFlames(ctx, points.toberas_traseras, toScreen, ppm, clock);
  else if (!spec.electric && car.throttle === 0 && car.rpm > spec.redline * 0.72 && !car.airborne) {
    backfire(ctx, points.escapes, toScreen, ppm, clock, car.id);
  }
  ctx.restore();
  ctx.globalAlpha = alpha;
  drawWheels(ctx, atlas, key, 'frente', spin, ox, oy, k, alpha);
  ctx.globalAlpha = 1;
}

/** Auto vectorial de respaldo mientras el atlas de sprites carga o si falla. */
export function paintFallbackCar(ctx, x, y, width, color) {
  const h = width * 0.52;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#1c1f3a';
  ctx.fillRect(-width * 0.5, -h * 0.34, width * 0.16, h * 0.34);
  ctx.fillRect(width * 0.34, -h * 0.34, width * 0.16, h * 0.34);
  ctx.fillStyle = color;
  ctx.fillRect(-width * 0.46, -h * 0.64, width * 0.92, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(-width * 0.34, -h * 0.64);
  ctx.lineTo(-width * 0.25, -h);
  ctx.lineTo(width * 0.25, -h);
  ctx.lineTo(width * 0.34, -h * 0.64);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff7a24';
  ctx.fillRect(-width * 0.45, -h * 0.56, width * 0.17, h * 0.13);
  ctx.fillRect(width * 0.28, -h * 0.56, width * 0.17, h * 0.13);
  ctx.restore();
}
