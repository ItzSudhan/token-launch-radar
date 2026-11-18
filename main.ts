// Token Radar: reads the sealed DefiLlama snapshot, ranks every protocol that records no token by the
// implied value of a launch, and writes the board, the page's data, a text brief and the dossier.
//
// The model is not in this file. It is dashboard/1-model.js, the same file the page loads, so board.json
// and the dashboard cannot disagree: this program runs it once and writes down what it said.
//
//   node main.ts [--input /input/snapshot.json] [--output /output]   (MAKEFUN_OUTPUT_DIR stands in for /output)

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const Radar = createRequire(import.meta.url)('./dashboard/1-model.js');

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1]! : fallback;
}
const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = JSON.parse(readFileSync(inputFile, 'utf8'));
if (!Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist) || typeof snapshot.as_of !== 'string') {
  process.stderr.write(`token radar: ${inputFile} is not a snapshot: it needs as_of, protocols and watchlist\n`);
  process.exit(2);
}
const radar = Radar.buildRadar(snapshot);

// implied_value_usd is what a launch would be worth with the record as it stands; the range beside it holds half
// of the blind-priced tokens like it.
interface BoardRow {
  rank: number; slug: string; name: string; implied_value_usd: number; implied_low_usd: number; implied_high_usd: number;
  tier: string; sector: string; verdict: string; net_usd: number; farm_steps: string[];
}
const rows: BoardRow[] = radar.rows.map((r: any) => ({
  rank: r.rank, slug: r.slug, name: r.name, implied_value_usd: r.value,
  implied_low_usd: Math.round(r.low), implied_high_usd: Math.round(r.high),
  tier: r.tier, sector: r.sector, verdict: r.plan.verdict, net_usd: Math.round(r.plan.net * 100) / 100,
  farm_steps: Radar.stepStrings(r.plan),
}));

/** The gate's shape, checked before anything is written: a board the scorer would refuse is a bug here. */
function boardIssue(): string | null {
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows, the gate takes 100 to 4,000`;
  const known = new Set(snapshot.protocols.map((p: any) => p.slug)), onBoard = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((w: string) => !onBoard.has(w));
  if (missing.length) return `watchlist not covered: ${missing.slice(0, 5).join(', ')}`;
  if (onBoard.size !== rows.length) return 'a slug appears twice';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (!known.has(r.slug)) return `${r.slug}: not one of the snapshot's protocols`;
    if (r.rank !== i + 1) return `${r.slug}: rank ${r.rank} at place ${i + 1}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) return `${r.slug}: implied value ${r.implied_value_usd}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `${r.slug}: value rises with rank`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug}: ${r.farm_steps.length} farm steps`;
    const bad = r.farm_steps.find((t) => t.trim().length < 20 || t.trim().length > 600);
    if (bad !== undefined) return `${r.slug}: a farm step of ${bad.trim().length} characters`;
  }
  return new Set(rows.map((r) => r.implied_value_usd)).size < 2 ? 'every implied value is the same' : null;
}
const issue = boardIssue();
if (issue !== null) {
  process.stderr.write(`token radar: the board would fail the gate: ${issue}\n`);
  process.exit(1);
}

/** The held-out figures in one block for the run log (the page shows the same ones in its KPI strip). */
function summary(): string {
  const { tests, ranges } = radar, v = tests.ladder[3];
  const pct = (x: number) => `${Math.round(x * 100)}%`, verdicts = (t: string) => rows.filter((r) => r.verdict === t).length;
  return [
    `ledger: ${radar.ledger.map((g: [string, number]) => `${g[1]} ${g[0].toLowerCase()}`).join(' + ')}`,
    `value miss, held out: x${v.miss.toFixed(2)} each-left-out (${pct(v.within3)} within 3x), x${v.split.miss.toFixed(2)} older-to-newer (${tests.older} -> ${tests.newer})`,
    `range (half of blind misses) holds: ${ranges.each}/${ranges.n} each-left-out, ${ranges.split}/${ranges.newer} older-to-newer`,
    `on $1,000: ${verdicts('FARM')} FARM, ${verdicts('THIN')} THIN, ${verdicts('SKIP')} SKIP`,
  ].join('\n');
}

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

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ as_of: snapshot.as_of, source: snapshot.source, model: Radar.CONFIG.version, rows })}\n`);
// The page's data: the snapshot's own fields, verbatim, and board.json's ranks, values and plan digests to
// check itself against. Nothing in it is precomputed for display.
const data = {
  snapshot: { as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, watchlist: snapshot.watchlist, protocols: snapshot.protocols },
  board: rows.map((r) => [r.slug, r.rank, r.implied_value_usd, Radar.digest(r.farm_steps)]),
};
writeFileSync(join(out, 'data.js'), `window.RADAR_INPUT=${JSON.stringify(data)};\n`);
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
    `${radar.comps.length} comparables, ${radar.aside.length} set aside; top ${rows[0]!.name} at $${rows[0]!.implied_value_usd}\n${summary()}\n`,
);
