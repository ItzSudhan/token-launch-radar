/* 2 · THE SCOPE: every ranked protocol as one blip, encoding the model's three inputs and the farm verdict (colour).
   scopePosition  angle = sector wedge, distance from centre = time with no token
   blipRadius     area = TVL              tailOf  7-day growth against the market, out = gained, in = lost
   3-scope-draw.js places, labels and draws them, the same every time */
const C = 310, RIM = 266, YEARS = 5 * 365, { usd, clamp } = Radar;
const RINGS = [[91, '3 mo'], [182, '6 mo'], [365, '1 y'], [730, '2 y'], [1460, '4 y']];
/** The root of days with no token: equal area on the scope is equal time. Undated rows sit on the rim. */
const ringOf = (days) => RIM * (days == null ? 1 : Math.sqrt(clamp(days, 14, YEARS - 90) / YEARS));
const polar = (angle, dist) => [C + Math.cos(angle) * dist, C + Math.sin(angle) * dist];
const blipRadius = (row) => Math.max(2.4, 0.62 * Math.sqrt(row.tvl / 1e6));
const tailOf = (row) => row.change7d == null ? 0 : clamp(row.excess, -0.35, 0.35) * 110;
/** t = 0..1 across the sector's wedge, free to keep blips apart. */
function scopePosition(row, wedge, t) {
  const dist = ringOf(row.age), span = wedge.to - wedge.from, pad = Math.min(span * 0.42, (blipRadius(row) + 3) / Math.max(dist, 24));
  const angle = wedge.from + pad + t * (span - 2 * pad), [x, y] = polar(angle, dist);
  return { x, y, angle };
}
