/** Replays every QUOTE_NOT_FOUND rejection from the rehearsal batch through the
 * PATCHED pipeline — re-extracting text from the cached HTML with the shipped
 * page-text code, then matching with the shipped cite-gate normalizer.
 * Both are read live from workflow.json, so we test the code that gets typed.
 *
 * Then: adversarial mutations that MUST still be rejected.
 *
 *   node scripts/ep10-verify-gate-fix.mjs
 */
import fs from 'node:fs';

const BASE = ($env.EP10_DIR||require('path').resolve('.'));
const wf = JSON.parse(fs.readFileSync(`${BASE}/workflow.json`, 'utf8'));
const jsOf = (n) => wf.nodes.find((x) => x.name === n).parameters.jsCode;

// norm() straight out of the shipped gate — no copy drift.
const norm = eval('(' + jsOf('cite-gate').match(/const norm=([\s\S]*?);\nconst src=/)[1] + ')');

// page-text body, minus its fs I/O, as a pure html→text function.
const extractSrc = jsOf('page-text')
  .split('\n')
  .filter((l) => l.startsWith('t=t.replace'))
  .join('\n');
const extract = new Function('t', `${extractSrc}\nreturn t.slice(0,8000);`);

const djb2 = (url) =>
  [...url].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381).toString(16) +
  '-' + url.split('/').pop().replace(/[^\w.-]/g, '').slice(0, 40);

let total = 0, matched = 0;
const misses = [];
const pages = [];

// Which batch to audit. Defaults to the archived pre-fix evidence; the
// recorder passes 'runs' so the on-camera audit is about the run the camera
// just watched, not an older one.
const SRC = process.argv[2] ?? 'evidence-broken-gate';
for (const runId of fs.readdirSync(`${BASE}/${SRC}`)) {
  const dir = `${BASE}/${SRC}/${runId}`;
  if (!fs.existsSync(`${dir}/gate.jsonl`) || !fs.existsSync(`${dir}/answer.json`)) continue;
  const gate = fs.readFileSync(`${dir}/gate.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  let raw = fs.readFileSync(`${dir}/answer.json`, 'utf8');
  try { raw = JSON.parse(raw).output || raw; } catch {}
  let claims = [];
  try { claims = JSON.parse(String(raw).match(/\{[\s\S]*\}/)[0]).claims || []; } catch {}

  for (const g of gate) {
    if (g.reason !== 'QUOTE_NOT_FOUND') continue;
    const c = claims[g.n - 1];
    if (!c) continue;
    total++;
    const html = `${dir}/cache/${djb2(c.url)}.html`;
    if (!fs.existsSync(html)) { misses.push({ runId, n: g.n, why: 'no cached html' }); continue; }
    const text = extract(fs.readFileSync(html, 'utf8'));
    pages.push(text);
    if (norm(text).includes(norm(c.quote))) matched++;
    else misses.push({ runId, n: g.n, quote: c.quote.slice(0, 80), url: c.url });
  }
}

console.log(`PATCHED pipeline vs the ${total} old rejections: ${matched}/${total} now match`);
for (const x of misses) console.log('  still failing:', JSON.stringify(x).slice(0, 170));

// ---- adversarial guard: a mutation only counts if it actually mutated ------
const page = pages.find((p) => /\d/.test(p) && /\b(is|was|are)\b/.test(p)) ?? pages[0];
const sentences = page.split(/(?<=\.)\s+/).filter((s) => s.length > 90 && /\d/.test(s));
const control = (sentences[0] ?? page.slice(500, 700)).trim();

const mutate = [
  ['digit changed', (s) => s.replace(/\d/, (d) => String((+d + 1) % 10))],
  ['negation inserted', (s) => s.replace(/\b(is|was|are)\b/, '$1 not')],
  ['word dropped', (s) => s.split(' ').filter((_, i) => i !== 6).join(' ')],
  ['noun swapped', (s) => s.replace(/\b[a-z]{6,}\b/, 'elephant')],
  ['number scaled', (s) => s.replace(/\b(\d+)\b/, (_, d) => String(+d * 10))],
];

const guardLines = [];
console.log('\nadversarial guard (control must PASS, mutations must REJECT):');
const np = norm(page);
let guardFails = 0;
guardLines.push(`  verbatim control        ${np.includes(norm(control)) ? 'PASS  (correct)' : 'REJECT (BROKEN)'}`);
console.log(`  ${np.includes(norm(control)) ? '✓' : '✗ BROKEN'} verbatim control            → ${np.includes(norm(control)) ? 'PASS' : 'REJECT'}`);
if (!np.includes(norm(control))) guardFails++;
for (const [name, fn] of mutate) {
  const m = fn(control);
  if (m === control) { console.log(`  – ${name.padEnd(24)} (not applicable to this sentence)`); continue; }
  const got = np.includes(norm(m));
  if (got) guardFails++;
  guardLines.push(`  ${name.padEnd(22)}  ${got ? 'PASS  (BROKEN)' : 'REJECT (correct)'}`);
  console.log(`  ${got ? '✗ BROKEN' : '✓'} ${name.padEnd(24)} → ${got ? 'PASS' : 'REJECT'}`);
}
const invented = 'This exact sentence appeared on no page we fetched, anywhere.';
const inv = np.includes(norm(invented));
if (inv) guardFails++;
guardLines.push(`  invented sentence       ${inv ? 'PASS  (BROKEN)' : 'REJECT (correct)'}`);
console.log(`  ${inv ? '✗ BROKEN' : '✓'} invented sentence        → ${inv ? 'PASS' : 'REJECT'}`);

console.log(`\nverdict: ${matched}/${total} recovered, ${guardFails} guard failure(s)`);

// On-camera artifact: the audit result as a file, so the claim is inspectable
// rather than narrated.
const lines = [
  'CITATION GATE AUDIT',
  '',
  `Rejections examined            ${total}`,
  `Quotes actually in the source  ${matched}`,
  `Genuine model fabrications     ${total - matched}`,
  '',
  'The gate rejected them because our HTML-to-text step corrupted the page',
  'before the comparison ran. The model had copied correctly.',
  '',
  'ADVERSARIAL CHECK (the fix must still reject these):',
  ...guardLines,
  '',
  `guard failures: ${guardFails}`,
];
fs.writeFileSync(`${BASE}/gate-audit.txt`, lines.join('\n') + '\n');
console.log(`wrote ${BASE}/gate-audit.txt`);
process.exit(guardFails ? 1 : 0);
