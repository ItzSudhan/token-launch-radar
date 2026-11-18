// Token Radar · entrypoint.
// Reads the sealed DefiLlama snapshot, asks the model for the board, refuses to write a board the gate
// would reject, then writes board.json, the page's data.js, the dashboard and screenshots, and the dossier.
//
// The model lives in dashboard/1-model.js, the very file the page loads: main.ts and the page run the same
// code on the same bytes, and the page's checkBoard() proves it row by row.
//
//   node main.ts [--input <dir or snapshot.json>] [--output <dir>] [--no-dossier]
//   (MAKEFUN_OUTPUT_DIR stands in for --output; the defaults are /input and /output)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const model = createRequire(import.meta.url)('./dashboard/1-model.js');

type Snapshot = { as_of: string; source: string; floor_usd: number; watchlist: string[]; protocols: Array<{ slug: string }> };

/** One board.json row. Key order is the file's column order. */
type Row = {
  rank: number; slug: string; name: string;
  implied_value_usd: number; implied_low_usd: number; implied_high_usd: number;
  tier: string; sector: string; verdict: string; net_usd: number;
  farm_steps: string[];
};

// ---- 1. where to read and write
function option(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function locations() {
  const given = option('--input') ?? '/input';
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
function toRow(r: any): Row {
  return {
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    implied_value_usd: r.value,                 // what a launch would be worth with the record as it stands
    implied_low_usd: Math.round(r.low),         // the range holds half the blind-priced tokens like it
    implied_high_usd: Math.round(r.high),
    tier: r.tier,
    sector: r.sector,
    verdict: r.plan.verdict,
    net_usd: Math.round(r.plan.net * 100) / 100,
    farm_steps: model.stepStrings(r.plan),
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
  if (shots.length >= 3) {
    // last, because the scorer rebuilds the dossier from this folder and compares bytes
    const dossier = buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
    fs.writeFileSync(path.join(out, 'dossier.json'), dossier);
  }
  return shots;
}

// ---- 5. say what was written
function report(snap: Snapshot, radar: any, rows: Row[]): string {
  const { tests, ranges } = radar, full = tests.ladder[3];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const count = (v: string) => rows.filter((r) => r.verdict === v).length;
  return [
    `token radar: ${snap.protocols.length} protocols, ${rows.length} ranked (${snap.watchlist.length} watchlist), ${radar.comps.length} comparables, ${radar.aside.length} set aside; top ${rows[0]!.name} at $${rows[0]!.implied_value_usd}`,
    `ledger: ${radar.ledger.map((g: [string, number]) => `${g[1]} ${g[0].toLowerCase()}`).join(' + ')}`,
    `value miss, held out: x${full.miss.toFixed(2)} each-left-out (${pct(full.within3)} within 3x), x${full.split.miss.toFixed(2)} older-to-newer (${tests.older} -> ${tests.newer})`,
    `range (half of blind misses) holds: ${ranges.each}/${ranges.n} each-left-out, ${ranges.split}/${ranges.newer} older-to-newer`,
    `on $1,000: ${count('FARM')} FARM, ${count('THIN')} THIN, ${count('SKIP')} SKIP`,
  ].join('\n') + '\n';
}

function fail(code: number, why: string): never {
  process.stderr.write(`token radar: ${why}\n`);
  process.exit(code);
}

// ---- run
const where = locations();
const snap = readSnapshot(where.snapshot);
const radar = model.buildRadar(snap);
const rows: Row[] = radar.rows.map(toRow);
const problems = gateProblems(snap, rows);
if (problems.length) fail(1, `the board would fail the gate: ${problems.slice(0, 3).join('; ')}`);
writeAll(where.output, snap, rows, where.dossier);
process.stdout.write(report(snap, radar, rows));
