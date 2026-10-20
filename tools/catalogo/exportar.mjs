/**
 * Exporta el catálogo de dibujos hechos con código (tools/catalogo/catalogo.js): PNG transparentes
 * para utilería, fondos y minimapa, y JPEG de alta calidad para las vistas del juego.
 * Levanta un servidor propio, abre la página en Chromium sin ventana y guarda cada imagen.
 *
 * Uso: npm install && node tools/catalogo/exportar.mjs [carpeta de salida]
 *      (opcional: CHROMIUM_PATH=/ruta/al/chrome-headless-shell)
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = resolve(process.argv[2] ?? join(ROOT, 'dist/catalogo-dibujos'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = path || 'tools/catalogo/index.html';
    try {
      const body = await readFile(join(ROOT, file));
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
}

const server = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => console.error('Error en la página:', error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tools/catalogo/index.html`);
  await page.waitForFunction(() => document.documentElement.dataset.listo, null, { timeout: 180000 });
  const failed = await page.evaluate(() => window.catalogoError ?? null);
  if (failed) throw new Error(failed);
  const count = await page.evaluate(() => window.catalogo.imagenes.length);
  let bytes = 0;
  for (let i = 0; i < count; i++) {
    const { path, data } = await page.evaluate(n => window.catalogo.imagenes[n], i);
    const file = join(OUT, path);
    await mkdir(dirname(file), { recursive: true });
    const image = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    bytes += image.length;
    await writeFile(file, image);
  }
  const anchors = await page.evaluate(() => window.catalogo.anclas);
  await writeFile(join(OUT, '1-utileria/anclas.json'), `${JSON.stringify({ pixelesPorMetro: 40, utileria: anchors }, null, 2)}\n`);
  console.log(`${count} imágenes (${(bytes / 1024 / 1024).toFixed(1)} MB) en ${OUT}`);
} finally {
  await browser.close();
  server.close();
}
