/* 1 · Criteria 1 and 2, the value. Checked: main.ts runs this file to write board.json, the page reruns it on ../data.js and
   checkBoard() compares them row by row. No protocol is priced by its name.
   impliedValue = launchValue() × launchOdds() (2-odds.js); launchValue multiplies only the terms valueLadder() keeps
   valueLadder  each term priced blind, left out and older to newer; kept if the median miss falls in both
   rangeHonesty share of real caps inside the stated 50% and 80% ranges, both tests;  ledgerOf  758 protocols, one group each */
(function (root) {
const CONFIG = {
  version: 'odds-1',
  shrink: 24,          // pseudo-comps at ×1 pulling a thin sector toward the curve
  growthCap: 0.4,      // a week's lead on the market counts ±40% at most
  tiltCap: 0.3,        // a slope term moves a value ×2 at most
  receiptBand: 0.015,  // a cap within 1.5% of TVL is a deposit receipt
  olderDays: 900,      // walk-forward: tokens listed 900+ days ago price the newer ones
  tokenKin: 0.25,      // a row whose name stem carries a token
};
// valueLadder() adds these in order, after a flat cap/TVL multiple and the size curve
const VALUE_TERMS = [['sector', 'Sector, shrunk by comps'], ['growth', '7-day growth vs market'], ['chains', 'Chain count'], ['age', 'Years running']];

// 1 · one protocol's launch value: each step multiplies it and says where its figure comes from
function launchValue(p, fit, ctx) {
  const sector = sectorOf(p.category), age = ageDays(ctx.asOf, p.listed_at), excess = excessGrowth(p.change_7d, ctx.marketWeek), kin = kinshipOf(p, ctx, fit);
  const c = { x: log10(p.tvl_usd), sector, age, chains: Math.max(1, p.chains.length), excess }, T = fit.terms;
  const curve = 10 ** (fit.a + fit.b * c.x);
  const steps = [['Size curve', curve, curve, `10^${fit.a.toFixed(2)} × TVL^${fit.b.toFixed(3)}`, `Theil-Sen on ${ctx.n} traded tokens`]];
  const times = (name, on, factor, why, from) => steps.push([name, on ? factor : 1, steps[steps.length - 1][2] * (on ? factor : 1), why, on ? from : 'tested by valueLadder(), not kept: ×1']);
  times('Sector', T.sector, 10 ** (fit.sector[sector] || 0), sector, `${fit.count[sector] || 0} comps + ${CONFIG.shrink} pseudo-comps at ×1`);
  times('7-day growth', T.growth, 10 ** growthTilt(fit, c), p.change_7d == null ? 'no 7-day figure' : `${signed(p.change_7d)}, market ${signed(ctx.marketWeek)}`, 'TVL carried on by its lead');
  times('Chains', T.chains, 10 ** tilt(fit.chains, fit.chainMid, c.chains), `on ${p.chains.length}`, 'fitted slope on log chain count');
  times('Years running', T.age, 10 ** tilt(fit.age, fit.ageMid, age), age == null ? 'no listing date' : `${(age / 365).toFixed(1)} y with no token`, 'fitted slope on log days listed');
  steps.push(['Kinship', kin.factor, steps[steps.length - 1][2] * kin.factor, kin.why, kin.from]);
  return { launch: steps[steps.length - 1][2], steps, sector, age, excess, kin: kin.kind };
}
/** Is the launch its own? Stated rules on the snapshot's fields, never names. */
function kinshipOf(p, ctx, fit) {
  const half = Math.pow(2, fit.b - 1), token = ctx.stems[stem(p.name)];   // half of a two-listing family on a curve of slope b
  const is = (kind, factor, why, from) => ({ kind, factor, why, from });
  if (token) return is('token', CONFIG.tokenKin, `its stem carries ${token}`, 'rule ×0.25');
  if (chainNamed(p)) return is('chain', half * ctx.chainOpen, 'named after its chain', `rule: ${ctx.chainTally} such record no token`);
  if (!ctx.watched.has(p.slug) && p.tvl_usd >= ctx.floor) return is('shared', half, 'off the list above the floor', 'rule: half a two-listing family');
  return is('own', 1, 'its own launch', 'no kin on record');
}
const chainNamed = (p) => p.chains.some((c) => stem(c) === stem(p.name));
const excessGrowth = (change7d, marketWeek) => change7d == null ? 0 : clamp((1 + change7d / 100) / (1 + marketWeek / 100) - 1, -CONFIG.growthCap, CONFIG.growthCap);
const tilt = (slope, mid, v) => v == null || !slope ? 0 : clamp(slope * (log10(Math.max(v, 1)) - mid), -CONFIG.tiltCap, CONFIG.tiltCap);
const growthTilt = (fit, c) => fit.b * log10(1 + c.excess);

// 2 · a Theil-Sen line of log cap on log TVL, then each kept term on what is left over
function fitCurve(comps, terms, line) {
  const { a, b } = terms.curve ? line || theilSen(comps.map((c) => [c.x, c.y])) : { a: median(comps.map((c) => c.y - c.x)), b: 1 };
  const fit = { a, b, terms, sector: {}, count: {}, age: 0, ageMid: 0, chains: 0, chainMid: 0 };
  const left = (c) => c.y - predictLog(fit, c);
  if (terms.sector) {
    const groups = {};
    for (const c of comps) (groups[c.sector] = groups[c.sector] || []).push(left(c));
    for (const s in groups) { const n = groups[s].length; fit.count[s] = n; fit.sector[s] = n * median(groups[s]) / (n + CONFIG.shrink); }
  }
  const slope = (list, of) => { const pts = list.map((c) => [log10(Math.max(of(c), 1)), left(c)]); return [theilSen(pts).b, median(pts.map(([x]) => x))]; };
  if (terms.chains) [fit.chains, fit.chainMid] = slope(comps, (c) => c.chains);
  if (terms.age) [fit.age, fit.ageMid] = slope(comps.filter((c) => c.age), (c) => c.age);
  return fit;
}
/** log10 of a comp's fitted cap: the same product launchValue() multiplies out. */
const predictLog = (fit, c) => fit.a + fit.b * c.x + (fit.terms.growth ? growthTilt(fit, c) : 0) + (fit.sector[c.sector] || 0) + tilt(fit.chains, fit.chainMid, c.chains) + tilt(fit.age, fit.ageMid, c.age);

/** One comp per traded token. Listings sharing its ticker and stem are one family, TVL summed. */
function buildComps(snapshot, marketWeek) {
  const tickers = snapshot.protocols.filter((p) => tokenStatus(p) === 'on-record' && p.symbol);
  const family = (s, t) => t === s || (Math.min(t.length, s.length) > 3 && (t.startsWith(s) || s.startsWith(t)));
  return snapshot.protocols.filter((p) => tokenStatus(p) === 'trades').map((p) => {
    let tvl = p.tvl_usd;
    for (const q of tickers) if (q.symbol === p.symbol && family(stem(p.name), stem(q.name))) tvl += q.tvl_usd;
    const skip = HOUSE_CATEGORIES.includes(p.category) ? 'prices a bridge, exchange or staked asset' : chainNamed(p) ? 'named after its chain: prices the chain'
      : Math.abs(p.mcap_usd / tvl - 1) < CONFIG.receiptBand ? 'receipt token: cap equals TVL' : null;
    return { name: p.name, sector: sectorOf(p.category), tvl, mcap: p.mcap_usd, skip, age: ageDays(snapshot.as_of, p.listed_at),
      chains: Math.max(1, p.chains.length), excess: excessGrowth(p.change_7d, marketWeek), x: log10(tvl), y: log10(p.mcap_usd) };
  });
}

// 3 · the blind tests: each token left out, and older tokens pricing newer ones
const isOlder = (c) => !c.age || c.age >= CONFIG.olderDays;
const without = (list, i) => list.filter((_, j) => j !== i);
const scoreOf = (errors) => ({ miss: 10 ** median(errors.map(Math.abs)) });
function blindTest(comps, terms, lines) {
  const errors = comps.map((c, i) => c.y - predictLog(fitCurve(without(comps, i), terms, lines && lines[i]), c));
  const early = fitCurve(comps.filter(isOlder), terms), laterErrors = comps.filter((c) => !isOlder(c)).map((c) => c.y - predictLog(early, c));
  return { errors, laterErrors, each: scoreOf(errors), later: scoreOf(laterErrors) };
}
/** Flat multiple, then the size curve, then each term on top of what is kept: it stays only if the median
 *  multiplicative miss falls both left out and older to newer. */
function valueLadder(comps) {
  const lines = comps.map((_, i) => theilSen(without(comps, i).map((c) => [c.x, c.y])));   // one line per left-out comp serves every rung
  const rungs = [['One flat cap/TVL multiple', null], ['Size curve, TVL^b', 'curve'], ...VALUE_TERMS.map(([k, name]) => ['+ ' + name, k])];
  let terms = {}, standing = null;
  const ladder = rungs.map(([name, key]) => {
    const tryTerms = key ? { ...terms, [key]: 1 } : {}, t = blindTest(comps, tryTerms, lines);
    const kept = !!standing && t.each.miss < standing.each.miss && t.later.miss < standing.later.miss;
    if (kept || !standing) { standing = t; terms = tryTerms; }
    return { name, key, each: t.each, later: t.later, kept, base: !key };
  });
  const older = comps.filter(isOlder);
  comps.forEach((c, i) => { c.blind = 10 ** (c.y - standing.errors[i]); });
  return { ladder, terms, full: standing, flat: ladder[0], older: older.length, newer: comps.length - older.length, olderErrors: blindTest(older, terms).errors };
}
/** Ranges are quantiles of blind misses, 25th-75th (50%) and 10th-90th (80%), tested on caps they never saw: each token
 *  against the others' misses, each newer token against the older tokens' own blind misses. */
function rangeHonesty(tests) {
  const { errors, laterErrors } = tests.full, pool = tests.olderErrors;
  const share = (list, poolOf, lo, hi) => list.filter((e, i) => { const p = poolOf(i); return e >= quantile(p, lo) && e <= quantile(p, hi); }).length / list.length;
  const others = (i) => without(errors, i);
  return { each50: share(errors, others, 0.25, 0.75), each80: share(errors, others, 0.1, 0.9), later50: share(laterErrors, () => pool, 0.25, 0.75),
    later80: share(laterErrors, () => pool, 0.1, 0.9), q: [0.1, 0.25, 0.75, 0.9].map((k) => 10 ** quantile(errors, k)), n: errors.length, newer: laterErrors.length };
}
const nearestComps = (row, comps, n) => comps.filter((c) => c.sector === row.sector).sort((a, b) => Math.abs(a.x - log10(row.tvl)) - Math.abs(b.x - log10(row.tvl))).slice(0, n);

// 4 · who has a token, who is set aside and why, the rest ranked by implied value
function buildRadar(snapshot) {
  const { protocols } = snapshot, watched = new Set(snapshot.watchlist), stems = {};
  for (const p of protocols) if (tokenStatus(p) !== 'none') stems[stem(p.name)] = p.symbol || p.gecko_id;
  const marketWeek = median(protocols.filter((p) => p.change_7d != null).map((p) => p.change_7d));
  const tokens = buildComps(snapshot, marketWeek), comps = tokens.filter((c) => !c.skip), tests = valueLadder(comps), fit = fitCurve(comps, tests.terms), ranges = rangeHonesty(tests);
  const odds = root.Radar.oddsModel(snapshot, marketWeek), se = root.Radar.bootstrapSE(comps, tests.terms, odds);
  const named = protocols.filter((p) => chainNamed(p) && !houseRule(p)), open = named.filter((p) => tokenStatus(p) === 'none').length;
  const ctx = { asOf: snapshot.as_of, floor: snapshot.floor_usd, marketWeek, stems, watched, n: comps.length, chainOpen: open / named.length, chainTally: `${open} of ${named.length}` };
  const rows = [], aside = [];
  for (const p of protocols) {
    const listed = watched.has(p.slug);
    if (tokenStatus(p) !== 'none' && !listed) continue;   // it trades or is on record: never ranked
    const reason = listed ? null : houseRule(p) || (stems[stem(p.name)] ? 'Kin of a token' : null);
    if (reason) { aside.push({ name: p.name, category: p.category, tvl: p.tvl_usd, reason }); continue; }
    const v = launchValue(p, fit, ctx), chance = odds.launchOdds(p), value = impliedValue(v.launch, chance), [q10, q25, q75, q90] = ranges.q;
    rows.push({ ...v, chance, value, slug: p.slug, name: p.name, category: p.category || 'Uncategorised', chains: p.chains, tvl: p.tvl_usd, change7d: p.change_7d,
      tier: listed ? 'watchlist' : v.kin === 'shared' ? 'shared' : 'early', low: value * q25, high: value * q75, low80: value * q10, high80: value * q90 });
  }
  rows.sort((a, b) => b.value - a.value || (a.slug < b.slug ? -1 : 1)).forEach((r, i) => { r.rank = i + 1; });
  aside.sort((a, b) => b.tvl - a.tvl);
  const onRecord = protocols.filter((p) => tokenStatus(p) === 'on-record').length;
  return { asOf: snapshot.as_of, marketWeek, fit, tests, ranges, odds, se, tokens, comps, rows, aside, ledger: ledgerOf(rows, tokens, onRecord, aside),
    counts: { protocols: protocols.length, watchlist: snapshot.watchlist.length } };
}
/** What the board ranks by: the value if it launches, times how often its peers have a token on record. */
const impliedValue = (launch, chance) => Math.max(1, Math.round(launch * chance));
/** Every protocol in exactly one group: ranked, traded, on record, or the rule that sets it aside. */
function ledgerOf(rows, tokens, onRecord, aside) {
  const ruled = ['Bridge', 'Liquid staking', 'Exchange custody', 'Versioned listing', 'Wrapped or staked', 'Kin of a token'];
  return [['Ranked', rows.length], ['Token trades', tokens.length], ['Token on record', onRecord], ...ruled.map((g) => [g, aside.filter((a) => a.reason === g).length])];
}
/** Row i must carry board.json's slug, rank, dollars and plan digest; ranks run 1 to N with value never rising; totals agree. */
function checkBoard(rows, board) {
  const matches = (r, [slug, rank, dollars, sig]) => r && r.slug === slug && r.rank === rank && r.value === dollars && digest(root.Radar.stepStrings(r.plan)) === sig;
  const same = board.filter((b, i) => matches(rows[i], b)).length, ranked = rows.every((r, i) => r.rank === i + 1 && (!i || r.value <= rows[i - 1].value));
  const total = rows.reduce((s, r) => s + r.value, 0), boardTotal = board.reduce((s, b) => s + b[2], 0);
  return { same, of: board.length, ranked, total, boardTotal, ok: same === board.length && same === rows.length && ranked && total === boardTotal };
}

// 5 · reading the snapshot
const tokenStatus = (p) => p.mcap_usd > 0 ? 'trades' : (p.gecko_id || p.symbol) ? 'on-record' : 'none';
const HOUSE_CATEGORIES = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];
/** The house's own watchlist rule, applied below its floor too. */
function houseRule(p) {
  const at = HOUSE_CATEGORIES.indexOf(p.category);
  if (at >= 0) return at < 2 ? 'Bridge' : at < 5 ? 'Liquid staking' : 'Exchange custody';
  if (/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/.test(p.name)) return 'Exchange custody';
  if (/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)) return 'Versioned listing';
  return /\b(wrapped|staked|staking)\b/i.test(p.name) ? 'Wrapped or staked' : null;
}
const stem = (name) => name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] || name;
const ageDays = (asOf, listedAt) => listedAt ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(listedAt)) / 864e5)) : null;
// six sectors of DefiLlama categories, 8+ comps each
const SECTORS = {
  Vaults: 'Risk Curators|Onchain Capital Allocator|Yield|Yield Aggregator|Liquidity Manager|Leveraged Farming|Farm|Indexes|Options Vault',
  Dollars: 'Basis Trading|CDP|CDP Manager|Stablecoin Wrapper|Dual-Token Stablecoin|CeDeFi', RWA: 'RWA|RWA Lending',
  Trading: 'Dexs|Derivatives|Options|Prediction Market|Interest Rate Derivatives|OTC Marketplace|NFT Marketplace|Launchpad',
  Lending: 'Lending|Uncollateralized Lending|Collateral Markets|Collateral Management',
};
const sectorOf = (category) => Object.keys(SECTORS).find((s) => SECTORS[s].split('|').includes(category)) || 'Network';

// 6 · maths and formats
const log10 = (x) => Math.log(x) / Math.LN10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const signed = (pct) => `${pct < 0 ? '−' : '+'}${Math.abs(pct).toFixed(1)}%`;
function quantile(values, k) {
  if (!values.length) return 0;
  const s = Float64Array.from(values).sort(), at = (s.length - 1) * k, lo = Math.floor(at);
  return s[lo] + (s[Math.ceil(at)] - s[lo]) * (at - lo);
}
const median = (values) => quantile(values, 0.5);
// the median of every pairwise slope
function theilSen(points) {
  const slopes = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++)
    if (points[j][0] !== points[i][0]) slopes.push((points[j][1] - points[i][1]) / (points[j][0] - points[i][0]));
  const b = median(slopes);
  return { a: median(points.map(([x, y]) => y - b * x)), b };
}
function usd(x) {
  const a = Math.abs(x), sign = x < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e5) return `${sign}$${Math.round(a / 1e3)}k`;
  if (a >= 100) return `${sign}$${String(Math.round(a)).replace(/\B(?=(\d{3})+$)/g, ',')}`;
  return a > 0 && a < 0.01 ? 'under $0.01' : `${sign}$${a.toFixed(2)}`;
}
function digest(strings) {
  let h = 2166136261;
  for (const ch of strings.join('\n')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16);
}

root.Radar = Object.assign(root.Radar || {}, { CONFIG, buildRadar, checkBoard, fitCurve, nearestComps, ageDays, excessGrowth, sectorOf, tokenStatus, houseRule, digest, usd, signed, log10, clamp });
})(globalThis);
