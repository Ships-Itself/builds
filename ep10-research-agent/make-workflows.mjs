/** Generates the three EP10 workflow JSONs from the sealed spec (scripts/ep10-package.json).
 * Node code lives here as the single source of truth; the recorder types it from workflow.json. */
import fs from 'node:fs';

const BASE = ($env.EP10_DIR||require('path').resolve('.'));

// NOTE: these are n8n Code-node bodies. $json/$env/$input are n8n runtime globals,
// intentionally left as literal text (they are not interpolated here).
const CODE = {};

CODE['run-init'] = `// One run folder per question. Everything about this run lands here.
const fs=require('fs'),path=require('path');
const BASE='${BASE}';
const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+Math.random().toString(36).slice(2,6);
const dir=path.join(BASE,'runs',id);
fs.mkdirSync(path.join(dir,'cache'),{recursive:true});
const q=$json['Research question'],to=$json['Email the report to'];
fs.writeFileSync(path.join(dir,'meta.json'),JSON.stringify({id,q,to}));
return {json:{id,dir,q,to}};`;

CODE['plan-call'] = `// Call 1: ask the model which sources it WANTS. It does not get to fetch them.
const fs=require('fs'),https=require('https');
const {id,dir,q,to}=$json;
const prompt='Propose up to 5 source URLs that answer: '+q+'\\nONLY from these domains: en.wikipedia.org, developer.mozilla.org, docs.python.org, datatracker.ietf.org.\\nReply with a JSON array of URLs only.';
const res=await new Promise((ok,er)=>{const r=https.request('https://fal.run/fal-ai/any-llm',{method:'POST',headers:{Authorization:'Key '+$env.FAL_KEY,'Content-Type':'application/json'}},s=>{let d='';s.on('data',c=>d+=c);s.on('end',()=>ok({h:s.headers,d}))});r.on('error',er);r.end(JSON.stringify({model:'meta-llama/llama-4-scout',prompt}))});
fs.writeFileSync(dir+'/plan.json',res.d);
fs.appendFileSync(dir+'/receipts.jsonl',JSON.stringify({call:'plan',units:res.h['x-fal-billable-units']||null,at:Date.now()})+'\\n');
let out=res.d;try{out=JSON.parse(res.d).output||res.d}catch(e){}
return {json:{id,dir,q,to,plan:String(out)}};`;

CODE['split-urls'] = `// The security line: the allowlist is enforced HERE, in code. The model never picks a fetch target.
const ALLOW=['en.wikipedia.org','developer.mozilla.org','docs.python.org','datatracker.ietf.org'];
const out=[];
for(const {json:j} of $input.all()){
 const found=(j.plan.match(/https?:\\/\\/[^\\s"')\\]]+/g)||[]).map(u=>u.replace(/[.,)\\]]+$/,''));
 const host=u=>u.replace(/^https?:\\/\\//i,'').split(/[/?#]/)[0].toLowerCase();
 const urls=[...new Set(found)].filter(u=>ALLOW.includes(host(u))).slice(0,5);
 for(const url of urls) out.push({json:{id:j.id,dir:j.dir,q:j.q,to:j.to,url}});
 if(!urls.length) out.push({json:{id:j.id,dir:j.dir,q:j.q,to:j.to,url:'(none)',key:'none',status:0,dead:true}});
}
return out;`;

CODE['fetch-page'] = `// One polite GET. http->https (https.get throws on http), 15s timeout -> DEAD_URL, one redirect followed.
const fs=require('fs'),https=require('https');
const {dir,url}=$json;
if($json.dead) return {json:$json};
const key=[...url].reduce((h,c)=>(h*33+c.charCodeAt(0))>>>0,5381).toString(16)+'-'+url.split('/').pop().replace(/[^\\w.-]/g,'').slice(0,40);
const get=u=>new Promise(ok=>{const rq=https.get(u.replace(/^http:\\/\\//i,'https://'),{headers:{'user-agent':'ships-itself-ep10-research'}},s=>{
 if([301,302,307,308].includes(s.statusCode)&&s.headers.location){s.resume();return ok({redir:s.headers.location})}
 let d='';s.on('data',c=>d+=c);s.on('end',()=>ok({code:s.statusCode,d}))});
 rq.on('error',()=>{rq.destroy();ok({code:0})});rq.setTimeout(15000,()=>{rq.destroy();ok({code:0})})});
let r=await get(url),redirectedTo=null;
if(r.redir){redirectedTo=r.redir.startsWith('http')?r.redir:url.replace(/^(https?:\\/\\/[^/]+).*$/,'$1')+r.redir;r=await get(redirectedTo)}
if(r.redir||r.code!==200) return {json:{...$json,key,status:r.code||0,redirectedTo,dead:true}};
fs.writeFileSync(dir+'/cache/'+key+'.html',r.d);
return {json:{...$json,key,status:200,redirectedTo,dead:false}};`;

CODE['page-text'] = `// Same-bytes rule: this exact slice is what the model reads AND what the gate checks.
const fs=require('fs');
const {dir,key,dead}=$json;
if(dead) return {json:$json};
let t=fs.readFileSync(dir+'/cache/'+key+'.html','utf8');
t=t.replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ');
t=t.replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\\s\\S]*?<\\/sup>/gi,'');
t=t.replace(/=\\s*"[^"]*"/g,'').replace(/=\\s*'[^']*'/g,'');
t=t.replace(/\\{\\\\displaystyle(?:[^{}]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*\\}/g,'');
t=t.replace(/<\\/?(a|code|em|i|b|strong|span|sup|sub|abbr|cite|kbd|var|small|s|u|mark|q|time|data)\\b[^>]*>/gi,'');
t=t.replace(/<[^>]+>/g,' ');
t=t.replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
t=t.replace(/\\s+/g,' ').trim().slice(0,8000);
fs.writeFileSync(dir+'/cache/'+key+'.txt',t);
return {json:{...$json,chars:t.length}};`;

CODE['answer-call'] = `// Call 2: answer from the fetched text only, with a verbatim quote per claim.
const fs=require('fs'),https=require('https');
const call=body=>new Promise((ok,er)=>{const r=https.request('https://fal.run/fal-ai/any-llm',{method:'POST',headers:{Authorization:'Key '+$env.FAL_KEY,'Content-Type':'application/json'}},s=>{let d='';s.on('data',c=>d+=c);s.on('end',()=>ok({h:s.headers,d}))});r.on('error',er);r.end(body)});
const groups={};for(const {json:s} of $input.all())(groups[s.id]=groups[s.id]||[]).push(s);
const out=[];
for(const id in groups){const g=groups[id],{dir,q,to}=g[0],live=g.filter(s=>!s.dead);
 if(!live.length){out.push({json:{id,dir,q,to,answer:'',sources:g,failed:'NO_LIVE_SOURCES'}});continue}
 const src=live.map((s,i)=>'['+(i+1)+'] '+s.url+'\\n'+fs.readFileSync(dir+'/cache/'+s.key+'.txt','utf8')).join('\\n\\n');
 const prompt='Question: '+q+'\\nSources:\\n'+src+'\\nAnswer using ONLY these sources. Every claim needs a quote of <=40 words copied EXACTLY from a source, plus that source URL. Reply JSON only: {"claims":[{"claim":"...","quote":"...","url":"..."}]}';
 const res=await call(JSON.stringify({model:'meta-llama/llama-4-scout',prompt}));
 fs.writeFileSync(dir+'/answer.json',res.d);
 fs.appendFileSync(dir+'/receipts.jsonl',JSON.stringify({call:'answer',units:res.h['x-fal-billable-units']||null,at:Date.now()})+'\\n');
 out.push({json:{id,dir,q,to,answer:res.d,sources:g.map(({url,key,status,dead})=>({url,key,status,dead}))}});}
return out;`;

CODE['split-claims'] = `// Tolerant parse: a broken reply becomes one visible rejected row, never a crash.
const out=[];
for(const {json:j} of $input.all()){
 let raw=j.answer;try{raw=JSON.parse(raw).output||raw}catch(e){}
 let claims=[];const m=String(raw).match(/\\{[\\s\\S]*\\}/);
 try{claims=JSON.parse(m[0]).claims||[]}catch(e){}
 if(!claims.length){out.push({json:{...j,n:0,claim:'(no parseable claims returned)',quote:'',url:'',verdict:'REJECTED',reason:j.failed||'PARSE_FAIL'}});continue}
 claims.slice(0,12).forEach((c,n)=>out.push({json:{id:j.id,dir:j.dir,q:j.q,to:j.to,n:n+1,claim:String(c.claim||''),quote:String(c.quote||''),url:String(c.url||''),sources:j.sources}}));
}
return out;`;

CODE['cite-gate'] = `// The centerpiece. Zero AI: the URL must be one we fetched, the quote must exist in those bytes.
const fs=require('fs');
const t0=Date.now(),{dir,quote,url,sources}=$json;
if($json.verdict){fs.appendFileSync(dir+'/gate.jsonl',JSON.stringify({n:0,verdict:'REJECTED',reason:$json.reason,ms:0})+'\\n');return {json:$json};}
const norm=s=>s.replace(/\\[\\s*(?:\\d{1,3}|note\\s*\\d+|edit|citation needed)\\s*\\]/gi,' ').toLowerCase()
 .replace(/[\\u2018\\u2019\\u02BC]/g,"'").replace(/[\\u201C\\u201D]/g,'"').replace(/[\\u2013\\u2014]/g,'-')
 .replace(/[\\u00AD\\u200B]/g,'').replace(/\\u00A0/g,' ').replace(/\\s+/g,' ')
 .replace(/\\s+([,.;:!?%)\\]}])/g,'$1').replace(/([(\\[{])\\s+/g,'$1')
 .replace(/\\s+('s\\b|'\\b)/g,'$1').replace(/\\s*-\\s*/g,'-').replace(/\\b([a-z])\\s+(\\d)\\b/g,'$1$2').trim();
const src=(sources||[]).find(s=>s.url===url||s.url===url.replace(/\\/$/,'')||s.url+'/'===url);
let verdict='VERIFIED',reason='';
if(!src){verdict='REJECTED';reason='UNKNOWN_URL'}
else if(src.dead){verdict='REJECTED';reason='DEAD_URL:'+src.status}
else if(!quote||!norm(fs.readFileSync(dir+'/cache/'+src.key+'.txt','utf8')).includes(norm(quote))){verdict='REJECTED';reason='QUOTE_NOT_FOUND'}
const ms=Date.now()-t0;
fs.appendFileSync(dir+'/gate.jsonl',JSON.stringify({n:$json.n,verdict,reason,ms,url})+'\\n');
return {json:{...$json,verdict,reason,ms}};`;

CODE['report'] = `// Report + stats. Price comes from the env var set on camera from the pricing page that day.
const fs=require('fs');
const price=Number($env.EP10_PRICE_PER_REQ);
const groups={};for(const {json:c} of $input.all())(groups[c.id]=groups[c.id]||[]).push(c);
const out=[];
for(const id in groups){const g=groups[id],{dir,q,to}=g[0];
 const rec=fs.readFileSync(dir+'/receipts.jsonl','utf8').trim().split('\\n').map(JSON.parse);
 const ver=g.filter(c=>c.verdict==='VERIFIED'),rej=g.filter(c=>c.verdict!=='VERIFIED');
 const byReason=rej.reduce((a,c)=>(a[c.reason||'?']=(a[c.reason||'?']||0)+1,a),{});
 const srcs=g[0].sources||[],dead=srcs.filter(s=>s.dead&&s.status>=400&&s.status<500);
 const row=c=>c.verdict==='VERIFIED'?'<li class="ok">&#10004; '+c.claim+'<blockquote>"'+c.quote+'" &mdash; <a href="'+c.url+'">'+c.url+'</a></blockquote></li>':'<li class="no"><s>'+c.claim+'</s> <b>['+c.reason+']</b></li>';
 const html='<div class="ribbon">SAMPLE &middot; DEMO DATA &middot; BUILT ON CAMERA</div><h1>'+q+'</h1><ol>'+g.map(row).join('')+'</ol><p>'+ver.length+' verified &middot; '+rej.length+' rejected &middot; '+dead.length+' source(s) the model invented &middot; '+rec.length+' API calls &middot; $'+(rec.length*price).toFixed(3)+'</p>'+(dead.length?'<p class="no">Proposed but never existed: '+dead.map(s=>s.url).join(', ')+'</p>':'');
 fs.writeFileSync(dir+'/report.html','<style>body{font-family:sans-serif;max-width:720px;margin:2em auto}.ok{color:#060}.no{color:#b00}.ribbon{background:#c00;color:#fff;padding:6px;text-align:center;font-weight:bold}</style>'+html);
 fs.writeFileSync(dir+'/stats.json',JSON.stringify({id,q,claims:g.length,verified:ver.length,rejected:rej.length,byReason,sources:srcs.length,deadSources:dead.length,deadUrls:dead.map(s=>s.url+' ['+s.status+']'),calls:rec.length,cost:rec.length*price},null,1));
 out.push({json:{id,q,to,subject:('Verified research: '+q).slice(0,78),html,verified:ver.length,rejected:rej.length}});}
return out;`;

CODE['feed-questions'] = `// Batch: one item per question from questions.txt. No email node downstream — by design.
const fs=require('fs');
const BASE='${BASE}';
const qs=fs.readFileSync(BASE+'/questions.txt','utf8').trim().split('\\n').filter(Boolean);
return qs.map(q=>({json:{'Research question':q,'Email the report to':'reports+batch@example.com'}}));`;

// ---- the BROKEN variants typed first on camera ---------------------------
// The episode's turn depends on these actually failing, so they are derived
// from the shipped code by removing exactly the repairs — nothing else.
export const BROKEN = {
  // Remove exactly the three extractor repairs — drop the attribute-value and
  // TeX strips, and put the separator space back on inline tags.
  'page-text': CODE['page-text']
    .split('\n')
    .filter((l) => !l.includes("=\\s*\"[^\"]*\"") && !l.includes('displaystyle'))
    .map((l) => (l.includes('|kbd|var|small|') ? l.replace(/,''\);$/, ",' ');") : l))
    .join('\n'),
  'cite-gate': CODE['cite-gate'].replace(
    /const norm=[\s\S]*?\.trim\(\);/,
    `const norm=s=>s.toLowerCase().replace(/[\\u2018\\u2019\\u02BC]/g,"'").replace(/[\\u201C\\u201D]/g,'"')
 .replace(/[\\u2013\\u2014]/g,'-').replace(/\\u00AD/g,'').replace(/\\s+/g,' ').trim();`
  ),
};

// ---- node builders -------------------------------------------------------
let seq = 0;
const nid = () => 'e1000000-0000-4000-8000-' + String(++seq).padStart(12, '0');

const codeNode = (name, x, mode) => ({
  parameters: { ...(mode ? { mode } : {}), jsCode: CODE[name] },
  id: nid(),
  name,
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [x, 300],
});

const EACH = 'runOnceForEachItem';

const formTrigger = {
  parameters: {
    formTitle: 'Research intake — Ships Itself',
    formDescription: 'Ask a question. You get an answer where every claim is checked against the source it cites.',
    formFields: {
      values: [
        { fieldLabel: 'Research question', placeholder: 'What does HTTP status 418 mean?', requiredField: true },
        { fieldLabel: 'Email the report to', fieldType: 'email', requiredField: true },
      ],
    },
    options: {},
  },
  id: nid(),
  name: 'research-intake',
  type: 'n8n-nodes-base.formTrigger',
  typeVersion: 2.2,
  position: [200, 300],
  webhookId: 'e10b00c1-1e2a-4c1d-9e21-000000000001',
};

const sendEmail = (x) => ({
  parameters: {
    fromEmail: 'Ships Itself Research <you@example.com>',
    toEmail: '={{ $json.to }}',
    subject: '={{ $json.subject }}',
    emailFormat: 'html',
    html: '={{ $json.html }}',
    options: {},
  },
  id: nid(),
  name: 'Send report',
  type: 'n8n-nodes-base.emailSend',
  typeVersion: 2.1,
  position: [x, 300],
  // Credential "smtp-credential" is created in the n8n UI OFF CAMERA
  // (smtp.gmail.com:465 SSL, app password) and selected on camera. The id below
  // is a placeholder replaced at import time by scripts/ep10-wire-credential.mjs.
  credentials: { smtp: { id: 'SMTP_CRED_ID', name: 'smtp-credential' } },
});

const manualTrigger = (name) => ({
  parameters: {},
  id: nid(),
  name,
  type: 'n8n-nodes-base.manualTrigger',
  typeVersion: 1,
  position: [200, 300],
});

const CHAIN = [
  ['run-init', EACH], ['plan-call', EACH], ['split-urls', null], ['fetch-page', EACH],
  ['page-text', EACH], ['answer-call', null], ['split-claims', null], ['cite-gate', EACH], ['report', null],
];

const link = (nodes) => {
  const c = {};
  for (let i = 0; i < nodes.length - 1; i++) {
    c[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
  }
  return c;
};

const build = (name, head, tail) => {
  seq = 0;
  const chain = CHAIN.map(([n, mode], i) => codeNode(n, 420 + i * 220, mode));
  const nodes = [head(), ...chain, ...(tail ? [tail(420 + CHAIN.length * 220)] : [])];
  return { name, nodes, connections: link(nodes), settings: { executionOrder: 'v1' } };
};

const camera = build('Research Agent (ep10)', () => formTrigger, sendEmail);
const batchHead = () => manualTrigger('When clicking Execute');
const batch = build('Research Agent — 20-question batch (ep10)', batchHead, null);
batch.nodes.splice(1, 0, codeNode('feed-questions', 320, null));
batch.connections = link(batch.nodes);
const rehearsal = JSON.parse(JSON.stringify(batch));
rehearsal.name = 'Research Agent — CLI rehearsal (ep10)';

for (const [file, wf] of [['workflow.json', camera], ['workflow-batch.json', batch], ['workflow-rehearsal.json', rehearsal]]) {
  fs.writeFileSync(`${BASE}/${file}`, JSON.stringify(wf, null, 2) + '\n');
  console.log(file.padEnd(26), wf.nodes.length, 'nodes');
}

console.log('\nline counts (cap 18):');
let over = 0;
for (const [name, src] of Object.entries(CODE)) {
  const n = src.split('\n').length;
  if (n > 18) over++;
  console.log(' ', name.padEnd(16), String(n).padStart(2), n > 18 ? '  ✗ OVER' : '');
}
console.log(over ? `${over} NODES OVER CAP` : 'all nodes within cap');

const all = ['workflow.json', 'workflow-batch.json', 'workflow-rehearsal.json']
  .map((f) => fs.readFileSync(`${BASE}/${f}`, 'utf8')).join('');
console.log("hardcoded '0.001' present:", all.includes('0.001'));
console.log('EP10_PRICE_PER_REQ referenced:', all.includes('EP10_PRICE_PER_REQ'));
