#!/usr/bin/env python3
"""
Generador canónico de sprites de Autódromo.

Una geometría por modelo, una luz, una tinta. Colores, luz, cámara y trazos se
leen de ../ecosistema.json; este archivo solo define la forma de los autos y
cómo se dibujan. Las hojas PNG se regeneran desde acá y nunca se retocan a mano.

Uso:      python3 generar_sprites.py
Requiere: numpy, scipy, pillow
Salida:   ../../assets/sprites/*.png y atlas.json, ../hojas-modelo/*.png,
          ../tablero-ecosistema.png
"""
import hashlib
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..'))
SPRITES = os.path.normpath(os.path.join(RAIZ, '..', 'assets', 'sprites'))
GARAGE = os.path.normpath(os.path.join(RAIZ, '..', 'assets', 'garage'))
with open(os.path.join(RAIZ, 'ecosistema.json'), encoding='utf-8') as fh:
    ECO = json.load(fh)
RND = ECO['render']
SPR = ECO['contrato_sprites']
SS = SPR['supermuestreo']
FASES = SPR['fases_rueda']

FUENTES_B = ['/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf',
             '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf',
             '/System/Library/Fonts/Supplemental/Arial Bold.ttf']
FUENTES_R = ['/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf',
             '/System/Library/Fonts/Supplemental/Arial Narrow.ttf',
             '/System/Library/Fonts/Supplemental/Arial.ttf']
FUENTE_B = next((f for f in FUENTES_B if os.path.exists(f)), None)
FUENTE_R = next((f for f in FUENTES_R if os.path.exists(f)), None)


# ───────────────────────── color ─────────────────────────
def hx(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float64) / 255.0


def mix(a, b, t):
    return a * (1 - t) + b * t


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def rgb8(c):
    return tuple(int(round(x * 255)) for x in np.clip(c, 0, 1))


TINTA = hx(RND['tinta'])
INDIGO = hx(RND['indigo_sombra'])
CALIDA = hx(RND['luz_calida'])
REBOTE = hx(RND['color_rebote'])
MULT = hx(RND['multiplicador_sombra'])
REFLEJO = hx(RND['reflejo_vidrio'])
L_CLAVE = unit(RND['luz_clave'])
L_REBOTE = unit(RND['luz_rebote'])

MATS = ['pintura', 'acento', 'trim', 'vidrio', 'neumatico', 'llanta', 'llanta_int',
        'trasera', 'trasera_nucleo', 'led', 'cromo', 'motor', 'patente']
MI = {n: i for i, n in enumerate(MATS)}
EMISIVOS = [MI['trasera'], MI['trasera_nucleo'], MI['led']]


def tonos(base, luz=None, sombra=None):
    b = hx(base) if isinstance(base, str) else base
    lz = RND['mezcla_luz'] if luz is None else luz
    sm = RND['mezcla_sombra'] if sombra is None else sombra
    return np.stack([mix(b, CALIDA, lz), b, mix(b * MULT, INDIGO, sm)])


def tabla_color(librea, freno):
    F, E = RND['materiales_fijos'], RND['emisivos']
    t = np.zeros((len(MATS), 3, 3))
    t[MI['pintura']] = tonos(librea['carroceria'])
    t[MI['acento']] = tonos(librea['acento'])
    t[MI['trim']] = tonos(F['trim'], .22)
    vb = hx(librea['vidrio'])
    t[MI['vidrio']] = np.stack([mix(vb, REFLEJO, .45), vb, mix(vb * MULT, INDIGO, .2)])
    t[MI['neumatico']] = tonos(F['neumatico'], .18)
    t[MI['llanta']] = tonos(librea['llanta'], .42)
    t[MI['llanta_int']] = tonos(mix(hx(librea['llanta']), INDIGO, .5), .25)
    t[MI['cromo']] = tonos(F['cromo'], .50)
    t[MI['motor']] = tonos(F['motor'], .25)
    t[MI['patente']] = tonos(F['patente'], .30)
    est = 'freno' if freno else 'apagada'
    t[MI['trasera']] = hx(E['trasera'][est])
    t[MI['trasera_nucleo']] = hx(E['trasera_nucleo'][est])
    t[MI['led']] = hx(E['led'])
    return t


# ───────────────────────── geometría ─────────────────────────
class Malla:
    def __init__(self):
        self.t = []

    def tri(self, a, b, c, m):
        a, b, c = (np.asarray(p, float) for p in (a, b, c))
        if np.linalg.norm(np.cross(b - a, c - a)) < 1e-9:
            return
        self.t.append((a, b, c, MI[m]))

    def poli(self, pts, m):
        pts = [np.asarray(p, float) for p in pts]
        n = len(pts)
        if n == 3:
            self.tri(*pts, m)
        elif n == 4:
            self.tri(pts[0], pts[1], pts[2], m)
            self.tri(pts[0], pts[2], pts[3], m)
        else:
            c = np.mean(pts, axis=0)
            for i in range(n):
                self.tri(c, pts[i], pts[(i + 1) % n], m)

    def espejo(self):
        o, F = Malla(), np.array([-1.0, 1, 1])
        o.t = [(a * F, c * F, b * F, m) for a, b, c, m in self.t]
        return o

    def sumar(self, o):
        self.t += o.t
        return self


EX = np.array([1.0, 0, 0])

# Radio con que se redondean las esquinas de cada sección transversal, en metros.
RADIO_SECCION = 0.10


def caja(m, c, h, mat, rx=0.0, ejes=None):
    c = np.asarray(c, float)
    if ejes is None:
        ca, sa = math.cos(rx), math.sin(rx)
        ejes = (EX, np.array([0, ca, sa]), np.array([0, -sa, ca]))
    e0, e1, e2 = (np.asarray(e, float) for e in ejes)
    V = {(i, j, k): c + i * h[0] * e0 + j * h[1] * e1 + k * h[2] * e2
         for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)}
    caras = [[(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)],
             [(-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)],
             [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)],
             [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)],
             [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)],
             [(-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)]]
    for f in caras:
        m.poli([V[k] for k in f], mat)


def cilindro(m, a, b, r, n, lado, tapa_a=None, tapa_b=None):
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = unit(b - a)
    ref = np.array([0, 1.0, 0]) if abs(d[1]) < 0.9 else EX
    u = unit(np.cross(d, ref))
    v = np.cross(d, u)
    A = [a + r * (math.cos(2 * math.pi * i / n) * u + math.sin(2 * math.pi * i / n) * v) for i in range(n)]
    B = [p + (b - a) for p in A]
    for i in range(n):
        m.poli([A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]], lado)
    if tapa_a:
        m.poli(A, tapa_a)
    if tapa_b:
        m.poli(B, tapa_b)


def aro(x, cy, cz, r, n=24):
    return [np.array([x, cy + r * math.sin(2 * math.pi * i / n), cz + r * math.cos(2 * math.pi * i / n)])
            for i in range(n)]


def banda(m, A, B, mat):
    n = len(A)
    for i in range(n):
        m.poli([A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]], mat)


# Cuánto rodó la rueda hacia adelante, en fracción del período de la llanta (360° / rayos).
# La llanta es simétrica cada período, así que 0 y 1 dan la misma imagen y las fases cierran
# sin costura. La trompa mira a +z: rodar hacia adelante baja el ángulo en aro() y acá.
GIRO_RUEDA = 0.0
# Tacos por rayo. Con tres fases por período cada paso avanza k/3 de taco; solo k ≡ 1 (mód 3)
# hace que el taco se vea avanzar un tercio y no retroceder otro tercio.
TACOS_POR_RAYO = SPR['fases_rueda']['tacos_por_rayo']


def rueda(m, x_in, x_out, cz, r, r_llanta, rayos=5, n=24):
    """Neumático con tacos + llanta de plato profundo. El lado exterior mira a +x."""
    cy = r
    fase = 2 * math.pi * GIRO_RUEDA / rayos
    banda(m, aro(x_in, cy, cz, r, n), aro(x_out, cy, cz, r, n), 'neumatico')
    m.poli(aro(x_in, cy, cz, r, n), 'neumatico')
    banda(m, aro(x_out, cy, cz, r, n), aro(x_out, cy, cz, r_llanta, n), 'neumatico')
    labio, xl, xd = r_llanta - 0.035, x_out + 0.006, x_out - 0.075
    banda(m, aro(xl, cy, cz, r_llanta, n), aro(xl, cy, cz, labio, n), 'llanta')
    banda(m, aro(xl, cy, cz, labio, n), aro(xd, cy, cz, labio, n), 'llanta_int')
    m.poli(aro(xd, cy, cz, labio, n), 'llanta_int')
    # Tacos al ras de la banda: cambian el material, no la silueta, para que el contorno de la
    # rueda no titile al girar. Desde atrás son lo único que delata el giro.
    tacos = TACOS_POR_RAYO * rayos
    medio = np.array([(x_in + x_out) / 2, cy, cz])
    for s in range(tacos):
        ang = 2 * math.pi * s / tacos - fase
        er = np.array([0, math.sin(ang), math.cos(ang)])
        et = np.array([0, math.cos(ang), -math.sin(ang)])
        caja(m, medio + (r + .0025) * er, ((x_out - x_in) / 2 - .012, .0025, math.pi * r / tacos * .45),
             'trim', ejes=(EX, er, et))
    cubo = 0.055
    for s in range(rayos):
        ang = 2 * math.pi * s / rayos + 0.35 - fase
        er = np.array([0, math.sin(ang), math.cos(ang)])
        et = np.array([0, math.cos(ang), -math.sin(ang)])
        rc, hl = (cubo + labio) / 2, (labio - cubo) / 2
        caja(m, np.array([xd + 0.018, cy, cz]) + rc * er, (0.016, hl, 0.024), 'llanta', ejes=(EX, er, et))
    cilindro(m, (xd, cy, cz), (xd + 0.05, cy, cz), cubo + 0.01, 10, 'llanta', tapa_b='llanta')
    cilindro(m, (xd + 0.05, cy, cz), (xd + 0.065, cy, cz), 0.022, 6, 'cromo', tapa_b='cromo')


def arco(m, cz, cy, r_in, r_out, x_in, x_out, mat, a0=-0.15, a1=math.pi + 0.15, n=10):
    """Guardabarros atornillado: media corona alrededor de la rueda."""
    th = np.linspace(a0, a1, n + 1)

    def P(x, r, t):
        return np.array([x, cy + r * math.sin(t), cz + r * math.cos(t)])

    for i in range(n):
        t0, t1 = th[i], th[i + 1]
        m.poli([P(x_in, r_out, t0), P(x_out, r_out, t0), P(x_out, r_out, t1), P(x_in, r_out, t1)], mat)
        m.poli([P(x_out, r_in, t0), P(x_out, r_out, t0), P(x_out, r_out, t1), P(x_out, r_in, t1)], mat)
        m.poli([P(x_in, r_in, t0), P(x_in, r_in, t1), P(x_out, r_in, t1), P(x_out, r_in, t0)], 'trim')
    for t in (a0, a1):
        m.poli([P(x_in, r_in, t), P(x_out, r_in, t), P(x_out, r_out, t), P(x_in, r_out, t)], mat)


def luz_redonda(m, x, y, z, r, n=12):
    def disco(rr, zz):
        return [np.array([x + rr * math.cos(2 * math.pi * i / n), y + rr * math.sin(2 * math.pi * i / n), zz])
                for i in range(n)]
    banda(m, disco(r, z), disco(r, z - .022), 'trim')
    banda(m, disco(r, z - .022), disco(r * .80, z - .022), 'trim')
    m.poli(disco(r * .80, z - .010), 'trasera')
    m.poli(disco(r * .42, z - .014), 'trasera_nucleo')


def persianas(m, y0, z0, y1, z1, a0, a1, n, mat):
    d = np.array([0, y1 - y0, z1 - z0])
    lng = np.linalg.norm(d)
    ed = d / lng
    en = np.array([0, ed[2], -ed[1]])
    if en[1] < 0:
        en = -en
    for i in range(n):
        t = (i + .5) / n
        c = np.array([0, y0, z0]) + d * t + en * 0.02
        caja(m, c, ((a0 + (a1 - a0) * t) * .92, 0.012, lng / (n * 2) * .55), mat, ejes=(EX, en, ed))


def redondear(pts, r, n=4):
    """
    Reemplaza cada esquina interior por un arco tangente a los dos lados.

    La sección transversal es un polígono: piso, umbral, flanco, hombro, cubierta, techo, con
    esquinas vivas. Esas esquinas son lo que hace que la carrocería se lea cuadrada, y están en
    la sección, no a lo largo del auto. Los extremos no se tocan: son la costura del espejo.
    El radio se recorta a la mitad del lado más corto para que dos arcos nunca se pisen.
    """
    if r <= 0 or len(pts) < 3:
        return pts
    P = [np.asarray(q, float) for q in pts]
    salida = [tuple(P[0])]
    for i in range(1, len(P) - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        va, vc = a - b, c - b
        la, lc = np.linalg.norm(va), np.linalg.norm(vc)
        if la < 1e-6 or lc < 1e-6:
            # Arista de largo cero (dos medidas iguales): no hay esquina que redondear, pero se
            # emiten los mismos puntos igual para que todas las secciones tengan la misma cantidad.
            salida.extend([tuple(b)] * (n + 1))
            continue
        ua, uc = va / la, vc / lc
        # Siempre se emiten los mismos puntos por esquina, aunque el arco sea casi nulo: el loft
        # recorre las secciones por índice y si dos tuvieran distinta cantidad no se puede tejer.
        d = min(r, la / 2, lc / 2)
        p0, p1 = b + ua * d, b + uc * d
        for k in range(n + 1):
            t = k / n
            # Bézier cuadrática con el vértice de control: arco tangente a los dos lados.
            q = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t * t * p1
            salida.append((float(q[0]), float(q[1])))
    salida.append(tuple(P[-1]))
    return salida


def perfil(s):
    base = [(0.0, s['ybot']), (s['wb'], s['ybot']), (s['ws'], s['ysill']), (s['ws'], s['ybelt']),
            (s['wdeck'], s['ydeck']), (s['wg'], s['ydeck']), (s['wr'], s['yr']), (0.0, s['yr'])]
    return redondear(base, s.get('radio') if s.get('radio') is not None else RADIO_SECCION)


def carroceria(secciones, mat_k5, mat_k6):
    """Loft facetado entre secciones transversales; simétrico en x."""
    der, cen = Malla(), Malla()
    P = [[np.array([x, y, s['z']]) for (x, y) in perfil(s)] for s in secciones]
    # El perfil redondeado tiene más puntos que el polígono original, así que el material de cada
    # banda se resuelve por posición relativa: las dos primeras son bajos, las del medio pintura,
    # y las dos últimas, vidrio o pintura según el tramo.
    bandas = len(P[0]) - 1
    def material(k, i):
        t = k / max(1, bandas - 1)
        if t < 0.16:
            return 'trim'
        if t < 0.70:
            return 'pintura'
        return mat_k5[i] if t < 0.86 else mat_k6[i]
    for i in range(len(secciones) - 1):
        A, B = P[i], P[i + 1]
        for k in range(bandas):
            mat = material(k, i)
            der.poli([A[k], A[k + 1], B[k + 1], B[k]], mat)
    F = np.array([-1.0, 1, 1])
    for idx in (0, -1):
        mitad = P[idx]
        cen.poli(mitad + [p * F for p in reversed(mitad[1:-1])], 'pintura')
    return cen.sumar(der).sumar(der.espejo())


def sec(z, wb, ws, ybot, ysill, ybelt, wdeck, ydeck, wg, wr, yr, radio=None):
    return dict(z=z, wb=wb, ws=ws, ybot=ybot, ysill=ysill, ybelt=ybelt,
                wdeck=wdeck, ydeck=ydeck, wg=wg, wr=wr, yr=yr, radio=radio)


# ───────────────────────── modelos ─────────────────────────
def modelo_cuna():
    S = [sec(-2.10, .80, .96, .16, .30, .70, .88, .86, .78, .78, .86),
         sec(-1.40, .82, .98, .15, .30, .70, .90, .88, .72, .72, .88),
         sec(-0.60, .82, .98, .15, .30, .66, .88, .80, .72, .54, 1.08),
         sec(0.20, .82, .98, .15, .29, .62, .86, .74, .70, .52, 1.06),
         sec(1.10, .82, .97, .15, .28, .56, .84, .66, .68, .68, .66),
         sec(2.15, .76, .90, .13, .22, .38, .80, .44, .60, .60, .44)]
    m = carroceria(S, ['pintura', 'pintura', 'vidrio', 'vidrio', 'pintura'],
                   ['pintura', 'vidrio', 'pintura', 'vidrio', 'pintura'])
    der, cen, rd, ws = Malla(), Malla(), Malla(), .98
    contactos = []
    for cz, r, rl, w in ((-1.30, .35, .25, .36), (1.32, .32, .23, .30)):
        xo = ws + .10
        rueda(rd, xo - w, xo, cz, r, rl, rayos=5)
        contactos.append((xo - w / 2, 0, cz))
        arco(der, cz, r, r + .035, r + .13, ws - .04, xo + .03, 'pintura')
    caja(der, (ws + .035, .19, .02), (.035, .045, .76), 'trim')
    caja(der, (ws + .004, .345, .02), (.004, .014, .78), 'acento')
    der.poli([(ws + .006, .40, -.74), (ws + .006, .40, -.24), (ws + .006, .62, -.14), (ws + .006, .62, -.64)], 'trim')
    for y in (.47, .55):
        caja(der, (ws + .012, y, -.44), (.006, .008, .24), 'pintura')
    caja(der, (.86, .79, .98), (.07, .035, .05), 'acento')
    caja(der, (.79, .76, .98), (.04, .01, .012), 'trim')
    zr = -2.10
    cen.poli([(-.44, .30, zr - .004), (.44, .30, zr - .004), (.44, .64, zr - .004), (-.44, .64, zr - .004)], 'motor')
    for y in (.40, .48, .56):
        caja(cen, (0, y, zr - .02), (.40, .012, .015), 'trim')
    caja(cen, (0, .45, zr - .045), (.17, .04, .008), 'patente')
    for x in (-.26, -.12, .12, .26):
        cilindro(cen, (x, .25, zr + .02), (x, .25, zr - .14), .045, 10, 'cromo', tapa_b='trim')
    for x in (.58, .80):
        luz_redonda(der, x, .56, zr, .085)
    for x in (-.62, .62):
        caja(cen, (x, .96, -1.92), (.018, .10, .07), 'trim')
    caja(cen, (0, 1.075, -1.95), (.99, .022, .21), 'pintura', rx=.12)
    for x in (-1.0, 1.0):
        caja(cen, (x, 1.06, -1.96), (.012, .09, .26), 'acento')
    zf = 2.15
    for x in (-.60, .60):
        caja(cen, (x, .345, zf + .006), (.20, .014, .006), 'led')
    cen.poli([(-.48, .20, zf + .004), (.48, .20, zf + .004), (.48, .28, zf + .004), (-.48, .28, zf + .004)], 'motor')
    caja(cen, (0, .10, zf - .05), (.94, .022, .20), 'trim')
    traseras = toberas(cen, zr, (-.62, .62), .17)
    m.sumar(cen).sumar(der).sumar(der.espejo())
    return m, rd.sumar(rd.espejo()), meta_puntos(contactos, traseras, [(x, .25, zr - .14) for x in (-.26, -.12, .12, .26)],
                                                 .92, 1.9, dict(huella=(-1.12, 1.12, -2.25, 2.30), rayos=5))


def modelo_saeta():
    S = [sec(-2.22, .76, .92, .15, .28, .58, .84, .72, .76, .76, .72),
         sec(-1.75, .78, .95, .15, .28, .62, .87, .76, .74, .74, .76),
         sec(-0.40, .78, .95, .15, .28, .64, .87, .78, .72, .52, 1.06),
         sec(0.35, .78, .95, .15, .28, .62, .86, .74, .70, .50, 1.04),
         sec(1.10, .78, .94, .15, .27, .55, .84, .64, .66, .66, .64),
         sec(2.25, .74, .88, .13, .22, .36, .80, .42, .58, .58, .42)]
    m = carroceria(S, ['pintura', 'pintura', 'vidrio', 'vidrio', 'pintura'],
                   ['pintura', 'vidrio', 'pintura', 'vidrio', 'pintura'])
    der, cen, rd, ws = Malla(), Malla(), Malla(), .95
    contactos = []
    for cz, r, rl, w in ((-1.35, .33, .24, .32), (1.35, .32, .23, .28)):
        xo = ws + .06
        rueda(rd, xo - w, xo, cz, r, rl, rayos=6)
        contactos.append((xo - w / 2, 0, cz))
        arco(der, cz, r, r + .03, r + .09, ws - .03, xo + .02, 'pintura')
    for y in (.33, .37):
        caja(der, (ws + .004, y, .0), (.004, .011, .80), 'acento')
    caja(der, (.84, .78, 1.0), (.06, .032, .045), 'pintura')
    caja(der, (.78, .75, 1.0), (.035, .01, .012), 'trim')
    persianas(cen, .76, -1.75, 1.06, -0.40, .70, .48, 6, 'trim')
    zr = -2.22
    caja(cen, (0, .56, zr - .004), (.86, .06, .004), 'trim')
    caja(cen, (0, .56, zr - .008), (.80, .035, .008), 'trasera')
    for x in np.linspace(-.66, .66, 6):
        caja(cen, (x, .56, zr - .018), (.07, .018, .004), 'trasera_nucleo')
    caja(cen, (0, .745, -2.17), (.84, .02, .09), 'pintura', rx=.35)
    caja(cen, (0, .40, zr - .01), (.17, .04, .008), 'patente')
    caja(cen, (0, .22, zr - .03), (.70, .05, .05), 'trim')
    for x in (-.18, .18):
        cilindro(cen, (x, .22, zr + .02), (x, .22, zr - .12), .05, 10, 'cromo', tapa_b='trim')
    zf = 2.25
    caja(cen, (0, .33, zf + .006), (.70, .012, .006), 'led')
    cen.poli([(-.50, .20, zf + .004), (.50, .20, zf + .004), (.50, .27, zf + .004), (-.50, .27, zf + .004)], 'motor')
    caja(cen, (0, .10, zf - .06), (.86, .02, .16), 'trim')
    traseras = toberas(cen, zr, (-.56, .56), .2)
    m.sumar(cen).sumar(der).sumar(der.espejo())
    return m, rd.sumar(rd.espejo()), meta_puntos(contactos, traseras, [(x, .22, zr - .12) for x in (-.18, .18)],
                                                 .88, 2.0, dict(huella=(-1.05, 1.05, -2.35, 2.35), rayos=6))


def modelo_bloque():
    S = [sec(-2.12, .80, .90, .22, .36, 1.00, .88, 1.03, .87, .74, 1.62),
         sec(-2.00, .82, .92, .22, .36, 1.00, .90, 1.03, .89, .80, 1.72),
         sec(0.85, .82, .92, .22, .36, 1.00, .90, 1.03, .89, .80, 1.72),
         sec(1.00, .82, .92, .22, .36, 1.00, .90, 1.03, .89, .80, 1.72),
         sec(1.55, .82, .92, .22, .36, 1.00, .90, 1.03, .89, .78, 1.66),
         sec(2.02, .82, .92, .22, .36, 1.00, .90, 1.05, .86, .86, 1.05),
         sec(2.25, .78, .88, .22, .34, .90, .84, .97, .80, .80, .97)]
    m = carroceria(S, ['pintura', 'pintura', 'pintura', 'vidrio', 'vidrio', 'pintura'],
                   ['pintura', 'pintura', 'pintura', 'pintura', 'vidrio', 'pintura'])
    der, cen, rd, ws = Malla(), Malla(), Malla(), .92
    contactos = []
    for cz in (-1.35, 1.45):
        xo = ws + .02
        rueda(rd, xo - .26, xo, cz, .30, .21, rayos=5)
        contactos.append((xo - .13, 0, cz))
        arco(der, cz, .30, .32, .37, ws - .02, xo + .01, 'pintura')
    caja(der, (ws + .004, .52, -.55), (.004, .10, 1.45), 'acento')
    caja(der, (.98, 1.18, 1.80), (.03, .10, .06), 'trim')
    caja(der, (.62, 1.76, -.40), (.015, .015, 1.25), 'trim')
    zr = -2.12
    caja(der, (.80, .78, zr - .008), (.055, .17, .008), 'trasera')
    caja(der, (.80, .86, zr - .018), (.035, .05, .004), 'trasera_nucleo')
    for z in (-1.4, -.4, .6):
        caja(cen, (0, 1.75, z), (.64, .012, .02), 'trim')
    cen.poli([(-.62, 1.12, zr - .004), (.62, 1.12, zr - .004), (.62, 1.50, zr - .004), (-.62, 1.50, zr - .004)], 'vidrio')
    caja(cen, (0, .80, zr - .006), (.006, .44, .004), 'trim')
    caja(cen, (0, .30, zr - .04), (.92, .07, .05), 'trim')
    caja(cen, (0, .46, zr - .01), (.17, .04, .008), 'patente')
    zf = 2.25
    caja(cen, (0, .60, zf + .006), (.72, .016, .006), 'led')
    cen.poli([(-.55, .40, zf + .004), (.55, .40, zf + .004), (.55, .52, zf + .004), (-.55, .52, zf + .004)], 'motor')
    caja(cen, (0, .30, zf + .03), (.90, .07, .05), 'trim')
    traseras = toberas(cen, zr, (-.5, .5), .2)
    m.sumar(cen).sumar(der).sumar(der.espejo())
    return m, rd.sumar(rd.espejo()), meta_puntos(contactos, traseras, [], .84, 2.0, dict(huella=(-1.02, 1.02, -2.22, 2.32), rayos=5))


def modelo_volta():
    """Roadster eléctrico de techo targa con paquete de propulsores de aire frío."""
    S = [sec(-2.08, .78, .92, .17, .30, .60, .86, .72, .80, .80, .72),
         sec(-1.55, .80, .97, .16, .30, .66, .91, .80, .78, .78, .80),
         sec(-0.55, .80, .97, .16, .30, .64, .89, .76, .72, .50, 1.10),
         sec(0.25, .80, .96, .16, .29, .60, .87, .70, .70, .48, 1.07),
         sec(1.05, .80, .95, .16, .28, .54, .85, .62, .66, .66, .62),
         sec(2.10, .74, .88, .14, .22, .40, .80, .46, .60, .60, .46)]
    m = carroceria(S, ['pintura', 'pintura', 'vidrio', 'vidrio', 'pintura'],
                   ['pintura', 'vidrio', 'trim', 'vidrio', 'pintura'])
    der, cen, rd, ws = Malla(), Malla(), Malla(), .97
    contactos = []
    for cz, r, rl, w in ((-1.30, .34, .25, .33), (1.32, .33, .24, .29)):
        xo = ws + .07
        rueda(rd, xo - w, xo, cz, r, rl, rayos=10)
        contactos.append((xo - w / 2, 0, cz))
        arco(der, cz, r, r + .03, r + .10, ws - .03, xo + .02, 'pintura')
    caja(der, (ws + .004, .40, -.1), (.004, .012, 1.0), 'acento')
    der.poli([(ws + .006, .38, -.95), (ws + .006, .38, -.45), (ws + .006, .55, -.40), (ws + .006, .55, -.85)], 'trim')
    caja(der, (.82, .76, .95), (.06, .03, .045), 'pintura')
    zr = -2.08
    caja(cen, (0, .60, zr - .004), (.86, .045, .004), 'trim')
    caja(cen, (0, .60, zr - .008), (.82, .022, .008), 'trasera')
    for x in np.linspace(-.7, .7, 8):
        caja(cen, (x, .60, zr - .016), (.05, .012, .004), 'trasera_nucleo')
    caja(cen, (0, .735, -2.02), (.80, .018, .08), 'pintura', rx=.30)
    # La patente esconde la tobera central: un anillo cromado asoma por debajo.
    cilindro(cen, (0, .36, zr + .01), (0, .36, zr - .05), .12, 16, 'trim', tapa_b='motor')
    cilindro(cen, (0, .36, zr - .05), (0, .36, zr - .06), .085, 16, 'cromo', tapa_b='motor')
    caja(cen, (0, .47, zr - .02), (.17, .045, .008), 'patente')
    caja(cen, (0, .20, zr - .03), (.76, .04, .06), 'trim')
    for x in (-.45, -.25, .25, .45):
        caja(cen, (x, .17, zr - .02), (.012, .045, .08), 'motor')
    zf = 2.10
    for x in (-.58, .58):
        caja(cen, (x, .36, zf + .006), (.18, .012, .006), 'led')
    caja(cen, (0, .10, zf - .05), (.84, .02, .16), 'trim')
    traseras = toberas(cen, zr, (-.6, .6), .13)
    m.sumar(cen).sumar(der).sumar(der.espejo())
    return m, rd.sumar(rd.espejo()), meta_puntos(contactos, [(0, .36, zr - .06)] + traseras, [], .9, 1.9,
                                                 dict(huella=(-1.06, 1.06, -2.20, 2.22), rayos=10))


def toberas(cen, zr, xs, y):
    """Toberas del paquete de propulsores bajo el paragolpes trasero. Devuelve sus bocas."""
    bocas = []
    for x in xs:
        cilindro(cen, (x, y, zr + .03), (x, y, zr - .13), .065, 12, 'trim', tapa_b='motor')
        cilindro(cen, (x, y, zr - .13), (x, y, zr - .145), .048, 12, 'cromo', tapa_b='motor')
        bocas.append((x, y, zr - .145))
    return bocas


def meta_puntos(contactos, traseras, escapes, ancho_bajo, largo_bajo, meta):
    """Puntos 3D que el juego necesita por cuadro: contacto de ruedas, pivote, toberas y escapes."""
    ruedas = []
    for x, y, z in contactos:
        ruedas += [(x, y, z), (-x, y, z)]
    meta['puntos'] = {
        'ruedas': ruedas,
        'pivote': [(0, .55, 0)],
        'toberas_traseras': traseras,
        'toberas_bajas': [(sx * ancho_bajo * .8, .1, sz * largo_bajo * .55) for sx in (-1, 1) for sz in (-1, 1)],
        'escapes': escapes
    }
    return meta


MODELOS = {'cuna': modelo_cuna, 'saeta': modelo_saeta, 'bloque': modelo_bloque, 'volta': modelo_volta}


# ───────────────────────── cámara y raster ─────────────────────────
def camara(elev, dist, obj_y, orto=False):
    e = math.radians(elev)
    ojo = np.array([0.0, obj_y + dist * math.sin(e), -dist * math.cos(e)])
    f = unit(np.array([0.0, obj_y, 0.0]) - ojo)
    up = np.array([0, 1.0, 0]) if abs(f[1]) < 0.99 else np.array([0, 0, 1.0])
    r = unit(np.cross(up, f))
    return dict(ojo=ojo, f=f, r=r, u=np.cross(f, r), orto=orto, dist=dist)


def rot_y(P, yaw):
    a = math.radians(yaw)
    c, s = math.cos(a), math.sin(a)
    return P @ np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]).T


def proyectar(P, cam, esc):
    d = P - cam['ojo']
    xv, yv, zv = d @ cam['r'], d @ cam['u'], d @ cam['f']
    if cam['orto']:
        return xv * esc, -yv * esc, zv
    foc = esc * cam['dist']
    return foc * xv / zv, -foc * yv / zv, zv


def normales_de_vertice(T, n):
    """
    Normal por vértice: promedio de las caras que lo comparten.

    Es lo que convierte una superficie facetada en una superficie continua. Las aristas vivas
    de diseño se conservan: si el promedio se aleja demasiado de la cara, ese vértice vuelve a
    usar la normal de su propia cara, así un canto marcado sigue siendo un canto y no se derrite.
    """
    cos_limite = math.cos(math.radians(SPR.get('angulo_suavizado_grados', 0) or 0))
    if cos_limite >= 1:
        return np.broadcast_to(n[:, None, :], T.shape).copy()
    v = np.round(T.reshape(-1, 3), 4)
    _, inverso = np.unique(v, axis=0, return_inverse=True)
    inverso = inverso.reshape(-1, 3)
    suma = np.zeros((inverso.max() + 1, 3))
    np.add.at(suma, inverso.reshape(-1), np.repeat(n, 3, axis=0))
    largo = np.linalg.norm(suma, axis=1, keepdims=True)
    suma = suma / np.where(largo < 1e-9, 1, largo)
    vn = suma[inverso]
    duro = (vn * n[:, None, :]).sum(-1) < cos_limite
    vn[duro] = np.broadcast_to(n[:, None, :], T.shape)[duro]
    return vn


def rasterizar(T, M, cam, esc, ancho, alto, ox, oy):
    sx, sy, z = proyectar(T, cam, esc)
    sx, sy = sx + ox, sy + oy
    n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    n /= np.linalg.norm(n, axis=1, keepdims=True)
    vista = np.broadcast_to(cam['f'], n.shape) if cam['orto'] else T.mean(1) - cam['ojo']
    n[(n * vista).sum(1) > 0] *= -1
    vn = normales_de_vertice(T, n)
    prof = np.full((alto, ancho), np.inf, np.float32)
    nor = np.zeros((alto, ancho, 3), np.float32)
    mat = np.full((alto, ancho), -1, np.int16)
    pos = np.zeros((alto, ancho, 3), np.float32)
    persp = not cam['orto']
    with np.errstate(divide='ignore', invalid='ignore'):
        for i in range(len(T)):
            x0, x1, x2 = sx[i]
            y0, y1, y2 = sy[i]
            mnx, mxx = max(int(min(x0, x1, x2)), 0), min(int(math.ceil(max(x0, x1, x2))), ancho - 1)
            mny, mxy = max(int(min(y0, y1, y2)), 0), min(int(math.ceil(max(y0, y1, y2))), alto - 1)
            if mnx > mxx or mny > mxy:
                continue
            den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(den) < 1e-9:
                continue
            X = np.arange(mnx, mxx + 1) + .5
            Y = np.arange(mny, mxy + 1)[:, None] + .5
            w0 = ((y1 - y2) * (X - x2) + (x2 - x1) * (Y - y2)) / den
            w1 = ((y2 - y0) * (X - x2) + (x0 - x2) * (Y - y2)) / den
            w2 = 1 - w0 - w1
            dentro = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not dentro.any():
                continue
            z0, z1, z2 = z[i]
            zz = 1.0 / (w0 / z0 + w1 / z1 + w2 / z2) if persp else w0 * z0 + w1 * z1 + w2 * z2
            sub = prof[mny:mxy + 1, mnx:mxx + 1]
            upd = dentro & (zz < sub)
            if not upd.any():
                continue
            sub[upd] = zz[upd]
            mat[mny:mxy + 1, mnx:mxx + 1][upd] = M[i]
            if persp:
                weights = [w0 * zz / z0, w1 * zz / z1, w2 * zz / z2]
            else:
                weights = [w0, w1, w2]
            pp = sum(weights[j][..., None] * T[i, j] for j in range(3))
            pos[mny:mxy + 1, mnx:mxx + 1][upd] = pp[upd]
            # La normal se interpola entre los tres vértices, igual que la posición. Usando la
            # normal de la cara, cada triángulo queda de un color liso y la carrocería se lee
            # facetada por más redonda que sea la malla.
            nn = sum(weights[j][..., None] * vn[i, j] for j in range(3))
            largo = np.linalg.norm(nn, axis=-1, keepdims=True)
            nor[mny:mxy + 1, mnx:mxx + 1][upd] = (nn / np.where(largo < 1e-9, 1, largo))[upd]
    return prof, nor, mat, pos


def bordes(prof, nor, mat):
    fg = mat >= 0
    sil, con, cre = (np.zeros_like(fg) for _ in range(3))
    cos_t = math.cos(math.radians(SPR['umbral_pliegue_grados']))
    umb = SPR['umbral_profundidad_m']
    for a, b in (((slice(None), slice(0, -1)), (slice(None), slice(1, None))),
                 ((slice(0, -1), slice(None)), (slice(1, None), slice(None)))):
        fa, fb = fg[a], fg[b]
        ambos = fa & fb
        with np.errstate(invalid='ignore'):
            c = ambos & (np.abs(prof[a] - prof[b]) > umb)
        r = ambos & ~c & (((nor[a] * nor[b]).sum(-1) < cos_t) | (mat[a] != mat[b]))
        for msk, arr in ((fa != fb, sil), (c, con), (r, cre)):
            arr[a] |= msk
            arr[b] |= msk
    return sil, con, cre


def disco(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r + .6


def engrosar(m, r):
    return ndimage.binary_dilation(m, structure=disco(r)) if r > 0 else m


def lineas_de(buf, trazo):
    """Devuelve (máscara de tinta, máscara de filo de rebote)."""
    sil, con, cre = bordes(*buf[:3])
    tinta = engrosar(sil, trazo['silueta']) | engrosar(con, trazo['contorno']) | engrosar(cre, trazo['pliegue'])
    filo = engrosar(sil, trazo['silueta'] + RND['ancho_rebote_px_supermuestreo']) & ~tinta
    return tinta, filo


def reducir(a, f):
    H, W = a.shape[:2]
    return a.reshape(H // f, f, W // f, f, *a.shape[2:]).mean(axis=(1, 3))


def rampa(tabla, mat, nl):
    """
    Color de cada píxel según cuánta luz recibe.

    Con suavidad 0 elige uno de los tres tonos con un corte duro: es la celda plana de siempre.
    Con 1 recorre la rampa luz→base→sombra de forma continua, que es lo que convierte una celda
    en una ilustración: la luz cruza la chapa sin escalones. Los tres tonos de diseño siguen
    siendo los mismos y siguen siendo los extremos de la rampa; lo que cambia es si hay escalón
    entre ellos o no.
    """
    idx = np.clip(mat, 0, None)
    u_luz, u_medio = RND['umbral_luz'], RND['umbral_medio']
    duro = tabla[idx, np.where(nl > u_luz, 0, np.where(nl > u_medio, 1, 2))]
    suavidad = RND.get('suavidad_rampa', 0)
    if suavidad <= 0:
        return duro
    # Posición continua en la rampa: 0 es luz, 1 el tono base, 2 la sombra. Los umbrales de
    # diseño son los puntos de anclaje, así que con suavidad 0 y 1 la imagen coincide en ellos.
    bajo = u_medio - (u_luz - u_medio)
    t = np.interp(nl, [bajo, u_medio, u_luz], [2.0, 1.0, 0.0])
    i0 = np.floor(t).astype(int)
    i1 = np.minimum(i0 + 1, 2)
    f = (t - i0)[..., None]
    suave = tabla[idx, i0] * (1 - f) + tabla[idx, i1] * f
    return duro * (1 - suavidad) + suave * suavidad


def pintar(buf, trazos, tabla, sombra=None, freno=False):
    """Buffer geométrico → RGBA final (ya reducido)."""
    prof, nor, mat, pos = buf
    lineas, filo = trazos
    fg = mat >= 0
    nl, nr = nor @ L_CLAVE, nor @ L_REBOTE
    rgb = rampa(tabla, mat, nl)
    # Reflejos por superficie en coordenadas de escena: estables entre giros.
    # Bandas duras de cielo y asfalto, sin ruido aleatorio por cuadro.
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    paint = fg & np.isin(mat, [MI['pintura'], MI['acento']])
    sky = hx('#c5e5fa')
    base = tabla[np.clip(mat, 0, None), 1]
    shoulder = y + .12 * x + .045 * z
    ribbon = ((shoulder > .59) & (shoulder < .68))
    soft = np.clip((nor[..., 1] + .15) * .25, 0, .28)
    rgb[paint] = mix(rgb[paint], sky, soft[paint, None])
    low = paint & (y < .37)
    rgb[low] = mix(rgb[low], hx('#10263c'), .42)
    band = paint & ribbon & (nor[..., 1] < .65)
    rgb[band] = mix(base[band], sky, .52)
    # Reflejo estrecho que recorre las facetas superiores de la carrocería.
    sheen = paint & (nor[..., 1] > .30) & (np.abs(x + .18*z - .22) < .06)
    rgb[sheen] = mix(rgb[sheen], hx('#f1f7f6'), .50)
    glass = fg & (mat == MI['vidrio'])
    rgb[glass] = mix(hx('#102439'), sky, np.clip(.18 + .48*nor[...,1][glass], .12, .65)[:,None])
    reflection = glass & (((x + .36*z > .10) & (x + .36*z < .27)) | ((x + .36*z > .32) & (x + .36*z < .36)))
    rgb[reflection] = mix(rgb[reflection], sky, .52)
    metal = fg & np.isin(mat, [MI['llanta'], MI['cromo']])
    lit = metal & (nl > .35)
    rgb[lit] = mix(rgb[lit], hx('#edf4fa'), .45)
    dark = metal & (nl < .05)
    rgb[dark] = mix(rgb[dark], hx('#183047'), .35)

    emis = np.isin(mat, EMISIVOS)
    reb = fg & filo & ~emis & (nr > RND['umbral_rebote'])
    rgb[reb] = mix(rgb[reb], REBOTE, RND['mezcla_rebote'])
    bajo = fg & ~emis & (nor[..., 1] < -.6)
    rgb[bajo] = mix(rgb[bajo], TINTA, .35)

    alfa = np.zeros(fg.shape)
    color = np.zeros(fg.shape + (3,))
    if sombra is not None:
        sc = SPR['sombra_contacto']
        alfa = sombra * sc['opacidad']
        color[:] = hx(sc['color'])
    color[fg] = rgb[fg]
    alfa[fg] = 1
    color[lineas] = TINTA
    alfa[lineas] = 1

    prem = reducir(color * alfa[..., None], SS)
    a = reducir(alfa, SS)
    E = RND['emisivos']
    tras = reducir((np.isin(mat, EMISIVOS[:2]) & ~lineas).astype(float), SS)
    led = reducir(((mat == MI['led']) & ~lineas).astype(float), SS)
    for cov, col, sig, k in ((tras, E['halo_trasera'], 5.0 if freno else 2.4, 2.6 if freno else .8),
                             (led, E['halo_led'], 2.4, .8)):
        if cov.any():
            g = np.clip(ndimage.gaussian_filter(cov, sig) * k, 0, 1)
            prem += hx(col) * g[..., None]
            a = a + g * (1 - a)
    rgb_f = np.clip(prem / np.maximum(a, 1e-6)[..., None], 0, 1)
    out = np.dstack([rgb_f, np.clip(a, 0, 1)])
    return Image.fromarray((out * 255 + .5).astype(np.uint8), 'RGBA')


def sombra_contacto(cam, yaw, esc, ox, oy, ancho, alto, huella):
    x0, x1, z0, z1 = huella
    pts = rot_y(np.array([[x0, .002, z0], [x1, .002, z0], [x1, .002, z1], [x0, .002, z1]]), yaw)
    sx, sy, _ = proyectar(pts, cam, esc)
    im = Image.new('L', (ancho, alto), 0)
    ImageDraw.Draw(im).polygon(list(zip(sx + ox, sy + oy)), fill=255)
    a = np.asarray(im, np.float32) / 255
    return ndimage.gaussian_filter(a, SPR['sombra_contacto']['desenfoque_px'] * SS)


def preparar(malla):
    return np.array([[a, b, c] for a, b, c, _ in malla.t]), np.array([m for *_, m in malla.t], np.int16)


# ───────────────────────── hojas de sprites ─────────────────────────
def recortar(img, pad=1):
    """Recorta una capa a su contenido. Devuelve (recorte, ox, oy) o None si está vacía."""
    bbox = img.getchannel('A').point(lambda a: 255 if a > 2 else 0).getbbox()
    if not bbox:
        return None
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(img.width, x1 + pad), min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1)), x0, y0


def empaquetar(items, ancho):
    """Empaquetado por estantes, de la capa más alta a la más baja. items: [(clave, img, ox, oy)]."""
    orden = sorted(items, key=lambda it: -it[1].height)
    x = y = alto_fila = 0
    lugares = {}
    # Recortes idénticos comparten lugar en la hoja: las ruedas no usan materiales de librea,
    # así que salen iguales en todas las libreas del modelo.
    vistos = {}
    for clave, img, ox, oy in orden:
        firma = (img.size, hashlib.blake2b(img.tobytes(), digest_size=16).digest())
        if firma in vistos:
            lugares[clave] = (*vistos[firma], img, ox, oy, False)
            continue
        if x + img.width > ancho:
            x, y, alto_fila = 0, y + alto_fila + 2, 0
        lugares[clave] = (x, y, img, ox, oy, True)
        vistos[firma] = (x, y)
        x += img.width + 2
        alto_fila = max(alto_fila, img.height)
    hoja = Image.new('RGBA', (ancho, y + alto_fila), (0, 0, 0, 0))
    cuadros = {}
    for clave, (x, y, img, ox, oy, nueva) in lugares.items():
        if nueva:
            hoja.paste(img, (x, y))
        cuadros[clave] = {'x': x, 'y': y, 'w': img.width, 'h': img.height, 'ox': ox, 'oy': oy}
    return hoja, cuadros


def promedio_rgba(imgs):
    """Rueda barrida: promedio de las subfases con alfa premultiplicado, para que los rayos se
    fundan en un disco sin oscurecer el borde."""
    A = np.stack([np.asarray(i, float) for i in imgs]) / 255
    a = A[..., 3:4]
    rgb = (A[..., :3] * a).sum(0) / np.maximum(a.sum(0), 1e-6)
    out = np.dstack([rgb, a.mean(0)])
    return Image.fromarray((out * 255 + .5).astype(np.uint8), 'RGBA')


def sombra_rgba(som):
    sc = SPR['sombra_contacto']
    a = reducir(som * sc['opacidad'], SS)
    rgb = np.broadcast_to(hx(sc['color']), a.shape + (3,))
    out = np.dstack([rgb, np.clip(a, 0, 1)])
    return Image.fromarray((out * 255 + .5).astype(np.uint8), 'RGBA')


def solo_diferencias(base, otra):
    """Píxeles de `otra` que difieren de `base` (para la capa de freno)."""
    A = np.asarray(base, np.int16)
    B = np.asarray(otra, np.int16)
    cambia = np.abs(A - B).max(axis=2) > 3
    cambia = ndimage.binary_dilation(cambia, iterations=1)
    out = np.asarray(otra).copy()
    out[..., 3] = np.where(cambia, out[..., 3], 0)
    return Image.fromarray(out, 'RGBA')


def adelante_de(ruedas, mascara):
    """La parte de las ruedas que tapa a la carrocería."""
    arr = np.asarray(ruedas).copy()
    arr[..., 3] = (arr[..., 3] * mascara).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


def generar_sprites(modelos, seleccion=None):
    seleccion = seleccion or list(modelos)
    ppm = SPR['px_por_metro']
    giros = SPR['giros_grados']
    incl = SPR['inclinaciones_grados']
    cams = {k: camara(v, SPR['distancia_camara_m'], SPR['altura_objetivo_m']) for k, v in incl.items()}

    # tamaño de cuadro lógico común: extensión máxima de todos los modelos, giros e inclinaciones
    mnx = mxx = mny = mxy = 0.0
    for nombre, mod in modelos.items():
        T = mod['todo'][0]
        x0, x1, z0, z1 = mod['meta']['huella']
        pts = np.vstack([T.reshape(-1, 3), [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]]])
        for g in giros:
            P = rot_y(pts, g)
            for cam in cams.values():
                sx, sy, _ = proyectar(P, cam, ppm)
                ax, ay, _ = proyectar(np.zeros((1, 3)), cam, ppm)
                mnx, mxx = min(mnx, (sx - ax).min()), max(mxx, (sx - ax).max())
                mny, mxy = min(mny, (sy - ay).min()), max(mxy, (sy - ay).max())
    margen = 14
    medio = int(math.ceil(max(-mnx, mxx) + margen))
    FW = medio * 2
    arriba = int(math.ceil(-mny + margen))
    FH = arriba + int(math.ceil(mxy + margen))
    FW, FH = (FW + 3) // 4 * 4, (FH + 3) // 4 * 4
    AX, AY = FW // 2, arriba

    ruta_atlas = os.path.join(SPRITES, 'atlas.json')
    contrato_path = os.path.join(AQUI, 'atlas-compatible.json')
    contrato = None
    if os.path.exists(contrato_path):
        with open(contrato_path, encoding='utf-8') as f:
            contrato = json.load(f)
        assert contrato['cuadro'] == {'ancho': FW, 'alto': FH, 'ancla': [AX, AY]}, 'Cambió el cuadro lógico'

    previas = {}
    if os.path.exists(ruta_atlas):
        with open(ruta_atlas, encoding='utf-8') as fh:
            anterior = json.load(fh)
        if anterior.get('cuadro') == {'ancho': FW, 'alto': FH, 'ancla': [AX, AY]} and 'capas' in anterior:
            previas = {k: v for k, v in anterior['hojas'].items() if k not in seleccion and k in modelos}
    atlas = {
        'generado_por': 'generador/generar_sprites.py',
        'cuadro': {'ancho': FW, 'alto': FH, 'ancla': [AX, AY]},
        'px_por_metro_en_ancla': ppm,
        'distancia_camara_m': SPR['distancia_camara_m'],
        'giros_grados': giros,
        'inclinaciones_grados': incl,
        'nomenclatura': SPR['nomenclatura'],
        'capas': list(SPR['capas']),
        'fases_rueda': {k: FASES[k] for k in ('pasos', 'sufijos', 'barrido')},
        'hojas': dict(previas)
    }
    capturas = {}
    trazo = SPR['trazo_px_supermuestreo']
    for nombre, mod in modelos.items():
        if nombre not in seleccion:
            continue
        (Tb, Mb), (Tw, Mw), meta = mod['cuerpo'], mod['ruedas'], mod['meta']
        libreas = ECO['vehiculos'][nombre]['libreas']
        items = []
        puntos = {}
        for gi, g in enumerate(giros):
            Tbr = rot_y(Tb.reshape(-1, 3), g).reshape(Tb.shape)
            Twr = rot_y(Tw.reshape(-1, 3), g).reshape(Tw.shape)
            for inc in incl:
                cam = cams[inc]
                sx0, sy0, _ = proyectar(np.zeros((1, 3)), cam, ppm * SS)
                ox, oy = AX * SS - sx0[0], AY * SS - sy0[0]
                buf_b = rasterizar(Tbr, Mb, cam, ppm * SS, FW * SS, FH * SS, ox, oy)
                buf_w = rasterizar(Twr, Mw, cam, ppm * SS, FW * SS, FH * SS, ox, oy)
                lin_b = lineas_de(buf_b, trazo)
                lin_w = lineas_de(buf_w, trazo)
                subfases = [(buf_w, lin_w)]
                for Ts, Ms in mod['ruedas_sub'][1:]:
                    buf_s = rasterizar(rot_y(Ts.reshape(-1, 3), g).reshape(Ts.shape), Ms, cam,
                                       ppm * SS, FW * SS, FH * SS, ox, oy)
                    subfases.append((buf_s, lineas_de(buf_s, trazo)))
                # Rueda por delante de la carrocería: esa parte se vuelve a dibujar encima.
                adelante = (buf_w[2] >= 0) & ((buf_w[0] < buf_b[0]) | (buf_b[2] < 0))
                adelante &= (buf_b[2] >= 0) | engrosar(buf_b[2] >= 0, trazo['silueta'] + 2)
                adelante = engrosar(adelante, trazo['silueta'] + 1)
                mascara = np.clip(reducir(adelante.astype(float), SS), 0, 1)
                som = sombra_contacto(cam, g, ppm * SS, ox, oy, FW * SS, FH * SS, meta['huella'])
                for clave_p, lista in meta['puntos'].items():
                    if not lista:
                        puntos.setdefault(f'{inc}_g{gi}', {})[clave_p] = []
                        continue
                    P = rot_y(np.array(lista, float), g)
                    px, py, _ = proyectar(P, cam, ppm * SS)
                    puntos.setdefault(f'{inc}_g{gi}', {})[clave_p] = [[round((x + ox) / SS, 1), round((y + oy) / SS, 1)] for x, y in zip(px, py)]
                for lib in libreas:
                    cuerpo = pintar(buf_b, lin_b, tabla_color(lib, False))
                    frenado = pintar(buf_b, lin_b, tabla_color(lib, True), freno=True)
                    pintadas = [pintar(b, l, tabla_color(lib, False)) for b, l in subfases]
                    salto = len(pintadas) // FASES['pasos']
                    variantes = {s: pintadas[i * salto] for i, s in enumerate(FASES['sufijos'])}
                    variantes[FASES['barrido']] = promedio_rgba(pintadas)
                    ruedas = variantes['']
                    frente = adelante_de(ruedas, mascara)
                    capas = {'carroceria': cuerpo, 'freno': solo_diferencias(cuerpo, frenado), 'ruedas': ruedas, 'frente': frente}
                    for suf, img in variantes.items():
                        if suf:
                            capas[f'ruedas{suf}'] = img
                            capas[f'frente{suf}'] = adelante_de(img, mascara)
                    for capa, img in capas.items():
                        # La luz de freno está limitada al dominio original del efecto.
                        # El material base y las ruedas no se recortan artificialmente.
                        if contrato is not None and capa == 'freno':
                            key = f"{nombre}_{lib['id']}_{inc}_{capa}_g{gi}"
                            rect = contrato['hojas'][nombre]['cuadros'][key]
                            bounded = Image.new('RGBA', (FW, FH))
                            box = (rect['ox'], rect['oy'], rect['ox']+rect['w'], rect['oy']+rect['h'])
                            bounded.paste(img.crop(box), (rect['ox'], rect['oy']))
                            img = bounded
                        r = recortar(img)
                        if r:
                            items.append((f"{nombre}_{lib['id']}_{inc}_{capa}_g{gi}", *r))
                    for est, cuerpo_est in (('luz', cuerpo), ('freno', frenado)):
                        full = sombra_rgba(som)
                        full.alpha_composite(ruedas)
                        full.alpha_composite(cuerpo_est)
                        full.alpha_composite(frente)
                        capturas[f"{nombre}_{lib['id']}_{inc}_{est}_g{gi}"] = full
            print(f'  {nombre}: giro {g:+d}° listo', flush=True)
        if contrato is None:
            hoja, cuadros = empaquetar(items, SPR.get('ancho_hoja_max', 4096))
        else:
            cuadros = contrato['hojas'][nombre]['cuadros']
            assert puntos == contrato['hojas'][nombre]['puntos'], 'Cambió un anclaje'
            generated = {key: (img, ox, oy) for key, img, ox, oy in items}
            assert set(generated) == set(cuadros), 'Cambió el conjunto de capas'
            sizes_path = os.path.join(AQUI, 'hojas-compatible.json')
            with open(sizes_path, encoding='utf-8') as f:
                sizes = json.load(f)
            hoja = Image.new('RGBA', tuple(sizes[nombre]), (0, 0, 0, 0))
            for key, rect in cuadros.items():
                img, ix, iy = generated[key]
                logical = Image.new('RGBA', (FW, FH))
                logical.paste(img, (ix, iy))
                a = np.asarray(logical.getchannel('A')).copy()
                a[rect['oy']:rect['oy']+rect['h'],rect['ox']:rect['ox']+rect['w']] = 0
                if a.max() > 3:
                    raise ValueError(f'{key}: contenido fuera del recorte compatible ({a.max()})')
                crop = logical.crop((rect['ox'],rect['oy'],rect['ox']+rect['w'],rect['oy']+rect['h']))
                hoja.paste(crop, (rect['x'],rect['y']))
        archivo = f'{nombre}.png'
        hoja.save(os.path.join(SPRITES, archivo), optimize=True)
        atlas['hojas'][nombre] = {'archivo': archivo, 'rayos': mod['meta']['rayos'], 'cuadros': cuadros, 'puntos': puntos}
        print(f'  {nombre}: hoja {hoja.width}x{hoja.height}, {len(cuadros)} recortes', flush=True)
    atlas['hojas'] = {k: atlas['hojas'][k] for k in modelos if k in atlas['hojas']}
    with open(ruta_atlas, 'w', encoding='utf-8') as fh:
        json.dump(contrato if contrato is not None else atlas, fh, ensure_ascii=False, indent=1)
    return capturas


def capturas_desde_atlas():
    """Recompone el auto completo (ruedas, carrocería, frente) desde las hojas ya generadas."""
    with open(os.path.join(SPRITES, 'atlas.json'), encoding='utf-8') as fh:
        atlas = json.load(fh)
    FW, FH = atlas['cuadro']['ancho'], atlas['cuadro']['alto']
    capturas = {}
    for nombre, hoja in atlas['hojas'].items():
        img = Image.open(os.path.join(SPRITES, hoja['archivo'])).convert('RGBA')
        cuadros = hoja['cuadros']

        def capa(clave):
            c = cuadros.get(clave)
            if not c:
                return None
            lienzo = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
            lienzo.paste(img.crop((c['x'], c['y'], c['x'] + c['w'], c['y'] + c['h'])), (c['ox'], c['oy']))
            return lienzo

        for clave in cuadros:
            if '_carroceria_' not in clave:
                continue
            base = clave.replace('_carroceria_', '_{}_')
            full = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
            for parte in ('ruedas', 'carroceria', 'frente'):
                c = capa(base.format(parte))
                if c:
                    full.alpha_composite(c)
            capturas[base.format('luz')] = full
            freno = capa(base.format('freno'))
            if freno:
                con_freno = full.copy()
                con_freno.alpha_composite(freno)
                capturas[base.format('freno')] = con_freno
    return capturas


# ───────────────────────── hojas de modelo ─────────────────────────
def render_vista(T, M, meta, yaw, elev, orto, ppm, ancho, alto, librea, con_sombra):
    cam = camara(elev, SPR['distancia_camara_m'], SPR['altura_objetivo_m'], orto)
    esc = ppm * SS
    Tr = rot_y(T.reshape(-1, 3), yaw)
    sx, sy, _ = proyectar(Tr, cam, esc)
    ox = ancho * SS / 2 - (sx.min() + sx.max()) / 2
    oy = alto * SS / 2 - (sy.min() + sy.max()) / 2
    Tr = Tr.reshape(T.shape)
    buf = rasterizar(Tr, M, cam, esc, ancho * SS, alto * SS, ox, oy)
    trazo = {k: v + 1 for k, v in SPR['trazo_px_supermuestreo'].items()}
    lin = lineas_de(buf, trazo)
    som = sombra_contacto(cam, yaw, esc, ox, oy, ancho * SS, alto * SS, meta['huella']) if con_sombra else None
    suelo = None
    if orto and elev == 0:
        _, gy, _ = proyectar(np.zeros((1, 3)), cam, esc)
        suelo = (gy[0] + oy) / SS
    return pintar(buf, lin, tabla_color(librea, False), som), suelo


def fuente(path, t):
    if path:
        return ImageFont.truetype(path, t)
    return ImageFont.load_default(t)


def lamina_base(W, H):
    crema, lav = hx('#efebe4'), hx('#c7cbe0')
    im = Image.new('RGBA', (W, H), rgb8(crema) + (255,))
    d = ImageDraw.Draw(im)
    g = rgb8(mix(crema, lav, .35))
    for x in range(0, W, 40):
        d.line([(x, 0), (x, H)], fill=g, width=1)
    for y in range(0, H, 40):
        d.line([(0, y), (W, y)], fill=g, width=1)
    return im


def hoja_modelo(nombre, T, M, meta, capturas):
    V = ECO['vehiculos'][nombre]
    W, H = 2400, 1760
    im = lamina_base(W, H)
    d = ImageDraw.Draw(im)
    tinta = rgb8(TINTA)
    gris = rgb8(mix(TINTA, hx('#efebe4'), .45))
    d.text((80, 60), V['nombre'], font=fuente(FUENTE_B, 84), fill=tinta)
    dims = V['dimensiones_m']
    def num(v):
        return f'{v:.2f}'.replace('.', ',')
    sub = f"{V['rol'].capitalize()}. {num(dims['largo'])} m de largo, {num(dims['ancho'])} m de ancho, {num(dims['alto'])} m de alto"
    d.text((84, 160), sub, font=fuente(FUENTE_R, 30), fill=gris)
    d.text((84, 202), V['silueta'], font=fuente(FUENTE_R, 26), fill=gris)

    vistas = [('Lateral', 90, 0, True, False), ('Frente', 180, 0, True, False), ('Trasera', 0, 0, True, False),
              ('Planta', 90, 90, True, False), ('Tres cuartos delantero', 140, 16, False, True),
              ('Tres cuartos trasero', 32, 16, False, True)]
    tw, th, x0, y0 = 740, 470, 80, 270
    ppm = 145
    lib = V['libreas'][0]
    f_et = fuente(FUENTE_R, 26)
    for i, (et, yaw, elev, orto, sombra) in enumerate(vistas):
        cx, cy = x0 + (i % 3) * (tw + 20), y0 + (i // 3) * (th + 60)
        d.rectangle([cx, cy, cx + tw, cy + th], outline=rgb8(mix(TINTA, hx('#efebe4'), .75)), width=2)
        img, suelo = render_vista(T, M, meta, yaw, elev, orto, ppm, tw, th, lib, sombra)
        if suelo is not None:
            d.line([(cx + 30, cy + suelo), (cx + tw - 30, cy + suelo)], fill=rgb8(mix(TINTA, hx('#efebe4'), .4)), width=2)
        im.alpha_composite(img, (cx, cy))
        d.text((cx, cy + th + 12), et, font=f_et, fill=tinta)
        print(f'  {nombre}: vista {et.lower()}')

    # escala
    ex, ey = W - 80 - ppm, 120
    d.line([(ex, ey), (ex + ppm, ey)], fill=tinta, width=4)
    for x in (ex, ex + ppm):
        d.line([(x, ey - 10), (x, ey + 10)], fill=tinta, width=4)
    d.text((ex + ppm / 2 - 18, ey + 16), '1 m', font=f_et, fill=tinta)

    # capturas canónicas por librea + muestras de color
    yb = 1420
    d.text((80, yb - 52), 'Capturas canónicas: plano, giro 0, por librea', font=fuente(FUENTE_B, 30), fill=tinta)
    gi0 = SPR['giros_grados'].index(0)
    xb = 80
    for lib in V['libreas']:
        cap = capturas[f"{nombre}_{lib['id']}_plano_luz_g{gi0}"]
        cap = cap.resize((int(cap.width * .62), int(cap.height * .62)), Image.LANCZOS)
        im.alpha_composite(cap, (xb, yb))
        sx = xb + cap.width + 16
        d.text((sx, yb + 20), ETIQUETA.get(lib['id'], lib['id']).capitalize(), font=fuente(FUENTE_B, 28), fill=tinta)
        for j, k in enumerate(('carroceria', 'acento', 'vidrio', 'llanta')):
            yy = yb + 66 + j * 44
            d.rectangle([sx, yy, sx + 34, yy + 34], fill=rgb8(hx(lib[k])), outline=tinta, width=2)
            d.text((sx + 46, yy + 4), f"{ETIQUETA.get(k, k)} {lib[k]}", font=fuente(FUENTE_R, 22), fill=gris)
        xb = sx + 250
    im.convert('RGB').save(os.path.join(RAIZ, 'hojas-modelo', f'{nombre}.png'), optimize=True)


# ───────────────────────── tablero del ecosistema ─────────────────────────
def gradiente_v(w, h, stops):
    ys = np.linspace(0, 1, h)[:, None]
    cols = [hx(c) for c in stops]
    pos = np.linspace(0, 1, len(cols))
    out = np.zeros((h, w, 3))
    for c in range(3):
        out[..., c] = np.interp(ys, pos, [k[c] for k in cols])
    return out


def mini_escena(zona, w, h, sprite):
    hy = int(h * .48)
    arr = np.zeros((h, w, 3))
    arr[:hy] = gradiente_v(w, hy, zona['cielo'])
    P = zona['pista']
    arr[hy:] = hx(P['suelo'][0])
    im = Image.fromarray((arr * 255).astype(np.uint8)).convert('RGBA')
    d = ImageDraw.Draw(im)
    niebla = hx(zona['niebla'])
    zid = zona['id']
    if zid == 'bajo-autopista':
        losa = rgb8(mix(hx('#4f5d7a'), niebla, .25))
        d.rectangle([0, int(h * .16), w, int(h * .27)], fill=losa)
        for x in (.12, .38, .62, .88):
            d.rectangle([int(w * x) - 14, int(h * .27), int(w * x) + 14, hy], fill=losa)
        for x in np.linspace(.06, .94, 9):
            d.ellipse([int(w * x) - 5, int(h * .27) + 4, int(w * x) + 5, int(h * .27) + 14], fill=rgb8(hx('#ffd36a')))
    elif zid == 'costa-rosa':
        r = int(w * .16)
        d.ellipse([w // 2 - r, hy - r - 10, w // 2 + r, hy + r - 10], fill=rgb8(hx(zona['sol'])))
        d.rectangle([0, hy - int(h * .07), w, hy], fill=rgb8(hx('#efa1e2')))
        for px, s in ((.14, 1.0), (.86, .8), (.74, .55)):
            bx, top = int(w * px), int(hy - h * .34 * s)
            col = rgb8(hx('#e48ad8'))
            d.line([(bx, hy), (bx + int(14 * s), top)], fill=col, width=max(3, int(8 * s)))
            for ang in (-2.6, -2.0, -1.2, -.5, .2):
                ex, ey = bx + int(14 * s) + int(70 * s * math.cos(ang)), top + int(40 * s * math.sin(ang)) + int(24 * s)
                d.line([(bx + int(14 * s), top), (ex, ey)], fill=col, width=max(3, int(9 * s)))
    elif zid == 'distrito-torre':
        for px, pw, ph, col in ((.08, .10, .30, '#c7cbe0'), (.20, .08, .36, '#52c1c4'), (.70, .09, .40, '#d98fb8'),
                                (.84, .10, .28, '#e0b54a'), (.33, .07, .22, '#e0b54a'), (.58, .06, .26, '#52c1c4')):
            c = rgb8(mix(hx(col), niebla, .35))
            x0, x1 = int(w * px), int(w * (px + pw))
            y0 = int(hy - h * ph)
            d.rectangle([x0, y0 + (x1 - x0) // 2, x1, hy], fill=c)
            d.ellipse([x0, y0, x1, y0 + (x1 - x0)], fill=c)
    elif zid == 'anillo-neon':
        for px, pw, ph in ((.06, .16, .14), (.74, .2, .18), (.40, .1, .1)):
            x0, x1 = int(w * px), int(w * (px + pw))
            y1 = int(hy - h * .06)
            y0 = int(y1 - h * ph)
            g = gradiente_v(x1 - x0, y1 - y0, ['#5fe8f0', '#ff4fa8'])
            im.paste(Image.fromarray((g * 255).astype(np.uint8)), (x0, y0))
        d.rectangle([int(w * .3), int(hy - h * .3), int(w * .34), hy], fill=rgb8(hx('#2b3160')))
        d.ellipse([int(w * .29), int(hy - h * .36), int(w * .35), int(hy - h * .36) + int(w * .06)], fill=rgb8(hx('#3a2f7a')))
        d.line([(0, hy - 3), (w, hy - 3)], fill=rgb8(hx('#5fe8f0')), width=3)

    # pista en perspectiva
    prof = [1 + j * .55 for j in range(40)]
    for j in range(len(prof) - 1, 0, -1):
        dn, df = prof[j - 1], prof[j]
        yn, yf = hy + (h - hy) / dn, hy + (h - hy) / df
        wn, wf = w * .62 / dn, w * .62 / df
        t = 1 - 1 / df
        def c(k):
            return rgb8(mix(hx(k), niebla, min(.85, t * .9)))
        cx = w / 2
        alt = j % 2
        d.polygon([(0, yn), (w, yn), (w, yf), (0, yf)], fill=c(P['suelo'][alt]))
        rn, rf = wn * 1.12, wf * 1.12
        d.polygon([(cx - rn, yn), (cx + rn, yn), (cx + rf, yf), (cx - rf, yf)], fill=c(P['cordon'][alt]))
        d.polygon([(cx - wn, yn), (cx + wn, yn), (cx + wf, yf), (cx - wf, yf)], fill=c(P['asfalto'][alt]))
        if alt == 0:
            for lx in (-1 / 3, 1 / 3):
                ln, lf = wn * .025, wf * .025
                d.polygon([(cx + lx * 2 * wn - ln, yn), (cx + lx * 2 * wn + ln, yn),
                           (cx + lx * 2 * wf + lf, yf), (cx + lx * 2 * wf - lf, yf)], fill=c(P['carril']))
    s = sprite.resize((int(sprite.width * .62), int(sprite.height * .62)), Image.LANCZOS)
    ax, ay = ATLAS_ANCLA
    im.alpha_composite(s, (int(w / 2 - ax * .62), int(h - 18 - ay * .62)))
    return im


def tablero(capturas):
    W, H = 2400, 1700
    im = lamina_base(W, H)
    d = ImageDraw.Draw(im)
    tinta = rgb8(TINTA)
    gris = rgb8(mix(TINTA, hx('#efebe4'), .45))
    d.text((80, 60), 'Ecosistema visual de Autódromo', font=fuente(FUENTE_B, 76), fill=tinta)
    d.text((84, 156), ECO['tesis'], font=fuente(FUENTE_R, 30), fill=gris)

    nombres = {'base_fria': 'Base fría', 'contraluz_calido': 'Contraluz cálido', 'acentos': 'Acentos emisivos', 'estructura': 'Estructura'}
    x, y = 80, 250
    for grupo, cols in ECO['paleta'].items():
        d.text((x, y), nombres[grupo], font=fuente(FUENTE_B, 28), fill=tinta)
        for i, c in enumerate(cols):
            cx = x + (i % 4) * 128
            cy = y + 48 + (i // 4) * 186
            d.rectangle([cx, cy, cx + 112, cy + 112], fill=rgb8(hx(c['hex'])), outline=tinta, width=2)
            lineas = ETIQUETA.get(c['id'], c['id']).split(' ')
            for li, w in enumerate(lineas):
                d.text((cx, cy + 118 + li * 22), w, font=fuente(FUENTE_R, 20), fill=tinta)
            d.text((cx, cy + 118 + len(lineas) * 22), c['hex'], font=fuente(FUENTE_R, 18), fill=gris)
        x += 128 * min(4, len(cols)) + 60
        if x > W - 400:
            x = 80

    gi0 = SPR['giros_grados'].index(0)
    zw, zh, zy = 530, 480, 700
    for i, z in enumerate(ECO['zonas']):
        zx = 80 + i * (zw + 30)
        est = 'luz'
        sp = capturas[f'cuna_lima_plano_{est}_g{gi0}']
        esc = mini_escena(z, zw, zh, sp)
        im.alpha_composite(esc, (zx, zy))
        d.rectangle([zx, zy, zx + zw, zy + zh], outline=tinta, width=3)
        d.text((zx, zy + zh + 14), z['nombre'], font=fuente(FUENTE_B, 32), fill=tinta)
        d.text((zx, zy + zh + 56), f"{z['hora'].capitalize()}. Referencias {', '.join(z['referencias'])}", font=fuente(FUENTE_R, 22), fill=gris)
        print(f"  tablero: zona {z['nombre']}")

    yl = 1350
    d.text((80, yl), 'Parque de autos: giros −14°, 0° y +14° en plano', font=fuente(FUENTE_B, 30), fill=tinta)
    giros = SPR['giros_grados']
    x = 80
    for nombre in ECO['vehiculos']:
        lib = ECO['vehiculos'][nombre]['libreas'][0]['id']
        x_ini = x
        for g in (-14, 0, 14):
            cap = capturas[f'{nombre}_{lib}_plano_luz_g{giros.index(g)}']
            cap = cap.resize((int(cap.width * .42), int(cap.height * .42)), Image.LANCZOS)
            im.alpha_composite(cap, (x, yl + 50))
            x += cap.width - 34
        f_n = fuente(FUENTE_B, 28)
        nom = ECO['vehiculos'][nombre]['nombre']
        tw = d.textlength(nom, font=f_n)
        d.text(((x_ini + x + 40) / 2 - tw / 2, yl + 50 + cap.height + 4), nom, font=f_n, fill=tinta)
        x += 40
    im.convert('RGB').save(os.path.join(RAIZ, 'tablero-ecosistema.png'), optimize=True)


def generar_retratos(modelos):
    """Vista de tres cuartos delantera de cada librea, para las tarjetas de selección."""
    cfg = SPR['retratos']
    os.makedirs(GARAGE, exist_ok=True)
    for nombre, mod in modelos.items():
        (T, M), meta = mod['todo'], mod['meta']
        for lib in ECO['vehiculos'][nombre]['libreas']:
            img, _ = render_vista(T, M, meta, cfg['giro_grados'], cfg['inclinacion_grados'], False,
                                  cfg['px_por_metro'], cfg['ancho'], cfg['alto'], lib, True)
            img.save(os.path.join(GARAGE, f"{nombre}-{lib['id']}.png"), optimize=True)
            print(f"  retrato {nombre}-{lib['id']}")


ATLAS_ANCLA = (0, 0)
ETIQUETA = {'hormigon': 'hormigón', 'hormigon_sombra': 'hormigón sombra', 'salmon': 'salmón', 'ambar': 'ámbar',
            'indigo_sombra': 'índigo sombra', 'luz_calida': 'luz cálida', 'rosa_neon': 'rosa neón',
            'rosa_piso': 'rosa piso', 'carroceria': 'carrocería'}

ETAPAS = ('sprites', 'retratos', 'hojas', 'tablero')

if __name__ == '__main__':
    import sys
    args = sys.argv[1:]
    seleccion = None
    if '--modelos' in args:
        i = args.index('--modelos')
        seleccion = args[i + 1].split(',')
        del args[i:i + 2]
    etapas = [e for e in args if e in ETAPAS] or list(ETAPAS)

    os.makedirs(SPRITES, exist_ok=True)
    os.makedirs(os.path.join(RAIZ, 'hojas-modelo'), exist_ok=True)
    modelos = {}
    for n, fn in MODELOS.items():
        cuerpo, ruedas, meta = fn()
        todo = Malla()
        todo.t = cuerpo.t + ruedas.t
        # La rueda rodada en subfases a lo largo de un período de llanta. Las fases dibujables
        # salen de acá a intervalos regulares, y la rueda barrida es el promedio de todas.
        sub = []
        for i in range(FASES['subpasos_barrido']):
            GIRO_RUEDA = i / FASES['subpasos_barrido']
            sub.append(preparar(fn()[1]))
        GIRO_RUEDA = 0.0
        modelos[n] = {'cuerpo': preparar(cuerpo), 'ruedas': preparar(ruedas), 'ruedas_sub': sub,
                      'todo': preparar(todo), 'meta': meta}
        print(f'{n}: {len(todo.t)} triángulos', flush=True)

    if 'sprites' in etapas:
        print('Hojas de sprites', flush=True)
        generar_sprites(modelos, seleccion)
    with open(os.path.join(SPRITES, 'atlas.json'), encoding='utf-8') as fh:
        ATLAS_ANCLA = tuple(json.load(fh)['cuadro']['ancla'])
    elegidos = {n: m for n, m in modelos.items() if not seleccion or n in seleccion}
    if 'retratos' in etapas:
        print('Retratos', flush=True)
        generar_retratos(elegidos)
    if 'hojas' in etapas or 'tablero' in etapas:
        capturas = capturas_desde_atlas()
        if 'hojas' in etapas:
            print('Hojas de modelo', flush=True)
            for n, mod in elegidos.items():
                hoja_modelo(n, *mod['todo'], mod['meta'], capturas)
        if 'tablero' in etapas:
            print('Tablero', flush=True)
            tablero(capturas)
    print('Listo', flush=True)
