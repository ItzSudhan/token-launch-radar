/* Token Radar, the page. It prices nothing: Radar.buildRadar (1-model.js) recomputes the board from ../data.js; Radar.checkBoard matches it to board.json. */
(function () {
'use strict';
// view state lives in the URL hash, so every filter, sort and protocol is a link
var input = window.RADAR_INPUT, R = window.Radar;
if (!input || !R) return;
var radar = R.buildRadar(input.snapshot), rows = radar.rows, fit = radar.fit, tests = radar.tests, rng = radar.ranges, usd = R.usd,
  DEFAULTS = { view: 'board', p: '', q: '', tier: '', sector: '', play: '', chain: '', verdict: '', tvl: '0', trend: '', sort: 'rank', dir: 'asc', cap: '1000', share: '10', hero: '1' },
  FILTERS = ['q', 'tier', 'sector', 'play', 'chain', 'verdict', 'tvl', 'trend'], state = {},
  $ = function (s) { return document.querySelector(s); };
/** Every row's farm plan at the reader's ticket and airdrop share (board.json carries the $1,000, 10% one). */
function planAtReaderTicket() {
  var custom = state.cap !== DEFAULTS.cap || state.share !== DEFAULTS.share;
  rows.forEach(function (r) { r.now = custom ? R.farmPlan(r, { capital: +state.cap, share: +state.share / 100 }) : r.plan; });
}
/** Eight filters: search, tier, sector, farm play, chain, verdict, minimum TVL and the week against the market. */
function applyFilters(list) {
  var q = state.q.trim().toLowerCase();
  return list.filter(function (r) {
    return (!q || (r.name + ' ' + r.category + ' ' + r.sector + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) >= 0) &&
      (!state.tier || r.tier === state.tier) && (!state.sector || r.sector === state.sector) &&
      (!state.play || r.now.play === state.play) && (!state.chain || r.chains.indexOf(state.chain) >= 0) &&
      (!state.verdict || r.now.verdict === state.verdict) && r.tvl >= +state.tvl &&
      (!state.trend || (state.trend === 'up' ? r.excess > 0 : r.excess < 0));
  });
}
/** What a column sorts on: slice, net, fees and perHour come from the farm plan, the rest from the row. */
function sortValue(r, column) {
  return column === 'name' ? r.name.toLowerCase() : column === 'age' ? (r.age == null ? 1e9 : r.age) : column in r.now ? r.now[column] : r[column];
}
function sortRows(list) {
  var dir = state.dir === 'asc' ? 1 : -1;
  return list.slice().sort(function (a, b) { var x = sortValue(a, state.sort), y = sortValue(b, state.sort); return x < y ? -dir : x > y ? dir : a.rank - b.rank; });
}
function sortByColumn(column) {
  if (state.sort === column) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
  else { state.sort = column; state.dir = /^(rank|name|age|fees)$/.test(column) ? 'asc' : 'desc'; }
  writeStateToHash(); render();
}
function readStateFromHash() {
  var given = {};
  location.hash.slice(1).split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) given[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
  for (var k in DEFAULTS) state[k] = given[k] != null ? given[k] : DEFAULTS[k];
}
function writeStateToHash() {
  var parts = [];
  for (var k in DEFAULTS) if (state[k] !== DEFAULTS[k]) parts.push(k + '=' + encodeURIComponent(state[k]));
  history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search);
}
function setState(key, value) { state[key] = value; writeStateToHash(); render(); }

var esc = function (s) { return String(s).replace(/[&<>'"]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); },   // formats
  times = function (x) { return '×' + x.toFixed(x >= 10 ? 1 : 2); },
  pct = function (x) { return (x < 0 ? '−' : '+') + Math.abs(x).toFixed(1) + '%'; },
  per = function (x) { return Math.round(x * 100) + '%'; },
  signed = function (x) { return (x < 0 ? '−' : '+') + usd(Math.abs(x)); },
  span = function (d) { return d == null ? 'undated' : d < 365 ? d + ' d' : (d / 365).toFixed(1) + ' y'; },
  hours = function (m) { return (m / 60).toFixed(1) + ' h'; },
  tag = function (kind, v) { return '<i class=\'' + kind + ' ' + v + '\'>' + v + '</i>'; },
  wide = function (s) { return '<span class=\'wide\'>' + s + '</span>'; }, narrow = function (s) { return '<span class=\'narrow\'>' + s + '</span>'; },
  fn = function (name) { return '<span class=\'fn\'>' + name + '()</span>'; },   // the function behind a panel
  select = function (key, pairs) {
    return '<select data-key=\'' + key + '\'' + (state[key] !== DEFAULTS[key] ? ' class=\'set\'' : '') + '>' + pairs.map(function (p) {
      return '<option value=\'' + esc(p[0]) + '\'' + (String(p[0]) === state[key] ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
    }).join('') + '</select>';
  },
  countBy = function (pick) {
    var n = {};
    rows.forEach(function (r) { [].concat(pick(r)).forEach(function (v) { n[v] = (n[v] || 0) + 1; }); });
    return Object.keys(n).sort(function (a, b) { return n[b] - n[a] || (a < b ? -1 : 1); }).map(function (v) { return [v, v + ' (' + n[v] + ')']; });
  };

/** A log-log scatter in SVG: traded tokens in grey, the fitted line, and the board or one protocol on top. */
function scatterChart(o) {
  var W = o.w, H = o.h, L = 36, B = 16, s = '', e,
    X = function (v) { return L + (R.log10(v) - o.x[0]) / (o.x[1] - o.x[0]) * (W - L - 6); },
    Y = function (v) { return H - B - (R.log10(v) - o.y[0]) / (o.y[1] - o.y[0]) * (H - B - 6); },
    tick = function (e) { return '$' + (e >= 9 ? Math.pow(10, e - 9) + 'B' : e >= 6 ? Math.pow(10, e - 6) + 'M' : Math.pow(10, e - 3) + 'k'); };
  for (e = Math.ceil(o.y[0]); e <= o.y[1]; e++) s += '<line class=\'grid\' x1=\'' + L + '\' x2=\'' + W + '\' y1=\'' + Y(Math.pow(10, e)) + '\' y2=\'' + Y(Math.pow(10, e)) + '\'/><text x=\'' + (L - 4) + '\' y=\'' + (Y(Math.pow(10, e)) + 3) + '\' text-anchor=\'end\'>' + tick(e) + '</text>';
  for (e = Math.ceil(o.x[0]); e <= o.x[1]; e++) s += '<text x=\'' + X(Math.pow(10, e)) + '\' y=\'' + (H - 4) + '\' text-anchor=\'middle\'>' + tick(e) + '</text>';
  o.dots.forEach(function (d) { s += '<circle class=\'' + d[2] + '\' cx=\'' + X(d[0]).toFixed(1) + '\' cy=\'' + Y(d[1]).toFixed(1) + '\' r=\'' + (d[3] || 2) + '\'/>'; });
  o.lines.forEach(function (l) { s += '<line class=\'' + l[4] + '\' x1=\'' + X(l[0]) + '\' y1=\'' + Y(l[1]) + '\' x2=\'' + X(l[2]) + '\' y2=\'' + Y(l[3]) + '\'/>'; });
  return '<svg class=\'plot\' viewBox=\'0 0 ' + W + ' ' + H + '\' role=\'img\' aria-label=\'' + esc(o.label) + '\'>' + s + '</svg><p class=\'cap\'>' + o.label + '</p>';
}
/** Market cap on TVL: the comparables, the size curve fitted to them, and where the board (or one row) lands. */
function curveChart(w, h, row) {
  var dots = radar.comps.map(function (c) { return [c.tvl, c.mcap, 'comp']; }).concat((row ? [row] : rows).map(function (r) { return [r.tvl, r.value, 'board', row ? 4 : 2]; })),
    at = function (tvl) { return Math.pow(10, fit.a + fit.b * R.log10(tvl)); };
  return scatterChart({ w: w, h: h, x: [6.5, 10.4], y: [4.5, 10], dots: dots, lines: [[4e6, at(4e6), 2e10, at(2e10), 'fit']],
    label: 'Market cap on TVL. Grey: ' + radar.comps.length + ' tokens that trade. Line: the size curve. Blue: ' + (row ? esc(row.name) : 'the board') + '.' });
}

// ---------------------------------------------------------------- the board
function renderHeader() {
  var check = R.checkBoard(rows, input.board), listed = rows.filter(function (r) { return r.tier === 'watchlist'; }).length, c = radar.counts;
  $('#top').innerHTML = '<a class=\'brand\' href=\'#\'>◎ Token Radar</a>' +
    '<span class=\'meta\'>DefiLlama snapshot ' + radar.asOf + ' · ' + c.protocols + ' protocols · one model prices board.json and this page</span>' +
    '<span class=\'proof ' + (listed === c.watchlist ? 'ok' : 'bad') + '\'>Watchlist ' + listed + '/' + c.watchlist + wide(' on the board') + '</span>' +
    '<span class=\'proof ' + (check.ok ? 'ok' : 'bad') + '\'>' + wide('checkBoard(): ') + check.same + '/' + check.of + ' rows equal board.json</span>';
}
/** The KPI strip: what the board holds, how its price did on tokens the fit never saw, and what is worth farming. */
function renderKpis() {
  var tally = { FARM: 0, THIN: 0, SKIP: 0 }, v = tests.ladder[3], total = rows.reduce(function (s, r) { return s + r.value; }, 0);
  rows.forEach(function (r) { tally[r.now.verdict]++; });
  var best = rows.slice().sort(function (a, b) { return b.now.perHour - a.now.perHour; })[0];
  var tile = function (label, big, small) { return '<div><h2>' + label + '</h2><b>' + big + '</b><small>' + small + '</small></div>'; };
  return '<section class=\'kpis\'>' +
    tile('Ranked', rows.length, 'of ' + radar.counts.protocols + ' read · by implied value') +
    tile('Implied value', usd(total), 'priced like the ' + radar.comps.length + ' tokens that trade') +
    tile('Value miss, held out', times(v.miss), 'each left out · ' + times(v.split.miss) + ' older→newer') +
    tile('Range holds', per(rng.each / rng.n), rng.each + '/' + rng.n + ' left out · ' + rng.split + '/' + rng.newer + ' newer') +
    tile('Worth farming', tally.FARM + ' FARM', tally.THIN + ' THIN · ' + tally.SKIP + ' SKIP on ' + usd(+state.cap)) +
    tile('Best per hour', signed(best.now.perHour), '<a href=\'#p=' + best.slug + '\'>' + esc(best.name) + '</a> · net ' + signed(best.now.net)) + '</section>';
}
/** All protocols in one stacked bar: each group with its count and the reason it is or is not ranked. */
function renderLedger() {
  var n = radar.counts.protocols;
  return '<div class=\'card\'><h2>' + n + ' protocols read, each accounted for ' + fn('ledgerOf') + '</h2><div class=\'ledger\'>' + radar.ledger.map(function (g, i) {
    return '<i class=\'g' + i + '\' style=\'width:' + (g[1] / n * 100).toFixed(2) + '%\'></i>';
  }).join('') + '</div><table class=\'keys\'>' + radar.ledger.map(function (g, i) {
    return '<tr><td><i class=\'g' + i + '\'></i>' + g[0] + '</td><td>' + g[1] + '</td><td>' + g[2] + '</td></tr>';
  }).join('') + '</table></div>';
}
/** The top of the board: every protocol accounted for, how a launch is priced, and each model step priced blind. */
function renderSummary() {
  var cell = function (m) { return times(m.miss) + ' <small>' + per(m.within3) + '</small>'; };
  return '<section class=\'summary\'>' + renderLedger() +
    '<div class=\'how\'><h2>How a launch is priced ' + fn('impliedValue') + fn('backtest') + '</h2><code>10^' + fit.a.toFixed(2) + ' × TVL^' + fit.b.toFixed(3) + ' × sector × momentum × age × kinship</code>' +
    '<table><tr><th>Each step, priced blind: median miss · within 3×</th><th>each left out</th><th>older→newer</th></tr>' +
    tests.ladder.map(function (l, i) { return '<tr' + (i === 3 ? ' class=\'on\'' : '') + '><td>' + l.name + '</td><td>' + cell(l) + '</td><td>' + cell(l.split) + '</td></tr>'; }).join('') +
    '<tr><td>Range: half the blind misses, ' + times(rng.young) + ' if under ' + Math.round(R.CONFIG.youngDays / 30) + ' months</td><td>' + rng.each + '/' + rng.n + ' inside</td><td>' + rng.split + '/' + rng.newer + '</td></tr></table>' +
    '<p class=\'cap\'>Older→newer: a fit on the ' + tests.older + ' tokens 900+ days on record prices the ' + tests.newer + ' newer' + (tests.ladder[3].split.miss < tests.ladder[2].split.miss ? '; growth and age stay as they cut that miss' : '') + '.</p></div>' +
    '<div class=\'chart\'>' + curveChart(250, 150) + '</div></section>';
}
function renderTabs() {
  var tabs = [['board', 'No token yet', rows.length], ['traded', 'Token trades', radar.tokens.length], ['aside', 'Set aside', radar.aside.length], ['method', 'Method and tests', '']];
  return '<nav class=\'tabs\'>' + tabs.map(function (t) { return '<button data-set=\'view=' + t[0] + '\' class=\'' + (state.view === t[0] ? 'on' : '') + '\'>' + t[1] + ' <b>' + t[2] + '</b></button>'; }).join('') +
    '<span class=\'what-if wide\'>Ticket ' + select('cap', [[1000, '$1,000'], [5000, '$5,000'], [25000, '$25,000']]) + ' Airdrop to depositors ' + select('share', [[5, '5%'], [10, '10%'], [20, '20%']]) + '</span></nav>';
}
function renderFilters() {
  var active = FILTERS.filter(function (k) { return state[k] !== DEFAULTS[k]; }).length;
  return '<div class=\'filters\'><input data-key=\'q\' type=\'search\' placeholder=\'Search\' value=\'' + esc(state.q) + '\'>' +
    select('tier', [['', 'Any tier'], ['watchlist', 'Watchlist'], ['early', 'Early: below the floor'], ['shared', 'Shared: filed under a parent']]) +
    select('sector', [['', 'Any sector']].concat(countBy(function (r) { return r.sector; }))) +
    select('play', [['', 'Any farm play']].concat(Object.keys(R.PLAYS).map(function (k) { return [k, R.PLAYS[k].label]; }))) +
    select('chain', [['', 'Any chain']].concat(countBy(function (r) { return r.chains; }))) +
    select('verdict', [['', 'Any verdict'], ['FARM', 'FARM: beats fees and the T-bill'], ['THIN', 'THIN: beats fees only'], ['SKIP', 'SKIP: fees eat the slice']]) +
    select('tvl', [[0, 'Any TVL'], [1e7, 'TVL $10M+'], [5e7, 'TVL $50M+'], [2e8, 'TVL $200M+']]) +
    select('trend', [['', 'Any 7-day move'], ['up', 'Beat the market'], ['down', 'Lagged the market']]) +
    (active ? '<button data-do=\'reset\'>Clear ' + active + '</button>' : '') + '<button data-do=\'csv\'>CSV</button>' +
    '<button data-set=\'hero=' + (state.hero === '1' ? '0' : '1') + '\'>' + (state.hero === '1' ? 'Hide' : 'Show') + ' summary</button><span id=\'count\'></span></div>';
}
var COLUMNS = [['rank', '#', ''], ['name', 'Protocol', ''], ['tvl', 'TVL', 'r wide'], ['excess', '7d TVL', 'r wide'], ['age', 'No token for', 'r wide'], ['value', 'Implied' + wide(' value'), 'r'], ['slice', 'Airdrop slice', 'r wide'], ['net', 'Net' + wide(' of all costs'), 'r'], ['fees', 'Farm plan', '']];
/** The ranked table: one row a protocol, with its value, its range and its costed farm verdict. Click a header to sort. */
function renderBoardTable() {
  var list = sortRows(applyFilters(rows)), arrow = state.dir === 'asc' ? ' ▲' : ' ▼',
    bar = function (v) { return Math.max(0, Math.min(100, (R.log10(v) - 5.5) / 3 * 100)).toFixed(1); };
  $('#count').textContent = list.length + ' of ' + rows.length + ' shown';
  $('#rows').innerHTML = '<table class=\'board\'><thead><tr>' + COLUMNS.map(function (c) {
    return '<th class=\'' + c[2] + '\' data-sort=\'' + c[0] + '\'>' + c[1] + (state.sort === c[0] ? arrow : '') + '</th>';
  }).join('') + '</tr></thead><tbody>' + list.map(function (r) {
    var p = r.now;
    return '<tr data-slug=\'' + r.slug + '\'><td class=\'n\'>' + r.rank + '</td>' +
      '<td><b>' + esc(r.name) + '</b> ' + tag('tier', r.tier) + '<small>' + esc(r.category) + wide(' · ' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '')) + narrow(' · TVL ' + usd(r.tvl)) + '</small></td>' +
      '<td class=\'r wide\'>' + usd(r.tvl) + '</td><td class=\'r wide\'>' + (r.change7d == null ? 'n/a' : pct(r.change7d)) + '<small class=\'' + (r.excess >= 0 ? 'up' : 'down') + '\'>' + pct(r.excess * 100) + ' vs market</small></td>' +
      '<td class=\'r wide\'>' + span(r.age) + '</td>' +
      '<td class=\'r\'><b>' + usd(r.value) + '</b><span class=\'band wide\'><i style=\'left:' + bar(r.low) + '%;width:' + (bar(r.high) - bar(r.low)) + '%\'></i><u style=\'left:' + bar(r.value) + '%\'></u></span></td>' +
      '<td class=\'r wide\'>' + usd(p.slice) + '</td><td class=\'r\'>' + tag('verdict', p.verdict) + ' <b>' + signed(p.net) + '</b><small>' + signed(p.perHour) + '/h' +
      wide(' · ' + (p.breakEven ? 'pays from ' + usd(p.breakEven) : 'no ticket pays')) + '</small></td>' +
      '<td>' + p.label + wide(' · ' + esc(p.chain)) + '<small>' + narrow(esc(p.chain) + ' · ') + usd(p.fees) + ' fees · ' + hours(p.minutes) + wide(' · ' + p.hold + ' d') + '</small></td></tr>';
  }).join('') + (list.length ? '' : '<tr><td colspan=\'9\'>No protocol matches these filters.</td></tr>') + '</tbody></table>';
}

// ---------------------------------------------------------------- one protocol
/** The detail view of one protocol: how its value is built, then its farm plan step by step. */
function renderDetailView(r) {
  var p = r.now;
  return '<article class=\'detail\'><p class=\'crumbs\'><button data-set=\'p=\'>← Board</button>' +
    '<span>Rank ' + r.rank + ' of ' + rows.length + ' · ' + esc(r.category) + ' · ' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</span></p>' +
    '<header><h1>' + esc(r.name) + ' ' + tag('tier', r.tier) + '<small>TVL ' + usd(r.tvl) + ' · ' + (r.age == null ? 'no listing date' : r.age + ' days on record') + ' · DefiLlama records no token as of ' + radar.asOf + '</small></h1>' +
    '<div class=\'worth\'><b>' + usd(r.value) + '</b><small>implied value · ' + usd(r.low) + ' to ' + usd(r.high) + ', ' + times(r.spread) + ' either way</small></div></header>' +
    '<div class=\'cols\'><section>' + renderValueBuild(r) + wide(curveChart(430, 190, r)) + '</section>' +
    '<section>' + renderFarmPlanTable(r, p) + '</section></div></article>';
}
/** impliedValue's factors as a running product, each with the snapshot figure behind it. */
function renderValueBuild(r) {
  var comps = radar.comps.filter(function (c) { return c.sector === r.sector; }).length, running = r.curve, months = Math.round(R.CONFIG.youngDays / 30);
  var why = [r.sector + ': ' + comps + ' traded comps, effect shrunk toward the curve',
    (r.change7d == null ? 'no 7-day figure' : '7d ' + pct(r.change7d)) + ' against the market\'s ' + pct(radar.marketWeek),
    r.age == null ? 'no listing date on record' : r.age + ' days with no token: a slight tilt, newer tokens trade richer',
    r.tier === 'shared' ? 'filed under a parent: one launch shared with siblings' : r.kin ? 'its name stem already carries ' + r.kin + ': kept only because the watchlist names it' : 'its own launch'];
  return '<h2>How ' + usd(r.value) + ' is built ' + fn('impliedValue') + '</h2><table class=\'build\'><tr><td>Size curve</td><td></td><td>' + usd(r.curve) + '</td><td>10^' + fit.a.toFixed(2) + ' × ' + usd(r.tvl) + '^' + fit.b.toFixed(3) + ', fitted on ' + radar.comps.length + ' traded tokens</td></tr>' +
    r.factors.map(function (f, i) { running *= f[1]; return '<tr><td>' + f[0] + '</td><td>' + times(f[1]) + '</td><td>' + usd(running) + '</td><td>' + esc(why[i]) + '</td></tr>'; }).join('') +
    '<tr class=\'on\'><td>Implied value</td><td></td><td>' + usd(r.value) + '</td><td>recomputed here; board.json has $' + r.value.toLocaleString('en-US') + ' at rank ' + r.rank + '</td></tr>' +
    '<tr><td>Range</td><td>' + times(r.spread) + '</td><td>' + usd(r.low) + ' – ' + usd(r.high) + '</td><td>half the blind misses of tokens ' + (r.young ? 'under ' : 'over ') + months + ' months on record; it held for ' + rng.each + '/' + rng.n + ' left out</td></tr></table>';
}
/** farmPlan's eight steps with each one's dollar cost and minutes, then slice - fees - T-bill = net. */
function renderFarmPlanTable(r, p) {
  return '<h2>Farm plan: ' + p.label + ' on ' + esc(p.chain) + ' · ' + usd(p.capital) + ' for ' + p.hold + ' days ' + tag('verdict', p.verdict) + ' ' + fn('farmPlan') + '</h2>' +
    '<table class=\'plan\'><tr><th>#</th><th>Step</th><th>Cost</th><th>Time</th></tr>' + p.steps.map(function (s, i) {
      return '<tr><td>' + (i + 1) + '</td><td><b>' + s[0] + '.</b> ' + esc(s[1]) + '</td><td>' + (s[2] ? usd(s[2]) : 'none') + '</td><td>' + s[3] + ' min</td></tr>';
    }).join('') + '<tr class=\'on\'><td></td><td>All eight steps over ' + p.hold + ' days</td><td>' + usd(p.fees) + '</td><td>' + hours(p.minutes) + '</td></tr></table>' +
    '<p class=\'sum\'>Slice <b>' + usd(p.slice) + '</b> − fees <b>' + usd(p.fees) + '</b> − T-bill forgone <b>' + usd(p.forgone) + '</b> = net <b class=\'' + (p.net >= 0 ? 'up' : 'down') + '\'>' + signed(p.net) + '</b>, ' + signed(p.perHour) + ' an hour. ' +
    (p.breakEven ? 'Pays from a ' + usd(p.breakEven) + ' ticket.' : 'No ticket size pays at this value.') + '</p>' +
    '<p class=\'note\'>Slice: ' + Math.round(p.share * 100) + '% of ' + usd(r.value) + ' shared by dollar-days. Your ' + p.hold + ' days stand behind ' + Math.round(p.ahead) + ' day-equivalents already earned (half its days with no token, as if TVL grew in a straight line). A launch that only counts balances on the day would pay ' + usd(p.snapshotSlice) + '.</p>';
}

// ---------------------------------------------------------------- the other tabs
/** Protocols whose token already trades: kept apart from the board, used as comparables and priced blind. */
function renderTradedTokens() {
  var list = radar.tokens.slice().sort(function (a, b) { return b.mcap - a.mcap; });
  return '<p class=\'lead\'>' + list.length + ' protocols record a market cap and are never ranked. ' + radar.comps.length + ' are the comparables, each also priced blind by a fit that left it out. ' +
    radar.counts.onRecord + ' more record a ticker with no cap: neither ranked nor used.</p><table class=\'board\'><thead><tr><th>Token</th><th>Sector</th><th class=\'r\'>Family TVL</th><th class=\'r\'>Market cap</th><th class=\'r\'>Cap/TVL</th><th class=\'r\'>Blind price</th><th class=\'r\'>Miss</th><th>Use</th></tr></thead><tbody>' +
    list.map(function (c) {
      return '<tr><td><b>' + esc(c.name) + '</b> ' + esc(c.symbol) + (c.members > 1 ? ' · ' + c.members + ' listings' : '') + '</td><td>' + c.sector + '</td><td class=\'r\'>' + usd(c.tvl) + '</td><td class=\'r\'>' + usd(c.mcap) + '</td><td class=\'r\'>' + times(c.mcap / c.tvl) + '</td>' +
        '<td class=\'r\'>' + (c.blind ? usd(c.blind) : '') + '</td><td class=\'r\'>' + (c.blind ? times(Math.max(c.blind / c.mcap, c.mcap / c.blind)) : '') + '</td><td>' + (c.skip || 'comparable') + '</td></tr>';
    }).join('') + '</tbody></table>';
}
/** Protocols with no token on record that the board leaves out, each with the rule that set it aside. */
function renderSetAside() {
  return '<p class=\'lead\'>' + radar.counts.noToken + ' protocols record no token. ' + rows.length + ' are ranked; these ' + radar.aside.length + ' are set aside: the house\'s watchlist rule applied below its floor, or a name stem that already carries a token.</p>' +
    '<table class=\'board\'><thead><tr><th>Protocol</th><th>Category</th><th class=\'r\'>TVL</th><th>Set aside as</th></tr></thead><tbody>' +
    radar.aside.map(function (a) { return '<tr><td><b>' + esc(a.name) + '</b></td><td>' + esc(a.category || '') + '</td><td class=\'r\'>' + usd(a.tvl) + '</td><td>' + a.reason + (a.kin ? ' (' + esc(a.kin) + ')' : '') + '</td></tr>'; }).join('') + '</tbody></table>';
}
/** The method in words, the evidence for each input, and every traded token's blind price against its cap. */
function renderMethodAndTests() {
  var C = R.CONFIG, sectors = Object.keys(fit.sector).map(function (s) { return s + ' ' + times(Math.pow(10, fit.sector[s])); }).join(', ');
  return '<div class=\'method\'><section><h2>What is priced</h2><p>A protocol is on the board when DefiLlama records no market cap, ticker or CoinGecko id for it and no rule sets it aside. Its value is what its token would be worth if priced like those that trade.</p>' +
    '<h2>The evidence for each input</h2><table class=\'mini text\'><tr><th>Input</th><th>What the ' + radar.comps.length + ' comparables say</th><th>How it is used</th></tr>' +
    '<tr><td>TVL</td><td>cap grows as TVL^' + fit.b.toFixed(3) + ': a dollar of TVL is worth less in a big protocol</td><td>the size curve, a Theil-Sen line no outlier can tilt</td></tr>' +
    '<tr><td>Sector</td><td>' + sectors + '</td><td>each effect shrunk by ' + C.pseudoComps + ' pseudo-comps</td></tr>' +
    '<tr><td>7-day growth</td><td>the median protocol moved ' + pct(radar.marketWeek) + ' that week</td><td>TVL carried forward by its growth over the market, capped at ±' + C.growthCap * 100 + '%</td></tr>' +
    '<tr><td>Time with no token</td><td>newer tokens price richer in every cohort split; under ' + Math.round(C.youngDays / 30) + ' months on record blind prices miss ' + times(rng.young) + ', older ' + times(rng.seasoned) + '</td><td>a slight tilt on price (' + times(C.ageClamp[0]) + ' to ' + times(C.ageClamp[1]) + '), the width of the range, and the farm slice</td></tr></table>' +
    '<h2>Farm maths</h2><p>slice = value × airdrop share × ticket / TVL × hold / (ahead + hold). ahead is half the days it has run with no token, at most ' + C.pointsWindow + ': TVL is taken to have grown in a straight line. net = slice − fees − the ' + C.tbill * 100 + '% T-bill yield given up. FARM beats both; THIN beats fees only, so it needs the position\'s own yield; SKIP beats neither.</p>' +
    '</section>' +
    '<section><h2>Blind test: every traded token priced as if it had none</h2>' + scatterChart({ w: 430, h: 260, x: [5, 9.5], y: [4.5, 10], dots: radar.comps.map(function (c) { return [c.blind, c.mcap, 'comp', 2.5]; }),
      lines: [[1e5, 1e5, 3e9, 3e9, 'fit'], [1e5, 3e5, 1e9, 3e9, 'edge'], [3e5, 1e5, 3e9, 1e9, 'edge']], label: 'Across: the blind price. Up: the real market cap. Between the dashed lines: within 3×.' }) + '</section></div>';
}
function exportCsv() {
  var lines = [['rank', 'slug', 'name', 'tier', 'sector', 'tvl_usd', 'change_7d', 'days_no_token', 'implied_value_usd', 'verdict', 'net_usd', 'fees_usd', 'hours']].concat(sortRows(applyFilters(rows)).map(function (r) {
    return [r.rank, r.slug, r.name.replace(/,/g, ' '), r.tier, r.sector, r.tvl, r.change7d, r.age, r.value, r.now.verdict, r.now.net.toFixed(2), r.now.fees.toFixed(2), (r.now.minutes / 60).toFixed(1)];
  }));
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = 'token-radar-' + radar.asOf + '.csv'; a.click();
}

function render() {
  planAtReaderTicket();
  var row = state.p && rows.filter(function (r) { return r.slug === state.p; })[0], board = state.view === 'board';
  $('#app').innerHTML = row ? renderDetailView(row) : renderKpis() + (board && state.hero === '1' ? renderSummary() : '') + renderTabs() +
    (board ? renderFilters() + '<div id=\'rows\'></div>' : state.view === 'traded' ? renderTradedTokens() : state.view === 'aside' ? renderSetAside() : renderMethodAndTests());
  if (!row && board) renderBoardTable();
}
document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-set],[data-sort],[data-slug],[data-do]');
  if (!t) return;
  if (t.dataset.set) { var kv = t.dataset.set.split('='); if (kv[0] === 'view') state.p = ''; setState(kv[0], kv[1]); }
  else if (t.dataset.sort) sortByColumn(t.dataset.sort);
  else if (t.dataset.slug) setState('p', t.dataset.slug);
  else if (t.dataset.do === 'csv') exportCsv();
  else { FILTERS.forEach(function (k) { state[k] = DEFAULTS[k]; }); writeStateToHash(); render(); }
});
document.addEventListener('input', function (e) {
  var k = e.target.dataset.key;
  if (!k) return;
  state[k] = e.target.value; writeStateToHash();
  if (k === 'q') renderBoardTable(); else render();
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.p) setState('p', ''); });
window.addEventListener('hashchange', function () { readStateFromHash(); render(); });
readStateFromHash(); renderHeader(); render();
})();
