import { hashNoise } from '../../domain/math.js';

/**
 * El campo pintado de las zonas rurales: parcelas de cultivo en varios verdes con bordos entre
 * ellas, matas de pasto con flores al costado de la ruta y parches en el asfalto. Todo sale del
 * índice de segmento, así el mismo tramo se ve igual en cada vuelta y no titila.
 *
 * Las funciones reciben una banda ya proyectada: { seg, xN, yN, sN, xF, yF, sF }.
 */

const FIELD_LENGTH = 8;      // segmentos por parcela a lo largo (24 m)
const REACH = 150;           // m de campo a cada lado
const unit = (a, b) => (hashNoise(a, b) + 1) / 2;

/** Lado a lado de la banda, entre dos desplazamientos laterales (m) del lado `s`. */
function sidePath(ctx, e, a, b, s, overlap) {
  ctx.moveTo(e.xN + s * a * e.sN, e.yN + overlap);
  ctx.lineTo(e.xN + s * b * e.sN, e.yN + overlap);
  ctx.lineTo(e.xF + s * b * e.sF, e.yF);
  ctx.lineTo(e.xF + s * a * e.sF, e.yF);
  ctx.closePath();
}

const plotCache = new Map();
/** Parcelas de un bloque a un lado: [desde, hasta, índice de color], desde `from` hasta REACH. */
function plots(block, side, from, colors) {
  const key = `${block}:${side}:${from}:${colors}`;
  let list = plotCache.get(key);
  if (list) return list;
  list = [];
  let at = from;
  for (let j = 0; at < REACH; j++) {
    const width = 7 + 18 * unit(block * 7.3 + j, side * 13.1);
    list.push([at, Math.min(REACH, at + width), Math.floor(unit(block * 3.1 + j * 5.7, side * 2.9 + 1) * colors) % colors]);
    at += width;
  }
  plotCache.set(key, list);
  return list;
}

/**
 * Parcelas: cada color en un solo relleno por banda. Los colores vienen de a pares (surco y
 * entresurco) y alternan con la banda, así se ven las hileras del cultivo. Entre parcelas, un
 * bordo más claro; al comienzo de cada bloque, el bordo que cruza.
 */
// Hasta dónde llega la pantalla de cada lado en esta banda (m desde el eje).
function reachOf(e, width, s) {
  const near = s > 0 ? (width - e.xN) / e.sN : e.xN / e.sN;
  const far = s > 0 ? (width - e.xF) / e.sF : e.xF / e.sF;
  return Math.min(REACH, Math.max(near, far));
}

export function paintFields(ctx, e, fields, from, band, width) {
  // En una banda de menos de un píxel el mosaico es ruido y la niebla lo tapa igual.
  if (e.yN - e.yF < 1) return;
  const block = Math.floor(e.seg.index / FIELD_LENGTH);
  const left = plots(block, -1, from, fields.colors.length);
  const right = plots(block, 1, from, fields.colors.length);
  const reachL = reachOf(e, width, -1);
  const reachR = reachOf(e, width, 1);
  let used = 0;
  for (const [a, , ci] of left) if (a < reachL) used |= 1 << ci;
  for (const [a, , ci] of right) if (a < reachR) used |= 1 << ci;
  for (let c = 0; c < fields.colors.length; c++) {
    if (!(used & (1 << c))) continue;
    ctx.beginPath();
    for (const [a, b, ci] of left) if (ci === c && a < reachL) sidePath(ctx, e, a, b, -1, 1);
    for (const [a, b, ci] of right) if (ci === c && a < reachR) sidePath(ctx, e, a, b, 1, 1);
    ctx.fillStyle = fields.colors[c][band];
    ctx.fill();
  }
  const levee = 0.7;
  if (levee * e.sN < 1) return;
  ctx.beginPath();
  for (const [a] of left) if (a < reachL) sidePath(ctx, e, a, a + levee, -1, 1);
  for (const [a] of right) if (a < reachR) sidePath(ctx, e, a, a + levee, 1, 1);
  ctx.fillStyle = fields.levee;
  ctx.fill();
  if (e.seg.index % FIELD_LENGTH === 0) {
    const thick = Math.max(1, levee * 0.25 * e.sN);
    ctx.fillStyle = fields.levee;
    ctx.beginPath();
    for (const [s, r] of [[-1, reachL], [1, reachR]]) {
      if (r <= from) continue;
      ctx.moveTo(e.xN + s * from * e.sN, e.yN);
      ctx.lineTo(e.xN + s * r * e.sN, e.yN);
      ctx.lineTo(e.xN + s * r * e.sN, e.yN - thick);
      ctx.lineTo(e.xN + s * from * e.sN, e.yN - thick);
      ctx.closePath();
    }
    ctx.fill();
  }
}

const TUFTS = 26;
/**
 * Matas de pasto entre la ruta y el campo: hojas oscuras con una más clara encima y, de vez en
 * cuando, una flor. Crecen hacia arriba, así que se pintan en la pasada de atrás hacia
 * adelante, no con el piso.
 */
export function paintTufts(ctx, e, from, to, palette, width) {
  const i = e.seg.index;
  const dark = [];
  const light = [];
  ctx.lineCap = 'round';
  for (let j = 0; j < TUFTS; j++) {
    const s = j % 2 ? 1 : -1;
    const lat = from + (to - from) * unit(i * 1.7 + j, 31) ** 1.4;
    const t = unit(i * 2.3 + j, 47);
    const scale = e.sN + (e.sF - e.sN) * t;
    const x = e.xN + (e.xF - e.xN) * t + s * lat * scale;
    const y = e.yN + (e.yF - e.yN) * t;
    const h = (0.22 + 0.3 * unit(i + j * 3.3, 53)) * scale;
    if (h < 1.2 || x < -h || x > width + h) continue;
    const lean = (unit(i * 0.9 + j, 61) - 0.5) * 0.8;
    dark.push(x, y, h, lean);
    if (unit(i * 1.3 + j, 71) > 0.82) light.push(x, y, h, lean, 1);
    else light.push(x, y, h, lean, 0);
  }
  ctx.lineWidth = Math.max(1, 0.07 * e.sN);
  ctx.strokeStyle = palette.dark;
  ctx.beginPath();
  for (let k = 0; k < dark.length; k += 4) {
    const [x, y, h, lean] = [dark[k], dark[k + 1], dark[k + 2], dark[k + 3]];
    for (const [dx, f] of [[-0.3, 0.55], [-0.15, 0.8], [0, 1], [0.16, 0.75], [0.3, 0.5]]) {
      ctx.moveTo(x + dx * h, y);
      ctx.quadraticCurveTo(x + (dx + lean * 0.3) * h, y - h * f * 0.6, x + (dx * 1.8 + lean) * h, y - h * f);
    }
  }
  ctx.stroke();
  ctx.strokeStyle = palette.light;
  ctx.beginPath();
  for (let k = 0; k < light.length; k += 5) {
    const [x, y, h, lean] = [light[k], light[k + 1], light[k + 2], light[k + 3]];
    ctx.moveTo(x + 0.05 * h, y - h * 0.1);
    ctx.quadraticCurveTo(x + (0.1 + lean * 0.3) * h, y - h * 0.5, x + (0.15 + lean * 0.9) * h, y - h * 0.85);
  }
  ctx.stroke();
  for (let k = 0; k < light.length; k += 5) {
    if (!light[k + 4]) continue;
    const [x, y, h, lean] = [light[k], light[k + 1], light[k + 2], light[k + 3]];
    const r = Math.max(1, h * 0.12);
    ctx.fillStyle = (k / 5) % 2 ? palette.flowers[0] : palette.flowers[1];
    ctx.beginPath();
    ctx.arc(x + (0.15 + lean * 0.9) * h, y - h * 0.9, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Parches de asfalto: bacheos más oscuros y más claros que ocupan un tramo de un carril, como
 * en un camino viejo. Un parche dura varios segmentos seguidos para que se lea como un rectángulo.
 */
export function paintPatches(ctx, e, halfWidth, colors) {
  const block = Math.floor(e.seg.index / 5);
  const u = unit(block, 89);
  if (u < 0.55) return;
  const a = -halfWidth * 0.85 + halfWidth * 1.2 * unit(block, 97);
  const b = a + halfWidth * (0.25 + 0.35 * unit(block, 101));
  ctx.fillStyle = colors[u > 0.8 ? 1 : 0];
  ctx.beginPath();
  ctx.moveTo(e.xN + a * e.sN, e.yN + 1);
  ctx.lineTo(e.xN + b * e.sN, e.yN + 1);
  ctx.lineTo(e.xF + b * e.sF, e.yF);
  ctx.lineTo(e.xF + a * e.sF, e.yF);
  ctx.closePath();
  ctx.fill();
}

/**
 * Desgaste fino del asfalto cerca de la cámara: grietas que serpentean a lo largo o cruzan el
 * carril, y manchas de aceite donde pisan las ruedas. Pocas por banda: tienen que leerse como
 * camino viejo, no como textura repetida.
 */
export function paintWear(ctx, e, halfWidth, colors) {
  const i = e.seg.index;
  const at = (lat, t) => [e.xN + (e.xF - e.xN) * t + lat * (e.sN + (e.sF - e.sN) * t), e.yN + (e.yF - e.yN) * t];
  // Grieta a lo largo: sigue unos segmentos seguidos con un leve zigzag.
  const run = Math.floor(i / 6);
  if (unit(run, 113) > 0.6) {
    // El desvío se fija en cada borde de segmento, así la grieta sigue sin quiebre de una banda
    // a la siguiente.
    const lat = (unit(run, 127) - 0.5) * halfWidth * 1.6;
    const edge = k => lat + (unit(k, 131) - 0.5) * 0.3;
    const [x0, y0] = at(edge(i), 0);
    const [x1, y1] = at((edge(i) + edge(i + 1)) / 2 + (unit(i, 133) - 0.5) * 0.18, 0.5);
    const [x2, y2] = at(edge(i + 1), 1);
    ctx.strokeStyle = colors.crack;
    ctx.lineWidth = Math.max(0.7, 0.018 * e.sN);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  // Grieta que cruza el carril, con una rama.
  if (unit(i, 137) > 0.9) {
    const a = (unit(i, 139) - 0.5) * halfWidth;
    const b = a + halfWidth * (0.3 + 0.4 * unit(i, 149));
    const [x0, y0] = at(a, 0.3);
    const [x1, y1] = at((a + b) / 2, 0.55);
    const [x2, y2] = at(b, 0.4);
    const [x3, y3] = at((a + b) / 2 + 0.4, 0.9);
    ctx.strokeStyle = colors.crack;
    ctx.lineWidth = Math.max(0.7, 0.016 * e.sN);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x3, y3);
    ctx.stroke();
  }
  // Mancha de aceite en la huella de una rueda.
  if (unit(i, 151) > 0.86) {
    const lat = (unit(i, 157) > 0.5 ? 1 : -1) * halfWidth * 0.38 + (unit(i, 163) - 0.5) * 0.6;
    const [x, y] = at(lat, 0.5);
    const w = (0.5 + 0.7 * unit(i, 167)) * (e.sN + e.sF) / 2;
    const h = Math.max(1, (e.yN - e.yF) * 0.45);
    ctx.fillStyle = colors.stain;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
