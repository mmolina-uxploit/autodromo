import { assetUrl, embeddedJson } from '../../config/assets.js';

/**
 * Atlas de sprites por capas (design/generador): cada recorte trae su lugar en la hoja (x, y, w, h)
 * y su desplazamiento dentro del cuadro lógico (ox, oy). Las capas son carrocería, freno,
 * ruedas y frente; los puntos marcan contacto de ruedas, pivote, toberas y escapes por cuadro.
 */
export function parseAtlas(json) {
  const sheets = Object.fromEntries(Object.entries(json.hojas).map(([model, sheet]) =>
    [model, Object.freeze({ file: sheet.archivo, frames: sheet.cuadros, points: sheet.puntos ?? {}, image: null })]));
  return Object.freeze({
    frameWidth: json.cuadro.ancho,
    frameHeight: json.cuadro.alto,
    anchorX: json.cuadro.ancla[0],
    anchorY: json.cuadro.ancla[1],
    pixelsPerMeter: json.px_por_metro_en_ancla,
    steerAngles: json.giros_grados,
    layers: json.capas ?? ['carroceria', 'freno', 'ruedas', 'frente'],
    sheets: Object.freeze(sheets)
  });
}

/** Índice del giro más cercano a un ángulo aparente en grados, acotado a los extremos. */
export function steerFrameIndex(degrees, angles) {
  let best = 0;
  for (let i = 1; i < angles.length; i++) {
    if (Math.abs(angles[i] - degrees) < Math.abs(angles[best] - degrees)) best = i;
  }
  return best;
}

export const frameKey = ({ model, livery, incline, layer, steerIndex }) =>
  `${model}_${livery}_${incline}_${layer}_g${steerIndex}`;

/** Busca una capa; si no existe en esa inclinación cae en terreno plano. */
export function findFrame(atlas, spec) {
  const sheet = atlas.sheets[spec.model];
  if (!sheet) return null;
  for (const candidate of [spec, { ...spec, incline: 'plano' }]) {
    const rect = sheet.frames[frameKey(candidate)];
    if (rect) return { image: sheet.image, rect };
  }
  return null;
}

/** Puntos de anclaje del cuadro (en píxeles del cuadro lógico). */
export function framePoints(atlas, model, incline, steerIndex) {
  const points = atlas.sheets[model]?.points ?? {};
  return points[`${incline}_g${steerIndex}`] ?? points[`plano_g${steerIndex}`] ?? null;
}

const defaultFetchJson = async url => {
  const inline = embeddedJson(url);
  if (inline) return inline;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo leer ${url}: ${response.status}`);
  return response.json();
};

const defaultLoadImage = url => new Promise((resolve, reject) => {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
  image.src = assetUrl(url);
});

export async function loadSpriteAtlas(baseUrl, { fetchJson = defaultFetchJson, loadImage = defaultLoadImage } = {}) {
  const atlas = parseAtlas(await fetchJson(`${baseUrl}/atlas.json`));
  const loaded = await Promise.all(Object.entries(atlas.sheets).map(async ([model, sheet]) =>
    [model, Object.freeze({ ...sheet, image: await loadImage(`${baseUrl}/${sheet.file}`) })]));
  return Object.freeze({ ...atlas, sheets: Object.freeze(Object.fromEntries(loaded)) });
}
