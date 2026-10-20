# Traspaso: Autódromo v3

Documento vivo para retomar el trabajo entre sesiones sin perder nada.
Última actualización: 2026-10-19 (acabado anime 2D v1 integrado; paquete de dibujos hechos con código entregado).

## Estado

**La v3 está completa, probada y publicada.**
- Link para jugar (privado hasta que se comparta desde el menú Compartir de la página): https://claude.ai/artifact/Bvhc9PkuqKVWPr5tcDDbmh (versión 4: acabado anime, física suavizada y dibujo optimizado).
- Un solo archivo para cualquier navegador: `dist/autodromo.html` (8,5 MB, se regenera con `npm run build`).
- Pruebas: `npm test` → 237 en verde. `npm run e2e` → todas las verificaciones pasan (escritorio, iPhone 13, Galaxy S8, axe WCAG A/AA).
- Respaldo del juego original v2: `respaldo/autodromo-v2-original.zip` (sus 202 pruebas pasaban).
- Respaldo completo de este estado: `respaldo/autodromo-v3-2026-10-19.zip` (todo el proyecto sin `node_modules`, el entorno de Python ni `respaldo/`). Desde el 2026-10-19 el proyecto usa git (rama `main`, sin remoto todavía); `respaldo/` queda fuera del repositorio.
- Paquete de dibujos entregado al usuario: `dist/dibujos-autodromo.zip` (12 MB, 165 imágenes) con todo lo que se dibuja con código (utilería, fondos, ruta, estructuras, efectos, minimapa), el código y la guía `tools/catalogo/INTEGRACION.md`. Se rearma con `npm run dibujos`. Si el usuario devuelve un rediseño, seguir esa guía: mismos archivos, mismas firmas, colores del ecosistema, y comparar con `npm run catalogo`.
- Arte de autos: **acabado anime 2D v1** (paquete del usuario `autodromo-anime-v1.zip`, extraído en `respaldo/importar-anime-v1/`). El arte anterior de la v3 quedó en `respaldo/sprites-v3-antes-anime.zip`. No regenerar con un generador anterior.

## Pedido del usuario (y cómo quedó)

| Pedido | Resultado |
|---|---|
| Jugable desde cualquier navegador | Archivo único con doble clic, link publicado, GitHub Pages sube también `autodromo.html` |
| Circuitos completos y complejos | 4 trazados cerrados con geometría real, horquillas, chicanas, lomas y 7 saltos |
| Físicas realistas | Modelo de bicicleta con neumáticos, carga, caja, aerodinámica, vuelo y aterrizaje |
| Propulsores de aire para saltar | Salto, planeo (solo sostiene la caída) y empuje, con energía que se recarga |
| Gráficos 2D de primer nivel | Sprites por capas, partículas, marcas de frenada, propulsores, utilería por zona, luces de noche |
| Suspensiones y detalles | Carrocería que sube, cabecea y rola sobre las ruedas + telemetría en el tablero |
| Sonidos | Grabaciones CC0 (BigSoundBank, Kenney), motores granulares, Doppler, reverberación por zona |
| Inicio arcade con autos, pista, vueltas y dificultad | Título con demostración, 3 pasos, semáforo, resultados y revancha |

**Decisión del usuario**: se mantuvo la perspectiva pseudo-3D (no vista cenital).

## Mapa del código nuevo

| Área | Archivos |
|---|---|
| Pista | `src/domain/track.js`, `src/config/tracks.js` |
| Auto y física | `src/domain/vehicle.js`, `src/domain/car.js`, `src/config/vehicles.js` |
| IA, choques, carrera | `src/domain/ai.js`, `src/domain/collision.js`, `src/domain/race.js` |
| Sesión, ajustes, presentadores | `src/application/*`, `src/config/difficulty.js` |
| Dibujo | `src/infrastructure/rendering/*` (`canvas-renderer.js`, `car-painter.js`, `props.js`, `particles.js`, `skid-marks.js`, `minimap.js`, `backdrop.js`) |
| Sonido | `src/infrastructure/audio/*` (`audio-engine.js`, `recorded-audio.js`, `granular-engine.js`, `sample-bank.js`, `music.js`), `assets/audio/*` |
| Entrada | `src/infrastructure/input/keyboard.js`, `gamepad.js`, `touch.js` |
| Interfaz | `src/presentation/*` (título, garaje, pista, armado, resultados, tablero, táctil) |
| Sprites | `design/generador/generar_sprites.py` → `assets/sprites/*`, `assets/garage/*` |
| Catálogo de dibujos | `tools/catalogo/*` (`npm run dibujos` arma `dist/dibujos-autodromo.zip` con todo lo que no es sprite) |
| Herramientas | `tools/empaquetar.mjs`, `tools/verificar-pistas.mjs`, `tools/simular.mjs`, `tools/carrera.mjs`, `tools/servir.py`, `tools/captura.sh`, `tools/audio/*` |

## Comandos

```bash
npm test                        # 237 pruebas
npm run serve                   # http://localhost:8080 sin caché
npm run build                   # dist/autodromo.html y dist/artifact.html
CHROMIUM_PATH=$(ls -d ~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-*/chrome-headless-shell | tail -1) npm run e2e
npm run pistas                  # verifica trazados
npm run simular -- volta 2      # un auto, dos vueltas por pista
python3 tools/servir.py 8092 & tools/captura.sh x.png "escena=carrera&pista=costa-rosa&auto=volta&acelerar&segundos=5.4&saltar=5"
```

Para actualizar el link: `npm run build` y publicar `dist/artifact.html` con la herramienta Artifact usando la URL de arriba.

Escenas de depuración: `?depurar&escena=demo|carrera&pista=&auto=&hasta=&segundos=&acelerar&saltar=&planear&empujar`. Con `?depurar` además queda `window.autodromo` (sesión, audio, `frames(n)`).

## Suavizado de física y optimización (2026-10-19)

Hecho (246 pruebas en verde; medido con `node tools/telemetria.mjs` y `node tools/rendimiento.mjs`, mediciones en `respaldo/telemetria/`):
- Auto (`src/domain/car.js`): pedales con recorrido, volante con inercia, empuje y planeo con rampa y traba al vaciarse (antes el empuje parpadeaba cada cuadro), cambios sin corte seco, limitador progresivo, transferencia de carga filtrada, repartidor de frenada, neumáticos con sensibilidad a la carga y traseros más rígidos (frenar derecho ya no cruza el auto), golpe contra el muro que endereza en décimas, lomas con curvatura interpolada (`track.bendAt`).
- IA (`src/domain/ai.js`): línea de carrera interpolada, titubeo suave, empuje con histéresis, espacio lateral y seguir al de adelante. Choques con separación blanda (`collision.js`).
- Resultado IA: tirones longitudinales de ~100 a ~30 m/s³, titubeo de volante de ~200 a ~25 por minuto, choques contra el muro casi nulos, vueltas algo más rápidas.
- Ciclo: paso fijo con acumulador e interpolación para dibujar (`race-session.js`, `interpolateRace` en `race.js`), tiempo de cuadro estabilizado (`game-loop.js`), sacudida de cámara suave, audio siguiendo los niveles de empuje y planeo.
- Dibujo: defensas sin save/clip (polígonos recortados), franjas en un solo relleno, niebla precalculada, halos cacheados (`rendering/glow.js`), textos ilegibles reemplazados por una raya. Por cuadro: save 80-250 → 20-60, rellenos ~1.400-2.200 → ~500-900, degradados hasta 91 → 1, textos 15-37 → 3-14.

Hecho también: `npm run e2e` en verde, commit y link publicado (versión 4). Comparación con el catálogo de dibujos: la ruta, las estructuras, la utilería y los fondos quedan iguales (como máximo 0,3 % de píxeles distintos, ruido de compresión); los efectos varían lo mismo que entre dos corridas iguales (partículas al azar); el único cambio visible son los carteles lejanos, con una raya en vez de letra ilegible. Los picos de p99 del perfil sin GPU parecen del navegador sin pantalla; confirmar en un navegador real.

## Animé realista y sonido de neumáticos (2026-10-19)

- Chirrido de neumáticos sintetizado (`src/infrastructure/audio/tire-voice.js`): roce de banda ancha más chillido grave y estable (~840 Hz). Se quitó el bucle `neumaticos.wav` (silbido de 3,3 kHz que saltaba una octava: sonaba a gaviota). Muestra en `respaldo/neumaticos-sintetizados.wav`.
- Escenario animé realista: `backdrop.js` reescrito (cielo, nubes pintadas, sol, luna, mar, horizontes en capas recortadas, haces, bruma), `props.js` (sombras, reflejos mojados, árboles y palmeras en sprites pintados, columnas, faroles con cono de luz, carteles y tribunas con sombra), `canvas-renderer.js` (asfalto que refleja el cielo, camino del sol, reflejos de luces traseras, sombra en la base de las defensas, resplandor de pantalla y destello de lente), `quality.js` (calidad automática). Configuración en `atmosphere` de cada zona = `atmosfera` del ecosistema.
- Se corrigió una costura vieja: líneas claras horizontales en cada borde de banda (franjas translúcidas y solape de 0,75 px). Ahora las franjas son opacas premezcladas y se solapan 1 px.
- 250 pruebas y e2e en verde. Sin commit ni link publicado todavía.

## Aprendizajes que conviene no repetir

- El scratchpad de la sesión se borra al cerrar la app: los respaldos y herramientas viven en el proyecto (`respaldo/` está en .gitignore).
- El panel del navegador oculto no corre `requestAnimationFrame`: para probar se avanzan cuadros con `window.autodromo.frames(n)` o se capturan escenas con `tools/captura.sh`.
- Chrome normal sin ventana devuelve capturas negras en este entorno; `chrome-headless-shell` de Playwright funciona.
- `tools/rendimiento.mjs` fuerza el rasterizado con `getImageData` en cada cuadro: sin eso, el costo de dibujar queda fuera de la medición (o cae donde un efecto obliga a rasterizar, como el resplandor).
- Dos bordes suavizados que se tocan dejan ver el fondo aunque juntos cubran el píxel: las bandas opacas se solapan un píxel entero.
- `backdrop.js` exporta sus capas (`paintSky`, `paintStars`, `paintClouds`, `paintSunGlare`, `paintSkyline`, `withUnit`) para el catálogo; el empaquetador solo acepta `export function|const|class` y `export { … } from`, no `export { a as b }`.
- La cota de fuerza lateral del neumático delantero tiene que usar la velocidad lateral en el sentido de la rueda girada (sin eso, sin ayudas el auto no dobla).
- Elementos translúcidos de la calzada no deben solaparse entre bandas (dejan líneas oscuras).

## Ideas pendientes (no pedidas todavía)

- Afinar a gusto del usuario volúmenes y mezcla, y la sensación del planeo.
- Más pistas o modo contrarreloj con fantasma.
- El Volta de los rivales todavía roza algunas defensas en Costa Rosa (6 roces por vuelta en simulación).
