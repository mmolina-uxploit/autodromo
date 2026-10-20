/**
 * Prueba de humo de punta a punta con navegador real (Playwright + axe-core).
 * Uso: npm install && npm run e2e   (opcional: CHROMIUM_PATH=/ruta/al/chrome)
 * Deja capturas en tests/e2e/capturas/.
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium, devices } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = join(ROOT, 'tests/e2e/capturas');
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const failures = [];
const check = (ok, message) => { console.log(`${ok ? '✓' : '✗'} ${message}`); if (!ok) failures.push(message); };

function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = path || 'index.html';
    try {
      const body = await readFile(join(ROOT, file));
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

async function axeScan(page, label) {
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] });
    return r.violations.map(v => `${v.id} (${v.nodes.length}): ${v.help}`);
  });
  check(result.length === 0, `axe ${label}: ${result.length ? result.join(' | ') : 'sin violaciones WCAG A/AA'}`);
}

const speedOf = page => page.locator('.o-hud__speed .a-readout--xl').innerText().then(Number);
const focused = page => page.evaluate(() => ({
  text: document.activeElement?.textContent.trim() ?? '',
  value: document.activeElement?.value ?? null,
  name: document.activeElement?.name ?? null
}));

/** Velocidad máxima observada mientras se sostiene un control: un roce con un rival no la invalida. */
async function peakSpeed(page, ms) {
  let peak = 0;
  for (let t = 0; t < ms; t += 100) {
    peak = Math.max(peak, await speedOf(page));
    await page.waitForTimeout(100);
  }
  return peak;
}

async function desktop(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    const external = /fonts\.(googleapis|gstatic)\.com/.test(m.location().url ?? '');
    if (m.type() === 'error' && !external) errors.push(`${m.text()} ${m.location().url ?? ''}`);
  });
  await page.goto(url);

  const title = page.getByRole('dialog', { name: 'Autódromo' });
  await title.waitFor();
  check((await focused(page)).text === 'Empezar', 'el foco inicial está en Empezar');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, 'escritorio-titulo.png') });
  await axeScan(page, 'pantalla de título');

  // Paso 1: garaje con teclado
  await page.keyboard.press('Enter');
  const cars = page.getByRole('dialog', { name: 'Elegí auto' });
  check(await cars.isVisible(), 'Empezar abre el garaje (paso 1)');
  check((await focused(page)).value === 'cuna', 'el foco va al auto elegido');
  await page.keyboard.press('ArrowDown');
  check((await focused(page)).value === 'saeta', 'las flechas recorren los autos');
  check(await page.getByRole('group', { name: 'Color de Saeta' }).isVisible(), 'los colores cambian al auto elegido');
  check(await page.getByRole('meter', { name: 'Propulsores' }).first().getAttribute('aria-valuetext') !== null, 'las estadísticas se exponen como medidores');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, 'escritorio-garaje.png') });
  await axeScan(page, 'garaje');

  // Paso 2: pista
  await page.getByRole('button', { name: 'Siguiente: pista' }).click();
  const circuits = page.getByRole('dialog', { name: 'Elegí pista' });
  check(await circuits.isVisible(), 'Siguiente abre la elección de pista (paso 2)');
  check((await focused(page)).value === 'bajo-autopista', 'el foco va a la pista elegida');
  await page.keyboard.press('ArrowDown');
  check((await focused(page)).value === 'costa-rosa', 'las flechas recorren las pistas');
  check(await circuits.getByText('Sin vueltas con Saeta').first().isVisible(), 'cada pista informa la mejor vuelta con el auto elegido');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, 'escritorio-pistas.png') });
  await axeScan(page, 'elección de pista');

  // Paso 3: vueltas, dificultad y rivales
  await page.getByRole('button', { name: 'Siguiente: carrera' }).click();
  const setup = page.getByRole('dialog', { name: 'Armá la carrera' });
  check(await setup.isVisible(), 'Siguiente abre el armado de la carrera (paso 3)');
  await page.getByRole('radio', { name: '1', exact: true }).check();
  await page.getByRole('radio', { name: 'Difícil' }).check();
  check(/Costa Rosa con Saeta: 1 vuelta, difícil/.test(await setup.locator('.o-setup__summary').innerText()), 'el resumen refleja lo elegido');
  await page.screenshot({ path: join(SHOTS, 'escritorio-armado.png') });
  await axeScan(page, 'armado de carrera');

  await page.getByRole('button', { name: '¡Largar!' }).click();
  check(!(await setup.isVisible()), 'Largar cierra los menús');
  await page.waitForTimeout(3400);
  await page.keyboard.down('ArrowUp');
  check((await peakSpeed(page, 2600)) > 60, 'mantener ↑ acelera el auto');
  await page.keyboard.press('Space');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, 'escritorio-carrera.png') });
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');

  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: 'Pausa' });
  check(await pause.isVisible(), 'Escape abre la pausa');
  check((await focused(page)).text === 'Seguir', 'el foco va a Seguir');
  const frozen = await speedOf(page);
  await page.waitForTimeout(400);
  check((await speedOf(page)) === frozen, 'en pausa la velocidad queda congelada');
  await axeScan(page, 'menú de pausa');

  await page.getByRole('button', { name: 'Ajustes' }).click();
  const music = page.getByRole('switch', { name: 'Música' });
  await music.press('Space');
  check(await music.getAttribute('aria-checked') === 'false', 'Espacio apaga la música');
  await axeScan(page, 'ajustes');
  await music.press('Space');
  await page.keyboard.press('Escape');
  check(await pause.isVisible(), 'Escape en Ajustes vuelve a la pausa');
  await page.keyboard.press('Escape');
  check(!(await pause.isVisible()), 'Escape en la pausa reanuda la carrera');

  check(errors.length === 0, `sin errores de consola${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}

const overflowing = page => page.evaluate(() =>
  [...document.querySelectorAll('.o-hud *, .o-touch *, dialog[open] *')]
    .filter(e => e.getClientRects().length)
    .filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; })
    .map(e => e.className || e.tagName));

async function mobile(browser, url, device = 'iPhone 13') {
  const context = await browser.newContext({ ...devices[device] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('dialog', { name: 'Autódromo' }).waitFor();
  await page.waitForTimeout(800);
  const slug = name => `movil-${name}-${device}.png`.replaceAll(' ', '-');
  await page.screenshot({ path: join(SHOTS, slug('titulo')) });
  const titleOverflow = await overflowing(page);
  check(titleOverflow.length === 0, `${device}: el título entra en pantalla${titleOverflow.length ? ' (se salen: ' + titleOverflow.join(', ') + ')' : ''}`);

  await page.getByRole('button', { name: 'Empezar' }).tap();
  for (const [dialog, pick, next] of [['Elegí auto', 'Bloque', 'Siguiente: pista'], ['Elegí pista', 'Anillo Neón', 'Siguiente: carrera']]) {
    await page.getByRole('dialog', { name: dialog }).waitFor();
    await page.getByRole('radio', { name: pick }).tap();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS, slug(dialog.split(' ')[1])) });
    const overflow = await overflowing(page);
    check(overflow.length === 0, `${device}: «${dialog}» entra en pantalla${overflow.length ? ' (se salen: ' + overflow.join(', ') + ')' : ''}`);
    check(await page.getByRole('radio', { name: pick }).isChecked(), `${device}: tocar una tarjeta la elige (${pick})`);
    await page.getByRole('button', { name: next }).tap();
  }
  await page.getByRole('dialog', { name: 'Armá la carrera' }).waitFor();
  const sizes = await page.$$eval('.a-button, .a-chip', els => els.filter(e => e.offsetParent).map(e => Math.min(e.offsetWidth, e.offsetHeight)));
  check(Math.min(...sizes) >= 44, `objetivos táctiles de al menos 44 px (mínimo ${Math.min(...sizes)})`);
  await page.getByRole('button', { name: '¡Largar!' }).tap();
  await page.waitForTimeout(3400);

  for (const name of ['Acelerar', 'Freno', 'Salto', 'Empuje', 'Izquierda', 'Derecha']) {
    check(await page.getByRole('button', { name }).isVisible(), `${device}: en táctil se ve el botón ${name}`);
  }
  const gas = page.getByRole('button', { name: 'Acelerar' });
  const left = page.getByRole('button', { name: 'Izquierda' });
  await gas.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true });
  const touchPeak = await peakSpeed(page, 2600);
  check(touchPeak > 40, `mantener Acelerar acelera (${touchPeak} km/h)`);
  await left.dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch' });
  await page.waitForTimeout(200);
  check(await left.evaluate(e => e.classList.contains('is-pressed')) && await gas.evaluate(e => e.classList.contains('is-pressed')),
    'dos dedos a la vez: acelerador y dirección quedan presionados');
  const raceOverflow = await overflowing(page);
  check(raceOverflow.length === 0, `${device}: tablero y controles entran en pantalla${raceOverflow.length ? ' (se salen: ' + raceOverflow.join(', ') + ')' : ''}`);
  check(await gas.evaluate(e => e.classList.contains('is-pressed')), 'el pedal muestra que está presionado');
  await page.screenshot({ path: join(SHOTS, slug('carrera')) });
  await gas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch' });
  await left.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch' });
  check(!(await gas.evaluate(e => e.classList.contains('is-pressed'))), 'soltar libera el pedal');

  await page.getByRole('button', { name: 'Pausa' }).tap();
  await page.getByRole('button', { name: 'Ajustes' }).tap();
  await page.getByRole('switch', { name: 'Invertir controles táctiles' }).tap();
  await page.getByRole('button', { name: 'Listo' }).tap();
  await page.getByRole('button', { name: 'Seguir' }).tap();
  check(await page.locator('.o-touch').evaluate(e => e.classList.contains('o-touch--swapped')), 'invertir controles cambia los lados');

  check(errors.length === 0, `móvil sin errores${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await context.close();
}

await mkdir(SHOTS, { recursive: true });
const server = await serve();
const url = `http://localhost:${server.address().port}/?semilla=7`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  await desktop(browser, url);
  await mobile(browser, url, 'iPhone 13');
  await mobile(browser, url, 'Galaxy S8');
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `\n${failures.length} verificaciones fallaron` : '\nTodas las verificaciones pasaron');
process.exit(failures.length ? 1 : 0);
