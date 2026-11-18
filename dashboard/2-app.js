/* Token Radar · page layer. Nothing is priced here: Radar.buildRadar (1-model.js) runs on ../data.js,
   and Radar.checkBoard proves each recomputed row equals the one main.ts wrote to board.json. */
(() => {
'use strict';
const IN = window.RADAR_INPUT, M = window.Radar;
if (!IN || !M) return;

const radar = M.buildRadar(IN.snapshot);
const { rows, fit, tests, ranges: held, comps } = radar;
const money = M.usd;

// ── view state: one flat record mirrored in the URL hash, so a filtered board or a protocol is a link
const START = { view: 'board', p: '', q: '', tier: '', sector: '', play: '', chain: '', verdict: '', tvl: '0', trend: '', sort: 'rank', dir: 'asc', cap: '1000', share: '10', hero: '1' };
const NARROWING = ['q', 'tier', 'sector', 'play', 'chain', 'verdict', 'tvl', 'trend'];
const UP_FIRST = new Set(['rank', 'name', 'age', 'fees']);   // columns that read best smallest-first
let ui = { ...START };

const loadHash = () => {
  const got = new URLSearchParams(location.hash.slice(1));
  ui = {};
  for (const k in START) ui[k] = got.has(k) ? got.get(k) : START[k];
};
const saveHash = () => {
  const out = new URLSearchParams();
  for (const k in START) if (ui[k] !== START[k]) out.set(k, ui[k]);
  const s = out.toString();
  history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
};
const change = (patch) => { Object.assign(ui, patch); saveHash(); paint(); };

// ── small formatters
const esc = (s) => String(s).replace(/[&<>'"]/g, (c) => `&#${c.charCodeAt(0)};`);
const mult = (v) => '×' + v.toFixed(v >= 10 ? 1 : 2);
const move = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}%`;
const share = (v) => Math.round(v * 100) + '%';
const plus = (v) => (v < 0 ? '−' : '+') + money(Math.abs(v));
const since = (d) => (d == null ? 'undated' : d < 365 ? `${d} d` : `${(d / 365).toFixed(1)} y`);
const hrs = (min) => `${(min / 60).toFixed(1)} h`;
const badge = (kind, v) => `<i class="${kind} ${v}">${v}</i>`;
const big = (s) => `<span class="wide">${s}</span>`;
const small = (s) => `<span class="narrow">${s}</span>`;
const code = (name) => `<span class="fn">${name}()</span>`;   // names the model function behind a panel
const chainList = (r, n) => esc(r.chains.slice(0, n).join(', ')) + (r.chains.length > n ? ` +${r.chains.length - n}` : '');
const dropdown = (key, options) => `<select data-key="${key}"${ui[key] !== START[key] ? ' class="on"' : ''}>` +
  options.map(([v, label]) => `<option value="${esc(v)}"${String(v) === ui[key] ? ' selected' : ''}>${esc(label)}</option>`).join('') + '</select>';
const tally = (pick) => {
  const seen = new Map();
  for (const r of rows) for (const v of [].concat(pick(r))) seen.set(v, (seen.get(v) || 0) + 1);
  return [...seen].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([v, n]) => [v, `${v} (${n})`]);
};

// ── the reader's ticket: board.json holds the $1,000 / 10% plans; any other choice re-runs farmPlan
const replan = () => {
  const own = ui.cap !== START.cap || ui.share !== START.share;
  for (const r of rows) r.now = own ? M.farmPlan(r, { capital: +ui.cap, share: +ui.share / 100 }) : r.plan;
};

// ── filtering and ordering
const TREND = { up: (r) => r.excess > 0, down: (r) => r.excess < 0 };
const keeps = (r) => {
  const q = ui.q.trim().toLowerCase();
  const hay = `${r.name} ${r.category} ${r.sector} ${r.chains.join(' ')}`.toLowerCase();
  return (!q || hay.includes(q)) &&
    (!ui.tier || r.tier === ui.tier) &&
    (!ui.sector || r.sector === ui.sector) &&
    (!ui.play || r.now.play === ui.play) &&
    (!ui.chain || r.chains.includes(ui.chain)) &&
    (!ui.verdict || r.now.verdict === ui.verdict) &&
    r.tvl >= +ui.tvl &&
    (!TREND[ui.trend] || TREND[ui.trend](r));
};
const keyOf = (r, col) => {
  if (col === 'name') return r.name.toLowerCase();
  if (col === 'age') return r.age == null ? 1e9 : r.age;
  return col in r.now ? r.now[col] : r[col];   // slice, net, fees, perHour live on the farm plan
};
const visible = () => {
  const sign = ui.dir === 'asc' ? 1 : -1;
  return rows.filter(keeps).sort((a, b) => {
    const x = keyOf(a, ui.sort), y = keyOf(b, ui.sort);
    return x < y ? -sign : x > y ? sign : a.rank - b.rank;
  });
};
const resort = (col) => change(ui.sort === col ? { dir: ui.dir === 'asc' ? 'desc' : 'asc' } : { sort: col, dir: UP_FIRST.has(col) ? 'asc' : 'desc' });

// ── a log-log scatter: grey comparables, a fitted or reference line, blue points on top
function logPlot({ w, h, xr, yr, pts, segs, caption }) {
  const L = 36, B = 16;
  const px = (v) => L + (M.log10(v) - xr[0]) / (xr[1] - xr[0]) * (w - L - 6);
  const py = (v) => h - B - (M.log10(v) - yr[0]) / (yr[1] - yr[0]) * (h - B - 6);
  const label = (e) => '$' + (e >= 9 ? 10 ** (e - 9) + 'B' : e >= 6 ? 10 ** (e - 6) + 'M' : 10 ** (e - 3) + 'k');
  let svg = '';
  for (let e = Math.ceil(yr[0]); e <= yr[1]; e++) {
    const y = py(10 ** e);
    svg += `<line class="grid" x1="${L}" x2="${w}" y1="${y}" y2="${y}"/><text x="${L - 4}" y="${y + 3}" text-anchor="end">${label(e)}</text>`;
  }
  for (let e = Math.ceil(xr[0]); e <= xr[1]; e++) svg += `<text x="${px(10 ** e)}" y="${h - 4}" text-anchor="middle">${label(e)}</text>`;
  for (const [x, y, cls, r = 2] of pts) svg += `<circle class="${cls}" cx="${px(x).toFixed(1)}" cy="${py(y).toFixed(1)}" r="${r}"/>`;
  for (const [x1, y1, x2, y2, cls] of segs) svg += `<line class="${cls}" x1="${px(x1)}" y1="${py(y1)}" x2="${px(x2)}" y2="${py(y2)}"/>`;
  return `<svg class="plot" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(caption)}">${svg}</svg><p class="caption">${caption}</p>`;
}
/** Cap against TVL: the comparables, the size curve through them, and the board (or one protocol) priced on it. */
function sizeCurve(w, h, one) {
  const onCurve = (tvl) => 10 ** (fit.a + fit.b * M.log10(tvl));
  const pts = comps.map((c) => [c.tvl, c.mcap, 'comp']).concat((one ? [one] : rows).map((r) => [r.tvl, r.value, 'board', one ? 4 : 2]));
  return logPlot({ w, h, xr: [6.5, 10.4], yr: [4.5, 10], pts, segs: [[4e6, onCurve(4e6), 2e10, onCurve(2e10), 'fit']],
    caption: `Market cap on TVL. Grey: ${comps.length} tokens that trade. Line: the size curve. Blue: ${one ? esc(one.name) : 'the board'}.` });
}

// ── header: the two proofs a reader can check at a glance
function topBar() {
  const proof = M.checkBoard(rows, IN.board), c = radar.counts;
  const onList = rows.filter((r) => r.tier === 'watchlist').length;
  const pill = (ok, text) => `<span class="pill ${ok ? 'ok' : 'bad'}">${text}</span>`;
  document.querySelector('#top').innerHTML = '<a class="logo" href="#">◎ Token Radar</a>' +
    `<span class="src">DefiLlama snapshot ${radar.asOf} · ${c.protocols} protocols · one model prices board.json and this page</span>` +
    pill(onList === c.watchlist, `Watchlist ${onList}/${c.watchlist}${big(' on the board')}`) +
    pill(proof.ok, `${big('checkBoard(): ')}${proof.same}/${proof.of} rows equal board.json`);
}

// ── KPI strip
function statStrip() {
  const count = { FARM: 0, THIN: 0, SKIP: 0 };
  rows.forEach((r) => count[r.now.verdict]++);
  const full = tests.ladder[3];
  const top = rows.reduce((a, b) => (b.now.perHour > a.now.perHour ? b : a));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const stat = (head, figure, note) => `<div class="stat"><h2>${head}</h2><b>${figure}</b><small>${note}</small></div>`;
  return '<section class="stats">' + [
    stat('Ranked', rows.length, `of ${radar.counts.protocols} read · by implied value`),
    stat('Implied value', money(total), `priced like the ${comps.length} tokens that trade`),
    stat('Value miss, held out', mult(full.miss), `each left out · ${mult(full.split.miss)} older→newer`),
    stat('Range holds', share(held.each / held.n), `${held.each}/${held.n} left out · ${held.split}/${held.newer} newer`),
    stat('Worth farming', `${count.FARM} FARM`, `${count.THIN} THIN · ${count.SKIP} SKIP on ${money(+ui.cap)}`),
    stat('Best per hour', plus(top.now.perHour), `<a href="#p=${top.slug}">${esc(top.name)}</a> · net ${plus(top.now.net)}`),
  ].join('') + '</section>';
}

// ── the three panels above the board
function ledgerPanel() {
  const n = radar.counts.protocols;
  const bar = radar.ledger.map(([, k], i) => `<i class="c${i}" style="width:${(k / n * 100).toFixed(2)}%"></i>`).join('');
  const key = radar.ledger.map(([group, k, why], i) => `<tr><td><i class="c${i}"></i>${group}</td><td>${k}</td><td>${why}</td></tr>`).join('');
  return `<div class="panel"><h2>${n} protocols read, each accounted for ${code('ledgerOf')}</h2><div class="stack">${bar}</div><table class="legend">${key}</table></div>`;
}
function testPanel() {
  const cell = (m) => `${mult(m.miss)} <small>${share(m.within3)}</small>`;
  const steps = tests.ladder.map((s, i) => `<tr${i === 3 ? ' class="hit"' : ''}><td>${s.name}</td><td>${cell(s)}</td><td>${cell(s.split)}</td></tr>`).join('');
  const why = tests.ladder[3].split.miss < tests.ladder[2].split.miss ? '; growth and age stay as they cut that miss' : '';
  return `<div class="panel"><h2>How a launch is priced ${code('impliedValue')}${code('backtest')}</h2>` +
    `<code class="formula">10^${fit.a.toFixed(2)} × TVL^${fit.b.toFixed(3)} × sector × momentum × age × kinship</code>` +
    '<table class="steps"><tr><th>Each step, priced blind: median miss · within 3×</th><th>each left out</th><th>older→newer</th></tr>' + steps +
    `<tr><td>Range: half the blind misses, ${mult(held.young)} if under ${Math.round(M.CONFIG.youngDays / 30)} months</td><td>${held.each}/${held.n} inside</td><td>${held.split}/${held.newer}</td></tr></table>` +
    `<p class="caption">Older→newer: a fit on the ${tests.older} tokens 900+ days on record prices the ${tests.newer} newer${why}.</p></div>`;
}
const lede = () => `<section class="lede">${ledgerPanel()}${testPanel()}<div class="panel">${sizeCurve(250, 150)}</div></section>`;

// ── tabs and the filter bar
function tabBar() {
  const tabs = [['board', 'No token yet', rows.length], ['traded', 'Token trades', radar.tokens.length], ['aside', 'Set aside', radar.aside.length], ['method', 'Method and tests', '']];
  return '<nav class="tabs">' + tabs.map(([v, label, n]) => `<button data-go="view=${v}"${ui.view === v ? ' class="on"' : ''}>${label} <b>${n}</b></button>`).join('') +
    `<span class="knobs wide">Ticket ${dropdown('cap', [[1000, '$1,000'], [5000, '$5,000'], [25000, '$25,000']])} Airdrop to depositors ${dropdown('share', [[5, '5%'], [10, '10%'], [20, '20%']])}</span></nav>`;
}
function toolBar() {
  const set = NARROWING.filter((k) => ui[k] !== START[k]).length;
  return `<div class="tools"><input data-key="q" type="search" placeholder="Search" value="${esc(ui.q)}">` +
    dropdown('tier', [['', 'Any tier'], ['watchlist', 'Watchlist'], ['early', 'Early: below the floor'], ['shared', 'Shared: filed under a parent']]) +
    dropdown('sector', [['', 'Any sector'], ...tally((r) => r.sector)]) +
    dropdown('play', [['', 'Any farm play'], ...Object.entries(M.PLAYS).map(([k, p]) => [k, p.label])]) +
    dropdown('chain', [['', 'Any chain'], ...tally((r) => r.chains)]) +
    dropdown('verdict', [['', 'Any verdict'], ['FARM', 'FARM: beats fees and the T-bill'], ['THIN', 'THIN: beats fees only'], ['SKIP', 'SKIP: fees eat the slice']]) +
    dropdown('tvl', [[0, 'Any TVL'], [1e7, 'TVL $10M+'], [5e7, 'TVL $50M+'], [2e8, 'TVL $200M+']]) +
    dropdown('trend', [['', 'Any 7-day move'], ['up', 'Beat the market'], ['down', 'Lagged the market']]) +
    (set ? `<button data-act="reset">Clear ${set}</button>` : '') + '<button data-act="csv">CSV</button>' +
    `<button data-go="hero=${ui.hero === '1' ? '0' : '1'}">${ui.hero === '1' ? 'Hide' : 'Show'} summary</button><span id="shown"></span></div>`;
}

// ── the ranked board
const HEADS = [
  ['rank', '#', ''], ['name', 'Protocol', ''], ['tvl', 'TVL', 'r wide'], ['excess', '7d TVL', 'r wide'], ['age', 'No token for', 'r wide'],
  ['value', 'Implied' + big(' value'), 'r'], ['slice', 'Airdrop slice', 'r wide'], ['net', 'Net' + big(' of all costs'), 'r'], ['fees', 'Farm plan', ''],
];
const pos = (v) => Math.max(0, Math.min(100, (M.log10(v) - 5.5) / 3 * 100)).toFixed(1);   // $316k..$316M across the range bar
function boardRow(r) {
  const p = r.now;
  const who = `<td><b>${esc(r.name)}</b> ${badge('tier', r.tier)}<small>${esc(r.category)}${big(' · ' + chainList(r, 2))}${small(' · TVL ' + money(r.tvl))}</small></td>`;
  const week = `<td class="r wide">${r.change7d == null ? 'n/a' : move(r.change7d)}<small class="${r.excess >= 0 ? 'up' : 'down'}">${move(r.excess * 100)} vs market</small></td>`;
  const worth = `<td class="r"><b>${money(r.value)}</b><span class="range wide"><i style="left:${pos(r.low)}%;width:${pos(r.high) - pos(r.low)}%"></i><u style="left:${pos(r.value)}%"></u></span></td>`;
  const result = `<td class="r">${badge('verdict', p.verdict)} <b>${plus(p.net)}</b><small>${plus(p.perHour)}/h${big(' · ' + (p.breakEven ? 'pays from ' + money(p.breakEven) : 'no ticket pays'))}</small></td>`;
  const how = `<td>${p.label}${big(' · ' + esc(p.chain))}<small>${small(esc(p.chain) + ' · ')}${money(p.fees)} fees · ${hrs(p.minutes)}${big(` · ${p.hold} d`)}</small></td>`;
  return `<tr data-row="${r.slug}"><td class="rk">${r.rank}</td>${who}<td class="r wide">${money(r.tvl)}</td>${week}<td class="r wide">${since(r.age)}</td>${worth}<td class="r wide">${money(p.slice)}</td>${result}${how}</tr>`;
}
function fillBoard() {
  const list = visible(), arrow = ui.dir === 'asc' ? ' ▲' : ' ▼';
  document.querySelector('#shown').textContent = `${list.length} of ${rows.length} shown`;
  const head = HEADS.map(([col, label, cls]) => `<th class="${cls}" data-col="${col}">${label}${ui.sort === col ? arrow : ''}</th>`).join('');
  const body = list.length ? list.map(boardRow).join('') : '<tr><td colspan="9">No protocol matches these filters.</td></tr>';
  document.querySelector('#list').innerHTML = `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ── one protocol
/** impliedValue's factors multiplied out in order, each next to the snapshot figure that drives it. */
function valueCalc(r) {
  const peers = comps.filter((c) => c.sector === r.sector).length;
  const reason = [
    `${r.sector}: ${peers} traded comps, effect shrunk toward the curve`,
    `${r.change7d == null ? 'no 7-day figure' : '7d ' + move(r.change7d)} against the market's ${move(radar.marketWeek)}`,
    r.age == null ? 'no listing date on record' : `${r.age} days with no token: a slight tilt, newer tokens trade richer`,
    r.tier === 'shared' ? 'filed under a parent: one launch shared with siblings' : r.kin ? `its name stem already carries ${r.kin}: kept only because the watchlist names it` : 'its own launch',
  ];
  let sofar = r.curve;
  const lines = r.factors.map(([factor, k], i) => { sofar *= k; return `<tr><td>${factor}</td><td>${mult(k)}</td><td>${money(sofar)}</td><td>${esc(reason[i])}</td></tr>`; }).join('');
  return `<h2>How ${money(r.value)} is built ${code('impliedValue')}</h2><table class="calc">` +
    `<tr><td>Size curve</td><td></td><td>${money(r.curve)}</td><td>10^${fit.a.toFixed(2)} × ${money(r.tvl)}^${fit.b.toFixed(3)}, fitted on ${comps.length} traded tokens</td></tr>${lines}` +
    `<tr class="hit"><td>Implied value</td><td></td><td>${money(r.value)}</td><td>recomputed here; board.json has $${r.value.toLocaleString('en-US')} at rank ${r.rank}</td></tr>` +
    `<tr><td>Range</td><td>${mult(r.spread)}</td><td>${money(r.low)} – ${money(r.high)}</td><td>half the blind misses of tokens ${r.young ? 'under' : 'over'} ${Math.round(M.CONFIG.youngDays / 30)} months on record; it held for ${held.each}/${held.n} left out</td></tr></table>`;
}
/** farmPlan's eight steps, each with dollars and minutes, then slice − fees − T-bill = net. */
function planCalc(r, p) {
  const steps = p.steps.map(([verb, what, usd, min], i) => `<tr><td>${i + 1}</td><td><b>${verb}.</b> ${esc(what)}</td><td>${usd ? money(usd) : 'none'}</td><td>${min} min</td></tr>`).join('');
  return `<h2>Farm plan: ${p.label} on ${esc(p.chain)} · ${money(p.capital)} for ${p.hold} days ${badge('verdict', p.verdict)} ${code('farmPlan')}</h2>` +
    `<table class="plan"><tr><th>#</th><th>Step</th><th>Cost</th><th>Time</th></tr>${steps}<tr class="hit"><td></td><td>All eight steps over ${p.hold} days</td><td>${money(p.fees)}</td><td>${hrs(p.minutes)}</td></tr></table>` +
    `<p class="bottom">Slice <b>${money(p.slice)}</b> − fees <b>${money(p.fees)}</b> − T-bill forgone <b>${money(p.forgone)}</b> = net <b class="${p.net >= 0 ? 'up' : 'down'}">${plus(p.net)}</b>, ${plus(p.perHour)} an hour. ` +
    `${p.breakEven ? `Pays from a ${money(p.breakEven)} ticket.` : 'No ticket size pays at this value.'}</p>` +
    `<p class="fine">Slice: ${Math.round(p.share * 100)}% of ${money(r.value)} shared by dollar-days. Your ${p.hold} days stand behind ${Math.round(p.ahead)} day-equivalents already earned (half its days with no token, as if TVL grew in a straight line). A launch that only counts balances on the day would pay ${money(p.snapshotSlice)}.</p>`;
}
const detail = (r) => '<article class="one">' +
  `<p class="trail"><button data-go="p=">← Board</button><span>Rank ${r.rank} of ${rows.length} · ${esc(r.category)} · ${chainList(r, 3)}</span></p>` +
  `<header><h1>${esc(r.name)} ${badge('tier', r.tier)}<small>TVL ${money(r.tvl)} · ${r.age == null ? 'no listing date' : r.age + ' days on record'} · DefiLlama records no token as of ${radar.asOf}</small></h1>` +
  `<div class="price"><b>${money(r.value)}</b><small>implied value · ${money(r.low)} to ${money(r.high)}, ${mult(r.spread)} either way</small></div></header>` +
  `<div class="two"><section>${valueCalc(r)}${big(sizeCurve(430, 190, r))}</section><section>${planCalc(r, r.now)}</section></div></article>`;

// ── the other tabs
function tradedTab() {
  const list = [...radar.tokens].sort((a, b) => b.mcap - a.mcap);
  const body = list.map((c) => `<tr><td><b>${esc(c.name)}</b> ${esc(c.symbol)}${c.members > 1 ? ` · ${c.members} listings` : ''}</td><td>${c.sector}</td><td class="r">${money(c.tvl)}</td><td class="r">${money(c.mcap)}</td>` +
    `<td class="r">${mult(c.mcap / c.tvl)}</td><td class="r">${c.blind ? money(c.blind) : ''}</td><td class="r">${c.blind ? mult(Math.max(c.blind / c.mcap, c.mcap / c.blind)) : ''}</td><td>${c.skip || 'comparable'}</td></tr>`).join('');
  return `<p class="intro">${list.length} protocols record a market cap and are never ranked. ${comps.length} are the comparables, each also priced blind by a fit that left it out. ${radar.counts.onRecord} more record a ticker with no cap: neither ranked nor used.</p>` +
    `<table class="grid"><thead><tr><th>Token</th><th>Sector</th><th class="r">Family TVL</th><th class="r">Market cap</th><th class="r">Cap/TVL</th><th class="r">Blind price</th><th class="r">Miss</th><th>Use</th></tr></thead><tbody>${body}</tbody></table>`;
}
function asideTab() {
  const body = radar.aside.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td>${esc(a.category || '')}</td><td class="r">${money(a.tvl)}</td><td>${a.reason}${a.kin ? ` (${esc(a.kin)})` : ''}</td></tr>`).join('');
  return `<p class="intro">${radar.counts.noToken} protocols record no token. ${rows.length} are ranked; these ${radar.aside.length} are set aside: the house's watchlist rule applied below its floor, or a name stem that already carries a token.</p>` +
    `<table class="grid"><thead><tr><th>Protocol</th><th>Category</th><th class="r">TVL</th><th>Set aside as</th></tr></thead><tbody>${body}</tbody></table>`;
}
function methodTab() {
  const C = M.CONFIG;
  const effects = Object.entries(fit.sector).map(([s, e]) => `${s} ${mult(10 ** e)}`).join(', ');
  const fact = (input, says, use) => `<tr><td>${input}</td><td>${says}</td><td>${use}</td></tr>`;
  const blind = logPlot({ w: 430, h: 260, xr: [5, 9.5], yr: [4.5, 10], pts: comps.map((c) => [c.blind, c.mcap, 'comp', 2.5]),
    segs: [[1e5, 1e5, 3e9, 3e9, 'fit'], [1e5, 3e5, 1e9, 3e9, 'edge'], [3e5, 1e5, 3e9, 1e9, 'edge']],
    caption: 'Across: the blind price. Up: the real market cap. Between the dashed lines: within 3×.' });
  return '<div class="split"><section><h2>What is priced</h2><p>A protocol is on the board when DefiLlama records no market cap, ticker or CoinGecko id for it and no rule sets it aside. Its value is what its token would be worth if priced like those that trade.</p>' +
    `<h2>The evidence for each input</h2><table class="facts"><tr><th>Input</th><th>What the ${comps.length} comparables say</th><th>How it is used</th></tr>` +
    fact('TVL', `cap grows as TVL^${fit.b.toFixed(3)}: a dollar of TVL is worth less in a big protocol`, 'the size curve, a Theil-Sen line no outlier can tilt') +
    fact('Sector', effects, `each effect shrunk by ${C.pseudoComps} pseudo-comps`) +
    fact('7-day growth', `the median protocol moved ${move(radar.marketWeek)} that week`, `TVL carried forward by its growth over the market, capped at ±${C.growthCap * 100}%`) +
    fact('Time with no token', `newer tokens price richer in every cohort split; under ${Math.round(C.youngDays / 30)} months on record blind prices miss ${mult(held.young)}, older ${mult(held.seasoned)}`,
      `a slight tilt on price (${mult(C.ageClamp[0])} to ${mult(C.ageClamp[1])}), the width of the range, and the farm slice`) + '</table>' +
    `<h2>Farm maths</h2><p>slice = value × airdrop share × ticket / TVL × hold / (ahead + hold). ahead is half the days it has run with no token, at most ${C.pointsWindow}: TVL is taken to have grown in a straight line. net = slice − fees − the ${C.tbill * 100}% T-bill yield given up. FARM beats both; THIN beats fees only, so it needs the position's own yield; SKIP beats neither.</p></section>` +
    `<section><h2>Blind test: every traded token priced as if it had none</h2>${blind}</section></div>`;
}

// ── CSV of the rows on screen, in the order shown
function downloadCsv() {
  const cols = ['rank', 'slug', 'name', 'tier', 'sector', 'tvl_usd', 'change_7d', 'days_no_token', 'implied_value_usd', 'verdict', 'net_usd', 'fees_usd', 'hours'];
  const lines = visible().map((r) => [r.rank, r.slug, r.name.replace(/,/g, ' '), r.tier, r.sector, r.tvl, r.change7d, r.age, r.value, r.now.verdict, r.now.net.toFixed(2), r.now.fees.toFixed(2), (r.now.minutes / 60).toFixed(1)]);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([[cols, ...lines].join('\n')], { type: 'text/csv' }));
  link.download = `token-radar-${radar.asOf}.csv`;
  link.click();
}

// ── paint the page for the current state
const TABS = { traded: tradedTab, aside: asideTab, method: methodTab };
function paint() {
  replan();
  const one = ui.p && rows.find((r) => r.slug === ui.p);
  const onBoard = ui.view === 'board';
  let html;
  if (one) html = detail(one);
  else html = statStrip() + (onBoard && ui.hero === '1' ? lede() : '') + tabBar() + (onBoard ? toolBar() + '<div id="list"></div>' : (TABS[ui.view] || methodTab)());
  document.querySelector('#app').innerHTML = html;
  if (!one && onBoard) fillBoard();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go],[data-col],[data-row],[data-act]');
  if (!el) return;
  const d = el.dataset;
  if (d.go != null) {
    const [k, v] = d.go.split('=');
    change(k === 'view' ? { view: v, p: '' } : { [k]: v });
  } else if (d.col) resort(d.col);
  else if (d.row) change({ p: d.row });
  else if (d.act === 'csv') downloadCsv();
  else change(Object.fromEntries(NARROWING.map((k) => [k, START[k]])));
});
document.addEventListener('input', (e) => {
  const k = e.target.dataset.key;
  if (!k) return;
  ui[k] = e.target.value;
  saveHash();
  if (k === 'q') fillBoard(); else paint();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.p) change({ p: '' }); });
window.addEventListener('hashchange', () => { loadHash(); paint(); });
loadHash();
topBar();
paint();
})();
