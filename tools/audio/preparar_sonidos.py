"""
Prepara el banco de sonidos del juego a partir de grabaciones CC0 descargadas.

Uso (con el entorno del generador, que ya tiene numpy, scipy, soundfile):
  design/generador/.venv/bin/python -I tools/audio/preparar_sonidos.py <carpeta_wav> <carpeta_kenney_audio> assets/audio

<carpeta_wav> tiene las grabaciones de BigSoundBank pasadas a WAV mono (bsb-NNNN.wav).
Salida: bucles y barridos de motor en WAV mono 32 kHz (cortes exactos para repetir sin clic),
efectos únicos en M4A/AAC (afconvert de macOS) y banco.json con el mapa de tono de cada barrido.
"""
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy import signal

RATE = 32000


def load(path):
    x, sr = sf.read(path, always_2d=False)
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != RATE:
        x = signal.resample_poly(x, RATE, sr)
    return x.astype(np.float64)


def cut(x, a, b):
    return x[int(a * RATE):int(b * RATE)].copy()


def fade(x, fin=0.01, fout=0.05):
    y = x.copy()
    n_in, n_out = int(fin * RATE), int(fout * RATE)
    if n_in:
        y[:n_in] *= np.linspace(0, 1, n_in)
    if n_out:
        y[-n_out:] *= np.linspace(1, 0, n_out)
    return y


def rms_normalize(x, target_db=-18.0):
    rms = np.sqrt(np.mean(x ** 2)) + 1e-12
    y = x * (10 ** (target_db / 20) / rms)
    peak = np.max(np.abs(y))
    return y / peak * 0.97 if peak > 0.97 else y


def peak_normalize(x, peak_db=-1.0):
    return x * (10 ** (peak_db / 20) / (np.max(np.abs(x)) + 1e-12))


def highpass(x, hz=25):
    b, a = signal.butter(2, hz / (RATE / 2), 'high')
    return signal.filtfilt(b, a, x)


def make_loop(x, start, length, xfade=0.08):
    """Bucle sin costura: el final se funde con lo que venía antes del principio (potencia constante)."""
    n, f = int(length * RATE), int(xfade * RATE)
    s = int(start * RATE)
    seg = x[s:s + n + f]
    out = seg[:n].copy()
    t = np.linspace(0, np.pi / 2, f)
    out[:f] = seg[:f] * np.sin(t) + seg[n:n + f] * np.cos(t)
    return out


def pitch_track(x, frame=0.06, hop=0.02, fmin=30, fmax=400):
    n, h = int(frame * RATE), int(hop * RATE)
    times, f0 = [], []
    for start in range(0, len(x) - n, h):
        seg = x[start:start + n] * np.hanning(n)
        ac = np.fft.irfft(np.abs(np.fft.rfft(seg, 2 * n)) ** 2)[:n]
        lo, hi = int(RATE / fmax), int(RATE / fmin)
        lag = lo + int(np.argmax(ac[lo:hi]))
        conf = ac[lag] / (ac[0] + 1e-9)
        times.append((start + n / 2) / RATE)
        f0.append(RATE / lag if conf > 0.3 else np.nan)
    return np.array(times), np.array(f0)


def sweep_map(x):
    """Mapa tiempo → tono monótono: corrige saltos de octava, rellena huecos y acumula el máximo."""
    t, f = pitch_track(x)
    estimate = None
    picked = []
    since = 0
    for v in f:
        since += 1
        if np.isnan(v):
            picked.append(np.nan)
            continue
        if estimate is None:
            estimate = v
            picked.append(v)
            continue
        # De cada lectura se queda con la octava más cercana a lo que venía; los saltos grandes se descartan.
        candidate = min((v, v * 2, v / 2), key=lambda c: abs(np.log(c / estimate)))
        if abs(np.log(candidate / estimate)) < 0.06 + 0.06 * since:
            estimate = 0.6 * estimate + 0.4 * candidate
            picked.append(candidate)
            since = 0
        else:
            picked.append(np.nan)
    picked = np.array(picked)
    good = ~np.isnan(picked)
    curve = np.interp(t, t[good], picked[good])
    curve = np.polyval(np.polyfit(t, curve, 3), t)
    curve = np.maximum.accumulate(curve)
    return [[round(float(tt), 3), round(float(ff), 1)] for tt, ff in zip(t, curve)]


def write_wav(path, x):
    sf.write(path, x.astype(np.float32), RATE, subtype='PCM_16')


def write_m4a(path, x, tmp_dir):
    tmp = os.path.join(tmp_dir, os.path.basename(path) + '.wav')
    sf.write(tmp, x.astype(np.float32), RATE, subtype='PCM_16')
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '96000', tmp, path], check=True)
    os.remove(tmp)


def main(src, kenney, out):
    os.makedirs(out, exist_ok=True)
    tmp_dir = os.path.join(out, '.tmp')
    os.makedirs(tmp_dir, exist_ok=True)
    w = {n: highpass(load(os.path.join(src, f'bsb-{n}.wav'))) for n in
         ['0600', '0291', '1147', '0534', '2369', '0747', '1486', '0505', '1715', '0020', '1774', '3538']}
    bank = {'frecuencia': RATE, 'motores': {}, 'bucles': {}, 'unicos': {}, 'golpes': {}}

    # Motores: barrido de aceleración (síntesis granular) y ralentí en bucle.
    engines = {
        'cuna': {'barrido': ('0600', 0.42, 2.92), 'ralenti': ('0534', 14.2, 1.3), 'ralentiTasa': 1.0},
        'saeta': {'barrido': ('0291', 0.58, 1.66), 'ralenti': ('0534', 14.2, 1.3), 'ralentiTasa': 1.2},
        'bloque': {'barrido': ('1147', 9.42, 10.85), 'ralenti': ('1147', 18.0, 1.5), 'ralentiTasa': 1.0}
    }
    for model, cfg in engines.items():
        name, a, b = cfg['barrido']
        sweep = cut(w[name], a, b)
        mapping = sweep_map(sweep)
        sweep = rms_normalize(fade(sweep, 0.005, 0.02), -16)
        write_wav(os.path.join(out, f'motor-{model}-barrido.wav'), sweep)
        name, start, length = cfg['ralenti']
        idle = rms_normalize(make_loop(w[name], start, length, 0.1), -18)
        write_wav(os.path.join(out, f'motor-{model}-ralenti.wav'), idle)
        bank['motores'][model] = {
            'barrido': f'motor-{model}-barrido.wav',
            'mapa': mapping,
            'ralenti': f'motor-{model}-ralenti.wav',
            'ralentiTasa': cfg['ralentiTasa']
        }
        print(f'{model}: barrido {mapping[0][1]:.0f}→{mapping[-1][1]:.0f} Hz en {b - a:.2f} s')

    # Volta: textura del inversor de un tranvía al arrancar, sin el rumor grave de los rieles.
    # Los granos se toman al azar de la ventana y se afinan con la velocidad (ver granular-engine.js).
    inverter = highpass(cut(w['3538'], 0.25, 3.65), 600)
    inverter = rms_normalize(fade(inverter, 0.01, 0.05), -17)
    write_wav(os.path.join(out, 'motor-volta-textura.wav'), inverter)
    bank['motores']['volta'] = {'textura': 'motor-volta-textura.wav', 'ventana': [0.15, 3.25], 'tasa': [0.55, 1.75]}
    print('volta: textura de inversor 3,4 s')

    # Bucles continuos.
    # El chirrido de neumáticos ya no sale de una grabación: se sintetiza (tire-voice.js).
    loops = {
        'rodadura': rms_normalize(make_loop(w['0505'], 20.0, 3.0, 0.15), -18),
        'viento': rms_normalize(make_loop(w['1715'], 100.0, 4.0, 0.3), -18),
        'planeo': rms_normalize(make_loop(w['1486'], 5.0, 2.0, 0.15), -16),
        'empuje': rms_normalize(make_loop(w['0747'], 33.1, 1.0, 0.12), -16)
    }
    for key, data in loops.items():
        write_wav(os.path.join(out, f'{key}.wav'), data)
        bank['bucles'][key] = f'{key}.wav'

    # Efectos únicos.
    singles = {
        'salto': peak_normalize(fade(cut(w['0747'], 22.55, 23.75), 0.004, 0.25)),
        'frenada': peak_normalize(fade(cut(w['2369'], 0.0, 2.2), 0.005, 0.4), -3),
        'publico': peak_normalize(fade(cut(w['0020'], 2.0, 9.0), 0.3, 1.5), -4),
        'chapa': peak_normalize(fade(cut(w['1774'], 0.04, 1.1), 0.002, 0.3))
    }
    for key, data in singles.items():
        write_m4a(os.path.join(out, f'{key}.m4a'), data, tmp_dir)
        bank['unicos'][key] = f'{key}.m4a'

    # Golpes del pack de Kenney (OGG): metal pesado para choques, golpe sordo para aterrizajes.
    groups = {'metal': 'impactMetal_heavy', 'chapa': 'impactPlate_heavy', 'aterrizaje': 'impactPunch_heavy',
              'roce': 'impactMetal_light', 'grava': 'footstep_concrete', 'pasto': 'footstep_grass', 'cambio': 'impactPlate_light'}
    for key, prefix in groups.items():
        files = []
        for i in range(5 if key in ('grava', 'pasto') else 3):
            path = os.path.join(kenney, f'{prefix}_{i:03d}.ogg')
            if not os.path.exists(path):
                continue
            data = peak_normalize(fade(load(path), 0.001, 0.05))
            target = f'golpe-{key}-{i + 1}.m4a'
            write_m4a(os.path.join(out, target), data, tmp_dir)
            files.append(target)
        bank['golpes'][key] = files

    os.rmdir(tmp_dir)
    with open(os.path.join(out, 'banco.json'), 'w', encoding='utf-8') as fh:
        json.dump(bank, fh, ensure_ascii=False, indent=1)
    total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    print(f'Banco listo: {len(os.listdir(out))} archivos, {total / 1024:.0f} KB')


if __name__ == '__main__':
    main(*sys.argv[1:4])
