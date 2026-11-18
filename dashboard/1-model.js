/* Token Radar · the model. This one file prices everything: main.ts requires it to write board.json and the page
   loads it to recompute every figure from ../data.js, then checkBoard() holds the two to the same bytes.
   No protocol is priced by name; the only names below are the house rule's eight exchanges. */
(function (scope) {
'use strict';

const CONFIG = {
  version: 'comps-curve-3',
  pseudoComps: 4,         // zero-effect comparables that pull each sector's effect toward the curve
  receiptBand: 0.015,     // a cap within 1.5% of TVL is a deposit receipt, not a launch: no comparable
  growthCap: 0.4,         // a week's growth over the market, carried forward at most ±40%
  ageShare: 0.25,         // a quarter of the fitted age slope: newer tokens trade richer, but the blind test barely gains
  ageClamp: [0.9, 1.15],  // so the tilt stays slight
  youngDays: 540,         // under 18 months on record, blind prices miss far wider: those rows get a wider range
  kinToken: 0.25,         // a watchlist row whose name stem already carries a token on record
  capital: 1000, airdropShare: 0.10, tbill: 0.04, pointsWindow: 365,
};

// ════ 1 · VALUE: what a launch would be worth if the protocol's record stayed as it is
//   value = 10^a · TVL^b · sector · (1 + growth over the market)^b · age factor · kinship
// a, b, the sector effects and the age slope are all fitted on the snapshot's own traded tokens.
function impliedValue(p, fit, ctx) {
  const sector = sectorOf(p.category);
  const age = ageDays(ctx.asOf, p.listed_at);
  const excess = excessGrowth(p.change_7d, ctx.marketWeek);
  const curve = Math.pow(10, fit.a + fit.b * log10(p.tvl_usd));       // a dollar of TVL is worth less in a big protocol
  const kinship = ctx.kin === 'token' ? CONFIG.kinToken                // its stem already carries a token
    : ctx.kin === 'parent' ? Math.pow(2, fit.b - 1)                    // half of a two-listing family, on a curve of slope b
    : 1;
  const factors = [
    ['Sector', Math.pow(10, fit.sector[sector] || 0)],
    ['Momentum', Math.pow(1 + excess, fit.b)],
    ['Time with no token', ageFactor(fit, age)],
    ['Kinship', kinship],
  ];
  const value = factors.reduce((v, [, k]) => v * k, curve);
  return { value: Math.max(1, Math.round(value)), curve, factors, sector, age, excess };
}
/** A week's TVL growth read against the market's (this snapshot's median protocol shrank that week). */
const excessGrowth = (change7d, marketWeek) => change7d == null ? 0
  : clamp((1 + change7d / 100) / (1 + marketWeek / 100) - 1, -CONFIG.growthCap, CONFIG.growthCap);
const ageFactor = (fit, age) => age == null || !fit.ageSlope ? 1
  : clamp(Math.pow(10, fit.ageSlope * (log10(Math.max(age, 30)) - fit.ageRef)), CONFIG.ageClamp[0], CONFIG.ageClamp[1]);

/** The fit, by level. 0: one flat cap/TVL multiple. 1: the size curve. 2: + sector. 3: + momentum and age. */
function fitCurve(comps, level) {
  if (level === 0) return { level: 0, a: median(comps.map((c) => c.y - c.x)), b: 1, sector: {}, ageSlope: 0, ageRef: 0 };
  const line = theilSen(comps.map((c) => [c.x, c.y]));
  const fit = { level, a: line.a, b: line.b, sector: {}, ageSlope: 0, ageRef: 0 };
  if (level === 1) return fit;
  const left = {};   // each sector's residuals off the curve, shrunk toward zero by pseudo-comparables
  for (const c of comps) (left[c.sector] = left[c.sector] || []).push(c.y - fit.a - fit.b * c.x);
  for (const [s, res] of Object.entries(left)) fit.sector[s] = res.length * median(res) / (res.length + CONFIG.pseudoComps);
  if (level === 2) return fit;
  const dated = comps.filter((c) => c.age).map((c) => [log10(c.age), c.y - fit.a - fit.b * c.x - fit.sector[c.sector]]);
  fit.ageSlope = theilSen(dated).b * CONFIG.ageShare;
  fit.ageRef = median(dated.map(([lx]) => lx));
  return fit;
}
/** log10 of the cap a fit gives one comparable: the same sum impliedValue multiplies out. */
function predictLog(fit, c) {
  const base = fit.a + fit.b * c.x + (fit.sector[c.sector] || 0);
  if (fit.level < 3) return base;
  return base + fit.b * log10(1 + c.excess) + log10(ageFactor(fit, c.age));
}

/** One comparable per token that trades; listings sharing its ticker and name stem are one family whose TVL is summed. */
function buildComps(snapshot, marketWeek) {
  const tickers = snapshot.protocols.filter((p) => tokenStatus(p) === 'on-record' && p.symbol);
  const sameFamily = (s, t) => t === s || (Math.min(t.length, s.length) > 3 && (t.indexOf(s) === 0 || s.indexOf(t) === 0));
  return snapshot.protocols.filter((p) => tokenStatus(p) === 'trades').map((p) => {
    const own = stem(p.name);
    let tvl = p.tvl_usd, members = 1;
    for (const q of tickers) if (q.symbol === p.symbol && sameFamily(own, stem(q.name))) { tvl += q.tvl_usd; members++; }
    let skip = null;
    if (HOUSE_CATEGORIES.indexOf(p.category) >= 0) skip = 'prices a chain, exchange or staked asset';
    else if (Math.abs(p.mcap_usd / tvl - 1) < CONFIG.receiptBand) skip = 'receipt token: cap equals TVL';
    return {
      name: p.name, symbol: p.symbol || p.gecko_id, sector: sectorOf(p.category), tvl, mcap: p.mcap_usd, members,
      age: ageDays(snapshot.as_of, p.listed_at), excess: excessGrowth(p.change_7d, marketWeek),
      x: log10(tvl), y: log10(p.mcap_usd), skip,
    };
  });
}
const isOlder = (c) => !c.age || c.age >= 900;   // the older-to-newer split: 900+ days on record, or undated
const olderNewer = (comps) => [comps.filter(isOlder), comps.filter((c) => !isOlder(c))];
const without = (list, i) => list.filter((_, j) => j !== i);

/** Every traded token priced blind at each level, two ways: by a fit on all the others (each left out),
 *  and by a fit on the older tokens only (older-to-newer). Level 3's blind price is kept on each comparable. */
function backtest(comps) {
  const score = (errors) => {
    const abs = errors.map(Math.abs);
    return { miss: Math.pow(10, median(abs)), within3: abs.filter((e) => e <= log10(3)).length / abs.length, n: abs.length };
  };
  const [older, newer] = olderNewer(comps);
  const names = ['One flat cap/TVL multiple', '+ size curve (TVL^b)', '+ sector', '+ 7-day growth, age'];
  const ladder = names.map((name, level) => {
    const errors = comps.map((c, i) => {
      const e = c.y - predictLog(fitCurve(without(comps, i), level), c);
      if (level === 3) c.blind = Math.pow(10, c.y - e);
      return e;
    });
    const early = fitCurve(older, level);
    return Object.assign(score(errors), { name, split: score(newer.map((c) => c.y - predictLog(early, c))) });
  });
  return { ladder, older: older.length, newer: newer.length };
}

/** The printed range: half the blind misses of tokens like it (under or over 18 months on record) fall inside.
 *  Then tested on tokens it never saw: each left out against the others' misses, and older-to-newer. */
function rangeTest(comps) {
  const missOf = (c) => Math.abs(c.y - log10(c.blind));
  const isYoung = (c) => c.age != null && c.age < CONFIG.youngDays;
  const young = comps.filter(isYoung), seasoned = comps.filter((c) => !isYoung(c));
  const each = comps.filter((c) => {
    const peers = (isYoung(c) ? young : seasoned).filter((o) => o !== c);
    return missOf(c) <= median(peers.map(missOf));
  }).length;
  const [older, newer] = olderNewer(comps);
  const fitOld = fitCurve(older, 3);
  const width = median(older.map((c, i) => Math.abs(c.y - predictLog(fitCurve(without(older, i), 3), c))));
  return {
    young: Math.pow(10, median(young.map(missOf))), seasoned: Math.pow(10, median(seasoned.map(missOf))), nYoung: young.length,
    each, n: comps.length, split: newer.filter((c) => Math.abs(c.y - predictLog(fitOld, c)) <= width).length, newer: newer.length,
  };
}

// ════ 2 · FARM PLANS: ten plays by mechanism
// tx: transactions to [enter, qualify, each week, exit]; pct: fees as a share of the ticket [once, each week];
// carry: yearly interest on the ticket; min: minutes to [enter, qualify, each week]; {C} is the ticket, {C/4} a quarter.
const play = (label, hold, tx, pct, carry, min, enter, qualify, watch, stop, extra) =>
  Object.assign({ label, hold, tx, pct, carry, min, enter, qualify, watch, stop }, extra);
const PLAYS = {
  vault: play('Curated vault', 90, [2, 0, 0, 1], [0, 0], 0, [10, 5, 5],
    "Approve and deposit {C} USDC into {N}'s largest vault on {chain}; keep the vault shares in this wallet.",
    "Join {N}'s points or referral page with this wallet in week one, if it has one; do not move the deposit.",
    "note the vault's share price and TVL", 'the share price falls while its asset is flat'),
  lend: play('Supply and borrow', 90, [2, 1, 0, 2], [0, 0], 0.0075, [10, 10, 5],
    'Approve and supply {C} USDC to {N} on {chain}.',
    'Borrow {C/4} of a stablecoin against it and hold it: both sides earn credit. About 3% a year; keep health above 2.',
    'check the health factor and the supply rate', 'health nears 1.5 or utilisation pins at 100%'),
  dollar: play('Yield dollar', 90, [2, 1, 0, 2], [0.001, 0], 0, [10, 5, 5],
    "Mint or buy {C} of {N}'s dollar on {chain} with USDC, about 0.1% in fees.",
    "Stake it into its yield-bearing form in {N}'s own app, where points accrue; a DEX pool does not count.",
    'check the peg and the backing report', 'it trades under $0.995 for a day or backing is under 100%'),
  cdp: play('Mint against collateral', 90, [2, 1, 0, 2], [0, 0], 0.0167, [15, 5, 5],
    'Lock {C} of collateral on {N} on {chain} and mint {C/3} of its stablecoin: a 300% ratio, about 5% a year.',
    "Put the minted stablecoin in {N}'s savings or stability module, so debt and deposit both count.",
    'check the collateral ratio and the peg', 'the ratio falls under 200% or the stablecoin slips under $0.99'),
  rwa: play('Tokenised asset', 90, [2, 0, 0, 1], [0.002, 0], 0, [15, 20, 5],
    "Mint or buy {C} of {N}'s tokenised asset on {chain}, about 0.2% in fees; read the redemption notice first.",
    "Pass {N}'s KYC or whitelist form with this wallet before funding it, if asked; allow 1 to 3 days.",
    'check NAV and the redemption queue', 'redemptions pause or NAV is marked down', { qualifyFirst: true }),
  pool: play('Liquidity and swaps', 60, [3, 0, 1, 1], [0, 0.0003], 0, [15, 5, 10],
    "Approve both tokens and add {C} to {N}'s deepest pool on {chain}, in its most liquid pair.",
    "Set a weekly reminder for one {C/10} swap through {N}'s own router (0.3% fee): programmes score fees and active weeks.",
    "make the swap and check the pool's range", 'impermanent loss passes 2%'),
  perps: play('Margin and volume', 60, [2, 0, 2, 1], [0, 0.001], 0, [10, 5, 15],
    'Deposit {C} USDC as margin on {N} on {chain}.',
    'Set a weekly reminder for one round trip: open and close {C} of notional at 1x on a major pair, 0.05% taker fee each way.',
    'make the round trip and total fees and funding', 'fees and funding pass 3% of margin'),
  market: play('Prediction volume', 60, [2, 0, 2, 1], [0, 0.001], 0, [10, 5, 15],
    'Deposit {C} USDC on {N} on {chain}.',
    'Set a weekly reminder for one trade: buy then sell {C/4} of shares in a liquid market priced 0.20 to 0.80, with limit orders.',
    'make the trade and total the spread paid', 'spread and fees pass 3% of the deposit'),
  stake: play('Stake or restake', 90, [2, 1, 0, 2], [0, 0], 0, [10, 10, 5],
    'Stake or restake {C} of the asset {N} accepts on {chain}; note the unbonding period first.',
    "Delegate to an operator or pool in {N}'s own app; keep the receipt token in this wallet.",
    "check the operator's status and reward rate", 'the operator is slashed or withdrawals queue over a week'),
  network: play('Use the network', 90, [2, 0, 1, 1], [0, 0], 0, [15, 5, 5],
    'Move {C} onto {N} on {chain} through its own bridge or app, so the activity is credited to this wallet.',
    'Set a weekly reminder for one real transfer, payment or contract call: network drops count active weeks and actions.',
    'make the transaction and check the fee', 'the bridge pauses withdrawals'),
};
const PLAY_BY_CATEGORY = {
  Lending: 'lend', 'Uncollateralized Lending': 'lend', 'Collateral Markets': 'lend', CDP: 'cdp', 'CDP Manager': 'cdp', Dexs: 'pool',
  'Prediction Market': 'market', Restaking: 'stake', 'Staking Pool': 'stake', 'Governance Incentives': 'stake', Insurance: 'stake',
};
const PLAY_BY_SECTOR = { Vaults: 'vault', Dollars: 'dollar', RWA: 'rwa', Lending: 'lend', Trading: 'perps', Network: 'network' };
const playOf = (category) => PLAY_BY_CATEGORY[category] || PLAY_BY_SECTOR[sectorOf(category)];
// [gas per transaction, fee to fund the wallet from an exchange], in dollars, by DefiLlama's chain names
const CHAIN_COST = {
  Ethereum: [2.5, 4], Bitcoin: [1.5, 2], Tron: [1, 1.5], Binance: [0.1, 0.3], Avalanche: [0.05, 0.5], Polygon: [0.01, 0.3],
  Solana: [0.005, 1], Sui: [0.005, 0.5], Aptos: [0.005, 0.5], Stellar: [0.001, 0.2], Algorand: [0.001, 0.2],
  Base: [0.03, 0.5], Arbitrum: [0.03, 0.5], Optimism: [0.03, 0.5], Ink: [0.03, 1], Monad: [0.01, 1], 'Hyperliquid L1': [0.01, 1],
};
const chainCost = (chain) => CHAIN_COST[chain] || [0.05, 1.5];   // any chain not listed
/** A protocol's first three chains hold most of its TVL; the plan runs on the cheapest of them. */
const farmChain = (chains) => chains.slice(0, 3)
  .sort((a, b) => chainCost(a)[0] - chainCost(b)[0] || chains.indexOf(a) - chains.indexOf(b))[0] || 'its main chain';

/** One row's plan: eight steps of [verb, what to do, dollars, minutes], then the sums.
 *  slice = implied value × airdrop share × this ticket's dollar-days / everyone's. Deposits already in count half
 *  the days it has run with no token (TVL grown in a straight line), a year at most.
 *  net = slice − fees − the T-bill yield the ticket gives up. FARM: net > 0. THIN: the slice covers fees only. */
function farmPlan(row, opts = {}) {
  const C = opts.capital || CONFIG.capital, share = opts.share || CONFIG.airdropShare;
  const key = playOf(row.category), how = PLAYS[key], N = row.name;
  const chain = farmChain(row.chains), [gas, fund] = chainCost(chain);
  const H = how.hold, weeks = Math.round(H / 7);
  const fill = (t) => t.replace(/\{C(\/\d+)?\}/g, (_, d) => usd(d ? C / +d.slice(1) : C)).replace(/\{N\}/g, N).replace(/\{chain\}/g, chain);
  const ahead = Math.min(row.age == null ? CONFIG.pointsWindow : row.age, CONFIG.pointsWindow) / 2;
  const snapshotSlice = row.value * share * C / (row.tvl + C);
  const slice = snapshotSlice * H / (ahead + H);
  const [txIn, txQualify, txWeek, txOut] = how.tx;
  const gasBudget = Math.max(1, Math.ceil(2 * gas * (txIn + txQualify + weeks * txWeek + txOut + 2)));   // twice the plan's own gas
  const steps = [
    ['Fund', `Withdraw ${usd(C)} (USDC, or the asset it takes) and ${usd(gasBudget)} for gas from an exchange to a fresh wallet on ${chain}, used for this farm only.`, fund, 10],
    ['Verify', `Open ${N} from defillama.com/protocol/${row.slug}, not a search ad; check contracts, audits, that it still lists no token, and any points page.`, 0, 15],
    ['Enter', fill(how.enter), txIn * gas + how.pct[0] * C, how.min[0]],
    ['Qualify', fill(how.qualify), txQualify * gas + how.carry * C * H / 365, how.min[1]],
    ['Upkeep', `Each week for ${weeks} weeks, ${how.watch}; log it.`, weeks * (txWeek * gas + how.pct[1] * C), weeks * how.min[2]],
    ['Stop rule', `Leave early if ${how.stop}, TVL drops under ${usd(row.tvl * 0.7)} (-30%), or a token is announced with nothing for depositors.`, 0, 5],
    ['Claim', `If a token launches, claim only from ${N}'s own site, never pay to claim, then revoke approvals. At the implied ${usd(row.value)} this ticket's slice is about ${usd(slice)}.`, gas, 10],
    ['Exit', `After ${H} days or at the claim, unwind the position and send the funds back to the exchange.`, (txOut + 1) * gas, 10],
  ];
  if (how.qualifyFirst) steps.splice(2, 2, steps[3], steps[2]);   // a KYC form comes before the money moves
  const fees = steps.reduce((s, st) => s + st[2], 0), minutes = steps.reduce((s, st) => s + st[3], 0);
  const forgone = C * CONFIG.tbill * H / 365, net = slice - fees - forgone;
  // for the break-even ticket, fees split into a fixed part (gas, funding) and a part that grows with the ticket
  const scaling = C * (how.pct[0] + weeks * how.pct[1] + how.carry * H / 365), perDollar = (slice - scaling - forgone) / C;
  return {
    play: key, label: how.label, chain, hold: H, weeks, capital: C, share, ahead,
    steps, fees, minutes, forgone, slice, snapshotSlice, net, perHour: net / (minutes / 60),
    verdict: net > 0 ? 'FARM' : slice > fees ? 'THIN' : 'SKIP',
    breakEven: perDollar > 0 ? (fees - scaling) / perDollar : null,
  };
}
/** The strings board.json carries: one a step, each with its cost and its time. */
const stepStrings = (plan) => plan.steps.map(([verb, what, dollars, min]) =>
  `${verb}: ${what} Cost: ${dollars ? usd(dollars) : 'nothing'}. Time: ${min} min${verb === 'Upkeep' ? ` over ${plan.hold} days` : ''}.`);

// ════ 3 · THE RADAR: who has a token, who is set aside and why, then the rest ranked by value
function buildRadar(snapshot) {
  const { protocols } = snapshot;
  const watched = new Set(snapshot.watchlist);
  const stems = {};   // name stem -> the ticker some listing of that stem records
  for (const p of protocols) if (tokenStatus(p) !== 'none') stems[stem(p.name)] = p.symbol || p.gecko_id;
  const marketWeek = median(protocols.filter((p) => p.change_7d != null).map((p) => p.change_7d));
  const tokens = buildComps(snapshot, marketWeek), comps = tokens.filter((c) => !c.skip);
  const fit = fitCurve(comps, 3), tests = backtest(comps), ranges = rangeTest(comps);
  const rows = [], aside = [];
  for (const p of protocols) {
    const listed = watched.has(p.slug), kin = stems[stem(p.name)];
    if (tokenStatus(p) !== 'none' && !listed) continue;            // a token trades or is on record: kept apart
    const reason = listed ? null : houseRule(p) || (kin ? 'Kin of a token' : null);
    if (reason) { aside.push({ name: p.name, category: p.category, tvl: p.tvl_usd, reason, kin }); continue; }
    // clear of every rule and above the floor, yet off the watchlist: DefiLlama files it under a parent
    const family = kin ? 'token' : !listed && p.tvl_usd >= snapshot.floor_usd ? 'parent' : null;
    const v = impliedValue(p, fit, { asOf: snapshot.as_of, marketWeek, kin: family });
    const young = v.age != null && v.age < CONFIG.youngDays && ranges.nYoung > 0;
    const spread = young ? ranges.young : ranges.seasoned;
    rows.push({
      slug: p.slug, name: p.name, category: p.category || 'Uncategorised', sector: v.sector, chains: p.chains, tvl: p.tvl_usd,
      change7d: p.change_7d, excess: v.excess, age: v.age, tier: listed ? 'watchlist' : family === 'parent' ? 'shared' : 'early',
      kin: kin || null, value: v.value, curve: v.curve, factors: v.factors, young, spread, low: v.value / spread, high: v.value * spread,
    });
  }
  rows.sort((a, b) => b.value - a.value || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => { r.rank = i + 1; r.plan = farmPlan(r); });
  aside.sort((a, b) => b.tvl - a.tvl);
  const onRecord = protocols.filter((p) => tokenStatus(p) === 'on-record').length;
  return {
    asOf: snapshot.as_of, marketWeek, fit, tests, ranges, tokens, comps, rows, aside,
    ledger: ledgerOf(rows, tokens, onRecord, aside),
    counts: { protocols: protocols.length, watchlist: snapshot.watchlist.length, noToken: rows.length + aside.length, onRecord },
  };
}

/** The page's proof it shows what board.json holds: row i must carry board.json's [slug, rank, dollars, plan digest]. */
function checkBoard(rows, board) {
  const same = board.filter(([slug, rank, dollars, sig], i) => {
    const r = rows[i];
    return !!r && r.slug === slug && r.rank === rank && r.value === dollars && digest(stepStrings(r.plan)) === sig;
  }).length;
  return { same, of: board.length, ok: same === board.length && same === rows.length };
}

// ════ 4 · reading the snapshot
/** 'trades': a market cap. 'on-record': a ticker or CoinGecko id, no cap. 'none': neither. */
const tokenStatus = (p) => p.mcap_usd > 0 ? 'trades' : (p.gecko_id || p.symbol) ? 'on-record' : 'none';
const HOUSE_CATEGORIES = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];
/** The house's own watchlist rule (the kit's input/README.md), reused to sort protocols below its floor. */
function houseRule(p) {
  const at = HOUSE_CATEGORIES.indexOf(p.category);
  if (at >= 0) return at < 2 ? 'Bridge' : at < 5 ? 'Liquid staking' : 'Exchange custody';
  if (/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/.test(p.name)) return 'Exchange custody';
  if (/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)) return 'Versioned listing';
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return 'Wrapped or staked';
  return null;
}
/** Every protocol lands in exactly one group, each with the reason it is or is not ranked. */
function ledgerOf(rows, tokens, onRecord, aside) {
  const ruled = ['Bridge', 'Liquid staking', 'Exchange custody', 'Versioned listing', 'Wrapped or staked', 'Kin of a token'];
  return [
    ['Ranked', rows.length, 'records no token; no rule sets it aside'],
    ['Token trades', tokens.length, 'a market cap: comparables, never ranked'],
    ['Token on record', onRecord, 'a ticker or CoinGecko id, no cap'],
    ...ruled.map((g) => [g, aside.filter((a) => a.reason === g).length,
      g === 'Kin of a token' ? 'its name stem carries a token on record' : 'the house rule, applied below its floor']),
  ];
}
const stem = (name) => name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] || '';
const DAY = 864e5;
const ageDays = (asOf, listedAt) => listedAt
  ? Math.max(0, Math.round((Date.parse(asOf + 'T00:00:00Z') - Date.parse(listedAt + 'T00:00:00Z')) / DAY)) : null;
// six sectors, because DefiLlama's 40 categories leave most of them with one comparable or none
const SECTORS = {
  Vaults: 'Risk Curators|Onchain Capital Allocator|Yield|Yield Aggregator|Liquidity Manager|Leveraged Farming|Farm|Indexes|Options Vault',
  Dollars: 'Basis Trading|CDP|CDP Manager|Stablecoin Wrapper|Dual-Token Stablecoin|CeDeFi',
  RWA: 'RWA|RWA Lending',
  Lending: 'Lending|Uncollateralized Lending|Collateral Markets|Collateral Management',
  Trading: 'Dexs|Derivatives|Options|Prediction Market|Interest Rate Derivatives|OTC Marketplace|NFT Marketplace|Launchpad',
};
const sectorOf = (category) => Object.keys(SECTORS).find((s) => SECTORS[s].split('|').indexOf(category) >= 0) || 'Network';

// ════ 5 · small maths and formats
const log10 = (x) => Math.log(x) / Math.LN10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b), mid = (s.length - 1) / 2;
  return (s[Math.floor(mid)] + s[Math.ceil(mid)]) / 2;
}
/** Theil-Sen line: the median of every pairwise slope, so one 400x outlier cannot tilt the curve. */
function theilSen(points) {
  const slopes = [];
  points.forEach(([x1, y1], i) => {
    for (const [x2, y2] of points.slice(i + 1)) if (x2 !== x1) slopes.push((y2 - y1) / (x2 - x1));
  });
  const b = median(slopes);
  return { a: median(points.map(([x, y]) => y - b * x)), b };
}
function usd(x) {
  const a = Math.abs(x), sign = x < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${String(Math.round(a)).replace(/\B(?=(\d{3})+$)/g, ',')}`;
  if (a > 0 && a < 0.01) return 'under $0.01';
  return `${sign}$${a.toFixed(a >= 100 ? 0 : 2)}`;
}
/** FNV-1a over the joined strings, so the page can prove its plan text is board.json's text. */
function digest(strings) {
  const s = strings.join('\n');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}

const api = { CONFIG, PLAYS, buildRadar, checkBoard, farmPlan, stepStrings, digest, usd, log10 };
scope.Radar = api;
if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
