/** Turns the filmed run's own artifacts into builds/ep11-inbox-agent/gate-audit.txt —
 *  the label-whitespace-integer file that pipeline/build-data-ep11.mjs parses, that
 *  viewer.html puts on screen at 4:38, and that the hook, the titles and the thumbnail
 *  are ultimately filled from.
 *
 *    node scripts/ep11-audit.mjs --since 2026-08-18T09:12:44.918Z
 *    node scripts/ep11-audit.mjs --since <iso> --db <path-to-n8n-database.sqlite>
 *
 *  --since is the ISO that scripts/ep11-rotate.mjs prints when it clears the rehearsal
 *  artifacts out of the build dir. IT IS REQUIRED AND IT IS ENFORCED: any decision,
 *  receipt or seed phase stamped before it exits non-zero and writes nothing. That is
 *  blocking item B6. Rehearsal lines reaching this file is how five separate on-air
 *  figures would have been inflated, and a timestamp check is the only version of that
 *  guard that survives a late night.
 *
 *  EVERY NUMBER IS READ OFF A FILE. Nothing here is typed, defaulted or estimated:
 *    seed-manifest.json          seeded counts, per phase
 *    the n8n execution log       what the IMAP trigger actually emitted, per listen
 *    decisions.jsonl             every verdict, with the rule that named it
 *    escalations.jsonl           the hand adjudication
 *    receipts.jsonl              one line per any-llm call
 *    workflow.json               the gate's line count, its rule names, its categories
 *    sent/*.txt                  the byte-diffs
 *  If a number cannot be derived it is reported as a problem and NO FILE IS WRITTEN.
 *  A partial gate-audit.txt is worse than none: build-data-ep11.mjs would parse the
 *  labels it found and quietly carry zeros for the rest.
 *
 *  IT NEVER READS data/fal-spend.jsonl (B7). That file is a QUOTE log — every row in
 *  it is `seconds × 0.21` straight out of quote() — so it cannot answer a cost
 *  question. Fal cost in this episode comes from receipts.jsonl and the
 *  x-fal-billable-units headers captured beside each call.
 *
 *  THE TWO PLACES THIS SCRIPT COMMITS TO A DEFINITION, both from the package:
 *   - A DRAFT is an item that reached node 5's model call: not stopped by the
 *     prefilter, and carrying one of the gate's sendable categories. `Drafts
 *     attempted / cleared / blocked` are all counted inside that population, so the
 *     three add up on screen. Everything the prefilter stopped is `Notices
 *     prefiltered`; everything the gate refused is in the per-rule table.
 *   - An ESCALATION is a blocked draft — the adjudication worksheet's population
 *     ("every blocked draft, all rules, read by hand"), which is why
 *     `Escalations post strip` and `Drafts blocked` describe the same run and agree.
 *
 *  Fork of scripts/ep10-verify-gate-fix.mjs, which wrote EP10's gate-audit.txt in the
 *  same shape and for the same reason: the claim is inspectable rather than narrated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Pinned, like every other EP11 script, and refused rather than followed when the
// shell disagrees — ep11-rotate.mjs:122's reason applies here twice over. The Code
// nodes write wherever `$env.EP11_DIR` points, and ep11-dryrun.mjs points it at a
// throwaway sandbox for its fixture run; auditing that directory would measure the
// fixture, and pipeline/build-data-ep11.mjs reads `builds/ep11-inbox-agent/
// gate-audit.txt` by name, so a file written anywhere else is a file nothing reads.
const BASE = process.env.EP11_BASE ?? process.cwd();
if (process.env.EP11_DIR && path.resolve(process.env.EP11_DIR) !== BASE) {
  console.error('✗ REFUSING TO RUN — EP11_DIR disagrees with this script.');
  console.error(`  EP11_DIR: ${path.resolve(process.env.EP11_DIR)}`);
  console.error(`  auditing: ${BASE}`);
  console.error('  Auditing a directory the filmed run did not write measures the wrong numbers,');
  console.error('  and writes gate-audit.txt where build-data-ep11.mjs never looks.');
  process.exit(1);
}

// n8n appends `.n8n` to N8N_USER_FOLDER itself, so the doubled segment at the join
// below is the live store and not a typo: the process is started with
// N8N_USER_FOLDER=…/ep01-crm-sync/.n8n and keeps database.sqlite one level inside it.
const N8N_FOLDER = process.env.N8N_USER_FOLDER || `${process.env.HOME}/.n8n`;

const IMAP_TYPE = 'n8n-nodes-base.emailReadImap';
const GATE_NODE = 'send-gate';
const PREFILTER_NODE = 'prefilter';
const LABEL_COL = 31;

/** Measured number 9: the near-miss rules. Drafts stopped ONLY by one of these —
 *  an otherwise shippable reply killed for saying something the source does not
 *  support. NO_FACTS_CITED is deliberately NOT here (B5): a reply that cited nothing
 *  is usually a response that did not parse, and a fabrication claim resting on a
 *  parse failure is exactly the number this channel exists to not ship. */
const NEAR_MISS_RULES = ['FACT_NOT_IN_KB', 'FACT_NOT_QUOTABLE', 'UNSUPPORTED_TOKEN'];

/** Expected to read zero, permanently, and said out loud on camera before anyone has
 *  to ask: node 5 assigns the recipient in code, and node 3 reads the same ledger
 *  first. They stay because their silent disappearance is the failure they guard. */
const DEFENCE_IN_DEPTH = ['RECIPIENT_MISMATCH', 'ALREADY_REPLIED'];

/** The one prefilter stop that is not a notice. It is counted inside `Notices
 *  prefiltered` because it cost no model call either, and the artifact then says so
 *  in a line of its own rather than letting the label quietly lie. Checked against
 *  the prefilter below for the same reason the two lists above are checked against
 *  the gate: a renamed stop must break this file, not silently empty a sentence. */
const REPLIED_STOP = 'DONE_ALREADY_REPLIED';

// ---- arguments -----------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] ?? null; };

const sinceArg = flag('--since');
if (!sinceArg) {
  console.error('✗ --since <iso> is required.');
  console.error('  It is the timestamp scripts/ep11-rotate.mjs printed when it cleared the');
  console.error('  rehearsal artifacts. Without it this audit cannot tell a filmed decision');
  console.error('  from a rehearsal one, and that is the whole point of it. (B6)');
  process.exit(1);
}
const SINCE = new Date(sinceArg);
if (Number.isNaN(SINCE.getTime())) {
  console.error(`✗ --since ${sinceArg} is not a date this script can parse.`);
  process.exit(1);
}
const DB = flag('--db') || path.join(N8N_FOLDER, '.n8n', 'database.sqlite');

console.log(`build dir : ${BASE}`);
console.log(`n8n db    : ${DB}`);
console.log(`since     : ${SINCE.toISOString()}\n`);

// ---- reading ------------------------------------------------------------
const problems = [];
// Deduped: `Diff bytes` and `Diff bytes ep10` fail for the same reason off the same
// empty directory, and one sentence printed twice reads as two separate faults.
const problem = (msg) => { if (!problems.includes(msg)) problems.push(msg); return null; };

const readText = (rel) => {
  const f = path.join(BASE, rel);
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, 'utf8');
};

/** JSONL with the line number kept, so a bad line names itself. */
function readJsonl(rel) {
  const raw = readText(rel);
  if (raw === null) return null;
  const out = [];
  raw.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try { out.push({ n: i + 1, ...JSON.parse(line) }); }
    catch { throw new Error(`${rel}:${i + 1} is not JSON — refusing to count a file I cannot read`); }
  });
  return out;
}

// ---- THE B6 GUARD --------------------------------------------------------
// Applied to everything ep11-rotate.mjs clears, plus the seed manifest, which it
// does NOT clear — so the rehearsal manifest survives in place until the filmed
// phase A overwrites it, and its counts would otherwise walk straight into
// `Seeded count` unchallenged.
const decisions = readJsonl('decisions.jsonl');
const receipts = readJsonl('receipts.jsonl');
const escalations = readJsonl('escalations.jsonl');

if (decisions === null) { console.error('✗ decisions.jsonl does not exist. Nothing to audit.'); process.exit(1); }
if (receipts === null) { console.error('✗ receipts.jsonl does not exist. Nothing to audit.'); process.exit(1); }
if (escalations === null) { console.error('✗ escalations.jsonl does not exist — pre-flight 7 creates it empty.'); process.exit(1); }

const stale = [];
for (const [file, rows] of [['decisions.jsonl', decisions], ['receipts.jsonl', receipts]]) {
  for (const r of rows) {
    if (!r.at) { stale.push(`${file}:${r.n} carries no timestamp`); continue; }
    if (new Date(r.at) < SINCE) stale.push(`${file}:${r.n} stamped ${r.at}`);
  }
}

const manifestRaw = readText('seed-manifest.json');
if (!manifestRaw) { console.error('✗ seed-manifest.json does not exist — ep11-seed.py writes it.'); process.exit(1); }
const manifest = JSON.parse(manifestRaw);
for (const [name, ph] of Object.entries(manifest.phases ?? {})) {
  if (ph.dry) stale.push(`seed-manifest.json phase ${name} is a --dry run: it appended nothing`);
  else if (!ph.appended_at) stale.push(`seed-manifest.json phase ${name} carries no appended_at`);
  else if (new Date(ph.appended_at) < SINCE) stale.push(`seed-manifest.json phase ${name} appended ${ph.appended_at}`);
}

if (stale.length) {
  console.error(`✗ ${stale.length} artifact(s) predate --since ${SINCE.toISOString()} — REFUSING TO AUDIT. (B6)\n`);
  for (const s of stale.slice(0, 12)) console.error(`   ${s}`);
  if (stale.length > 12) console.error(`   … and ${stale.length - 12} more`);
  console.error('\n  This is rehearsal data leaking into the filmed audit. Run');
  console.error('  scripts/ep11-rotate.mjs, re-seed and re-run the take — or pass the --since');
  console.error('  the rotation actually printed. Five on-air figures depend on this file');
  console.error('  containing one run and only one run.');
  process.exit(1);
}

// ---- the shipped gate, read out of the workflow --------------------------
// The rule names, the sendable categories and the line count all come out of the
// same file the recorder types from. Nothing about the gate is restated here.
const wf = JSON.parse(fs.readFileSync(path.join(BASE, 'workflow.json'), 'utf8'));
const nodeSrc = (name) => {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n?.parameters?.jsCode) throw new Error(`workflow.json has no Code node named "${name}"`);
  return n.parameters.jsCode;
};

const gateSrc = nodeSrc(GATE_NODE);
const GATE_LINES = gateSrc.split('\n').length;

const RULE_NAMES = [...gateSrc.matchAll(/^\s*\['([A-Z_]+)'/gm)].map((m) => m[1]);
if (!RULE_NAMES.length) throw new Error('could not read the rule names out of the send-gate node');
for (const r of [...NEAR_MISS_RULES, ...DEFENCE_IN_DEPTH]) {
  if (!RULE_NAMES.includes(r)) throw new Error(`the gate no longer has a rule called ${r} — this audit is out of date with the workflow`);
}

const catMatch = gateSrc.match(/\[((?:'[A-Z_]+',?\s*)+)\]\.includes\(d\.category\)/);
if (!catMatch) throw new Error('could not read the sendable categories out of the send-gate node');
const SENDABLE = catMatch[1].match(/[A-Z_]+/g);

const STOPS = [...nodeSrc(PREFILTER_NODE).matchAll(/stop\s*=\s*'([A-Z_]+)'/g)].map((m) => m[1]);
if (!STOPS.length) throw new Error('could not read the prefilter stop values out of the prefilter node');
if (!STOPS.includes(REPLIED_STOP)) throw new Error(`the prefilter no longer sets ${REPLIED_STOP} — this audit is out of date with the workflow`);

console.log(`gate      : ${GATE_LINES} lines, ${RULE_NAMES.length} rules, sendable ${SENDABLE.join('/')}`);
console.log(`prefilter : stops ${STOPS.join(', ')}\n`);

// ---- the n8n execution log ----------------------------------------------
// n8n's own record of what it ran, read out of its sqlite store rather than its
// UI: the trigger's item count per listen (measured numbers 2 and 3) and the run
// boundaries that separate one pass over the corpus from the next.
const sql = (q) => JSON.parse(execFileSync('sqlite3', ['-readonly', '-json', DB, q], { maxBuffer: 1 << 28 }).toString().trim() || '[]');

/** n8n stores run data in flatted form: an array where every string is an index
 *  into that same array. Twelve lines of revival beats depending on another
 *  episode's node_modules. */
function unflatten(text) {
  const a = JSON.parse(text);
  const seen = new Map();
  const at = (i) => {
    if (seen.has(i)) return seen.get(i);
    const v = a[i];
    if (Array.isArray(v)) {
      const out = []; seen.set(i, out);
      for (const x of v) out.push(typeof x === 'string' ? at(Number(x)) : x);
      return out;
    }
    if (v && typeof v === 'object') {
      const out = {}; seen.set(i, out);
      for (const k of Object.keys(v)) out[k] = typeof v[k] === 'string' ? at(Number(v[k])) : v[k];
      return out;
    }
    seen.set(i, v); return v;
  };
  return at(0);
}

// sqlite keeps these as naive UTC strings; parsing them as local time would move
// every run boundary by the timezone offset and silently reshuffle the passes.
const utc = (s) => new Date(String(s).replace(' ', 'T') + 'Z');

if (!fs.existsSync(DB)) throw new Error(`no n8n database at ${DB} — pass --db <path>`);
const execRows = sql(
  'select e.id as id, e.startedAt as startedAt, e.stoppedAt as stoppedAt, e.status as status, ' +
  'd.workflowData as wfData, d.data as data from execution_entity e ' +
  'join execution_data d on d.executionId = e.id order by e.startedAt asc'
);

const runs = [];
for (const row of execRows) {
  if (!row.startedAt || utc(row.startedAt) < SINCE) continue;
  let nodes = [];
  try { nodes = JSON.parse(row.wfData).nodes ?? []; } catch { continue; }
  const trigger = nodes.find((n) => n.type === IMAP_TYPE)?.name ?? null;
  // An execution belongs to this episode if it carries our IMAP head or our gate.
  // That catches workflow.json and workflow-batch.json under whatever name the
  // canvas gave them, and nothing else running in the same n8n.
  if (!trigger && !nodes.some((n) => n.name === GATE_NODE)) continue;
  let items = null;
  try {
    const runData = unflatten(row.data)?.resultData?.runData ?? {};
    items = trigger && runData[trigger]
      ? runData[trigger].reduce((n, r) => n + (r?.data?.main?.[0]?.length ?? 0), 0)
      : null;
  } catch { items = null; }
  runs.push({
    id: row.id,
    from: utc(row.startedAt),
    to: row.stoppedAt ? utc(row.stoppedAt) : null,
    status: row.status,
    trigger,
    items,
  });
}

const fetches = runs.filter((r) => r.items !== null);
console.log(`n8n executions since --since: ${runs.length} (${fetches.length} with an IMAP head)`);
for (const r of runs) {
  console.log(`  #${String(r.id).padStart(4)}  ${r.from.toISOString()}  ${String(r.status).padEnd(8)}` +
    `  ${r.items === null ? 'replay head' : `${r.items} item(s) from ${r.trigger}`}`);
}

let fetchedFirst = null, fetched = null;
if (fetches.length < 2) {
  problem(`only ${fetches.length} IMAP-headed execution(s) since --since. ` +
    '`Messages fetched first` is the SINCE beat and `Messages fetched` is the listen after ' +
    'the toggle: both are measurements off the trigger, and one execution cannot produce two.');
} else {
  fetchedFirst = fetches[0].items;
  // The second listen is the one that returns the whole box. Take the largest fetch
  // rather than assume which execution it was — a retake adds executions, and the
  // number on camera is the badge on the biggest one.
  fetched = Math.max(...fetches.map((f) => f.items));
}

// ---- passes over the corpus ---------------------------------------------
// One pass = one run of the chain over the corpus. The gate is typed WITHOUT
// strip() first, the batch runs, that number is the before; strip() goes in during
// the take, the batch reruns, that number is the after (B9). Both land in the same
// decisions.jsonl, so the audit has to be able to tell them apart.
//
// An n8n execution's [startedAt, stoppedAt] window is the first-party record of
// where one pass ends. Decisions written outside every window came from a CLI
// replay instead (ep11-dryrun.mjs --batch), and those are split where a uid
// repeats — a second verdict for the same message is by definition a second pass.
const inRun = (d) => runs.find((r) => r.to && new Date(d.at) >= r.from && new Date(d.at) <= r.to);

const byRun = new Map();
const loose = [];
for (const d of decisions) {
  const r = inRun(d);
  if (r) { if (!byRun.has(r.id)) byRun.set(r.id, []); byRun.get(r.id).push(d); }
  else loose.push(d);
}
const passes = [...byRun.entries()].map(([id, rows]) => ({ source: `execution #${id}`, rows }));
let group = null, seen = new Set();
for (const d of loose) {
  if (!group || seen.has(d.uid)) { group = { source: 'cli replay', rows: [] }; passes.push(group); seen = new Set(); }
  group.rows.push(d);
  seen.add(d.uid);
}
passes.sort((a, b) => new Date(a.rows[0].at) - new Date(b.rows[0].at));

console.log(`\ndecisions: ${decisions.length} line(s) in ${passes.length} pass(es)`);
for (const p of passes) {
  console.log(`  ${p.source.padEnd(14)} ${p.rows[0].at}  ${String(p.rows.length).padStart(3)} decision(s)`);
}

if (!passes.length) {
  console.error('\n✗ decisions.jsonl is empty. The send-gate appends one line per verdict, so an');
  console.error('  empty file means no pass over the corpus has run since --since. Straight after');
  console.error('  ep11-rotate.mjs that is the expected state and not a fault: the take has not');
  console.error('  happened yet (pre-flight 18). Nothing can be measured, so nothing is written.');
  process.exit(1);
}

const widest = Math.max(...passes.map((p) => p.rows.length));
const full = passes.filter((p) => p.rows.length === widest);
const corpusPass = full[full.length - 1];
const preStripPass = full[0];

if (full.length < 2) {
  problem('only one full pass over the corpus is in decisions.jsonl. `Escalations pre strip` ' +
    'and `Escalations post strip` are two filmed runs of the same corpus — the un-stripped gate ' +
    'and then the stripped one (B9) — and a single pass cannot produce both. If you rotated ' +
    'between the two batches, the before run is in runs/<iso>/ and this audit only ever counts ' +
    'the live files.');
}

// ---- the verdicts -------------------------------------------------------
const drafted = (d) => !STOPS.includes(d.rule) && SENDABLE.includes(d.category);
const escalated = (d) => drafted(d) && d.verdict === 'BLOCKED';

const count = (rows, fn) => rows.filter(fn).length;

const corpus = corpusPass.rows;
const notices = count(corpus, (d) => STOPS.includes(d.rule));
const draftsAttempted = count(corpus, drafted);
const draftsCleared = count(corpus, (d) => d.verdict === 'SEND');
const draftsBlocked = count(corpus, escalated);
const nearMisses = corpus.filter((d) => drafted(d) && NEAR_MISS_RULES.includes(d.rule));

const ruleCounts = Object.fromEntries(RULE_NAMES.map((r) => [r, count(corpus, (d) => d.rule === r)]));

// Every decision has to be accounted for by exactly one row on screen, or a number
// has gone missing between the run and the file.
const unknown = [...new Set(corpus.filter((d) => d.rule && !STOPS.includes(d.rule) && !RULE_NAMES.includes(d.rule)).map((d) => d.rule))];
if (unknown.length) problem(`decisions carry rule(s) the shipped gate does not define: ${unknown.join(', ')}`);
const accounted = draftsCleared + notices + RULE_NAMES.reduce((n, r) => n + ruleCounts[r], 0);
if (accounted !== corpus.length) {
  problem(`the audited pass has ${corpus.length} decisions but the table accounts for ${accounted}. ` +
    'Cleared + prefiltered + the per-rule rows must equal the corpus exactly.');
}
if (draftsAttempted !== draftsCleared + draftsBlocked) {
  problem(`drafts attempted (${draftsAttempted}) is not cleared (${draftsCleared}) plus blocked (${draftsBlocked}).`);
}
if (fetched !== null && fetched !== corpus.length) {
  console.log(`\n⚠ the trigger emitted ${fetched} item(s) but the audited pass decided ${corpus.length}.`);
  console.log('  That disagreement is the story, not a rounding error — say it out loud rather');
  console.log('  than picking the nicer figure. Gmail surfaces a message under both its label');
  console.log('  and [Gmail]/All Mail, and the corpus is appended in two phases.');
}

const alreadyReplied = count(corpus, (d) => d.rule === REPLIED_STOP);

// ---- the hand adjudication ----------------------------------------------
// Written by hand between the first run of this script and the second (pre-flight
// 20), so an empty file is a legitimate reading of "not adjudicated yet" and gets a
// warning rather than a throw.
const adjOf = (e) => String(e.adjudication ?? e.verdict ?? e.label ?? '').toUpperCase();
const byUid = new Map();
for (const e of escalations) {
  const a = adjOf(e);
  if (a !== 'CORRECT' && a !== 'FALSE') {
    problem(`escalations.jsonl:${e.n} is labelled "${a || '(nothing)'}" — every line must read CORRECT (the gate was right) or FALSE (the gate was over-strict)`);
    continue;
  }
  if (e.uid === undefined) { problem(`escalations.jsonl:${e.n} names no uid, so it cannot be joined to a decision`); continue; }
  const uid = String(e.uid);
  if (byUid.has(uid) && byUid.get(uid) !== a) problem(`escalations.jsonl adjudicates uid ${uid} both CORRECT and FALSE`);
  byUid.set(uid, a);
  // Every adjudicated line must name a BLOCKED DRAFT of the audited pass — the same
  // population as `Drafts blocked` and `Escalations post strip`, which is what the
  // definition at the top of this file commits to. Without this check a line naming a
  // cleared message, a prefiltered notice, or a draft that only blocked before strip()
  // went in adds silently to `Escalations examined` and `Correct escalations`, both of
  // which go on air, while `Drafts blocked` stays where it was. That is B4's failure
  // exactly: two numbers drawn from two populations, each individually measurable, in
  // one sentence that lies.
  const decided = corpus.find((d) => String(d.uid) === uid);
  if (!decided) {
    problem(`escalations.jsonl:${e.n} names uid ${uid}, which the audited pass never decided`);
  } else if (!escalated(decided)) {
    const what = decided.verdict === 'SEND' ? 'cleared it' : `stopped it as ${decided.rule}`;
    problem(`escalations.jsonl:${e.n} adjudicates uid ${uid}, but the audited pass ${what} rather than blocking it as a draft`);
    // Said once, however many lines are out of population — the dedupe above collapses
    // it — because six copies of the same paragraph at 1am is a wall, not a warning.
    problem('Escalations examined and Correct escalations are counted over blocked drafts only, the ' +
      'same population as Drafts blocked and Escalations post strip. A line from outside it inflates ' +
      'two on-air figures while Drafts blocked stays put. A draft that only blocked before strip() ' +
      'went in belongs to Escalations pre strip, counted off that pass, and is not adjudicated.');
  }
}

const escExamined = escalations.length;
const escCorrect = escalations.filter((e) => adjOf(e) === 'CORRECT').length;
const escFalse = escalations.filter((e) => adjOf(e) === 'FALSE').length;
const nearMissesRight = nearMisses.filter((d) => byUid.get(String(d.uid)) === 'CORRECT').length;

const pending = corpus.filter(escalated).filter((d) => !byUid.has(String(d.uid)));
if (pending.length) {
  console.log(`\n⚠ ${pending.length} blocked draft(s) not yet adjudicated: ${pending.map((d) => d.uid).join(', ')}`);
  console.log('  Read each one by hand into escalations.jsonl and run this again (pre-flight 20).');
  console.log('  Until then Correct escalations and Near misses right are undercounts, and the');
  console.log('  hook is written from Near misses right.');
}

// ---- cost ---------------------------------------------------------------
// Lines in receipts.jsonl, cross-checked against the billable units the responses
// carried. The count is the measurement; the units are the receipt behind it.
const falCalls = receipts.length;
const unitless = receipts.filter((r) => r.units === null || r.units === undefined).length;
// A missing header is a reading — fal did not send one, and the count says so. A
// header that was captured and does not read as a number is corrupt, and counting it
// as zero would quietly shrink the very cross-check `Fal calls` is checked against.
for (const r of receipts) {
  if (r.units === null || r.units === undefined) continue;
  if (String(r.units).trim() === '' || !Number.isFinite(Number(r.units)))
    problem(`receipts.jsonl:${r.n} carries units ${JSON.stringify(r.units)}, which is not a number — ` +
      'the billable-units cross-check behind Fal calls cannot be summed over it');
}
const units = receipts.reduce((n, r) => n + (Number(r.units) || 0), 0);
console.log(`\nreceipts : ${falCalls} call(s), ${units} billable unit(s)${unitless ? `, ${unitless} with no x-fal-billable-units header` : ''}`);
const draftCalls = new Set(receipts.filter((r) => r.call === 'draft').map((r) => String(r.uid))).size;
if (draftCalls !== draftsAttempted) {
  console.log(`⚠ ${draftCalls} message(s) got a draft call but ${draftsAttempted} decision(s) look drafted.`);
}

// ---- the byte diffs -----------------------------------------------------
// Measured numbers 18 and 19: what the transport added after the gate had already
// approved the body. Written on camera by ep11-verify-landed.mjs; read here rather
// than retyped.
const sentDir = path.join(BASE, 'sent');
const diffFiles = fs.existsSync(sentDir)
  ? fs.readdirSync(sentDir).filter((f) => f.endsWith('.txt')).map((f) => ({ name: f, text: fs.readFileSync(path.join(sentDir, f), 'utf8') }))
  : [];

const NEAR_BYTES = [
  /\b(?:added|appended|inserted|extra)\b[^0-9\n]{0,40}?(\d+)\s*bytes?\b/gi,
  /\b(\d+)\s*bytes?\b[^0-9\n]{0,40}?\b(?:added|appended|inserted)\b/gi,
];

/** Prefers an explicitly labelled integer; falls back to one stated in a sentence.
 *  Refuses to guess: no candidate and several disagreeing candidates both fail. */
function diffBytes(label, prefer) {
  const labelled = new RegExp('^[ \\t]*' + label + '[ \\t]*[:=]?[ \\t]*(\\d+)[ \\t]*$', 'im');
  for (const f of diffFiles) {
    const m = f.text.match(labelled);
    if (m) return Number(m[1]);
  }
  const scoped = diffFiles.filter((f) => prefer.test(f.name));
  const found = new Set();
  for (const f of scoped) for (const re of NEAR_BYTES) for (const m of f.text.matchAll(re)) found.add(Number(m[1]));
  if (found.size === 1) return [...found][0];
  if (!diffFiles.length) return problem(`${BASE}/sent/ holds no .txt diff — run ep11-verify-landed.mjs first (pre-flight 19)`);
  if (!found.size) {
    return problem(`no byte count for "${label}" in ${scoped.map((f) => f.name).join(', ') || 'sent/'}. ` +
      `Have ep11-verify-landed.mjs stamp a line reading "${label}  <integer>", or state it as ` +
      '"appended N bytes" — this audit will not infer it from the diff body.');
  }
  return problem(`"${label}" is ambiguous: ${[...found].join(', ')} all read as byte counts in ${scoped.map((f) => f.name).join(', ')}`);
}

const diffEp11 = diffBytes('Diff bytes', /ep11|landed/i);
const diffEp10 = diffBytes('Diff bytes ep10', /ep10/i);

// ---- seeded -------------------------------------------------------------
const phaseA = manifest.phases?.a?.count;
const phaseB = manifest.phases?.b?.count;
if (typeof phaseA !== 'number' || typeof phaseB !== 'number') problem('seed-manifest.json is missing a per-phase count for a or b');
const seeded = (phaseA ?? 0) + (phaseB ?? 0);
if (Array.isArray(manifest.messages) && manifest.messages.length !== seeded) {
  problem(`seed-manifest.json says ${seeded} appended across the phases but lists ${manifest.messages.length} messages`);
}

// ---- refuse to write a half-measured file -------------------------------
if (problems.length) {
  console.error(`\n✗ ${problems.length} number(s) could not be measured — gate-audit.txt NOT written.\n`);
  for (const p of problems) console.error(`   • ${p}\n`);
  console.error('  Nothing is defaulted to zero here on purpose. build-data-ep11.mjs parses this');
  console.error('  file label by label, so a missing row becomes a silent zero on screen, and');
  console.error('  this is the episode about numbers that lie.');
  process.exit(1);
}

// ---- the artifact -------------------------------------------------------
// build-data-ep11.mjs matches `^<label>\s+(\d+)$`, so the label must never run into
// its own number. Rule names come out of the gate and can be renamed there, and a row
// too wide for the column is a row the builder reads as a missing rule.
const row = (label, n) => {
  if (label.length >= LABEL_COL) throw new Error(`"${label}" is ${label.length} characters and leaves no gap before its number in a ${LABEL_COL}-column label field — widen LABEL_COL`);
  return label.padEnd(LABEL_COL) + n;
};
const lines = [
  'EP11 SEND-GATE AUDIT',
  '',
  `Every line counted below was written on or after ${SINCE.toISOString()}, when the`,
  'rehearsal artifacts were rotated into runs/. Nothing from before the take is in it.',
  '',
  'THE CORPUS — written by me, appended to my own mailbox in two phases',
  row('Seeded count', seeded),
  row('Seeded phase a', phaseA),
  row('Seeded phase b', phaseB),
  row('Messages fetched first', fetchedFirst),
  row('Messages fetched', fetched),
  '',
  'The first listen ran with "Fetch Only New Emails" on, which pushes SINCE <today>',
  'onto the IMAP search. The backdated messages did not match a date-granular SINCE.',
  'The second listen ran with it off and asked for the whole box.',
  '',
  'THE CHAIN — one pass over the corpus, with the gate as it ships',
  row('Notices prefiltered', notices),
  row('Drafts attempted', draftsAttempted),
  row('Drafts cleared', draftsCleared),
  row('Drafts blocked', draftsBlocked),
  row('Near misses', nearMisses.length),
  row('Near misses right', nearMissesRight),
  '',
  'Prefiltered messages never cost a model call. Drafts attempted are the items that',
  `reached the model with a sendable category (${SENDABLE.join(', ')}); attempted is`,
  'cleared plus blocked. Near misses are drafts refused only for citing something the',
  'source does not support, and Near misses right is the adjudicated subset of them.',
  ...(alreadyReplied ? ['', `Of the ${notices} prefiltered, ${alreadyReplied} were stopped as already replied, not as notices.`] : []),
  '',
  'BLOCKED BY RULE — counts only, never percentages, on a corpus this size',
  ...RULE_NAMES.map((r) => row(r, ruleCounts[r])),
  '',
  `${DEFENCE_IN_DEPTH.join(' and ')} are defence-in-depth and read zero by`,
  'design: node 5 assigns the recipient in code from the header, and node 3 reads the',
  'same ledger before this node does. They stay so that their silence stays visible.',
  '',
  'THE GATE, AUDITED BY HAND',
  row('Escalations examined', escExamined),
  row('Correct escalations', escCorrect),
  row('False escalations', escFalse),
  row('Escalations pre strip', count(preStripPass.rows, escalated)),
  row('Escalations post strip', count(corpusPass.rows, escalated)),
  '',
  'Pre strip and post strip are two filmed runs of the same corpus: the gate typed',
  'without strip(), then with it. Every blocked draft was read by hand and labelled',
  'CORRECT (the gate was right) or FALSE (the gate was over-strict and the draft was',
  'fine). Both counts are reported.',
  '',
  'COST AND ARTIFACTS',
  row('Fal calls', falCalls),
  row('Gate lines', GATE_LINES),
  row('Diff bytes', diffEp11),
  row('Diff bytes ep10', diffEp10),
  '',
  `Fal calls are lines in receipts.jsonl, carrying ${units} billable unit(s) across the`,
  'whole take. The two byte counts are what n8n appended after the gate had already',
  'approved the body — Text format for EP11, html for EP10. Same feature, two payloads,',
  'and neither was in the body the gate ruled on.',
];

const out = path.join(BASE, 'gate-audit.txt');
fs.writeFileSync(out, lines.join('\n') + '\n');

// ---- report -------------------------------------------------------------
console.log(`\nwrote ${out}`);
console.log(`corpus pass    : ${corpusPass.source}, ${corpus.length} decision(s)`);
console.log(`pre-strip pass : ${preStripPass.source}, ${preStripPass.rows.length} decision(s)`);
console.log(`escalations    : ${count(preStripPass.rows, escalated)} before strip() → ${count(corpusPass.rows, escalated)} after`);
console.log(`near misses    : ${nearMisses.length} refused, ${nearMissesRight} adjudicated right`);
console.log(`fal calls      : ${falCalls}`);
