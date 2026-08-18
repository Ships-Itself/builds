# EP02 — n8n vs Make vs Zapier: One Job, Three Stopwatches

## The problem

Every automation comparison online is a feature table written by someone with
an affiliate link. So we took one real job — [EP01](../ep01-zapier-stack-replacement)'s
CRM-export-to-invoices workflow — built it three times, and ran a stopwatch.
Same job, same data, three tools.

## The measured run (2026-08-05, on camera)

| | n8n | Make | Zapier |
|---|---|---|---|
| Zero to built | **75s** | **28s** (to data flowing) | **43s** |
| The full job | ✅ ran in 580 ms | Partial — fetch verified (HTTP 200, 1 op), pricing logic not completed | ❌ blocked |
| Why | — | The visual builder's add-module flow fought back on camera; that friction is data | Free tier caps a Code step at **1 second** of runtime; the network fetch alone exceeds it |
| Cost | $0 self-hosted | 1 credit/run (1,000 free/mo) | Needs a paid plan to complete |

## The honest part

Two of the three builds failed on camera, and both failures stayed in the edit:

- **The Make build was abandoned unfinished.** The 28-second number is time to
  a working HTTP fetch, not time to a finished job. The pricing logic needed
  2–3 more modules with field mappings, and the add-module flow fought back
  live. That is a fair thing to hold against a visual builder, but it is
  friction, not a wall — with more time on the tool it finishes.
- **Zapier's 1-second free-tier Code cap is a wall, not friction.** The network
  fetch alone blows through it. `zapier-code-step.js` is the complete step and
  it works fine on a paid plan; on the free tier it cannot finish, no matter
  how well you write it.
- **The build times are one take each, by someone who knew the answer.** They
  measure how fast each tool lets you express a job you have already solved —
  not how fast you would learn it cold.

## What's in this folder

| File | What it is |
|---|---|
| `n8n-workflow.json` | The complete working workflow (identical to EP01's) |
| `make-scenario.md` | The Make build, step by step, as recorded |
| `zapier-code-step.js` | The full-job Code step — works on paid plans, dies on free |

## Run it yourself

The n8n side is EP01's workflow, so the setup is the same:

1. Self-hosted n8n: `npx n8n`, started with
   `NODE_FUNCTION_ALLOW_BUILTIN=fs,path` and
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
2. Import `n8n-workflow.json`
3. Set `EP01_DIR` to a folder containing `data/crm-export.csv` — the sample
   export lives in [`../ep01-zapier-stack-replacement/`](../ep01-zapier-stack-replacement/)
4. Execute, and time it yourself

For the other two, `make-scenario.md` lists the modules in order and
`zapier-code-step.js` drops straight into a Zapier Code step.

## The honest verdict

Five automations a month → Zapier is fine, pay it. Visual builders and moderate
volume → Make is genuinely pleasant. A workflow that is a business asset →
self-hosted n8n is free and fast, and you are the on-call.

There is no single answer. Anyone selling you one answer is selling you a link.

## What this doesn't do

It doesn't compare the parts that matter over months — error handling,
retries, versioning, team permissions, or what happens at 3am when a run
fails. One job on one day measures the first hour of a tool, not the first
year.

---

Episode: [n8n vs Make vs Zapier: One Job, Three Stopwatches](https://www.youtube.com/watch?v=lS1c_-s_MXc)
· [all builds](../)
