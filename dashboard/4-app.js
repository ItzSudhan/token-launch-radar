/* 4 · THE PAGE: nothing is priced here. buildRadar runs on ../data.js, checkBoard proves every row equals board.json.
   boardView     evidence strip, ledger bar, filters, the ranked table; linked to the scope both ways
   detailView    waterfall() of the value, capStrip() against real caps, gantt() of the plan, the costed steps
   plannerView   my budget: planRoute's farms on the scope, their calendar, cost, hours and net */
(() => {
'use strict';
const M = window.Radar, IN = window.RADAR_INPUT;
if (!IN || !M) return;
const radar = M.buildRadar(IN.snapshot), { rows, fit, tests, ranges, comps } = radar, $ = M.usd;
M.addPlans(rows);
const proof = M.checkBoard(rows, IN.board), layout = M.placeBlips(rows);

// ── state, mirrored in the URL hash: a filtered board, a plan or a protocol is a link
const START = { view: 'board', p: '', q: '', tier: '', sector: '', play: '', chain: '', verdict: '', tvl: '0', sort: 'rank', dir: '1', budget: '25000', hours: '5' };
const FILTERS = ['q', 'tier', 'sector', 'play', 'chain', 'verdict', 'tvl'];
let ui;
const load = () => { const h = new URLSearchParams(location.hash.slice(1)); ui = {}; for (const k in START) ui[k] = h.get(k) || START[k]; };
const go = (patch) => {
  Object.assign(ui, patch);
  history.replaceState(null, '', '#' + new URLSearchParams(Object.entries(ui).filter(([k, v]) => v !== START[k])));
  paint();
};

// ── formats
const { esc } = M, x = (v) => '×' + v.toFixed(2), pc = (v) => Math.round(v * 100) + '%', plus = (v) => (v < 0 ? '' : '+') + $(v), hrs = (m) => (m / 60).toFixed(1) + ' h';
const since = (d) => (d == null ? 'undated' : d < 365 ? d + ' d' : (d / 365).toFixed(1) + ' y');
const tag = (v) => `<i class="tag ${v}">${v}</i>`, fn = (n) => `<code>${n}()</code>`, each = (list, f) => list.map(f).join('');
const dayOf = (n) => new Date(Date.parse(radar.asOf) + n * 864e5).toUTCString().slice(5, 11);
const pick = (key, options) => `<select data-key="${key}"${ui[key] !== START[key] ? ' class="on"' : ''}>${each(options, ([v, t]) => `<option value="${esc(v)}"${String(v) === ui[key] ? ' selected' : ''}>${esc(t)}</option>`)}</select>`;
const tally = (of) => { const n = {}; rows.forEach((r) => [].concat(of(r)).forEach((v) => { n[v] = (n[v] || 0) + 1; })); return Object.keys(n).sort((a, b) => n[b] - n[a] || (a < b ? -1 : 1)).map((v) => [v, `${v} (${n[v]})`]); };
const cells = (list) => `<section class="strip">${each(list, ([b, t]) => `<div><b>${b}</b><span>${t}</span></div>`)}</section>`;

// ── filter and sort
const keeps = (r) => `${r.name} ${r.category} ${r.chains}`.toLowerCase().includes(ui.q.toLowerCase()) && (!ui.tier || r.tier === ui.tier) && (!ui.sector || r.sector === ui.sector) &&
  (!ui.play || r.plan.play === ui.play) && (!ui.chain || r.chains.includes(ui.chain)) && (!ui.verdict || r.plan.verdict === ui.verdict) && r.tvl >= +ui.tvl;
const KEY = { rank: (r) => r.rank, name: (r) => r.name.toLowerCase(), tvl: (r) => -r.tvl, excess: (r) => -r.excess, age: (r) => -(r.age || 0), value: (r) => -r.value, net: (r) => -r.plan.net, perHour: (r) => -r.plan.perHour };
const shown = () => rows.filter(keeps).sort((a, b) => { const p = KEY[ui.sort](a), q = KEY[ui.sort](b); return (p < q ? -1 : p > q ? 1 : a.rank - b.rank) * ui.dir; });
const scopePane = (o, title, note) => {
  const n = (v) => rows.filter((r) => r.plan.verdict === v).length;
  return `<aside class="pane"><h2>${title}</h2><p>${note}</p>${M.drawScope(rows, layout, o)}${M.scopeLegend([`${n('FARM')} pay $25 an hour net`, `${n('THIN')} beat gas and fees`, `${n('SKIP')} do not`])}</aside>`;
};

// ── the board
function evidence() {
  const { full, flat, ladder } = tests, kept = ladder.filter((t) => t.kept).length;
  return cells([[x(full.each.miss), `blind miss, each of ${comps.length} traded tokens left out; flat multiple ${x(flat.each.miss)}`], [x(full.later.miss), `blind miss, older ${tests.older} pricing newer ${tests.newer}; flat ${x(flat.later.miss)}`],
    [`${ranges.each}/${ranges.n}`, `unseen caps inside the 50% range; newer ${ranges.later}/${ranges.newer}`], [`${kept} of ${ladder.length - 1}`, `terms kept by ${fn('keepRule')}, all printed in Method`]]);
}
const ledgerBar = () => `<section class="ledger"><div>${each(radar.ledger, ([, k], i) => `<i class="g${i}" style="flex:${k}"></i>`)}</div><p><b>${radar.counts.protocols} read ${fn('ledgerOf')}</b>${each(radar.ledger, ([g, k, why], i) => `<span title="${why}"><i class="g${i}"></i>${g} <b>${k}</b></span>`)}</p></section>`;
const filterBar = (n) => `<div class="tools"><input data-key="q" placeholder="Search" value="${esc(ui.q)}">` + pick('tier', [['', 'Tier ▾'], ['watchlist', 'Watchlist (40)'], ['early', 'Early: under the floor'], ['shared', 'Shared: has a parent']]) + pick('sector', [['', 'Sector ▾'], ...tally((r) => r.sector)]) +
  pick('chain', [['', 'Chain ▾'], ...tally((r) => r.chains)]) + pick('play', [['', 'Play ▾'], ...Object.entries(M.PLAYS).map(([k, p]) => [k, p.label])]) + pick('verdict', [['', 'Verdict ▾'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']]) + pick('tvl', [[0, 'TVL ▾'], [1e7, '$10M+'], [5e7, '$50M+'], [2e8, '$200M+']]) + `<button data-act="${FILTERS.some((k) => ui[k] !== START[k]) ? 'clear">Clear' : 'csv">CSV'}</button><em>${n}/${rows.length}</em></div>`;
const HEADS = [['rank', '#'], ['name', 'Protocol'], ['tvl', 'TVL'], ['excess', '7d v mkt'], ['age', 'No token'], ['value', 'Implied value'], ['net', 'Farm: net, plan, cost, time']];
const at = (v) => M.clamp((M.log10(v) - 5.6) / 2.8 * 100, 0, 100);
const KIN = { own: '', chain: ' · chain-named', shared: ' · has a parent', token: ' · token kin' };
const boardRow = (r) => `<tr data-row="${r.slug}"><td>${r.rank}</td><td><b>${esc(r.name)}</b><small>${r.tier === 'watchlist' ? '<u title="watchlist"></u>' : ''}${esc(r.category)}${KIN[r.kin]}</small></td><td class="r">${$(r.tvl)}</td><td class="r ${r.excess < 0 ? 'down' : 'up'}">${r.change7d == null ? 'n/a' : M.signed(r.excess * 100)}</td><td class="r">${since(r.age)}</td>` +
  `<td class="val"><b>${$(r.value)}</b><span><i style="left:${at(r.low)}%;width:${at(r.high) - at(r.low)}%"></i><u style="left:${at(r.value)}%"></u></span><small>${$(r.low)} to ${$(r.high)}</small></td><td>${tag(r.plan.verdict)} <b>${plus(r.plan.net)}</b> on ${$(r.plan.capital)}<small>${r.plan.label} · ${$(r.plan.fees)} · ${hrs(r.plan.minutes)}</small></td></tr>`;
const table = (list) => `<table class="board"><thead><tr>${each(HEADS, ([k, t]) => `<th data-sort="${k}">${t}${ui.sort === k ? (ui.dir > 0 ? ' ▾' : ' ▴') : ''}</th>`)}</tr></thead><tbody>${each(list, boardRow) || '<tr><td colspan="7">Nothing matches these filters.</td></tr>'}</tbody></table>`;
function boardView() {
  const list = shown();
  return `<div class="stage">${scopePane({ keep: list.length < rows.length ? new Set(list.map((r) => r.slug)) : null, top: 12, farms: 3 }, `${rows.length} protocols with no token on record`, 'named: top 12 by value, 3 best farms per dollar')}<div class="side">${evidence()}${ledgerBar()}${filterBar(list.length)}${table(list)}</div></div>`;
}

// ── one protocol
/** The value as a waterfall on a log scale: each bar is one step of impliedValue, with its figure and its source. */
function waterfall(r) {
  const W = 560, H = 47, all =[['TVL', 1, r.tvl, `snapshot figure, ${r.category}`, `rank ${1 + rows.filter((o) => o.tvl > r.tvl).length} of ${rows.length} by TVL`], ...r.steps];
  const ends = r.steps.map((s) => s[2]), lo = M.log10(Math.min(...ends)) - 0.12, hi = M.log10(Math.max(...ends)) + 0.05, px = (v) => 330 + (M.log10(v) - lo) / (hi - lo) * 150;
  return `<svg class="fall" viewBox="0 0 ${W} ${all.length * H + 30}">` + each(all, ([name, k, after, why, from], i) => {
    const y = i * H, a = i > 1 ? px(all[i - 1][2]) : 330, b = i ? px(after) : 330;
    return `<text class="nm" y="${y + 18}">${name}</text><text class="why" x="146" y="${y + 18}">${esc(why)}</text><text y="${y + 34}">${esc(from)}</text><text class="fig" x="${W}" y="${y + 19}">${i > 1 ? x(k) : $(after)}</text>` +
      (i ? `<rect class="${i < 2 ? 'base' : k < 1 ? 'loss' : 'gain'}" x="${Math.min(a, b)}" y="${y + 6}" width="${Math.max(Math.abs(b - a), 2)}" height="17"/><line x1="${b}" x2="${b}" y1="${y + 23}" y2="${y + H + 6}"/>` : '');
  }) + `<rect x="330" y="${all.length * H + 4}" width="${px(r.value) - 330}" height="19"/><text class="nm" y="${all.length * H + 19}">Implied value</text><text class="fig big" x="${W}" y="${all.length * H + 20}">${$(r.value)}</text></svg>`;
}
/** The sanity check: this value and its range against the real caps of the sector's traded comps, the nearest three named. */
function capStrip(r) {
  const near = M.nearestComps(r, comps, 3), px = (v) => 8 + (M.log10(v) - 5) / 4.5 * 544;
  return `<h2>Against real caps: ${r.sector} comps that trade ${fn('nearestComps')}</h2><svg class="fall strip" viewBox="0 0 560 54"><rect class="gain band" x="${px(r.low)}" y="6" width="${px(r.high) - px(r.low)}" height="26"/>${each(comps.filter((c) => c.sector === r.sector), (c) => `<circle class="${near.includes(c) ? 'near' : ''}" cx="${px(c.mcap)}" cy="19" r="${near.includes(c) ? 7 : 4}"/>`)}<rect x="${px(r.value) - 1.5}" y="1" width="3" height="36"/>${each([1e6, 1e7, 1e8, 1e9], (v) => `<text x="${px(v)}" y="51" text-anchor="middle">${$(v).replace(/\.0+/, '')}</text>`)}</svg>` +
    `<table class="comps">${each(near, (c) => `<tr><td><b>${esc(c.name)}</b></td><td>TVL ${$(c.tvl)}</td><td>real cap <b>${$(c.mcap)}</b></td><td>priced blind ${$(c.blind)}</td></tr>`)}</table>`;
}
/** The plan on a dated axis: a bar or weekly ticks per step, and the cost paid so far as a line underneath. */
function gantt(p) {
  const W = 640, end = p.hold + 8, px = (d) => 88 + d / end * 410, H = 21, base = p.steps.length * H + 22, paid = Array(end + 1).fill(0);
  const bars = each(p.steps, (s, i) => {
    const y = 18 + i * H, weekly = s.verb === 'Upkeep', box = (d, w, c) => `<rect class="${c}" x="${px(d)}" y="${y + 4}" width="${w}" height="12"/>`;
    if (weekly) for (let w = 1; w <= p.weeks; w++) paid[Math.min(end, w * 7)] += s.usd / p.weeks; else paid[s.from] += s.usd;
    return `<text class="nm" y="${y + 15}">${i + 1} ${s.verb}</text>${weekly ? each(Array(p.weeks).fill(0), (_, w) => box(w * 7 + 7, 8, 'gain')) : box(s.from, Math.max(7, px(s.to) - px(s.from)), s.verb === 'Stop rule' ? 'band' : '')}<text class="fig" x="${W}" y="${y + 15}">${s.usd ? $(s.usd) : 'free'} · ${s.min} min</text>`;
  });
  let sum = 0, path = `M88 ${base + 36}`;
  paid.forEach((v, d) => { path += `H${px(d)}V${base + 36 - (sum += v) / (p.fees || 1) * 28}`; });
  return `<svg class="fall" viewBox="0 0 ${W} ${base + 42}">${each([0, 14, 28, 42, 56, 70, 84].filter((d) => d < p.hold), (d) => `<line x1="${px(d)}" x2="${px(d)}" y1="16" y2="${base + 40}"/><text x="${px(d)}" y="11" text-anchor="middle">${dayOf(d)}</text>`)}${bars}<path d="${path}"/><text class="nm" y="${base + 30}">Cost so far</text><text class="fig" x="${W}" y="${base + 26}">${$(p.fees)} · ${hrs(p.minutes)}</text></svg>`;
}
function detailView(r) {
  const p = r.plan, reach = p.breakEven ? `Pays from a ${$(p.breakEven)} ticket; $25 an hour needs more` : `Beats the T-bill only if the deposit itself yields over ${(p.yieldNeeded * 100).toFixed(1)}% a year`;
  return `<article class="one"><header><button data-go="p=">← Radar</button><div><h1>${esc(r.name)}</h1><p>Rank ${r.rank} of ${rows.length} · ${r.tier} · ${esc(r.category)} on ${esc(r.chains.slice(0, 3).join(', '))} · TVL ${$(r.tvl)} · no token on record for ${since(r.age)}</p></div><div class="price"><b>${$(r.value)}</b><p>${$(r.low)} to ${$(r.high)}: half of blind misses, ${x(r.spread)} either way</p></div></header>` +
    `<div class="two"><section><h2>How ${$(r.value)} is built ${fn('impliedValue')}</h2>${waterfall(r)}${capStrip(r)}</section><section><h2>${p.label} on ${esc(p.chain)}: ${$(p.capital)} for ${p.hold} days ${tag(p.verdict)} ${fn('farmPlan')}</h2>${gantt(p)}<ol>${each(p.steps, (s) => `<li><b>${s.verb}</b> ${esc(s.what)} <b>${s.usd ? $(s.usd) : 'Free'}, ${s.min} min</b></li>`)}</ol>` +
    cells([[$(p.slice), 'slice, if it launches'], [$(-p.fees), 'gas and fees'], [$(-p.forgone), 'T-bill given up'], [plus(p.net), `net, ${plus(p.perHour)} an hour`]]) +
    `<p class="fine">${reach}. Worth it if a launch that pays depositors is likelier than ${p.oddsNeeded > 1 ? 'certain' : pc(p.oddsNeeded)}. Slice: 10% of the implied value by dollar-days, behind ${Math.round(p.ahead)} day-equivalents already earned.</p></section></div></article>`;
}

// ── my budget
function plannerView() {
  const list = shown().filter((r) => r.plan.verdict === (ui.verdict || 'FARM')), route = M.planRoute(list, { capital: +ui.budget, hours: +ui.hours }), weeks = route.weeks;
  const minutes = (k) => each(weeks, (_, w) => { const c = k.row.plan.calendar[w - k.start]; return c && c.min ? `<td class="on">${Math.round(c.min)}</td>` : '<td></td>'; });
  const cal = `<table class="cal"><thead><tr><th></th><th>Minutes by week</th>${each(weeks, (_, w) => `<th>${w % 3 || w > weeks.length - 3 ? '' : dayOf(w * 7)}</th>`)}<th>Net</th></tr></thead><tbody>${each(route.picks, (k, i) => `<tr data-row="${k.row.slug}"><td><u>${i + 1}</u></td><td><b>${esc(k.row.name)}</b> ${$(k.row.plan.capital)}</td>${minutes(k)}<td><b>${plus(k.row.plan.net)}</b></td></tr>`)}` +
    `<tr><td></td><td><b>Hours a week</b></td>${each(weeks, (w) => `<td>${(w.min / 60).toFixed(1)}</td>`)}<td>${hrs(route.minutes)}</td></tr><tr><td></td><td><b>Cost a week</b></td>${each(weeks, (w) => `<td>${w.usd.toFixed(w.usd < 10 ? 1 : 0)}</td>`)}<td>${$(route.fees)}</td></tr></tbody></table>`;
  const slide = (k, t, min, max, step, show) => `<label>${t}<b>${show}</b><input type="range" data-key="${k}" min="${min}" max="${max}" step="${step}" value="${ui[k]}"></label>`;
  return `<div class="stage">${scopePane({ keep: new Set(list.map((r) => r.slug)), picks: route.picks }, `${route.picks.length} farms picked of ${list.length} lit`, `for ${$(+ui.budget)} and ${ui.hours} h a week`)}<div class="side"><section class="budget"><h2>My budget ${fn('planRoute')}</h2>${slide('budget', 'Capital', 2500, 100000, 2500, $(+ui.budget))}${slide('hours', 'Hours a week', 1, 12, 0.5, ui.hours + ' h')}</section>` +
    cells([[plus(route.net), 'net if all launch, after gas, fees and T-bill'], [plus(route.perHour), `an hour, over ${hrs(route.minutes)}`], [$(route.fees), `gas and fees; ${$(route.forgone)} T-bill given up`], [pc(route.shareNeeded), 'of the slices must arrive to break even']]) +
    `${cal}<p class="fine">Most net per share of money and hours first; each starts when its calendar fits. ${$(route.capital)} placed.</p>${filterBar(list.length)}${table(list)}</div></div>`;
}

// ── the other tabs
const plainTable = (heads, body) => `<table class="plain"><tr>${each(heads, (h) => `<th>${h}</th>`)}</tr>${each(body, (r) => `<tr>${each(r, (c) => `<td>${c}</td>`)}</tr>`)}</table>`;
const tradedView = () => `<div class="page"><h2>${radar.tokens.length} with a market cap: never ranked, ${comps.length} are comps</h2>${plainTable(['Token', 'Sector', 'Family TVL', 'Market cap', 'Priced blind', 'Use'], [...radar.tokens].sort((a, b) => b.mcap - a.mcap).map((c) => [`<b>${esc(c.name)}</b> ${esc(c.symbol)}`, c.sector, $(c.tvl), $(c.mcap), c.blind ? $(c.blind) : '', c.skip || 'comp']))}</div>`;
const asideView = () => `<div class="page"><h2>${radar.aside.length} with no token on record, set aside by rule</h2>${plainTable(['Protocol', 'Category', 'TVL', 'Set aside as'], radar.aside.map((a) => [esc(a.name), esc(a.category || ''), $(a.tvl), a.reason]))}</div>`;
const methodView = () => `<div class="page"><h2>The ladder ${fn('backtest')}</h2><p>Every traded token priced as if it had none: each left out, and the ${tests.older} with 900+ days on record pricing the ${tests.newer} newer. A term stays if the average miss falls in both tests and neither typical miss grows by a tenth. Growth and time with no token move a value little because the traded tokens say so.</p>${plainTable(['Term, added in order', 'Left out: typical', 'average', 'within 3×', 'Older→newer: typical', 'average', 'within 3×', ''], tests.ladder.map((t) => [t.name, ...[t.each, t.later].flatMap((s) => [x(s.miss), x(s.mean), pc(s.within3)]), t.base ? 'baseline' : t.kept ? '<b>kept</b>' : 'tested, not kept']))}` +
  `<h2>Sector shrinkage ${fn('shrinkSweep')}</h2><p>Average miss by pseudo-comps added to each sector. At ${M.CONFIG.shrink}: ${Object.keys(fit.sector).map((s) => `${s} ${x(10 ** fit.sector[s])} on ${fit.count[s]}`).join(', ')}.</p>${plainTable(['Pseudo-comps', ...tests.shrinkSweep.map((s) => s[0])], [1, 2].map((k) => [k < 2 ? 'Left out' : 'Older→newer', ...tests.shrinkSweep.map((s) => x(s[k]))]))}</div>`;

// ── paint
const TABS = { board: ['Radar', boardView], plan: ['Planner', plannerView], traded: ['Token trades', tradedView], aside: ['Set aside', asideView], method: ['Method', methodView] };
const byId = (id) => document.getElementById(id);
function paint() {
  const one = rows.find((r) => r.slug === ui.p), listed = rows.filter((r) => r.tier === 'watchlist').length, key = document.activeElement.dataset.key;
  const badge = (ok, t) => `<span class="badge ${ok}">${t}</span>`;
  byId('top').innerHTML = `<a href="#"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5"/><circle cx="12" cy="12" r="5.5"/><path d="M12 12L19.5 4.5"/></svg>Token Radar</a><nav>${each(Object.keys(TABS), (k) => `<button data-go="view=${k}"${!one && ui.view === k ? ' class="on"' : ''}>${TABS[k][0]}</button>`)}</nav><span>DefiLlama ${radar.asOf}</span>${badge(listed === radar.counts.watchlist, `Watchlist ${listed}/${radar.counts.watchlist}`)}${badge(proof.ok, `checkBoard() ${proof.same}/${proof.of} = board.json`)}`;
  byId('app').innerHTML = one ? detailView(one) : (TABS[ui.view] || TABS.board)[1]();
  const again = key && document.querySelector(`[data-key=${key}]`);
  if (again) { again.focus(); if (key === 'q') again.setSelectionRange(99, 99); }
}
function csv() {
  const body = shown().map(({ rank, slug, sector, tvl, change7d, age, value, plan: p }) => [rank, slug, sector, tvl, change7d, age, value, p.verdict, p.capital, p.net.toFixed(2), p.fees.toFixed(2)].join()), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([['rank,slug,sector,tvl_usd,change_7d,days_no_token,implied_value_usd,verdict,ticket_usd,net_usd,fees_usd', ...body].join('\n')]));
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
  else go(Object.fromEntries(FILTERS.map((k) => [k, START[k]])));
});
// a slider repaints when let go, so a drag is never cut short
for (const type of ['input', 'change']) document.addEventListener(type, ({ target: t }) => { if (t.dataset.key && (t.type === 'range') === (type === 'change')) go({ [t.dataset.key]: t.value }); });
document.addEventListener('mouseover', (e) => {   // a row lights its blip, a blip its row
  const el = e.target.closest('[data-row]');
  document.querySelectorAll('[data-row]').forEach((n) => n.classList.toggle('hot', !!el && n.dataset.row === el.dataset.row));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') go({ p: '' }); });
window.addEventListener('hashchange', () => { load(); paint(); });
load();
paint();
})();
