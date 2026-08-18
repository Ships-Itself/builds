/** Headless pre-flight: login → import workflow.json → activate → print form URL.
 * Idempotent: if "Client Onboarding (ep09)" exists, it is updated in place.
 *
 * Config, all from the environment — nothing is hard-coded:
 *   N8N_URL       n8n base URL          (default http://localhost:5678)
 *   N8N_USER      n8n owner email       (required)
 *   N8N_PASSWORD  n8n owner password    (required)
 *   EP09_DIR      this folder           (default: the folder this script is in)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.N8N_URL ?? 'http://localhost:5678';
const DIR = process.env.EP09_DIR ?? path.dirname(fileURLToPath(import.meta.url));

const USER = process.env.N8N_USER;
const PASSWORD = process.env.N8N_PASSWORD;
if (!USER || !PASSWORD) {
  throw new Error('Set N8N_USER and N8N_PASSWORD to your n8n owner account before running this.');
}

const login = await fetch(`${BASE}/rest/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ emailOrLdapLoginId: USER, password: PASSWORD }),
});
if (!login.ok) throw new Error(`login ${login.status}: ${await login.text()}`);
const cookie = login.headers.get('set-cookie').split(';')[0];
const H = { 'Content-Type': 'application/json', Cookie: cookie, 'browser-id': 'ep09-preflight' };

const wf = JSON.parse(fs.readFileSync(`${DIR}/workflow.json`, 'utf8'));

const listRes = await fetch(`${BASE}/rest/workflows?filter=${encodeURIComponent(JSON.stringify({ name: wf.name }))}`, { headers: H });
const list = await listRes.json();
const existing = (list.data?.count ? list.data.data : list.data || []).find?.((w) => w.name === wf.name)
  ?? (Array.isArray(list.data) ? null : null);

let id;
if (existing) {
  id = existing.id;
  const cur = await (await fetch(`${BASE}/rest/workflows/${id}`, { headers: H })).json();
  const upd = await fetch(`${BASE}/rest/workflows/${id}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, versionId: cur.data.versionId }),
  });
  if (!upd.ok) throw new Error(`update ${upd.status}: ${await upd.text()}`);
  console.log('updated existing workflow', id);
} else {
  const create = await fetch(`${BASE}/rest/workflows`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, active: false }),
  });
  const cj = await create.json();
  if (!create.ok) throw new Error(`create ${create.status}: ${JSON.stringify(cj)}`);
  id = cj.data.id;
  console.log('created workflow', id);
}

const act = await fetch(`${BASE}/rest/workflows/${id}/activate`, { method: 'PATCH', headers: H }).catch(() => null);
if (!act || !act.ok) {
  // older route: PATCH workflow {active:true}
  const cur = await (await fetch(`${BASE}/rest/workflows/${id}`, { headers: H })).json();
  const upd = await fetch(`${BASE}/rest/workflows/${id}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ active: true, versionId: cur.data.versionId }),
  });
  console.log('activate via patch:', upd.status, (await upd.json()).data?.active);
} else {
  console.log('activated:', (await act.json()).data?.active);
}

const hook = wf.nodes.find((n) => n.type === 'n8n-nodes-base.formTrigger').webhookId;
console.log('WORKFLOW_ID=' + id);
console.log('FORM_URL=' + `${BASE}/form/${hook}`);
