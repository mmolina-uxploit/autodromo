# Cómo devolver un rediseño de los dibujos

Este paquete sirve para rediseñar todo lo que Autódromo dibuja con código (ruta, defensas, utilería, fondos, efectos y minimapa) sin tocar la lógica del juego. Igual que con los sprites de los autos, lo ideal es devolver **los mismos archivos en las mismas rutas**, con otro acabado.

## Qué se puede cambiar

- Formas, trazos, degradés, halos, texturas y detalles de cada elemento.
- Los colores, siempre dentro de la paleta de `design/ecosistema.json` o de los colores de su zona en `src/config/zones.js`.
- Los tamaños visuales (alto de una palmera, ancho de un cartel), mientras el objeto siga apoyado en su punto del piso.

## Qué no hay que cambiar

1. **Las funciones exportadas y sus parámetros.** El resto del juego las llama así:
   - `props.js`: `paintProp(ctx, kind, x, y, ppm, { side, zone, night, seed, turn, clock })`, `propsAt(segment, zone, track, boards)`, `distanceBoards(track)`.
   - `backdrop.js`: `paintBackdrop(ctx, zone, viewport, offset, clock, quality)` y las capas `paintSky`, `paintStars`, `paintClouds(ctx, zone, viewport, offset, clock)`, `paintSunGlare`, `paintSkyline`, más `sunPosition`, `withUnit`, `rgba` y `mix`.
   - `canvas-renderer.js`: `createCanvasRenderer(canvas, { rules, cameraConfig, colorOf })` con `resize`, `setAtlas`, `setZone`, `setTrack`, `setReducedMotion`, `setQuality` y `render(race, { dt, events, focusId, minimap })`.
   - `particles.js` (`createParticles`, `ParticleKind`), `skid-marks.js` (`createSkidMarks`), `minimap.js` (`createMinimap`), `car-painter.js` (`paintCar`, `paintShadow`, `paintFallbackCar`).
2. **Las unidades.** Todo está en metros. `(x, y)` es el punto del piso en pantalla y `ppm` los píxeles por metro a esa distancia: un objeto de 8 m mide `8 * ppm` píxeles. `side` es -1 a la izquierda y 1 a la derecha; `night` es verdadero en Bajo Autopista y Anillo Neón.
3. **Las reglas del juego.** Dónde va cada objeto (`propsAt`, `distanceBoards`), el ancho de la ruta, la altura de las defensas, la profundidad de los fosos y la física no son parte del dibujo.
4. **Los colores de zona que fija el ecosistema.** Cielo, niebla y pista de `zones.js` tienen que coincidir con `design/ecosistema.json`; las pruebas fallan si no.
5. **La arquitectura.** Estos archivos solo importan de `src/domain`, `src/config` y `src/infrastructure`. Sin librerías externas.
6. **Lo determinista.** La utilería depende solo del índice del segmento (`hashNoise`), nunca de `Math.random`, para que la pista se vea igual en cada vuelta.
7. **El modo de movimiento reducido.** Con `setReducedMotion(true)` no hay sacudidas, inclinación ni líneas de velocidad.

## Rendimiento

Se dibuja cada cuadro: 240 bandas de ruta, hasta 8 autos y 720 partículas, también en celulares. Conviene:

- Guardar en caché los degradés y las formas que no cambian (como ya hacen el cielo y los discos de humo).
- Evitar `shadowBlur`, `filter` y `getImageData` en el ciclo.
- No dibujar lo que la distancia vuelve más chico que medio píxel (`paintProp` ya corta debajo de 0,4 px por metro).

## Si un dibujo pasa a ser imagen

Se puede reemplazar un objeto de la utilería por un PNG. `1-utileria/anclas.json` da, para cada imagen de referencia, su tamaño y su punto de apoyo a 40 px por metro: una imagen nueva tiene que respetar esa escala y ese punto. Las imágenes nuevas van en `assets/escenario/` y se cargan con `assetUrl` (de `src/config/assets.js`). Hay que avisar para sumar esa carpeta a `tools/empaquetar.mjs`, que arma la versión de un solo archivo.

## Cómo se verifica

Desde la raíz del proyecto:

```bash
npm test
npm run catalogo
npm run e2e
npm run build
```

`npm run catalogo` vuelve a generar estas mismas imágenes con el código nuevo en `dist/catalogo-dibujos/`, para comparar antes y después.
