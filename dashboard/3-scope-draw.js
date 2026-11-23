const SCOPE_IS = 'Criterion 4: one blip a ranked row, drawn from the rows buildRadar() returns';
const ORDER = ['Vaults', 'Lending', 'RWA', 'Dollars', 'Network', 'Trading'];
/** Biggest blip first, each tries 60 places and keeps the clearest. */
function placeBlips(rows) {
  const count = ORDER.map((s) => rows.filter((r) => r.sector === s).length), weight = count.map((n) => (n + 4) ** 0.72), all = weight.reduce((s, w) => s + w, 0);
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
const rimBoxes = (layout) => layout.wedges.flatMap((w) => [-4, -2, 0, 2, 4].map((k) => { const [x, y] = polar((w.from + w.to) / 2 + k * 0.062, RIM + 16); return { x: x - 9, y: y - 9, w: 18, h: 18 }; }));
/** Each name takes the cheapest place off the centre; one that would cover a large blip or another name is dropped. */
function layoutLabels(layout, wanted) {
  const plates = [], hit = (a, b, gap) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
  const boxOf = (b) => ({ x: b.x - b.r, y: b.y - b.r, w: 2 * b.r, h: 2 * b.r }), fixed = [...rimBoxes(layout), ...ringNames(layout)], corners = [{ x: 0, y: 0, w: 160, h: 66 }, { x: W - 150, y: 0, w: 150, h: 46 }];
  const dots = (p, b) => { const x = clamp(b.x, p.x, p.x + p.w), y = clamp(b.y, p.y, p.y + p.h); return [0.25, 0.4, 0.55, 0.7, 0.85].map((k) => ({ x: b.x + (x - b.x) * k, y: b.y + (y - b.y) * k, w: 0, h: 0 })); };
  for (const want of wanted) {
    const b = layout.of.get(want.slug), w = Math.max(want.top.length * 6.4, want.sub.length * 6.8) + 12, h = 32;
    let best = null;
    for (let x = 2; x <= W - w - 2; x += 12) for (let y = 2; y <= H - h - 2; y += 9) {
      const p = { x, y, w, h };
      if (Math.hypot(x + w / 2 - CX, y + h / 2 - CY) < RIM * 0.84 || corners.some((o) => hit(p, o, 0))) continue;
      const line = dots(p, b);
      let cost = 0.9 * Math.hypot(clamp(b.x, x, x + w) - b.x, clamp(b.y, y, y + h) - b.y);
      for (const o of fixed) if (hit(p, o, 0)) cost += 280;
      for (const o of plates) cost += (hit(p, o, 3) ? 900 : 0) + (line.some((d) => hit(d, o, 2)) || o.line.some((d) => hit(d, p, 2)) ? 300 : 0);
      for (const o of layout.blips) if (hit(p, boxOf(o), 1)) cost += o.r > 6 ? 300 : 9;
      if (!best || cost < best.cost) best = Object.assign(p, { cost, want, b, line });
    }
    if (best.cost < 290) plates.push(best);
  }
  return plates;
}

const f = (n) => n.toFixed(1), each = (list, fn) => list.map(fn).join('');
const esc = (s) => String(s).replace(/[&<>'"]/g, (c) => `&#${c.charCodeAt(0)};`);
const line = (cls, x1, y1, x2, y2) => `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
const ring = (cls, x, y, r) => `<circle class="${cls}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`;
function rimName(w, i) {
  const mid = (w.from + w.to) / 2, below = Math.sin(mid) > 0, dist = RIM + (below ? 21 : 11), half = (w.to - w.from) * (below ? 0.45 : -0.45), [x1, y1] = polar(mid + half, dist), [x2, y2] = polar(mid - half, dist);
  return `<path id="rim${i}" d="M${f(x1)} ${f(y1)}A${dist} ${dist} 0 0 ${below ? 0 : 1} ${f(x2)} ${f(y2)}" fill="none"/><text class="rim"><textPath href="#rim${i}" startOffset="50%" text-anchor="middle">${w.sector.toUpperCase()} ${w.n}</textPath></text>`;
}
function blipMark({ row, x, y, r, angle }, keep) {
  const len = tailOf(row), ux = Math.cos(angle), uy = Math.sin(angle), edge = r * Math.sign(len);
  return `<g class="blip ${row.plan.verdict}${keep && !keep.has(row.slug) ? ' dim' : ''}" data-row="${row.slug}"><title>${esc(`${row.rank} ${row.name}`)}</title>` +
    (Math.abs(len) < 1.5 ? '' : line('tail', x + ux * edge, y + uy * edge, x + ux * (edge + len), y + uy * (edge + len))) + (row.tier === 'watchlist' ? ring('ring', x, y, r + 2.6) : '') + ring('dot', x, y, r) + '</g>';
}
/** o.keep: slugs the filter leaves lit · o.picks: the planner's farms · o.top, o.farms: how many names */
function drawScope(rows, layout, o) {
  const lit = rows.filter((r) => !o.keep || o.keep.has(r.slug)), byValue = [...lit].sort((a, b) => a.rank - b.rank).slice(0, o.top);
  const farms = lit.filter((r) => r.plan.verdict === 'FARM' && !byValue.includes(r)).sort((a, b) => b.plan.net / b.plan.capital - a.plan.net / a.plan.capital).slice(0, o.farms);
  const name = (row, n, sub) => ({ slug: row.slug, top: `${n}  ${row.name}`, sub, cls: row.plan.verdict }), pays = (r) => `+${usd(r.plan.net)} on ${usd(r.plan.capital)}`;
  const plates = layoutLabels(layout, o.picks ? o.picks.map(({ row }, i) => name(row, i + 1, pays(row))) : [...byValue.map((r) => name(r, r.rank, usd(r.value))), ...farms.map((r) => name(r, r.rank, pays(r)))]);
  const order = [...layout.blips].sort((a, b) => (o.keep ? o.keep.has(a.row.slug) - o.keep.has(b.row.slug) : 0) || b.r - a.r);
  return `<svg class="scope" viewBox="0 0 ${W} ${H}" aria-label="${SCOPE_IS}">${each(RINGS, ([d]) => ring('range', CX, CY, ringOf(d)))}${ring('rimline', CX, CY, RIM)}${ring('ticks', CX, CY, RIM + 3)}` +
    each(layout.wedges, (w, i) => line('spoke', CX, CY, ...polar(w.from, RIM)) + rimName(w, i)) + each(order, (b) => blipMark(b, o.keep)) +
    each(ringNames(layout), (n) => `<rect class="plate" x="${f(n.x)}" y="${f(n.y)}" width="${n.w}" height="${n.h}"/><text class="ringname" x="${f(n.x + 17)}" y="${f(n.y + 12)}">${n.t}</text>`) +
    each(plates, (p) => { const ex = clamp(p.b.x, p.x, p.x + p.w), ey = clamp(p.b.y, p.y, p.y + p.h), d = Math.hypot(ex - p.b.x, ey - p.b.y) || 1, k = Math.min(1, p.b.r / d); return line('leader', p.b.x + (ex - p.b.x) * k, p.b.y + (ey - p.b.y) * k, ex, ey); }) +
    each(plates, (p) => `<g class="name ${p.want.cls}" data-row="${p.want.slug}"><rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${p.h}" rx="2"/><text x="${f(p.x + 6)}" y="${f(p.y + 14)}">${esc(p.want.top)}</text><text class="sub" x="${f(p.x + 6)}" y="${f(p.y + 27)}">${p.want.sub}</text></g>`) + '</svg>';
}
function scopeLegend(count) {
  const size = (tvl, t) => { const r = blipRadius({ tvl }), d = Math.ceil(2 * r + 2); return `<svg width="${d}" height="${d}">${ring('size', r + 1, r + 1, r)}</svg>${t}`; };
  return `<p class="legend"><b>Angle</b> sector <b>Distance</b> time with no token <b>Area</b> TVL ${size(1e7, '$10M')} ${size(1e8, '$100M')} <b>Tail</b> 7-day TVL v market</p>` +
    `<p class="legend">${each([['FARM', 'pay $25/h net'], ['THIN', 'beat fees, under $25/h'], ['SKIP', 'lose to fees']], ([v, t]) => `<i class="key ${v}"></i>${v} ${count(v)} ${t} `)}<i class="key watch"></i>watchlist</p>`;
}
