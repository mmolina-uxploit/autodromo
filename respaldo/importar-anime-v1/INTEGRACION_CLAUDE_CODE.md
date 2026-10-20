# Integración de Autódromo · acabado anime 2D v1

## Alcance

Los cuatro modelos conservan su geometría. Cambian el sombreado, los reflejos de pintura y cristales, los materiales y los colores. No es una recreación de los coches de las referencias ni de sus escenarios. El acabado es procedural y se puede regenerar.

## Instrucción para Claude Code

Integrá los recursos de este paquete en el juego existente. Antes de copiar, localizá las rutas de carga y guardá una copia de los archivos actuales o creá un commit de respaldo. No cambies la lógica del juego.

1. Copiá el contenido de `sprites-autodromo/1-hojas/` a `assets/sprites/` (o a la ruta equivalente que ya utilice el proyecto). Incluí atlas.json. Este atlas conserva exactamente los bytes del original suministrado.
2. Copiá `sprites-autodromo/2-retratos/` a `assets/garage/` (o su ruta real).
3. Integrá la carpeta `design/` incluida para conservar el generador nuevo y su contrato fijo. No sobrescribas otros recursos de diseño ajenos al paquete.
4. `3-recortes/` contiene las mismas 613 capas sueltas que el paquete original. Usala si el proyecto las necesita; no reemplaces las hojas por autos aplanados.
5. Validá los siete giros, plano/subida, las 11 libreas, frenado y suspensión. Comprobá ruedas delante/detrás, pivote, escapes/toberas, cambio de auto y retratos del garaje. La capa de freno va entre carrocería y frente.
6. Si hay una caché de imágenes o service worker, actualizá su versión con el mecanismo existente del proyecto.

No se necesita migrar claves ni anclajes. No regeneres con el generador antiguo, porque revertiría este acabado. El generador nuevo tiene atlas-compatible.json y hojas-compatible.json para abortar si una futura modificación rompe el contrato.

## Verificación incluida

Desde la raíz de este paquete:

```bash
python3 design/generador/verificar_paquete.py sprites-autodromo
```

Se comprueban atlas, tamaño de hojas, cuadros lógicos y correspondencia de cada recorte con su hoja.

El efecto de freno está limitado a su rectángulo original para mantener compatibilidad. Las geometrías de ruedas y carrocerías no se modificaron. Las líneas son más finas; los píxeles transparentes pueden diferir del original dentro de los recortes.

No se suministró el motor del juego; no se ha realizado una prueba de integración en ejecución. `verificacion.json` documenta las comprobaciones realizadas. `comparacion.png` y `giros.gif` muestran los recursos exportados, no conceptos externos.
