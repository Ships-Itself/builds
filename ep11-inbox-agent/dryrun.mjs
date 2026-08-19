/** Pre-flight: runs the EXACT jsCode out of the generated workflow JSONs through
 *  a minimal n8n shim, so the code typed on camera is the code proven to work.
 *
 *    node --env-file=.env scripts/ep11-dryrun.mjs            # fixture chain, incl. normalize
 *    node --env-file=.env scripts/ep11-dryrun.mjs --batch    # replay the real mail/
 *    node --env-file=.env scripts/ep11-dryrun.mjs --batch --broken
 *
 *  Fork of scripts/ep10-dryrun.mjs. Skips the Send Email node, which is tested
 *  on camera — and which in a dry run does not execute at all, because the only
 *  node upstream of it returns [] unless EP11_MODE=live.
 *
 *  THREE GUARDS, ALL STRUCTURAL RATHER THAN DISCIPLINARY:
 *
 *  1. It refuses to run if any jsCode matches /\bfetch\s*\(|\bnew\s+URL\s*\(|\bURL\s*\(/.
 *     This shim compiles node bodies with `new Function` in plain Node, where
 *     `fetch` and `URL` both exist — n8n's Code sandbox has neither. Without
 *     this guard the dry run goes green on code that dies on camera. (B2)
 *  2. It refuses to run if any jsCode exceeds 18 lines. The gate's line count is
 *     a number that goes in a title, and a node that grows past the frame is a
 *     retake.
 *  3. --batch exits non-zero on an empty mail/. workflow-batch.json is a REPLAY
 *     of a fetch that already happened, so it is empty by design until a real
 *     fetch has run, and a vacuous green must be impossible. (B10)
 *
 *  --batch runs against the real build dir, so it writes decisions.jsonl,
 *  receipts.jsonl and raw/ for real. That is intended: pre-flight 13 runs it,
 *  and pre-flight 17 rotates everything it wrote into runs/ before the recorder
 *  rolls. The default fixture run instead points EP11_DIR at a throwaway run
 *  directory, so mail/ keeps exactly one writer against the real corpus (B10).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const BASE = process.env.EP11_BASE ?? process.cwd();
const GEN = `${process.env.EP11_BASE ?? process.cwd()}/make-workflows.mjs`;

const BATCH = process.argv.includes('--batch');
const USE_BROKEN = process.argv.includes('--broken');

const wfName = BATCH ? 'workflow-batch.json' : 'workflow.json';
const wf = JSON.parse(fs.readFileSync(`${BASE}/${wfName}`, 'utf8'));

// --broken runs the pre-strip() gate — the exact string the recorder types — so
// a "before" run is genuinely the before. It is a compile-and-behaviour proof
// against the rehearsal corpus only; the pre-strip and post-strip counts that go
// on air come from two FILMED runs (B9).
const { BROKEN } = USE_BROKEN ? await import(GEN) : { BROKEN: {} };

// ---- guards, before a single line is executed ----------------------------
const BANNED = /\bfetch\s*\(|\bnew\s+URL\s*\(|\bURL\s*\(/;
const bodies = [];
for (const f of ['workflow.json', 'workflow-batch.json', 'workflow-rehearsal.json']) {
  const w = JSON.parse(fs.readFileSync(`${BASE}/${f}`, 'utf8'));
  for (const n of w.nodes) if (n.parameters?.jsCode) bodies.push([`${f}:${n.name}`, n.parameters.jsCode]);
}
for (const [k, v] of Object.entries(BROKEN)) bodies.push([`BROKEN:${k}`, v]);

let refused = 0;
for (const [where, src] of bodies) {
  const hit = src.match(BANNED);
  if (hit) {
    console.error(`✗ REFUSING TO RUN — ${where} contains ${hit[0]}`);
    console.error("  n8n's Code sandbox has neither fetch nor URL. This shim runs in plain Node,");
    console.error("  where both exist, so a green run here would certify code that dies on camera.");
    console.error("  Use require('https') + https.request + a manual Promise, as EP10 does.");
    refused++;
  }
  const lines = src.split('\n').length;
  if (lines > 18) {
    console.error(`✗ REFUSING TO RUN — ${where} is ${lines} lines, over the 18-line cap`);
    refused++;
  }
}
if (refused) process.exit(1);

const gateSrc = (USE_BROKEN && BROKEN['send-gate']) ||
  JSON.parse(fs.readFileSync(`${BASE}/workflow.json`, 'utf8')).nodes.find((n) => n.name === 'send-gate').parameters.jsCode;
console.log(`gate lines: ${gateSrc.split('\n').length}${USE_BROKEN ? '  (BROKEN — pre-strip())' : ''}`);

// ---- environment ---------------------------------------------------------
const personas = JSON.parse(fs.readFileSync(`${BASE}/personas.json`, 'utf8'));

/** The fixture run must not write into the real mail/: normalize is that
 *  directory's only writer against the real corpus (B10). So it gets its own
 *  throwaway run directory, seeded with the two files the chain reads. */
function makeSandbox() {
  const dir = `${BASE}/runs/dryrun-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  for (const sub of ['mail', 'raw', 'approved']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  fs.copyFileSync(`${BASE}/knowledge.md`, `${dir}/knowledge.md`);
  fs.writeFileSync(`${dir}/replied.json`, '{}');
  for (const f of ['decisions.jsonl', 'receipts.jsonl', 'escalations.jsonl']) fs.writeFileSync(`${dir}/${f}`, '');
  fs.writeFileSync(`${dir}/MARKER`, 'DRYRUN — fixture chain, not a filmed run. Never counted by ep11-audit.mjs.\n');
  return dir;
}

const EP11_DIR = BATCH ? BASE : makeSandbox();
const env = {
  EP11_DIR,
  EP11_MODE: process.env.EP11_MODE || 'dry',
  EP11_OPERATOR: process.env.EP11_OPERATOR || personas.operator,
  FAL_KEY: process.env.FAL_KEY,
};
if (!env.FAL_KEY) console.log('⚠ FAL_KEY is not set — classify-call and draft-call will fail on the HTTPS call.');
if (env.EP11_MODE === 'live') console.log('⚠ EP11_MODE=live — outbox will emit items and write the ledger.');

// ---- the shim ------------------------------------------------------------
const require = createRequire(import.meta.url);
const jsOf = (name) =>
  (USE_BROKEN && BROKEN[name]) || wf.nodes.find((n) => n.name === name).parameters.jsCode;
const modeOf = (name) => wf.nodes.find((n) => n.name === name).parameters.mode;

/** Compile one n8n Code node body into an async function with n8n's globals. */
const compile = (name) =>
  new Function('$json', '$input', '$env', 'require', `return (async () => {\n${jsOf(name)}\n})()`);

/** Run a node the way n8n would, given input items. Honours the explicit mode:
 *  runOnceForEachItem really is once per item, which is the whole reason the
 *  generator refuses to emit a Code node without one. */
async function runNode(name, items) {
  const fn = compile(name);
  const $input = { all: () => items, first: () => items[0] };
  if (modeOf(name) === 'runOnceForEachItem') {
    const out = [];
    for (const it of items) {
      const r = await fn(it.json, { all: () => [it], first: () => it }, env, (m) => require(m));
      if (r) out.push(Array.isArray(r) ? r[0] : r);
    }
    return out;
  }
  const r = await fn(items[0]?.json ?? {}, $input, env, (m) => require(m));
  return Array.isArray(r) ? r : [r];
}

// ---- input ---------------------------------------------------------------
/** Three fixture messages in the IMAP node's `Resolved` shape. Addresses come
 *  out of personas.json so this file introduces none of its own.
 *  headers[key] carries the WHOLE header line, LABEL INCLUDED — that is finding
 *  N2 (utils.js:15-17 does `headers[header.key] = header.line`), and the fixture
 *  reproduces it so the dry run actually exercises hdr()'s label strip instead
 *  of quietly agreeing with a bug. */
function fixtures() {
  const p = (id) => personas.personas.find((x) => x.id === id);
  const to = personas.operator.replace('@', '+inbox@');
  const mk = (uid, from, subject, text, extra = {}) => ({
    json: {
      attributes: { uid },
      headers: {
        'message-id': `Message-ID: <ep11.fixture.${uid}@${from.split('@')[1]}>`,
        from: `From: ${from}`,
        to: `To: ${to}`,
        subject: `Subject: ${subject}`,
        date: `Date: ${new Date().toUTCString()}`,
        ...extra,
      },
      subject,
      textPlain: text,
    },
  });
  return [
    mk(9001, p('ortiz').email, 'Can we book a scoping call?',
      'Hello,\n\nWe would like to talk about automating our reminder emails.\nWhat is the best way to get a call in the diary?\n\n> quoted line that normalize should strip\nOn Mon someone wrote:\n'),
    mk(9002, p('listbot').email, 'The Ops Weekly',
      'This week: retry storms and idempotency keys.\n',
      { 'list-unsubscribe': 'List-Unsubscribe: <mailto:unsubscribe@list.example.org>' }),
    mk(9003, p('noreply').email, 'Your export is ready',
      'This mailbox is not monitored.\n'),
  ];
}

const CHAIN = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code').map((n) => n.name);

let items;
if (BATCH) {
  const mailDir = `${BASE}/mail`;
  const files = fs.existsSync(mailDir) ? fs.readdirSync(mailDir).filter((f) => f.endsWith('.json')) : [];
  if (!files.length) {
    console.error('✗ mail/ is empty. workflow-batch.json REPLAYS a fetch that already happened —');
    console.error('  it is empty by design until the IMAP trigger has run and normalize has written');
    console.error('  the corpus. Run the real fetch first (pre-flight 12). A green run on an empty');
    console.error('  mail/ would be vacuous, so this exits non-zero instead. (B10)');
    process.exit(1);
  }
  console.log(`BATCH: replaying ${files.length} message(s) from mail/\n`);
  items = [{ json: {} }]; // read-mail-dir is the head; it reads mail/ itself
} else {
  items = fixtures();
  console.log(`FIXTURE: ${items.length} message(s) through the full chain, incl. normalize`);
  console.log(`sandbox: ${EP11_DIR}\n`);
}

// ---- run -----------------------------------------------------------------
for (const name of CHAIN) {
  const t0 = Date.now();
  try {
    items = await runNode(name, items);
  } catch (err) {
    console.error(`✗ ${name} THREW: ${err.message}`);
    console.error(err.stack.split('\n').slice(0, 4).join('\n'));
    process.exit(1);
  }
  const ms = Date.now() - t0;
  const peek = (() => {
    const j = items[0]?.json ?? {};
    if (name === 'read-mail-dir') return items.map((i) => i.json.uid).slice(0, 6).join(' ');
    if (name === 'normalize') return items.map((i) => `${i.json.uid}:${i.json.from}`).join(' ');
    if (name === 'prefilter') return items.map((i) => i.json.stop || '-').join(' ');
    if (name === 'classify-call') return items.map((i) => `${i.json.category}@${i.json.confidence}`).join(' ');
    if (name === 'draft-call') return items.map((i) => (i.json.draft ? `parsed:${i.json.parsed}` : '-')).join(' ');
    if (name === 'send-gate') return items.map((i) => `${i.json.verdict}${i.json.rule ? ':' + i.json.rule : ''}`).join(' ');
    if (name === 'digest') return `${items.length} passed through`;
    if (name === 'outbox') return items.length ? `${items.length} outbound` : 'ZERO — send node does not execute in dry';
    return Object.keys(j).slice(0, 5).join(',');
  })();
  console.log(`${String(ms).padStart(6)}ms  ${name.padEnd(14)} ${String(items.length).padStart(3)} item(s)  ${peek}`);
}

// ---- report --------------------------------------------------------------
const read = (f) => { try { return fs.readFileSync(`${EP11_DIR}/${f}`, 'utf8').trim(); } catch { return ''; } };
const decisions = read('decisions.jsonl').split('\n').filter(Boolean).map(JSON.parse);
const byRule = decisions.reduce((a, d) => (a[d.rule || 'SEND'] = (a[d.rule || 'SEND'] || 0) + 1, a), {});
console.log('\ndecisions:', decisions.length, JSON.stringify(byRule));
console.log('verdicts: ', JSON.stringify(decisions.reduce((a, d) => (a[d.verdict] = (a[d.verdict] || 0) + 1, a), {})));
console.log('receipts: ', read('receipts.jsonl').split('\n').filter(Boolean).length, 'fal call(s)');
console.log(`gate lines: ${gateSrc.split('\n').length}`);
console.log('\ndigest.txt:');
for (const l of read('digest.txt').split('\n')) console.log('  ', l);
console.log('\nartifacts:', EP11_DIR);
if (!BATCH) console.log('(fixture sandbox — ep11-audit.mjs --since never counts it)');
