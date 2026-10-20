/**
 * Minimapa del circuito con la posición de cada auto. Se arma una vez por pista
 * a partir del plano real y se dibuja arriba a la derecha.
 */
export function createMinimap() {
  let shape = null;

  function setTrack(track) {
    const b = track.bounds;
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
    const step = Math.max(1, Math.floor(track.segmentCount / 240));
    const points = [];
    for (let i = 0; i < track.segmentCount; i += step) {
      const seg = track.segment(i);
      points.push([(seg.x - b.minX) / span, (seg.y - b.minY) / span]);
    }
    shape = {
      track,
      points,
      span,
      bounds: b,
      aspect: [(b.maxX - b.minX) / span, (b.maxY - b.minY) / span],
      jumps: track.jumps.map(j => track.pointAt((j.lip + j.gapEnd) / 2))
    };
  }

  function paint(ctx, race, viewport, colorOf, playerId) {
    if (!shape) return;
    const size = Math.round(Math.min(220, Math.max(96, Math.min(viewport.width, viewport.height) * 0.24)));
    const pad = Math.round(size * 0.08);
    const w = shape.aspect[0] * (size - pad * 2);
    const h = shape.aspect[1] * (size - pad * 2);
    const left = viewport.width - size - Math.round(viewport.width * 0.02) - 8;
    const top = Math.round(viewport.height * 0.12) + 8;
    const ox = left + (size - w) / 2;
    const oy = top + (size - h) / 2;
    const map = (x, y) => [ox + ((x - shape.bounds.minX) / shape.span) * (size - pad * 2), oy + ((y - shape.bounds.minY) / shape.span) * (size - pad * 2)];

    ctx.fillStyle = 'rgba(28,31,58,0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(left, top, size, size, size * 0.1);
    else ctx.rect(left, top, size, size);
    ctx.fill();

    ctx.beginPath();
    shape.points.forEach(([x, y], i) => {
      const px = ox + x * (size - pad * 2);
      const py = oy + y * (size - pad * 2);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#efebe4';
    ctx.lineWidth = Math.max(3, size * 0.035);
    ctx.stroke();
    ctx.strokeStyle = '#4f5d7a';
    ctx.lineWidth = Math.max(1.5, size * 0.016);
    ctx.stroke();

    for (const p of shape.jumps) {
      const [x, y] = map(p.x, p.y);
      ctx.fillStyle = '#e8459a';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.5, size * 0.022), 0, Math.PI * 2);
      ctx.fill();
    }
    const start = shape.track.pointAt(0);
    const [sx, sy] = map(start.x, start.y);
    ctx.fillStyle = '#b6e03a';
    ctx.fillRect(sx - 2, sy - 5, 4, 10);

    const cars = [...race.cars].sort(a => (a.id === playerId ? 1 : -1));
    for (const car of cars) {
      const p = shape.track.pointAt(car.s, car.n);
      const [x, y] = map(p.x, p.y);
      const mine = car.id === playerId;
      ctx.beginPath();
      ctx.arc(x, y, mine ? Math.max(4, size * 0.04) : Math.max(2.8, size * 0.028), 0, Math.PI * 2);
      ctx.fillStyle = mine ? '#b6e03a' : colorOf(car);
      ctx.fill();
      ctx.lineWidth = mine ? 2.5 : 1.5;
      ctx.strokeStyle = mine ? '#fff4dc' : '#1c1f3a';
      ctx.stroke();
    }
  }

  return { setTrack, paint };
}
