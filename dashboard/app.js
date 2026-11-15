// Token Radar page: reads window.RADAR (written by main.ts beside this page as ../data.js) and renders
// the board, a detail panel per protocol, the traded-peer yardstick and the method. No network, no
// framework. All view state lives in the URL hash, so every view is linkable and reproducible.
(function () {
  'use strict';
  var D = window.RADAR;
  var $ = function (s) { return document.querySelector(s); };
  if (!D) { $('#view').textContent = 'data.js not found: run main.ts to write it beside dashboard/.'; return; }

  var FACTOR_NAMES = ['Peer multiple', 'Momentum (7d)', 'Durability (age)', 'No-token staleness', 'Chain breadth', 'Parent link'];
  var PLAYBOOKS = { vault: 'Vault deposit', lending: 'Lend / borrow', trading: 'Trade / LP', rwa: 'Real-world asset', network: 'Network use' };
  var PHASES = { b: 'Before', d: 'While farming', a: 'After a launch' };
  var DEFAULTS = { tab: 'board', q: '', cat: '', pb: '', chain: '', scope: 'all', tvl: '0', g: 'any', sort: 'v', dir: 'desc', p: '' };
  var S = {};

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function usd(x) {
    if (x == null) return '-';
    var a = Math.abs(x);
    if (a >= 1e9) return '$' + (x / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (x / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + (x / 1e3).toFixed(0) + 'k';
    return '$' + Math.round(x);
  }
  function pct(g) { return g == null ? '<span class="mut">n/a</span>' : '<span class="' + (g >= 0 ? 'up' : 'down') + '">' + (g >= 0 ? '+' : '') + g.toFixed(1) + '%</span>'; }
  function mult(x) { return x.toFixed(x < 0.1 ? 3 : 2) + '×'; }
  function age(r) { return r.age == null ? '<span class="mut">unlisted</span>' : r.age + 'd'; }

  // ---- state <-> hash
  function readHash() {
    var h = location.hash.replace(/^#/, ''), o = {};
    h.split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); o[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
    S = {};
    Object.keys(DEFAULTS).forEach(function (k) { S[k] = o[k] != null ? o[k] : DEFAULTS[k]; });
  }
  function writeHash() {
    var parts = [];
    Object.keys(DEFAULTS).forEach(function (k) { if (S[k] !== DEFAULTS[k]) parts.push(k + '=' + encodeURIComponent(S[k])); });
    var h = parts.join('&');
    if (location.hash.replace(/^#/, '') !== h) history.replaceState(null, '', h ? '#' + h : location.pathname);
  }
  function set(k, v) { S[k] = v; writeHash(); render(); }

  // ---- filtering and sorting
  var SORTS = {
    r: function (r) { return r.r; }, n: function (r) { return r.n.toLowerCase(); }, t: function (r) { return r.t; },
    g: function (r) { return r.g == null ? -1e9 : r.g; }, age: function (r) { return r.age == null ? 99999 : r.age; },
    m: function (r) { return r.f[0]; }, v: function (r) { return r.v; }, a: function (r) { return r.a; }
  };
  function filtered() {
    var q = S.q.trim().toLowerCase(), min = +S.tvl;
    var out = D.rows.filter(function (r) {
      if (q && (r.n + ' ' + r.id + ' ' + r.c + ' ' + r.ch.join(' ')).toLowerCase().indexOf(q) < 0) return false;
      if (S.cat && r.c !== S.cat) return false;
      if (S.pb && r.pb !== S.pb) return false;
      if (S.chain && r.ch.indexOf(S.chain) < 0) return false;
      if (S.scope === 'watch' && !r.w) return false;
      if (S.scope === 'early' && (r.w || r.pl)) return false;
      if (S.scope === 'parent' && !r.pl) return false;
      if (r.t < min) return false;
      if (S.g === 'up' && !(r.g > 0)) return false;
      if (S.g === 'down' && !(r.g < 0)) return false;
      return true;
    });
    var key = SORTS[S.sort] || SORTS.v, dir = S.dir === 'asc' ? 1 : -1;
    return out.sort(function (a, b) { var x = key(a), y = key(b); return x < y ? -dir : x > y ? dir : a.r - b.r; });
  }

  // ---- header pieces
  function renderMeta() {
    $('#meta').innerHTML = 'Snapshot ' + esc(D.as_of) + ' · ' + D.counts.protocols + ' DefiLlama protocols ≥ $5M TVL · model ' + esc(D.model.version);
    document.querySelectorAll('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)); });
  }
  function renderKpis() {
    var total = D.rows.reduce(function (s, r) { return s + r.v; }, 0);
    var watchCovered = D.rows.filter(function (r) { return r.w; }).length;
    var k = [
      [D.counts.ranked, 'pre-token protocols ranked'],
      [watchCovered + ' / ' + D.counts.watchlist, 'watchlist covered'],
      [usd(total), 'combined implied FDV'],
      [mult(D.peer_median), 'median mcap/TVL of ' + D.counts.traded + ' traded peers'],
      [D.counts.set_aside + ' + ' + D.counts.recorded, 'set aside: wrapped/CEX + token on record']
    ];
    $('#kpis').innerHTML = k.map(function (x) { return '<div class="kpi"><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('');
  }

  // ---- board
  function options(list, cur, all) {
    return '<option value="">' + all + '</option>' + list.map(function (v) { var val = Array.isArray(v) ? v[0] : v, lab = Array.isArray(v) ? v[1] : v; return '<option value="' + esc(val) + '"' + (val === cur ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join('');
  }
  function uniq(f) { var s = {}; D.rows.forEach(function (r) { [].concat(f(r)).forEach(function (v) { s[v] = (s[v] || 0) + 1; }); }); return Object.keys(s).sort(function (a, b) { return s[b] - s[a] || (a < b ? -1 : 1); }); }

  function renderBoard() {
    var rows = filtered();
    var maxV = D.rows[0].v;
    var seg = [['all', 'All'], ['watch', 'Watchlist'], ['early', 'Below floor'], ['parent', 'Parent-linked']];
    var cols = [['r', '#', ''], ['n', 'Protocol', ''], ['t', 'TVL', 'r'], ['g', '7d TVL', 'r'], ['age', 'No token for', 'r'], ['m', 'Peer mult.', 'r'], ['v', 'Implied FDV', 'r'], ['a', 'Airdrop / $10k', 'r'], ['', 'Plan', '']];
    var active = [];
    if (S.q) active.push('"' + S.q + '"'); if (S.cat) active.push(S.cat); if (S.pb) active.push(PLAYBOOKS[S.pb]); if (S.chain) active.push(S.chain);
    if (S.scope !== 'all') active.push(seg.filter(function (x) { return x[0] === S.scope; })[0][1]);
    if (+S.tvl) active.push('TVL ≥ ' + usd(+S.tvl)); if (S.g !== 'any') active.push(S.g === 'up' ? 'TVL growing' : 'TVL shrinking');
    var html = '<div class="filters">' +
      '<input id="q" type="search" placeholder="Search name, category, chain" value="' + esc(S.q) + '" aria-label="Search">' +
      '<select id="cat" aria-label="Category">' + options(uniq(function (r) { return r.c; }), S.cat, 'All categories') + '</select>' +
      '<select id="pb" aria-label="Farm playbook">' + options(Object.keys(PLAYBOOKS).map(function (k) { return [k, PLAYBOOKS[k]]; }), S.pb, 'All playbooks') + '</select>' +
      '<select id="chain" aria-label="Chain">' + options(uniq(function (r) { return r.ch; }), S.chain, 'All chains') + '</select>' +
      '<select id="tvl" aria-label="Minimum TVL">' + [['0', 'Any TVL'], ['10000000', 'TVL ≥ $10M'], ['25000000', 'TVL ≥ $25M'], ['50000000', 'TVL ≥ $50M'], ['100000000', 'TVL ≥ $100M']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === S.tvl ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<select id="g" aria-label="7-day TVL trend">' + [['any', 'Any 7d trend'], ['up', 'TVL growing'], ['down', 'TVL shrinking']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === S.g ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<span class="seg">' + seg.map(function (x) { return '<button data-scope="' + x[0] + '" class="' + (S.scope === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</span>' +
      (active.length ? '<button class="reset" id="reset">Clear filters</button>' : '') +
      '<span class="count">' + rows.length + ' of ' + D.rows.length + ' shown · ' + usd(rows.reduce(function (s, r) { return s + r.v; }, 0)) + ' implied</span></div>' +
      (active.length ? '<div class="chips">' + active.map(function (a) { return '<span class="chip">' + esc(a) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="wrap"><table><thead><tr>' + cols.map(function (c) {
        var sort = c[0] && S.sort === c[0] ? (S.dir === 'asc' ? 'ascending' : 'descending') : 'none';
        return '<th class="' + c[2] + '"' + (c[0] ? ' data-sort="' + c[0] + '" aria-sort="' + sort + '"' : '') + '>' + c[1] + '</th>';
      }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
        var w = Math.max(2, Math.round(70 * Math.sqrt(r.v / maxV)));
        return '<tr data-id="' + esc(r.id) + '"' + (S.p === r.id ? ' class="sel"' : '') + '>' +
          '<td class="rank num">' + r.r + '</td>' +
          '<td><div class="pname">' + esc(r.n) + ' ' + (r.w ? '<span class="tag w">watchlist</span>' : r.pl ? '<span class="tag p">parent-linked</span>' : '<span class="tag e">early</span>') + '</div>' +
          '<div class="pcat">' + esc(r.c) + ' · ' + esc(r.ch.slice(0, 3).join(', ')) + (r.ch.length > 3 ? ' +' + (r.ch.length - 3) : '') + '</div></td>' +
          '<td class="r num">' + usd(r.t) + '</td><td class="r num">' + pct(r.g) + '</td><td class="r num">' + age(r) + '</td>' +
          '<td class="r num">' + mult(r.f[0]) + '</td>' +
          '<td class="r"><div class="bar"><i style="width:' + w + 'px"></i><b>' + usd(r.v) + '</b></div></td>' +
          '<td class="r num">' + usd(r.a) + '</td>' +
          '<td><span class="pcat">' + PLAYBOOKS[r.pb] + ' on ' + esc(r.fc) + ' · ' + usd(r.sz) + ' · ' + r.st.length + ' steps ›</span></td></tr>';
      }).join('') + (rows.length ? '' : '<tr><td colspan="9" class="mut">No protocol matches these filters.</td></tr>') + '</tbody></table></div>';
    $('#view').innerHTML = html;

    var q = $('#q');
    q.addEventListener('input', function () { S.q = q.value; writeHash(); renderBoardKeepFocus(); });
    ['cat', 'pb', 'chain', 'tvl', 'g'].forEach(function (id) { $('#' + id).addEventListener('change', function (e) { set(id, e.target.value); }); });
    document.querySelectorAll('[data-scope]').forEach(function (b) { b.addEventListener('click', function () { set('scope', b.dataset.scope); }); });
    if ($('#reset')) $('#reset').addEventListener('click', function () { ['q', 'cat', 'pb', 'chain', 'scope', 'tvl', 'g'].forEach(function (k) { S[k] = DEFAULTS[k]; }); writeHash(); render(); });
    document.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.sort;
        if (S.sort === k) S.dir = S.dir === 'asc' ? 'desc' : 'asc'; else { S.sort = k; S.dir = (k === 'n' || k === 'r' || k === 'age') ? 'asc' : 'desc'; }
        writeHash(); render();
      });
    });
    document.querySelectorAll('tbody tr[data-id]').forEach(function (tr) { tr.addEventListener('click', function () { set('p', tr.dataset.id); }); });
  }
  function renderBoardKeepFocus() {
    var pos = $('#q').selectionStart;
    renderBoard();
    var q = $('#q'); q.focus(); q.setSelectionRange(pos, pos);
  }

  // ---- detail
  function renderDetail() {
    var el = $('#detail');
    var r = S.p && D.rows.filter(function (x) { return x.id === S.p; })[0];
    if (!r) { el.hidden = true; el.innerHTML = ''; return; }
    var cat = D.categories.filter(function (c) { return c.c === r.c; })[0];
    var peers = D.peers.filter(function (p) { return p.c === r.c; }).slice(0, 6);
    // waterfall: running value after each factor, drawn on a log scale against TVL
    var steps = [['TVL', r.t]], run = r.t;
    r.f.forEach(function (f, i) { run *= f; steps.push([FACTOR_NAMES[i] + ' ' + mult(f), run]); });
    var hiV = Math.max.apply(null, steps.map(function (s) { return s[1]; }));
    var loV = Math.min.apply(null, steps.map(function (s) { return s[1]; })) / 3;
    var scale = function (v) { return Math.max(2, 100 * Math.log(v / loV) / Math.log(hiV / loV)); };
    var why = r.w ? 'On the house watchlist: no token on record, TVL above ' + usd(D.floor) + ', not a wrapped, staked or bridged product.'
      : r.pl ? 'Above the ' + usd(D.floor) + ' floor and clear of the name and category rules, yet off the watchlist: DefiLlama links it to a parent protocol, so the model halves its value.'
      : 'Below the ' + usd(D.floor) + ' floor with no token on record: an early protocol the watchlist does not reach.';
    var notes = [];
    if (r.g != null && r.g > D.model.g_max) notes.push('TVL rose ' + r.g.toFixed(0) + '% in a week: momentum is capped at +' + D.model.g_max + '% because an inflow that fresh has not yet shown it will stay.');
    if (r.g != null && r.g < D.model.g_min) notes.push('TVL fell ' + (-r.g).toFixed(0) + '% in a week, floored at ' + D.model.g_min + '%.');
    if (r.age == null) notes.push('DefiLlama gives no listing date, so its age counts as ' + D.model.unknown_age_days + ' days.');
    if (r.f[3] < 1) notes.push(r.age + ' days tracked with no token: past two years, the launch case fades (staleness ' + mult(r.f[3]) + ').');
    el.innerHTML = '<button class="close" id="close">Close ✕</button>' +
      '<div class="pcat">Rank ' + r.r + ' of ' + D.rows.length + ' · ' + esc(r.c) + '</div><h2>' + esc(r.n) + '</h2>' +
      '<div>' + (r.w ? '<span class="tag w">watchlist</span>' : r.pl ? '<span class="tag p">parent-linked</span>' : '<span class="tag e">early</span>') + '<span class="pcat">' + esc(r.ch.join(', ')) + '</span></div>' +
      '<div class="big"><b>' + usd(r.v) + '</b><span class="mut">implied FDV · peer range ' + usd(r.lo) + ' – ' + usd(r.hi) + '</span></div>' +
      '<p class="pcat">' + why + '</p>' + '<div class="dgrid"><div>' +
      '<div class="facts"><div><span>TVL</span><b>' + usd(r.t) + '</b></div><div><span>7d TVL</span><b>' + pct(r.g) + '</b></div>' +
      '<div><span>Tracked, no token</span><b>' + (r.age == null ? 'unlisted' : r.age + ' days') + '</b></div><div><span>Airdrop / $10k</span><b>' + usd(r.a) + '</b></div></div>' +
      '<h3>How the value is built</h3><div class="wf">' + steps.map(function (s, i) {
        return '<span class="lbl">' + esc(s[0]) + '</span><span class="track"><i class="' + (i === steps.length - 1 ? 'res' : '') + '" style="width:' + scale(s[1]).toFixed(1) + '%"></i></span><span class="val">' + usd(s[1]) + '</span>';
      }).join('') + '</div>' +
      '<p class="pcat">' + esc(r.c) + ' multiple ' + mult(r.f[0]) + (cat && cat.n ? ': the median market cap / TVL of ' + cat.n + ' traded ' + esc(r.c) + ' protocol' + (cat.n > 1 ? 's' : '') + ' (' + mult(cat.raw) + '), shrunk toward the all-peer median ' + mult(D.peer_median) + '.' : ': no traded peer in this category, so the all-peer median ' + mult(D.peer_median) + '.') + '</p>' +
      (peers.length ? '<table class="mini"><thead><tr><th>Traded ' + esc(r.c) + ' peer</th><th class="r">TVL</th><th class="r">Mcap</th><th class="r">Mcap/TVL</th></tr></thead><tbody>' +
        peers.map(function (p) { return '<tr><td>' + esc(p.n) + ' <span class="mut">' + esc(p.s) + '</span></td><td class="r num">' + usd(p.t) + '</td><td class="r num">' + usd(p.m) + '</td><td class="r num">' + mult(p.m / p.t) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      (notes.length ? '<h3>Model notes</h3>' + notes.map(function (n) { return '<p class="pcat">' + esc(n) + '</p>'; }).join('') : '') +
      '</div><div><h3>Farm plan · ' + PLAYBOOKS[r.pb] + ' on ' + esc(r.fc) + ', ' + usd(r.sz) + ' position</h3><ol class="plan">' + r.st.map(function (s) {
        return '<li><div class="ph">' + PHASES[s[0]] + '</div>' + esc(s[1]) + '<div class="ct"><span>Cost <b>' + esc(s[2]) + '</b></span><span>Time <b>' + esc(s[3]) + '</b></span></div></li>';
      }).join('') + '</ol></div></div>';
    el.hidden = false;
    $('#close').addEventListener('click', function () { set('p', ''); });
  }

  // ---- traded peers and method
  function renderPeers() {
    var cats = D.categories.slice().sort(function (a, b) { return b.n - a.n || (a.c < b.c ? -1 : 1); });
    $('#view').innerHTML = '<div class="grid2"><div><h3 class="mut">Category multiples (the yardstick)</h3><div class="wrap"><table class="mini"><thead><tr><th>Category</th><th class="r">Traded peers</th><th class="r">Raw median</th><th class="r">Used multiple</th></tr></thead><tbody>' +
      cats.map(function (c) { return '<tr><td>' + esc(c.c) + '</td><td class="r num">' + c.n + '</td><td class="r num">' + (c.raw == null ? '-' : mult(c.raw)) + '</td><td class="r num">' + mult(c.m) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div><div><h3 class="mut">Protocols whose token already trades (' + D.peers.length + ')</h3><div class="wrap"><table class="mini"><thead><tr><th>Protocol</th><th>Category</th><th class="r">TVL</th><th class="r">Mcap</th><th class="r">Mcap/TVL</th></tr></thead><tbody>' +
      D.peers.map(function (p) { return '<tr><td>' + esc(p.n) + ' <span class="mut">' + esc(p.s) + '</span></td><td class="mut">' + esc(p.c) + '</td><td class="r num">' + usd(p.t) + '</td><td class="r num">' + usd(p.m) + '</td><td class="r num">' + mult(p.m / p.t) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>';
  }
  function renderMethod() {
    var M = D.model;
    $('#view').innerHTML = '<div class="method"><h2>How the radar values a launch</h2>' +
      '<p>Every figure comes from the sealed DefiLlama snapshot (' + esc(D.source) + '). No protocol is named in the code: one function prices every row, and the market\'s own prices for the ' + D.counts.traded + ' protocols whose token already trades set the yardstick.</p>' +
      '<div class="formula">implied FDV = TVL × peer multiple × momentum × durability × staleness × breadth × parent link\n\n' +
      'peer multiple = exp((n·ln median(category) + ' + M.shrink_k + '·ln median(all)) / (n + ' + M.shrink_k + ')), clamped ' + M.m_min + '–' + M.m_max + '×\n' +
      'momentum      = (1 + clamp(change_7d, ' + M.g_min + '%, +' + M.g_max + '%))^' + M.g_power + '\n' +
      'durability    = ' + M.durability_floor + ' + ' + (1 - M.durability_floor).toFixed(1) + '·(1 − e^(−days/' + M.durability_days + '))   days with no token since DefiLlama listed it\n' +
      'staleness     = 1 − ' + M.stale_max + '·clamp((days − ' + M.stale_start_days + ')/' + M.stale_span_days + ', 0, 1)\n' +
      'breadth       = 1 + ' + M.breadth_step + '·min(chains − 1, ' + M.breadth_cap + ')\n' +
      'parent link   = ' + M.parent_link + ' when above the floor and clear of the rules but off the watchlist</div>' +
      '<ul><li><b>Peer multiple.</b> A token is priced like the tokens of its category already are. Thin categories borrow strength from the all-peer median (' + mult(D.peer_median) + '), so one outlier peer cannot set a category\'s value.</li>' +
      '<li><b>Momentum.</b> A week of TVL growth lifts the value, damped by the power ' + M.g_power + ' because one week is noisy.</li>' +
      '<li><b>Time with no token.</b> TVL that has stayed for months is worth more than a fresh inflow (durability). Past two years with no token, a launch is less pressing and the value fades by up to ' + Math.round(M.stale_max * 100) + '% (staleness). Unlisted protocols count as ' + M.unknown_age_days + ' days.</li>' +
      '<li><b>Breadth.</b> Each extra chain adds ' + Math.round(M.breadth_step * 100) + '%, up to ' + M.breadth_cap + ': a wider user base to distribute to.</li>' +
      '<li><b>Range.</b> Each value carries the peer set\'s interquartile spread (' + mult(D.band[0]) + ' to ' + mult(D.band[1]) + ' of the point estimate).</li>' +
      '<li><b>Airdrop / $10k.</b> If ' + Math.round(M.airdrop_share * 100) + '% of the implied FDV went to depositors pro rata on today\'s TVL, what $10,000 held through the season would receive.</li></ul>' +
      '<h3 class="mut">What is kept apart</h3><p>' + D.counts.traded + ' protocols with a trading token are the peers, never ranked. ' + D.counts.recorded + ' record a token id or symbol without a market cap and are left out. ' + D.counts.set_aside + ' with no token on record are set aside as wrapped, staked, bridged, versioned or exchange products, by the house\'s own rule: ' +
      D.set_aside.slice(0, 8).map(function (x) { return esc(x.n) + ' (' + esc(x.r) + ')'; }).join(', ') + ' and more. The board ranks the other ' + D.rows.length + ': the ' + D.counts.watchlist + ' watchlist protocols and every early protocol below the floor.</p>' +
      '<p class="mut">The radar does not say whether or when any token launches. Implied value is this model\'s claim, not make.fun\'s, and not financial advice. Farm plans assume small positions and name their costs; DefiLlama\'s record is not proof that a protocol has no token.</p></div>';
  }

  function render() {
    renderMeta();
    if (S.tab === 'peers') renderPeers(); else if (S.tab === 'method') renderMethod(); else renderBoard();
    renderDetail();
  }

  document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () { S.p = ''; set('tab', b.dataset.tab); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.p) set('p', ''); });
  window.addEventListener('hashchange', function () { readHash(); render(); });
  readHash();
  renderKpis();
  render();
})();
