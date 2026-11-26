/* 4 · Criteria 1, 3 and 4, the page. Checked: buildRadar() runs on ../data.js and checkBoard() compares every row with board.json.
   boardView    kpis(), proofBar(), evidence() with both ladders, the ranked table with one row opened into planCard()
   detailView   waterfall() of launchValue() × launchOdds(), nearest traded comps, gantt() and the dated, costed steps
   plannerView  planRoute(): FARM rows that fit a budget of dollars and hours, week by week */
(() => {
const M = window.Radar, IN = window.RADAR_INPUT;
if (!IN || !M) return;
const radar = M.buildRadar(IN.snapshot), { rows, fit, tests, ranges, odds, se, comps, counts } = radar, $ = M.usd;
M.addPlans(rows);
const proof = M.checkBoard(rows, IN.board), listed = rows.filter((r) => r.tier === 'watchlist').length, accounted = radar.ledger.reduce((s, [, k]) => s + k, 0);

// ── state in the URL hash; open: the row shown with its plan ('' = first, '-' = none)
const START = { view: 'board', p: '', open: '', q: '', tier: '', sector: '', chain: '', play: '', verdict: '', tvl: '', sort: 'rank', dir: '1', budget: '25000', hours: '5' };
let ui;
const load = () => { const h = new URLSearchParams(location.hash.slice(1)); ui = {}; for (const k in START) ui[k] = h.get(k) || START[k]; };
function go(patch) {
  Object.assign(ui, patch);
  history.replaceState(null, '', '#' + new URLSearchParams(Object.entries(ui).filter(([k, v]) => v !== START[k])));
  paint();
}

const each = (list, f) => list.map(f).join(''), esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const x = (v) => '×' + v.toFixed(2), pc = (v) => Math.round(v * 100) + '%', plus = (v) => (v < 0 ? '−$' : '+$') + Math.abs(Math.round(v)).toLocaleString('en'), hrs = (m) => (m / 60).toFixed(1) + ' h';
const since = (d) => (d == null ? 'n/a' : d < 365 ? d + ' d' : (d / 365).toFixed(1) + ' y');
const tag = (v) => `<i class="tag ${v}">${v}</i>`, fn = (n) => `<code>${n}()</code>`, mark = (ok) => `<i class="mark ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'}</i>`;
const dayOf = (n) => new Date(Date.parse(radar.asOf) + n * 864e5).toUTCString().slice(5, 11);
const cells = (list, cls = '') => `<section class="strip ${cls}">${each(list, ([b, t, f]) => `<div><b>${b}</b><span>${t}${f ? ' ' + fn(f) : ''}</span></div>`)}</section>`;
const text = (cls, px, y, t) => `<text class="${cls}" x="${px}" y="${y}">${t}</text>`, box = (cls, px, y, w, h) => `<rect class="${cls}" x="${px}" y="${y}" width="${w}" height="${h}"/>`;
const svg = (w, h, inside) => `<svg class="fig" viewBox="0 0 ${w} ${h}" width="${w}">${inside}</svg>`;
const verdicts = (v) => rows.filter((r) => r.plan.verdict === v).length, paying = rows.filter((r) => r.plan.net > 0).length;
const coef = (label) => { const i = odds.names.indexOf(label); return i < 0 ? 'not kept' : `${odds.w[i] < 0 ? '−' : '+'}${Math.abs(odds.w[i]).toFixed(2)} ± ${se.odds[i].toFixed(2)}`; };

// ── filter and sort
const tally = (of) => { const n = {}; rows.forEach((r) => [].concat(of(r)).forEach((v) => { n[v] = (n[v] || 0) + 1; })); return Object.keys(n).sort((a, b) => n[b] - n[a]); };
const FILTERS = {
  tier: (r) => r.tier, sector: (r) => r.sector, chain: (r) => r.chains, play: (r) => r.plan.label, verdict: (r) => r.plan.verdict, tvl: (r) => ['$10M+', '$50M+', '$200M+'].filter((t) => r.tvl >= parseFloat(t.slice(1)) * 1e6) };
const keeps = (r) => `${r.name} ${r.category} ${r.chains}`.toLowerCase().includes(ui.q.toLowerCase()) && Object.keys(FILTERS).every((k) => !ui[k] || [].concat(FILTERS[k](r)).includes(ui[k]));
const keyOf = (r) => ui.sort === 'rank' ? r.rank : ui.sort === 'name' ? r.name.toLowerCase() : ui.sort === 'age' ? -(r.age || 0) : -(ui.sort === 'net' ? r.plan.net : r[ui.sort]);
const shown = () => rows.filter(keeps).sort((a, b) => { const p = keyOf(a), q = keyOf(b); return (p < q ? -1 : p > q ? 1 : a.rank - b.rank) * ui.dir; });
const filterBar = (n) => `<div class="tools"><input data-key="q" placeholder="Search" value="${esc(ui.q)}">${each(Object.keys(FILTERS), (k) => `<select data-key="${k}" class="${ui[k] && 'on'}"><option value="">${k === 'tvl' ? 'TVL' : k[0].toUpperCase() + k.slice(1)} ▾</option>${each(tally(FILTERS[k]), (v) => `<option${v === ui[k] ? ' selected' : ''}>${v}</option>`)}</select>`)}` +
  `${n < rows.length ? '<button data-act="clear">Clear</button>' : ''}<em>${n} of ${rows.length}</em></div>`;

// ── cover: proof, evidence, board
function kpis() {
  const { full, flat } = tests, kept = (l) => `${l.filter((t) => t.kept).length}/${l.length - 1}`;
  return cells([[x(full.each.miss), `blind miss, left out · flat ${x(flat.each.miss)}`, 'valueLadder'], [x(full.later.miss), `blind miss, older → newer · flat ${x(flat.later.miss)}`, 'valueLadder'],
    [`${pc(ranges.each50)} · ${pc(ranges.later50)}`, `in the 50% range, both tests · 80%: ${pc(ranges.each80)} · ${pc(ranges.later80)}`, 'rangeHonesty'],
    [odds.full.ten.toFixed(3), `odds Brier, ten-fold · base ${odds.base.ten.toFixed(3)}`, 'oddsLadder'], [odds.full.walk.toFixed(3), `odds Brier, older → newer · base ${odds.base.walk.toFixed(3)}`, 'oddsLadder'],
    [`${kept(tests.ladder)} · ${kept(odds.ladder)}`, 'terms kept, value · odds'], [verdicts('FARM'), `FARM at $25/h · ${paying} net positive`, 'farmPlan'], [`${listed}/${counts.watchlist}`, 'watchlist on the board', 'buildRadar']], 'kpi');
}
function proofBar() {
  const checks = [[proof.same === proof.of, `${proof.same}/${proof.of} rows equal board.json`, 'checkBoard'], [proof.ranked, `ranks 1–${rows.length}, value never rises`, 'checkBoard'],
    [proof.total === proof.boardTotal, `totals equal, ${$(proof.total)}`, 'checkBoard'], [listed === counts.watchlist, `watchlist ${listed}/${counts.watchlist}`, 'buildRadar'],
    [accounted === counts.protocols, `${accounted}/${counts.protocols} protocols in one group`, 'ledgerOf']];
  return `<section class="proof"><p class="checks">${each(checks, ([ok, t, f]) => `<span>${mark(ok)}${t} ${fn(f)}</span>`)}</p><div class="bar">${each(radar.ledger, ([, k], i) => `<i class="g${i}" style="flex:${k}"></i>`)}</div>` +
    `<p class="keys">${each(radar.ledger, ([g, k], i) => `<span><i class="g${i}"></i>${g} <b>${k}</b></span>`)}</p></section>`;
}
const verdictOf = (t) => t.base ? 'base' : t.kept ? '<b>kept</b>' : 'not kept', is = (on) => on ? '<b>kept</b>' : 'tested, not kept';
const INPUTS = [['TVL', 'curve', 'size'], ['7-day growth', 'growth', 'growth'], ['Time with no token', 'age', 'age'], ['Category', 'sector', 'sector']];
function evidence() {
  const v = tests.ladder, o = odds.ladder, T = fit.terms;
  return `<section class="evidence"><p class="formula">${fn('impliedValue')} = ${fn('launchValue')} × ${fn('launchOdds')}<br><span>launch value = 10^${fit.a.toFixed(2)} × TVL^${fit.b.toFixed(3)}${T.growth ? ' × (1 + 7-day lead)^b' : ''}${T.chains ? ' × chain tilt' : ''} × kinship rule, on ${comps.length} traded tokens; launch odds = logistic(${o.filter((t) => t.kept).map((t) => t.name.slice(2).split(',')[0].toLowerCase()).join(', ')}) on ${odds.n} peers</span></p>` +
    `<h2>Where the snapshot's figures enter <small>each tested on both blind tests</small></h2><table class="lad"><tr><th>Figure</th><th>launch value</th><th>launch odds</th></tr>${each(INPUTS, ([n, a, b]) => `<tr><td>${n}</td><td>${is(T[a])}</td><td>${is(odds.terms[b])}</td></tr>`)}</table>` +
    `<h2>Value terms ${fn('valueLadder')} <small>median miss; kept only if it falls on both</small></h2><table class="lad"><tr><th>Term</th><th>${comps.length} each left out</th><th>${tests.older} older price ${tests.newer} newer</th><th></th></tr>${each(v, (t) => `<tr class="${t.kept ? 'kept' : ''}"><td>${t.name}</td><td>${x(t.each.miss)}</td><td>${x(t.later.miss)}</td><td>${verdictOf(t)}</td></tr>`)}</table>` +
    `<h2>Launch odds ${fn('oddsLadder')} <small>Brier score, lower is better</small></h2><table class="lad"><tr><th>Term</th><th>ten-fold</th><th>${odds.older} older, ${odds.newer} newer</th><th></th></tr>${each(o, (t) => `<tr class="${t.kept ? 'kept' : ''}"><td>${t.name}</td><td>${t.ten.toFixed(4)}</td><td>${t.walk.toFixed(4)}</td><td>${verdictOf(t)}</td></tr>`)}</table>` +
    `<p class="note">Label: token on record (mcap_usd above 0, or a gecko_id or symbol), ${odds.tokens} of ${odds.n} peers. Odds are peers' record, not a forecast.</p>` +
    `<h2>Range honesty ${fn('rangeHonesty')} <small>real caps inside the stated range</small></h2><table class="lad"><tr><th>Range</th><th>${ranges.n} each left out</th><th>${ranges.newer} newer, blind</th><th>should be</th></tr>` +
    `<tr><td>50%: ${x(ranges.q[1])} to ${x(ranges.q[2])}</td><td>${pc(ranges.each50)}</td><td>${pc(ranges.later50)}</td><td>50%</td></tr><tr><td>80%: ${x(ranges.q[0])} to ${x(ranges.q[3])}</td><td>${pc(ranges.each80)}</td><td>${pc(ranges.later80)}</td><td>80%</td></tr></table>` +
    `<h2>Standard errors ${fn('bootstrapSE')} <small>${se.boots} seeded refits</small></h2><p class="note se">size slope b ${fit.b.toFixed(3)} ± ${se.value.b.toFixed(3)}${T.chains ? ` · chain slope ${fit.chains.toFixed(2)} ± ${se.value.chains.toFixed(2)}` : ''}<br>log-odds per doubling of time running ${coef('Time running, per doubling')} · per 10× TVL ${coef('Size, per 10× TVL')} · per 10 points of 7-day lead ${coef('7-day growth vs market')}</p></section>`;
}
const KIN = { own: '', chain: ' · chain-named', shared: ' · shared', token: ' · kin' };
const at = (v) => M.clamp((M.log10(v) - 4) / 5 * 100, 0, 100);
const bar = (r) => `<span class="rng"><i class="r80" style="left:${at(r.low80)}%;width:${at(r.high80) - at(r.low80)}%"></i><i style="left:${at(r.low)}%;width:${at(r.high) - at(r.low)}%"></i><u style="left:${at(r.value)}%"></u></span>`;
const yieldOf = (p) => (p.yieldNeeded * 100).toFixed(1) + '%';
const payOf = (p) => p.net > 0 ? `<b>${plus(p.net)}</b> net, ${plus(p.perHour)}/h` : `pays if deposit yields <b>${yieldOf(p)}</b>`;
const HEADS = [['rank', '#'], ['name', 'Protocol'], ['tvl', 'TVL · 7d vs mkt'], ['age', 'No token'], ['launch', 'Launch × odds'], ['value', 'Implied value'], ['net', 'Farm plan']];
const boardRow = (r, open) => `<tr data-open="${open ? '-' : r.slug}" class="${open ? 'opened' : ''}"><td>${r.rank}</td><td><b data-go="p=${r.slug}">${esc(r.name)}</b><small>${r.tier === 'watchlist' ? '<u></u>' : ''}${esc(r.category)}${KIN[r.kin]}</small></td>` +
  `<td class="r">${$(r.tvl)}<small class="${r.excess < 0 ? 'down' : 'up'}">${r.change7d == null ? 'n/a' : M.signed(r.excess * 100)}</small></td><td class="r">${since(r.age)}</td><td class="r">${$(r.launch)}<small>× ${pc(r.chance)}</small></td>` +
  `<td class="val"><b>${$(r.value)}</b>${bar(r)}<small>${$(r.low)} to ${$(r.high)}</small></td><td>${tag(r.plan.verdict)} ${payOf(r.plan)}<small>${$(r.plan.capital)} · ${$(r.plan.fees)} · ${hrs(r.plan.minutes)} · ${r.plan.label}</small></td></tr>`;
function table(list, inline) {
  const open = inline ? (ui.open === '-' ? null : list.find((r) => r.slug === ui.open) || list[0]) : null;
  return `<table class="board"><thead><tr>${each(HEADS, ([k, t]) => `<th data-sort="${k}">${t}${ui.sort === k ? (ui.dir > 0 ? ' ▾' : ' ▴') : ''}</th>`)}</tr></thead><tbody>` +
    each(list, (r) => boardRow(r, r === open) + (r === open ? `<tr class="inline"><td colspan="7">${planCard(r)}</td></tr>` : '')) + '</tbody></table>';
}
const stepTable = (p) => `<table class="steps"><tr><th>Step</th><th>Dates</th><th>What to do</th><th class="r">Cost</th><th class="r">Time</th></tr>${each(p.steps, (s, i) => `<tr><td><b>${i + 1} ${s.verb}</b></td><td>${dayOf(s.from)}${s.to > s.from ? '–' + dayOf(s.to) : ''}</td><td>${esc(s.what)}</td><td class="r">${s.usd ? $(s.usd) : 'free'}</td><td class="r">${s.min} min</td></tr>`)}` +
  `<tr class="sum"><td><b>Total</b></td><td>${p.hold + 7} days</td><td>${fn('costPlan')}: stated gas per transaction on ${esc(p.chain)}, fees on the ticket</td><td class="r"><b>${$(p.fees)}</b></td><td class="r"><b>${hrs(p.minutes)}</b></td></tr></table>`;
const totals = (p) => cells([[$(p.slice), 'slice at the implied value'], [$(-p.fees), 'gas and fees'], [$(-p.forgone), 'T-bill forgone, 4%/yr'], [plus(p.net), 'net'], [plus(p.perHour), 'net an hour'],
  [p.breakEven ? $(p.breakEven) : yieldOf(p), p.breakEven ? 'break-even ticket' : 'deposit yield to break even']], 'sums');
const planCard = (r) => { const p = r.plan; return `<div class="card"><h3>${tag(p.verdict)} ${esc(r.name)}: ${p.label} on ${esc(p.chain)}, ${$(p.capital)} for ${p.hold} days from ${dayOf(0)} ${fn('farmPlan')}<button data-go="p=${r.slug}">Detail →</button></h3>${stepTable(p)}${totals(p)}</div>`; };
function boardView() {
  const list = shown();
  return `${kpis()}${proofBar()}<div class="stage">${evidence()}<div class="side">${filterBar(list.length)}${table(list, true)}</div></div>`;
}

// ── one protocol
function waterfall(r) {
  const H = 40, all = [['TVL', 1, r.tvl, `snapshot, ${esc(r.category)}`, `${1 + rows.filter((o) => o.tvl > r.tvl).length} of ${rows.length} by TVL`], ...r.steps,
    ['× Launch odds', r.chance, r.value, `${pc(r.chance)}: peers' record, not a forecast`, `launchOdds() on ${odds.n} peers`]];
  const ends = all.slice(1).map((s) => s[2]), lo = M.log10(Math.min(...ends)) - 0.1, hi = M.log10(Math.max(...ends)) + 0.05, px = (v) => 340 + (M.log10(v) - lo) / (hi - lo) * 150, end = all.length * H;
  return svg(600, end + 30, each(all, ([name, k, after, why, from], i) => {
    const y = i * H, a = i > 1 ? px(all[i - 1][2]) : 340, b = i ? px(after) : 340, idle = i > 1 && k === 1;
    return text(idle ? 'nm idle' : 'nm', 0, y + 16, name) + text('why', 150, y + 16, esc(why)) + text('', 0, y + 32, from) + text('val', 600, y + 17, i > 1 ? x(k) : $(after)) +
      (i && !idle ? box(i < 2 ? 'base' : k < 1 ? 'loss' : 'gain', Math.min(a, b), y + 4, Math.max(Math.abs(b - a), 2), 16) + `<line x1="${b}" x2="${b}" y1="${y + 20}" y2="${y + H + 4}"/>` : '');
  }) + box('', 340, end + 2, px(r.value) - 340, 18) + text('nm', 0, end + 16, 'Implied value') + text('why', 150, end + 16, 'impliedValue()') +text('val big', 600, end + 18, $(r.value)));
}
const compsOf = (r) => `<h2>Nearest traded ${r.sector} comps by TVL ${fn('nearestComps')}</h2><table class="lad"><tr><th>Token</th><th>TVL</th><th>Real cap</th><th>Priced blind, left out</th></tr>` +
  each(M.nearestComps(r, comps, 4), (c) => `<tr><td><b>${esc(c.name)}</b></td><td>${$(c.tvl)}</td><td><b>${$(c.mcap)}</b></td><td>${$(c.blind)}</td></tr>`) +
  `<tr class="kept"><td>${esc(r.name)}, launch value</td><td>${$(r.tvl)}</td><td>none on record</td><td>${$(r.launch)}</td></tr></table>`;
/** The plan's days as a Gantt: one bar per step from its first to last day; upkeep as its weekly visits. */
function gantt(p) {
  const px = (d) => 96 + d / (p.hold + 8) * 580, h = p.steps.length * 16 + 16;
  return svg(680, h, each([0, 14, 28, 42, 56, 70, 84].filter((d) => d < p.hold), (d) => `<line x1="${px(d)}" x2="${px(d)}" y1="13" y2="${h}"/>` + text('mid', px(d), 10, dayOf(d))) + each(p.steps, (s, i) => text('nm', 0, i * 16 + 26, `${i + 1} ${s.verb}`) +
    (s.verb === 'Upkeep' ? each(Array.from({ length: p.weeks }, (_, w) => w * 7 + 7), (d) => box('gain', px(d), i * 16 + 16, 7, 11)) : box(s.verb === 'Stop rule' ? 'band' : '', px(s.from), i * 16 + 16, Math.max(7, px(s.to) - px(s.from)), 11))));
}
function detailView(r) {
  const p = r.plan;
  return `<article class="one"><header><button data-go="p=">← Board</button><div><h1>${esc(r.name)}</h1><p>Rank ${r.rank} of ${rows.length} · ${r.tier} · ${esc(r.category)} on ${esc(r.chains.slice(0, 3).join(', '))} · TVL ${$(r.tvl)}, ${r.change7d == null ? 'no 7-day figure' : M.signed(r.change7d) + ' in 7 days'} · no token on record for ${since(r.age)}</p></div>` +
    `<div class="price"><b>${$(r.value)}</b><p>${$(r.launch)} × ${pc(r.chance)} odds · 50% range ${$(r.low)} to ${$(r.high)}</p></div></header>` +
    `<div class="two"><section><h2>How ${$(r.value)} is built ${fn('launchValue')} × ${fn('launchOdds')}</h2>${waterfall(r)}${compsOf(r)}<p class="note">${fn('checkBoard')}: ${proof.same}/${proof.of} rows equal board.json, this one rank ${r.rank} at $${r.value.toLocaleString('en')}. Slice: 10% of the implied value by dollar-days, behind ${Math.round(p.ahead)} days already earned.</p></section>` +
    `<section><h2>${tag(p.verdict)} ${p.label} on ${esc(p.chain)}: ${$(p.capital)} for ${p.hold} days ${fn('farmPlan')}</h2>${gantt(p)}${stepTable(p)}${totals(p)}</section></div></article>`;
}

// ── my budget
function plannerView() {
  const list = shown().filter((r) => r.plan.verdict === (ui.verdict || 'FARM')), route = M.planRoute(list, { capital: +ui.budget, hours: +ui.hours }), { weeks, picks } = route;
  const minutes = (k) => each(weeks, (_, w) => { const c = k.row.plan.calendar[w - k.start]; return c && c.min ? `<td class="on">${Math.round(c.min)}</td>` : '<td></td>'; });
  const total = (name, f, sum) => `<tr class="sum"><td></td><td><b>${name}</b></td>${each(weeks, (w) => `<td>${f(w)}</td>`)}<td>${sum}</td></tr>`;
  const slide = (k, t, min, max, step, show) => `<label>${t} <b>${show}</b><input type="range" data-key="${k}" min="${min}" max="${max}" step="${step}" value="${ui[k]}"></label>`;
  return `<div class="page"><section class="budget"><h2>My budget ${fn('planRoute')}<small>${verdicts('FARM')} rows pay $25/h+; picked by net per share of money and hours</small></h2>${slide('budget', 'Capital', 2500, 200000, 2500, $(+ui.budget))}${slide('hours', 'Hours a week', 1, 12, 0.5, ui.hours + ' h')}</section>` +
    cells([[`${picks.length} of ${list.length}`, 'farms picked'], [$(route.capital), 'capital placed'], [plus(route.net), 'net of all costs'], [plus(route.perHour), `an hour, over ${hrs(route.minutes)}`], [$(route.fees), `gas and fees; T-bill ${$(route.forgone)}`], [pc(route.shareNeeded), 'of slices needed to break even']], 'sums') +
    `<table class="cal"><tr><th></th><th>Minutes by week, from ${dayOf(0)}</th>${each(weeks, (_, w) => `<th>${w % 2 ? '' : dayOf(w * 7)}</th>`)}<th>Net</th></tr>${each(picks, (k, i) => `<tr><td><u>${i + 1}</u></td><td><b data-go="p=${k.row.slug}">${esc(k.row.name)}</b> ${$(k.row.plan.capital)} · ${k.row.plan.label}</td>${minutes(k)}<td><b>${plus(k.row.plan.net)}</b></td></tr>`)}` +
    `${total('Hours a week', (w) => (w.min / 60).toFixed(1), hrs(route.minutes))}</table>${filterBar(list.length)}${table(list, false)}</div>`;
}

const TABS = { board: ['Board', boardView], plan: ['Planner', plannerView] };
const [top, main] = ['#top', '#app'].map((s) => document.querySelector(s));
function paint() {
  const one = rows.find((r) => r.slug === ui.p), key = document.activeElement.dataset.key, badge = (ok, t) => `<span class="badge">${mark(ok)}${t}</span>`;
  top.innerHTML = `<a href="#"><i>◎</i> Token Radar</a><nav>${each(Object.keys(TABS), (k) => `<button data-go="view=${k}" class="${!one && ui.view === k ? 'on' : ''}">${TABS[k][0]}</button>`)}</nav>` +
    `<span>${counts.protocols} protocols · DefiLlama ${radar.asOf} · ${rows.length} ranked, no token on record</span>${badge(listed === counts.watchlist, `watchlist ${listed}/${counts.watchlist}`)}${badge(proof.ok, `checkBoard() ${proof.same}/${proof.of}`)}`;
  main.innerHTML = one ? detailView(one) : (TABS[ui.view] || TABS.board)[1]();
  const again = key && document.querySelector(`[data-key=${key}]`);
  if (again) { again.focus(); if (key === 'q') again.setSelectionRange(99, 99); }
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go],[data-sort],[data-open],[data-act]'), d = el && el.dataset;
  if (!d) return;
  if (d.go) { const [k, v] = d.go.split('='); go(k === 'view' ? { view: v, p: '' } : { [k]: v }); if (k === 'p') scrollTo(0, 0); }
  else if (d.sort) go(ui.sort === d.sort ? { dir: String(-ui.dir) } : { sort: d.sort, dir: '1' });
  else if (d.open) go({ open: d.open });
  else go({ q: '', ...Object.fromEntries(Object.keys(FILTERS).map((k) => [k, ''])) });
});
for (const type of ['input', 'change']) document.addEventListener(type, ({ target: t }) => { if (t.dataset.key && (t.type === 'range') === (type === 'change')) go({ [t.dataset.key]: t.value }); });   // a slider repaints when let go
window.addEventListener('hashchange', () => { load(); paint(); });
load();
paint();
})();
