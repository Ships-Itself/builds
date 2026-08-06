# EP04 — The Invoice-Reading Agent

An n8n workflow where a vision model reads invoice images into strict JSON and
a pure-code gate decides what gets paid: the PO must exist, the amount must
match to the cent, and the invoice number must never have been seen before.
Everything else goes to a human.

## The measured run (2026-08-06, on camera)

| Metric | Value |
|---|---|
| Invoices in | 13 (four layouts, one deliberately awful scan) |
| Approved | 10 — $9,049.05, each matched to a real PO |
| Flagged | 3 — exactly the 3 planted traps, 3-for-3 |
| Stopped | **$1,411.25** (amount mismatch + no PO + duplicate) |
| Stopwatch | 104s end to end, including typing · 28s of model reads |

Known miss, kept honest: on the crooked scan the date `02/08/2026` was read
as February 8 instead of August 2. The gate never uses dates, so nothing
broke — but if your process depends on due dates, double-check that field.

## Run it yourself

1. Self-hosted n8n with: `NODE_FUNCTION_ALLOW_BUILTIN=fs,path,https`,
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `N8N_RUNNERS_ENABLED=false`
2. Env vars: `EP04_DIR` (folder with `data/`), `FAL_KEY` (fal.ai)
3. Import `workflow.json`; put `purchase-orders.csv` and the `invoices/`
   folder under `data/`
4. Execute. Outputs land in `out/`: approved.json, flagged.json, summary.json

Vision model: `google/gemini-flash-1.5` via fal's `any-llm/vision` endpoint.
Swap the model name in node 2 if you prefer another one.

## The demo data

The invoices are generated documents from fictional vendors billing a
fictional company — `make-invoices.mjs` renders all 13, including the three
traps, so you can reproduce or extend the set. Your real scans will be uglier
than these images, and your extraction quality will drop accordingly.

## What this doesn't do

Connect to a real AP inbox or accounting system (that's OAuth and approval
chains), pay anything (it only writes receipts), or replace the human — the
flags still land on a person's desk. They just get a shorter, smarter pile.
