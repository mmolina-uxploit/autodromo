import { createCamera, createViewport, fogAt } from './projection.js';
import { paintBackdrop, sunPosition, mix } from './backdrop.js';
import { paintProp, propsAt, distanceBoards } from './props.js';
import { paintCar } from './car-painter.js';
import { createParticles, ParticleKind } from './particles.js';
import { createMinimap } from './minimap.js';
import { createSkidMarks } from './skid-marks.js';
import { paintGlow, glowSprite } from './glow.js';
import { START_LINE_COLOR } from '../../config/zones.js';
import { clamp, hashNoise, lerp, signedWrap } from '../../domain/math.js';

const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');
/** Ruido suave en el tiempo para la sacudida de cámara: tiembla, pero sin saltos de cuadro a cuadro. */
const wobble = (t, seed) => {
  const i = Math.floor(t);
  const f = t - i;
  return lerp(hashNoise(i, seed), hashNoise(i + 1, seed), f * f * (3 - 2 * f));
};
const NEAR = 0.6;
const CAR_NEAR = 3.2;
const PARTICLE_NEAR = 4.5;
const INK = '#1c1f3a';
const STATUS_COUNTDOWN = 'countdown';
const STATUS_RUNNING = 'running';
// Sol alto: la sombra cae corta y apenas hacia la derecha (la luz entra de arriba a la izquierda,
// igual que la de los árboles y los carteles).
const DAY_LIGHT = Object.freeze({ dx: 0.38, dy: 0.92, length: 1.1 });
const TAIL_GLOW = Object.freeze([[0, 'rgba(244,50,80,0.9)'], [1, 'rgba(244,50,80,0)']]);
const TAIL_STREAK = Object.freeze([[0, 'rgba(255,60,90,0.85)'], [0.5, 'rgba(255,41,73,0.35)'], [1, 'rgba(255,41,73,0)']]);
const SUN_PATH = Object.freeze([[0, 'rgba(255,248,230,0.9)'], [0.35, 'rgba(255,207,158,0.45)'], [1, 'rgba(255,207,158,0)']]);
const FLARE = Object.freeze([
  [0.35, 0.05, 'rgba(255,207,158,0.5)'], [0.6, 0.025, 'rgba(169,207,224,0.55)'], [0.9, 0.08, 'rgba(255,79,168,0.22)'],
  [1.25, 0.04, 'rgba(255,248,230,0.4)'], [1.6, 0.12, 'rgba(169,207,224,0.18)']
]);

/**
 * Adaptador de salida: dibuja la carrera en pseudo-3D sobre un canvas 2D.
 * No decide nada del juego; traduce estado y eventos a píxeles (partículas y cámara incluidas).
 */
export function createCanvasRenderer(canvas, { rules, cameraConfig, colorOf = () => '#7f93b0' }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const camera = createCamera(cameraConfig);
  const N = camera.drawDistance;
  const bands = Array.from({ length: N }, () => ({
    seg: null, zN: 0, zF: 0, cxN: 0, cxF: 0, hdN: 0, hdF: 0, xN: 0, yN: 0, sN: 0, xF: 0, yF: 0, sF: 0, clip: 0, ok: false
  }));
  const buckets = Array.from({ length: N }, () => ({ cars: [], parts: [], marks: [] }));
  const particles = createParticles(720);
  const minimap = createMinimap();
  const emitters = new Map();
  const skids = createSkidMarks();
  const wheelTrail = new Map();
  const softSprites = new Map();
  let boards = new Map();
  let vignette = null;
  // Colores de niebla por banda (dependen solo de la distancia): se arman al cambiar de zona.
  let fogStyles = [];
  // Asfalto que refleja el cielo: hacia el fondo toma el color del resplandor del horizonte.
  let asphaltStyles = [[], []];
  let rampStyles = [[], []];
  let tireStyles = [[], []];
  let runoffStyles = [];
  // Resplandor difuso de la imagen (animé realista): copias chicas de la pantalla.
  let bloomSmall = null;
  let bloomTiny = null;
  // Banda recortada reutilizable: evita crear un objeto por banda en cada cuadro.
  const drawn = { seg: null, xN: 0, yN: 0, sN: 0, xF: 0, yF: 0, sF: 0, k: 0 };
  // Puntos de un polígono recortado por una loma (se reutiliza).
  const poly = [];

  const view = {
    viewport: createViewport(1, 1, cameraConfig),
    atlas: null,
    zone: null,
    track: null,
    fogRgb: '0,0,0',
    reducedMotion: false,
    // Calidad gráfica: 2 alta, 1 media (sin resplandor de pantalla), 0 baja (además sin nubes,
    // halo del sol, destello ni camino de luz). La baja el ciclo si el equipo no llega.
    quality: 2,
    clock: 0,
    skyOffset: 0,
    camS: 0,
    camX: 0,
    camY: null,
    lastGround: 0,
    focal: 1,
    shake: 0,
    flash: 0,
    tilt: 0
  };

  function resize() {
    const ratio = Math.min(globalThis.devicePixelRatio || 1, cameraConfig.maxPixelRatio);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      vignette = null;
    }
    view.viewport = createViewport(width, height, cameraConfig);
    ctx.imageSmoothingQuality = 'high';
  }

  // ───────────── cámara y bandas de pista ─────────────

  function updateCamera(focus, dt) {
    const { track } = view;
    view.camS = track.wrap(focus.s - camera.distance);
    const k = clamp(dt * 9, 0, 1);
    view.camX += (focus.n - view.camX) * k;
    if (!track.isGapAt(focus.s)) view.lastGround = track.heightAt(focus.s);
    const air = Math.max(0, focus.z - view.lastGround);
    // En vuelos altos la cámara sube casi tanto como el auto, para no perderlo de vista.
    const lift = air * cameraConfig.airLift + Math.max(0, air - 3) * (0.92 - cameraConfig.airLift);
    const target = Math.max(view.lastGround, track.heightAt(view.camS)) + camera.height + lift;
    if (view.camY === null || Math.abs(target - view.camY) > 25) view.camY = target;
    view.camY += (target - view.camY) * clamp(dt * 7, 0, 1);
    const wantFocal = focus.boosting ? cameraConfig.boostFocal : 1;
    view.focal += (wantFocal - view.focal) * clamp(dt * 3, 0, 1);
    view.skyOffset += track.curvatureAt(focus.s) * focus.u * dt * view.viewport.width * 0.5;
  }

  function computeBands(vp) {
    const { track } = view;
    const L = track.segmentLength;
    const count = track.segmentCount;
    const baseIndex = track.indexAt(view.camS);
    const baseStart = baseIndex * L;
    const camS = view.camS;
    const gain = cameraConfig.curveGain;
    const half = vp.width / 2;
    let z = NEAR;
    let cx = 0;
    let heading = 0;
    for (let k = 0; k < N; k++) {
      const b = bands[k];
      const seg = track.segment(baseIndex + k);
      const zFar = baseStart + (k + 1) * L - camS;
      const dz = zFar - z;
      const kappa = seg.curvature * gain;
      b.seg = seg;
      b.zN = z;
      b.zF = zFar;
      b.cxN = cx;
      b.hdN = heading;
      cx += heading * dz + kappa * dz * dz / 2;
      heading += kappa * dz;
      b.cxF = cx;
      b.hdF = heading;
      const hN = k === 0 ? track.heightAt(camS + NEAR) : seg.startHeight;
      b.ok = dz > 0.01;
      b.sN = vp.focal / b.zN;
      b.sF = vp.focal / b.zF;
      b.xN = half + (b.cxN - view.camX) * b.sN;
      b.xF = half + (b.cxF - view.camX) * b.sF;
      b.yN = vp.horizon - (hN - view.camY) * b.sN;
      b.yF = vp.horizon - (seg.endHeight - view.camY) * b.sF;
      z = zFar;
      if (k === 0 && seg.index !== baseIndex % count) b.ok = false;
    }
  }

  // ───────────── pintura de la calzada ─────────────

  // Los colores opacos se solapan un píxel entero con la banda más cercana: así la fila que
  // comparten queda tapada del todo (con menos, los dos bordes suavizados dejan ver el fondo
  // y aparece una costura clara). Los translúcidos no se solapan: se verían más oscuros.
  const overlapOf = color => (color.startsWith('rgba') ? 0 : 1);

  function quadPath(xn1, xn2, yn, xf1, xf2, yf, overlap) {
    ctx.moveTo(xn1, yn + overlap);
    ctx.lineTo(xn2, yn + overlap);
    ctx.lineTo(xf2, yf);
    ctx.lineTo(xf1, yf);
    ctx.closePath();
  }

  function quad(xn1, xn2, yn, xf1, xf2, yf, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    quadPath(xn1, xn2, yn, xf1, xf2, yf, overlapOf(color));
    ctx.fill();
  }

  /** Franja lateral entre dos desplazamientos (m), a los dos lados, en un solo relleno. */
  function strip(e, from, to, color) {
    const overlap = overlapOf(color);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      quadPath(e.xN + s * from * e.sN, e.xN + s * to * e.sN, e.yN, e.xF + s * from * e.sF, e.xF + s * to * e.sF, e.yF, overlap);
    }
    ctx.fill();
  }

  /** Dos franjas angostas centradas en ±lane (m) con ancho 2·half, en un solo relleno. */
  function lanes(e, lane, half, color) {
    const overlap = overlapOf(color);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const c of [-lane, lane]) {
      quadPath(e.xN + (c - half) * e.sN, e.xN + (c + half) * e.sN, e.yN, e.xF + (c - half) * e.sF, e.xF + (c + half) * e.sF, e.yF, overlap);
    }
    ctx.fill();
  }

  function paintGap(e, vp) {
    const { gap } = view.zone;
    const g = ctx.createLinearGradient(0, e.yF, 0, e.yN);
    g.addColorStop(0, gap.top);
    g.addColorStop(1, gap.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, e.yF, vp.width, e.yN - e.yF + 1);
    if (e.seg.index % 3 === 0) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = gap.shimmer;
      ctx.lineWidth = Math.max(1, e.sF * 0.08);
      const wobble = Math.sin(view.clock * 2 + e.seg.index) * e.sF * 2;
      ctx.beginPath();
      ctx.moveTo(e.xF - 8 * e.sF + wobble, e.yF);
      ctx.lineTo(e.xF + 8 * e.sF + wobble, e.yF);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Pared del lado lejano del foso, de la rampa de aterrizaje al fondo. */
  function paintLandingFace(e, floorHeight, vp, maxY) {
    const floorY = Math.min(maxY, vp.horizon - (floorHeight - view.camY) * e.sN);
    if (floorY <= e.yN) return e.yN;
    const B = view.track.barrier;
    ctx.fillStyle = '#4f5d7a';
    ctx.fillRect(e.xN - B * e.sN, e.yN, B * 2 * e.sN, floorY - e.yN);
    ctx.fillStyle = '#7f93b0';
    ctx.fillRect(e.xN - B * e.sN, e.yN, B * 2 * e.sN, Math.max(1, 0.4 * e.sN));
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, e.sN * 0.05);
    ctx.strokeRect(e.xN - B * e.sN, e.yN, B * 2 * e.sN, floorY - e.yN);
    for (let i = -3; i <= 3; i++) {
      ctx.fillStyle = i % 2 ? '#e0b54a' : INK;
      ctx.fillRect(e.xN + i * 1.6 * e.sN - 0.8 * e.sN, e.yN + 0.4 * e.sN, 1.6 * e.sN, Math.max(1, 0.5 * e.sN));
    }
    return e.yN;
  }

  function chevrons(e, color, count, spread) {
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * spread;
      const w = 1.1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(e.xN + (off - w) * e.sN, e.yN);
      ctx.lineTo(e.xF + off * e.sF, e.yF);
      ctx.lineTo(e.xN + (off + w) * e.sN, e.yN);
      ctx.lineTo(e.xN + (off + w * 0.4) * e.sN, e.yN);
      ctx.lineTo(e.xF + off * e.sF, e.yF + (e.yN - e.yF) * 0.45);
      ctx.lineTo(e.xN + (off - w * 0.4) * e.sN, e.yN);
      ctx.closePath();
      ctx.fill();
    }
  }

  function paintRoadBand(e, vp) {
    const { zone, track } = view;
    const seg = e.seg;
    const band = seg.band;
    const hw = track.halfWidth;
    const rw = rules.rumbleWidth;
    const B = track.barrier;

    // Una banda de menos de un píxel y medio no muestra huellas, líneas ni sombra del escape.
    const thin = e.yN - e.yF < 1.5;
    ctx.fillStyle = zone.road.ground[band];
    ctx.fillRect(0, e.yF, vp.width, e.yN - e.yF + 1);
    // Las franjas se pintan con colores ya mezclados y opacos: una franja translúcida deja una
    // costura clara en cada borde de banda (el suavizado no cubre del todo la fila compartida).
    if (!thin) strip(e, hw + rw, B, runoffStyles[band]);
    strip(e, hw, hw + rw, zone.road.rumble[band]);
    const asphalt = seg.isStartLine ? START_LINE_COLOR : seg.ramp ? rampStyles[band][e.k] : asphaltStyles[band][e.k];
    quad(e.xN - hw * e.sN, e.xN + hw * e.sN, e.yN, e.xF - hw * e.sF, e.xF + hw * e.sF, e.yF, asphalt);

    if (seg.isStartLine) {
      const cols = 8;
      ctx.fillStyle = INK;
      ctx.beginPath();
      for (let c = 0; c < cols; c++) {
        if ((c + seg.index) % 2) continue;
        const a = -hw + (2 * hw * c) / cols;
        const b = a + (2 * hw) / cols;
        quadPath(e.xN + a * e.sN, e.xN + b * e.sN, e.yN, e.xF + a * e.sF, e.xF + b * e.sF, e.yF, 1);
      }
      ctx.fill();
    } else if (seg.ramp) {
      if (band === 0) chevrons(e, '#e0b54a', 3, 3.6);
      const next = track.segment(seg.index + 1);
      if (next.gap) {
        ctx.fillStyle = '#e8459a';
        ctx.fillRect(e.xF - hw * e.sF, e.yF - Math.max(1, 0.25 * e.sF), hw * 2 * e.sF, Math.max(2, 0.35 * e.sF));
      }
    } else if (seg.boost) {
      ctx.globalCompositeOperation = 'lighter';
      chevrons(e, 'rgba(95,227,240,0.85)', 2, 4.4);
      ctx.globalCompositeOperation = 'source-over';
    } else if (!thin) {
      // Huellas de goma donde pisan las ruedas: el asfalto se ve usado, no recién pintado.
      lanes(e, hw * 0.38, 0.8, tireStyles[band][e.k]);
    }
    if (!thin && !seg.isStartLine && !seg.ramp && !seg.boost && band === 0) lanes(e, hw / 3, 0.12, zone.road.lane);
  }

  function paintRoad(vp, fogDensity) {
    let maxY = vp.height;
    const { track } = view;
    for (let k = 0; k < N; k++) {
      const e = bands[k];
      e.clip = maxY;
      if (!e.ok || e.yF >= maxY || e.yF >= e.yN - 0.01) continue;
      const prev = track.segment(e.seg.index - 1);
      if (e.seg.landing && prev.gap) maxY = Math.min(maxY, paintLandingFace(e, prev.endHeight, vp, maxY));
      let { xN, yN, sN } = e;
      if (yN > maxY) {
        const t = (maxY - e.yF) / (yN - e.yF);
        xN = e.xF + (xN - e.xF) * t;
        sN = e.sF + (sN - e.sF) * t;
        yN = maxY;
      }
      drawn.seg = e.seg;
      drawn.xN = xN;
      drawn.yN = yN;
      drawn.sN = sN;
      drawn.xF = e.xF;
      drawn.yF = e.yF;
      drawn.sF = e.sF;
      drawn.k = k;
      if (e.seg.gap) paintGap(drawn, vp);
      else paintRoadBand(drawn, vp);
      if (fogStyles[k]) {
        // La niebla cubre también el píxel en que esta banda se solapa con la más cercana;
        // si no, quedaba una costura clara en cada borde.
        const top = Math.round(e.yF);
        ctx.fillStyle = fogStyles[k];
        ctx.fillRect(0, top, vp.width, Math.round(yN) - top + 1);
      }
      maxY = e.yF;
    }
  }

  // ───────────── estructuras: defensas, pórticos, utilería ─────────────

  function withClip(clip, vp, bottom, draw) {
    if (bottom <= clip) { draw(); return; }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, vp.width, clip);
    ctx.clip();
    draw();
    ctx.restore();
  }

  /** Agrega al trazo el polígono (x0, y0, x1, y1, …) recortado a y ≤ clip: lo que tapa una loma no se dibuja. */
  function clippedPolygon(points, clip) {
    poly.length = 0;
    const n = points.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = points[2 * i];
      const ay = points[2 * i + 1];
      const j = (i + 1) % n;
      const bx = points[2 * j];
      const by = points[2 * j + 1];
      if (ay <= clip) poly.push(ax, ay);
      if ((ay <= clip) !== (by <= clip)) poly.push(ax + (bx - ax) * (clip - ay) / (by - ay), clip);
    }
    if (poly.length < 6) return;
    ctx.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
    ctx.closePath();
  }

  /** Agrega al trazo el segmento recortado a y ≤ clip. */
  function clippedLine(ax, ay, bx, by, clip) {
    if (ay > clip && by > clip) return;
    if (ay > clip) { ax += (bx - ax) * (clip - ay) / (by - ay); ay = clip; }
    if (by > clip) { bx = ax + (bx - ax) * (clip - ay) / (by - ay); by = clip; }
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }

  const wallPoints = [0, 0, 0, 0, 0, 0, 0, 0];

  function paintWalls(e, vp) {
    const { zone, track } = view;
    if (e.seg.gap || e.zN < 2.5) return;
    const B = track.barrier;
    const H = zone.wall.height;
    const clip = e.clip;
    const tn = e.yN - H * e.sN;
    const tf = e.yF - H * e.sF;
    if (tn > clip && tf > clip) return;
    const night = zone.time === 'noche';
    const xs = [-1, 1].map(side => [e.xN + side * B * e.sN, e.xF + side * B * e.sF]);

    ctx.fillStyle = zone.wall.face[e.seg.band];
    ctx.beginPath();
    for (const [xn, xf] of xs) {
      wallPoints[0] = xn; wallPoints[1] = e.yN;
      wallPoints[2] = xf; wallPoints[3] = e.yF;
      wallPoints[4] = xf; wallPoints[5] = tf;
      wallPoints[6] = xn; wallPoints[7] = tn;
      clippedPolygon(wallPoints, clip);
    }
    ctx.fill();
    // Oclusión: la base del muro, donde casi no llega luz, es más oscura y azulada.
    if (e.yN - tn > 3) {
      ctx.fillStyle = 'rgba(24,32,70,0.2)';
      ctx.beginPath();
      for (const [xn, xf] of xs) {
        wallPoints[0] = xn; wallPoints[1] = e.yN;
        wallPoints[2] = xf; wallPoints[3] = e.yF;
        wallPoints[4] = xf; wallPoints[5] = e.yF - H * 0.38 * e.sF;
        wallPoints[6] = xn; wallPoints[7] = e.yN - H * 0.38 * e.sN;
        clippedPolygon(wallPoints, clip);
      }
      ctx.fill();
    }
    ctx.strokeStyle = zone.wall.top;
    ctx.lineWidth = Math.max(1, Math.min(6, 0.08 * e.sN));
    ctx.beginPath();
    for (const [xn, xf] of xs) clippedLine(xn, tn, xf, tf, clip);
    ctx.stroke();

    if (zone.wall.neon) {
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.65 + 0.35 * Math.sin(view.clock * 3 + e.seg.index * 0.21);
      ctx.globalAlpha *= pulse;
      ctx.strokeStyle = e.seg.band ? zone.wall.stripe : zone.wall.top;
      ctx.lineWidth = Math.max(1, 0.12 * e.sN);
      ctx.beginPath();
      for (const [xn, xf] of xs) clippedLine(xn, (e.yN + tn) / 2, xf, (e.yF + tf) / 2, clip);
      ctx.stroke();
      ctx.globalAlpha /= pulse;
      ctx.globalCompositeOperation = 'source-over';
    } else if (e.seg.index % 4 === 0) {
      const r = Math.max(1, 0.14 * e.sN);
      const cy = (e.yN + tn) / 2;
      if (cy - r > clip) return;
      ctx.fillStyle = zone.wall.stripe;
      ctx.beginPath();
      for (const [xn] of xs) {
        ctx.moveTo(xn + r, cy);
        ctx.arc(xn, cy, r, 0, Math.PI * 2);
      }
      ctx.fill();
      if (night) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= 0.5;
        ctx.beginPath();
        for (const [xn] of xs) {
          ctx.moveTo(xn + r * 3, cy);
          ctx.arc(xn, cy, r * 3, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.globalAlpha /= 0.5;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  function lightColor(i, race) {
    if (!race) return '#353a6e';
    if (race.status === STATUS_COUNTDOWN) {
      const lit = Math.min(5, Math.floor(((race.countdownTotal - race.countdown) / race.countdownTotal) * 6));
      return i < lit ? '#ff4fa8' : '#353a6e';
    }
    if (race.status === STATUS_RUNNING && race.clock < 2.5) return '#b6e03a';
    return '#353a6e';
  }

  /** Pórtico de largada con el semáforo; viaductos, arcos de neón y carteles según la zona. */
  function paintOverhead(e, vp, race) {
    const { zone, track } = view;
    const seg = e.seg;
    const B = track.barrier;
    const s = e.sN;
    const start = seg.index === 1;
    const viaduct = zone.id === 'bajo-autopista' && seg.index % 26 === 13;
    const arch = zone.id === 'anillo-neon' && seg.index % 34 === 17;
    const sign = zone.id === 'distrito-torre' && seg.index % 60 === 30;
    if (!(start || viaduct || arch || sign) || seg.gap || e.zN < 5) return;
    withClip(e.clip, vp, e.yN, () => {
      const left = e.xN - (B + 0.8) * s;
      const right = e.xN + (B + 0.8) * s;
      if (arch) {
        ctx.globalCompositeOperation = 'lighter';
        for (const [w, color] of [[0.5, '#ff4fa8'], [0.2, '#fff4dc']]) {
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, w * s);
          ctx.beginPath();
          ctx.ellipse(e.xN, e.yN, (B + 0.8) * s, 9 * s, 0, Math.PI, 0);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      const deck = viaduct ? 10 : 6.5;
      const thick = viaduct ? 2.2 : 1.2;
      for (const x of [left, right]) {
        ctx.fillStyle = viaduct ? '#4f5d7a' : '#c7cbe0';
        ctx.fillRect(x - 0.5 * s, e.yN - deck * s, s, deck * s);
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1, 0.06 * s);
        ctx.strokeRect(x - 0.5 * s, e.yN - deck * s, s, deck * s);
      }
      ctx.fillStyle = viaduct ? '#353a6e' : start ? INK : '#efebe4';
      ctx.fillRect(left - 0.5 * s, e.yN - (deck + thick) * s, right - left + s, thick * s);
      ctx.strokeRect(left - 0.5 * s, e.yN - (deck + thick) * s, right - left + s, thick * s);
      if (viaduct) {
        ctx.fillStyle = '#ffd36a';
        for (let i = -2; i <= 2; i++) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.beginPath();
          ctx.arc(e.xN + i * 3.5 * s, e.yN - deck * s + 0.3 * s, 0.25 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (start) {
        const cell = 0.6 * s;
        for (let c = 0; c * cell < right - left; c++) {
          for (let r = 0; r < 2; r++) {
            ctx.fillStyle = (c + r) % 2 ? INK : '#efebe4';
            ctx.fillRect(left + c * cell, e.yN - (deck + thick) * s + r * cell, cell, cell);
          }
        }
        for (let i = 0; i < 5; i++) {
          const lx = e.xN + (i - 2) * 1.5 * s;
          const ly = e.yN - (deck - 0.9) * s;
          ctx.fillStyle = INK;
          ctx.fillRect(lx - 0.65 * s, ly - 0.65 * s, 1.3 * s, 1.3 * s);
          const color = lightColor(i, race);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(lx, ly, 0.5 * s, 0, Math.PI * 2);
          ctx.fill();
          if (color !== '#353a6e') {
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 1.8 * s);
            g.addColorStop(0, color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(lx - 1.8 * s, ly - 1.8 * s, 3.6 * s, 3.6 * s);
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }
      if (sign) {
        ctx.fillStyle = '#e8459a';
        ctx.font = `700 ${Math.max(6, 0.9 * s)}px "Barlow Condensed", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('サーキット ▶ 04', e.xN, e.yN - (deck + thick / 2) * s);
      }
    });
  }

  function paintProps(e, vp) {
    const { zone, track } = view;
    if (e.zN < 8) return;
    const night = zone.time === 'noche';
    for (const prop of propsAt(e.seg, zone, track, boards)) {
      const lateral = prop.side * (track.barrier + prop.offset);
      const x = e.xN + lateral * e.sN;
      if (x < -vp.width * 0.5 || x > vp.width * 1.5) continue;
      withClip(e.clip, vp, e.yN, () => paintProp(ctx, prop.kind, x, e.yN, e.sN, {
        side: prop.side, zone, night, seed: e.seg.index, turn: prop.turn, clock: view.clock
      }));
    }
  }

  // ───────────── autos y partículas ─────────────

  function locate(s, vp, near = NEAR + 0.2) {
    const { track } = view;
    const rel = signedWrap(s - view.camS, track.length);
    if (rel < near) return null;
    const k = ((track.indexAt(s) - bands[0].seg.index) % track.segmentCount + track.segmentCount) % track.segmentCount;
    if (k >= N || !bands[k].ok) return null;
    const e = bands[k];
    const t = clamp((rel - e.zN) / (e.zF - e.zN), 0, 1);
    return { k, rel, scale: vp.focal / rel, cx: lerp(e.cxN, e.cxF, t), heading: lerp(e.hdN, e.hdF, t) };
  }

  function placeCars(race, vp) {
    for (const car of race.cars) {
      const at = locate(car.s, vp, CAR_NEAR);
      if (!at) continue;
      buckets[at.k].cars.push({ car, at });
    }
    for (const bucket of buckets) if (bucket.cars.length > 1) bucket.cars.sort((a, b) => b.at.rel - a.at.rel);
  }

  /**
   * Hacia dónde cae la sombra de un auto en pantalla. Con el sol bajo apunta lejos de él, así
   * que de frente se estira hacia la cámara y de costado cruza la pista; con el sol alto cae
   * corta; de noche, sin una luz que domine, queda solo la mancha de contacto.
   */
  function shadowLight(x, groundY, vp) {
    const sun = sunPosition(view.zone, vp, view.skyOffset);
    if (sun) {
      const vx = x - sun.x;
      const vy = Math.max(1, groundY - sun.y);
      const m = Math.hypot(vx, vy);
      return { dx: vx / m, dy: vy / m, length: 3.4 };
    }
    return view.zone.time === 'día' ? DAY_LIGHT : null;
  }

  function paintCarAt({ car, at }, vp, race) {
    const { track, atlas, zone } = view;
    const spec = race.specs[car.specId];
    const X = at.cx + car.n - view.camX;
    const x = vp.width / 2 + X * at.scale;
    const y = vp.horizon - (car.z - view.camY) * at.scale;
    const gap = track.isGapAt(car.s);
    const ground = gap ? car.z - 30 : track.heightAt(car.s);
    const groundY = vp.horizon - (ground - view.camY) * at.scale;
    const yaw = (car.psi + at.heading - Math.atan2(X, at.rel)) * 180 / Math.PI;
    const elevation = Math.atan2(view.camY - car.z, at.rel) - Math.atan(track.slopeAt(car.s));
    const incline = elevation < 0.165 ? 'subida' : 'plano';
    const blink = car.ghost > 0 ? (Math.floor(view.clock * 12) % 2 ? 0.35 : 0.8) : 1;
    const fog = fogAt(at.k, N, camera.fogDensity);
    const wet = zone.atmosphere?.wet ?? 0;
    if (wet > 0 && zone.time === 'noche' && !car.airborne && at.scale > 4) {
      const braking = car.brake > 0 || car.reversing;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = wet * blink * (1 - fog) * (braking ? 0.75 : 0.4);
      const w = 0.42 * at.scale;
      for (const side of [-1, 1]) {
        ctx.drawImage(glowSprite(TAIL_STREAK), x + side * 0.66 * at.scale - w / 2, groundY - 0.1 * at.scale, w, 1.9 * at.scale);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    withClip(bands[at.k].clip, vp, groundY, () => paintCar(ctx, atlas, car, {
      x, y, groundY, ppm: at.scale, yaw, incline, spec, clock: view.clock, swatch: colorOf(car),
      alpha: blink * (1 - fog), light: shadowLight(x, groundY, vp)
    }));
    if (zone.time === 'noche') {
      tailGlow(x, y, at.scale, car.brake > 0 || car.reversing, blink * (1 - fog));
      if (car.id === race.playerId && !car.airborne) headlights(x, y, at, vp);
    }
  }

  function tailGlow(x, y, scale, braking, alpha) {
    const r = (braking ? 0.55 : 0.32) * scale;
    if (r < 1.5) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * (braking ? 0.55 : 0.3);
    for (const side of [-1, 1]) paintGlow(ctx, x + side * 0.66 * scale, y - 0.6 * scale, r, TAIL_GLOW);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function headlights(x, y, at, vp) {
    const ahead = 14;
    const scale = vp.focal / (at.rel + ahead);
    const cx = vp.width / 2 + (at.cx + (at.heading * ahead) - view.camX) * scale;
    const cy = vp.horizon - (view.lastGround - view.camY) * scale;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 6 * scale);
    g.addColorStop(0, 'rgba(255,244,220,0.22)');
    g.addColorStop(1, 'rgba(255,244,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 6 * scale, 1.6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  const PARTICLE_STYLE = {
    [ParticleKind.SMOKE]: { additive: false, alpha: 0.42 },
    [ParticleKind.DUST]: { additive: false, alpha: 0.5 },
    [ParticleKind.SPARK]: { additive: true, alpha: 1 },
    [ParticleKind.VAPOR]: { additive: true, alpha: 0.55 },
    [ParticleKind.FLAME]: { additive: true, alpha: 0.9 },
    [ParticleKind.WATER]: { additive: false, alpha: 0.7 }
  };

  function placeParticles(vp) {
    for (const p of particles.pool) {
      if (!p.alive) continue;
      const at = locate(p.s, vp, PARTICLE_NEAR);
      if (!at) continue;
      buckets[at.k].parts.push({ p, at });
    }
  }

  /** Disco suave pre-dibujado por color: humo y polvo sin bordes duros. */
  function soft(color) {
    if (!softSprites.has(color)) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, color);
      grad.addColorStop(0.45, `${color}b0`);
      grad.addColorStop(1, `${color}00`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      softSprites.set(color, c);
    }
    return softSprites.get(color);
  }

  function paintParticle({ p, at }, vp) {
    const style = PARTICLE_STYLE[p.kind];
    const x = vp.width / 2 + (at.cx + p.n - view.camX) * at.scale;
    const y = vp.horizon - (p.z - view.camY) * at.scale;
    const fade = 1 - p.life / p.max;
    const size = Math.min(vp.width * 0.08, Math.max(0.5, p.size * at.scale));
    if (y - size > bands[at.k].clip) return;
    ctx.globalAlpha = style.alpha * fade;
    if (style.additive) ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = p.color;
    if (p.kind === ParticleKind.SPARK) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, size * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - p.vn * at.scale * 0.03, y + p.vz * at.scale * 0.03);
      ctx.stroke();
    } else {
      ctx.drawImage(soft(p.color), x - size * 1.4, y - size * 1.4, size * 2.8, size * 2.8);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ───────────── marcas de frenada ─────────────

  function trailMarks(race) {
    const { track } = view;
    for (const car of race.cars) {
      const spec = race.specs[car.specId];
      const speed = Math.abs(car.u);
      const sliding = car.slip > 0.3 || car.wheelspin > 0.3 || (car.brake > 0.7 && speed > 12 && car.slip > 0.12);
      const onRoad = Math.abs(car.n) < track.halfWidth + rules.rumbleWidth;
      const rear = car.s - spec.b * Math.cos(car.psi);
      const offsets = [-1, 1].map(side => car.n - spec.b * Math.sin(car.psi) + side * spec.width * 0.4 * Math.cos(car.psi));
      const last = wheelTrail.get(car.id);
      if (sliding && onRoad && !car.airborne && last) {
        const ds = signedWrap(rear - last.s, track.length);
        if (ds > 0.05 && ds < 4) {
          const strength = Math.min(1, Math.max(car.slip, car.wheelspin, car.brake * 0.6));
          offsets.forEach((n, i) => skids.add(last.s, last.n[i], rear, n, strength));
        }
      }
      wheelTrail.set(car.id, { s: rear, n: offsets });
    }
  }

  function placeMarks(vp) {
    for (const mark of skids.pool) {
      if (!mark.alive) continue;
      const at = locate(mark.s1, vp, PARTICLE_NEAR - 2);
      if (!at) continue;
      buckets[at.k].marks.push(mark);
    }
  }

  function paintMark(mark, vp, k) {
    const { track } = view;
    const a = locate(mark.s0, vp, NEAR + 0.5);
    const b = locate(mark.s1, vp, NEAR + 0.5);
    if (!a || !b) return;
    const ya = vp.horizon - (track.heightAt(mark.s0) - view.camY) * a.scale;
    const yb = vp.horizon - (track.heightAt(mark.s1) - view.camY) * b.scale;
    if (Math.min(ya, yb) > bands[k].clip) return;
    const fade = 1 - mark.age / skids.lifetime;
    ctx.strokeStyle = `rgba(28,31,58,${(0.26 * mark.strength * fade).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, 0.22 * (a.scale + b.scale) / 2);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(vp.width / 2 + (a.cx + mark.n0 - view.camX) * a.scale, ya);
    ctx.lineTo(vp.width / 2 + (b.cx + mark.n1 - view.camX) * b.scale, yb);
    ctx.stroke();
  }

  function emitter(id) {
    if (!emitters.has(id)) emitters.set(id, { smoke: 0, dust: 0, vapor: 0, flame: 0, spark: 0 });
    return emitters.get(id);
  }

  function emit(acc, key, rate, dt, make) {
    acc[key] += rate * dt;
    while (acc[key] >= 1) {
      acc[key] -= 1;
      particles.spawn(make());
    }
  }

  const rnd = () => Math.random() * 2 - 1;

  function spawnContinuous(race, dt) {
    const { track, zone } = view;
    for (const car of race.cars) {
      const rel = signedWrap(car.s - view.camS, track.length);
      if (rel < -10 || rel > 160) continue;
      const spec = race.specs[car.specId];
      const acc = emitter(car.id);
      const speed = Math.abs(car.u);
      const ground = track.isGapAt(car.s) ? car.z : track.heightAt(car.s);
      const rear = car.s - spec.b;
      const wheelN = side => car.n + side * spec.width * 0.42;
      if (!car.airborne && car.slip > 0.22 && speed > 4) {
        emit(acc, 'smoke', car.slip * speed * 1.4, dt, () => ({
          kind: ParticleKind.SMOKE, color: zone.smoke, s: rear, n: wheelN(rnd() > 0 ? 1 : -1), z: ground + 0.25,
          vs: car.u * 0.35, vn: rnd() * 1.2, vz: 0.5 + Math.random() * 0.8, drag: 1.4, max: 1.2 + Math.random() * 0.8, size: 0.35, grow: 1.4
        }));
      }
      if (!car.airborne && car.offroad > 0 && speed > 4) {
        emit(acc, 'dust', car.offroad * speed * 1.6, dt, () => ({
          kind: ParticleKind.DUST, color: zone.dust, s: rear, n: wheelN(rnd() > 0 ? 1 : -1), z: ground + 0.2,
          vs: car.u * 0.5, vn: rnd() * 2, vz: 1 + Math.random() * 2, gravity: 3, drag: 1.2, max: 0.9 + Math.random() * 0.5, size: 0.3, grow: 1.1
        }));
      }
      if (car.lifting) {
        emit(acc, 'vapor', 40, dt, () => ({
          kind: ParticleKind.VAPOR, color: '#fff4dc', s: car.s + rnd() * spec.halfLength * 0.8, n: car.n + rnd() * spec.halfWidth * 0.8, z: car.z,
          vs: car.u * 0.8, vn: rnd() * 2, vz: -7 - Math.random() * 3, drag: 2, max: 0.5, size: 0.25, grow: 1.6
        }));
      }
      if (car.boosting) {
        emit(acc, 'flame', 55, dt, () => ({
          kind: ParticleKind.FLAME, color: Math.random() > 0.5 ? '#5fe3f0' : '#fff4dc', s: car.s - spec.halfLength, n: car.n + rnd() * 0.6, z: car.z + 0.25 + rnd() * 0.08,
          vs: car.u - 16, vn: rnd() * 0.8, vz: rnd() * 0.5, drag: 3, max: 0.32, size: 0.3, grow: 0.9
        }));
      }
      if (car.wallContact > 3) {
        const side = Math.sign(car.n) || 1;
        emit(acc, 'spark', 30, dt, () => ({
          kind: ParticleKind.SPARK, color: Math.random() > 0.5 ? '#ffd36a' : '#ff7a24', s: car.s + rnd(), n: car.n + side * spec.halfWidth, z: ground + 0.4,
          vs: car.u * 0.6, vn: -side * (1 + Math.random() * 3), vz: 2 + Math.random() * 3, gravity: 12, drag: 0.5, max: 0.45, size: 0.06
        }));
      }
    }
  }

  function burst(count, make) {
    for (let i = 0; i < count; i++) particles.spawn(make(i));
  }

  function applyEvents(race, events) {
    const { track, zone } = view;
    const byId = id => race.cars.find(c => c.id === id);
    for (const e of events ?? []) {
      const car = byId(e.carId);
      if (!car) continue;
      const ground = track.isGapAt(car.s) ? car.z : track.heightAt(car.s);
      const mine = e.player;
      switch (e.type) {
        case 'collision': {
          const other = e.otherId !== undefined ? byId(e.otherId) : null;
          const s = other ? car.s + signedWrap(other.s - car.s, track.length) / 2 : car.s;
          const n = other ? (car.n + other.n) / 2 : car.n + Math.sign(car.n) * 1;
          burst(Math.min(24, 6 + e.intensity * 2), () => ({
            kind: ParticleKind.SPARK, color: Math.random() > 0.4 ? '#ffd36a' : '#ff7a24', s, n, z: ground + 0.5,
            vs: car.u * 0.7 + rnd() * 3, vn: rnd() * 5, vz: 1 + Math.random() * 4, gravity: 12, drag: 0.4, max: 0.5, size: 0.07
          }));
          if (mine) view.shake = Math.max(view.shake, Math.min(1, e.intensity / 10));
          break;
        }
        case 'landed':
          if (e.impact > 2.5) {
            burst(Math.min(26, 8 + e.impact * 2), i => ({
              kind: ParticleKind.DUST, color: zone.dust, s: car.s + rnd() * 2, n: car.n + Math.cos(i) * 1.6, z: ground + 0.1,
              vs: car.u * 0.6, vn: Math.cos(i) * 4, vz: 1 + Math.random() * 2, gravity: 4, drag: 1.6, max: 0.8, size: 0.4, grow: 1.4
            }));
          }
          if (mine) view.shake = Math.max(view.shake, Math.min(0.8, e.impact / 12));
          break;
        case 'bottom-out':
          burst(12, () => ({
            kind: ParticleKind.SPARK, color: '#ffd36a', s: car.s + rnd() * 1.5, n: car.n + rnd() * 0.8, z: ground + 0.1,
            vs: car.u * 0.5, vn: rnd() * 3, vz: 1 + Math.random() * 2, gravity: 12, drag: 0.4, max: 0.4, size: 0.06
          }));
          break;
        case 'thrust':
          burst(22, i => ({
            kind: ParticleKind.VAPOR, color: i % 2 ? '#fff4dc' : '#5fe3f0', s: car.s + rnd() * 1.5, n: car.n + Math.cos(i * 1.7) * 1.4, z: ground + 0.15,
            vs: car.u * 0.7, vn: Math.cos(i * 1.7) * 6, vz: Math.random() * 1.5, drag: 2.5, max: 0.7, size: 0.35, grow: 2.2
          }));
          break;
        case 'fell':
          burst(30, () => ({
            kind: zone.id === 'costa-rosa' ? ParticleKind.WATER : ParticleKind.DUST, color: zone.id === 'costa-rosa' ? '#efebe4' : zone.dust,
            s: car.s, n: car.n + rnd() * 2, z: car.z, vs: rnd() * 3, vn: rnd() * 4, vz: 4 + Math.random() * 6, gravity: 9, drag: 0.6, max: 1.1, size: 0.35, grow: 0.6
          }));
          break;
        default:
      }
    }
  }

  // ───────────── efectos de pantalla ─────────────

  /** Con el sol bajo de frente, el asfalto brilla en un camino de luz debajo del sol. */
  function paintSunPath(vp) {
    const sun = sunPosition(view.zone, vp, view.skyOffset);
    if (!sun) return;
    const unit = Math.min(vp.width, vp.height * 0.62);
    const w = unit * 0.42;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18;
    ctx.drawImage(glowSprite(SUN_PATH), sun.x - w / 2, vp.horizon - vp.height * 0.03, w, vp.height * 0.55);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function bloomCanvas(current, w, h) {
    if (current && current.width === w && current.height === h) return current;
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    return c;
  }

  /**
   * Resplandor difuso: la imagen achicada (que la difumina), multiplicada por sí misma (que apaga
   * lo oscuro y deja lo brillante) y sumada encima. Es el brillo suave de los fondos de animé.
   */
  function paintBloom(vp) {
    const strength = view.zone.time === 'noche' ? 0.5 : 0.3;
    const w1 = Math.max(2, Math.round(vp.width / 4));
    const h1 = Math.max(2, Math.round(vp.height / 4));
    const w2 = Math.max(2, Math.round(vp.width / 16));
    const h2 = Math.max(2, Math.round(vp.height / 16));
    bloomSmall = bloomCanvas(bloomSmall, w1, h1);
    bloomTiny = bloomCanvas(bloomTiny, w2, h2);
    const small = bloomSmall.getContext('2d');
    const tiny = bloomTiny.getContext('2d');
    small.globalCompositeOperation = 'copy';
    small.drawImage(canvas, 0, 0, w1, h1);
    tiny.globalCompositeOperation = 'copy';
    tiny.drawImage(bloomSmall, 0, 0, w2, h2);
    // A la cuarta potencia: el asfalto claro casi no suma, las luces sí.
    tiny.globalCompositeOperation = 'multiply';
    tiny.drawImage(bloomTiny, 0, 0);
    tiny.drawImage(bloomTiny, 0, 0);
    tiny.drawImage(bloomTiny, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = strength;
    ctx.drawImage(bloomTiny, 0, 0, vp.width, vp.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Destello de lente: reflejos en línea desde el sol hacia el centro de la imagen. */
  function paintFlare(vp) {
    const sun = sunPosition(view.zone, vp, view.skyOffset);
    if (!sun || sun.x < 0 || sun.x > vp.width) return;
    const cx = vp.width / 2;
    const cy = vp.height / 2;
    const unit = Math.min(vp.width, vp.height * 0.62);
    ctx.globalCompositeOperation = 'lighter';
    for (const [t, size, color] of FLARE) {
      paintGlow(ctx, sun.x + (cx - sun.x) * t * 2, sun.y + (cy - sun.y) * t * 2, unit * size, [[0, color], [0.7, color.replace(/[\d.]+\)$/, '0.08)')], [1, 'rgba(0,0,0,0)']]);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function paintSpeedLines(focus, vp) {
    const speed = Math.abs(focus.u);
    const amount = clamp((speed - 50) / 30, 0, 1) + (focus.boosting ? 0.6 : 0);
    if (amount <= 0 || view.reducedMotion) return;
    ctx.strokeStyle = 'rgba(255,244,220,0.5)';
    ctx.globalAlpha = Math.min(0.55, amount * 0.4);
    ctx.lineWidth = Math.max(1, vp.width / 900);
    const cx = vp.width / 2;
    const cy = vp.horizon;
    const seed = Math.floor(view.clock * 30);
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const a = (hashNoise(i, seed) + 1) * Math.PI;
      const r0 = vp.width * (0.35 + 0.25 * Math.abs(hashNoise(i + 3, seed)));
      const r1 = r0 + vp.width * 0.18 * amount;
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.6);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.6);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function paintVignette(vp) {
    if (!vignette) {
      vignette = ctx.createRadialGradient(vp.width / 2, vp.height * 0.55, vp.height * 0.35, vp.width / 2, vp.height * 0.55, Math.max(vp.width, vp.height) * 0.78);
      vignette.addColorStop(0, 'rgba(5,6,15,0)');
      vignette.addColorStop(1, 'rgba(5,6,15,0.42)');
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, vp.width, vp.height);
  }

  return {
    resize,
    setAtlas(atlas) { view.atlas = atlas; },
    setZone(zone) {
      view.zone = zone;
      view.fogRgb = hexToRgb(zone.fog);
      fogStyles = Array.from({ length: N }, (_, k) => {
        const fog = fogAt(k, N, camera.fogDensity);
        return fog > 0.02 ? `rgba(${view.fogRgb},${fog.toFixed(3)})` : null;
      });
      const atm = zone.atmosphere;
      asphaltStyles = zone.road.asphalt.map(color => Array.from({ length: N }, (_, k) => {
        if (!atm) return color;
        const t = clamp(k / (N * 0.35), 0, 1);
        return mix(color, atm.glow[0], atm.sheen * t * t * (3 - 2 * t));
      }));
      rampStyles = asphaltStyles.map(list => list.map(color => mix(color, '#fff4dc', 0.18)));
      tireStyles = asphaltStyles.map(list => list.map(color => mix(color, INK, 0.07)));
      runoffStyles = zone.road.ground.map(color => mix(color, INK, 0.12));
    },
    setTrack(next) {
      view.track = next;
      view.camY = null;
      particles.clear();
      emitters.clear();
      skids.clear();
      wheelTrail.clear();
      boards = distanceBoards(next);
      minimap.setTrack(next);
    },
    setReducedMotion(value) { view.reducedMotion = value; },
    setQuality(value) { view.quality = clamp(Math.round(value), 0, 2); },
    get quality() { return view.quality; },

    /** Dibuja un cuadro. `focusId` elige el auto que sigue la cámara (por defecto, el jugador). */
    render(race, { dt = 0, events = [], focusId = race.playerId, minimap: showMinimap = true } = {}) {
      if (!view.zone || !view.track) return;
      const focus = race.cars.find(c => c.id === focusId) ?? race.cars[0];
      view.clock += dt;
      updateCamera(focus, dt);
      applyEvents(race, events);
      spawnContinuous(race, dt);
      particles.update(dt, s => view.track.wrap(s));
      trailMarks(race);
      skids.update(dt);
      const wantTilt = view.reducedMotion ? 0 : clamp(-focus.ay * 0.0022, -0.035, 0.035);
      view.tilt += (wantTilt - view.tilt) * clamp(dt * 3, 0, 1);

      const base = view.viewport;
      const vp = { ...base, focal: base.focal * view.focal };
      view.shake = Math.max(0, view.shake - dt * 2.5);
      const shake = view.reducedMotion ? 0 : view.shake;
      ctx.save();
      if (shake > 0) ctx.translate(wobble(view.clock * 26, 1) * shake * vp.width * 0.012, wobble(view.clock * 29, 2) * shake * vp.height * 0.012);
      if (view.tilt) {
        ctx.translate(vp.width / 2, vp.height * 0.6);
        ctx.rotate(view.tilt);
        ctx.scale(1.04, 1.04);
        ctx.translate(-vp.width / 2, -vp.height * 0.6);
      }

      paintBackdrop(ctx, view.zone, vp, view.skyOffset, view.clock, view.quality);
      computeBands(vp);
      paintRoad(vp, camera.fogDensity);
      if (view.quality > 0) paintSunPath(vp);

      for (const bucket of buckets) {
        bucket.cars.length = 0;
        bucket.parts.length = 0;
        bucket.marks.length = 0;
      }
      placeCars(race, vp);
      placeParticles(vp);
      placeMarks(vp);
      for (let k = N - 1; k >= 0; k--) {
        const e = bands[k];
        if (!e.ok) continue;
        const fade = 1 - fogAt(k, N, camera.fogDensity);
        if (fade < 0.02) continue;
        for (const mark of buckets[k].marks) paintMark(mark, vp, k);
        ctx.globalAlpha = fade;
        paintWalls(e, vp);
        paintProps(e, vp);
        paintOverhead(e, vp, race);
        ctx.globalAlpha = 1;
        for (const item of buckets[k].parts) paintParticle(item, vp);
        for (const item of buckets[k].cars) paintCarAt(item, vp, race);
      }
      ctx.restore();

      if (view.quality > 1) paintBloom(vp);
      if (view.quality > 0) paintFlare(vp);
      paintSpeedLines(focus, vp);
      paintVignette(vp);
      if (showMinimap) minimap.paint(ctx, race, vp, colorOf, race.playerId);
    }
  };
}
