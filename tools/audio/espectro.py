"""Espectrograma simple para revisar grabaciones. Uso: python -I espectro.py salida.png archivo.wav [desde] [hasta] [fmax]"""
import sys

import numpy as np
import soundfile as sf
from PIL import Image
from scipy import signal

path, out = sys.argv[2], sys.argv[1]
x, sr = sf.read(path, always_2d=False)
a = float(sys.argv[3]) if len(sys.argv) > 3 else 0
b = float(sys.argv[4]) if len(sys.argv) > 4 else len(x) / sr
fmax = float(sys.argv[5]) if len(sys.argv) > 5 else 8000
x = x[int(a * sr):int(b * sr)]
f, t, s = signal.spectrogram(x, sr, nperseg=4096, noverlap=3584)
s = 10 * np.log10(s[f <= fmax] + 1e-12)
s = np.clip((s - (s.max() - 70)) / 70, 0, 1)
img = Image.fromarray((np.flipud(s) * 255).astype(np.uint8)).resize((1200, 500))
img.save(out)
print(f'{path}: {a:.1f}-{b:.1f} s, 0-{fmax:.0f} Hz')
