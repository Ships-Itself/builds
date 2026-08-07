# EP05 — The Real Price of an AI Agent, Line by Line

The support agent from [EP03](../ep03-support-agent) run 100 times in a row —
1,200 real model calls — with the bill computed from counted calls × the
provider's public rate, and consistency measured across all 100 runs.

## The measured run (2026-08-07, on camera)

| Metric | Value |
|---|---|
| Runs | 100 × the same 12-ticket inbox |
| Model calls | 1,200 (zero network failures) |
| Wall time | 15:24 |
| Bill | 1,200 × $0.001 (fal's public flat rate per any-llm request) = **$1.20** |
| Consistency | 98/100 runs identical (9 answered / 3 escalated); 2 runs escalated one extra ticket |

Cost verification chain: every fal.run response carries an
`x-fal-billable-units` header (1 per call); the $0.001/request standard rate
is on fal's public model page. No token estimating anywhere.

Receipts: `run-summary.json` (totals) and `per-run.json` (all 100 runs).

## Two honest findings

1. **n8n's default task timeout killed attempt one at exactly 5:00.**
   Long-running Code nodes need `N8N_RUNNERS_TASK_TIMEOUT=3600` (seconds).
2. **The `fal-ai/any-llm` endpoint is marked deprecated** on fal's model page.
   The exact price may not survive; the method does — count your calls,
   multiply by your provider's public rate.

## Run it yourself

1. Self-hosted n8n with: `NODE_FUNCTION_ALLOW_BUILTIN=fs,path,https`,
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `N8N_RUNNERS_ENABLED=false`,
   `N8N_RUNNERS_TASK_TIMEOUT=3600`
2. Env vars: `EP03_DIR` (the EP03 folder with its `data/`), `EP05_DIR`
   (this folder), `EP05_RUNS` (default 100), `FAL_KEY`
3. Import `workflow.json`, execute, read your own receipts in `out/`

## What the bill leaves out

Your time building it, knowledge-base upkeep, helpdesk OAuth integration,
and the box it runs on (a $4–6/month VPS). Short tickets too — longer
conversations cost more on token-priced providers.
