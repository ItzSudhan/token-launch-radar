/* 3 · Criterion 3, farm plans: eight dated steps a row, each with dollars and minutes. Checked: stepStrings() writes them to
   board.json and checkBoard() compares their digest on the page.
   costPlan  slice − gas and fees − T-bill = net; slice = implied value × 10% × this ticket's share of dollar-days
   farmPlan  the smallest ticket that pays $25 an hour;  playOf  category -> one of nine plays;  planRoute  farms in a budget */
(function (root) {
const R = root.Radar, { usd } = R;
const RULES = { tickets: [250, 500, 1000, 2500, 5000, 10000, 25000], wage: 25, share: 0.10, tbill: 0.04, pointsWindow: 365, ofTvl: 0.01 };

/** Deposits already in count half the days the row has run with no token, a year at most. */
function costPlan(row, C) {
  const how = PLAYS[playOf(row)], N = row.name, H = how.hold, weeks = Math.round(H / 7), chain = farmChain(row.chains), [gas, fund] = chainCost(chain), asset = assetOf(row, chain);
  const fill = (t) => t.replace('{V}', VENUE[row.category] || '{N}').replace(/\{C(\/\d+)?\}/g, (_, d) => usd(d ? C / +d.slice(1) : C)).replace('{A}', asset).replace(/\{N\}/g, N).replace('{chain}', chain);
  const ahead = Math.min(row.age == null ? RULES.pointsWindow : row.age, RULES.pointsWindow) / 2;
  const slice = row.value * RULES.share * C / (row.tvl + C) * H / (ahead + H);
  const [txIn, txQualify, txWeek, txOut] = how.tx, gate = how.gateFirst, start = gate ? 4 : 1, gasBudget = Math.max(1, Math.ceil(2 * gas * (txIn + txQualify + weeks * txWeek + txOut + 2)));
  const step = (verb, what, dollars, min, from, to) => ({ verb, what, usd: dollars, min, from, to });   // from, to: days
  const enter = step('Enter', fill(how.enter), txIn * gas + how.pct[0] * C, how.min[0], start, start);
  const qualify = step('Qualify', fill(how.qualify), txQualify * gas + how.carry * C * H / 365, how.min[1], gate ? 0 : 1, gate ? 3 : 7);
  const steps = [
    step('Verify', `Open ${N} from its DefiLlama page (slug ${row.slug}), not an ad; read its contracts and audits; confirm no token.`, 0, 15, 0, 0),
    step('Fund', `Withdraw ${usd(C)} of ${asset} and ${usd(gasBudget)} of gas from an exchange to a fresh wallet on ${chain}.`, fund, 10, 0, 1),
    ...(gate ? [qualify, enter] : [enter, qualify]),
    step('Upkeep', `Each week for ${weeks} weeks, ${how.watch}; log it.`, weeks * (txWeek * gas + how.pct[1] * C), weeks * how.min[2], 8, H),
    step('Stop rule', `Leave early if ${how.stop}, TVL drops under ${usd(row.tvl * 0.7)} (−30%), or a token is announced with nothing for depositors.`, 0, 5, start, H),
    step('Exit', `At day ${H}, unwind the position and send the funds back to the exchange.`, (txOut + 1) * gas, 10, H, H + 1),
    step('Claim', `If a token launches, claim only from ${N}'s own site, never pay to claim, then revoke approvals. At the implied ${usd(row.value)} this ticket's slice is about ${usd(slice)}.`, gas, 10, H, H + 7),
  ];
  const fees = steps.reduce((s, x) => s + x.usd, 0), minutes = steps.reduce((s, x) => s + x.min, 0);
  const forgone = C * RULES.tbill * H / 365, net = slice - fees - forgone, perHour = net / (minutes / 60);
  const scaling = C * (how.pct[0] + weeks * how.pct[1] + how.carry * H / 365), perDollar = (slice - scaling - forgone) / C;
  return { label: how.label, chain, hold: H, weeks, capital: C, ahead, steps, calendar: calendarOf(steps, weeks), fees, minutes, forgone, slice, net, perHour, verdict: perHour >= RULES.wage ? 'FARM' : slice > fees ? 'THIN' : 'SKIP',
    yieldNeeded: Math.max(0, (fees + forgone - slice) / C * 365 / H), breakEven: perDollar > 0 ? (fees - scaling) / perDollar : null };
}
/** FARM: the smallest ticket that pays $25 an hour net. THIN: the slice beats fees. SKIP: no slice does. */
function farmPlan(row) {
  const plans = RULES.tickets.filter((C) => C <= row.tvl * RULES.ofTvl).map((C) => costPlan(row, C));
  return plans.find((p) => p.verdict === 'FARM') || plans.find((p) => p.net > 0) || plans.find((p) => p.verdict === 'THIN') || plans[0];
}
/** Minutes and dollars by week, for planRoute. */
function calendarOf(steps, weeks) {
  const calendar = emptyWeeks(weeks + 2);
  for (const s of steps) {
    const first = s.verb === 'Upkeep' ? 1 : Math.floor(s.from / 7), n = s.verb === 'Upkeep' ? weeks : 1;
    for (let w = first; w < first + n; w++) { calendar[w].min += s.min / n; calendar[w].usd += s.usd / n; }
  }
  return calendar;
}
const addPlans = (rows) => rows.forEach((r) => { r.plan = farmPlan(r); });
const stepStrings = (plan) => plan.steps.map((s) => `${s.verb} (${s.to > s.from ? `days ${s.from} to ${s.to}` : `day ${s.from}`}): ${s.what} Cost: ${s.usd ? usd(s.usd) : 'nothing'}. Time: ${s.min} min${s.verb === 'Upkeep' ? ' in all' : ''}.`);

// tx: [enter, qualify, weekly, exit] · pct: ticket fees [once, weekly] · carry: interest a year
const play = (label, hold, tx, pct, carry, min, enter, qualify, watch, stop, gateFirst) => ({ label, hold, tx, pct, carry, min, enter, qualify, watch, stop, gateFirst });
const PLAYS = {
  vault: play('Vault deposit', 90, [2, 0, 0, 1], [0, 0], 0, [10, 5, 5],
    'Approve and deposit {C} of {A} into {V} on {chain}; keep the shares in this wallet.',
    'Check whether {N} runs points or a whitelist; register this wallet if so. Do not move the deposit.',
    'note the share price, TVL and allocation', 'the share price falls while its asset is flat'),
  lend: play('Lend and borrow', 90, [2, 1, 0, 2], [0, 0], 0.0075, [10, 10, 5],
    'Approve and supply {C} of {A} to {N} on {chain}.',
    'Borrow {C/4} of a stablecoin against it and hold it: about 3% a year, health above 2. Check whether either side earns points.',
    'check the health factor and the supply rate', 'health nears 1.5 or utilisation pins at 100%'),
  mint: play('Mint and hold', 90, [2, 1, 0, 2], [0.001, 0], 0, [10, 5, 5],
    'Mint or buy {C} of {V} on {chain} with {A}, about 0.1% in fees.',
    "Move it into its yield-bearing form in {N}'s own app, if there is one; check whether holding or staking earns points.",
    'check the peg and the backing report', 'it trades 0.5% under par for a day or backing is under 100%'),
  cdp: play('CDP mint', 90, [2, 1, 0, 2], [0, 0], 0.0167, [15, 5, 5],
    'Lock {C} of collateral on {N} on {chain} and mint {C/3} of its stablecoin: a 300% ratio, about 5% a year.',
    "Put the minted stablecoin in {N}'s savings or stability module; check whether debt or deposit earns points.",
    'check the collateral ratio and the peg', 'the ratio falls under 200% or the stablecoin slips under $0.99'),
  rwa: play('Tokenised asset', 90, [2, 0, 0, 1], [0.002, 0], 0, [15, 20, 5],
    "Mint or buy {C} of {N}'s largest tokenised asset on {chain} with {A}, about 0.2% in fees; read the redemption notice first.",
    'Check whether {N} asks for KYC or a whitelist and pass it with this wallet before funding; allow 1 to 3 days.',
    'check the stated NAV and the redemption queue', 'redemptions pause or NAV is marked down', true),
  pool: play('LP and swaps', 60, [3, 0, 1, 1], [0, 0.0003], 0, [15, 5, 10],
    "Approve both tokens and add {C} to {N}'s deepest pool on {chain}. If it takes no outside liquidity, keep the ticket for the weekly swaps.",
    'Check whether {N} scores liquidity, volume or active weeks; plan one {C/10} swap a week through its own router (0.3% fee).',
    "make the swap and check the pool's range", 'impermanent loss passes 2%'),
  trade: play('Trading volume', 60, [2, 0, 2, 1], [0, 0.001], 0, [10, 5, 15],
    'Deposit {C} of {A} on {N} on {chain} as margin or trading balance.',
    'Check whether {N} scores volume or balance; plan one round trip a week in its most liquid market: open and close {C} unlevered, about 0.05% a side.',
    'make the round trip and total fees, spread and funding', 'they pass 3% of the deposit'),
  stake: play('Stake or restake', 90, [2, 1, 0, 2], [0, 0], 0, [10, 10, 5],
    'Put {C} of the asset it accepts into {V} on {chain}; note the unbonding period first.',
    "Choose an operator or pool in {N}'s own app, keep the receipt in this wallet, and check whether deposits earn points.",
    "check the operator's status and reward rate", 'the operator is slashed or withdrawals queue over a week'),
  network: play('Use the network', 90, [2, 0, 1, 1], [0, 0], 0, [15, 5, 5],
    'Move {C} of {A} onto {N} through its own bridge, app or wallet.',
    'Check whether {N} counts active weeks or actions; plan one real transfer, payment or contract call a week.',
    'make the transaction and check the fee', 'the bridge pauses withdrawals'),
};
const BY_CATEGORY = { 'Uncollateralized Lending': 'vault', 'Collateral Markets': 'stake', CDP: 'cdp', 'CDP Manager': 'cdp', Dexs: 'pool', Restaking: 'stake',
  'Staking Pool': 'stake', 'Governance Incentives': 'stake', Insurance: 'stake', 'Anchor BTC': 'mint', 'Decentralized BTC': 'mint', 'Interest Rate Derivatives': 'vault' };
const BY_SECTOR = { Vaults: 'vault', Dollars: 'mint', RWA: 'rwa', Lending: 'lend', Trading: 'trade', Network: 'network' };
const playOf = (row) => BY_CATEGORY[row.category] || BY_SECTOR[row.sector];
const VENUE = { 'Risk Curators': "{N}'s largest curated vault (on the lending market that hosts it)", 'Onchain Capital Allocator': "{N}'s largest managed vault",
  'Yield Aggregator': "{N}'s largest auto-compounding vault", 'Uncollateralized Lending': "{N}'s shortest-lock pool", 'Basis Trading': "{N}'s basis-trade dollar" };
// stated dollars: [gas a transaction, exchange withdrawal fee]
const CHAIN_COST = { Ethereum: [2.5, 4], Bitcoin: [1.5, 2], Tron: [1, 1.5], Binance: [0.1, 0.3], Polygon: [0.01, 0.3], Solana: [0.005, 1], Sui: [0.005, 0.5], Stellar: [0.001, 0.2],
  Base: [0.03, 0.5], Arbitrum: [0.03, 0.5], Optimism: [0.03, 0.5], Monad: [0.01, 1], 'Hyperliquid L1': [0.01, 1] };
const chainCost = (chain) => CHAIN_COST[chain] || [0.05, 1.5];
const farmChain = (chains) => chains.slice(0, 3).sort((a, b) => chainCost(a)[0] - chainCost(b)[0] || chains.indexOf(a) - chains.indexOf(b))[0] || 'its main chain';
const assetOf = (row, chain) => /BTC/.test(row.category) || /^(Bitcoin|RSK|Stacks|BSquared|CORE|Hemi)$/.test(chain) ? 'BTC' : chain === 'Tron' ? 'USDT' : 'USDC (or the asset it takes)';
const emptyWeeks = (n) => Array.from({ length: n }, () => ({ min: 0, usd: 0 }));

/** FARM rows by net per share of money and hours used, each started in the first week its calendar fits; one per stem. */
function planRoute(rows, budget) {
  const weeks = emptyWeeks(18), picks = [], seen = {}, score = ({ plan: p }) => p.net / (p.capital / budget.capital + p.minutes / (budget.hours * 600));
  let left = budget.capital;
  for (const row of rows.filter((r) => r.plan.verdict === 'FARM').sort((a, b) => score(b) - score(a) || a.rank - b.rank)) {
    const { capital, calendar } = row.plan, family = row.name.toLowerCase().split(/[^a-z0-9]+/)[0];
    const start = [0, 1, 2, 3].find((s) => calendar.every((w, i) => weeks[s + i].min + w.min <= budget.hours * 60));
    if (capital > left || seen[family] || start == null) continue;
    calendar.forEach((w, i) => { weeks[start + i].min += w.min; weeks[start + i].usd += w.usd; });
    picks.push({ row, start, end: start + calendar.length });
    left -= capital;
    seen[family] = true;
  }
  const sum = (k) => picks.reduce((s, x) => s + x.row.plan[k], 0), net = sum('net'), slice = sum('slice'), minutes = sum('minutes');
  return { picks, weeks: weeks.slice(0, Math.max(0, ...picks.map((x) => x.end))), capital: budget.capital - left, fees: sum('fees'), forgone: sum('forgone'), net, minutes, perHour: net / (minutes / 60 || 1), shareNeeded: slice ? 1 - net / slice : 0 };
}

Object.assign(R, { addPlans, stepStrings, planRoute });
})(globalThis);
