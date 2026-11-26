/* 2 · Criterion 2, launch odds: how often the snapshot's peers of a protocol's age, sector, size and 7-day growth have a token
   on record (peers' record, not a forecast). Checked: oddsLadder() prints each term's Brier score, ten-fold and older to newer.
   oddsModel    peers, ladder, final fit; launchOdds(p)     fitLogistic  ridge logistic by Newton steps
   oddsLadder   a term stays only if Brier falls in both     bootstrapSE  200 seeded refits of both models */
(function (root) {
const R = root.Radar;
const ODDS = { ridge: 1, folds: 10, newerShare: 1 / 3, steps: 25, boots: 200, seed: 758 };
const SECTORS = ['Vaults', 'Dollars', 'RWA', 'Trading', 'Lending', 'Network'];
// [key, label, columns], in units that read plainly
const ODDS_TERMS = [['age', 'Time running, per doubling', (f) => [f.age]], ['sector', 'Sector', (f) => SECTORS.map((s) => +(f.sector === s))],
  ['size', 'Size, per 10× TVL', (f) => [f.size]], ['growth', '7-day growth vs market', (f) => [f.growth]]];

/** The label, from the snapshot's own fields: a token on record = mcap_usd above 0, or a gecko_id or a symbol. */
const hasToken = (p) => R.tokenStatus(p) !== 'none';
function featuresOf(p, asOf, marketWeek) {
  const age = R.ageDays(asOf, p.listed_at);
  return { age: age == null ? 0 : Math.log2(Math.max(age, 30) / 365), sector: R.sectorOf(p.category), size: R.log10(p.tvl_usd) - 8, growth: R.excessGrowth(p.change_7d, marketWeek) * 10 };
}
const rowOf = (f, terms) => [1, ...ODDS_TERMS.filter(([k]) => terms[k]).flatMap(([, , cols]) => cols(f))];

/** Peers: every snapshot protocol the house's bridge, staking, exchange, versioned and wrapped rules leave in. */
function oddsModel(snapshot, marketWeek) {
  const peers = snapshot.protocols.filter((p) => !R.houseRule(p)).map((p) => ({ slug: p.slug, y: +hasToken(p), f: featuresOf(p, snapshot.as_of, marketWeek), listed: p.listed_at || '' }));
  const lad = oddsLadder(peers), w = fitLogistic(peers.map((q) => rowOf(q.f, lad.terms)), peers.map((q) => q.y));
  const names = ['Intercept', ...ODDS_TERMS.filter(([k]) => lad.terms[k]).flatMap(([k, label]) => k === 'sector' ? SECTORS : [label])];
  return { ...lad, w, names, n: peers.length, tokens: peers.filter((q) => q.y).length, peers,
    launchOdds: (p) => sigmoid(dot(w, rowOf(featuresOf(p, snapshot.as_of, marketWeek), lad.terms))) };
}

/** Base rate, then each term on top of what is kept. Ten-fold: peers in slug order, fold = place mod 10.
 *  Older to newer: the two thirds listed first are fitted, the newest third is scored. */
function oddsLadder(peers) {
  const order = [...peers].sort((a, b) => (a.listed < b.listed ? -1 : a.listed > b.listed ? 1 : 0)), cut = Math.round(order.length * (1 - ODDS.newerShare));
  const older = order.slice(0, cut), newer = order.slice(cut);
  const score = (terms) => {
    const guess = (train, test) => {
      if (!terms) { const rate = train.reduce((s, q) => s + q.y, 0) / train.length; return test.map(() => rate); }
      const w = fitLogistic(train.map((q) => rowOf(q.f, terms)), train.map((q) => q.y));
      return test.map((q) => sigmoid(dot(w, rowOf(q.f, terms))));
    };
    let sq = 0;
    for (let k = 0; k < ODDS.folds; k++) {
      const test = peers.filter((_, i) => i % ODDS.folds === k), p = guess(peers.filter((_, i) => i % ODDS.folds !== k), test);
      test.forEach((q, i) => { sq += (p[i] - q.y) ** 2; });
    }
    const pn = guess(older, newer);
    return { ten: sq / peers.length, walk: newer.reduce((s, q, i) => s + (pn[i] - q.y) ** 2, 0) / newer.length };
  };
  const base = score(null);
  let terms = {}, standing = base;
  const ladder = [{ name: 'Base rate, no terms', ...base, base: true }, ...ODDS_TERMS.map(([key, label]) => {
    const t = score({ ...terms, [key]: 1 }), kept = t.ten < standing.ten && t.walk < standing.walk;
    if (kept) { standing = t; terms = { ...terms, [key]: 1 }; }
    return { name: '+ ' + label, key, ...t, kept };
  })];
  return { ladder, terms, base, full: standing, older: older.length, newer: newer.length };
}

function fitLogistic(X, y, ridge = ODDS.ridge) {
  const k = X[0].length, mean = y.reduce((s, v) => s + v, 0) / y.length, w = Array(k).fill(0);
  w[0] = Math.log((mean + 1e-3) / (1 - mean + 1e-3));
  for (let step = 0; step < ODDS.steps; step++) {
    const g = Array(k).fill(0), H = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < X.length; i++) {
      const x = X[i], p = sigmoid(dot(w, x)), r = p * (1 - p);
      for (let a = 0; a < k; a++) { g[a] += (y[i] - p) * x[a]; for (let b = 0; b <= a; b++) H[a][b] += r * x[a] * x[b]; }
    }
    for (let a = 0; a < k; a++) { for (let b = 0; b < a; b++) H[b][a] = H[a][b]; if (a) { g[a] -= ridge * w[a]; H[a][a] += ridge; } }
    const d = solve(H, g);
    let big = 0;
    d.forEach((v, a) => { w[a] += v; big = Math.max(big, Math.abs(v)); });
    if (big < 1e-9) break;
  }
  return w;
}

/** Resample with replacement (seeded), refit, and report the spread of each main coefficient. */
function bootstrapSE(comps, valueTerms, odds) {
  const rand = mulberry32(ODDS.seed), pick = (list) => list.map(() => list[Math.floor(rand() * list.length)]);
  const value = { b: [], chains: [] }, w = odds.w.map(() => []);
  for (let i = 0; i < ODDS.boots; i++) {
    const f = R.fitCurve(pick(comps), valueTerms);
    for (const k in value) value[k].push(f[k]);
    const s = pick(odds.peers), wi = fitLogistic(s.map((q) => rowOf(q.f, odds.terms)), s.map((q) => q.y));
    wi.forEach((v, j) => w[j].push(v));
  }
  return { boots: ODDS.boots, seed: ODDS.seed, value: Object.fromEntries(Object.entries(value).map(([k, list]) => [k, sd(list)])), odds: w.map(sd) };
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const dot = (w, x) => w.reduce((s, v, i) => s + v * x[i], 0);
const sd = (list) => { const m = list.reduce((s, v) => s + v, 0) / list.length; return Math.sqrt(list.reduce((s, v) => s + (v - m) ** 2, 0) / (list.length - 1)); };
function solve(A, b) {   // Gaussian elimination with partial pivoting
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
  }
  const x = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j]; x[r] = s / M[r][r]; }
  return x;
}
function mulberry32(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

Object.assign(R, { oddsModel, bootstrapSE, ODDS });
})(globalThis);
