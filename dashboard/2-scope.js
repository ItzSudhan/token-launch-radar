/* 2 · THE SCOPE: every ranked protocol as one blip, encoding the model's three inputs and the farm verdict.
   scopePosition  angle = sector wedge, distance from centre = time with no token
   blipRadius     area = TVL              tailOf  7-day growth against the market, out = gained, in = lost
   placeBlips     slides blips inside their wedge so none hides another; layoutLabels does the same for the names
   drawScope      the SVG, the same every time from the rows buildRadar returns */
(function (root) {
'use strict';
const R = root.Radar, { usd, clamp } = R;
const C = 310, RIM = 266, YEARS = 5 * 365;
const RINGS = [[91, '3 mo'], [182, '6 mo'], [365, '1 y'], [730, '2 y'], [1460, '4 y']];
const ORDER = ['Vaults', 'Lending', 'RWA', 'Dollars', 'Network', 'Trading'];

/** Distance is the root of days with no token: equal area on the scope is equal time. Undated rows sit on the rim. */
const ringOf = (days) => RIM * (days == null ? 1 : Math.sqrt(clamp(days, 14, YEARS - 90) / YEARS));
const polar = (angle, dist) => [C + Math.cos(angle) * dist, C + Math.sin(angle) * dist];
const blipRadius = (row) => Math.max(2.4, 0.62 * Math.sqrt(row.tvl / 1e6));
const tailOf = (row) => row.change7d == null ? 0 : clamp(row.excess, -0.35, 0.35) * 110;
/** Where a blip sits: t = 0..1 across its sector's wedge, at its age's distance. */
function scopePosition(row, wedge, t) {
  const dist = ringOf(row.age), span = wedge.to - wedge.from, pad = Math.min(span * 0.42, (blipRadius(row) + 3) / Math.max(dist, 24));
  const angle = wedge.from + pad + t * (span - 2 * pad), [x, y] = polar(angle, dist);
  return { x, y, angle };
}
/** One wedge a sector, wider for sectors with more rows. Biggest blip first, each tries 60 places and covers its neighbours least. */
function placeBlips(rows) {
  const count = ORDER.map((s) => rows.filter((r) => r.sector === s).length), weight = count.map((n) => Math.pow(n + 4, 0.72)), all = weight.reduce((s, w) => s + w, 0);
  let at = -1.32;
  const wedges = ORDER.map((sector, i) => ({ sector, n: count[i], from: at, to: (at += 2 * Math.PI * weight[i] / all) })), blips = [];
  for (const row of [...rows].sort((a, b) => b.tvl - a.tvl || a.rank - b.rank)) {
    const wedge = wedges.find((w) => w.sector === row.sector), r = blipRadius(row);
    let best = null;
    for (let i = 0; i < 60; i++) {
      const p = scopePosition(row, wedge, (0.5 + (i + row.rank) * 0.618034) % 1);
      const cost = blips.reduce((s, b) => s + Math.max(0, b.r + r + 3 - Math.hypot(b.x - p.x, b.y - p.y)), 0);
      if (!best || cost < best.cost - 1e-9) best = Object.assign(p, { cost, r, row });
      if (cost === 0) break;
    }
    blips.push(best);
  }
  return { wedges, blips, of: new Map(blips.map((b) => [b.row.slug, b])) };
}
const ringNames = (layout) => RINGS.map(([d, t]) => { const [x, y] = polar(layout.wedges[0].from, ringOf(d)); return { t, x: x - 17, y: y - 8, w: 34, h: 16 }; });
/** A two-line plate beside each named blip: no plate covers another plate, a ring name or a named blip. */
function layoutLabels(layout, wanted) {
  const plates = [], hit = (a, b, gap) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
  const boxOf = (b) => ({ x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r }), stars = wanted.map((w) => layout.of.get(w.slug)), names = ringNames(layout);
  for (const want of wanted) {
    const b = layout.of.get(want.slug), w = Math.max(want.top.length * 6.5, want.sub.length * 7) + 13, h = 33;
    let best = null;
    for (const reach of [7, 20, 36, 56, 80, 110, 145]) for (let k = 0; k < 16; k++) {
      const dx = Math.cos(k * Math.PI / 8), dy = Math.sin(k * Math.PI / 8), d = b.r + reach, p = { x: b.x + dx * d + (dx - 1) / 2 * w, y: b.y + dy * d + (dy - 1) / 2 * h, w, h };
      let cost = reach * 0.5 + (p.x < 4 || p.y < 4 || p.x + w > 2 * C - 4 || p.y + h > 2 * C - 4 ? 9999 : 0);
      for (const o of plates) if (hit(p, o, 3)) cost += 900;
      for (const o of names) if (hit(p, o, 1)) cost += 150;
      for (const s of stars) if (hit(p, boxOf(s), 1)) cost += s === b ? 60 : 260;
      for (const o of layout.blips) if (hit(p, boxOf(o), 0)) cost += o.row.plan.verdict === 'FARM' ? 9 : 5;
      if (!best || cost < best.cost) best = Object.assign(p, { cost, want, b });
    }
    plates.push(best);
  }
  return plates;
}

const f = (n) => n.toFixed(1), seq = (list, fn) => list.map(fn).join('');
const esc = (s) => String(s).replace(/[&<>'"]/g, (c) => `&#${c.charCodeAt(0)};`);
const short = (name) => (name.length > 20 ? name.slice(0, 19).trim() + '…' : name);
const line = (cls, x1, y1, x2, y2) => `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
const ring = (cls, x, y, r) => `<circle class="${cls}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`;
function rimName(w, i) {     // the sector's name along the rim, read left to right above and below
  const mid = (w.from + w.to) / 2, below = Math.sin(mid) > 0, dist = RIM + (below ? 25 : 15), half = (w.to - w.from) * (below ? 0.45 : -0.45), [x1, y1] = polar(mid + half, dist), [x2, y2] = polar(mid - half, dist);
  return `<path id="rim${i}" d="M${f(x1)} ${f(y1)}A${dist} ${dist} 0 0 ${below ? 0 : 1} ${f(x2)} ${f(y2)}" fill="none"/><text class="rim"><textPath href="#rim${i}" startOffset="50%" text-anchor="middle">${w.sector.toUpperCase()} ${w.n}</textPath></text>`;
}
function blipMark({ row, x, y, r, angle }, keep) {
  const len = tailOf(row), ux = Math.cos(angle), uy = Math.sin(angle), edge = r * Math.sign(len);
  return `<g class="blip ${row.plan.verdict}${keep && !keep.has(row.slug) ? ' dim' : ''}" data-row="${row.slug}"><title>${esc(`${row.rank} ${row.name} · ${usd(row.value)} · TVL ${usd(row.tvl)}`)}</title>` +
    (Math.abs(len) < 1.5 ? '' : line('tail', x + ux * edge, y + uy * edge, x + ux * (edge + len), y + uy * (edge + len))) + (row.tier === 'watchlist' ? ring('ring', x, y, r + 2.6) : '') + ring('dot', x, y, r) + '</g>';
}
/** o.keep: slugs the filter leaves lit · o.picks: the planner's farms, numbered · o.top, o.farms: how many names to write */
function drawScope(rows, layout, o) {
  const lit = rows.filter((r) => !o.keep || o.keep.has(r.slug)), byValue = [...lit].sort((a, b) => a.rank - b.rank).slice(0, o.top);
  const farms = lit.filter((r) => r.plan.verdict === 'FARM' && !byValue.includes(r)).sort((a, b) => b.plan.net / b.plan.capital - a.plan.net / a.plan.capital).slice(0, o.farms);
  const name = (row, n, sub) => ({ slug: row.slug, top: `${n}  ${short(row.name)}`, sub, cls: row.plan.verdict });
  const pays = (r) => `+${usd(r.plan.net)} on ${usd(r.plan.capital)}`;
  const plates = layoutLabels(layout, o.picks ? o.picks.map(({ row }, i) => name(row, i + 1, pays(row))) : [...byValue.map((r) => name(r, r.rank, usd(r.value))), ...farms.map((r) => name(r, r.rank, pays(r)))]);
  const ticks = Array.from({ length: 120 }, (_, i) => { const [x1, y1] = polar(i * Math.PI / 60, RIM), [x2, y2] = polar(i * Math.PI / 60, RIM + (i % 10 ? 3 : 6)); return `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`; }).join('');
  const order = [...layout.blips].sort((a, b) => (o.keep ? o.keep.has(a.row.slug) - o.keep.has(b.row.slug) : 0) || b.r - a.r);
  return `<svg class="scope" viewBox="0 0 ${2 * C} ${2 * C}" role="img" aria-label="Radar scope of ${rows.length} protocols">${seq(RINGS, ([d]) => ring('range', C, C, ringOf(d)))}${ring('rimline', C, C, RIM)}<path class="ticks" d="${ticks}"/>` +
    seq(layout.wedges, (w, i) => line('spoke', C, C, ...polar(w.from, RIM)) + rimName(w, i)) + seq(order, (b) => blipMark(b, o.keep)) +
    seq(ringNames(layout), (n) => `<rect class="plate" x="${f(n.x)}" y="${f(n.y)}" width="${n.w}" height="${n.h}"/><text class="ringname" x="${f(n.x + 17)}" y="${f(n.y + 12)}">${n.t}</text>`) +
    seq(plates, (p) => { const ex = clamp(p.b.x, p.x, p.x + p.w), ey = clamp(p.b.y, p.y, p.y + p.h), d = Math.hypot(ex - p.b.x, ey - p.b.y) || 1, k = Math.min(1, p.b.r / d); return line('leader', p.b.x + (ex - p.b.x) * k, p.b.y + (ey - p.b.y) * k, ex, ey); }) +
    seq(plates, (p) => `<g class="name ${p.want.cls}" data-row="${p.want.slug}"><rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${p.h}" rx="2"/><text x="${f(p.x + 6)}" y="${f(p.y + 14)}">${esc(p.want.top)}</text><text class="sub" x="${f(p.x + 6)}" y="${f(p.y + 28)}">${p.want.sub}</text></g>`) + '</svg>';
}
/** What each mark means, the sizes drawn by the same blipRadius(). */
function scopeLegend(verdicts) {
  const size = (tvl, t) => { const r = blipRadius({ tvl }), d = Math.ceil(2 * r + 2); return `<span><svg width="${d}" height="${d}">${ring('size', r + 1, r + 1, r)}</svg>${t}</span>`; };
  return `<dl><dt>Angle</dt><dd>sector</dd><dt>Distance</dt><dd>time with no token; rim undated</dd><dt>Tail</dt><dd>7-day TVL v market: out gained, in lost</dd><dt>Area</dt><dd>TVL${size(1e7, '$10M')}${size(1e8, '$100M')}${size(1e9, '$1B')}</dd>` +
    `<dt>Colour</dt><dd>${seq(['FARM', 'THIN', 'SKIP'], (v, i) => `<i class="key ${v}"></i>${v} ${verdicts[i]} `)}<i class="key watch"></i>watchlist</dd></dl>`;
}

Object.assign(R, { placeBlips, drawScope, scopeLegend, esc });
})(typeof window !== 'undefined' ? window : globalThis);
