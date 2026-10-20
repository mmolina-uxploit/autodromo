/**
 * Catálogo de todo lo que Autódromo dibuja con código (no sprites): utilería, fondos,
 * calzada y estructuras, efectos y minimapa. Usa los mismos módulos que el juego, así
 * cada imagen es exactamente lo que se ve en carrera.
 *
 * Deja en window.catalogo una lista de { path, data } (PNG en data URI) y una lista de
 * anclas de la utilería; tools/catalogo/exportar.mjs los guarda en disco.
 */
import { ZONES, findZone } from '../../src/config/zones.js';
import { TRACKS, trackOptions } from '../../src/config/tracks.js';
import { VEHICLES, findVehicle, findLivery } from '../../src/config/vehicles.js';
import { CAMERA } from '../../src/config/camera.js';
import { createRules } from '../../src/config/rules.js';
import { Track } from '../../src/domain/track.js';
import { createVehicleSpec } from '../../src/domain/vehicle.js';
import { createCar } from '../../src/domain/car.js';
import { hashNoise } from '../../src/domain/math.js';
import { paintProp } from '../../src/infrastructure/rendering/props.js';
import {
  paintBackdrop, paintSky, paintStars, paintClouds, paintSkyline, paintSunGlare, withUnit
} from '../../src/infrastructure/rendering/backdrop.js';
import { createViewport } from '../../src/infrastructure/rendering/projection.js';
import { createCanvasRenderer } from '../../src/infrastructure/rendering/canvas-renderer.js';
import { createMinimap } from '../../src/infrastructure/rendering/minimap.js';
import { loadSpriteAtlas } from '../../src/infrastructure/rendering/sprite-atlas.js';

const out = [];
const anchors = [];
const save = (path, canvas) => out.push({ path, data: canvas.toDataURL('image/png') });
// Las vistas del juego son opacas: van en JPEG de alta calidad para que el paquete pese poco.
const photo = (path, canvas) => out.push({ path: path.replace(/\.png$/, '.jpg'), data: canvas.toDataURL('image/jpeg', 0.92) });

function blank(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Recorta el borde transparente; devuelve la imagen y el punto (ax, ay) ya corrido. */
function trim(canvas, ax, ay, pad = 8) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { image: canvas, ax, ay };
  const image = blank(x1 - x0 + 1 + pad * 2, y1 - y0 + 1 + pad * 2);
  image.getContext('2d').drawImage(canvas, x0 - pad, y0 - pad, image.width, image.height, 0, 0, image.width, image.height);
  return { image, ax: ax - x0 + pad, ay: ay - y0 + pad };
}

// ───────────── 1. utilería ─────────────

const PPM = 40;
const PROP_NAMES = {
  pillar: 'columna', lamp: 'farola', palm: 'palmera', tree: 'arbol', beacon: 'baliza',
  screen: 'pantalla', billboard: 'cartel', chevron: 'flecha-curva', distance: 'cartel-distancia', grandstand: 'tribuna'
};
const SIDES = [[-1, 'lado-izquierdo'], [1, 'lado-derecho']];

function variants(kind) {
  switch (kind) {
    case 'lamp':
    case 'palm':
      return SIDES.map(([side, label]) => ({ label, side }));
    case 'screen':
    case 'billboard':
      return [0, 1, 2, 3, 4, 5].map(seed => ({ label: String(seed + 1), seed }));
    case 'chevron':
      return [{ label: 'derecha', turn: 1, side: -1 }, { label: 'izquierda', turn: -1, side: 1 }];
    case 'distance':
      return [100, 200, 300].map(meters => ({ label: `${meters}m`, turn: meters }));
    case 'grandstand':
      return [0, 1, 2].map(i => ({ label: `cuadro-${i + 1}`, clock: i / 6 + 0.01 }));
    default:
      return [{ label: '' }];
  }
}

function kindsOf(zone) {
  const kinds = [...new Set(zone.props)];
  if (zone.lamps) kinds.push('lamp');
  return [...kinds, 'chevron', 'distance', 'grandstand'];
}

function paintPropImage(kind, zone, variant) {
  const canvas = blank(26 * PPM, 20 * PPM);
  const ctx = canvas.getContext('2d');
  const gx = canvas.width / 2;
  const gy = canvas.height - PPM;
  paintProp(ctx, kind, gx, gy, PPM, {
    side: variant.side ?? 1, zone, night: zone.time === 'noche', seed: variant.seed ?? 0, turn: variant.turn ?? 0, clock: variant.clock ?? 0
  });
  return trim(canvas, gx, gy);
}

const LABEL_FONT = '600 26px "Barlow Condensed", sans-serif';

function propSheet(zone, items) {
  const width = 2400;
  const label = 34;
  const gapX = 40;
  const measure = blank(1, 1).getContext('2d');
  measure.font = LABEL_FONT;
  for (const item of items) item.slot = Math.max(item.image.width, Math.ceil(measure.measureText(item.name).width));
  const rows = [];
  let row = { items: [], width: 0, height: 0 };
  for (const item of items) {
    if (row.width + item.slot > width - 80 && row.items.length) {
      rows.push(row);
      row = { items: [], width: 0, height: 0 };
    }
    row.items.push(item);
    row.width += item.slot + gapX;
    row.height = Math.max(row.height, item.ay);
  }
  rows.push(row);
  const below = items.reduce((m, it) => Math.max(m, it.image.height - it.ay), 0);
  const heights = rows.map(r => r.height + below + label + 30);
  const sheet = blank(width, 110 + heights.reduce((a, b) => a + b, 0));
  const ctx = sheet.getContext('2d');
  const night = zone.time === 'noche';
  ctx.fillStyle = zone.sky[night ? 1 : 0];
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = night ? '#efebe4' : '#1c1f3a';
  ctx.font = '700 44px "Barlow Condensed", sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(`${zone.name} · utilería (${night ? 'noche' : 'día'}, ${PPM} px = 1 m)`, 40, 30);
  let y = 110;
  rows.forEach((r, i) => {
    const ground = y + r.height;
    ctx.fillStyle = zone.road.ground[0];
    ctx.fillRect(0, ground, sheet.width, heights[i] - r.height - 10);
    let x = 40;
    for (const item of r.items) {
      ctx.drawImage(item.image, x + (item.slot - item.image.width) / 2, ground - item.ay);
      ctx.fillStyle = night ? '#efebe4' : '#1c1f3a';
      ctx.font = LABEL_FONT;
      ctx.fillText(item.name, x, ground + below + 4);
      x += item.slot + gapX;
    }
    y += heights[i];
  });
  return sheet;
}

function catalogProps() {
  for (const zone of ZONES) {
    const items = [];
    for (const kind of kindsOf(zone)) {
      for (const variant of variants(kind)) {
        const name = [PROP_NAMES[kind], variant.label].filter(Boolean).join('-');
        const { image, ax, ay } = paintPropImage(kind, zone, variant);
        const path = `1-utileria/${zone.id}/${name}.png`;
        save(path, image);
        anchors.push({ archivo: path, codigo: kind, zona: zone.id, ancho: image.width, alto: image.height, apoyoX: ax, apoyoY: ay });
        items.push({ image, ax, ay, name });
      }
    }
    save(`1-utileria/lamina-${zone.id}.png`, propSheet(zone, items));
  }
}

// ───────────── 2. fondos ─────────────

function catalogBackdrops() {
  const vp = withUnit(createViewport(1920, 1080, CAMERA));
  const layer = (path, draw) => {
    const canvas = blank(vp.width, vp.height);
    draw(canvas.getContext('2d'));
    save(path, canvas);
  };
  for (const zone of ZONES) {
    const dir = `2-fondos/${zone.id}`;
    layer(`${dir}/completo.png`, ctx => paintBackdrop(ctx, zone, vp, 0, 0));
    layer(`${dir}/capa-1-cielo.png`, ctx => paintSky(ctx, zone, vp));
    if (zone.time === 'noche') layer(`${dir}/capa-2-estrellas.png`, ctx => paintStars(ctx, vp, 0));
    else layer(`${dir}/capa-2-nubes.png`, ctx => paintClouds(ctx, vp, 0, 0));
    layer(`${dir}/capa-3-horizonte.png`, ctx => paintSkyline(ctx, zone, vp, 0));
    if (zone.backdrop === 'coast') layer(`${dir}/capa-4-sol.png`, ctx => paintSunGlare(ctx, zone, vp, 0));
  }
}

// ───────────── 3 y 4. escenas con el dibujante real ─────────────

const rules = createRules();
const specs = Object.fromEntries(VEHICLES.map(v => [v.id, createVehicleSpec(v.id, v.physics)]));
// La cámara sigue a un auto invisible: así las vistas muestran solo lo dibujado con código.
specs.camara = Object.freeze({ ...specs.cuna, id: 'camara', width: 0.001 });
const worlds = TRACKS.map(def => ({ def, track: Track.fromLayout(def.layout, trackOptions(def, rules)), zone: findZone(def.zone) }));
const colorOf = car => findLivery(findVehicle(car.model), car.livery).swatch;
const stage = document.getElementById('escenario');

function car(world, id, model, livery, s, n, extra = {}) {
  const spec = specs[model];
  const base = createCar({ id, spec, model, livery, s: world.track.wrap(s), n, height: world.track.heightAt(s) });
  return { ...base, ...extra };
}

/**
 * Arma una carrera mínima y la dibuja `frames` cuadros. Los autos avanzan con su `u`;
 * `events` se aplican en el cuadro `eventsAt`. Devuelve el canvas del cuadro final.
 */
function shoot(world, { camS = 0, camN = 0, cars = [], focusId = 'camara', status = 'running', countdown = 0, raceClock = 30, frames = 40, events = [], eventsAt = null, minimap = false, dollyU = 0, dollyBoost = false, playerId = 'nadie', atlas }) {
  const { track, zone } = world;
  const renderer = createCanvasRenderer(stage, { rules, cameraConfig: CAMERA, colorOf });
  renderer.resize();
  renderer.setAtlas(atlas);
  renderer.setZone(zone);
  renderer.setTrack(track);
  const dolly = { ...createCar({ id: 'camara', spec: specs.camara, s: track.wrap(camS + CAMERA.distance), n: camN, height: 0 }), u: dollyU, boosting: dollyBoost, z: -500 };
  // Con `focusId` de un auto visible la cámara lo sigue como al jugador (sube con él en el aire).
  let all = focusId === 'camara' ? [dolly, ...cars] : cars;
  const dt = 1 / 60;
  const at = eventsAt ?? frames - 8;
  for (let i = 0; i < frames; i++) {
    all = all.map(c => (c.u ? { ...c, s: track.wrap(c.s + c.u * dt), z: c.airborne ? c.z : (c.id === 'camara' ? -500 : track.heightAt(c.s + c.u * dt)) } : c));
    const race = { cars: all, specs, status, countdown, countdownTotal: rules.countdownSeconds, clock: raceClock, playerId };
    renderer.render(race, { dt, events: i === at ? events : [], focusId, minimap });
  }
  return stage;
}

function longestStraight(track) {
  const n = track.segmentCount;
  let best = { start: 0, length: 0 };
  let start = null;
  for (let i = 0; i < n * 2; i++) {
    const seg = track.segment(i);
    const flat = Math.abs(seg.curvature) < 1 / 800 && !seg.gap && !seg.ramp && !seg.landing && !seg.isStartLine;
    if (flat && start === null) start = i;
    if (!flat && start !== null) {
      if (i - start > best.length && start < n) best = { start, length: i - start };
      start = null;
    }
  }
  return best;
}

function firstSharpTurn(track) {
  const n = track.segmentCount;
  for (let i = 20; i < n; i++) {
    if (Math.abs(track.segment(i).curvature) > 1 / 90 && Math.abs(track.segment(i - 1).curvature) <= 1 / 90 && Math.abs(track.segment(i - 30).curvature) < 1 / 500) return i;
  }
  return Math.floor(n / 3);
}

function firstBoost(track) {
  for (let i = 0; i < track.segmentCount; i++) if (track.segment(i).boost) return i;
  return null;
}

function catalogTracks(atlas) {
  const L = rules.segmentLength;
  for (const world of worlds) {
    const { track, def } = world;
    const dir = `3-calzada-y-estructuras/${def.id}`;
    const grid = [0, 1, 2, 3].map(i => car(world, i + 1, VEHICLES[i % 4].id, VEHICLES[i % 4].liveries[0].id, track.length - 10 - i * 7, i % 2 ? 2.6 : -2.6));
    const T = rules.countdownSeconds;
    photo(`${dir}/largada-con-grilla.png`, shoot(world, { camS: track.length - 34, cars: grid, status: 'countdown', countdown: T - 3.5 / 6 * T, atlas }));
    photo(`${dir}/largada-sin-autos.png`, shoot(world, { camS: track.length - 34, status: 'countdown', countdown: T - 3.5 / 6 * T, atlas }));
    const straight = longestStraight(track);
    photo(`${dir}/recta.png`, shoot(world, { camS: (straight.start + Math.min(40, straight.length / 3)) * L, atlas }));
    const turn = firstSharpTurn(track);
    photo(`${dir}/antes-de-curva.png`, shoot(world, { camS: turn * L - 120, atlas }));
    photo(`${dir}/en-curva.png`, shoot(world, { camS: turn * L + 5, atlas }));
    const boost = firstBoost(track);
    if (boost !== null) photo(`${dir}/franja-de-empuje.png`, shoot(world, { camS: boost * L - 18, atlas }));
    track.jumps.forEach((jump, i) => {
      const name = `salto-${i + 1}`;
      photo(`${dir}/${name}-a-50m.png`, shoot(world, { camS: jump.lip - 50, atlas }));
      photo(`${dir}/${name}-en-el-labio.png`, shoot(world, { camS: jump.lip - 9, atlas }));
      // La cámara llega en movimiento para recordar la altura del labio, como en carrera.
      photo(`${dir}/${name}-sobre-el-foso.png`, shoot(world, { camS: jump.gapStart + 1 - 10, dollyU: 15, atlas }));
    });
    if (def.id === 'bajo-autopista') {
      for (let lit = 0; lit <= 5; lit++) {
        photo(`${dir}/semaforo-${lit}-luces.png`, shoot(world, { camS: track.length - 20, status: 'countdown', countdown: T - (lit + 0.5) / 6 * T, atlas, frames: 4 }));
      }
      photo(`${dir}/semaforo-verde.png`, shoot(world, { camS: track.length - 20, status: 'running', raceClock: 1, atlas, frames: 4 }));
    }
  }
}

function catalogEffects(atlas) {
  const day = worlds.find(w => w.def.id === 'costa-rosa');
  const night = worlds.find(w => w.def.id === 'bajo-autopista');
  const neon = worlds.find(w => w.def.id === 'anillo-neon');
  const dir = '4-efectos';
  // El auto del efecto es el que sigue la cámara, a la distancia del jugador en carrera.
  const startOf = world => longestStraight(world.track).start * rules.segmentLength + 36;
  const follow = { focusId: 1, playerId: 1, atlas, frames: 80 };
  for (const world of [day, night]) {
    const at = startOf(world);
    const zoneDir = `${dir}/${world.zone.id}`;
    const ground = world.track.heightAt(at);
    const u = 26;
    const one = (model, livery, n, extra) => [car(world, 1, model, livery, at, n, { u, ...extra })];
    // Humo, marcas y chispas se quedan atrás del auto que los genera: se ven mejor en un rival adelante.
    const rival = (model, livery, n, extra) => [car(world, 1, 'saeta', 'grafito', at, -2.4, { u }), car(world, 2, model, livery, at + 11, n, { u, ...extra })];
    photo(`${zoneDir}/humo-y-marcas-de-frenada.png`, shoot(world, { ...follow, frames: 110, cars: rival('cuna', 'coral', 1.6, { slip: 0.75, psi: 0.18 }) }));
    const out = world.track.halfWidth + rules.rumbleWidth + 1.6;
    photo(`${zoneDir}/polvo-fuera-de-pista.png`, shoot(world, { ...follow, cars: one('bloque', 'mostaza', out, { offroad: 1 }) }));
    photo(`${zoneDir}/chispas-contra-la-defensa.png`, shoot(world, { ...follow, cars: rival('saeta', 'magenta', world.track.barrier - 1.15, { wallContact: 6 }) }));
    photo(`${zoneDir}/propulsor-de-empuje.png`, shoot(world, { ...follow, cars: one('volta', 'rubi', 0, { u: 40, boosting: true, throttle: 1 }) }));
    photo(`${zoneDir}/planeo.png`, shoot(world, { ...follow, cars: one('volta', 'perla', 0, { lifting: true, airborne: true, z: ground + 2.2, vz: -0.4, airTime: 1 }) }));
    photo(`${zoneDir}/impulso-de-salto.png`, shoot(world, {
      ...follow, frames: 40, eventsAt: 33, events: [{ type: 'thrust', carId: 1 }],
      cars: one('volta', 'noche', 0, { airborne: true, z: ground + 0.9, vz: 5, airTime: 0.1 })
    }));
    photo(`${zoneDir}/polvo-de-aterrizaje.png`, shoot(world, {
      ...follow, frames: 40, eventsAt: 30, events: [{ type: 'landed', carId: 1, impact: 9 }], cars: one('bloque', 'turquesa', 0)
    }));
    photo(`${zoneDir}/chispas-de-choque.png`, shoot(world, {
      ...follow, frames: 40, eventsAt: 34, events: [{ type: 'collision', carId: 1, otherId: 2, intensity: 9 }],
      cars: [car(world, 1, 'cuna', 'lima', at, -1.2, { u }), car(world, 2, 'saeta', 'grafito', at + 1.5, 1.2, { u })]
    }));
    // Petardeo: aparece en cuadros sueltos; se busca uno donde el ruido del escape lo dispare.
    let frames = 40;
    while (frames < 200 && hashNoise(Math.floor((frames / 60) * 14), 1) < 0.55) frames++;
    photo(`${zoneDir}/petardeo-del-escape.png`, shoot(world, {
      ...follow, frames, cars: one('cuna', 'lima', 0, { throttle: 0, rpm: specs.cuna.redline * 0.9 })
    }));
    if (world.zone.time === 'noche') {
      photo(`${zoneDir}/luces-traseras-y-faros.png`, shoot(world, { ...follow, cars: one('saeta', 'hormigon', 0, { brake: 1 }) }));
    }
    photo(`${zoneDir}/lineas-de-velocidad.png`, shoot(world, { ...follow, cars: one('volta', 'rubi', 0, { u: 78, boosting: true }) }));
  }
  {
    // Caída al foso: la cámara mira desde la rampa y el auto ya está abajo; salpica el agua.
    const jump = day.track.jumps[0];
    const lipHeight = day.track.heightAt(jump.lip - 0.5);
    photo(`${dir}/costa-rosa/salpicadura-al-caer.png`, shoot(day, {
      camS: jump.lip - 9, atlas, frames: 40, eventsAt: 12, events: [{ type: 'fell', carId: 1 }],
      cars: [car(day, 1, 'saeta', 'magenta', jump.gapStart + 2.5, 0, { z: lipHeight - 1.5 })]
    }));
  }
  {
    const at = startOf(neon);
    photo(`${dir}/anillo-neon/defensas-de-neon-y-empuje.png`, shoot(neon, { ...follow, cars: [car(neon, 1, 'volta', 'noche', at, 0, { u: 40, boosting: true })] }));
  }
}

function catalogMinimaps() {
  for (const world of worlds) {
    const { track } = world;
    const minimap = createMinimap();
    minimap.setTrack(track);
    const vp = { width: 420, height: 920 };
    const canvas = blank(vp.width, vp.height);
    const cars = [0, 1, 2, 3, 4, 5].map(i => car(world, i + 1, VEHICLES[i % 4].id, VEHICLES[i % 4].liveries[i % 2].id, track.length * (0.08 + i * 0.13), 0));
    minimap.paint(canvas.getContext('2d'), { cars }, vp, colorOf, 1);
    const size = Math.round(Math.min(220, Math.max(96, Math.min(vp.width, vp.height) * 0.24)));
    const left = vp.width - size - Math.round(vp.width * 0.02) - 8;
    const top = Math.round(vp.height * 0.12) + 8;
    const crop = blank(size + 16, size + 16);
    crop.getContext('2d').drawImage(canvas, left - 8, top - 8, crop.width, crop.height, 0, 0, crop.width, crop.height);
    save(`4-efectos/minimapa/${world.def.id}.png`, crop);
  }
}

async function main() {
  const status = document.getElementById('estado');
  try {
    await document.fonts.ready;
    const atlas = await loadSpriteAtlas('assets/sprites');
    catalogProps();
    catalogBackdrops();
    catalogTracks(atlas);
    catalogEffects(atlas);
    catalogMinimaps();
    window.catalogo = { imagenes: out, anclas: anchors };
    status.textContent = `${out.length} imágenes`;
    document.documentElement.dataset.listo = 'si';
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    document.documentElement.dataset.listo = 'error';
    window.catalogoError = String(error.stack ?? error);
  }
}

main();
