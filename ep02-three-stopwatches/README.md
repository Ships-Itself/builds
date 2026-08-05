# EP02 — n8n vs Make vs Zapier: One Job, Three Stopwatches

The same job (episode 1's CRM→invoices workflow) attempted in three tools,
with a running stopwatch. Measured 2026-08-05.

| | n8n | Make | Zapier |
|---|---|---|---|
| Zero to built | **75s** | **28s** (to data flowing) | **43s** |
| The full job | ✅ ran in 580ms | Partial — fetch verified (HTTP 200, 1 op), pricing logic not completed | ❌ blocked |
| Why | — | The visual builder's add-module flow fought back on camera; that friction is data | Free tier caps a Code step at **1 second** of runtime; the network fetch alone exceeds it |
| Cost | $0 self-hosted | 1 credit/run (1,000 free/mo) | needs a paid plan to complete |

## Files
- `n8n-workflow.json` — the complete working workflow (import into any n8n)
- `make-scenario.md` — the Make build, step by step
- `zapier-code-step.js` — the full-job code step (works on paid plans; dies on free)

## The honest verdict
Five automations a month → Zapier is fine, pay it. Visual builders + moderate
volume → Make is genuinely pleasant. A workflow that is a business asset →
self-hosted n8n is free and fast, and you are the on-call.
There is no single answer. Anyone selling you one answer is selling you a link.
