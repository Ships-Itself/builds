# EP05 — The Real Price of an AI Agent, Line by Line

## The problem

Every "AI agent" pitch quotes a token price and hopes you never multiply it
out. Nobody shows you a bill.

So we took the support agent from [EP03](../ep03-support-agent), ran it 100
times in a row against the same 12-ticket inbox, counted every model call, and
computed the bill as **counted calls × the provider's published rate** — no
token estimating, no guessing. The same run also answers the question that
matters more than cost: does it give the same answer twice?

## The measured run (2026-08-07, on camera)

| Metric | Value |
|---|---|
| Runs | 100 × the same 12-ticket inbox |
| Model calls | 1,200 (zero network failures) |
| Wall time | 15:24 |
| Bill | 1,200 × $0.001 (fal's public flat rate per any-llm request) = **$1.20** |
| Consistency | 98/100 runs identical (9 answered / 3 escalated); 2 runs escalated one extra ticket |

**Cost verification chain:** every `fal.run` response carries an
`x-fal-billable-units` header (1 per call), and the $0.001-per-request standard
rate is published on fal's model page. Receipts: `run-summary.json` (totals)
and `per-run.json` (all 100 runs, one line each).

## The honest part

- **The first attempt died at exactly 5:00.** n8n's default task timeout killed
  the Code node mid-run, which looks exactly like a hang. Long-running Code
  nodes need `N8N_RUNNERS_TASK_TIMEOUT=3600` (seconds). Cost of learning this
  live: one wasted 5-minute run.
- **The endpoint this price came from is marked deprecated.** `fal-ai/any-llm`
  carries a deprecation note on fal's model page. The exact price may not
  survive; the method does — count your calls, multiply by your provider's
  published rate, and never trust a token estimate you didn't measure.
- **2 runs out of 100 disagreed with the other 98.** Same inbox, same prompt,
  same model — one extra escalation. That is the honest headline of this
  episode, and it is a feature of the gate: when the model wobbled, the ticket
  went to a human rather than getting a wrong answer.
- **$1.20 is the model bill and only the model bill.** See below.

## What the bill leaves out

Your time building it, knowledge-base upkeep, the helpdesk OAuth integration
this demo skips, and the box it runs on (a $4–6/month VPS). Also: these are
short tickets. Longer conversations cost more on token-priced providers, where
this flat-rate arithmetic stops applying entirely.

## What's in this folder

| File | What it is |
|---|---|
| `workflow.json` | The stress-run workflow, exactly as it ran |
| `run-summary.json` | Totals: runs, calls, failures, wall time, distribution |
| `per-run.json` | All 100 runs, individually |

## Run it yourself

1. Self-hosted n8n, started with:
   - `NODE_FUNCTION_ALLOW_BUILTIN=fs,path,https`
   - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
   - `N8N_RUNNERS_ENABLED=false`
   - `N8N_RUNNERS_TASK_TIMEOUT=3600`
2. Set `EP03_DIR` (the EP03 folder with its `data/`), `EP05_DIR` (this folder),
   `EP05_RUNS` (default 100) and `FAL_KEY`
3. Import `workflow.json` and execute
4. Read your own receipts in `out/` — `progress.json` updates every 5 runs so
   you can watch it climb

Start with `EP05_RUNS=5` to check your setup before spending 15 minutes and
1,200 calls.

## What this doesn't do

It doesn't price your workload — it prices *this* workload, on one provider, at
one moment. The number to copy is not $1.20; it's the method. And it measures
consistency on a fixed inbox, which is the friendliest possible test: real
tickets vary, and variance is where agents actually break.

---

Episode: [My n8n AI Agent Handled 1,200 Tickets. The Bill Was $1.20.](https://www.youtube.com/watch?v=tQn3ET0Yxic)
· [all builds](../)
