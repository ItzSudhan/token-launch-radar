/* 2 · Criteria 2 and 4, the value's inputs drawn: angle = sector, distance from centre = time with no token, area = TVL, tail = 7-day growth
   against the market (out gained, in lost), colour = farm verdict. Every mark is one ranked row, placed by scopePosition(). */
const W = 604, H = 462, CX = 302, CY = 232, RIM = 206, YEARS = 5 * 365, { usd, clamp } = Radar;
const RINGS = [[91, '3 mo'], [182, '6 mo'], [365, '1 y'], [730, '2 y'], [1460, '4 y']];
/** The root of days with no token: equal area on the scope is equal time. Undated rows sit on the rim. */
const ringOf = (days) => RIM * (days == null ? 1 : Math.sqrt(clamp(days, 14, YEARS - 90) / YEARS));
const polar = (angle, dist) => [CX + Math.cos(angle) * dist, CY + Math.sin(angle) * dist];
const blipRadius = (row) => Math.max(2.4, 0.5 * Math.sqrt(row.tvl / 1e6));
const tailOf = (row) => row.change7d == null ? 0 : clamp(row.excess, -0.35, 0.35) * 90;
/** t = 0..1 across the sector's wedge, free to keep blips apart. */
function scopePosition(row, wedge, t) {
  const dist = ringOf(row.age), span = wedge.to - wedge.from, pad = Math.min(span * 0.42, (blipRadius(row) + 3) / Math.max(dist, 24));
  const angle = wedge.from + pad + t * (span - 2 * pad), [x, y] = polar(angle, dist);
  return { x, y, angle };
}
