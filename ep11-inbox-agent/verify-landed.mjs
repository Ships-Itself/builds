/** THE CLOSING MOVE (§4). Reads the sent reply back out of `[Gmail]/Sent Mail`
 *  by Message-ID, writes it to sent/, and byte-diffs the DECODED body against
 *  the body the gate approved. The bytes that show up in the diff are the ones
 *  the transport added AFTER the gate had already ruled.
 *
 *    node scripts/ep11-verify-landed.mjs                    # pre-flight 19, take 1
 *    node scripts/ep11-verify-landed.mjs --tag attr-off     # after toggling the option off
 *    node scripts/ep11-verify-landed.mjs --compare-ep10     # measured numbers 18 AND 19
 *    node scripts/ep11-verify-landed.mjs --ep10-only        # pre-flight 1, no IMAP, no live send
 *
 *    --message-id '<x@y>'  verify this exact send instead of resolving one
 *    --uid <n>             which approved/<uid>.txt, when more than one is cleared
 *    --tag <name>          write sent/<name>-landed.eml and sent/<name>-diff.txt
 *    --force               replace an artifact measured on a different send
 *
 *  TWO NUMBERS COME OUT OF HERE AND BOTH GO ON SCREEN:
 *    `Diff bytes`       measured number 18. EP11's send node is pinned to
 *                       emailFormat=text, so send.operation.js:213 takes the
 *                       `else` branch and appends a plain block ending in a bare
 *                       https://n8n.io — no UTM, no anchor.
 *    `Diff bytes ep10`  measured number 19. EP10's node was emailFormat=html, so
 *                       the same feature took the `if` branch at :202 and wrote a
 *                       createUtmCampaignLink() anchor — and, less obviously,
 *                       RE-INDENTED the whole body, which is why the diff below
 *                       measures bytes added BEFORE the approved body as well as
 *                       after it. Same feature, two payloads, two byte counts,
 *                       and neither was in the body the gate approved. (B11)
 *
 *  Those two line numbers are the ones in the copy installed today; the artifact
 *  re-derives them from that file on every run rather than repeating them, so a
 *  reformat upstream moves the citation instead of falsifying it.
 *
 *  Both are written to the diff artifact in ep11-audit.mjs's label-whitespace-
 *  integer format, anchored one per line, so `^Diff bytes\s+(\d+)$` and
 *  `^Diff bytes ep10\s+(\d+)$` each match exactly one line, and neither matches
 *  the other's. That is the contract between this script and the audit; do not
 *  reflow those lines, and note that a non-default --tag suffixes every numeric
 *  label so the retakes cannot answer for the filmed number.
 *
 *  NOTHING HERE IS TYPED. Every integer is measured off bytes on disk or bytes
 *  off the wire, and every input — which message, which recipient, which approved
 *  file, which attribution branch — is derived from the build directory or from
 *  n8n's own source. Where a value cannot be derived this throws rather than
 *  picking a plausible one (BRAND.md: a rehearsal figure reached a render once).
 *
 *  PRIVACY IS AN ASSERTION, NOT AN INTENTION (privacy plan, layer 6). Every
 *  address in From/To/Cc/Bcc/Reply-To of every message it touches must be on an
 *  RFC 2606 reserved name or be the operator's own; anything else exits 2 with a
 *  banner. The check is imported from ep11-make-workflows.mjs — the same
 *  isReserved/isOperator the generator and the seeder assert with, so there is
 *  one address policy in this episode and not three. It also sweeps the whole
 *  send window, so a send that escaped to a real address cannot hide behind the
 *  one message we went looking for.
 *
 *  THE SWEEP IDENTIFIES OUR SENDS BY BODY, AND THAT IS NOT A STYLE CHOICE.
 *  Measured read-only against this mailbox on 2026-08-18: Gmail's SMTP relay
 *  strips `X-Mailer` (0 of 41 messages sent in 60 days carry one, EP10's four
 *  n8n sends included) and rewrites `From` to the bare account address, so the
 *  node's `Ships Itself <…>` display name is gone by the time the copy reaches
 *  Sent Mail. Both obvious selectors return zero and would report a clean sweep
 *  by finding nothing at all. What Gmail cannot rewrite is the body, and the
 *  outbox node writes every body it sends — approved/<uid>.txt for each reply,
 *  digest.txt for the run digest — before it emits the item. So a message is
 *  this workflow's if it carries one of those bytes-for-bytes, and the sweep
 *  proves it can see the message we already found before it reports anything.
 *
 *  READ-ONLY, AND STRUCTURALLY SO: the mailbox is opened with readOnly=true and
 *  node-imap fetches with BODY.PEEK, so this neither flags nor deletes anything.
 *  It is the same node-imap 0.8.19 the trigger itself runs on
 *  (builds/ep01-crm-sync/node_modules/imap), which is the point — the message is
 *  read back with the library that fetched it in the first place.
 */
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const BASE = process.env.EP11_BASE ?? process.cwd();
const EP10 = process.env.EP10_BASE ?? ''; // only needed for the EP10 comparison line
const GEN = `${process.env.EP11_BASE ?? process.cwd()}/make-workflows.mjs`;
// Where your self-hosted n8n keeps its node_modules — the script reads n8n's
// own send.operation.js to show which attribution branch produced the bytes.
const NM = process.env.N8N_MODULES ?? '';
const SEND_OP = `${NM}n8n-nodes-base/dist/nodes/EmailSend/v2/send.operation.js`;
const CRED = process.env.EP11_GMAIL_ENV ?? `${os.homedir()}/.secrets/gmail.env`;

const SENT_BOX = '[Gmail]/Sent Mail';
const EXIT_PRIVACY = 2;
const SWEEP_CAP = 200; // messages in the send window; past this the window is wrong, not the cap
const IMAP_BUDGET_MS = 120000; // per phase. A stalled read on camera is a dead take.

const die = (...m) => { console.error('✗', ...m); process.exit(1); };

// ---- argv ----------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);

/** A value-taking option must actually have been given a value. `--tag` with
 *  nothing after it used to fall through to the default, which meant a retake
 *  typed one keystroke short wrote the CANONICAL artifact under the CANONICAL
 *  labels — the single thing --tag exists to prevent — and `--tag --force`
 *  wrote sent/--force-diff.txt. Neither is a state anyone would notice at 1am. */
const opt = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined) die(`${name} needs a value and was given none`);
  if (v.startsWith('-')) die(`${name} was given "${v}", which is another flag, not a value`);
  return v;
};

if (flag('--help') || flag('-h')) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\* ?| ?\* ?/gm, ''));
  process.exit(0);
}

const EP10_ONLY = flag('--ep10-only');
const COMPARE_EP10 = flag('--compare-ep10') || EP10_ONLY;
const FORCE = flag('--force');
const PINNED_MID = opt('--message-id');
const PINNED_UID = opt('--uid');
const TAG = opt('--tag') || (EP10_ONLY ? 'ep10' : 'ep11');

// ---- the address policy, imported rather than restated -------------------
// ep11-make-workflows.mjs is the JS half of the policy (its Python twin is in
// ep11-seed.py). Importing it is safe: it only runs main() when it is argv[1].
const { RFC2606_DOMAINS, RFC2606_TLDS, ADDR, isOperator, isReserved } = await import(GEN);
const P = JSON.parse(fs.readFileSync(`${BASE}/personas.json`, 'utf8'));

// isReserved() trusts personas.json's declared list, so re-run the generator's
// own guard on that list here. A widened personas.json must not widen the check
// that is supposed to catch a widened personas.json.
for (const d of P.allowed_domains) if (!RFC2606_DOMAINS.includes(d)) die(`personas.json allows "${d}", which is not RFC 2606 reserved`);
for (const t of P.allowed_tlds) if (!RFC2606_TLDS.includes(t)) die(`personas.json allows TLD ".${t}", which is not RFC 2606 reserved`);

// Distinct addresses, not sightings. One address that escaped is asserted twice
// — once on the landed message, once again when the sweep walks past it — and a
// banner reading "2 address(es)" over a single leak is a number that misleads
// the person reading it at the worst possible moment.
const privacyFailures = new Set();

/** The assertion, over one message's addressing headers. Same regex and same two
 *  predicates the generator uses, so "clean" means the same thing everywhere. */
function assertAddresses(where, headers) {
  const seen = [];
  for (const key of ['from', 'to', 'cc', 'bcc', 'reply-to']) {
    for (const value of headers.get(key) || []) {
      for (const a of new Set(value.match(ADDR) || [])) {
        const ok = isReserved(a, P) || isOperator(a, P);
        seen.push({ key, a, ok });
        if (!ok) privacyFailures.add(a.toLowerCase());
      }
    }
  }
  if (!seen.length) die(`${where}: no From/To/Cc/Bcc/Reply-To address found at all — refusing to call that clean`);
  console.log(`  ${where}`);
  for (const s of seen) console.log(`    ${s.ok ? '✓' : '✗ NOT ALLOWED'}  ${s.key.padEnd(9)} ${s.a}`);
  return seen;
}

// ---- minimal MIME, because the byte count is the whole point -------------
// mailparser sits in the same node_modules and would be one line, but it hands
// back decoded STRINGS with its own line-ending and trailing-whitespace
// opinions. The number on screen is a byte count, so every byte between the
// wire and the comparison is handled here, in the open, in about forty lines.

/** Headers as lowercased key -> array of unfolded values, plus the body bytes. */
function splitMessage(buf) {
  const s = buf.toString('latin1');
  let i = s.indexOf('\r\n\r\n'), sep = 4;
  if (i < 0) { i = s.indexOf('\n\n'); sep = 2; }
  if (i < 0) die('message has no header/body separator');
  const headers = new Map();
  const unfolded = s.slice(0, i).replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^([!-9;-~]+):\s?([\s\S]*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (!headers.has(k)) headers.set(k, []);
    headers.get(k).push(m[2]);
  }
  return { headers, body: Buffer.from(s.slice(i + sep), 'latin1') };
}

const h1 = (headers, k) => (headers.get(k) || [''])[0];

function transferDecode(cte, body) {
  const enc = cte.toLowerCase().trim();
  if (enc === 'base64') return Buffer.from(body.toString('latin1').replace(/\s+/g, ''), 'base64');
  if (enc === 'quoted-printable') {
    const t = body.toString('latin1')
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, x) => String.fromCharCode(parseInt(x, 16)));
    return Buffer.from(t, 'latin1');
  }
  return body; // 7bit / 8bit / binary / absent — already the bytes
}

/** Every leaf part, decoded. Multipart is split on its own boundary; nothing is
 *  assumed about which part carries the reply, because the caller decides that
 *  by testing which one actually contains the approved body. */
function leafParts(buf, path = '1') {
  const { headers, body } = splitMessage(buf);
  const ct = h1(headers, 'content-type') || 'text/plain';
  const bm = ct.match(/boundary\s*=\s*("([^"]+)"|([^;\s]+))/i);
  if (/^multipart\//i.test(ct) && bm) {
    const b = bm[2] || bm[3];
    // RFC 2046: the CRLF on either side of a boundary line belongs to the
    // boundary, not to the part. Both are stripped, or every multipart body
    // reports two bytes the transport did not actually add.
    const chunks = body.toString('latin1').split(`--${b}`).slice(1, -1);
    return chunks.flatMap((c, n) =>
      leafParts(Buffer.from(c.replace(/^\r?\n/, '').replace(/\r?\n$/, ''), 'latin1'), `${path}.${n + 1}`));
  }
  return [{
    path,
    contentType: ct.split(';')[0].trim().toLowerCase(),
    charset: (ct.match(/charset\s*=\s*"?([\w-]+)"?/i) || [, 'us-ascii'])[1].toLowerCase(),
    cte: (h1(headers, 'content-transfer-encoding') || '7bit').trim().toLowerCase(),
    content: transferDecode(h1(headers, 'content-transfer-encoding') || '7bit', body),
  }];
}

// ---- the byte diff -------------------------------------------------------
// Everything is compared as latin1 strings, where one character is exactly one
// byte, so indexOf() and .length are byte operations and nothing is rounded by
// a UTF-8 decode on the way past.
const bytes = (b) => b.toString('latin1');
const unCRLF = (s) => s.replace(/\r\n/g, '\n');

/** Locate the approved body inside the landed body and measure what surrounds
 *  it. Returns null when the approved bytes are not there contiguously, because
 *  containment is also how a candidate message is IDENTIFIED as ours — a null
 *  means "not this message", not "zero bytes". Once a pair has been chosen by
 *  other means, disjointDiff() measures it instead. */
function diffBytes(landedRaw, approvedRaw) {
  const crlf = (bytes(landedRaw).match(/\r\n/g) || []).length;
  for (const [how, landed, approved] of [
    ['exact', bytes(landedRaw), bytes(approvedRaw)],
    ['CRLF normalised', unCRLF(bytes(landedRaw)), unCRLF(bytes(approvedRaw))],
  ]) {
    const at = landed.indexOf(approved);
    if (at < 0) continue;
    const before = Buffer.from(landed.slice(0, at), 'latin1');
    const after = Buffer.from(landed.slice(at + approved.length), 'latin1');
    return {
      how, crlf, contained: true,
      approvedBytes: approved.length,
      landedBytes: landed.length,
      landedFromApproved: approved.length,
      added: before.length + after.length,
      removed: 0,
      blocks: [['before the approved body', before], ['after the approved body', after]],
    };
  }
  return null;
}

/** The chosen message does not contain the approved body anywhere. That is a
 *  measurement, not an error: it means none of what the gate approved reached
 *  the wire and everything that did was added afterwards. Measured read-only on
 *  2026-08-18, this is exactly what EP10's four sends look like — `={{ $json.html }}`
 *  resolved empty, so all 312 bytes in Sent Mail are n8n's own attribution and
 *  none of the 1374-byte report the gate cleared ever left. Reporting that is
 *  worth more than throwing over it, and far more than quietly calling it zero. */
function disjointDiff(landedRaw, approvedRaw) {
  return {
    how: 'no contiguous match — none of the approved body is present',
    crlf: (bytes(landedRaw).match(/\r\n/g) || []).length,
    contained: false,
    approvedBytes: approvedRaw.length,
    landedBytes: landedRaw.length,
    landedFromApproved: 0,
    added: landedRaw.length,
    removed: approvedRaw.length,
    blocks: [['the entire landed body', landedRaw]],
  };
}

function hexdump(buf, indent = '  ') {
  const out = [];
  const cap = Math.min(buf.length, 1024);
  for (let i = 0; i < cap; i += 16) {
    const s = buf.subarray(i, i + 16);
    const hex = [...s].map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47);
    const asc = [...s].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    out.push(`${indent}${i.toString(16).padStart(6, '0')}  ${hex}  ${asc}`);
  }
  if (buf.length > cap) out.push(`${indent}… ${buf.length - cap} further byte(s) not dumped`);
  return out;
}

/** Which branch of send.operation.js produced these bytes. The marker strings
 *  AND THE LINE NUMBERS BESIDE THEM are read out of the installed node, not
 *  typed here, so this reports what the running code does rather than what this
 *  file remembers. A typed line number is still a typed number, and it drifts
 *  the first time n8n reformats the file — at which point the artifact would
 *  cite a line that says something else. */
const attributionMarkers = () => {
  const src = fs.readFileSync(SEND_OP, 'utf8');
  const lineAt = (i) => src.slice(0, i).split('\n').length;
  const text = (src.match(/attributionText\s*=\s*'([^']*)'/) || [])[1];
  const bareAt = src.search(/attributionText\}n8n\\n\$\{'[^']*'\}/);
  const bare = (src.match(/attributionText\}n8n\\n\$\{'([^']*)'\}/) || [])[1];
  // `emailFormat === 'html'` also appears where mailOptions.html is populated,
  // several lines earlier, so anchor on the clause unique to the attribution if.
  const htmlAt = src.search(/emailFormat === 'both' && mailOptions\.html/);
  const anchored = /createUtmCampaignLink/.test(src);
  if (!text || !bare || bareAt < 0 || htmlAt < 0) {
    die(`could not read the attribution branches out of ${SEND_OP} — the node changed shape.\n  Both the marker strings and their line numbers come from that file; nothing here is typed,\n  and a guessed branch label on the money frame is worse than no run at all.`);
  }
  return { text, bare, anchored, htmlLine: lineAt(htmlAt), textLine: lineAt(bareAt) };
};

function identifyBranch(added, mk) {
  const s = bytes(added);
  if (!s.length) return 'none — appendAttribution was off for this send';
  const isHtml = /<a\s+href=/i.test(s) || /utm_/i.test(s);
  const isText = s.includes(mk.bare) && !isHtml;
  if (isHtml) return `html branch (send.operation.js:${mk.htmlLine}) — anchored${/utm_/i.test(s) ? ', carries a utm_ parameter' : ''}`;
  if (isText) return `else branch (send.operation.js:${mk.textLine}) — bare ${mk.bare}, no UTM, no anchor`;
  return 'UNRECOGNISED — the added bytes match neither branch of the installed node';
}

// ---- the diff artifact ---------------------------------------------------
// One measured label per line, anchored, so ep11-audit.mjs reads it with
// `^<label>\s+(\d+)$`. Never carry a number forward from a previous run into a
// file this run wrote: a stale figure surviving a retake is precisely the
// failure BRAND.md's numbers rule exists to prevent.
// The artifact is assembled as entries and rendered once, so the label column is
// measured from the labels this run actually produced rather than guessed at.
// A guessed width is a guessed number, and --tag can lengthen every label.
const art = [];      // the diff artifact, as entries, rendered once at the end
const measured = [];  // the labels this run measured, for the clobber guard
const raw = (s) => art.push({ k: 'raw', s });
const pair = (label, value) => art.push({ k: 'pair', label, value });
const num = (label, n) => {
  if (!Number.isInteger(n)) die(`refusing to write "${label}" — ${JSON.stringify(n)} is not a measured integer`);
  pair(label, String(n));
};

function guardArtifact(path, messageId, labels) {
  if (!fs.existsSync(path) || FORCE) return;
  const old = fs.readFileSync(path, 'utf8');
  // `.*?` because a non-default --tag suffixes the label too: the line reads
  // `Message-ID attr-off   <id>`, which the bare `^Message-ID\s+` never matched
  // — so every TAGGED artifact was silently overwritten by a later, different
  // send. The retake artifacts are the ones most likely to be re-measured.
  const oldMid = (old.match(/^Message-ID\b.*?\s{2,}(\S+)$/m) || [])[1];
  const oldLabels = [...old.matchAll(/^([A-Z][A-Za-z0-9 -]+?)\s{2,}\d+$/gm)].map((m) => m[1]);
  const lost = oldLabels.filter((l) => !labels.includes(l));
  if ((oldMid && messageId && oldMid !== messageId) || lost.length) {
    console.error(`✗ ${path} already records ${oldMid ? `Message-ID ${oldMid}` : 'an earlier measurement'}`);
    if (lost.length) console.error(`  and carries ${lost.map((l) => `"${l}"`).join(', ')}, which this run does not measure.`);
    console.error('  Overwriting it would replace a filmed number with a later take\'s. Either:');
    console.error('    --tag <name>   write a second artifact and keep this one, or');
    console.error(`    --message-id ${oldMid || '<id>'}   re-measure the same send, or`);
    console.error('    --force        replace it deliberately.');
    process.exit(1);
  }
}

// =========================================================================
// EP10 — the file pulled at pre-flight 1, before any toggle moved
// =========================================================================
/** EP10's approved body is not a file on its own: the report node writes
 *  report.html as STYLE + html and emails only `html` (workflow.json, node
 *  "report"). So the style prefix is read out of that node's live jsCode and
 *  stripped — the ep10-verify-gate-fix.mjs idiom of testing the code that
 *  actually shipped rather than a copy of it. Which run directory is the right
 *  one is decided by which report.html the landed bytes actually contain — and
 *  when none of them does, by there being only one candidate to be wrong about. */
function ep10Section() {
  const eml = `${BASE}/sent/ep10-first-real-email.eml`;
  if (!fs.existsSync(eml)) {
    die(`${eml} does not exist.\n  Pre-flight 1 pulls it read-only out of ${SENT_BOX} BEFORE any setting moves.\n  It carries n8n's UTM anchor, sent before anyone knew, and it cannot be recreated once the toggle moves.`);
  }
  const raw = fs.readFileSync(eml);
  const { headers } = splitMessage(raw);
  console.log(`\nEP10 — ${eml}`);
  console.log('privacy assertion (the one artifact in this episode Daniel did not author):');
  assertAddresses('sent/ep10-first-real-email.eml', headers);

  const wf = JSON.parse(fs.readFileSync(`${EP10}/workflow.json`, 'utf8'));
  const report = wf.nodes.find((n) => n.name === 'report');
  if (!report) die(`${EP10}/workflow.json has no "report" node — cannot derive what EP10's gate approved`);
  const style = (report.parameters.jsCode.match(/report\.html',\s*'([^']*)'\s*\+\s*html\)/) || [])[1];
  if (style === undefined) die('could not extract the style prefix from EP10\'s report node — do not guess it');

  const parts = leafParts(raw);
  const reports = (fs.existsSync(`${EP10}/live-run`) ? fs.readdirSync(`${EP10}/live-run`) : [])
    .map((run) => ({ run, f: `${EP10}/live-run/${run}/report.html` }))
    .filter((r) => fs.existsSync(r.f))
    .map((r) => {
      const file = fs.readFileSync(r.f);
      if (!bytes(file).startsWith(style)) die(`${r.f} does not start with the style prefix its own node writes — refusing to guess where the emailed html begins`);
      return { ...r, approved: Buffer.from(bytes(file).slice(style.length), 'latin1') };
    });
  if (!reports.length) die(`${EP10}/live-run holds no report.html — nothing to compare the landed bytes against`);

  for (const r of reports) {
    for (const part of parts) {
      const d = diffBytes(part.content, r.approved);
      if (d) return { eml, raw, headers, ...r, part, d };
    }
  }
  // Nothing contained. Only one report and one part means the pair is not in
  // doubt even though the bytes do not overlap, so measure it and say so.
  // Anything more ambiguous than that is a choice this script will not make.
  if (reports.length !== 1 || parts.length !== 1) {
    die(`none of ${reports.length} live-run report(s) appears in any of ${parts.length} MIME part(s) of ${eml},\n  and there is more than one way to pair them. Pass a build dir with one run, or diff by hand.`);
  }
  return { eml, raw, headers, ...reports[0], part: parts[0], d: disjointDiff(parts[0].content, reports[0].approved) };
}

// =========================================================================
// IMAP — read-only, node-imap 0.8.19, the trigger's own library
// =========================================================================
function credentials() {
  if (!fs.existsSync(CRED)) die(`${CRED} not found — this script reads the app password from there, never from a literal`);
  const mode = fs.statSync(CRED).mode & 0o777;
  if (mode & 0o077) die(`${CRED} is mode ${mode.toString(8)} — a credential readable beyond the owner is not one. chmod 600 it.`);
  const env = {};
  for (const line of fs.readFileSync(CRED, 'utf8').split('\n')) {
    const m = line.trim().match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  const user = env.SMTP_USER || process.env.SMTP_USER;
  const pass = env.SMTP_APP_PASSWORD || process.env.SMTP_APP_PASSWORD;
  if (!user || !pass) die(`${CRED} is missing SMTP_USER or SMTP_APP_PASSWORD`);
  return { user, pass }; // neither is ever printed, logged or written
}

const require_ = createRequire(NM);
const Imap = require_('imap');

const connect = ({ user, pass }) =>
  new Promise((res, rej) => {
    const imap = new Imap({
      user, password: pass, host: 'imap.gmail.com', port: 993, tls: true,
      tlsOptions: { servername: 'imap.gmail.com' },
      authTimeout: 30000, connTimeout: 30000,
    });
    imap.once('ready', () => res(imap));
    imap.once('error', (e) => rej(new Error(`IMAP: ${e.message}`)));
    imap.connect();
  });

/** Race a read against its budget. A stalled read on camera is a dead take —
 *  and so is a silent one, which is what an unref'd timer produces: if the
 *  socket never opens, nothing holds the event loop, the unref'd timer never
 *  fires, and node exits 13 printing "unsettled top-level await" instead of the
 *  throttle hint below. Clearing the timer in a `finally` gives the same "does
 *  not hold the process open once the read has finished" property and still
 *  fires. The no-op catch is for the LOSER of the race: a read we have already
 *  given up on must not take the process down with an unhandled rejection. */
async function withDeadline(label, work) {
  let h;
  const budget = new Promise((_, rej) => {
    h = setTimeout(() => rej(new Error(`${label} did not finish inside ${IMAP_BUDGET_MS / 1000}s.\n  Gmail throttles repeated IMAP logins; wait a minute and rerun. Nothing was written.`)), IMAP_BUDGET_MS);
  });
  work.catch(() => {});
  try { return await Promise.race([work, budget]); } finally { clearTimeout(h); }
}

const pBoxes = (imap) => new Promise((res, rej) => imap.getBoxes((e, b) => (e ? rej(e) : res(b))));
const pSearch = (imap, crit) => new Promise((res, rej) => imap.search(crit, (e, r) => (e ? rej(e) : res(r || []))));

/** readOnly=true, and node-imap issues BODY.PEEK whenever markSeen is falsy, so
 *  nothing here sets \Seen, sets \Deleted or expunges. Read-only twice over. */
const pOpen = (imap, box) => new Promise((res, rej) => imap.openBox(box, true, (e, b) => (e ? rej(e) : res(b))));

function pFetch(imap, uids, bodies) {
  return new Promise((res, rej) => {
    if (!uids.length) return res([]);
    const out = [];
    let open = 0, done = false;
    const finish = () => { if (done && open === 0) res(out); };
    const f = imap.fetch(uids, { bodies, struct: false, markSeen: false });
    f.on('message', (msg) => {
      open++;
      const rec = { chunks: [] };
      msg.on('body', (stream) => stream.on('data', (d) => rec.chunks.push(d)));
      msg.once('attributes', (a) => { rec.uid = a.uid; rec.internalDate = a.date; rec.flags = a.flags; });
      msg.once('end', () => { rec.raw = Buffer.concat(rec.chunks); delete rec.chunks; out.push(rec); open--; finish(); });
    });
    f.once('error', rej);
    f.once('end', () => { done = true; finish(); });
  });
}

/** Gmail's Sent Mail is `[Gmail]/Sent Mail` on an English account and something
 *  else on every other one. Fall back to the \Sent special-use attribute rather
 *  than to a second guess at a name. */
async function openSent(imap) {
  try {
    const box = await pOpen(imap, SENT_BOX);
    return { name: SENT_BOX, box };
  } catch {
    const walk = (tree, prefix = '') =>
      Object.entries(tree).flatMap(([name, b]) => {
        const full = prefix + name;
        const here = (b.attribs || []).includes('\\Sent') ? [full] : [];
        return [...here, ...(b.children ? walk(b.children, full + (b.delimiter || '/')) : [])];
      });
    const found = walk(await pBoxes(imap));
    if (!found.length) die(`neither "${SENT_BOX}" nor any mailbox with the \\Sent attribute could be opened`);
    console.log(`  note: "${SENT_BOX}" would not open; using "${found[0]}" (\\Sent)`);
    return { name: found[0], box: await pOpen(imap, found[0]) };
  }
}

// =========================================================================
// EP11 — which send are we verifying, and what did the gate approve?
// =========================================================================
/** All three of these come off disk: the approved body is the file node 8 wrote
 *  at the moment it cleared the send, the recipient and the send time come out
 *  of the ledger, and the subject comes out of the corpus. Nothing about the
 *  target message is assumed. */
function target() {
  const dir = `${BASE}/approved`;
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.txt')) : [];
  if (!files.length) {
    die(`${dir} is empty. node 8 writes approved/<uid>.txt only when EP11_MODE=live,\n  so an empty directory means no send has been cleared yet (pre-flight 18).`);
  }
  const uid = PINNED_UID ?? (files.length === 1 ? files[0].replace(/\.txt$/, '') : null);
  if (uid === null) die(`${files.length} approved bodies (${files.join(', ')}). Pass --uid <n> to say which send to verify.`);
  const approvedFile = `${dir}/${uid}.txt`;
  if (!fs.existsSync(approvedFile)) die(`${approvedFile} does not exist`);

  const mailFile = `${BASE}/mail/${uid}.json`;
  if (!fs.existsSync(mailFile)) die(`${mailFile} does not exist — normalize is mail/'s only writer (B10) and it never saw uid ${uid}`);
  const mail = JSON.parse(fs.readFileSync(mailFile, 'utf8'));

  const ledger = JSON.parse(fs.readFileSync(`${BASE}/replied.json`, 'utf8'));
  const entry = ledger[mail.messageId];
  if (!entry) die(`replied.json has no entry for ${mail.messageId}.\n  The ledger is written by the outbox node in the same tick it emits the send, so an\n  absent entry means this uid was never sent. Nothing to read back.`);
  // outbox sends to d.to, which draft-call set to d.from. If the two disagree the
  // ledger and the corpus are describing different messages — do not pick one.
  if (entry.to !== mail.from) die(`replied.json says the reply went to ${entry.to} but mail/${uid}.json says the sender was ${mail.from}`);

  const sentAt = new Date(entry.at);
  if (Number.isNaN(+sentAt)) die(`replied.json entry for ${mail.messageId} has an unparseable timestamp: ${entry.at}`);
  const since = new Date(+sentAt - 86400000); // IMAP SINCE is date-granular; one day back covers a UTC/local straddle

  return {
    uid,
    approvedFile,
    approved: fs.readFileSync(approvedFile),
    to: entry.to,
    subject: `Re: ${mail.subject}`,
    sentAt,
    since,
    earliestLedger: new Date(Math.min(...Object.values(ledger).map((e) => +new Date(e.at)))),
  };
}

/** Two IMAP round trips on purpose. The first narrows by recipient and date and
 *  then decides by CONTENT — the winning candidate is the one whose decoded body
 *  actually contains the approved bytes, which is the only test that cannot be
 *  fooled by a subject collision. The second re-fetches that message by its
 *  Message-ID alone and asserts the bytes are identical, so what gets written to
 *  disk is a message pulled by Message-ID and demonstrably the same one. */
async function pullLanded(imap, t) {
  if (PINNED_MID) {
    const hits = await pFetch(imap, await pSearch(imap, [['HEADER', 'MESSAGE-ID', PINNED_MID]]), '');
    if (hits.length !== 1) die(`--message-id ${PINNED_MID} matched ${hits.length} messages, expected exactly 1`);
    return { chosen: hits[0], messageId: PINNED_MID };
  }

  // TO and SINCE are the two search keys Gmail's IMAP honours reliably; the
  // recipient comes out of the ledger and the date out of its timestamp. If the
  // narrow search misses (an encoded or rewritten recipient), widen to the date
  // alone and let the body decide.
  let uids = await pSearch(imap, [['HEADER', 'TO', t.to], ['SINCE', t.since]]);
  if (!uids.length) uids = await pSearch(imap, [['SINCE', t.since]]);
  if (uids.length > SWEEP_CAP) die(`${uids.length} candidate messages since ${t.since.toDateString()}, over the ${SWEEP_CAP} cap — narrow the window before fetching them all`);
  const fetched = await pFetch(imap, uids, '');

  const matches = [];
  for (const m of fetched) {
    const { headers } = splitMessage(m.raw);
    for (const part of leafParts(m.raw)) {
      const d = diffBytes(part.content, t.approved);
      if (d) { matches.push({ ...m, headers, part, d }); break; }
    }
  }
  if (!matches.length) {
    die(`no message in the Sent mailbox contains the ${t.approved.length} bytes of ${t.approvedFile}.\n  Searched TO ${t.to} SINCE ${t.since.toDateString()} — ${fetched.length} message(s) examined.\n  Refusing to diff against a message that is not the one that was sent.`);
  }
  matches.sort((a, b) => +b.internalDate - +a.internalDate);
  if (matches.length > 1) {
    console.log(`  ⚠ ${matches.length} sends carry this approved body — the newest is used. Pin one with --message-id:`);
    for (const m of matches) console.log(`      ${h1(m.headers, 'message-id')}  ${m.internalDate.toISOString()}  added ${m.d.added} byte(s)`);
  }
  const chosen = matches[0];
  const messageId = h1(chosen.headers, 'message-id').trim();
  if (!messageId) die('the chosen send has no Message-ID header — it cannot be pulled back by one');

  const again = await pFetch(imap, await pSearch(imap, [['HEADER', 'MESSAGE-ID', messageId]]), '');
  if (again.length !== 1) die(`re-fetching ${messageId} matched ${again.length} messages, expected exactly 1`);
  if (!again[0].raw.equals(chosen.raw)) die(`${messageId} fetched twice returned different bytes — refusing to measure either`);
  console.log(`  re-fetched by Message-ID: 1 match, ${again[0].raw.length} bytes, byte-identical`);
  return { chosen: again[0], messageId };
}

/** Every body this workflow is known to have sent: one per cleared reply, plus
 *  the run digest. These are the sweep's fingerprints. */
function knownBodies() {
  const out = [];
  const dir = `${BASE}/approved`;
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt'))) out.push(fs.readFileSync(`${dir}/${f}`));
  if (fs.existsSync(`${BASE}/digest.txt`)) out.push(fs.readFileSync(`${BASE}/digest.txt`));
  return out.filter((b) => b.length > 0);
}

const carries = (part, body) => diffBytes(part.content, body) !== null;

/** Everything that left this account while the agent was allowed to send. Each
 *  message is classified by whether it carries a body the workflow wrote; only
 *  those are asserted, so Daniel's own correspondence in the window is counted
 *  and named as not-ours rather than flagged. Bodies are read into memory to
 *  make that test and are never printed or written. The sweep refuses to report
 *  at all unless it re-finds the message we already pulled — a guard that can
 *  only ever return zero is not a guard. */
async function sweep(imap, since, bodies, landed) {
  const uids = await pSearch(imap, [['SINCE', since]]);
  if (uids.length > SWEEP_CAP) {
    die(`${uids.length} messages in the send window (since ${since.toDateString()}), over the ${SWEEP_CAP} cap.\n  The window comes from the earliest timestamp in replied.json. A window that wide means the\n  ledger was not rotated between runs — fix that rather than widening the cap.`);
  }
  const msgs = await pFetch(imap, uids, '');
  const ours = [], byId = [];
  for (const m of msgs) {
    const { headers } = splitMessage(m.raw);
    const mid = h1(headers, 'message-id').trim();
    if (leafParts(m.raw).some((p) => bodies.some((b) => carries(p, b)))) ours.push({ headers, mid });
    // THE ONE SEND THE BODY SELECTOR CANNOT FIND IS THE ONE WITH NO BODY. When
    // the landed message carries none of what the gate approved — the EP10
    // shape, where the send node's body expression resolved empty and only the
    // transport's own bytes left — there is no fingerprint to match, and
    // demanding one makes disjointDiff() unreachable: the sweep kills the run
    // before the measurement it was pinned to produce. Claim it by Message-ID
    // instead, assert it like any other, and say plainly what went unproven.
    else if (!landed.contained && mid === landed.messageId) byId.push({ headers, mid });
  }
  console.log(`\nsweep — ${msgs.length} message(s) left this account since ${since.toDateString()};`);
  console.log(`  ${ours.length} carry a body this workflow wrote, ${msgs.length - ours.length - byId.length} do not and are not its sends.`);
  if (byId.length) {
    console.log(`  ${landed.messageId} carries none of the approved body, so it is claimed by Message-ID`);
    console.log('  and asserted below. The body selector is UNPROVEN on this run and the count above excludes it.');
  }
  let sawLanded = false;
  for (const { headers, mid } of [...ours, ...byId]) {
    if (mid === landed.messageId) sawLanded = true;
    assertAddresses(`${mid}  ${h1(headers, 'subject').slice(0, 48)}`, headers);
  }
  if (!sawLanded) {
    die(`the sweep did not re-find ${landed.messageId}, the message it was just handed.\n  Its selector is therefore broken, and a clean result would mean nothing. Refusing to report one.`);
  }
  return ours.length;
}

// =========================================================================
// main
// =========================================================================
const mk = attributionMarkers();
let ep11 = null, ep10 = null, swept = null;

if (!EP10_ONLY) {
  const t = target();
  console.log(`EP11 — verifying the send cleared for uid ${t.uid}`);
  console.log(`  approved body   ${t.approvedFile}  (${t.approved.length} bytes)`);
  console.log(`  ledger says     to ${t.to} at ${t.sentAt.toISOString()}`);
  console.log(`  subject sent    ${t.subject}`);
  console.log(`  mailbox         ${SENT_BOX}, read-only, BODY.PEEK`);

  // A stalled socket on camera is a dead take, and Gmail does throttle repeated
  // IMAP logins — measured today, a session opened seconds after the previous
  // one took 18s where the first took 3. connTimeout/authTimeout only cover the
  // handshake, so the whole read gets its own deadline as well.
  // THE LOGIN IS INSIDE THE TRY. It used to sit outside it, so the single most
  // likely failure on a shoot night — a refused or throttled login — threw past
  // the handler and printed a raw node stack trace, which is exactly what the
  // catch below exists to prevent.
  let imap = null;
  try {
    imap = await withDeadline('the IMAP login', connect(credentials()));
    const { name: boxName } = await withDeadline(`opening ${SENT_BOX}`, openSent(imap));
    const { chosen, messageId } = await withDeadline('the search for the landed message', pullLanded(imap, t));

    const emlPath = `${BASE}/sent/${TAG}-landed.eml`;
    const { headers } = splitMessage(chosen.raw);

    console.log('\nprivacy assertion (the bytes that actually left):');
    assertAddresses(`${TAG}-landed.eml`, headers);

    // The diff, over the part that actually carries the approved body. Measured
    // BEFORE the sweep, because the sweep's re-find guard has to know whether
    // this send carries an approved body at all — see sweep().
    const parts = leafParts(chosen.raw);
    let picked = null;
    for (const part of parts) {
      const d = diffBytes(part.content, t.approved);
      if (d) { picked = { part, d }; break; }
    }
    // A pinned Message-ID means the operator has already said which send this
    // is, so a body that does not overlap is a measurement rather than a failed
    // lookup — the EP10 shape, where the send node's body expression resolved
    // empty and only the transport's own bytes left. Measure it and say so.
    if (!picked && PINNED_MID && parts.length === 1) picked = { part: parts[0], d: disjointDiff(parts[0].content, t.approved) };
    if (!picked) {
      die(`${messageId} does not contain the ${t.approved.length} bytes of ${t.approvedFile}.\n  Parts examined: ${parts.map((p) => `${p.path} ${p.contentType} ${p.cte} ${p.content.length}B`).join(', ')}\n  If this really is the send — the body expression resolved empty, say — pin it with\n  --message-id ${messageId} and the diff will report that none of the approved body landed.`);
    }

    swept = await withDeadline('the send-window sweep',
      sweep(imap, t.earliestLedger, knownBodies(), { messageId, contained: picked.d.contained }));

    // The .eml is written alongside the diff, after the clobber guard has run,
    // so a refused run leaves both artifacts from the previous one intact.
    ep11 = { t, messageId, boxName, emlPath, chosen, ...picked };
  } catch (err) {
    imap?.end();
    die(err.message); // a stack trace is not what anyone needs to read at 1am
  } finally {
    imap?.end();
  }
}

if (COMPARE_EP10) ep10 = ep10Section();

// ---- the artifact --------------------------------------------------------
/** One section per message, identical shape, `sfx` distinguishing the labels.
 *  ep11-audit.mjs reads `Diff bytes` and `Diff bytes ep10` out of here with an
 *  anchored `^label\s+(\d+)$`, which is why the ep10 suffix goes on the END of
 *  every label — `Diff bytes` must not also match `Diff bytes ep10`. */
function section(title, sfx, d, rows) {
  const L = (label) => label + sfx;
  raw(title); raw('');
  for (const [k, v] of rows) pair(L(k), v);
  pair(L('Body comparison'), d.how);
  pair(L('Attribution branch'), identifyBranch(Buffer.concat(d.blocks.map(([, b]) => b)), mk));
  raw('');
  const nums = [
    ['Approved body bytes', d.approvedBytes],
    ['Landed body bytes', d.landedBytes],
    ['Approved bytes that landed', d.landedFromApproved],
    ...(d.contained ? d.blocks.map(([, b], i) => [i === 0 ? 'Added before body' : 'Added after body', b.length]) : []),
    ['Removed bytes', d.removed],
    ['Diff bytes', d.added],
    ['Transport CRLF pairs', d.crlf],
  ];
  for (const [k, v] of nums) num(L(k), v);
  measured.push(...nums.map(([k]) => L(k)));
  raw('');
  raw(d.contained
    ? 'THE BYTES THE TRANSPORT ADDED, AFTER THE GATE HAD ALREADY RULED:'
    : 'NONE OF THE APPROVED BODY REACHED THE WIRE. Every byte below was added after');
  if (!d.contained) raw('the gate had already ruled, and nothing the gate cleared is in the message.');
  // Say which space the dump is in. The gate approves LF text and the transport
  // rewrites every line ending to CRLF, so on a normalised match the block below
  // is one byte per line shorter than the wire — and a hexdump captioned as the
  // wire had better be the wire. The rewrite is not lost, it is the count on the
  // Transport CRLF pairs line; this figure is the attribution block alone.
  if (d.contained && d.how !== 'exact') {
    raw(`(Dumped and counted after ${d.how} matching, so each wire CRLF reads as one LF here.`);
    raw(' The line endings the transport rewrote are counted on the Transport CRLF pairs line.)');
  }
  let any = false;
  for (const [where, b] of d.blocks) {
    if (!b.length) continue;
    any = true;
    raw(`  ${where}:`);
    for (const line of hexdump(b, '    ')) raw(line);
  }
  if (!any) raw('  none — this send went out with Append n8n Attribution off.');
  raw('');
}

// ONLY THE CANONICAL ARTIFACT MAY CLAIM THE BARE LABEL. ep11-audit.mjs scans
// every .txt in sent/ and takes the first `Diff bytes  <int>` it finds, so the
// attribution-off retake — which measures 0 by design — must not be able to
// answer for the filmed number just because its filename sorts earlier. A
// non-default --tag suffixes every numeric label with the tag, leaving exactly
// one file in sent/ that carries `Diff bytes` unqualified.
if (ep11) {
  section('EP11 — WHAT LANDED vs WHAT THE GATE APPROVED', TAG === 'ep11' ? '' : ` ${TAG}`, ep11.d, [
    ['Message-ID', ep11.messageId],
    ['Mailbox', `${ep11.boxName} (read-only)`],
    ['Internal date', ep11.chosen.internalDate.toISOString()],
    ['Approved file', `approved/${ep11.t.uid}.txt`],
    ['Landed file', `sent/${TAG}-landed.eml`],
    ['MIME part', `${ep11.part.path}  ${ep11.part.contentType}; charset=${ep11.part.charset}; ${ep11.part.cte}`],
  ]);
}

if (ep10) {
  section('EP10 — THE SAME FEATURE, THE OTHER BRANCH', ' ep10', ep10.d, [
    ['Landed file', 'sent/ep10-first-real-email.eml'],
    ['Approved file', `live-run/${ep10.run}/report.html, minus the style prefix its own node writes`],
    ['MIME part', `${ep10.part.path}  ${ep10.part.contentType}; charset=${ep10.part.charset}; ${ep10.part.cte}`],
  ]);
}

// Render once, at a column measured from the labels this run produced. Two
// spaces is the narrowest gap that still reads as label-whitespace-value to the
// audit's `\s{2,}` scan and to a human at 1am.
const COL = Math.max(0, ...art.filter((e) => e.k === 'pair').map((e) => e.label.length)) + 2;
const lines = art.map((e) => (e.k === 'raw' ? e.s : e.label.padEnd(COL) + e.value));

const diffPath = `${BASE}/sent/${TAG}-diff.txt`;
guardArtifact(diffPath, ep11?.messageId, measured);
fs.mkdirSync(`${BASE}/sent`, { recursive: true });
if (ep11) fs.writeFileSync(ep11.emlPath, ep11.chosen.raw);
fs.writeFileSync(diffPath, lines.join('\n') + '\n');

// ---- what goes on screen -------------------------------------------------
console.log('\n' + '-'.repeat(72));
for (const line of lines) console.log(line);
console.log('-'.repeat(72));
if (ep11) console.log(`wrote ${ep11.emlPath}`);
console.log(`wrote ${diffPath}`);
if (swept !== null) console.log(`swept ${swept} n8n send(s) in the window`);

if (privacyFailures.size) {
  console.error('\n' + '='.repeat(72));
  console.error(`PRIVACY ASSERTION FAILED — ${privacyFailures.size} address(es) are neither RFC 2606 reserved`);
  console.error('nor the operator\'s own. A message left this account for somewhere real.');
  console.error('Do not cut this footage. Find out where it went first.');
  console.error('='.repeat(72));
  process.exit(EXIT_PRIVACY);
}
console.log(`privacy: every From/To/Cc/Bcc/Reply-To address is RFC 2606 reserved or ${P.operator}`);
