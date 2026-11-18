/* Token Radar, the model. ONE file prices everything: main.ts requires it to write board.json, and the page
 * loads it to recompute every figure from the snapshot in ../data.js, then checks itself against board.json.
 * No protocol is priced by name; the only names are the house rule's eight exchanges. */
(function (root) {
'use strict';

var CONFIG = {
  version: 'comps-curve-odds-4',
  pseudoComps: 4,       // zero-effect comps that pull each sector's effect toward the curve
  receiptBand: 0.015,   // cap within 1.5% of TVL: the 'token' is the deposit receipt, not a launch
  growthCap: 0.4,       // excess 7-day growth carried forward, capped at +-40%
  ageShare: 0.25,       // a quarter of the fitted age slope: newer tokens price richer in every cohort
  ageClamp: [0.9, 1.15], // the blind test gains little from it, so the tilt is kept slight
  youngDays: 540,       // under 18 months on record blind prices miss far wider: a wider range
  kinToken: 0.25,       // a watchlist row whose name stem already carries a token on record
  ridge: 1,             // launch odds: L2 pull of every coefficient toward 0 (not the intercept)
  bands: [0.5, 0.8],    // the two ranges printed: half and four in five of held-out tokens inside
  capital: 1000, airdropShare: 0.10, tbill: 0.04, pointsWindow: 365
};

/* ---- 1. VALUE IF IT LAUNCHES, with the protocol's record as it stands:
 *   value = 10^a x TVL^b  x sector  x (1 + excess growth)^b  x age factor  x kinship
 * a, b, the sector effects and the age slope are all fitted on the snapshot's own traded tokens. */
function impliedValue(p, fit, ctx) {
  var sector = sectorOf(p.category), age = ageDays(ctx.asOf, p.listed_at), excess = excessGrowth(p.change_7d, ctx.marketWeek);
  var curve = Math.pow(10, fit.a + fit.b * log10(p.tvl_usd));   // TVL: a dollar of it is worth less in a big protocol
  var factors = [
    ['Sector', Math.pow(10, fit.sector[sector] || 0)],          // how its sector's tokens trade against the curve
    ['Momentum', Math.pow(1 + excess, fit.b)],                  // seven-day growth, read against the market's week
    ['Time with no token', ageFactor(fit, age)],
    // filed under a parent: one launch shared with siblings, and on a curve of slope b half a family is worth 2^(b-1)
    ['Kinship', ctx.kin === 'token' ? CONFIG.kinToken : ctx.kin === 'parent' ? Math.pow(2, fit.b - 1) : 1]
  ];
  var value = factors.reduce(function (v, f) { return v * f[1]; }, curve);
  return { value: Math.max(1, Math.round(value)), curve: curve, factors: factors, sector: sector, age: age, excess: excess };
}
/** A week's growth against the market: this snapshot's median protocol lost TVL that week. */
function excessGrowth(change7d, marketWeek) {
  return change7d == null ? 0 : clamp((1 + change7d / 100) / (1 + marketWeek / 100) - 1, -CONFIG.growthCap, CONFIG.growthCap);
}
function ageFactor(fit, age) {
  return age == null || !fit.ageSlope ? 1 : clamp(Math.pow(10, fit.ageSlope * (log10(Math.max(age, 30)) - fit.ageRef)), CONFIG.ageClamp[0], CONFIG.ageClamp[1]);
}

/** The fit. level 0: one flat cap/TVL multiple. 1: the size curve. 2: + sector. 3: + momentum and age. */
function fitCurve(comps, level) {
  if (!level) return { level: 0, a: median(comps.map(function (c) { return c.y - c.x; })), b: 1, sector: {}, ageSlope: 0, ageRef: 0 };
  var line = theilSen(comps.map(function (c) { return [c.x, c.y]; }));
  var fit = { level: level, a: line.a, b: line.b, sector: {}, ageSlope: 0, ageRef: 0 };
  if (level < 2) return fit;
  var bySector = {};
  comps.forEach(function (c) { (bySector[c.sector] = bySector[c.sector] || []).push(c.y - fit.a - fit.b * c.x); });
  for (var s in bySector) fit.sector[s] = bySector[s].length * median(bySector[s]) / (bySector[s].length + CONFIG.pseudoComps);
  if (level < 3) return fit;
  var dated = comps.filter(function (c) { return c.age; }).map(function (c) { return [log10(c.age), c.y - fit.a - fit.b * c.x - fit.sector[c.sector]]; });
  fit.ageSlope = theilSen(dated).b * CONFIG.ageShare;
  fit.ageRef = median(dated.map(function (d) { return d[0]; }));
  return fit;
}
/** log10 of the cap a fit gives a protocol: used on comps held out of the fit and on the board alike. */
function predictLog(fit, c) {
  var y = fit.a + fit.b * c.x + (fit.sector[c.sector] || 0);
  return fit.level < 3 ? y : y + fit.b * log10(1 + c.excess) + log10(ageFactor(fit, c.age));
}

/** Comparables: one per token that trades, its family's TVL summed (listings sharing ticker and name stem). */
function buildComps(snapshot, marketWeek) {
  var siblings = snapshot.protocols.filter(function (p) { return tokenStatus(p) === 'on-record' && p.symbol; });
  return snapshot.protocols.filter(function (p) { return tokenStatus(p) === 'trades'; }).map(function (p) {
    var s = stem(p.name), tvl = p.tvl_usd, members = 1;
    siblings.forEach(function (q) {
      var t = stem(q.name);
      if (q.symbol === p.symbol && (t === s || (Math.min(t.length, s.length) > 3 && (t.indexOf(s) === 0 || s.indexOf(t) === 0)))) { tvl += q.tvl_usd; members++; }
    });
    return {
      slug: p.slug, name: p.name, symbol: p.symbol || p.gecko_id, sector: sectorOf(p.category),
      tvl: tvl, mcap: p.mcap_usd, members: members, age: ageDays(snapshot.as_of, p.listed_at), excess: excessGrowth(p.change_7d, marketWeek),
      x: log10(tvl), y: log10(p.mcap_usd),
      skip: HOUSE_CATEGORIES.indexOf(p.category) >= 0 ? 'prices a chain, exchange or staked asset'
        : Math.abs(p.mcap_usd / tvl - 1) < CONFIG.receiptBand ? 'receipt token: cap equals TVL' : null
    };
  });
}
var isOlder = function (c) { return !c.age || c.age >= 900; };   // the older-to-newer split: 900+ days on record, or undated

/** The test: every traded token priced blind at each step of the model, two ways. Each left out: a fit on
 *  all the others. Older-to-newer: a fit on the older tokens prices the newer. */
function backtest(comps) {
  var miss = function (errors) {
    var abs = errors.map(Math.abs);
    return { miss: Math.pow(10, median(abs)), within3: abs.filter(function (e) { return e <= log10(3); }).length / abs.length, n: abs.length };
  };
  var older = comps.filter(isOlder), newer = comps.filter(function (c) { return !isOlder(c); });
  var ladder = ['One flat cap/TVL multiple', '+ size curve (TVL^b)', '+ sector', '+ 7-day growth, age'].map(function (name, level) {
    var errors = comps.map(function (c, i) {
      var e = c.y - predictLog(fitCurve(comps.filter(function (_, j) { return j !== i; }), level), c);
      if (level === 3) c.blind = Math.pow(10, c.y - e);
      return e;
    });
    var f = fitCurve(older, level), r = miss(errors);
    r.name = name; r.split = miss(newer.map(function (c) { return c.y - predictLog(f, c); }));
    return r;
  });
  return { ladder: ladder, older: older.length, newer: newer.length };
}

/* ---- 2. LAUNCH ODDS, learnt from the snapshot's own record: every launch candidate (one per token family,
 * none the house rule sets aside) is 1 if it records a token, else 0, and a ridge logistic fit reads it.
 * Figures are read today, not on launch day: odds say how much a row looks like protocols that launched. */
var ODDS_STEPS = [
  ['Base rate alone', []],
  ['+ time on record', ['age', 'undated']],
  ['+ TVL', ['size']],
  ['+ sector', ['Vaults', 'Dollars', 'RWA', 'Lending', 'Trading']],
  ['+ 7-day growth, chains', ['momentum', 'reach']]
];
function oddsX(c, names) {
  var f = { age: c.age == null ? 0 : log10(Math.max(c.age, 30)) - 2.7, undated: c.age == null ? 1 : 0,
    size: log10(c.tvl) - 8, momentum: c.excess, reach: log10(c.chains) };
  return [1].concat(names.map(function (n) { return n in f ? f[n] : c.sector === n ? 1 : 0; }));
}
/** Ridge logistic regression by Newton steps; `w` warm-starts a refit (two steps then suffice). */
function fitLogit(X, y, w, steps) {
  var k = X[0].length, s, i, a, b;
  w = w ? w.slice() : X[0].map(function () { return 0; });
  for (s = 0; s < steps; s++) {
    var g = w.map(function (v, a) { return a ? -CONFIG.ridge * v : 0; });
    var H = w.map(function (_, a) { return w.map(function (_, b) { return a === b && a ? CONFIG.ridge : 0; }); });
    for (i = 0; i < X.length; i++) {
      var x = X[i], p = sigmoid(dot(w, x)), q = p * (1 - p);
      for (a = 0; a < k; a++) { g[a] += (y[i] - p) * x[a]; for (b = 0; b <= a; b++) H[a][b] += q * x[a] * x[b]; }
    }
    for (a = 0; a < k; a++) for (b = a + 1; b < k; b++) H[a][b] = H[b][a];
    w = solve(H, g).map(function (d, a) { return w[a] + d; });
  }
  return w;
}
/** One odds step, tested each left out and newest third by listing date (fit on the older and undated). */
function oddsStep(cands, level) {
  var names = [].concat.apply([], ODDS_STEPS.slice(1, level + 1).map(function (s) { return s[1]; }));
  var X = cands.map(function (c) { return oddsX(c, names); }), y = cands.map(function (c) { return c.y; });
  var full = fitLogit(X, y, null, 8);
  var loo = cands.map(function (_, i) {
    var keep = function (_, j) { return j !== i; };
    return sigmoid(dot(fitLogit(X.filter(keep), y.filter(keep), full, 2), X[i]));
  });
  var dated = cands.filter(function (c) { return c.listed; }).map(function (c) { return c.listed; }).sort(), cut = dated[Math.floor(dated.length * 2 / 3)];
  var isNew = cands.map(function (c) { return !!c.listed && c.listed >= cut; }), old = function (_, i) { return !isNew[i]; };
  var w = fitLogit(X.filter(old), y.filter(old), null, 8), split = [];
  cands.forEach(function (c, i) { if (isNew[i]) split.push([sigmoid(dot(w, X[i])), c.y]); });
  return { name: ODDS_STEPS[level][0], level: level, w: full, names: names, loo: loo, cut: cut,
    each: score(loo.map(function (p, i) { return [p, y[i]]; })), split: score(split) };
}
function score(pairs) {
  var right = pairs.filter(function (p) { return (p[0] >= 0.5) === (p[1] === 1); }).length;
  var loss = pairs.reduce(function (s, p) { return s - Math.log(Math.max(1e-9, p[1] ? p[0] : 1 - p[0])); }, 0) / pairs.length;
  return { right: right, n: pairs.length, acc: right / pairs.length, loss: loss };
}
/** Launch candidates: every token family the house rule keeps (its TVL summed, its oldest listing), and every board row. */
function launchCandidates(snapshot, rows, marketWeek) {
  var fam = {};
  snapshot.protocols.forEach(function (p) {
    if (tokenStatus(p) === 'none' || houseRule(p)) return;
    var k = p.gecko_id || p.symbol, f = fam[k], age = ageDays(snapshot.as_of, p.listed_at);
    if (!f) f = fam[k] = { y: 1, tvl: 0, age: age, listed: p.listed_at, top: 0, on: {} };
    f.tvl += p.tvl_usd; p.chains.forEach(function (ch) { f.on[ch] = 1; });
    if (age != null && (f.age == null || age > f.age)) { f.age = age; f.listed = p.listed_at; }
    if (p.tvl_usd > f.top) { f.top = p.tvl_usd; f.sector = sectorOf(p.category); f.excess = excessGrowth(p.change_7d, marketWeek); }
  });
  return Object.keys(fam).sort().map(function (k) { var f = fam[k]; f.chains = Math.max(1, Object.keys(f.on).length); return f; }).concat(rows.map(function (r) {
    return { y: 0, tvl: r.tvl, age: r.age, listed: r.listed, sector: r.sector, excess: r.excess, chains: Math.max(1, r.chains.length), row: r };
  }));
}
/** Every step tested; a step is kept only if it lowers the held-out log loss of the last one kept, so each
 *  feature earns its place. Each board row's odds is its own each-left-out prediction: a fit that never saw it. */
function launchOdds(cands) {
  var steps = ODDS_STEPS.map(function (_, level) { return oddsStep(cands, level); }), kept = steps[0];
  steps.forEach(function (s) { s.kept = s.level === 0 || s.each.loss < kept.each.loss; if (s.kept) kept = s; });
  cands.forEach(function (c, i) { if (c.row) c.row.odds = kept.loo[i]; });
  var base = cands.filter(function (c) { return c.y; }).length / cands.length;
  return { steps: steps, kept: kept, n: cands.length, tokens: Math.round(base * cands.length), base: base,
    baseAcc: Math.max(base, 1 - base), calib: calibrate(kept.loo.map(function (p, i) { return [p, cands[i].y]; })) };
}
/** Held-out odds in five bins against how often those protocols really record a token. */
function calibrate(pairs) {
  return [0, 0.2, 0.4, 0.6, 0.8].map(function (lo) {
    var bin = pairs.filter(function (p) { return p[0] >= lo && (p[0] < lo + 0.2 || lo === 0.8); });
    return { lo: lo, n: bin.length, said: bin.length ? mean(bin.map(function (p) { return p[0]; })) : 0, saw: bin.length ? mean(bin.map(function (p) { return p[1]; })) : 0 };
  });
}

/* ---- 3. RANGES. Each band is the conformal quantile of the blind misses of tokens like it (under or over
 * 18 months on record), then tested on tokens it never saw: each left out, and older-to-newer. */
function bandWidth(misses, level) {
  var s = misses.slice().sort(function (a, b) { return a - b; });
  return s.length ? s[Math.min(s.length - 1, Math.ceil((s.length + 1) * level) - 1)] : 0;   // log10 of the factor
}
function rangeTest(comps) {
  var miss = function (c) { return Math.abs(c.y - log10(c.blind)); }, young = function (c) { return c.age != null && c.age < CONFIG.youngDays; };
  var groups = { young: comps.filter(young), seasoned: comps.filter(function (c) { return !young(c); }) };
  var width = {}, each = CONFIG.bands.map(function (level) {
    for (var g in groups) (width[g] = width[g] || []).push(bandWidth(groups[g].map(miss), level));
    return comps.filter(function (c) {
      var g = young(c) ? 'young' : 'seasoned', others = groups[g].filter(function (o) { return o !== c; }).map(miss);
      return miss(c) <= bandWidth(others, level);
    }).length;
  });
  // older-to-newer: fit, blind misses and band widths all from the older tokens; then the newer priced
  var older = comps.filter(isOlder), newer = comps.filter(function (c) { return !isOlder(c); }), f = fitCurve(older, 3);
  var olderMiss = older.map(function (c, i) { return Math.abs(c.y - predictLog(fitCurve(older.filter(function (_, j) { return j !== i; }), 3), c)); });
  var split = CONFIG.bands.map(function (level) {
    var w = bandWidth(olderMiss, level);
    return newer.filter(function (c) { return Math.abs(c.y - predictLog(f, c)) <= w; }).length;
  });
  return { width: width, each: each, n: comps.length, split: split, newer: newer.length, young: groups.young.length };
}

/* ---- 4. FARM PLANS. Ten plays by mechanism. tx: transactions to [enter, qualify, each week, exit].
 * pct: fees as a share of the ticket [once, each week]. carry: yearly interest as a share of the ticket.
 * min: minutes to [enter, qualify, each week]. {C} is the ticket, {C/4} a quarter of it. */
var PLAYS = {
  vault: { label: 'Curated vault', hold: 90, tx: [2, 0, 0, 1], pct: [0, 0], carry: 0, min: [10, 5, 5],
    enter: 'Approve and deposit {C} USDC into {N}\'s largest vault on {chain}; keep the vault shares in this wallet.',
    qualify: 'Join {N}\'s points or referral page with this wallet in week one, if it has one; do not move the deposit.',
    watch: 'note the vault\'s share price and TVL', stop: 'the share price falls while its asset is flat' },
  lend: { label: 'Supply and borrow', hold: 90, tx: [2, 1, 0, 2], pct: [0, 0], carry: 0.0075, min: [10, 10, 5],
    enter: 'Approve and supply {C} USDC to {N} on {chain}.',
    qualify: 'Borrow {C/4} of a stablecoin against it and hold it: both sides earn credit. About 3% a year; keep health above 2.',
    watch: 'check the health factor and the supply rate', stop: 'health nears 1.5 or utilisation pins at 100%' },
  dollar: { label: 'Yield dollar', hold: 90, tx: [2, 1, 0, 2], pct: [0.001, 0], carry: 0, min: [10, 5, 5],
    enter: 'Mint or buy {C} of {N}\'s dollar on {chain} with USDC, about 0.1% in fees.',
    qualify: 'Stake it into its yield-bearing form in {N}\'s own app, where points accrue; a DEX pool does not count.',
    watch: 'check the peg and the backing report', stop: 'it trades under $0.995 for a day or backing is under 100%' },
  cdp: { label: 'Mint against collateral', hold: 90, tx: [2, 1, 0, 2], pct: [0, 0], carry: 0.0167, min: [15, 5, 5],
    enter: 'Lock {C} of collateral on {N} on {chain} and mint {C/3} of its stablecoin: a 300% ratio, about 5% a year.',
    qualify: 'Put the minted stablecoin in {N}\'s savings or stability module, so debt and deposit both count.',
    watch: 'check the collateral ratio and the peg', stop: 'the ratio falls under 200% or the stablecoin slips under $0.99' },
  rwa: { label: 'Tokenised asset', hold: 90, tx: [2, 0, 0, 1], pct: [0.002, 0], carry: 0, min: [15, 20, 5], qualifyFirst: true,
    enter: 'Mint or buy {C} of {N}\'s tokenised asset on {chain}, about 0.2% in fees; read the redemption notice first.',
    qualify: 'Pass {N}\'s KYC or whitelist form with this wallet before funding it, if asked; allow 1 to 3 days.',
    watch: 'check NAV and the redemption queue', stop: 'redemptions pause or NAV is marked down' },
  pool: { label: 'Liquidity and swaps', hold: 60, tx: [3, 0, 1, 1], pct: [0, 0.0003], carry: 0, min: [15, 5, 10],
    enter: 'Approve both tokens and add {C} to {N}\'s deepest pool on {chain}, in its most liquid pair.',
    qualify: 'Set a weekly reminder for one {C/10} swap through {N}\'s own router (0.3% fee): programmes score fees and active weeks.',
    watch: 'make the swap and check the pool\'s range', stop: 'impermanent loss passes 2%' },
  perps: { label: 'Margin and volume', hold: 60, tx: [2, 0, 2, 1], pct: [0, 0.001], carry: 0, min: [10, 5, 15],
    enter: 'Deposit {C} USDC as margin on {N} on {chain}.',
    qualify: 'Set a weekly reminder for one round trip: open and close {C} of notional at 1x on a major pair, 0.05% taker fee each way.',
    watch: 'make the round trip and total fees and funding', stop: 'fees and funding pass 3% of margin' },
  market: { label: 'Prediction volume', hold: 60, tx: [2, 0, 2, 1], pct: [0, 0.001], carry: 0, min: [10, 5, 15],
    enter: 'Deposit {C} USDC on {N} on {chain}.',
    qualify: 'Set a weekly reminder for one trade: buy then sell {C/4} of shares in a liquid market priced 0.20 to 0.80, with limit orders.',
    watch: 'make the trade and total the spread paid', stop: 'spread and fees pass 3% of the deposit' },
  stake: { label: 'Stake or restake', hold: 90, tx: [2, 1, 0, 2], pct: [0, 0], carry: 0, min: [10, 10, 5],
    enter: 'Stake or restake {C} of the asset {N} accepts on {chain}; note the unbonding period first.',
    qualify: 'Delegate to an operator or pool in {N}\'s own app; keep the receipt token in this wallet.',
    watch: 'check the operator\'s status and reward rate', stop: 'the operator is slashed or withdrawals queue over a week' },
  network: { label: 'Use the network', hold: 90, tx: [2, 0, 1, 1], pct: [0, 0], carry: 0, min: [15, 5, 5],
    enter: 'Move {C} onto {N} on {chain} through its own bridge or app, so the activity is credited to this wallet.',
    qualify: 'Set a weekly reminder for one real transfer, payment or contract call: network drops count active weeks and actions.',
    watch: 'make the transaction and check the fee', stop: 'the bridge pauses withdrawals' }
};
var PLAY_OF = { Lending: 'lend', 'Uncollateralized Lending': 'lend', 'Collateral Markets': 'lend', CDP: 'cdp', 'CDP Manager': 'cdp', Dexs: 'pool',
  'Prediction Market': 'market', Restaking: 'stake', 'Staking Pool': 'stake', 'Governance Incentives': 'stake', Insurance: 'stake' };
var PLAY_OF_SECTOR = { Vaults: 'vault', Dollars: 'dollar', RWA: 'rwa', Lending: 'lend', Trading: 'perps', Network: 'network' };
function playOf(category) { return PLAY_OF[category] || PLAY_OF_SECTOR[sectorOf(category)]; }
// [gas per transaction, fee to fund the wallet from an exchange] in dollars, by DefiLlama's chain names
var CHAIN_COST = {
  Ethereum: [2.5, 4], Bitcoin: [1.5, 2], Tron: [1, 1.5], Binance: [0.1, 0.3], Avalanche: [0.05, 0.5], Polygon: [0.01, 0.3],
  Solana: [0.005, 1], Sui: [0.005, 0.5], Aptos: [0.005, 0.5], Stellar: [0.001, 0.2], Algorand: [0.001, 0.2],
  Base: [0.03, 0.5], Arbitrum: [0.03, 0.5], Optimism: [0.03, 0.5], Ink: [0.03, 1], Monad: [0.01, 1], 'Hyperliquid L1': [0.01, 1]
};
function chainCost(chain) { return CHAIN_COST[chain] || [0.05, 1.5]; }   // any other chain
/** A protocol's first three chains hold most of its TVL; the plan runs on the cheapest of them. */
function farmChain(chains) {
  return chains.slice(0, 3).sort(function (a, b) { return chainCost(a)[0] - chainCost(b)[0] || chains.indexOf(a) - chains.indexOf(b); })[0] || 'its main chain';
}

/** One row's farm plan: eight steps, each [verb, what to do, dollars, minutes], then the sums.
 *  slice = value x odds x airdrop share x this ticket's dollar-days / everyone's; deposits already in count
 *  half its days with no token (TVL grown in a straight line, a year at most).
 *  net = slice - fees - the T-bill yield the ticket gives up. FARM: net > 0. THIN: covers fees only. */
function farmPlan(row, opts) {
  opts = opts || {};
  var C = opts.capital || CONFIG.capital, share = opts.share || CONFIG.airdropShare;
  var play = PLAYS[playOf(row.category)], chain = farmChain(row.chains), gas = chainCost(chain)[0], fund = chainCost(chain)[1];
  var H = play.hold, weeks = Math.round(H / 7), N = row.name;
  var text = function (t) {
    return t.replace(/\{C(\/\d+)?\}/g, function (_, d) { return usd(d ? C / +d.slice(1) : C); }).replace(/\{N\}/g, N).replace(/\{chain\}/g, chain);
  };
  var ahead = Math.min(row.age == null ? CONFIG.pointsWindow : row.age, CONFIG.pointsWindow) / 2;
  var slice = row.expected * share * C / (row.tvl + C) * H / (ahead + H);
  var gasBudget = Math.max(1, Math.ceil(2 * gas * (play.tx[0] + play.tx[1] + weeks * play.tx[2] + play.tx[3] + 2)));   // twice the plan's gas
  var steps = [
    ['Fund', 'Withdraw ' + usd(C) + ' (USDC, or the asset it takes) and ' + usd(gasBudget) + ' for gas from an exchange to a fresh wallet on ' + chain + ', used for this farm only.', fund, 10],
    ['Verify', 'Open ' + N + ' from defillama.com/protocol/' + row.slug + ', not a search ad; check contracts, audits, that it still lists no token, and any points page.', 0, 15],
    ['Enter', text(play.enter), play.tx[0] * gas + play.pct[0] * C, play.min[0]],
    ['Qualify', text(play.qualify), play.tx[1] * gas + play.carry * C * H / 365, play.min[1]],
    ['Upkeep', 'Each week for ' + weeks + ' weeks, ' + play.watch + '; log it.', weeks * (play.tx[2] * gas + play.pct[1] * C), weeks * play.min[2]],
    ['Stop rule', 'Leave early if ' + play.stop + ', TVL drops under ' + usd(row.tvl * 0.7) + ' (-30%), or a token is announced with nothing for depositors.', 0, 5],
    ['Claim', 'If a token launches (' + Math.round(row.odds * 100) + '% odds), claim only from ' + N + '\'s own site, never pay to claim, then revoke approvals. At ' + usd(row.value) + ' if it launches this ticket\'s slice is ' + usd(slice / row.odds) + ', ' + usd(slice) + ' after the odds.', gas, 10],
    ['Exit', 'After ' + H + ' days or at the claim, unwind the position and send the funds back to the exchange.', (play.tx[3] + 1) * gas, 10]
  ];
  if (play.qualifyFirst) steps.splice(2, 2, steps[3], steps[2]);
  var fees = steps.reduce(function (s, x) { return s + x[2]; }, 0), minutes = steps.reduce(function (s, x) { return s + x[3]; }, 0);
  var forgone = C * CONFIG.tbill * H / 365, net = slice - fees - forgone;
  // fees split into a fixed part (gas, funding) and a part that scales with the ticket, for the break-even
  var scaling = C * (play.pct[0] + weeks * play.pct[1] + play.carry * H / 365), perDollar = (slice - scaling - forgone) / C;
  return {
    play: playOf(row.category), label: play.label, chain: chain, hold: H, weeks: weeks, capital: C, share: share, ahead: ahead,
    steps: steps, fees: fees, minutes: minutes, forgone: forgone, slice: slice, net: net,
    perHour: net / (minutes / 60), verdict: net > 0 ? 'FARM' : slice > fees ? 'THIN' : 'SKIP',
    breakEven: perDollar > 0 ? (fees - scaling) / perDollar : null
  };
}
/** The strings board.json carries: one per step, with its cost and its time. */
function stepStrings(plan) {
  return plan.steps.map(function (s) {
    return s[0] + ': ' + s[1] + ' Cost: ' + (s[2] ? usd(s[2]) : 'nothing') + '. Time: ' + s[3] + ' min' + (s[0] === 'Upkeep' ? ' over ' + plan.hold + ' days' : '') + '.';
  });
}

/* ---- 5. THE WHOLE RADAR: who has a token, who is set aside and why, then rank the rest by expected value. */
function buildRadar(snapshot) {
  var protocols = snapshot.protocols, watch = {}, tokenStems = {};
  snapshot.watchlist.forEach(function (s) { watch[s] = true; });
  protocols.forEach(function (p) { if (tokenStatus(p) !== 'none') tokenStems[stem(p.name)] = p.symbol || p.gecko_id; });
  var marketWeek = median(protocols.filter(function (p) { return p.change_7d != null; }).map(function (p) { return p.change_7d; }));
  var tokens = buildComps(snapshot, marketWeek), comps = tokens.filter(function (c) { return !c.skip; });
  var fit = fitCurve(comps, 3), tests = backtest(comps), ranges = rangeTest(comps), ctx = { asOf: snapshot.as_of, marketWeek: marketWeek };
  var rows = [], aside = [];
  protocols.forEach(function (p) {
    var listed = !!watch[p.slug], kinSymbol = tokenStems[stem(p.name)];
    if (tokenStatus(p) !== 'none' && !listed) return;            // a token trades or is on record: kept apart
    var reason = listed ? null : houseRule(p) || (kinSymbol ? 'Kin of a token' : null);
    if (reason) { aside.push({ name: p.name, category: p.category, tvl: p.tvl_usd, reason: reason, kin: kinSymbol }); return; }
    // above the floor and clear of every rule, yet off the watchlist: DefiLlama files it under a parent
    ctx.kin = kinSymbol ? 'token' : !listed && p.tvl_usd >= snapshot.floor_usd ? 'parent' : null;
    var v = impliedValue(p, fit, ctx), young = v.age != null && v.age < CONFIG.youngDays && ranges.young > 0;
    var w = ranges.width[young ? 'young' : 'seasoned'], s50 = Math.pow(10, w[0]), s80 = Math.pow(10, w[1]);
    rows.push({
      slug: p.slug, name: p.name, category: p.category || 'Uncategorised', sector: v.sector, chains: p.chains, tvl: p.tvl_usd,
      change7d: p.change_7d, excess: v.excess, age: v.age, listed: p.listed_at, tier: listed ? 'watchlist' : ctx.kin === 'parent' ? 'shared' : 'early',
      kin: kinSymbol || null, value: v.value, curve: v.curve, factors: v.factors, young: young, spread: s50, spread80: s80,
      low: v.value / s50, high: v.value * s50, low80: v.value / s80, high80: v.value * s80
    });
  });
  var odds = launchOdds(launchCandidates(snapshot, rows, marketWeek));
  // the board's implied value: what a launch would be worth, times the odds that it happens
  rows.forEach(function (r) { r.expected = Math.max(1, Math.round(r.value * r.odds)); });
  rows.sort(function (a, b) { return b.expected - a.expected || (a.slug < b.slug ? -1 : 1); });
  rows.forEach(function (r, i) { r.rank = i + 1; r.plan = farmPlan(r); });
  aside.sort(function (a, b) { return b.tvl - a.tvl; });
  return {
    asOf: snapshot.as_of, marketWeek: marketWeek, fit: fit, tests: tests, ranges: ranges, odds: odds, tokens: tokens, comps: comps,
    rows: rows, aside: aside, ledger: ledgerOf(protocols, rows, tokens, aside),
    counts: { protocols: protocols.length, watchlist: snapshot.watchlist.length, noToken: rows.length + aside.length,
      onRecord: protocols.filter(function (p) { return tokenStatus(p) === 'on-record'; }).length }
  };
}

/** The page's proof that it shows what board.json holds: it recomputes the radar, then every row must
 *  match the [slug, rank, dollars, plan digest] main.ts wrote from board.json's rows. */
function checkBoard(rows, board) {
  var same = board.filter(function (b, i) {
    var r = rows[i];
    return r && r.slug === b[0] && r.rank === b[1] && r.expected === b[2] && digest(stepStrings(r.plan)) === b[3];
  }).length;
  return { same: same, of: board.length, ok: same === board.length && same === rows.length };
}

/* ---- 6. Reading the snapshot. */
/** 'trades' has a market cap, 'on-record' a ticker or CoinGecko id but no cap, 'none' neither. */
function tokenStatus(p) { return p.mcap_usd > 0 ? 'trades' : (p.gecko_id || p.symbol) ? 'on-record' : 'none'; }
var HOUSE_CATEGORIES = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];
/** The house's own watchlist rule (the kit's input/README.md), reused to audit protocols below its floor. */
function houseRule(p) {
  var i = HOUSE_CATEGORIES.indexOf(p.category);
  if (i >= 0) return i < 2 ? 'Bridge' : i < 5 ? 'Liquid staking' : 'Exchange custody';
  if (/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/.test(p.name)) return 'Exchange custody';
  if (/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)) return 'Versioned listing';
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return 'Wrapped or staked';
  return null;
}
/** Every protocol in the snapshot lands in exactly one group, each with the reason it is or is not ranked. */
function ledgerOf(protocols, rows, tokens, aside) {
  var groups = [['Ranked', rows.length, 'records no token; no rule sets it aside'],
    ['Token trades', tokens.length, 'a market cap: comparables, never ranked'],
    ['Token on record', protocols.filter(function (p) { return tokenStatus(p) === 'on-record'; }).length, 'a ticker or CoinGecko id, no cap']];
  ['Bridge', 'Liquid staking', 'Exchange custody', 'Versioned listing', 'Wrapped or staked', 'Kin of a token'].forEach(function (g) {
    groups.push([g, aside.filter(function (a) { return a.reason === g; }).length, g === 'Kin of a token' ? 'its name stem carries a token on record' : 'the house rule, applied below its floor']);
  });
  return groups;
}
function stem(name) { return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] || ''; }
function ageDays(asOf, listedAt) {
  return listedAt ? Math.max(0, Math.round((Date.parse(asOf + 'T00:00:00Z') - Date.parse(listedAt + 'T00:00:00Z')) / 864e5)) : null;
}
// six sectors, because DefiLlama's 40 categories leave most with one comparable or none
var SECTORS = {
  Vaults: 'Risk Curators|Onchain Capital Allocator|Yield|Yield Aggregator|Liquidity Manager|Leveraged Farming|Farm|Indexes|Options Vault',
  Dollars: 'Basis Trading|CDP|CDP Manager|Stablecoin Wrapper|Dual-Token Stablecoin|CeDeFi',
  RWA: 'RWA|RWA Lending',
  Lending: 'Lending|Uncollateralized Lending|Collateral Markets|Collateral Management',
  Trading: 'Dexs|Derivatives|Options|Prediction Market|Interest Rate Derivatives|OTC Marketplace|NFT Marketplace|Launchpad'
};
function sectorOf(category) {
  for (var s in SECTORS) if (SECTORS[s].split('|').indexOf(category) >= 0) return s;
  return 'Network';
}

/* ---- 7. Small maths and formats. */
function log10(x) { return Math.log(x) / Math.LN10; }
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
function median(values) {
  var s = values.slice().sort(function (a, b) { return a - b; }), i = (s.length - 1) / 2, lo = Math.floor(i);
  return s.length ? (s[lo] + s[Math.ceil(i)]) / 2 : 0;
}
function mean(values) { return values.reduce(function (s, v) { return s + v; }, 0) / values.length; }
function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
function dot(w, x) { return w.reduce(function (s, v, i) { return s + v * x[i]; }, 0); }
/** Gaussian elimination: the Newton step H d = g (H is positive definite, so no pivoting is needed). */
function solve(H, g) {
  var n = g.length, M = H.map(function (r, i) { return r.concat(g[i]); }), x = [], i, j, k;
  for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) { var f = M[j][i] / M[i][i]; for (k = i; k <= n; k++) M[j][k] -= f * M[i][k]; }
  for (i = n - 1; i >= 0; i--) { var s = M[i][n]; for (j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}
/** Theil-Sen line: the median of all pairwise slopes, so a 400x outlier cannot tilt the curve. */
function theilSen(points) {
  var slopes = [], i, j;
  for (i = 0; i < points.length; i++) for (j = i + 1; j < points.length; j++) {
    if (points[j][0] !== points[i][0]) slopes.push((points[j][1] - points[i][1]) / (points[j][0] - points[i][0]));
  }
  var b = median(slopes);
  return { a: median(points.map(function (p) { return p[1] - b * p[0]; })), b: b };
}
function usd(x) {
  var a = Math.abs(x), sign = x < 0 ? '-' : '';
  if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
  if (a >= 1e3) return sign + '$' + Math.round(a).toString().replace(/\B(?=(\d{3})+$)/g, ',');
  if (a > 0 && a < 0.01) return sign + '<$0.01';
  return sign + '$' + a.toFixed(a >= 100 ? 0 : 2);
}
/** FNV-1a, so the page can prove its plan text is the text board.json carries. */
function digest(strings) {
  var h = 2166136261, s = strings.join('\n'), i;
  for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

var api = { CONFIG: CONFIG, PLAYS: PLAYS, buildRadar: buildRadar, checkBoard: checkBoard, farmPlan: farmPlan, stepStrings: stepStrings, digest: digest, usd: usd, log10: log10, oddsX: oddsX, sigmoid: sigmoid };
root.Radar = api;
if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
