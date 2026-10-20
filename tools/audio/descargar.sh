#!/bin/sh
# Descarga las grabaciones CC0 originales y las pasa a WAV mono para preparar_sonidos.py.
# Uso: tools/audio/descargar.sh [carpeta]   (por defecto respaldo/, que no se publica)
set -e
BASE="${1:-respaldo}"
mkdir -p "$BASE/descargas-sonido" "$BASE/sonido-trabajo/wav" "$BASE/sonido-trabajo/kenney"
for id in 0534 0600 0291 0290 1147 1146 2369 0747 1486 0505 1715 1774 0020 0278 3538 3540 3545; do
  curl -sfL -o "$BASE/descargas-sonido/bsb-$id.mp3" "https://bigsoundbank.com/UPLOAD/mp3/$id.mp3"
  afconvert -f WAVE -d LEI16@44100 -c 1 "$BASE/descargas-sonido/bsb-$id.mp3" "$BASE/sonido-trabajo/wav/bsb-$id.wav"
done
curl -sfL -o "$BASE/descargas-sonido/kenney_impact-sounds.zip" \
  "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip"
unzip -q -o "$BASE/descargas-sonido/kenney_impact-sounds.zip" -d "$BASE/sonido-trabajo/kenney"
echo "Listo. Ahora: design/generador/.venv/bin/python -I tools/audio/preparar_sonidos.py $BASE/sonido-trabajo/wav $BASE/sonido-trabajo/kenney/Audio assets/audio"
