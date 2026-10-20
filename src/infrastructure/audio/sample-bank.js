import { assetUrl, embeddedJson } from '../../config/assets.js';

/** Bytes de un data URI en base64, sin fetch (en la versión de un archivo no hay red). */
function dataUriBytes(uri) {
  const binary = atob(uri.slice(uri.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Banco de grabaciones (assets/audio, generado por tools/audio/preparar_sonidos.py).
 * Los archivos se descargan apenas carga la página y se decodifican cuando existe el
 * contexto de audio, que el navegador solo permite crear después de un gesto.
 */
export function createSampleBank(baseUrl, { fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  let manifest = null;
  const raw = new Map();
  const buffers = new Map();
  let decoding = null;

  const fetchBytes = async name => {
    const url = assetUrl(`${baseUrl}/${name}`);
    if (url.startsWith('data:')) return dataUriBytes(url);
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`No se pudo leer ${name}: ${response.status}`);
    return response.arrayBuffer();
  };

  function names(m) {
    const list = [];
    for (const engine of Object.values(m.motores)) list.push(...[engine.barrido, engine.ralenti, engine.textura].filter(Boolean));
    list.push(...Object.values(m.bucles), ...Object.values(m.unicos));
    for (const group of Object.values(m.golpes)) list.push(...group);
    return list;
  }

  const ready = (async () => {
    const path = `${baseUrl}/banco.json`;
    manifest = embeddedJson(path) ?? await (await fetchImpl(assetUrl(path))).json();
    await Promise.all(names(manifest).map(async name => raw.set(name, await fetchBytes(name))));
    return manifest;
  })();

  return {
    ready,
    get manifest() { return manifest; },
    /** Decodifica todo con el contexto ya creado. Se puede llamar varias veces. */
    decode(ctx) {
      if (!decoding) {
        decoding = ready.then(() => Promise.all([...raw.entries()].map(async ([name, bytes]) => {
          const audio = await ctx.decodeAudioData(bytes.slice(0));
          buffers.set(name, audio);
        })));
      }
      return decoding;
    },
    buffer: name => buffers.get(name) ?? null
  };
}
