# Brief de sprites de Autódromo

## Punto de partida

Los sprites que usa el juego ya existen y funcionan: los genera `design/generador/generar_sprites.py` a partir de un modelo 3D facetado de cada auto. Este brief sirve para reemplazarlos por arte con más detalle, dibujado a mano o con IA generativa, sin cambiar el código del juego.

El juego no distingue quién hizo un cuadro. Si cada archivo respeta tamaño, ancla, escala, ángulo y nombre, entra solo. Cada sprite actual en `assets/sprites` sirve como referencia exacta de pose y encuadre.

## Inventario

Hacen falta 224 cuadros de auto y 8 retratos. Cada librea lleva 28 cuadros: 7 giros por 2 inclinaciones por 2 estados de luz.

| Auto | Libreas | Cuadros | Retratos |
| --- | --- | --- | --- |
| Cuña | 2 | 56 | 2 |
| Saeta | 3 | 84 | 3 |
| Bloque | 3 | 84 | 3 |
| Total | 8 | 224 | 8 |

El trabajo real son 84 cuadros: una librea por auto. Las demás salen recoloreando carrocería, acento, vidrio y llanta; la línea, la luz y las sombras quedan idénticas. Fondos, pistas y objetos del costado se dibujan por código y no hacen falta.

Los 232 nombres, con casillas para marcar el avance, están en [lista-archivos-sprites.md](lista-archivos-sprites.md).

## Especificación técnica

Cada cuadro mide 448 × 308 px, es un PNG con transparencia, y el punto del piso bajo el centro del auto cae exactamente en (224, 204). Si el ancla se corre, el auto flota o se hunde en la pista.

| Parámetro | Valor |
| --- | --- |
| Tamaño | 448 × 308 px, PNG RGBA, fondo transparente |
| Ancla | x 224, y 204, igual en todos los cuadros |
| Escala | 100 px por metro a la distancia del ancla |
| Ancho del auto a 0° | Cuña ≈ 222 px, Saeta ≈ 206 px, Bloque ≈ 190 px |
| Cámara | detrás del auto, a 14 m, apuntando a 0,55 m del piso |
| Giros | −21°, −14°, −7°, 0°, +7°, +14°, +21° (índices g0 a g6) |
| Sentido del giro | positivo = trompa a la derecha; se ve el lateral derecho |
| Inclinación plano | cámara a 14° sobre el horizonte |
| Inclinación subida | cámara a 5° sobre el horizonte |
| Estado luz | traseras encendidas tenues, sin halo fuerte |
| Estado freno | traseras a pleno, con halo ámbar |
| Sombra de contacto | #2a2d55 al 45 %, difusa, pegada al piso |
| Margen | nada a menos de 14 px del borde, salvo halo y sombra |

Nombre de cada archivo: `{modelo}_{librea}_{inclinacion}_{luz|freno}_g{indice}.png`. Ejemplo: `saeta_grafito_subida_freno_g5.png` es Saeta grafito, en subida, frenando, girada +14°.

## Estilo visual

El auto se ve como una ilustración de cómic limpia: tinta azul noche, tres tonos planos por material y sombras frías, nunca negras.

- **Línea.** Tinta #1c1f3a. Silueta de unos 2,5 px, contorno donde una pieza tapa a otra de unos 2 px, pliegues entre planos de 1 px. Sin trazo suelto.
- **Sombreado.** Tres bandas planas por material, sin degradados. Luz = color base mezclado 38 % con #fff4dc. Sombra = color base multiplicado por #8c9ee0 y mezclado 12 % con #353a6e.
- **Luz clave.** Desde arriba a la izquierda, del lado de la cámara: techo y cubierta en luz, trasera en tono medio, lateral derecho en sombra.
- **Filo de rebote.** Borde magenta #ff6fc4 de 1 px, dentro de la silueta, del lado en sombra.
- **Forma.** Cuñas facetadas y chaflanes. Las curvas quedan para ruedas y guardabarros.
- **Metales.** Llantas en el color de la librea (oro, gris o hueso). Cromo solo en escapes.
- **Negro.** Prohibido el negro puro: lo más oscuro es la tinta.

Colores fijos, iguales en todas las libreas:

| Material | Color |
| --- | --- |
| Bajos, rejillas, marcos | #3e4560 |
| Neumático | #2a2c3a |
| Escapes | #c9cfdc |
| Mecánica expuesta | #5d6276 |
| Patente | #ebe5d8 |
| Trasera con luz | #c2441f, núcleo #ff9a4a |
| Trasera con freno | #ff7a24, núcleo #ffe39a, halo #ff6a2a |
| LED delantero | #7ff3ff |

## Los tres autos

Las siluetas tienen que distinguirse a 60 px de ancho, que es como se ven a lo lejos: Cuña es baja y con alerón, Saeta cae en una sola pendiente y Bloque es una caja alta.

| Auto | Largo × ancho × alto | Silueta | Rasgos obligatorios |
| --- | --- | --- | --- |
| Cuña | 4,30 × 2,20 × 1,15 m | Cuña baja de motor central con cubierta trasera plana | Alerón con placas laterales en color de acento; guardabarros atornillados; 4 luces traseras redondas, 2 por lado; mecánica expuesta entre las luces; 4 escapes; barra LED cian delantera |
| Saeta | 4,45 × 2,05 × 1,08 m | Fastback: el techo cae hasta una cola corta con labio | 6 persianas sobre la luneta; barra trasera ámbar continua con 6 núcleos; vidrios de color; 2 escapes; difusor |
| Bloque | 4,35 × 1,95 × 1,72 m | Furgón de cabina adelantada, laterales inclinados arriba, parabrisas a 45° | Luces traseras verticales; puerta trasera partida con ventana; banda lateral inferior en color de acento; parrilla de techo; paragolpes oscuro |

Vistas completas de cada modelo (lateral, frente, trasera, planta y tres cuartos) en `design/hojas-modelo/cuna.png`, `saeta.png` y `bloque.png`.

## Libreas

Cada librea cambia cuatro colores; todo lo demás queda fijo. El identificador va sin tildes en el nombre de archivo.

| Auto | Librea | Carrocería | Acento | Vidrio | Llanta |
| --- | --- | --- | --- | --- | --- |
| Cuña | lima | #b6e03a | #e8459a | #2c3560 | #c99a3a |
| Cuña | coral | #ff5a36 | #5fe3f0 | #2c3560 | #c99a3a |
| Saeta | hormigon | #7f93b0 | #ff7a24 | #e0458f | #c99a3a |
| Saeta | grafito | #5f6b78 | #5fe3f0 | #e0458f | #c99a3a |
| Saeta | magenta | #d8509a | #efebe4 | #2c3560 | #e4dfd2 |
| Bloque | crema | #e9e2d3 | #3fb3b0 | #4d6aa0 | #9aa2b8 |
| Bloque | turquesa | #3fb3b0 | #efebe4 | #2c3560 | #e4dfd2 |
| Bloque | mostaza | #e0b54a | #4f5d7a | #2c3560 | #3e4560 |

Estos valores salen de `design/ecosistema.json`. Si cambiás uno ahí, actualizalo también en `src/config/vehicles.js`; la prueba de coherencia falla si no coinciden.

## Retratos del garaje

Son ocho retratos de 560 × 300 px, uno por librea, en vista de tres cuartos delantera. Aparecen en las tarjetas del garaje y en la ficha de auto del inicio.

- PNG con transparencia, mismo estilo que los cuadros de carrera.
- Auto girado 140° respecto de la vista trasera: trompa hacia la derecha, se ven el frente y un lateral.
- Cámara a 16° sobre el horizonte, 105 px por metro, con sombra de contacto.
- El auto ocupa el centro y deja aire a los lados: la tarjeta lo muestra a unos 240 px de ancho.
- Nombre `{modelo}-{librea}.png`, en `assets/garage/`. Los retratos actuales de esa carpeta son la referencia de encuadre.

## Flujo con IA generativa

La coherencia entre 28 ángulos no sale de un prompt. Sale de usar los cuadros actuales como guía de pose y cambiar solo la superficie.

1. **Guía de pose.** Usá cada cuadro actual como imagen de control (líneas o profundidad), o como imagen inicial con fuerza entre 0,35 y 0,5. Ángulo, escala y ancla quedan resueltos de entrada.
2. **Una librea por auto.** Generá los 28 cuadros de una librea con la misma semilla y el mismo prompt; entre cuadro y cuadro cambiá solo la imagen guía.
3. **Recoloreo.** Sacá las otras libreas cambiando carrocería, acento, vidrio y llanta con los valores de la tabla. No las regeneres.
4. **Freno.** Duplicá cada cuadro de luz y pintá las traseras con los colores de freno y su halo.
5. **Control.** Superponé cada cuadro sobre el actual al 50 % de opacidad: la silueta y el punto de apoyo tienen que coincidir.

Plantilla de prompt, en inglés porque los generadores de imagen responden mejor así. Reemplazá lo que está entre corchetes:

```
Rear view game sprite of a [MODEL], clean comic-book illustration, crisp dark navy ink outlines, flat cel shading with exactly three tones per material, cool blue-violet shadows, warm cream highlights, key light from upper left, thin magenta rim light on the shadow side, faceted 1980s shapes, deep-dish [WHEEL COLOR] rims, [BODY COLOR] body with [ACCENT COLOR] accents, [GLASS COLOR] tinted glass, transparent background, no text

Negative: photorealistic, gradients, soft airbrushed shading, pure black shadows, chrome wheels, sketchy lines, motion blur, background, ground plane, logo, text, watermark
```

Descripción de cada modelo para `[MODEL]`:

| Auto | [MODEL] |
| --- | --- |
| Cuña | low mid-engine wedge supercar with a flat rear deck, rear wing with side plates, bolted-on wide fender flares, exposed engine between four round amber tail lights, four exhaust pipes |
| Saeta | fastback coupe whose roof slopes in one line to a short ducktail, louvers over the rear window, one continuous amber tail-light bar, two exhaust pipes |
| Bloque | boxy cab-forward van with chamfered upper sides, 45-degree windshield, vertical tail lights, split rear doors with a window, roof rack |

## Entrega y verificación

Entregá los PNG sueltos con su nombre. Con eso armo las hojas y el atlas, y las pruebas confirman que no falta ninguno.

```
entrega/
  sprites/   224 archivos, por ejemplo cuna_lima_plano_luz_g0.png
  garage/    8 archivos, por ejemplo cuna-lima.png
```

Al recibirlos:

1. Un empaquetador junta los cuadros en `assets/sprites/{modelo}.png` y escribe `atlas.json` en el formato actual. Todavía no existe: lo escribo cuando lleguen los archivos.
2. `npm test` verifica que cada librea tenga luz y freno en los siete giros, y su retrato.
3. `npm run e2e` toma capturas en escritorio y celular para revisar el resultado en la pista.

Control antes de entregar:

- [ ] 448 × 308 px, PNG con transparencia
- [ ] Punto de apoyo en (224, 204) en todos los cuadros
- [ ] La silueta coincide con el cuadro actual al superponerlos
- [ ] Nombre según la convención, librea sin tildes
- [ ] Tinta #1c1f3a y sombras frías, sin negro puro
- [ ] Traseras tenues en luz, a pleno y con halo en freno
- [ ] Nada a menos de 14 px del borde, salvo halo y sombra
- [ ] Retratos de 560 × 300 px en vista de tres cuartos delantera
