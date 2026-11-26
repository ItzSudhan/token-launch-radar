// Token Radar · main.ts
// snapshot in -> the model prices it -> the plans cost it -> the gate's own rules are checked -> files out.
//
// Two of the page's own files do the work: dashboard/1-model.js (values) and dashboard/3-plans.js (farm plans).
// The page loads the same two on the same bytes, and its checkBoard() compares every row with board.json.
//
//   node main.ts [--input <dir or snapshot.json>] [--output <dir>] [--no-dossier]
//   MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for the flags; the defaults are /input and /output

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const load = createRequire(import.meta.url);
load('./dashboard/1-model.js');                 // puts Radar on globalThis, as it does in the page: launchValue, valueLadder
load('./dashboard/2-odds.js');                  // adds oddsModel (launchOdds, oddsLadder) and bootstrapSE
load('./dashboard/3-plans.js');                 // adds farmPlan, addPlans and stepStrings
const model = (globalThis as any).Radar;

type Snapshot = { as_of: string; source: string; floor_usd: number; watchlist: string[]; protocols: Array<{ slug: string }> };

/** One board.json row; the keys stand in the file in this order. */
type Row = {
  rank: number; slug: string; name: string;
  implied_value_usd: number; implied_low_usd: number; implied_high_usd: number;
  launch_value_usd: number; launch_odds: number;
  tier: string; sector: string; kinship: string;
  verdict: string; ticket_usd: number; net_usd: number; hours: number;
  farm_steps: string[];
};

// ---- 1. where to read and write
function option(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function locations() {
  const given = option('--input') ?? process.env.MAKEFUN_INPUT_DIR ?? '/input';
  return {
    snapshot: given.endsWith('.json') ? given : path.join(given, 'snapshot.json'),
    output: option('--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output',
    dossier: !process.argv.includes('--no-dossier'),
  };
}

// ---- 2. read and price
function readSnapshot(file: string): Snapshot {
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  const shaped = typeof s.as_of === 'string' && Array.isArray(s.protocols) && Array.isArray(s.watchlist);
  if (!shaped) fail(2, `${file} is not a snapshot: it needs as_of, protocols and watchlist`);
  return s;
}
/** The board's row, read off the model's: implied = launch value × launch odds, in whole dollars; the range is the
 *  25th to 75th percentile of the blind misses. */
function toRow(r: any): Row {
  const { plan } = r;
  const cents = (x: number) => Math.round(x * 100) / 100;
  return {
    rank: r.rank, slug: r.slug, name: r.name,
    implied_value_usd: r.value, implied_low_usd: Math.round(r.low), implied_high_usd: Math.round(r.high),
    launch_value_usd: Math.round(r.launch), launch_odds: Math.round(r.chance * 1e4) / 1e4,
    tier: r.tier, sector: r.sector, kinship: r.kin,
    verdict: plan.verdict, ticket_usd: plan.capital, net_usd: cents(plan.net), hours: cents(plan.minutes / 60),
    farm_steps: model.stepStrings(plan),
  };
}

// ---- 3. the gate's rules, applied before anything is written: a board it would refuse is a bug here
function gateProblems(snap: Snapshot, rows: Row[]): string[] {
  const problems: string[] = [];
  const known = new Set(snap.protocols.map((p) => p.slug));
  const slugs = new Set(rows.map((r) => r.slug));
  if (rows.length < 100 || rows.length > 4000) problems.push(`${rows.length} rows; the gate takes 100 to 4,000`);
  if (slugs.size !== rows.length) problems.push('a slug is on the board twice');
  const uncovered = snap.watchlist.filter((w) => !slugs.has(w));
  if (uncovered.length) problems.push(`watchlist not covered: ${uncovered.slice(0, 5).join(', ')}`);
  rows.forEach((r, i) => {
    const where = `${r.slug} (place ${i + 1})`;
    if (!known.has(r.slug)) problems.push(`${where}: not a snapshot protocol`);
    if (r.rank !== i + 1) problems.push(`${where}: rank ${r.rank}`);
    const v = r.implied_value_usd;
    if (!Number.isSafeInteger(v) || v < 1 || v > 1e14) problems.push(`${where}: implied value ${v}`);
    if (i > 0 && v > rows[i - 1]!.implied_value_usd) problems.push(`${where}: value rises down the board`);
    const n = r.farm_steps.length;
    if (n < 3 || n > 12) problems.push(`${where}: ${n} farm steps`);
    for (const step of r.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) problems.push(`${where}: a ${len}-character farm step`);
    }
  });
  if (rows.length > 1 && new Set(rows.map((r) => r.implied_value_usd)).size === 1) problems.push('every implied value is the same');
  return problems;
}

// ---- 4. write
/** Copies the plain, visible files of one folder, in name order; returns their names. */
function mirror(from: string, to: string): string[] {
  if (!fs.existsSync(from)) return [];
  fs.mkdirSync(to, { recursive: true });
  const names = fs.readdirSync(from).sort().filter((n) => !n.startsWith('.') && fs.statSync(path.join(from, n)).isFile());
  for (const n of names) fs.copyFileSync(path.join(from, n), path.join(to, n));
  return names;
}
function writeAll(out: string, snap: Snapshot, rows: Row[], withDossier: boolean): string[] {
  fs.mkdirSync(out, { recursive: true });
  const board = { as_of: snap.as_of, source: snap.source, model: model.CONFIG.version, rows };
  fs.writeFileSync(path.join(out, 'board.json'), JSON.stringify(board) + '\n');
  // the page gets the snapshot's own fields verbatim, plus board.json's [slug, rank, value, plan digest] to
  // check itself against; nothing in it is precomputed for display
  const pageData = {
    snapshot: { as_of: snap.as_of, source: snap.source, floor_usd: snap.floor_usd, watchlist: snap.watchlist, protocols: snap.protocols },
    board: rows.map((r) => [r.slug, r.rank, r.implied_value_usd, model.digest(r.farm_steps)]),
  };
  fs.writeFileSync(path.join(out, 'data.js'), `window.RADAR_INPUT=${JSON.stringify(pageData)};\n`);
  mirror(path.join(ROOT, 'dashboard'), path.join(out, 'dashboard'));
  const shots = mirror(path.join(ROOT, 'screenshots'), path.join(out, 'screenshots'));
  if (withDossier && shots.length < 3) fail(1, `screenshots/ holds ${shots.length} images; the gate wants 3 (board, detail, filtered)`);
  if (withDossier) {
    // last, because the scorer rebuilds the dossier from this folder and compares bytes
    const dossier = buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
    fs.writeFileSync(path.join(out, 'dossier.json'), dossier);
  }
  return shots;
}

// ---- 5. say what was written
function report(snap: Snapshot, radar: any, rows: Row[]): string {
  const { tests, ranges, odds, se } = radar;
  const count = (v: string) => rows.filter((r) => r.verdict === v).length;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const lines = [
    `token radar: ${snap.protocols.length} protocols, ${rows.length} ranked (${snap.watchlist.length} watchlist), ${radar.comps.length} comps, ${radar.aside.length} set aside`,
    `ledger: ${radar.ledger.map((g: [string, number]) => `${g[1]} ${g[0].toLowerCase()}`).join(' + ')}`,
    `valueLadder (median miss, each left out | older ${tests.older} -> newer ${tests.newer}):`,
    ...tests.ladder.map((t: any) => `  ${t.name.padEnd(28)} x${t.each.miss.toFixed(2)} | x${t.later.miss.toFixed(2)}  ${t.base ? 'base' : t.kept ? 'kept' : 'not kept'}`),
    `oddsLadder (Brier, ten-fold | older ${odds.older} -> newer ${odds.newer}), ${odds.tokens} of ${odds.n} peers carry a token:`,
    ...odds.ladder.map((t: any) => `  ${t.name.padEnd(28)} ${t.ten.toFixed(4)} | ${t.walk.toFixed(4)}  ${t.base ? 'base' : t.kept ? 'kept' : 'not kept'}`),
    `rangeHonesty: 50% range holds ${pct(ranges.each50)} left out, ${pct(ranges.later50)} newer; 80% range ${pct(ranges.each80)} and ${pct(ranges.later80)}`,
    `bootstrapSE (${se.boots} refits, seed ${se.seed}): b ${radar.fit.b.toFixed(3)} ± ${se.value.b.toFixed(3)}; odds ${odds.names.map((n: string, i: number) => `${n} ${odds.w[i].toFixed(2)} ± ${se.odds[i].toFixed(2)}`).join('; ')}`,
    `at the suggested tickets: ${count('FARM')} FARM, ${count('THIN')} THIN, ${count('SKIP')} SKIP`,
    ...rows.slice(0, 15).map((r) => `${String(r.rank).padStart(3)}  ${r.name}  $${r.launch_value_usd} x ${r.launch_odds} = $${r.implied_value_usd}  ${r.kinship}  ${r.verdict}`),
  ];
  return lines.join('\n') + '\n';
}

function fail(code: number, why: string): never {
  process.stderr.write(`token radar: ${why}\n`);
  process.exit(code);
}

// ---- run
const where = locations();
const snap = readSnapshot(where.snapshot);
const radar = model.buildRadar(snap);
model.addPlans(radar.rows);                     // each at its suggested ticket, as the page shows it by default
const rows: Row[] = radar.rows.map(toRow);
const problems = gateProblems(snap, rows);
if (problems.length) fail(1, `the board would fail the gate: ${problems.slice(0, 3).join('; ')}`);
writeAll(where.output, snap, rows, where.dossier);
process.stdout.write(report(snap, radar, rows));
