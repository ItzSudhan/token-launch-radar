// Token radar: reads the sealed DefiLlama snapshot, ranks every pre-token protocol by the implied value
// of the token it may one day launch, and writes the board, the dashboard's data and the dossier.
//
//   node main.ts [--input /input/snapshot.json] [--output /output]
//   (MAKEFUN_OUTPUT_DIR stands in for /output when run outside the grader)

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUniverse, MODEL, parseSnapshot } from './lib/model.ts';
import { farmChain, farmPlan, playbookOf, stepString, suggestedSize } from './lib/farm.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  return fallback;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const universe = buildUniverse(snapshot);

const plans = universe.ranked.map((s) => farmPlan(s, snapshot.as_of));
const rows = universe.ranked.map((s, i) => ({
  rank: i + 1,
  slug: s.p.slug,
  name: s.p.name,
  implied_value_usd: s.implied,
  implied_low_usd: s.low,
  implied_high_usd: s.high,
  category: s.p.category,
  on_watchlist: s.watch,
  parent_linked: s.parent_linked,
  farm_steps: plans[i]!.map(stepString),
}));

/** The gate's shape, checked before anything is written: a board the scorer would refuse is a bug here. */
function boardIssue(): string | null {
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows, the gate takes 100 to 4,000`;
  const slugs = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((w) => !slugs.has(w));
  if (missing.length) return `watchlist not covered: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) return `${r.slug}: implied value ${r.implied_value_usd}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `${r.slug}: value rises with rank`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug}: ${r.farm_steps.length} farm steps`;
    const bad = r.farm_steps.find((t) => t.trim().length < 20 || t.trim().length > 600);
    if (bad !== undefined) return `${r.slug}: a farm step of ${bad.trim().length} characters`;
  }
  if (new Set(rows.map((r) => r.implied_value_usd)).size < 2) return 'every implied value is the same';
  return null;
}
const issue = boardIssue();
if (issue !== null) {
  process.stderr.write(`token radar: the board would fail the gate: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ as_of: snapshot.as_of, source: snapshot.source, model: 'peer-multiple-2', rows })}\n`);

// The dashboard's data: compact keys, rounded factors, so the page loads in one small script.
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
const { book } = universe;
const data = {
  as_of: snapshot.as_of,
  source: snapshot.source,
  floor: snapshot.floor_usd,
  model: MODEL,
  counts: {
    protocols: snapshot.protocols.length,
    watchlist: snapshot.watchlist.length,
    traded: book.peers.length,
    recorded: universe.recorded,
    set_aside: universe.setAside.length,
    ranked: rows.length,
  },
  peer_median: r4(book.global_median),
  band: [r4(book.band_low), r4(book.band_high)],
  categories: [...book.categories.values()].filter((c) => c.peers > 0 || universe.ranked.some((s) => (s.p.category ?? 'Uncategorised') === c.category))
    .map((c) => ({ c: c.category, n: c.peers, raw: c.raw_median === null ? null : r4(c.raw_median), m: r4(c.multiple) })),
  peers: book.peers.map((p) => ({ n: p.name, s: p.symbol, c: p.category, t: p.tvl_usd, m: p.mcap_usd })),
  set_aside: universe.setAside.map((x) => ({ n: x.name, c: x.category, t: x.tvl_usd, r: x.reason })),
  rows: universe.ranked.map((s, i) => ({
    r: i + 1,
    id: s.p.slug,
    n: s.p.name,
    c: s.p.category ?? 'Uncategorised',
    ch: s.p.chains,
    t: s.p.tvl_usd,
    g: s.p.change_7d,
    age: s.age,
    li: s.p.listed_at,
    w: s.watch ? 1 : 0,
    pl: s.parent_linked ? 1 : 0,
    f: [s.factors.multiple, s.factors.momentum, s.factors.durability, s.factors.staleness, s.factors.breadth, s.factors.parent_link].map(r4),
    v: s.implied,
    lo: s.low,
    hi: s.high,
    a: s.airdrop_per_10k,
    pb: playbookOf(s.p.category),
    fc: farmChain(s.p.chains),
    sz: suggestedSize(s.p.tvl_usd),
    st: plans[i]!.map((x) => [x.phase[0], x.text, x.cost, x.time]),
  })),
};
writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify(data)};\n`);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.') || !statSync(join(from, name)).isFile()) continue;
    copyFileSync(join(from, name), join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 && !process.argv.includes('--no-dossier')) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} images; the gate wants 3 (board, detail, filtered)\n`);
  process.exit(1);
}
if (shots.length >= 3) {
  // Written last: the scorer rebuilds the dossier from this directory and compares the bytes.
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
}
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${rows.length} ranked (${snapshot.watchlist.length} watchlist), ` +
    `${book.peers.length} traded peers, ${universe.setAside.length} set aside; top ${rows[0]!.name} at $${rows[0]!.implied_value_usd}\n`,
);
