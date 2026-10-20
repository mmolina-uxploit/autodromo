# Autódromo · acabado anime 2D, versión 1

Esta edición cambia el sombreado, los reflejos y los materiales de los cuatro vehículos. Conserva sus geometrías originales y todos los anclajes. Es una aproximación mediante render procedural al lenguaje de las referencias; no reproduce su nivel de ilustración ni rediseña las carrocerías como coches japoneses reales.

## Regenerar

Desde la raíz del proyecto:

```bash
python3 -m pip install -r design/generador/requirements.txt
python3 design/generador/generar_sprites.py
```

Salida: `assets/sprites/`, `assets/garage/`, `design/hojas-modelo/` y `design/tablero-ecosistema.png`.

`generador/atlas-compatible.json` fija el contrato original. `hojas-compatible.json` fija las dimensiones de las cuatro hojas. El generador comprueba nombres, anclajes y límites antes de empaquetar. Si una geometría nueva excede los recortes, falla explícitamente en lugar de guardar una hoja incompatible.

Los reflejos se calculan sobre las superficies 3D antes de reducir a 2D. Las capas se producen desde la misma geometría; no se generan vistas independientes. Las libreas mantienen sus identificadores. El azul del cielo se refleja en vidrio y pintura; las luces traseras son rojas y el freno aumenta su luminosidad.

La carpeta `.venv` de la máquina de origen se excluye: se reinstalan las tres dependencias en el entorno de destino. No requiere herramientas de generación de imágenes ni red para regenerar una vez instaladas.
