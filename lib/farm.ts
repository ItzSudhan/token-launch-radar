// Farm plans: concrete steps for each ranked protocol, each with what it costs and how long it takes.
//
// A plan is assembled from the protocol's own record: its category picks the playbook (vault, lending,
// trading, real-world asset or network), its chains pick where to farm and what a transaction costs there,
// its TVL and 7-day change set the size and the exit line, and the model's implied value sets what the
// farm is worth per $10,000 if the launch priced as the model says. Nothing is keyed to a protocol's name.

import { MODEL, type Scored } from './model.ts';

export interface FarmStep {
  phase: 'before' | 'during' | 'after';
  text: string;
  cost: string;
  time: string;
}

export type Playbook = 'vault' | 'lending' | 'trading' | 'rwa' | 'network';

const PLAYBOOK: Record<string, Playbook> = {
  'Risk Curators': 'vault', 'Onchain Capital Allocator': 'vault', Yield: 'vault', 'Yield Aggregator': 'vault',
  'Basis Trading': 'vault', 'Stablecoin Wrapper': 'vault', 'Liquidity Manager': 'vault', 'Options Vault': 'vault',
  'Leveraged Farming': 'vault', Farm: 'vault', Indexes: 'vault', CeDeFi: 'vault', 'Governance Incentives': 'vault',
  Lending: 'lending', CDP: 'lending', 'CDP Manager': 'lending', 'Uncollateralized Lending': 'lending',
  'Collateral Markets': 'lending', 'Dual-Token Stablecoin': 'lending',
  Dexs: 'trading', Derivatives: 'trading', 'Prediction Market': 'trading', Options: 'trading',
  'Interest Rate Derivatives': 'trading', 'OTC Marketplace': 'trading', 'NFT Marketplace': 'trading',
  RWA: 'rwa', 'RWA Lending': 'rwa',
};

export function playbookOf(category: string | null): Playbook {
  return (category !== null && PLAYBOOK[category]) || 'network';
}

/** Typical cost of one transaction per chain, in US dollars (low, high). Unlisted chains use the default. */
const GAS: Record<string, [number, number]> = {
  Ethereum: [2, 12], Bitcoin: [1, 6], Solana: [0.001, 0.01], Base: [0.01, 0.1], Arbitrum: [0.02, 0.15],
  Optimism: [0.01, 0.1], Polygon: [0.01, 0.05], Binance: [0.03, 0.15], Avalanche: [0.02, 0.2], Sui: [0.002, 0.02],
  Monad: [0.002, 0.03], 'Hyperliquid L1': [0.005, 0.05], Tron: [0.5, 2], Algorand: [0.001, 0.002],
  Stellar: [0.0001, 0.001], Ripple: [0.0001, 0.001], Unichain: [0.005, 0.05], Ink: [0.005, 0.05], Plasma: [0.001, 0.01],
};
const DEFAULT_GAS: [number, number] = [0.01, 0.5];

/**
 * Where a farmer should start: the cheapest of the protocol's first three chains. DefiLlama lists a
 * protocol's main deployments first, and a points programme is likeliest to be live where most TVL sits.
 */
export function farmChain(chains: string[]): string {
  if (chains.length === 0) return 'its main chain';
  const main = chains.slice(0, 3);
  return [...main].sort((a, b) => (GAS[a] ?? DEFAULT_GAS)[1] - (GAS[b] ?? DEFAULT_GAS)[1] || main.indexOf(a) - main.indexOf(b))[0]!;
}

const money = (x: number): string => {
  if (x >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(1)}M`;
  if (x >= 1e3) return `$${(x / 1e3).toFixed(x >= 1e4 ? 0 : 1)}k`;
  if (x >= 1) return `$${x.toFixed(x >= 10 ? 0 : 2)}`;
  return `$${x.toFixed(x >= 0.01 ? 2 : 4)}`;
};
const gasText = (chain: string, txs: number): string => {
  const [lo, hi] = GAS[chain] ?? DEFAULT_GAS;
  return `${money(lo * txs)}-${money(hi * txs)} gas on ${chain}`;
};

/** A position size that stays a small share of the pool: at most 0.05% of TVL, $500 to $25,000. */
export function suggestedSize(tvl: number): number {
  const raw = Math.min(25_000, Math.max(500, tvl * 0.0005));
  const step = raw >= 5000 ? 1000 : 100;
  return Math.round(raw / step) * step;
}

/** The plan for one scored protocol, phase by phase. */
export function farmPlan(s: Scored, asOf: string): FarmStep[] {
  const p = s.p;
  const chain = farmChain(p.chains);
  const size = suggestedSize(p.tvl_usd);
  const book = playbookOf(p.category);
  const g = p.change_7d;
  const exitTvl = p.tvl_usd * 0.7;
  const carry = (size * 0.045) / 12; // what the same stablecoins earn in a plain 4.5% money market, per month
  const perSize = (s.airdrop_per_10k * size) / 10_000;
  const otherChains = p.chains.filter((c) => c !== chain).slice(0, 3);
  const steps: FarmStep[] = [];

  steps.push({
    phase: 'before',
    text: `Confirm ${p.name} still has no token: DefiLlama recorded none on ${asOf}. Search CoinGecko and the project's official site and X account for a token, a points page or a "season" announcement, and bookmark the official app link so you never use a lookalike.`,
    cost: '$0', time: '10 min',
  });
  steps.push({
    phase: 'before',
    text: `Fund a fresh wallet on ${chain}${otherChains.length ? ` (cheapest of its ${p.chains.length} chains; ${otherChains.join(', ')} also count)` : ''} with ${money(size)} in the asset the protocol takes, about 0.05% of its ${money(p.tvl_usd)} TVL, plus gas.`,
    cost: `${gasText(chain, 2)} plus any bridge fee`, time: '15-30 min',
  });

  if (book === 'vault') {
    steps.push({ phase: 'during', text: `Deposit ${money(size)} into ${p.name}'s largest vault on ${chain} (pick the one with the most TVL and the longest track record, not the highest APY), and record the vault address and the share tokens you receive.`, cost: gasText(chain, 2), time: '10 min' });
    steps.push({ phase: 'during', text: `If ${p.name} runs points or a referral code, register the wallet and apply the code before the deposit is a day old; points programmes usually weight time-in-vault, so keep the position steady rather than cycling it.`, cost: '$0', time: '5 min' });
  } else if (book === 'lending') {
    steps.push({ phase: 'during', text: `Supply ${money(size)} of stablecoins or a blue-chip asset to ${p.name} on ${chain}. Lending points usually reward both sides, so borrow 30-40% of it back against the deposit and keep the health factor above 1.8.`, cost: `${gasText(chain, 3)}; borrow interest offsets most of the supply yield`, time: '15 min' });
    steps.push({ phase: 'during', text: `Set a price alert at the liquidation line and a weekly reminder: repay the borrow if the health factor falls under 1.5. Do not loop more than once; one loop doubles points but also doubles liquidation risk.`, cost: '$0 (alert app)', time: '5 min, then 2 min a week' });
  } else if (book === 'trading') {
    steps.push({ phase: 'during', text: `Trade or provide liquidity on ${p.name} on ${chain}: put ${money(size / 2)} in its deepest stable or major pair as LP, and trade the other ${money(size / 2)} as volume in small round trips on liquid pairs, not leverage.`, cost: `${gasText(chain, 6)} plus trading fees of about 0.05-0.1% of volume`, time: '30 min, then 10 min a week' });
    steps.push({ phase: 'during', text: `Spread activity over many weeks rather than one burst: trading airdrops often score active weeks and fees paid, and penalise wash trading. Aim for one session a week; cap fees at 1% of the position per month.`, cost: `about ${money(size * 0.01)} in fees a month at that cap`, time: '10 min a week' });
  } else if (book === 'rwa') {
    steps.push({ phase: 'during', text: `Complete ${p.name}'s KYC or whitelist step if it asks for one, then mint or buy ${money(size)} of its tokenised product on ${chain}; check the redemption terms (notice period, minimums) before buying.`, cost: `${gasText(chain, 2)}; possible mint/redeem fee of 0-0.5%`, time: '1-3 days for KYC, 15 min to mint' });
    steps.push({ phase: 'during', text: `Hold the product in the same wallet and, if ${p.name} lists DeFi integrations (lending collateral, LP), use one of them: real-world-asset programmes tend to reward integrations over idle holding.`, cost: gasText(chain, 2), time: '15 min' });
  } else {
    steps.push({ phase: 'during', text: `Use ${p.name} the way it is meant to be used on ${chain}: stake, bridge in or route payments through it with ${money(size)}, choosing its native path rather than a third-party wrapper so the activity is attributed to your wallet.`, cost: gasText(chain, 3), time: '20 min' });
    steps.push({ phase: 'during', text: `Repeat a small genuine action every week (a transfer, a restake, a claim) so the wallet shows sustained use; network airdrops often score active weeks and distinct actions more than raw size.`, cost: gasText(chain, 4) + ' a month', time: '5 min a week' });
  }

  steps.push({
    phase: 'during',
    text: `Review it weekly. Its TVL moved ${g === null ? 'an unreported amount' : `${g >= 0 ? '+' : ''}${g.toFixed(1)}%`} in the snapshot's week. Withdraw if TVL drops below ${money(exitTvl)} (30% under ${money(p.tvl_usd)}), if an exploit or depeg is reported, or if a token launches with no allocation for depositors.`,
    cost: `${gasText(chain, 2)} to exit`, time: '5 min a week',
  });
  steps.push({
    phase: 'during',
    text: `Weigh the cost: the same ${money(size)} in a plain 4.5% money market earns about ${money(carry)} a month. At the model's implied value (${money(s.implied)}) and an ${Math.round(MODEL.airdrop_share * 100)}% airdrop paid pro rata, ${money(size)} held through a season would be worth about ${money(perSize)}.`,
    cost: `about ${money(carry)} a month in yield forgone`, time: 'one season, typically 3-12 months',
  });
  steps.push({
    phase: 'after',
    text: `If a token launches: claim from the official claim page only, within the claim window, and check the vesting and lock-up terms before acting; a launch below the model's ${money(s.low)} low case suggests the market prices it under its peers.`,
    cost: gasText(chain, 1), time: '15 min at launch',
  });
  return steps;
}

export function stepString(s: FarmStep): string {
  return `${s.text} Cost: ${s.cost}. Time: ${s.time}.`;
}
