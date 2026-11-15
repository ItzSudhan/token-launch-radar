// Token radar value model: the snapshot in, a ranked board of pre-token protocols out.
//
// Every number here comes from the sealed snapshot. No protocol name is special-cased: one function
// prices every row, and the market's own prices for protocols whose token already trades are the yardstick.
//
//   peer multiple  m(c)   = exp((n*ln(median mcap/TVL of category c) + K*ln(median of all)) / (n + K))
//                           over traded protocols (mcap and TVL both recorded), clamped to [M_MIN, M_MAX]
//   momentum       mom    = (1 + clamp(change_7d, G_MIN, G_MAX)/100) ^ G_POWER
//   tokenless age  age    = durability(days) x staleness(days)
//                           durability = 0.6 + 0.4*(1 - e^(-days/270))   TVL that has stayed is worth more
//                           staleness  = 1 - 0.3*clamp((days-730)/730)  two years on with no token, less
//   breadth        br     = 1 + 0.03*min(chains-1, 10)
//   parent link    pl     = 0.5 when the protocol clears the floor and the house's name and category
//                           rules yet the watchlist leaves it out: DefiLlama links it to a parent, so any
//                           launch is more likely the parent's token than its own
//   implied FDV           = TVL x m(c) x mom x age x br x pl
//
// The board ranks by implied FDV, highest first. Protocols with a token on record are kept apart.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL = {
  version: 'peer-multiple-2',
  shrink_k: 4,
  m_min: 0.04,
  m_max: 1.5,
  g_min: -50,
  g_max: 80,
  g_power: 0.6,
  durability_floor: 0.6,
  durability_days: 270,
  stale_start_days: 730,
  stale_span_days: 730,
  stale_max: 0.3,
  unknown_age_days: 540,
  breadth_step: 0.03,
  breadth_cap: 10,
  parent_link: 0.5,
  airdrop_share: 0.08,
};

/** Categories the house treats as wrapped, staked or bridged products, never a token of their own. */
const SET_ASIDE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;

export class SnapshotError extends Error {}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Partial<Snapshot>;
  if (typeof raw !== 'object' || raw === null) throw new SnapshotError('snapshot is not an object');
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) throw new SnapshotError('snapshot lacks protocols or watchlist');
  if (typeof raw.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.as_of)) throw new SnapshotError('snapshot lacks as_of');
  for (const p of raw.protocols) {
    if (typeof p?.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') throw new SnapshotError(`bad protocol entry ${JSON.stringify(p).slice(0, 80)}`);
    if (!Array.isArray(p.chains)) p.chains = [];
  }
  return {
    as_of: raw.as_of,
    source: String(raw.source ?? ''),
    floor_usd: Number(raw.floor_usd ?? 50_000_000),
    protocols: raw.protocols,
    watchlist: raw.watchlist.map(String),
  };
}

export type TokenStatus = 'pre-token' | 'trades' | 'recorded';

/** What DefiLlama's record says about a protocol's token. */
export function tokenStatus(p: SnapshotProtocol): TokenStatus {
  if (p.mcap_usd !== null && p.mcap_usd > 0) return 'trades';
  if (p.gecko_id !== null || p.symbol !== null) return 'recorded';
  return 'pre-token';
}

/** Why a pre-token protocol is set aside as a product of a token that already trades, or null. */
export function setAsideReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && SET_ASIDE_CATEGORIES.has(p.category)) return `category ${p.category}`;
  if (VERSIONED.test(p.name)) return 'versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked product';
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange product';
  return null;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null || !/^\d{4}-\d{2}-\d{2}$/.test(listedAt)) return null;
  const d = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${listedAt}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(d) ? Math.max(0, Math.round(d)) : null;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo]! + (s[Math.min(lo + 1, s.length - 1)]! - s[lo]!) * (i - lo);
};

export interface Peer {
  slug: string;
  name: string;
  category: string;
  symbol: string;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

export interface CategoryMultiple {
  category: string;
  peers: number;
  raw_median: number | null;
  multiple: number;
}

export interface PeerBook {
  global_median: number;
  band_low: number;
  band_high: number;
  peers: Peer[];
  categories: Map<string, CategoryMultiple>;
}

/** The market's own mcap/TVL multiples, per category, from protocols whose token trades. */
export function peerBook(snapshot: Snapshot): PeerBook {
  const peers: Peer[] = snapshot.protocols
    .filter((p) => tokenStatus(p) === 'trades' && p.tvl_usd > 0)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category ?? 'Uncategorised', symbol: p.symbol ?? p.gecko_id ?? '', tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, ratio: p.mcap_usd! / p.tvl_usd }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : 1));
  const logs = peers.map((p) => Math.log(p.ratio));
  const g = Math.exp(median(logs));
  const band_low = Math.exp(quantile(logs, 0.25) - median(logs));
  const band_high = Math.exp(quantile(logs, 0.75) - median(logs));
  const byCat = new Map<string, number[]>();
  for (const p of peers) byCat.set(p.category, [...(byCat.get(p.category) ?? []), Math.log(p.ratio)]);
  const categories = new Map<string, CategoryMultiple>();
  const cats = new Set([...byCat.keys(), ...snapshot.protocols.map((p) => p.category ?? 'Uncategorised')]);
  for (const c of [...cats].sort()) {
    const l = byCat.get(c) ?? [];
    const n = l.length;
    const shrunk = n ? (n * median(l) + MODEL.shrink_k * Math.log(g)) / (n + MODEL.shrink_k) : Math.log(g);
    categories.set(c, { category: c, peers: n, raw_median: n ? Math.exp(median(l)) : null, multiple: clamp(Math.exp(shrunk), MODEL.m_min, MODEL.m_max) });
  }
  return { global_median: g, band_low, band_high, peers, categories };
}

export interface Factors {
  multiple: number;
  momentum: number;
  durability: number;
  staleness: number;
  breadth: number;
  parent_link: number;
}

export interface Scored {
  p: SnapshotProtocol;
  age: number | null;
  watch: boolean;
  parent_linked: boolean;
  factors: Factors;
  implied: number;
  low: number;
  high: number;
  airdrop_per_10k: number;
}

export function score(p: SnapshotProtocol, asOf: string, book: PeerBook, watch: boolean, parentLinked: boolean): Scored {
  const cat = book.categories.get(p.category ?? 'Uncategorised');
  const multiple = cat ? cat.multiple : book.global_median;
  const g = clamp(p.change_7d ?? 0, MODEL.g_min, MODEL.g_max);
  const momentum = Math.pow(1 + g / 100, MODEL.g_power);
  const age = ageDays(asOf, p.listed_at);
  const days = age ?? MODEL.unknown_age_days;
  const durability = MODEL.durability_floor + (1 - MODEL.durability_floor) * (1 - Math.exp(-days / MODEL.durability_days));
  const staleness = 1 - MODEL.stale_max * clamp((days - MODEL.stale_start_days) / MODEL.stale_span_days, 0, 1);
  const breadth = 1 + MODEL.breadth_step * Math.min(Math.max(p.chains.length - 1, 0), MODEL.breadth_cap);
  const parent_link = parentLinked ? MODEL.parent_link : 1;
  const factors: Factors = { multiple, momentum, durability, staleness, breadth, parent_link };
  const exact = p.tvl_usd * multiple * momentum * durability * staleness * breadth * parent_link;
  const implied = Math.max(1, Math.round(exact));
  return {
    p, age, watch, parent_linked: parentLinked, factors, implied,
    low: Math.max(1, Math.round(exact * book.band_low)),
    high: Math.max(1, Math.round(exact * book.band_high)),
    airdrop_per_10k: p.tvl_usd > 0 ? Math.round((10_000 * MODEL.airdrop_share * exact) / p.tvl_usd) : 0,
  };
}

export interface Universe {
  book: PeerBook;
  ranked: Scored[];
  setAside: { slug: string; name: string; category: string | null; tvl_usd: number; reason: string }[];
  recorded: number;
}

/** Score every rankable pre-token protocol: the watchlist, plus every one below or beside it. */
export function buildUniverse(snapshot: Snapshot): Universe {
  const book = peerBook(snapshot);
  const watch = new Set(snapshot.watchlist);
  const ranked: Scored[] = [];
  const setAside: Universe['setAside'] = [];
  let recorded = 0;
  for (const p of snapshot.protocols) {
    const status = tokenStatus(p);
    if (status === 'recorded') recorded++;
    if (status !== 'pre-token' && !watch.has(p.slug)) continue;
    const reason = watch.has(p.slug) ? null : setAsideReason(p);
    if (reason !== null) {
      setAside.push({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason });
      continue;
    }
    const parentLinked = !watch.has(p.slug) && p.tvl_usd >= snapshot.floor_usd;
    ranked.push(score(p, snapshot.as_of, book, watch.has(p.slug), parentLinked));
  }
  ranked.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));
  setAside.sort((a, b) => b.tvl_usd - a.tvl_usd);
  return { book, ranked, setAside, recorded };
}
