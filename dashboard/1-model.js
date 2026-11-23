/* 1 · THE MODEL: every implied value on this radar. main.ts runs this file to write board.json, the page runs it again
   on ../data.js, and checkBoard() holds the two to the same dollars. No protocol is priced by its name.
   impliedValue  size curve x sector x 7-day growth x time with no token x chains x kinship, step by step
   fitCurve      the coefficients, fitted on this snapshot's own traded tokens (Theil-Sen, sectors shrunk)
   backtest      every term priced blind, each token left out and older-to-newer; keepRule says which stay
   rangeTest     how often the printed range holds a token it never saw
   ledgerOf      all 758 protocols, each in exactly one group with its reason */
(function (root) {
'use strict';
const CONFIG = {
  version: 'scope-4',
  shrink: 24,             // pseudo-comps pulling each sector to the curve; lowest held-out miss in shrinkSweep
  growthCap: 0.4,         // a week's growth over the market, carried forward ±40% at most
  ageShare: 0.25,         // a quarter of the fitted age slope: the full slope fails older-to-newer
  ageClamp: 0.06,         // and at most 10^±0.06, about ±15%
  chainShare: 0.5,        // half the fitted chain-count slope
  receiptBand: 0.015,     // a cap within 1.5% of TVL is a deposit receipt, not a launch
  youngDays: 540,         // under 18 months on record blind prices miss wider, so the range is wider
  tokenKin: 0.25,         // a watchlist row whose name stem already carries a token
};
/** What the model uses: the last rung of LADDER. */
const TERMS = { sector: CONFIG.shrink, growth: 1, age: CONFIG.ageShare, chains: CONFIG.chainShare };

// ════ 1 · one protocol's value
/** Each step multiplies the running value and says where its figure comes from: the page draws them as a waterfall. */
function impliedValue(p, fit, ctx) {
  const sector = sectorOf(p.category), age = ageDays(ctx.asOf, p.listed_at), excess = excessGrowth(p.change_7d, ctx.marketWeek), kin = kinshipOf(p, ctx, fit);
  const curve = Math.pow(10, fit.a + fit.b * log10(p.tvl_usd));   // each extra dollar of TVL is worth less
  const steps = [['Size curve', curve, curve, `10^${fit.a.toFixed(2)} × TVL^${fit.b.toFixed(3)}`, `fitted on ${ctx.n} traded tokens`]];
  const times = (name, factor, why, from) => steps.push([name, factor, steps[steps.length - 1][2] * factor, why, from]);
  times('Sector', Math.pow(10, fit.sector[sector] || 0), sector, `${fit.count[sector]} comps + ${CONFIG.shrink} pseudo-comps at ×1`);
  times('7-day growth', Math.pow(1 + excess, fit.b), p.change_7d == null ? 'no 7-day figure' : `${signed(p.change_7d)}, market ${signed(ctx.marketWeek)}`, 'TVL carried on by its lead');
  times('Time with no token', Math.pow(10, ageTilt(fit, age)), age == null ? 'no listing date' : `${age} days on record`, 'newer tokens trade richer');
  times('Chains', Math.pow(10, chainTilt(fit, p.chains.length)), `on ${p.chains.length}`, 'half the fitted slope on chain count');
  times('Kinship', kin.factor, kin.why, kin.from);
  return { value: Math.max(1, Math.round(steps[steps.length - 1][2])), steps, sector, age, excess, kin: kin.kind };
}
/** Is the launch its own? Rules on the record, never a list of names. */
function kinshipOf(p, ctx, fit) {
  const half = Math.pow(2, fit.b - 1), token = ctx.stems[stem(p.name)];   // half of a two-listing family on a curve of slope b
  if (token) return { kind: 'token', factor: CONFIG.tokenKin, why: `its stem carries ${token}`, from: 'stated ×0.25; ranked only as the watchlist names it' };
  if (chainNamed(p)) return { kind: 'chain', factor: half * ctx.chainOpen, why: 'named after its chain', from: `launch shared with the chain; ${ctx.chainTally} such record no token` };
  if (!ctx.watched.has(p.slug) && p.tvl_usd >= ctx.floor) return { kind: 'shared', factor: half, why: 'filed under a parent', from: 'half of a two-listing family on the curve' };
  return { kind: 'own', factor: 1, why: 'its own launch', from: 'no kin on record' };
}
/** The name opens with a chain it runs on: whatever launches is the chain's coin, which may already exist. */
const chainNamed = (p) => p.chains.some((c) => stem(c) === stem(p.name));
/** A week's TVL growth read against the market's (the median protocol shrank that week). */
const excessGrowth = (change7d, marketWeek) => change7d == null ? 0 : clamp((1 + change7d / 100) / (1 + marketWeek / 100) - 1, -CONFIG.growthCap, CONFIG.growthCap);
const ageTilt = (fit, age) => age == null ? 0 : clamp(fit.age * (log10(Math.max(age, 30)) - fit.ageMid), -fit.ageRoom, fit.ageRoom);
const chainTilt = (fit, n) => fit.chains * (log10(Math.max(1, n)) - fit.chainMid);

// ════ 2 · the fit
/** Theil-Sen line through log cap on log TVL, then each term on what the terms before it leave over. */
function fitCurve(comps, terms, line) {
  const { a, b } = line || theilSen(comps.map((c) => [c.x, c.y]));
  const fit = { a, b, sector: {}, count: {}, age: 0, ageMid: 0, ageRoom: CONFIG.ageClamp * (terms.age === 1 ? 4 : 1), chains: 0, chainMid: 0, growth: terms.growth };
  if (terms.flat) return Object.assign(fit, { a: median(comps.map((c) => c.y - c.x)), b: 1 });
  const left = (c) => c.y - a - b * c.x - (fit.sector[c.sector] || 0);
  if (terms.sector != null) {
    const groups = {}, effects = {};
    for (const c of comps) (groups[c.sector] = groups[c.sector] || []).push(left(c));
    for (const s in groups) { fit.count[s] = groups[s].length; effects[s] = groups[s].length * median(groups[s]) / (groups[s].length + terms.sector); }
    fit.sector = effects;
  }
  const slopeOf = (list, of) => { const pts = list.map((c) => [log10(of(c)), left(c)]); return [theilSen(pts).b, median(pts.map(([x]) => x))]; };
  if (terms.age) { const [m, mid] = slopeOf(comps.filter((c) => c.age), (c) => c.age); fit.age = m * terms.age; fit.ageMid = mid; }
  if (terms.chains) { const [m, mid] = slopeOf(comps, (c) => c.chains); fit.chains = m * terms.chains; fit.chainMid = mid; }
  return fit;
}
/** log10 of the cap a fit gives one comp: the sum impliedValue multiplies out. */
const predictLog = (fit, c) => fit.a + fit.b * c.x + (fit.sector[c.sector] || 0) + ageTilt(fit, c.age) + chainTilt(fit, c.chains) + (fit.growth ? fit.b * log10(1 + c.excess) : 0);

/** One comp per token that trades. Listings sharing its ticker and stem are one family, TVL summed. */
function buildComps(snapshot, marketWeek) {
  const tickers = snapshot.protocols.filter((p) => tokenStatus(p) === 'on-record' && p.symbol);
  const family = (s, t) => t === s || (Math.min(t.length, s.length) > 3 && (t.startsWith(s) || s.startsWith(t)));
  return snapshot.protocols.filter((p) => tokenStatus(p) === 'trades').map((p) => {
    let tvl = p.tvl_usd;
    for (const q of tickers) if (q.symbol === p.symbol && family(stem(p.name), stem(q.name))) tvl += q.tvl_usd;
    const skip = HOUSE_CATEGORIES.includes(p.category) ? 'prices a bridge, exchange or staked asset' : chainNamed(p) ? 'named after its chain: prices the chain'
      : Math.abs(p.mcap_usd / tvl - 1) < CONFIG.receiptBand ? 'receipt token: cap equals TVL' : null;
    return { name: p.name, symbol: p.symbol || p.gecko_id, sector: sectorOf(p.category), tvl, mcap: p.mcap_usd, skip, age: ageDays(snapshot.as_of, p.listed_at),
      chains: Math.max(1, p.chains.length), excess: excessGrowth(p.change_7d, marketWeek), x: log10(tvl), y: log10(p.mcap_usd) };
  });
}

// ════ 3 · the blind tests
const S = { sector: CONFIG.shrink }, G = { ...S, growth: 1 };
const LADDER = [['One flat cap/TVL multiple', { flat: 1 }], ['Size curve, TVL^b', {}], ['+ sector, as measured', { sector: 0 }], ['+ sector, shrunk', S], ['+ 7-day growth', G],
  ['+ time with no token, full slope', { ...G, age: 1 }], ['+ time with no token, a quarter', { ...G, age: CONFIG.ageShare }], ['+ chain count, half slope', TERMS]];
/** A term stays if the average miss falls in both tests and neither typical (median) miss grows by a tenth. */
const keepRule = (was, now) => now.each.mean < was.each.mean && now.later.mean < was.later.mean && now.each.miss < was.each.miss * 1.1 && now.later.miss < was.later.miss * 1.1;
const isOlder = (c) => !c.age || c.age >= 900;
const without = (list, i) => list.filter((_, j) => j !== i);
function scoreOf(errors) {
  const abs = errors.map(Math.abs), n = abs.length;
  return { miss: Math.pow(10, median(abs)), mean: Math.pow(10, abs.reduce((s, e) => s + e, 0) / n), within3: abs.filter((e) => e <= log10(3)).length / n };
}
/** One set of terms, blind: each comp left out, and the older comps pricing the newer ones. */
function blindTest(comps, terms, lines) {
  const errors = comps.map((c, i) => c.y - predictLog(fitCurve(without(comps, i), terms, lines && lines[i]), c)), early = fitCurve(comps.filter(isOlder), terms);
  return { errors, each: scoreOf(errors), later: scoreOf(comps.filter((c) => !isOlder(c)).map((c) => c.y - predictLog(early, c))) };
}
function backtest(comps) {
  const lines = comps.map((_, i) => theilSen(without(comps, i).map((c) => [c.x, c.y])));   // one line a comp serves every rung
  let standing = null;
  const ladder = LADDER.map(([name, terms], i) => {
    const t = blindTest(comps, terms, lines), kept = i > 0 && keepRule(standing, t);
    if (kept || !i) standing = t;
    return { ...t, name, kept, base: !i };
  });
  const full = ladder[ladder.length - 1], older = comps.filter(isOlder).length;
  comps.forEach((c, i) => { c.blind = Math.pow(10, c.y - full.errors[i]); });
  const shrinkSweep = [0, 4, 8, 16, 24, 32, 64].map((k) => { const t = blindTest(comps, { sector: k }, lines); return [k, t.each.mean, t.later.mean]; });
  return { ladder, full, flat: ladder[0], shrinkSweep, older, newer: comps.length - older };
}
/** The printed range holds half the blind misses of tokens like it (under or over 18 months); tested on tokens it never saw. */
function rangeTest(comps) {
  const missOf = (c) => Math.abs(c.y - log10(c.blind)), isYoung = (c) => c.age != null && c.age < CONFIG.youngDays, young = comps.filter(isYoung), seasoned = comps.filter((c) => !isYoung(c));
  const each = comps.filter((c) => missOf(c) <= median((isYoung(c) ? young : seasoned).filter((o) => o !== c).map(missOf))).length;
  const older = comps.filter(isOlder), newer = comps.filter((c) => !isOlder(c)), early = fitCurve(older, TERMS), width = median(blindTest(older, TERMS).errors.map(Math.abs));
  return { young: Math.pow(10, median(young.map(missOf))), seasoned: Math.pow(10, median(seasoned.map(missOf))), each, n: comps.length,
    later: newer.filter((c) => Math.abs(c.y - predictLog(early, c)) <= width).length, newer: newer.length };
}
/** The traded tokens nearest in size within the sector: the reader's own sanity check. */
const nearestComps = (row, comps, n) => comps.filter((c) => c.sector === row.sector).sort((a, b) => Math.abs(a.x - log10(row.tvl)) - Math.abs(b.x - log10(row.tvl))).slice(0, n);

// ════ 4 · the board: who has a token, who is set aside and why, the rest ranked by value
function buildRadar(snapshot) {
  const { protocols } = snapshot, watched = new Set(snapshot.watchlist), stems = {};
  for (const p of protocols) if (tokenStatus(p) !== 'none') stems[stem(p.name)] = p.symbol || p.gecko_id;
  const marketWeek = median(protocols.filter((p) => p.change_7d != null).map((p) => p.change_7d));
  const tokens = buildComps(snapshot, marketWeek), comps = tokens.filter((c) => !c.skip), fit = fitCurve(comps, TERMS), tests = backtest(comps), ranges = rangeTest(comps);
  const named = protocols.filter((p) => chainNamed(p) && !houseRule(p)), open = named.filter((p) => tokenStatus(p) === 'none'), chainTally = `${open.length} of ${named.length}`;
  const ctx = { asOf: snapshot.as_of, floor: snapshot.floor_usd, marketWeek, stems, watched, n: comps.length, chainOpen: open.length / named.length, chainTally };
  const rows = [], aside = [];
  for (const p of protocols) {
    const listed = watched.has(p.slug);
    if (tokenStatus(p) !== 'none' && !listed) continue;             // it trades or is on record: kept apart, never ranked
    const reason = listed ? null : houseRule(p) || (stems[stem(p.name)] ? 'Kin of a token' : null);
    if (reason) { aside.push({ name: p.name, category: p.category, tvl: p.tvl_usd, reason }); continue; }
    const v = impliedValue(p, fit, ctx), spread = v.age != null && v.age < CONFIG.youngDays ? ranges.young : ranges.seasoned;
    rows.push({ ...v, slug: p.slug, name: p.name, category: p.category || 'Uncategorised', chains: p.chains, tvl: p.tvl_usd, change7d: p.change_7d,
      tier: listed ? 'watchlist' : v.kin === 'shared' ? 'shared' : 'early', spread, low: v.value / spread, high: v.value * spread });
  }
  rows.sort((a, b) => b.value - a.value || (a.slug < b.slug ? -1 : 1)).forEach((r, i) => { r.rank = i + 1; });
  aside.sort((a, b) => b.tvl - a.tvl);
  const onRecord = protocols.filter((p) => tokenStatus(p) === 'on-record').length;
  return { asOf: snapshot.as_of, marketWeek, fit, tests, ranges, tokens, comps, rows, aside, chainTally, ledger: ledgerOf(rows, tokens, onRecord, aside),
    counts: { protocols: protocols.length, watchlist: snapshot.watchlist.length, onRecord } };
}
/** Every protocol lands in exactly one group, each with the reason it is or is not ranked. */
function ledgerOf(rows, tokens, onRecord, aside) {
  const ruled = ['Bridge', 'Liquid staking', 'Exchange custody', 'Versioned listing', 'Wrapped or staked', 'Kin of a token'];
  return [['Ranked', rows.length, 'records no token, no rule sets it aside'], ['Token trades', tokens.length, 'a market cap: comps, never ranked'], ['Token on record', onRecord, 'a ticker, no cap'],
    ...ruled.map((g, i) => [g, aside.filter((a) => a.reason === g).length, i > 4 ? 'its name stem carries a token' : 'the house rule, below its floor'])];
}
/** The page's proof it shows what board.json holds: row i must carry its slug, rank, dollars and plan digest. */
function checkBoard(rows, board) {
  const same = board.filter(([slug, rank, dollars, sig], i) => {
    const r = rows[i];
    return !!r && r.slug === slug && r.rank === rank && r.value === dollars && digest(root.Radar.stepStrings(r.plan)) === sig;
  }).length;
  return { same, of: board.length, ok: same === board.length && same === rows.length };
}

// ════ 5 · reading the snapshot
/** 'trades': a market cap. 'on-record': a ticker or CoinGecko id, no cap. 'none': neither. */
const tokenStatus = (p) => p.mcap_usd > 0 ? 'trades' : (p.gecko_id || p.symbol) ? 'on-record' : 'none';
const HOUSE_CATEGORIES = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];
/** The house's own watchlist rule, reused to sort protocols below its floor. */
function houseRule(p) {
  const at = HOUSE_CATEGORIES.indexOf(p.category);
  if (at >= 0) return at < 2 ? 'Bridge' : at < 5 ? 'Liquid staking' : 'Exchange custody';
  if (/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/.test(p.name)) return 'Exchange custody';
  if (/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)) return 'Versioned listing';
  return /\b(wrapped|staked|staking)\b/i.test(p.name) ? 'Wrapped or staked' : null;
}
const stem = (name) => name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] || name;
const ageDays = (asOf, listedAt) => listedAt ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(listedAt)) / 864e5)) : null;
// six sectors, so each keeps at least eight comps: DefiLlama's 40 categories leave most with one or none
const SECTORS = {
  Vaults: 'Risk Curators|Onchain Capital Allocator|Yield|Yield Aggregator|Liquidity Manager|Leveraged Farming|Farm|Indexes|Options Vault',
  Dollars: 'Basis Trading|CDP|CDP Manager|Stablecoin Wrapper|Dual-Token Stablecoin|CeDeFi', RWA: 'RWA|RWA Lending',
  Trading: 'Dexs|Derivatives|Options|Prediction Market|Interest Rate Derivatives|OTC Marketplace|NFT Marketplace|Launchpad',
  Lending: 'Lending|Uncollateralized Lending|Collateral Markets|Collateral Management',
};
const sectorOf = (category) => Object.keys(SECTORS).find((s) => SECTORS[s].split('|').includes(category)) || 'Network';

// ════ 6 · small maths and formats
const log10 = (x) => Math.log(x) / Math.LN10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const signed = (pct) => `${pct < 0 ? '−' : '+'}${Math.abs(pct).toFixed(1)}%`;
function median(values) {
  if (!values.length) return 0;
  const s = Float64Array.from(values).sort(), mid = (s.length - 1) / 2;
  return (s[Math.floor(mid)] + s[Math.ceil(mid)]) / 2;
}
/** The median of every pairwise slope, so one 400x outlier cannot tilt the line. */
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
  if (a >= 100) return `${sign}$${String(Math.round(a)).replace(/\B(?=(\d{3})+$)/g, ',')}`;
  return a > 0 && a < 0.01 ? 'under $0.01' : `${sign}$${a.toFixed(2)}`;
}
/** FNV-1a over the joined strings, so the page can prove its plan text is board.json's. */
function digest(strings) {
  let h = 2166136261;
  for (const ch of strings.join('\n')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16);
}

root.Radar = { CONFIG, buildRadar, checkBoard, nearestComps, digest, usd, signed, log10, clamp };
if (typeof module === 'object') module.exports = root.Radar;
})(typeof window !== 'undefined' ? window : globalThis);
