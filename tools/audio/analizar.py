"""Dibuja volumen y tono estimado de grabaciones de motor para elegir dónde cortar bucles.
Uso: python -I analizar.py salida.png archivo1.wav [archivo2.wav ...]
"""
import sys

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw


def pitch_track(x, sr, frame=0.08, hop=0.04, fmin=25, fmax=420):
    n, h = int(frame * sr), int(hop * sr)
    times, rms, f0 = [], [], []
    for start in range(0, len(x) - n, h):
        seg = x[start:start + n] * np.hanning(n)
        r = np.sqrt(np.mean(seg ** 2))
        ac = np.fft.irfft(np.abs(np.fft.rfft(seg, 2 * n)) ** 2)[:n]
        lo, hi = int(sr / fmax), int(sr / fmin)
        lag = lo + int(np.argmax(ac[lo:hi]))
        conf = ac[lag] / (ac[0] + 1e-9)
        times.append(start / sr)
        rms.append(r)
        f0.append(sr / lag if conf > 0.3 else np.nan)
    return np.array(times), np.array(rms), np.array(f0)


def main(out, paths):
    W, H = 1400, 260
    img = Image.new('RGB', (W, H * len(paths)), (239, 235, 228))
    d = ImageDraw.Draw(img)
    for k, p in enumerate(paths):
        x, sr = sf.read(p, always_2d=False)
        if x.ndim > 1:
            x = x.mean(axis=1)
        t, r, f = pitch_track(x, sr)
        top = k * H
        dur = len(x) / sr
        rmax = r.max() or 1
        for i in range(len(t)):
            px = 60 + t[i] / dur * (W - 80)
            d.line([(px, top + H - 30), (px, top + H - 30 - r[i] / rmax * 90)], fill=(127, 147, 176))
            if not np.isnan(f[i]):
                py = top + H - 30 - min(f[i], 420) / 420 * (H - 60)
                d.ellipse([px - 2, py - 2, px + 2, py + 2], fill=(232, 69, 154))
        for s in range(int(dur) + 1):
            px = 60 + s / dur * (W - 80)
            d.line([(px, top + H - 30), (px, top + H - 24)], fill=(28, 31, 58))
            d.text((px - 4, top + H - 22), str(s), fill=(28, 31, 58))
        for hz in (50, 100, 200, 300, 400):
            py = top + H - 30 - hz / 420 * (H - 60)
            d.text((10, py - 6), f'{hz}Hz', fill=(28, 31, 58))
        d.text((60, top + 6), f'{p.split("/")[-1]}  {dur:.1f}s', fill=(28, 31, 58))
    img.save(out)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
