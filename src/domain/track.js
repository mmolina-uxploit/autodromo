import { clamp, degToRad, easeInOut, lerp, wrap } from './math.js';

/**
 * Circuito cerrado con geometría real.
 *
 * El trazado se describe en metros con tres clases de tramo:
 * - recta:  { kind: 'straight', length, hill?, boost?, adjust? }
 * - curva:  { kind: 'turn', radius, angle (grados, positivo = derecha), hill?, transition? }
 * - salto:  { kind: 'jump', ramp, height, gap, landing, landingHeight, hill? }
 *
 * Las curvas entran y salen por clotoides, así la curvatura nunca salta. Dos rectas marcadas
 * con `adjust` se alargan o acortan para que el circuito cierre exacto: el plano sale real y el
 * minimapa dibuja lo mismo que se maneja. La pista se muestrea en segmentos de largo fijo.
 */
export class Track {
  #segments;
  #segmentLength;
  #props;

  constructor(segments, segmentLength, props = {}) {
    this.#segments = Object.freeze([...segments]);
    this.#segmentLength = segmentLength;
    this.#props = Object.freeze({
      halfWidth: 6,
      barrier: 14,
      jumps: Object.freeze([]),
      bounds: Object.freeze({ minX: 0, minY: 0, maxX: 0, maxY: 0 }),
      ...props
    });
    Object.freeze(this);
  }

  static fromLayout(layout, options = {}) {
    return buildTrack(layout, options);
  }

  get segmentLength() { return this.#segmentLength; }
  get segmentCount() { return this.#segments.length; }
  get length() { return this.#segments.length * this.#segmentLength; }
  /** Media calzada en metros. */
  get halfWidth() { return this.#props.halfWidth; }
  /** Distancia del eje a la defensa de cada lado, en metros. */
  get barrier() { return this.#props.barrier; }
  get jumps() { return this.#props.jumps; }
  /** Tramos del trazado ya resueltos: clase, largo, ángulo (radianes) y radio. */
  get pieces() { return this.#props.pieces ?? Object.freeze([]); }
  get bounds() { return this.#props.bounds; }

  wrap(s) { return wrap(s, this.length); }
  segment(index) { return this.#segments[wrap(index, this.#segments.length)]; }
  indexAt(s) { return Math.floor(this.wrap(s) / this.#segmentLength) % this.#segments.length; }
  segmentAt(s) { return this.#segments[this.indexAt(s)]; }

  #fraction(s) {
    return (this.wrap(s) % this.#segmentLength) / this.#segmentLength;
  }

  /** Altura del piso. En un foso devuelve la del fondo. */
  heightAt(s) {
    const seg = this.segmentAt(s);
    return lerp(seg.startHeight, seg.endHeight, this.#fraction(s));
  }

  isGapAt(s) { return this.segmentAt(s).gap; }
  /** Pendiente del piso (m por m) y curvatura vertical (1/m; negativa en una loma). */
  slopeAt(s) { return this.segmentAt(s).slope; }
  /**
   * Curvatura vertical interpolada entre los centros de los segmentos: la fuerza de una loma
   * crece y se va de a poco en vez de saltar cada 3 m. Junto a un foso vale la del segmento.
   */
  bendAt(s) {
    const x = this.wrap(s) / this.#segmentLength - 0.5;
    const i = Math.floor(x);
    const a = this.segment(i);
    const b = this.segment(i + 1);
    if (a.gap || b.gap) return this.segmentAt(s).bend;
    return lerp(a.bend, b.bend, x - i);
  }
  curvatureAt(s) { return this.segmentAt(s).curvature; }

  /** Rumbo del eje en radianes (0 = este, positivo = horario en el plano). */
  headingAt(s) {
    const seg = this.segmentAt(s);
    return seg.heading + seg.curvature * this.#fraction(s) * this.#segmentLength;
  }

  /** Punto del plano a `n` metros a la derecha del eje (negativo = izquierda). */
  pointAt(s, n = 0) {
    const seg = this.segmentAt(s);
    const d = this.#fraction(s) * this.#segmentLength;
    const mid = seg.heading + seg.curvature * d / 2;
    const heading = seg.heading + seg.curvature * d;
    return {
      x: seg.x + Math.cos(mid) * d - Math.sin(heading) * n,
      y: seg.y + Math.sin(mid) * d + Math.cos(heading) * n
    };
  }

  /** Salto que contiene a `s` (rampa, foso o aterrizaje), o null. */
  jumpAt(s) {
    const index = this.segmentAt(s).jump;
    return index >= 0 ? this.#props.jumps[index] : null;
  }
}

const DEFAULTS = Object.freeze({
  segmentLength: 3,
  rumbleSegments: 2,
  startLineSegments: 2,
  halfWidth: 6,
  barrier: 14,
  gapDepth: 14
});

const TRANSITION_DEFAULT = r => clamp(r * 0.5, 10, 45);

/** Describe cada tramo con su largo, curvatura y giro total. */
function describePieces(layout) {
  if (!Array.isArray(layout) || layout.length === 0) throw new RangeError('El trazado necesita al menos un tramo.');
  return layout.map((piece, index) => {
    const hill = piece.hill ?? 0;
    if (piece.kind === 'straight') {
      if (!piece.adjust && !(piece.length > 0)) throw new RangeError(`Tramo ${index}: una recta necesita largo positivo.`);
      return { ...piece, index, hill, length: piece.length ?? 0, angle: 0, curvature: () => 0 };
    }
    if (piece.kind === 'jump') {
      const { ramp, height, gap, landing } = piece;
      if (!(ramp > 0 && height > 0 && gap > 0 && landing > 0)) {
        throw new RangeError(`Tramo ${index}: un salto necesita rampa, altura, foso y aterrizaje positivos.`);
      }
      const lead = piece.lead ?? 20;
      const tail = piece.tail ?? 20;
      return { ...piece, index, hill, lead, tail, length: lead + ramp + gap + landing + tail, angle: 0, curvature: () => 0 };
    }
    if (piece.kind === 'turn') {
      const { radius, angle } = piece;
      if (!(radius > 0) || !Number.isFinite(angle) || angle === 0) {
        throw new RangeError(`Tramo ${index}: una curva necesita radio positivo y ángulo distinto de cero.`);
      }
      const theta = Math.abs(degToRad(angle));
      const k = Math.sign(angle) / radius;
      const ease = Math.min(piece.transition ?? TRANSITION_DEFAULT(radius), theta * radius * 0.5);
      const hold = theta * radius - ease;
      const length = 2 * ease + hold;
      const curvature = x => {
        if (x < ease) return k * (x / ease);
        if (x > ease + hold) return k * ((length - x) / ease);
        return k;
      };
      return { ...piece, index, hill, length, angle: degToRad(angle), curvature, ease, hold, k };
    }
    throw new RangeError(`Tramo ${index}: clase desconocida "${piece.kind}".`);
  });
}

/** Giro acumulado dentro de un tramo, a `x` metros de su inicio (integral exacta de la curvatura). */
function turnedWithin(piece, x) {
  if (piece.kind !== 'turn') return 0;
  const { k, ease, hold, length } = piece;
  if (x <= ease) return k * x * x / (2 * ease);
  if (x <= ease + hold) return k * ease / 2 + k * (x - ease);
  const rest = length - x;
  return piece.angle - k * rest * rest / (2 * ease);
}

/** Desplazamiento de un tramo que arranca con rumbo `heading`, integrado con Simpson. */
function displacement(piece, heading) {
  if (piece.kind !== 'turn') return { x: Math.cos(heading) * piece.length, y: Math.sin(heading) * piece.length };
  const steps = Math.max(8, Math.ceil(piece.length / 0.5)) * 2;
  const h = piece.length / steps;
  let x = 0;
  let y = 0;
  for (let i = 0; i <= steps; i++) {
    const w = i === 0 || i === steps ? 1 : i % 2 ? 4 : 2;
    const a = heading + turnedWithin(piece, i * h);
    x += w * Math.cos(a);
    y += w * Math.sin(a);
  }
  return { x: (x * h) / 3, y: (y * h) / 3 };
}

/** Ajusta el largo de las dos rectas `adjust` para que el circuito cierre en posición. */
function closeLoop(pieces) {
  const totalAngle = pieces.reduce((sum, p) => sum + p.angle, 0);
  if (Math.abs(Math.abs(totalAngle) - 2 * Math.PI) > 1e-6) {
    throw new RangeError(`Las curvas deben sumar 360°; suman ${(totalAngle * 180 / Math.PI).toFixed(1)}°.`);
  }
  const adjustable = pieces.filter(p => p.adjust);
  let heading = 0;
  let gx = 0;
  let gy = 0;
  const directions = new Map();
  for (const piece of pieces) {
    if (piece.adjust) {
      directions.set(piece, { x: Math.cos(heading), y: Math.sin(heading) });
    } else {
      const d = displacement(piece, heading);
      gx += d.x;
      gy += d.y;
    }
    heading += piece.angle;
  }
  if (adjustable.length === 0) {
    if (Math.hypot(gx, gy) > 1) throw new RangeError(`El trazado no cierra: queda abierto ${Math.hypot(gx, gy).toFixed(1)} m.`);
    return pieces;
  }
  if (adjustable.length !== 2) throw new RangeError('Marcá exactamente dos rectas con adjust para cerrar el circuito.');
  const [a, b] = adjustable.map(p => directions.get(p));
  const det = a.x * b.y - a.y * b.x;
  if (Math.abs(det) < 0.05) throw new RangeError('Las dos rectas de ajuste no pueden ser paralelas.');
  const la = (-gx * b.y + gy * b.x) / det;
  const lb = (-a.x * gy + a.y * gx) / det;
  const minimum = Math.min(...adjustable.map(p => p.minLength ?? 30));
  if (la < minimum || lb < minimum) {
    throw new RangeError(`El cierre pide rectas de ${la.toFixed(0)} m y ${lb.toFixed(0)} m; rediseñá el trazado.`);
  }
  const solved = new Map([[adjustable[0], la], [adjustable[1], lb]]);
  return pieces.map(p => (p.adjust ? { ...p, length: solved.get(p) } : p));
}

function buildTrack(layout, options) {
  const o = { ...DEFAULTS, ...options };
  const pieces = closeLoop(describePieces(layout));

  const starts = [];
  const headings = [];
  let total = 0;
  let heading = 0;
  for (const piece of pieces) {
    starts.push(total);
    headings.push(heading);
    total += piece.length;
    heading += piece.angle;
  }

  const count = Math.max(8, Math.round(total / o.segmentLength));
  const L = total / count;
  const pieceAt = s => {
    let i = pieces.length - 1;
    while (i > 0 && starts[i] > s) i--;
    return i;
  };
  const headingAt = s => {
    const i = pieceAt(s);
    return headings[i] + turnedWithin(pieces[i], s - starts[i]);
  };

  // Desnivel base: cada tramo sube o baja `hill` con aceleración suave; el residuo se reparte para cerrar en cero.
  const baseEnds = [];
  let level = 0;
  for (const piece of pieces) {
    baseEnds.push(level);
    level += piece.hill;
  }
  const residual = level;
  const baseAt = s => {
    const i = pieceAt(s);
    const piece = pieces[i];
    const t = piece.length > 0 ? clamp((s - starts[i]) / piece.length, 0, 1) : 0;
    return easeInOut(baseEnds[i], baseEnds[i] + piece.hill, t) - residual * (s / total);
  };

  // Saltos: los límites se ajustan a bordes de segmento para que la rampa termine justo en el labio.
  const jumpRanges = pieces.filter(p => p.kind === 'jump').map(p => {
    const at = x => Math.round((starts[p.index] + x) / L);
    const rampStart = at(p.lead);
    const lip = Math.max(rampStart + 2, at(p.lead + p.ramp));
    const gapEnd = Math.max(lip + 1, at(p.lead + p.ramp + p.gap));
    const landingEnd = Math.max(gapEnd + 2, at(p.lead + p.ramp + p.gap + p.landing));
    return { piece: p, rampStart, lip, gapEnd, landingEnd };
  });

  const boostAt = s => {
    const i = pieceAt(s);
    const piece = pieces[i];
    if (!piece.boost) return false;
    const x = s - starts[i];
    return [].concat(piece.boost).some(f => Math.abs(x - f * piece.length) < 6);
  };

  const raw = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < count; i++) {
    const s0 = i * L;
    const h0 = headingAt(s0);
    const h1 = headingAt(s0 + L);
    const mid = headingAt(s0 + L / 2);
    raw.push({ i, s0, heading: h0, curvature: (h1 - h0) / L, x, y, piece: pieceAt(s0 + L / 2) });
    x += Math.cos(mid) * L;
    y += Math.sin(mid) * L;
  }
  // Error de integración residual (centímetros): se reparte para cerrar el dibujo exacto.
  const ex = x;
  const ey = y;
  for (const r of raw) {
    r.x -= ex * (r.i / count);
    r.y -= ey * (r.i / count);
  }

  const draft = raw.map(r => {
    const base0 = baseAt(r.s0);
    const base1 = baseAt(r.s0 + L);
    let start = base0;
    let end = base1;
    let kind = null;
    let jump = -1;
    jumpRanges.forEach((j, index) => {
      if (r.i < j.rampStart - 4 || r.i >= j.landingEnd + 4) return;
      jump = index;
      const { height, landingHeight = height * 0.7 } = j.piece;
      if (r.i >= j.rampStart && r.i < j.lip) {
        kind = 'ramp';
        const u0 = (r.i - j.rampStart) / (j.lip - j.rampStart);
        const u1 = (r.i + 1 - j.rampStart) / (j.lip - j.rampStart);
        start = base0 + height * u0 ** 1.6;
        end = base1 + height * u1 ** 1.6;
      } else if (r.i >= j.lip && r.i < j.gapEnd) {
        kind = 'gap';
        start = base0 - o.gapDepth;
        end = base1 - o.gapDepth;
      } else if (r.i >= j.gapEnd && r.i < j.landingEnd) {
        kind = 'landing';
        const u0 = (r.i - j.gapEnd) / (j.landingEnd - j.gapEnd);
        const u1 = (r.i + 1 - j.gapEnd) / (j.landingEnd - j.gapEnd);
        start = base0 + landingHeight * (1 - u0) ** 1.4;
        end = base1 + landingHeight * (1 - u1) ** 1.4;
      }
    });
    return {
      index: r.i,
      s: r.s0,
      curvature: r.curvature,
      heading: r.heading,
      x: r.x,
      y: r.y,
      startHeight: start,
      endHeight: end,
      band: Math.floor(r.i / o.rumbleSegments) % 2,
      isStartLine: r.i < o.startLineSegments,
      ramp: kind === 'ramp',
      gap: kind === 'gap',
      landing: kind === 'landing',
      jump,
      boost: kind === null && boostAt(r.s0 + L / 2),
      piece: r.piece,
      sector: Math.min(2, Math.floor((r.i / count) * 3))
    };
  });

  // Pendiente y curvatura vertical suaves: con ellas la física distingue una loma (vuela si
  // la aceleración vertical supera la gravedad) de un simple quiebre entre segmentos.
  const at = i => draft[((i % count) + count) % count];
  const slopeOf = d => (d.endHeight - d.startHeight) / L;
  const continuous = (a, b) => Math.abs(a.endHeight - b.startHeight) < 0.05 && !a.gap && !b.gap;
  const segments = draft.map((d, i) => {
    const prev = at(i - 1);
    const next = at(i + 1);
    const back = continuous(prev, d) ? slopeOf(prev) : slopeOf(d);
    const ahead = continuous(d, next) ? slopeOf(next) : slopeOf(d);
    return Object.freeze({ ...d, slope: slopeOf(d), bend: d.gap ? 0 : (ahead - back) / (2 * L) });
  });

  const jumps = jumpRanges.map((j, index) => Object.freeze({
    index,
    rampStart: j.rampStart * L,
    lip: j.lip * L,
    gapStart: j.lip * L,
    gapEnd: j.gapEnd * L,
    landingEnd: j.landingEnd * L,
    height: j.piece.height,
    requiredSpeed: requiredJumpSpeed(segments, j, L)
  }));

  const xs = segments.map(s => s.x);
  const ys = segments.map(s => s.y);
  const bounds = Object.freeze({ minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) });

  return new Track(segments, L, {
    halfWidth: o.halfWidth,
    barrier: o.barrier,
    jumps: Object.freeze(jumps),
    bounds,
    pieces: Object.freeze(pieces.map(p => Object.freeze({ kind: p.kind, length: p.length, angle: p.angle, radius: p.radius ?? null })))
  });
}

/**
 * Velocidad mínima para cruzar el foso sin propulsores: vuelo balístico desde el labio
 * con la pendiente final de la rampa, sin arrastre. Búsqueda binaria en m/s.
 */
function requiredJumpSpeed(segments, range, L, g = 9.81) {
  const lipSeg = segments[range.lip - 1];
  const slope = (lipSeg.endHeight - lipSeg.startHeight) / L;
  const lipHeight = lipSeg.endHeight;
  const target = range.gapEnd * L + L;
  const landingHeight = segments[range.gapEnd].startHeight;
  const clears = u => {
    let z = lipHeight;
    let vz = u * slope;
    let s = range.lip * L;
    const dt = 1 / 120;
    for (let t = 0; t < 8; t += dt) {
      vz -= g * dt;
      z += vz * dt;
      s += u * dt;
      if (s >= target) return z >= landingHeight - 0.2;
      if (z < landingHeight - 6) return false;
    }
    return false;
  };
  let lo = 5;
  let hi = 120;
  if (!clears(hi)) return hi;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (clears(mid)) hi = mid; else lo = mid;
  }
  return hi;
}
