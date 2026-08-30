/**
 * THE RUN AHEAD AS TWO TRUE PARALLEL RAILS (build 22). The two violet lines
 * ahead of the learner were two copies of one cubic shifted half a gauge
 * left and right, which is only parallel where the curve runs straight down:
 * on a diagonal the pair pinched together, and once the gauge widened the
 * owner saw it ("tracks are not staying equidistant apart"). A shifted copy
 * is not an offset curve.
 *
 * This samples the segment's cubic, takes the unit normal at every sample
 * and pushes the point half a gauge out on each side, so the two rails stay
 * exactly a gauge apart everywhere. Polylines rather than beziers: the true
 * offset of a cubic is not a cubic, and at this many samples a polyline with
 * round joins is indistinguishable from a curve on a phone.
 *
 * The segment shape is the map's: an S-curve from (ax, ay) to (px, py) with
 * vertical tangents at both ends, control points half the drop below the
 * start and above the end. Web twin: gujarati-coach/src/lib/rail-offset.ts.
 */
export function railPairPaths(
  ax: number,
  ay: number,
  px: number,
  py: number,
  gauge: number,
  samples = 24,
): { left: string; right: string } {
  const dy = (py - ay) / 2;
  // Control points, as segs builds them.
  const c1x = ax;
  const c1y = ay + dy;
  const c2x = px;
  const c2y = py - dy;
  const half = gauge / 2;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const mt = 1 - t;
    const x = mt * mt * mt * ax + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * px;
    const y = mt * mt * mt * ay + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * py;
    // The derivative, for the tangent.
    let dx = 3 * mt * mt * (c1x - ax) + 6 * mt * t * (c2x - c1x) + 3 * t * t * (px - c2x);
    let dyy = 3 * mt * mt * (c1y - ay) + 6 * mt * t * (c2y - c1y) + 3 * t * t * (py - c2y);
    let len = Math.hypot(dx, dyy);
    if (len === 0) {
      // A degenerate tangent (a zero-length segment): fall back to straight down.
      dx = 0;
      dyy = 1;
      len = 1;
    }
    const nx = -dyy / len;
    const ny = dx / len;
    const cmd = i === 0 ? 'M' : 'L';
    // The normal points to the RIGHT of travel for a downward tangent, so
    // the left rail is the centre plus it and the right rail the centre
    // minus it (the first pin caught this the other way round).
    left.push(`${cmd} ${(x + nx * half).toFixed(2)} ${(y + ny * half).toFixed(2)}`);
    right.push(`${cmd} ${(x - nx * half).toFixed(2)} ${(y - ny * half).toFixed(2)}`);
  }
  return { left: left.join(' '), right: right.join(' ') };
}
