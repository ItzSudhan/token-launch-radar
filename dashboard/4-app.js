/* 4 · THE PAGE: nothing is priced here. buildRadar runs on ../data.js, checkBoard proves every row equals board.json.
   boardView    evidence strip, ledger bar, filters, ranked table; linked to the scope both ways
   detailView   waterfall() of the value, capStrip() against real caps, gantt() of the dated plan, costed steps
   plannerView  planRoute's farms on the scope, their calendar, cost, hours and net */
(() => {
const M = window.Radar, IN = window.RADAR_INPUT;
if (!IN || !M) return;
const radar = M.buildRadar(IN.snapshot), { rows, fit, tests, ranges, comps, counts } = radar, $ = usd;
M.addPlans(rows);
const proof = M.checkBoard(rows, IN.board), layout = placeBlips(rows);

// ── state, mirrored in the URL hash, so every view is a link
const START = { view: 'board', p: '', q: '', tier: '', sector: '', chain: '', play: '', verdict: '', tvl: '', sort: 'rank', dir: '1', budget: '25000', hours: '5' };
let ui;
const load = () => { const h = new URLSearchParams(location.hash.slice(1)); ui = {}; for (const k in START) ui[k] = h.get(k) || START[k]; };
function go(patch) {
  Object.assign(ui, patch);
  history.replaceState(null, '', '#' + new URLSearchParams(Object.entries(ui).filter(([k, v]) => v !== START[k])));
  paint();
}

// ── formats
const x = (v) => '×' + v.toFixed(2), pc = (v) => Math.round(v * 100) + '%', plus = (v) => (v < 0 ? '−$' : '+$') + Math.abs(Math.round(v)).toLocaleString('en'), hrs = (m) => (m / 60).toFixed(1) + ' h';
const since = (d) => (d == null ? 'undated' : d < 365 ? d + ' d' : (d / 365).toFixed(1) + ' y');
const tag = (v) => `<i class="tag ${v}">${v}</i>`, fn = (n) => `<code>${n}()</code>`;
const dayOf = (n) => new Date(Date.parse(radar.asOf) + n * 864e5).toUTCString().slice(5, 11);
const cells = (list) => `<section class="strip">${each(list, ([b, t]) => `<div><b>${b}</b><span>${t}</span></div>`)}</section>`;
const text = (cls, px, y, t) => `<text class="${cls}" x="${px}" y="${y}">${t}</text>`, box = (cls, px, y, w, h) => `<rect class="${cls}" x="${px}" y="${y}" width="${w}" height="${h}"/>`;
const svg = (w, h, inside) => `<svg class="fall" viewBox="0 0 ${w} ${h}">${inside}</svg>`;

// ── filter and sort
const tally = (of) => { const n = {}; rows.forEach((r) => [].concat(of(r)).forEach((v) => { n[v] = (n[v] || 0) + 1; })); return Object.keys(n).sort((a, b) => n[b] - n[a]).map((v) => [v, `${v} (${n[v]})`]); };
const FILTERS = {
  tier: (r) => r.tier, sector: (r) => r.sector, chain: (r) => r.chains, play: (r) => r.plan.label, verdict: (r) => r.plan.verdict, tvl: (r) => ['$10M+', '$50M+', '$200M+'].filter((t) => r.tvl >= parseFloat(t.slice(1)) * 1e6) };
const keeps = (r) => `${r.name} ${r.category} ${r.chains}`.toLowerCase().includes(ui.q.toLowerCase()) && Object.keys(FILTERS).every((k) => !ui[k] || [].concat(FILTERS[k](r)).includes(ui[k]));
const HEADS = [['rank', '#'], ['name', 'Protocol'], ['tvl', 'TVL'], ['excess', '7d v mkt'], ['age', 'No token'], ['value', 'Implied value'], ['net', 'Farm: net, plan, cost, time']];
const keyOf = (r) => ui.sort === 'rank' ? r.rank : ui.sort === 'name' ? r.name.toLowerCase() : -(ui.sort === 'net' ? r.plan.net : r[ui.sort]);
const shown = () => rows.filter(keeps).sort((a, b) => { const p = keyOf(a), q = keyOf(b); return (p < q ? -1 : p > q ? 1 : a.rank - b.rank) * ui.dir; });
const filterBar = (n) => `<div class="tools"><input data-key="q" placeholder="Search" value="${esc(ui.q)}">${each(Object.keys(FILTERS), (k) => `<select data-key="${k}" class="${ui[k] && 'on'}"><option value="">${k === 'tvl' ? 'TVL' : k[0].toUpperCase() + k.slice(1)} ▾</option>${each(tally(FILTERS[k]), ([v, t]) => `<option value="${v}"${v === ui[k] ? ' selected' : ''}>${t}</option>`)}</select>`)}` +
  `${n < rows.length ? '<button data-act="clear">Clear</button>' : ''}<button data-act="csv">CSV</button><em>${n}/${rows.length}</em></div>`;
function scopePane(o, title, note) {
  const n = (v) => rows.filter((r) => r.plan.verdict === v).length;
  return `<aside class="pane"><h2>${title}</h2><p>${note}</p>${drawScope(rows, layout, o)}${scopeLegend(n)}</aside>`;
}

// ── the board
function evidence() {
  const { full, flat, ladder } = tests;
  return cells([[x(full.each.miss), `blind miss, each of ${comps.length} traded tokens left out; flat multiple ${x(flat.each.miss)}`], [x(full.later.miss), `older ${tests.older} pricing newer ${tests.newer}; flat ${x(flat.later.miss)}`],
    [`${ranges.each}/${ranges.n}`, `unseen caps inside the 50% range; newer ${ranges.later}/${ranges.newer}`], [`${ladder.filter((t) => t.kept).length} of ${ladder.length - 1}`, `terms kept by ${fn('keepRule')}, all printed in Method`]]) +
    `<p class="rule">${fn('impliedValue')} = <b>10^${fit.a.toFixed(2)} × TVL^${fit.b.toFixed(3)}</b> × sector × 7-day growth × time with no token × chains × kin</p>`;
}
const ledgerBar = () => `<section class="ledger"><div>${each(radar.ledger, ([, k], i) => `<i class="g${i}" style="flex:${k}"></i>`)}</div><p><b>${counts.protocols} read ${fn('ledgerOf')}</b>${each(radar.ledger, ([g, k, why], i) => `<span title="${why}"><i class="g${i}"></i>${g} <b>${k}</b></span>`)}</p></section>`;
const at =(v) => M.clamp((M.log10(v) - 5.6) / 2.8 * 100, 0, 100), KIN = { own: '', chain: ' · chain-named', shared: ' · has a parent', token: ' · token kin' };
const yieldOf = (p) => (p.yieldNeeded * 100).toFixed(1) + '%';
const payOf =(p) => p.verdict === 'THIN' && p.net < 0 ? `if it yields <b>${yieldOf(p)}</b>` : `<b>${plus(p.net)}</b> on ${$(p.capital).replace(',000', 'k')}`;
const boardRow =(r) => `<tr data-row="${r.slug}"><td>${r.rank}</td><td><b>${esc(r.name)}</b><small>${r.tier === 'watchlist' ? '<u></u>' : ''}${esc(r.category)}${KIN[r.kin]}</small></td><td class="r">${$(r.tvl)}</td><td class="r ${r.excess < 0 ? 'down' : 'up'}">${r.change7d == null ? 'n/a' : M.signed(r.excess * 100)}</td><td class="r">${since(r.age)}</td>` +
  `<td class="val"><b>${$(r.value)}</b><span><i style="left:${at(r.low)}%;width:${at(r.high) - at(r.low)}%"></i><u style="left:${at(r.value)}%"></u></span><small>${$(r.low)} to ${$(r.high)}</small></td><td>${tag(r.plan.verdict)} ${payOf(r.plan)}<small>${r.plan.label} · ${$(r.plan.fees)} · ${hrs(r.plan.minutes)}</small></td></tr>`;
const table = (list) => `<table class="board"><thead><tr>${each(HEADS, ([k, t]) => `<th data-sort="${k}">${t}${ui.sort === k ? (ui.dir > 0 ? ' ▾' : ' ▴') : ''}</th>`)}</tr></thead><tbody>${each(list, boardRow)}</tbody></table>`;
function boardView() {
  const list = shown();
  return `<div class="stage">${scopePane({ keep: list.length < rows.length ? new Set(list.map((r) => r.slug)) : null, top: 12, farms: 3 }, `${rows.length} protocols with no token on record`, 'named: top 12 by value, 3 best farms per dollar')}<div class="side">${evidence()}${ledgerBar()}${filterBar(list.length)}${table(list)}</div></div>`;
}

// ── one protocol
function waterfall(r) {
  const H = 47, all = [['TVL', 1, r.tvl, `snapshot figure, ${r.category}`, `rank ${1 + rows.filter((o) => o.tvl > r.tvl).length} of ${rows.length} by TVL`], ...r.steps], end = all.length * H;
  const ends = r.steps.map((s) => s[2]), lo = M.log10(Math.min(...ends)) - 0.12, hi = M.log10(Math.max(...ends)) + 0.05, px = (v) => 330 + (M.log10(v) - lo) / (hi - lo) * 150;
  return svg(560, end + 30, each(all, ([name, k, after, why, from], i) => {
    const y = i * H, a = i > 1 ? px(all[i - 1][2]) : 330, b = i ? px(after) : 330;
    return text('nm', 0, y + 18, name) + text('why', 146, y + 18, esc(why)) + text('', 0, y + 35, esc(from)) + text('fig', 560, y + 19, i > 1 ? x(k) : $(after)) +
      (i ? box(i < 2 ? 'base' : k < 1 ? 'loss' : 'gain', Math.min(a, b), y + 6, Math.max(Math.abs(b - a), 2), 17) + `<line x1="${b}" x2="${b}" y1="${y + 23}" y2="${y + H + 6}"/>` : '');
  }) + box('', 330, end + 4, px(r.value) - 330, 19) + text('nm', 0, end + 19, 'Implied value') + text('fig big', 560, end + 20, $(r.value)));
}
function capStrip(r) {
  const near = M.nearestComps(r, comps, 3), px = (v) => 8 + (M.log10(v) - 5) / 4.5 * 544;
  return `<h2>Against the real caps of ${r.sector} comps ${fn('nearestComps')}</h2>` + svg(560, 54, box('band', px(r.low), 6, px(r.high) - px(r.low), 26) + each(comps.filter((c) => c.sector === r.sector), (c) => `<circle class="${near.includes(c) ? 'near' : ''}" cx="${px(c.mcap)}" cy="19" r="${near.includes(c) ? 7 : 4}"/>`) + box('', px(r.value) - 1.5, 1, 3, 36) + each([1e6, 1e7, 1e8, 1e9], (v) => text('mid', px(v), 51, $(v).replace(/\.0+/, '')))) +
    `<table>${each(near, (c) => `<tr><td><b>${esc(c.name)}</b></td><td>TVL ${$(c.tvl)}</td><td>real cap <b>${$(c.mcap)}</b></td><td>priced blind ${$(c.blind)}</td></tr>`)}</table>`;
}
function gantt(p) {
  const end = p.hold + 8, px = (d) => 88 + d / end * 410, base = p.steps.length * 21 + 22, paid = Array(end + 1).fill(0);
  const bars = each(p.steps, (s, i) => {
    const y = 18 + i * 21, weekly = s.verb === 'Upkeep', weeks = Array.from({ length: p.weeks }, (_, w) => w * 7 + 7);
    if (weekly) weeks.forEach((d) => { paid[Math.min(end, d)] += s.usd / p.weeks; }); else paid[s.from] += s.usd;
    return text('nm', 0, y + 15, `${i + 1} ${s.verb}`) + (weekly ? each(weeks, (d) => box('gain', px(d), y + 4, 8, 12)) : box(s.verb === 'Stop rule' ? 'band' : '', px(s.from), y + 4, Math.max(7, px(s.to) - px(s.from)), 12)) + text('fig', 640, y + 15, `${s.usd ? $(s.usd) : 'free'} · ${s.min} min`);
  });
  let sum = 0, path = `M88 ${base + 36}`;
  paid.forEach((v, d) => { path += `H${px(d)}V${base + 36 - (sum += v) / (p.fees || 1) * 28}`; });
  return svg(640, base + 42, each([0, 14, 28, 42, 56, 70, 84].filter((d) => d < p.hold), (d) => `<line x1="${px(d)}" x2="${px(d)}" y1="16" y2="${base + 40}"/>` + text('mid', px(d), 11, dayOf(d))) + `${bars}<path d="${path}"/>` + text('nm', 0, base + 30, 'Cost so far') + text('fig', 640, base + 26, `${$(p.fees)} · ${hrs(p.minutes)}`));
}
function detailView(r) {
  const p = r.plan, reach = p.breakEven ? `Breaks even at a ${$(p.breakEven)} ticket` : `Beats the T-bill only if the deposit yields over ${yieldOf(p)} a year`;
  return `<article class="one"><header><button data-go="p=">←</button><div><h1>${esc(r.name)}</h1><p>Rank ${r.rank} of ${rows.length} · ${r.tier} · ${esc(r.category)} on ${esc(r.chains.slice(0, 3).join(', '))} · TVL ${$(r.tvl)} · no token on record for ${since(r.age)}</p></div><div class="price"><b>${$(r.value)}</b><p>${$(r.low)} to ${$(r.high)}: half of blind misses</p></div></header>` +
    `<div class="two"><section><h2>How ${$(r.value)} is built ${fn('impliedValue')}</h2>${waterfall(r)}${capStrip(r)}</section><section><h2>${p.label} on ${esc(p.chain)}: ${$(p.capital)} for ${p.hold} days ${tag(p.verdict)} ${fn('farmPlan')}</h2>${gantt(p)}<ol>${each(p.steps, (s) => `<li><b>${s.verb}</b> ${esc(s.what)} <b>${s.usd ? $(s.usd) : 'Free'}, ${s.min} min</b></li>`)}</ol>` +
    cells([[$(p.slice), 'slice, if it launches'], [$(-p.fees), 'gas and fees'], [$(-p.forgone), 'T-bill given up'], [plus(p.net), `net, ${plus(p.perHour)} an hour`]]) +
    `<p class="fine">${reach}. Worth it if a launch that pays depositors is likelier than ${p.oddsNeeded > 1 ? 'certain' : pc(p.oddsNeeded)}. Slice: 10% of the value by dollar-days, behind ${Math.round(p.ahead)} days already earned.</p></section></div></article>`;
}

// ── my budget
function plannerView() {
  const list = shown().filter((r) => r.plan.verdict === (ui.verdict || 'FARM')), route = M.planRoute(list, { capital: +ui.budget, hours: +ui.hours }), { weeks, picks } = route;
  const minutes = (k) => each(weeks, (_, w) => { const c = k.row.plan.calendar[w - k.start]; return c && c.min ? `<td class="on">${Math.round(c.min)}</td>` : '<td></td>'; });
  const total = (name, f, sum) => `<tr><td></td><td><b>${name}</b></td>${each(weeks, (w) => `<td>${f(w)}</td>`)}<td>${sum}</td></tr>`;
  const slide = (k, t, min, max, step, show) => `<label>${t}<b>${show}</b><input type="range" data-key="${k}" min="${min}" max="${max}" step="${step}" value="${ui[k]}"></label>`;
  return `<div class="stage">${scopePane({ keep: new Set(list.map((r) => r.slug)), picks }, `${picks.length} farms picked of ${list.length} lit`, `${$(route.capital)} placed, up to ${ui.hours} h a week`)}<div class="side"><section class="budget"><h2>My budget ${fn('planRoute')}</h2>${slide('budget', 'Capital', 2500, 100000, 2500, $(+ui.budget))}${slide('hours', 'Hours a week', 1, 12, 0.5, ui.hours + ' h')}</section>` +
    cells([[plus(route.net), 'net if all launch, after gas, fees and T-bill'], [plus(route.perHour), `an hour, over ${hrs(route.minutes)}`], [$(route.fees), `gas and fees; ${$(route.forgone)} T-bill given up`], [pc(route.shareNeeded), 'of the slices must arrive to break even']]) +
    `<table class="cal"><tr><th></th><th>Minutes by week</th>${each(weeks, (_, w) => `<th>${w % 3 || w > weeks.length - 3 ? '' : dayOf(w * 7)}</th>`)}<th>Net</th></tr>${each(picks, (k, i) => `<tr data-row="${k.row.slug}"><td><u>${i + 1}</u></td><td><b>${esc(k.row.name)}</b> ${$(k.row.plan.capital)}</td>${minutes(k)}<td><b>${plus(k.row.plan.net)}</b></td></tr>`)}` +
    `${total('Hours a week', (w) => (w.min / 60).toFixed(1), hrs(route.minutes))}${total('Dollars a week', (w) => w.usd.toFixed(w.usd < 10 ? 1 : 0), $(route.fees))}</table>${filterBar(list.length)}${table(list)}</div></div>`;
}

// ── the other tabs
const plain = (title, heads, body) => `<h2>${title}</h2><table class="plain"><tr>${each(heads, (h) => `<th>${h}</th>`)}</tr>${each(body, (r) => `<tr>${each(r, (c) => `<td>${c}</td>`)}</tr>`)}</table>`;
const page = (s) => `<div class="page">${s}</div>`;
const tradedView = () => page(plain(`${radar.tokens.length} never ranked, ${comps.length} are comps`,['Token', 'Sector', 'Family TVL', 'Market cap', 'Priced blind', 'Use'], [...radar.tokens].sort((a, b) => b.mcap - a.mcap).map((c) => [esc(c.name), c.sector, $(c.tvl), $(c.mcap), c.blind ? $(c.blind) : '', c.skip || 'comp'])));
const asideView = () => page(plain(`${radar.aside.length} set aside by rule`,['Protocol', 'TVL', 'Set aside as'], radar.aside.map((a) => [esc(a.name), $(a.tvl), a.reason])));
const methodView = () => page(`<p>Every traded token priced blind: each left out, and the ${tests.older} with 900+ days on record pricing the ${tests.newer} newer. A term stays if the average miss falls in both and neither typical miss grows by a tenth. Growth and time move a value little, as the traded tokens say. ${Object.keys(fit.sector).map((s) => `${s} ${x(10 ** fit.sector[s])} on ${fit.count[s]} comps`).join(', ')}.</p>` +
  plain(`The ladder ${fn('backtest')}`, ['Term, added in order', 'Left out: typical', 'average', 'within 3×', 'Older→newer: typical', 'average', 'within 3×', ''], tests.ladder.map((t) => [t.name, ...[t.each, t.later].flatMap((s) => [x(s.miss), x(s.mean), pc(s.within3)]), t.base ? 'base' : t.kept ? '<b>kept</b>' : 'tested, not kept'])));

// ── paint
const TABS = { board: ['Radar', boardView], plan: ['Planner', plannerView], traded: ['Token trades', tradedView], aside: ['Set aside', asideView], method: ['Method', methodView] };
const [top, main] = ['#top', '#app'].map((s) => document.querySelector(s));
function paint() {
  const one = rows.find((r) => r.slug === ui.p), listed = rows.filter((r) => r.tier === 'watchlist').length, key = document.activeElement.dataset.key, badge = (ok, t) => `<span class="badge ${ok}">${t}</span>`;
  top.innerHTML = `<a href="#"><i>◎</i> Token Radar</a><nav>${each(Object.keys(TABS), (k) => `<button data-go="view=${k}" class="${!one && ui.view === k && 'on'}">${TABS[k][0]}</button>`)}</nav><span>DefiLlama ${radar.asOf}</span>${badge(listed === counts.watchlist, `Watchlist ${listed}/${counts.watchlist}`)}${badge(proof.ok, `checkBoard() ${proof.same}/${proof.of} = board.json`)}`;
  main.innerHTML = one ? detailView(one) : (TABS[ui.view] || TABS.board)[1]();
  const again = key && document.querySelector(`[data-key=${key}]`);
  if (again) { again.focus(); if (key === 'q') again.setSelectionRange(99, 99); }
}
function csv() {
  const a = document.createElement('a'), body = shown().map(({ rank, slug, tvl, change7d, age, value, plan: p }) => [rank, slug, tvl, change7d, age, value, p.verdict, p.capital, p.net, p.fees].join());
  a.href = URL.createObjectURL(new Blob([['rank,slug,tvl,change_7d,days_no_token,implied_value,verdict,ticket,net,fees', ...body].join('\n')]));
  a.download = 'token-radar.csv';
  a.click();
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go],[data-sort],[data-row],[data-act]'), d = el && el.dataset;
  if (!d) return;
  if (d.go) { const [k, v] = d.go.split('='); go(k === 'view' ? { view: v, p: '' } : { [k]: v }); }
  else if (d.sort) go(ui.sort === d.sort ? { dir: String(-ui.dir) } : { sort: d.sort, dir: '1' });
  else if (d.row) { go({ p: d.row }); scrollTo(0, 0); }
  else if (d.act === 'csv') csv();
  else go({ q: '', ...Object.fromEntries(Object.keys(FILTERS).map((k) => [k, ''])) });
});
for (const type of ['input', 'change']) document.addEventListener(type, ({ target: t }) => { if (t.dataset.key && (t.type === 'range') === (type === 'change')) go({ [t.dataset.key]: t.value }); });   // a slider repaints when let go
document.addEventListener('mouseover', (e) => {   // row and blip light together
  const el = e.target.closest('[data-row]');
  for (const n of document.querySelectorAll('[data-row]')) n.classList.toggle('hot', !!el && n.dataset.row === el.dataset.row);
});
window.addEventListener('hashchange', () => { load(); paint(); });
load();
paint();
})();
