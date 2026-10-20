#!/bin/sh
# Captura una escena de depuración sin ventana (necesita el servidor: python3 tools/servir.py 8092).
# Usa el chrome-headless-shell de Playwright si está (Chrome con ventana devuelve negro sin pantalla).
# Uso: tools/captura.sh salida.png "escena=demo&pista=costa-rosa&hasta=800" [ancho] [alto] [puerto]
SHELL_BIN=$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-*/chrome-headless-shell 2>/dev/null | tail -1)
[ -x "$SHELL_BIN" ] || SHELL_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$SHELL_BIN" --hide-scrollbars --mute-audio --window-size="${3:-1280},${4:-720}" --virtual-time-budget=5000 \
  --screenshot="$1" "http://127.0.0.1:${5:-8092}/index.html?depurar&$2" >/dev/null 2>&1
