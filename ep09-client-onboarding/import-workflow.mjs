/** Headless pre-flight: login → import workflow.json → activate → print form URL.
 * Idempotent: if "Client Onboarding (ep09)" exists, it is updated in place. */
import fs from 'node:fs';

const BASE = 'http://localhost:5678';
const DIR = '/Users/danielmester/Documents/Youtube/builds/ep09-client-onboarding';

const login = await fetch(`${BASE}/rest/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ emailOrLdapLoginId: 'owner@shipsitself.local', password: 'ShipsItself2026!' }),
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
