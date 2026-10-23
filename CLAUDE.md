# Autódromo

## Regla de trabajo

Antes de ejecutar cualquier pedido, recomendar qué modelo de Claude conviene y
con cuánto esfuerzo, en una línea al principio de la respuesta. Después seguir
con el trabajo; la recomendación no bloquea.

Criterio: Opus solo donde el cuello de botella es el criterio (juicio visual,
diagnóstico de causa, física). Sonnet para cambios acotados con el objetivo ya
definido. Haiku para lo mecánico. El cupo semanal importa.

## Mapa del proyecto

Corredor seudo-3D en canvas 2D, módulos ES nativos, sin build. 240 bandas de
ruta por cuadro, física a 120 Hz.

- `src/domain` puro, `src/application`, `src/infrastructure`, `src/presentation`.
- `design/ecosistema.json` es la fuente única de paleta, zonas, libreas y
  contrato de sprites. `tests/design-coherence.test.js` falla si algo se desvía.
- `design/generador/generar_sprites.py` genera los autos: malla por secciones,
  rasterizador propio, celdas de tres tonos con rampa continua, tinta por
  detección de bordes. Las hojas PNG nunca se retocan a mano.
- `design/generador/atlas-compatible.json` congela cuadro, anclajes y recortes.
  Si una geometría nueva no entra, el generador aborta. Para rebasar el
  contrato a propósito: borrarlo, regenerar, copiar `assets/sprites/atlas.json`
  encima.
- `design/hojas-modelo/*.png` son seis vistas ortográficas por auto. Es la
  herramienta correcta para juzgar una carrocería, no la captura en pista.
- `dist/autodromo.html` lleva los sprites embebidos: después de regenerar arte
  hay que correr `npm run build` o queda desactualizado.

## Comandos

`npm test` (258 pruebas), `npm run serve` (8080), `npm run sprites`,
`npm run build`, `npm run carrera`, `npm run simular`.

Chromium en `/opt/pw-browsers/chromium`, lanzar con `--no-sandbox`. El
contenedor no decodifica el audio del juego, así que solo se puede ejercitar
el camino sintético.

## Idioma

Todo el texto del juego en español argentino con voseo. Sin marcas reales.
