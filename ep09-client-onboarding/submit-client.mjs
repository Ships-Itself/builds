/** Opens the production intake form, types a client like a human, submits,
 * then polls the client dir until all artifacts exist.
 * Logs t0 (form interactive) / tSubmit / tDone — the episode's two clocks.
 *
 * Usage: node submit-client.mjs <clientIndex 0|1|2> [--fast]
 *   --fast: no human typing delays (pre-flight only, not for camera timing)
 *
 * Config, all from the environment — nothing is hard-coded:
 *   EP09_DIR       this folder     (default: the folder this script is in)
 *   N8N_URL        n8n base URL    (default http://localhost:5678)
 *   EP09_FORM_URL  the form's Production URL
 *                  (default: N8N_URL + /form/ + the webhookId in workflow.json,
 *                   which is what import-workflow.mjs prints)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = process.env.EP09_DIR ?? path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.N8N_URL ?? 'http://localhost:5678';
const FORM_URL = process.env.EP09_FORM_URL ?? (() => {
  const wf = JSON.parse(fs.readFileSync(path.join(DIR, 'workflow.json'), 'utf8'));
  const trigger = wf.nodes.find((n) => n.type === 'n8n-nodes-base.formTrigger');
  return `${BASE}/form/${trigger.webhookId}`;
})();

const CLIENTS = [
  {
    company: 'Maple Street Studio',
    contact: 'Rowan Ellis',
    email: 'rowan@maple-street.test',
    project: 'Automation retainer',
    kickoff: '2026-08-24',
    goal: 'Stop losing new client emails. Every inquiry should get a same-day reply and land in one list we actually check.',
  },
  {
    company: 'Acme/West Coast Consulting',
    contact: 'Dana Whitfield',
    email: 'dana@acme-west.test',
    project: 'Ongoing support',
    kickoff: '2026-08-26',
    goal: 'Our reporting is copy-paste from four tools. We want one weekly report that builds itself.',
  },
  {
    company: 'Northwind Legal',
    contact: 'Priya Nair',
    email: 'priya@northwind-legal.test',
    project: 'Website build',
    kickoff: '2026-09-01',
    goal: 'A site that answers the ten questions every client asks, so intake calls start at question eleven.',
  },
];

const idx = Number(process.argv[2] ?? 0);
const FAST = process.argv.includes('--fast');
const c = CLIENTS[idx];
if (!c) throw new Error('client index 0..2');

const slug = c.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const clientDir = path.join(DIR, 'clients', slug);
const expected = ['welcome.md', 'contract.html', 'kickoff.ics', 'tasks.md'];

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const type = async (sel, text) => {
  await page.click(sel);
  if (FAST) await page.fill(sel, text);
  else await page.type(sel, text, { delay: 55 + Math.floor(Math.random() * 30) });
};

await page.goto(FORM_URL, { waitUntil: 'networkidle' });
const t0 = Date.now();
console.log('t0: form interactive');

// n8n form inputs are named field-0..field-N in field order
await type('[name="field-0"]', c.company);
await type('[name="field-1"]', c.contact);
await type('[name="field-2"]', c.email);
await page.selectOption('[name="field-3"]', c.project).catch(async () => {
  // dropdown may render as a custom select — fall back to click flow
  await page.click('[name="field-3"], .select-input, [data-test-id="form-field-dropdown"]');
  await page.click(`text="${c.project}"`);
});
await page.fill('[name="field-4"]', c.kickoff);
await type('[name="field-5"]', c.goal);

await page.click('button[type="submit"]');
const tSubmit = Date.now();
console.log(`tSubmit: +${((tSubmit - t0) / 1000).toFixed(1)}s (typing time)`);

// wait for completion page
await page.waitForSelector('text=Onboarding complete', { timeout: 20000 }).catch(() => console.log('completion text not matched (check form ending)'));

// poll disk until all expected files exist (+ crm.csv contains the company)
const crm = path.join(DIR, 'crm', 'crm.csv');
let tDone = null;
for (let i = 0; i < 120; i++) {
  const filesOk = expected.every((f) => fs.existsSync(path.join(clientDir, f)));
  const crmOk = fs.existsSync(crm) && fs.readFileSync(crm, 'utf8').includes(c.company);
  if (filesOk && crmOk) { tDone = Date.now(); break; }
  await new Promise((r) => setTimeout(r, 250));
}

if (tDone) {
  console.log(`tDone: machine ${(tDone - tSubmit) / 1000}s after submit · ${((tDone - t0) / 1000).toFixed(1)}s including typing`);
  console.log('files:', fs.readdirSync(clientDir).join(', '));
} else {
  console.log('TIMEOUT waiting for artifacts. clients/ tree:');
  console.log(fs.readdirSync(path.join(DIR, 'clients'), { recursive: true }).join('\n'));
}
await browser.close();
