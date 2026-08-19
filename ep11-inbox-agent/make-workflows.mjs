/** Generates the three EP11 workflow JSONs from the sealed spec (scripts/ep11-package.json §2/§3).
 *
 *   node scripts/ep11-make-workflows.mjs
 *
 * THIS FILE IS THE SOURCE OF TRUTH FOR EVERY LINE OF jsCode. The workflow JSONs
 * are generated; they are never hand-edited. The recorder types the code out of
 * workflow.json, so what is proven here is what goes on camera.
 *
 * Four things it refuses to emit, each because something broke once:
 *  1. a Code node body containing `fetch(`, `new URL(` or `URL(` — neither global
 *     exists in n8n's Code sandbox, and plain Node (where the dry run compiles)
 *     has both, so the shim would certify code the sandbox cannot execute (B2);
 *  2. a Code node over 18 lines — the gate's line count is a title slot, and a
 *     node that grows past the frame is a retake;
 *  3. a Code node without an explicit execution mode — n8n defaults every Code
 *     node to Run Once for All Items, which silently collapses a per-item chain
 *     to one item and reports 1 instead of 18;
 *  4. any email address that is not on an RFC 2606 reserved name (or Daniel's
 *     own address). Privacy is an assertion, not an intention.
 *
 * Importing this module is side-effect free: it generates and asserts only when
 * run directly, so `ep11-dryrun.mjs --broken` can import BROKEN without
 * rewriting the JSONs underneath itself.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BASE = process.env.EP11_BASE ?? process.cwd();

// NOTE: these are n8n Code-node bodies, transcribed verbatim from the sealed
// spec. $json / $input / $env are n8n runtime globals and the `${B}` template
// slots are evaluated INSIDE n8n — both are intentionally escaped here so the
// generator emits them as literal text rather than interpolating them.
// The node bodies read their base directory from $env.EP11_DIR, so no absolute
// path is ever baked into a workflow JSON.
export const CODE = {};

CODE['normalize'] = `const fs=require('fs'),B=$env.EP11_DIR,m=$json;
const hdr=(k)=>String((m.headers&&(m.headers[k]||m.headers[k.toLowerCase()]))||'').replace(/^[\\w-]+:\\s*/,'').trim();
const addr=(s)=>String(s).match(/[^\\s<>,"]+@[^\\s<>,"]+/)?.[0]?.toLowerCase()||'';
const uid=String(m.attributes?.uid??hdr('message-id')).replace(/[^\\w.-]/g,'_');
const text=String(m.textPlain||m.text||m.textHtml||'')
  .replace(/^>.*$/gm,'')
  .replace(/^On .+ wrote:\\s*$/gm,'')
  .replace(/[ \\t]+/g,' ').replace(/\\n{3,}/g,'\\n\\n').trim().slice(0,4000);
const out={
  uid, messageId:hdr('message-id')||uid,
  from:addr(hdr('from')), replyTo:addr(hdr('reply-to'))||addr(hdr('from')),
  subject:String(m.subject||'').slice(0,200), date:hdr('date'),
  listUnsub:!!hdr('list-unsubscribe'), autoSub:String(hdr('auto-submitted')||'no'),
  text,
};
fs.writeFileSync(\`\${B}/mail/\${uid}.json\`,JSON.stringify(out,null,1));
return {json:out};`;

CODE['prefilter'] = `const fs=require('fs'),B=$env.EP11_DIR,d=$json;
const LED=JSON.parse(fs.readFileSync(\`\${B}/replied.json\`,'utf8'));
const NEVER=/^(no-?reply|donotreply|do-not-reply|bounce|mailer-daemon|postmaster)/i;
const local=d.from.split('@')[0];
let stop=null;
if(d.listUnsub||d.autoSub.toLowerCase()!=='no') stop='NOTICE_BULK';
else if(NEVER.test(local)) stop='NOTICE_NOREPLY';
else if(LED[d.messageId]) stop='DONE_ALREADY_REPLIED';
return {json:{...d,stop,category:stop?'NOTICE':null,confidence:0}};`;

CODE['classify-call'] = `const fs=require('fs'),https=require('https'),B=$env.EP11_DIR,d=$json;
if(d.stop) return {json:d};
const CATS='BOOKING,SUPPORT,PRICING,COLD_PITCH,BILLING,PERSONAL';
const prompt=\`Classify this email. Reply with JSON only: {"category":one of [\${CATS}],\`
  +\`"confidence":0..1,"reason":"one line"}\\n\\nFrom: \${d.from}\\nSubject: \${d.subject}\\n\\n\${d.text}\`;
const res=await new Promise((ok,er)=>{const r=https.request('https://fal.run/fal-ai/any-llm',{method:'POST',headers:{Authorization:'Key '+$env.FAL_KEY,'Content-Type':'application/json'}},s=>{let x='';s.on('data',c=>x+=c);s.on('end',()=>ok({h:s.headers,d:x}))});r.on('error',er);r.end(JSON.stringify({model:'meta-llama/llama-4-scout',prompt}))});
fs.writeFileSync(\`\${B}/raw/\${d.uid}-classify.json\`,res.d);
fs.appendFileSync(\`\${B}/receipts.jsonl\`,JSON.stringify({uid:d.uid,call:'classify',units:res.h['x-fal-billable-units']||null,at:new Date().toISOString()})+'\\n');
let o={},j={};try{o=JSON.parse(res.d)}catch(e){}
try{j=JSON.parse(String(o.output||'').match(/\\{[\\s\\S]*\\}/)?.[0]||'{}')}catch(e){}
return {json:{...d,category:j.category||'PERSONAL',confidence:Number(j.confidence)||0,reason:String(j.reason||'').slice(0,160)}};`;

CODE['draft-call'] = `const fs=require('fs'),https=require('https'),B=$env.EP11_DIR,d=$json;
if(d.stop||!['BOOKING','SUPPORT'].includes(d.category)) return {json:d};
const KB=fs.readFileSync(\`\${B}/knowledge.md\`,'utf8');
const prompt=\`You reply to email using ONLY the facts below. If the answer is not \`
  +\`there, say you will follow up — invent nothing.\\n\\n=== FACTS ===\\n\${KB}\\n=== END ===\\n\\n\`
  +\`Email from \${d.from}:\\nSubject: \${d.subject}\\n\${d.text}\\n\\n\`
  +\`Reply with JSON only: {"reply":"...","facts":["exact sentence copied from FACTS", ...]}\`;
const res=await new Promise((ok,er)=>{const r=https.request('https://fal.run/fal-ai/any-llm',{method:'POST',headers:{Authorization:'Key '+$env.FAL_KEY,'Content-Type':'application/json'}},s=>{let x='';s.on('data',c=>x+=c);s.on('end',()=>ok({h:s.headers,d:x}))});r.on('error',er);r.end(JSON.stringify({model:'meta-llama/llama-4-scout',prompt}))});
fs.writeFileSync(\`\${B}/raw/\${d.uid}-draft.json\`,res.d);
fs.appendFileSync(\`\${B}/receipts.jsonl\`,JSON.stringify({uid:d.uid,call:'draft',units:res.h['x-fal-billable-units']||null,at:new Date().toISOString()})+'\\n');
let o={},j={};try{o=JSON.parse(res.d)}catch(e){}
try{j=JSON.parse(String(o.output||'').match(/\\{[\\s\\S]*\\}/)?.[0]||'{}')}catch(e){}
return {json:{...d,to:d.from,parsed:!!j.reply,draft:{reply:String(j.reply||''),facts:Array.isArray(j.facts)?j.facts.map(String):[]}}};`;

CODE['send-gate'] = `const fs=require('fs'),B=$env.EP11_DIR,d=$json,b=d.draft?.reply||'',F=d.draft?.facts||[];
const KB=fs.readFileSync(\`\${B}/knowledge.md\`,'utf8'),LED=JSON.parse(fs.readFileSync(\`\${B}/replied.json\`,'utf8'));
const QUOTE=KB.split('\\n').filter((l)=>!/^\\s*(#|INTERNAL:|TODO)/.test(l)).join('\\n');
const strip=(s)=>s.replace(/\\d{4}-\\d{2}-\\d{2}(T[\\d:.]+Z?)?/g,' ').replace(/\\bv?\\d+\\.\\d+(\\.\\d+)?\\b/g,' ').replace(/llama-[\\w.-]+/gi,' ');
const tok=(s)=>strip(s).match(/\\$?\\d[\\d,.]*%?|https?:\\/\\/[^\\s"'<>)]+/g)||[];
const src=strip(F.join(' ')+' '+(d.text||''));
const RULES=[
  ['CATEGORY_NOT_SENDABLE',()=>['BOOKING','SUPPORT'].includes(d.category)],
  ['LOW_CONFIDENCE',       ()=>d.confidence>=0.75],
  ['NO_FACTS_CITED',       ()=>F.length>0],
  ['FACT_NOT_IN_KB',       ()=>F.every((f)=>KB.includes(f.trim()))],
  ['FACT_NOT_QUOTABLE',    ()=>F.every((f)=>QUOTE.includes(f.trim()))],
  ['UNSUPPORTED_TOKEN',    ()=>tok(b).every((t)=>src.includes(t))],
  ['RECIPIENT_MISMATCH',   ()=>d.to===d.from],
  ['ALREADY_REPLIED',      ()=>!LED[d.messageId]]];
const rule=d.stop||(RULES.find(([,ok])=>!ok())||[null])[0],verdict=rule?'BLOCKED':'SEND';
fs.appendFileSync(\`\${B}/decisions.jsonl\`,JSON.stringify({uid:d.uid,messageId:d.messageId,from:d.from,category:d.category,confidence:d.confidence,parsed:!!d.parsed,verdict,rule,at:new Date().toISOString()})+'\\n');
return {json:{...d,verdict,rule}};`;

CODE['digest'] = `const fs=require('fs'),B=$env.EP11_DIR,items=$input.all().map(i=>i.json);
const by=(k)=>items.reduce((a,x)=>(a[x[k]||'none']=(a[x[k]||'none']||0)+1,a),{});
const sent=items.filter(x=>x.verdict==='SEND');
const lines=[
  \`messages: \${items.length}\`,\`sendable: \${sent.length}\`,
  \`blocked by rule: \${JSON.stringify(by('rule'))}\`,\`by category: \${JSON.stringify(by('category'))}\`,
  '','THIS GATE CANNOT VERIFY:',
  '- whether the sender is who they say they are',
  '- whether a plausible-sounding request is a real one',
  '- anything the transport adds after this node runs'];
fs.writeFileSync(\`\${B}/digest.txt\`,lines.join('\\n'));
fs.appendFileSync(\`\${B}/digests.log\`,\`=== \${new Date().toISOString()}\\n\${lines.join('\\n')}\\n\`);
return $input.all();`;

CODE['outbox'] = `const fs=require('fs'),B=$env.EP11_DIR,ME=$env.EP11_OPERATOR;
if($env.EP11_MODE!=='live') return [];
const LED=JSON.parse(fs.readFileSync(\`\${B}/replied.json\`,'utf8'));
const out=[{json:{to:ME,replyTo:ME,subject:\`EP11 run — \${new Date().toISOString()}\`,body:fs.readFileSync(\`\${B}/digest.txt\`,'utf8')}}];
for(const {json:d} of $input.all()){
  if(d.verdict!=='SEND'||LED[d.messageId]) continue;
  LED[d.messageId]={to:d.to,at:new Date().toISOString()};
  fs.writeFileSync(\`\${B}/approved/\${d.uid}.txt\`,d.draft.reply);
  out.push({json:{to:d.to,replyTo:ME,subject:\`Re: \${d.subject}\`,body:d.draft.reply,uid:d.uid}});
}
fs.writeFileSync(\`\${B}/replied.json\`,JSON.stringify(LED,null,1));
return out;`;

// The batch/rehearsal head. Not in the camera workflow: it REPLAYS a fetch that
// already happened, so a retake can rerun the chain without touching the server.
// It replaces the IMAP trigger AND `normalize`, because `normalize` is the one
// and only writer of mail/ (B10) and re-running it over its own output would
// corrupt the corpus. An empty mail/ throws rather than reporting a vacuous zero.
CODE['read-mail-dir'] = `const fs=require('fs'),B=$env.EP11_DIR,dir=\`\${B}/mail\`;
const files=fs.readdirSync(dir).filter((f)=>f.endsWith('.json')).sort();
if(!files.length) throw new Error('mail/ is empty — replay needs a real fetch first (B10)');
return files.map((f)=>({json:JSON.parse(fs.readFileSync(\`\${dir}/\${f}\`,'utf8'))}));`;

// ---- the BROKEN variant typed first on camera -----------------------------
// The before/after at beat 2:04 depends on this actually failing, so it is
// derived from the shipped gate by removing exactly one repair — strip() — and
// nothing else. This is the exact string the recorder types. Both the pre-strip
// and post-strip counts come from FILMED runs (B9); --broken exists only as a
// pre-flight compile-and-behaviour proof against the rehearsal corpus, the same
// shape ep10-make-workflows.mjs:141-144 already shipped.
export const BROKEN = {
  'send-gate': CODE['send-gate']
    .split('\n')
    .filter((l) => !l.startsWith('const strip='))
    .join('\n')
    .replace('const tok=(s)=>strip(s).match(', 'const tok=(s)=>s.match(')
    .replace("const src=strip(F.join(' ')+' '+(d.text||''));", "const src=F.join(' ')+' '+(d.text||'');"),
};

// ---- node builders -------------------------------------------------------
let seq = 0;
const nid = () => 'e1100000-0000-4000-8000-' + String(++seq).padStart(12, '0');

export const ALL = 'runOnceForAllItems';
export const EACH = 'runOnceForEachItem';

/** Every Code node states its mode EXPLICITLY. n8n's default is runOnceForAllItems
 *  and it is silent about it: a per-item chain collapses to one item and a batch
 *  of eighteen reports one. `mode` is never omitted here, not even when it equals
 *  the default. */
const codeNode = (name, x, mode) => {
  if (mode !== ALL && mode !== EACH) throw new Error(`node "${name}" has no explicit mode`);
  return {
    parameters: { mode, jsCode: CODE[name] },
    id: nid(),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [x, 300],
  };
};

// Credential "gmail-imap" is created in the n8n UI OFF CAMERA
// (pre-flight 2 — the credential modal renders the password in clear while
// typing). The id below is a placeholder, replaced at import time; this file
// creates no credential and stores no secret.
const imapTrigger = () => ({
  parameters: {
    mailbox: 'EP11', // the privacy boundary, and a hold shot. Never INBOX.
    postProcessAction: 'nothing',
    format: 'resolved',
    downloadAttachments: false, // hidden while format=resolved; stated anyway
    options: {
      customEmailConfig: '["ALL"]',
      forceReconnect: 10,
      // "Fetch Only New Emails". ON for the first listen, toggled OFF on camera
      // for the second. typeVersion 2.1 is what makes the SINCE branch reachable
      // (EmailReadImapV2.node.js:345-346 guards on node.typeVersion > 2).
      trackLastMessageId: true,
    },
  },
  id: nid(),
  name: 'Email Trigger (IMAP)',
  type: 'n8n-nodes-base.emailReadImap',
  typeVersion: 2.1,
  position: [200, 300],
  credentials: { imap: { id: 'IMAP_CRED_ID', name: 'gmail-imap' } },
});

// THE ONLY SEND NODE IN THE WORKFLOW, AND IT IS TERMINAL (B3, B12). The only
// node upstream of it returns [] unless EP11_MODE=live, so in a dry run it does
// not execute at all — not "sends somewhere safe", does not execute.
// emailFormat is PINNED to text: createUtmCampaignLink() runs only on the html
// branch (send.operation.js:200-215), so what lands here is the plain-text
// attribution block ending in a bare https://n8n.io — no UTM, no anchor (B11).
// "Append n8n Attribution" is deliberately left at its default (on) for the
// first send. That is the point; it is toggled off on camera after the diff.
const sendEmail = (x) => ({
  parameters: {
    fromEmail: 'Ships Itself <you@example.com>',
    toEmail: '={{ $json.to }}',
    subject: '={{ $json.subject }}',
    emailFormat: 'text',
    text: '={{ $json.body }}',
    options: { replyTo: '={{ $json.replyTo }}' },
  },
  id: nid(),
  name: 'Send reply',
  type: 'n8n-nodes-base.emailSend',
  typeVersion: 2.1,
  position: [x, 300],
  credentials: { smtp: { id: 'SMTP_CRED_ID', name: 'gmail-smtp' } },
});

const manualTrigger = (name) => ({
  parameters: {},
  id: nid(),
  name,
  type: 'n8n-nodes-base.manualTrigger',
  typeVersion: 1,
  position: [200, 300],
});

// Strictly linear. No IF, no Switch: both need a second output connection and the
// recorder cannot drag vue-flow edges. Branching is replaced by writing decisions
// to disk and reading them back, which idempotency required anyway.
export const CHAIN = [
  ['normalize', EACH], ['prefilter', EACH], ['classify-call', EACH], ['draft-call', EACH],
  ['send-gate', EACH], ['digest', ALL], ['outbox', ALL],
];
export const BATCH_CHAIN = [['read-mail-dir', ALL], ...CHAIN.slice(1)];

const link = (nodes) => {
  const c = {};
  for (let i = 0; i < nodes.length - 1; i++) {
    c[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
  }
  return c;
};

const build = (name, head, chain, tail) => {
  seq = 0;
  const body = chain.map(([n, mode], i) => codeNode(n, 420 + i * 220, mode));
  const nodes = [head(), ...body, ...(tail ? [tail(420 + chain.length * 220)] : [])];
  return { name, nodes, connections: link(nodes), settings: { executionOrder: 'v1' } };
};

/** Exported for the recorder and the dry run: name, type, mode, jsCode and
 *  params, in chain order. The JSONs below are derived from exactly this. */
export const NODES = [
  { name: 'Email Trigger (IMAP)', type: 'n8n-nodes-base.emailReadImap', mode: null, jsCode: null, params: imapTrigger().parameters },
  ...CHAIN.map(([name, mode]) => ({ name, type: 'n8n-nodes-base.code', mode, jsCode: CODE[name], params: null })),
  { name: 'Send reply', type: 'n8n-nodes-base.emailSend', mode: null, jsCode: null, params: sendEmail(0).parameters },
];

// ---- generate + assert (only when run directly) --------------------------
function main() {
  const camera = build('Inbox Agent (ep11)', imapTrigger, CHAIN, sendEmail);
  // No send node on the replay heads, following EP10's batch precedent: a retake
  // must never be able to transmit in an episode whose thesis is that the agent
  // is not allowed to press send, and `n8n execute` has no SMTP credential to
  // resolve on the CLI path.
  const batch = build('Inbox Agent — mail/ replay (ep11)', () => manualTrigger('When clicking Execute'), BATCH_CHAIN, null);
  const rehearsal = JSON.parse(JSON.stringify(batch));
  rehearsal.name = 'Inbox Agent — CLI rehearsal (ep11)';

  const FILES = [['workflow.json', camera], ['workflow-batch.json', batch], ['workflow-rehearsal.json', rehearsal]];
  for (const [file, wf] of FILES) {
    fs.writeFileSync(`${BASE}/${file}`, JSON.stringify(wf, null, 2) + '\n');
    console.log(file.padEnd(26), String(wf.nodes.length).padStart(2), 'nodes');
  }

  let failed = 0;
  const fail = (msg) => { failed++; console.log('  ✗', msg); };

  // 1. line counts ---------------------------------------------------------
  console.log('\nline counts (cap 18):');
  const bodies = [...Object.entries(CODE), ['send-gate/BROKEN', BROKEN['send-gate']]];
  for (const [name, src] of bodies) {
    const n = src.split('\n').length;
    console.log(' ', name.padEnd(18), String(n).padStart(2), n > 18 ? '  ✗ OVER CAP' : '');
    if (n > 18) failed++;
  }
  console.log('  gate lines:', CODE['send-gate'].split('\n').length, '(the title slot; never hardcoded)');

  // 2. no fetch / no URL (B2) ---------------------------------------------
  // Neither global exists in n8n's Code sandbox. Both exist in plain Node, which
  // is where the dry run compiles — so without this assertion the shim goes
  // green on code that dies on camera.
  const BANNED = /\bfetch\s*\(|\bnew\s+URL\s*\(|\bURL\s*\(/;
  console.log('\nsandbox-global assertion (fetch / new URL / URL):');
  let banned = 0;
  for (const [name, src] of bodies) {
    const hit = src.match(BANNED);
    if (hit) { banned++; fail(`${name} contains ${hit[0]} — use require('https') + a manual Promise`); }
  }
  if (!banned) console.log("  none in", bodies.length, "bodies — every HTTP call goes through require('https')");

  // 3. explicit mode on every Code node ------------------------------------
  console.log('\nexecution mode, per generated Code node:');
  for (const [file, wf] of FILES) {
    for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
      if (n.parameters.mode !== ALL && n.parameters.mode !== EACH) fail(`${file}: ${n.name} has no explicit mode`);
    }
  }
  for (const [name, mode] of [['read-mail-dir', ALL], ...CHAIN]) console.log(' ', name.padEnd(18), mode);

  // 4. privacy: every address on an RFC 2606 reserved name -----------------
  // The policy lives in personas.json so the seeder (Python) and this generator
  // (JS) read the same list. It cannot be widened from that file: the declared
  // values are checked against the hard-coded RFC 2606 set below.
  const P = JSON.parse(fs.readFileSync(`${BASE}/personas.json`, 'utf8'));
  for (const d of P.allowed_domains) if (!RFC2606_DOMAINS.includes(d)) fail(`personas.json allows "${d}", which is not RFC 2606 reserved`);
  for (const t of P.allowed_tlds) if (!RFC2606_TLDS.includes(t)) fail(`personas.json allows TLD ".${t}", which is not RFC 2606 reserved`);

  const check = (where, text) => {
    for (const a of new Set(text.match(ADDR) || [])) {
      if (!isReserved(a, P) && !isOperator(a, P)) fail(`${where}: "${a}" is neither RFC 2606 reserved nor the operator address`);
    }
  };
  console.log('\nprivacy assertion (RFC 2606 reserved names, plus the operator address):');
  check('personas.json', JSON.stringify(P));
  check('knowledge.md', fs.readFileSync(`${BASE}/knowledge.md`, 'utf8'));
  for (const [file] of FILES) check(file, fs.readFileSync(`${BASE}/${file}`, 'utf8'));
  console.log('  personas:', P.personas.length, '· every persona address reserved:', P.personas.every((p) => isReserved(p.email, P)));
  console.log('  allowed:', P.allowed_domains.join(', '), '+ any name under .' + P.allowed_tlds.join(' / .'));
  const unchecked = P.personas.filter((p) => !p.name_checked).map((p) => p.id);
  if (unchecked.length) console.log('  ⚠ name_checked=false:', unchecked.join(', '), '— privacy layer 5 wants each name searched once before the shoot');

  // 5. what the generated files must not contain ---------------------------
  const all = FILES.map(([f]) => fs.readFileSync(`${BASE}/${f}`, 'utf8')).join('');
  console.log('\ngenerated-file greps:');
  console.log('  "/Users/":        ', all.includes('/Users/'), ' (node bodies read $env.EP11_DIR)');
  console.log('  "you@example.com": ', all.includes('you@example.com'), ' (fromEmail on the terminal send node, by design)');
  console.log('  key-shaped string:', /(Key\s+[A-Za-z0-9_-]{12,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{16})/.test(all), ' · $env.FAL_KEY referenced:', all.includes('$env.FAL_KEY'));
  if (all.includes('/Users/')) fail('a generated workflow contains an absolute path — node bodies must use $env.EP11_DIR');

  console.log(failed ? `\n${failed} ASSERTION(S) FAILED` : '\nall assertions passed');
  process.exit(failed ? 1 : 0);
}

// ---- the address policy, shared with scripts/ep11-seed.py ----------------
export const RFC2606_DOMAINS = ['example.com', 'example.net', 'example.org'];
export const RFC2606_TLDS = ['example', 'test', 'invalid'];
export const ADDR = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export const isOperator = (a, P) => a.toLowerCase().replace(/\+[^@]*@/, '@') === P.operator.toLowerCase();
export const isReserved = (a, P) => {
  const dom = (a.toLowerCase().split('@')[1] || '');
  return P.allowed_domains.some((d) => dom === d || dom.endsWith('.' + d)) ||
    P.allowed_tlds.includes(dom.split('.').pop());
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
