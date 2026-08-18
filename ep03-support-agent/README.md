# EP03 — The Support Agent (No Citation, No Answer)

## The problem

Support bots invent policies. Ask one about a refund window it has never been
told about and it will confidently make one up, in your brand voice, to your
customer.

This workflow answers tickets only from a knowledge base, with one rule that
keeps it honest: **if the model cannot name which entry answered the ticket,
the ticket goes to a human.** The rule is a Code node, not a prompt — the model
cannot talk its way past it.

## The measured run (2026-08-06, on camera)

| Metric | Value |
|---|---|
| Tickets in | 12 |
| Answered | 9 — every answer audited, zero invented facts |
| Escalated | 3 — and all three were the right call |
| Auto-answer rate | **75%** |
| Build time | 92s zero-to-running |
| Model cost | $0.001 per ticket (one call each, fal.ai any-llm, llama-4-scout) |

Receipts: `run-summary.json`. The tickets and knowledge base are demo data;
the run, the audit and the timings are real.

## The honest part

- **The gate checks that a citation exists, not that it is true.** Read
  `Gate + receipts`: it requires a non-empty tag that isn't `NONE`. It does not
  yet verify the tag appears in the knowledge base. A model that invents a
  plausible tag would pass. Verifying the tag against the file is a few lines,
  and it is the first thing to add before you trust this in production.
- **75% is a knowledge-base score, not a model score.** The three escalations
  were tickets the file genuinely did not answer. Widen the file and the rate
  rises; let the file go stale and the gate happily cites obsolete policy.
- **Twelve tickets is a small sample.** One run proves nothing about
  consistency, which is why [EP05](../ep05-cost-teardown) ran this exact
  workflow 100 times: 98 of 100 runs produced the identical 9/3 split, and 2
  escalated one extra ticket.
- **Ticket parsing is a strict regex.** `Load tickets + knowledge` expects the
  demo CSV's exact shape (`id,customer,subject,"body"`). Feed it a different
  CSV and it throws on the first row.

## What's in this folder

| File | What it is |
|---|---|
| `workflow.json` | The workflow, exactly as it ran |
| `sample-tickets.csv` | 12 demo tickets from fictional customers |
| `knowledge-base.md` | The tagged knowledge base the answers must cite |
| `run-summary.json` | The on-camera run's totals |

## Run it yourself

1. Self-hosted n8n, started with:
   - `NODE_FUNCTION_ALLOW_BUILTIN=fs,path,https`
   - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
   - `N8N_RUNNERS_ENABLED=false`
2. Set `EP03_DIR` (a folder with a `data/` subfolder) and `FAL_KEY` (fal.ai)
3. Import `workflow.json`, then put `sample-tickets.csv` and
   `knowledge-base.md` under `data/` as `tickets.csv` and `faq.md`
4. Execute. Receipts land in `out/`: `answered.json`, `escalated.json`,
   `summary.json`

The model call is plain `https.request` in the Code node — swap the endpoint
and model name for any provider you prefer.

## What this doesn't do

It doesn't read your real helpdesk (that needs per-platform OAuth), handle
refunds and exceptions a human should own, or send replies — it writes them to
disk for a person to approve. And it cannot stay honest with a stale knowledge
base. The gate only protects you if the file is current.

---

Episode: [I Built an n8n Support Agent With One Rule: No Citation, No Answer](https://www.youtube.com/watch?v=xA063hK6cW4)
· [all builds](../)
