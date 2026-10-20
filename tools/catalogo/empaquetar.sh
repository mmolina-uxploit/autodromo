#!/bin/sh
# Arma dist/dibujos-autodromo.zip: imágenes de todo lo que se dibuja con código, el código y la guía.
# Uso: sh tools/catalogo/empaquetar.sh   (necesita npm install; usa el chrome-headless-shell de Playwright si está)
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
NAME=dibujos-autodromo
OUT="$ROOT/dist/$NAME"
if [ -z "$CHROMIUM_PATH" ]; then
  CHROMIUM_PATH=$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell 2>/dev/null | tail -1)
  export CHROMIUM_PATH
fi
rm -rf "$OUT" "$OUT.zip"
node "$ROOT/tools/catalogo/exportar.mjs" "$OUT"

cd "$ROOT"
for file in src/infrastructure/rendering/*.js src/config/zones.js src/config/camera.js src/config/rules.js \
            src/domain/math.js design/ecosistema.json tools/catalogo/catalogo.js tools/catalogo/index.html \
            tools/catalogo/exportar.mjs tools/catalogo/empaquetar.sh; do
  mkdir -p "$OUT/5-codigo/$(dirname "$file")"
  cp "$file" "$OUT/5-codigo/$file"
done
cp tools/catalogo/LEEME.txt tools/catalogo/INTEGRACION.md "$OUT/"

cd "$ROOT/dist"
zip -qrX "$NAME.zip" "$NAME" -x '*.DS_Store'
echo "dist/$NAME.zip $(du -h "$NAME.zip" | cut -f1) · $(find "$NAME" \( -name '*.png' -o -name '*.jpg' \) | wc -l | tr -d ' ') imágenes"
