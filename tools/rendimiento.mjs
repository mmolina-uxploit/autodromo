/**
 * Rendimiento en el navegador: corre una carrera de 8 autos sin ventana y mide cuánto tarda
 * cada cuadro completo (física, dibujo, sonido e interfaz), con un perfil de CPU que dice
 * qué funciones se llevan el tiempo.
 *
 * Uso: npm install && node tools/rendimiento.mjs [pista] [cuadros] [calidad: alta|media|baja]
 *      (opcional: CHROMIUM_PATH=/ruta/al/chrome-headless-shell)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.m4a': 'audio/mp4', '.wav': 'audio/wav' };
const [trackId = 'anillo-neon', frameArg = '900', qualityArg = 'alta'] = process.argv.slice(2);
// El juego ignora una calidad que no reconoce y se queda en alta. Para una herramienta de
// medición eso es peor que fallar: devuelve números de otro nivel sin decirlo.
const CALIDADES = ['alta', 'media', 'baja'];
if (!CALIDADES.includes(qualityArg)) {
  console.error(`Calidad desconocida: «${qualityArg}». Usá una de: ${CALIDADES.join(', ')}.`);
  process.exit(1);
}
const FRAMES = Number(frameArg);

const server = await new Promise(done => {
  const s = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '') || 'index.html';
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  s.listen(0, '127.0.0.1', () => done(s));
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => console.error('Error en la página:', error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?depurar&semilla=3&calidad=${qualityArg}`);
  await page.waitForFunction(() => window.autodromo);
  await page.evaluate(async trackId => {
    const { settingsStore, session, frames } = window.autodromo;
    settingsStore.update({ track: trackId, rivals: 7, vehicle: 'volta' });
    session.syncSelection();
    session.start();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    await new Promise(r => setTimeout(r, 300));
    frames(240);
  }, trackId);
  await page.evaluate(() => window.autodromo.actions.press('throttle', 'rendimiento'));
  await page.evaluate(() => window.autodromo.frames(120));

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  const times = await page.evaluate(count => {
    const out = [];
    // Leer un píxel obliga a rasterizar el cuadro: así se mide el costo completo de dibujar,
    // no solo el de encargar los trazos.
    const canvas = document.querySelector('canvas');
    const g = canvas.getContext('2d');
    for (let i = 0; i < count; i++) {
      const t0 = performance.now();
      window.autodromo.frames(1);
      g.getImageData(0, 0, 1, 1);
      out.push(performance.now() - t0);
    }
    return out;
  }, FRAMES);
  const { profile } = await cdp.send('Profiler.stop');

  const sorted = [...times].sort((a, b) => a - b);
  const at = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`${trackId}, 8 autos, ${FRAMES} cuadros a 1280 x 720, calidad ${qualityArg}`);
  console.log(`ms por cuadro: media ${mean.toFixed(2)} · mediana ${at(0.5).toFixed(2)} · p95 ${at(0.95).toFixed(2)} · p99 ${at(0.99).toFixed(2)} · máx ${sorted.at(-1).toFixed(2)}`);

  // Tiempo propio por función (muestras del perfil).
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const self = new Map();
  const deltas = profile.timeDeltas;
  profile.samples.forEach((id, i) => {
    const node = byId.get(id);
    const f = node.callFrame;
    const key = `${f.functionName || '(anónima)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (deltas[i] ?? 0));
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log('\nFunciones con más tiempo propio:');
  for (const [key, us] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) {
    console.log(`${((us / total) * 100).toFixed(1).padStart(5)} %  ${key}`);
  }
} finally {
  await browser.close();
  server.close();
}
