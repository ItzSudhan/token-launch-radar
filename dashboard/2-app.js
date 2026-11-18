/* Token Radar, the page. It prices nothing: Radar.buildRadar (1-model.js) recomputes the board from ../data.js; Radar.checkBoard matches it to board.json. */
(function () {
'use strict';
// view state lives in the URL hash, so every filter, sort and protocol is a link
var input = window.RADAR_INPUT, R = window.Radar;
if (!input || !R) return;
var radar = R.buildRadar(input.snapshot), rows = radar.rows, fit = radar.fit, tests = radar.tests, odds = radar.odds, rng = radar.ranges, usd = R.usd,
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
/** What a column sorts on: net and fees come from the farm plan, the rest from the row. */
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
  of = function (a, b) { return a + '/' + b + ' <small>' + per(a / b) + '</small>'; },
  signed = function (x) { return (x < 0 ? '−' : '+') + usd(Math.abs(x)); },
  span = function (d) { return d == null ? 'undated' : d < 365 ? d + ' d' : (d / 365).toFixed(1) + ' y'; },
  tag = function (kind, v) { return '<i class=\'' + kind + ' ' + v + '\'>' + v + '</i>'; },
  wide = function (s) { return '<span class=\'wide\'>' + s + '</span>'; },
  fn = function (name) { return '<span class=\'fn\'>' + name + '()</span>'; },   // the function behind a panel
  meter = function (p) { return '<span class=\'odds\'><i style=\'width:' + per(p) + '\'></i></span>'; },
  table = function (cls, head, body) { return '<table class=\'' + cls + '\'><tr><th>' + head.join('</th><th>') + '</th></tr>' + body.map(function (c) { return '<tr><td>' + c.join('</td><td>') + '</td></tr>'; }).join('') + '</table>'; },
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

// ---------------------------------------------------------------- the board
function renderHeader() {
  var check = R.checkBoard(rows, input.board), listed = rows.filter(function (r) { return r.tier === 'watchlist'; }).length, c = radar.counts;
  $('#top').innerHTML = '<a class=\'brand\' href=\'#\'>◎ Token Radar</a>' +
    '<span class=\'meta\'>DefiLlama snapshot ' + radar.asOf + ' · ' + c.protocols + ' protocols · one model prices board.json and this page</span>' +
    '<span class=\'proof ' + (listed === c.watchlist ? 'ok' : 'bad') + '\'>Watchlist ' + listed + '/' + c.watchlist + wide(' on the board') + '</span>' +
    '<span class=\'proof ' + (check.ok ? 'ok' : 'bad') + '\'>' + wide('checkBoard(): ') + check.same + '/' + check.of + ' rows equal board.json</span>';
}
/** The KPI strip: what the board holds and how each of its claims did on data the model never saw. */
function renderKpis() {
  var sum = function (k) { return rows.reduce(function (s, r) { return s + r[k]; }, 0); }, tally = { FARM: 0, THIN: 0, SKIP: 0 }, k = odds.kept, v = tests.ladder[3];
  rows.forEach(function (r) { tally[r.now.verdict]++; });
  var tile = function (label, big, small) { return '<div><h2>' + label + '</h2><b>' + big + '</b><small>' + small + '</small></div>'; };
  return '<section class=\'kpis\'>' +
    tile('Ranked', rows.length, 'of ' + radar.counts.protocols + ' read · by expected value') +
    tile('Expected value', usd(sum('expected')), usd(sum('value')) + ' if every one launched') +
    tile('Value miss, held out', times(v.miss), 'each left out · ' + times(v.split.miss) + ' older→newer') +
    tile('50% range holds', per(rng.each[0] / rng.n), rng.each[0] + '/' + rng.n + ' left out · ' + rng.split[0] + '/' + rng.newer + ' newer') +
    tile('Launch odds right', per(k.each.acc), k.each.right + '/' + k.each.n + ' left out · base rate ' + per(odds.baseAcc)) +
    tile('Worth farming', tally.FARM + ' FARM', tally.THIN + ' THIN · ' + tally.SKIP + ' SKIP on ' + usd(+state.cap)) + '</section>';
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
/** Every model step against the one before it, on data it never saw: each left out, and older to newer. */
function renderOutOfSample() {
  var row = function (s, cells, on) { return '<tr' + (on ? ' class=\'on\'' : '') + '><td>' + s + '</td><td>' + cells.join('</td><td>') + '</td></tr>'; };
  return '<div class=\'card\'><h2>Out of sample, step by step ' + fn('backtest') + fn('launchOdds') + '</h2><table class=\'oos\'>' +
    '<tr><th>Value: median miss · within 3×</th><th>each left out</th><th>older→newer</th></tr>' +
    tests.ladder.map(function (l, i) { return row(l.name, [times(l.miss) + ' <small>' + per(l.within3) + '</small>', times(l.split.miss) + ' <small>' + per(l.split.within3) + '</small>'], i === 3); }).join('') +
    '<tr><th>Launch odds: called right · log loss</th><th>each left out</th><th>newest third</th></tr>' +
    odds.steps.map(function (s) { return row(s.name + (s.kept ? '' : ' <small>dropped</small>'), [of(s.each.right, s.each.n) + ' <small>' + s.each.loss.toFixed(3) + '</small>', of(s.split.right, s.split.n)], s === odds.kept); }).join('') +
    '</table><p class=\'cap\'>Value: ' + tests.older + ' tokens 900+ days on record price the ' + tests.newer + ' newer' + (tests.ladder[3].split.miss < tests.ladder[2].split.miss ? '; growth and age stay as they cut that miss' : '') +
    '. Odds: listed before ' + odds.kept.cut + ' predict the rest; a step stays only if it lowers held-out log loss.</p></div>';
}
/** Ranges and odds, each against how often the held-out data agreed with it. */
function renderCalibration() {
  var w = rng.width, f = function (g, i) { return times(Math.pow(10, w[g][i])); };
  return '<div class=\'card\'><h2>Do the ranges and odds hold? ' + fn('rangeTest') + '</h2><table class=\'oos\'><tr><th>Range, held out</th><th>stated</th><th>each left out</th><th>older→newer</th></tr>' +
    R.CONFIG.bands.map(function (b, i) { return '<tr><td>' + per(b) + ' range: ' + f('seasoned', i) + ', ' + f('young', i) + ' if young</td><td>' + per(b) + '</td><td>' + of(rng.each[i], rng.n) + '</td><td>' + of(rng.split[i], rng.newer) + '</td></tr>'; }).join('') +
    '<tr><th>Launch odds, held out</th><th>protocols</th><th>said</th><th>recorded a token</th></tr>' +
    odds.calib.map(function (b) { return '<tr><td>' + per(b.lo) + ' to ' + per(b.lo + 0.2) + '</td><td>' + b.n + '</td><td>' + per(b.said) + '</td><td>' + per(b.saw) + ' ' + meter(b.saw) + '</td></tr>'; }).join('') +
    '</table><p class=\'cap\'>Young: under ' + Math.round(R.CONFIG.youngDays / 30) + ' months on record (' + rng.young + ' tokens). Base rate: ' + per(odds.base) + ' of ' + odds.n + ' record a token.</p></div>';
}
function renderTabs() {
  var tabs = [['board', 'No token yet', rows.length], ['apart', 'Kept apart', radar.tokens.length + radar.aside.length]];
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
    (active ? '<button data-do=\'reset\'>Clear ' + active + '</button>' : '') +
    '<button data-set=\'hero=' + (state.hero === '1' ? '0' : '1') + '\'>' + (state.hero === '1' ? 'Hide' : 'Show') + ' tests</button><span id=\'count\'></span></div>';
}
var COLUMNS = [['rank', '#', ''], ['name', 'Protocol', ''], ['tvl', 'TVL', 'r wide'], ['excess', '7d TVL', 'r wide'], ['age', 'No token for', 'r wide'],
  ['value', 'If it launches · 50% range', 'r wide'], ['odds', 'Odds', 'r'], ['expected', 'Expected', 'r'], ['net', 'Net of all costs', 'r'], ['fees', 'Farm plan', 'wide']];
/** The ranked table: value if it launches with its 50% range, launch odds, their product (the rank), and the farm verdict. */
function renderBoardTable() {
  var list = sortRows(applyFilters(rows)), arrow = state.dir === 'asc' ? ' ▲' : ' ▼',
    bar = function (v) { return Math.max(0, Math.min(100, (R.log10(v) - 5.5) / 3 * 100)).toFixed(1); };
  $('#count').textContent = list.length + ' of ' + rows.length + ' shown';
  $('#rows').innerHTML = '<table class=\'board\'><thead><tr>' + COLUMNS.map(function (c) {
    return '<th class=\'' + c[2] + '\' data-sort=\'' + c[0] + '\'>' + c[1] + (state.sort === c[0] ? arrow : '') + '</th>';
  }).join('') + '</tr></thead><tbody>' + list.map(function (r) {
    var p = r.now;
    return '<tr data-slug=\'' + r.slug + '\'><td class=\'n\'>' + r.rank + '</td>' +
      '<td><b>' + esc(r.name) + '</b> ' + tag('tier', r.tier) + '<small>' + esc(r.category) + ' · ' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</small></td>' +
      '<td class=\'r wide\'>' + usd(r.tvl) + '</td><td class=\'r wide\'>' + (r.change7d == null ? 'n/a' : pct(r.change7d)) + '<small class=\'' + (r.excess >= 0 ? 'up' : 'down') + '\'>' + pct(r.excess * 100) + ' vs market</small></td>' +
      '<td class=\'r wide\'>' + span(r.age) + '</td>' +
      '<td class=\'r wide\'>' + usd(r.value) + '<span class=\'band\'><i style=\'left:' + bar(r.low) + '%;width:' + (bar(r.high) - bar(r.low)) + '%\'></i><u style=\'left:' + bar(r.value) + '%\'></u></span><small>' + usd(r.low) + ' – ' + usd(r.high) + '</small></td>' +
      '<td class=\'r\'>' + per(r.odds) + meter(r.odds) + '</td><td class=\'r\'><b>' + usd(r.expected) + '</b></td>' +
      '<td class=\'r\'>' + tag('verdict', p.verdict) + ' <b>' + signed(p.net) + '</b><small>' + signed(p.perHour) + '/h · ' + (p.breakEven ? 'pays from ' + usd(p.breakEven) : 'no ticket pays') + '</small></td>' +
      '<td class=\'wide\'>' + p.label + ' · ' + esc(p.chain) + '<small>' + usd(p.fees) + ' fees · ' + (p.minutes / 60).toFixed(1) + ' h · ' + p.hold + ' d</small></td></tr>';
  }).join('') + (list.length ? '' : '<tr><td colspan=\'10\'>No protocol matches these filters.</td></tr>') + '</tbody></table>';
}

// ---------------------------------------------------------------- one protocol
/** The detail view of one protocol: its value, its launch odds, then its farm plan step by step. */
function renderDetailView(r) {
  return '<article class=\'detail\'><p class=\'crumbs\'><button data-set=\'p=\'>← Board</button>' +
    '<span>Rank ' + r.rank + ' of ' + rows.length + ' · ' + esc(r.category) + ' · ' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</span></p>' +
    '<header><h1>' + esc(r.name) + ' ' + tag('tier', r.tier) + '<small>TVL ' + usd(r.tvl) + ' · ' + (r.age == null ? 'no listing date' : r.age + ' days on record') + ' · DefiLlama records no token as of ' + radar.asOf + '</small></h1>' +
    '<div class=\'worth\'><b>' + usd(r.expected) + '</b><small>expected · ' + usd(r.value) + ' if it launches × ' + per(r.odds) + ' odds</small></div></header>' +
    '<div class=\'cols\'><section>' + renderValueBuild(r) + renderOddsBuild(r) + '</section><section>' + renderFarmPlanTable(r, r.now) + '</section></div></article>';
}
/** impliedValue's factors as a running product, each with the snapshot figure behind it, then both held-out ranges. */
function renderValueBuild(r) {
  var comps = radar.comps.filter(function (c) { return c.sector === r.sector; }).length, running = r.curve;
  var why = [r.sector + ': ' + comps + ' traded comps, effect shrunk toward the curve',
    (r.change7d == null ? 'no 7-day figure' : '7d ' + pct(r.change7d)) + ' against the market\'s ' + pct(radar.marketWeek),
    r.age == null ? 'no listing date on record' : r.age + ' days with no token: a slight tilt, newer tokens trade richer',
    r.tier === 'shared' ? 'filed under a parent: one launch shared with siblings' : r.kin ? 'its name stem already carries ' + r.kin + ': kept only because the watchlist names it' : 'its own launch'];
  return '<h2>If it launches: ' + usd(r.value) + fn('impliedValue') + '</h2>' + table('build', ['Step', '×', '$', 'From the snapshot'],
    [['Size curve', '', usd(r.curve), '10^' + fit.a.toFixed(2) + ' × ' + usd(r.tvl) + '^' + fit.b.toFixed(3) + ', fitted on ' + radar.comps.length + ' traded tokens']].concat(
      r.factors.map(function (f, i) { running *= f[1]; return [f[0], times(f[1]), usd(running), esc(why[i])]; }),
      [['50% range', times(r.spread), usd(r.low) + ' – ' + usd(r.high), 'held for ' + rng.each[0] + '/' + rng.n + ' tokens priced blind; ' + (r.young ? 'young: under ' : 'over ') + Math.round(R.CONFIG.youngDays / 30) + ' months on record'],
        ['80% range', times(r.spread80), usd(r.low80) + ' – ' + usd(r.high80), 'held for ' + rng.each[1] + '/' + rng.n + '; the younger, the less sure']]));
}
/** launchOdds' fit for this row: each feature's push on the log-odds, then the held-out odds the board uses. */
function renderOddsBuild(r) {
  var k = odds.kept, x = R.oddsX({ age: r.age, tvl: r.tvl, excess: r.excess, chains: Math.max(1, r.chains.length), sector: r.sector }, k.names), z = 0,
    seen = { age: ['Time on record', span(r.age)], undated: ['No listing date', r.age == null ? 'yes' : 'no'], size: ['TVL', usd(r.tvl)], momentum: ['7-day growth', pct(r.excess * 100) + ' vs market'], reach: ['Chains', r.chains.length] };
  var parts = [['Base', k.w[0], 'all ' + odds.n + ' candidates']].concat(k.names.map(function (n, i) {
    return seen[n] ? [seen[n][0], k.w[i + 1] * x[i + 1], seen[n][1]] : ['Sector: ' + n, k.w[i + 1] * x[i + 1], 'its sector'];
  })).filter(function (q) { return Math.abs(q[1]) > 0.005; });
  return '<h2>Launch odds: ' + per(r.odds) + fn('launchOdds') + '</h2>' + table('build', ['Feature', 'log-odds', 'odds', 'This row'], parts.map(function (q) {
    z += q[1]; return [q[0], (q[1] < 0 ? '−' : '+') + Math.abs(q[1]).toFixed(2), per(R.sigmoid(z)), esc(q[2])];
  }).concat([['Held out', '', per(r.odds), 'a fit without this row: ' + usd(r.value) + ' × ' + per(r.odds) + ' = $' + r.expected.toLocaleString('en-US') + ' in board.json, rank ' + r.rank]])) +
    '<p class=\'note\'>A ridge logistic fit on ' + odds.tokens + ' token families and ' + (odds.n - odds.tokens) + ' protocols with none: how much this row looks like protocols that did launch. Held out it calls ' + per(k.each.acc) + ' right; the base rate, ' + per(odds.baseAcc) + '.</p>';
}
/** farmPlan's eight steps with each one's dollar cost and minutes, then slice - fees - T-bill = net. */
function renderFarmPlanTable(r, p) {
  return '<h2>Farm plan: ' + p.label + ' on ' + esc(p.chain) + ' · ' + usd(p.capital) + ' for ' + p.hold + ' days ' + tag('verdict', p.verdict) + fn('farmPlan') + '</h2>' +
    table('plan', ['#', 'Step', 'Cost', 'Time'], p.steps.map(function (s, i) { return [i + 1, '<b>' + s[0] + '.</b> ' + esc(s[1]), s[2] ? usd(s[2]) : 'none', s[3] + ' min']; })
      .concat([['', '<b>All eight steps over ' + p.hold + ' days</b>', '<b>' + usd(p.fees) + '</b>', '<b>' + (p.minutes / 60).toFixed(1) + ' h</b>']])) +
    '<p class=\'sum\'>Slice <b>' + usd(p.slice) + '</b> − fees <b>' + usd(p.fees) + '</b> − T-bill forgone <b>' + usd(p.forgone) + '</b> = net <b class=\'' + (p.net >= 0 ? 'up' : 'down') + '\'>' + signed(p.net) + '</b>, ' + signed(p.perHour) + ' an hour. ' +
    (p.breakEven ? 'Pays from a ' + usd(p.breakEven) + ' ticket.' : 'No ticket size pays at these odds.') + '</p>' +
    '<p class=\'note\'>Slice: ' + Math.round(p.share * 100) + '% of the expected ' + usd(r.expected) + ', shared by dollar-days. Your ' + p.hold + ' days stand behind ' + Math.round(p.ahead) + ' day-equivalents already earned (half its days with no token, as if TVL grew in a straight line).</p>';
}

// ---------------------------------------------------------------- kept apart
/** Everything not ranked: tokens that trade (the comparables, each priced blind) and protocols set aside by rule. */
function renderKeptApart() {
  var list = radar.tokens.slice().sort(function (a, b) { return b.mcap - a.mcap; });
  return '<p class=\'lead\'>' + list.length + ' tokens trade, never ranked; ' + radar.comps.length + ' are comparables, each priced blind. Below: the ' + radar.aside.length + ' set aside by rule.</p>' +
    table('board', ['Token', 'Sector', 'Family TVL', 'Market cap', 'Blind price', 'Miss', 'Use'], list.map(function (c) {
      return ['<b>' + esc(c.name) + '</b> ' + esc(c.symbol) + (c.members > 1 ? ' · ' + c.members + ' listings' : ''), c.sector, usd(c.tvl), usd(c.mcap),
        c.blind ? usd(c.blind) : '', c.blind ? times(Math.max(c.blind / c.mcap, c.mcap / c.blind)) : '', c.skip || 'comparable'];
    })) + table('board', ['Set aside', 'Category', 'TVL', 'As'], radar.aside.map(function (a) {
      return ['<b>' + esc(a.name) + '</b>', esc(a.category || ''), usd(a.tvl), a.reason + (a.kin ? ' (' + esc(a.kin) + ')' : '')];
    }));
}

function render() {
  planAtReaderTicket();
  var row = state.p && rows.filter(function (r) { return r.slug === state.p; })[0], board = state.view === 'board';
  $('#app').innerHTML = row ? renderDetailView(row) : renderKpis() + (board && state.hero === '1' ? '<section class=\'panels\'>' + renderLedger() + renderOutOfSample() + renderCalibration() + '</section>' : '') +
    renderTabs() + (board ? renderFilters() + '<div id=\'rows\'></div>' : renderKeptApart());
  if (!row && board) renderBoardTable();
}
document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-set],[data-sort],[data-slug],[data-do]');
  if (!t) return;
  if (t.dataset.set) { var kv = t.dataset.set.split('='); if (kv[0] === 'view') state.p = ''; setState(kv[0], kv[1]); }
  else if (t.dataset.sort) sortByColumn(t.dataset.sort);
  else if (t.dataset.slug) setState('p', t.dataset.slug);
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
