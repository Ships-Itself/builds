# EP03 — The Support Agent (No Citation, No Answer)

An n8n workflow that answers support tickets ONLY from a knowledge base, with
one rule that keeps it honest: if the model cannot cite which entry answered
the ticket, the ticket escalates to a human.

## The measured run (2026-08-06, on camera)

| Metric | Value |
|---|---|
| Tickets in | 12 |
| Answered | 9 (every answer audited — zero invented facts) |
| Escalated | 3 — and all three were the right call |
| Auto-answer rate | **75%** |
| Build time | 92s zero-to-running |
| Model cost | ~⅕¢ per ticket (fal.ai any-llm, llama-4-scout) |

## Run it yourself

1. Self-hosted n8n with: `NODE_FUNCTION_ALLOW_BUILTIN=fs,path,https`,
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `N8N_RUNNERS_ENABLED=false`
2. Env vars: `EP03_DIR` (folder with `data/`), `FAL_KEY` (fal.ai)
3. Import `workflow.json`, put `sample-tickets.csv` + `knowledge-base.md` under `data/`
4. Execute. Outputs land in `out/`: answered.json, escalated.json, summary.json

## What this doesn't do

Read your real helpdesk (that needs per-platform OAuth), handle refunds and
exceptions a human should own, or stay honest with a stale knowledge base.
The gate only protects you if the file stays current.
