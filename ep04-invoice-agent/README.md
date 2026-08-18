# EP04 — The Invoice-Reading Agent

## The problem

Reading invoices is the easy half. Deciding which ones to pay is the half that
costs money when it goes wrong — and it is exactly the half you should never
hand to a language model.

So the work is split. A vision model reads each invoice image into strict JSON
and is told to return `null` rather than guess. Then a pure-code gate decides:
**the PO must exist, the amount must match to the cent, and the invoice number
must never have been seen before.** Everything else goes to a human.

## The measured run (2026-08-06, on camera)

| Metric | Value |
|---|---|
| Invoices in | 13 (four layouts, one deliberately awful scan) |
| Approved | 10 — $9,049.05, each matched to a real PO |
| Flagged | 3 — exactly the 3 planted traps, 3-for-3 |
| Stopped | **$1,411.25** (amount mismatch + no PO + duplicate) |
| Stopwatch | 104s end to end including typing · 28s of model reads |

Receipts: `run-summary.json` and `flagged.json`.

## The honest part

- **The model misread a date.** On the crooked scan, `02/08/2026` came back as
  February 8 instead of August 2. The gate never uses dates, so nothing broke —
  but if your process depends on due dates, that field needs its own check.
  This is the whole argument for a code gate: the model was wrong, and it did
  not matter, because nothing important depended on it being right.
- **The demo scans are cleaner than yours.** `make-invoices.mjs` renders all 13
  documents, including the three traps, so you can reproduce or extend the set.
  Real scans are crooked, stamped, stapled and photographed at an angle, and
  extraction quality drops accordingly. Measure it on your own documents before
  you believe any accuracy number, including this one.
- **Three traps is a demonstration, not a benchmark.** 3-for-3 means the gate
  catches the three failure modes it was written to catch. It says nothing
  about the fourth one nobody thought of.

## What's in this folder

| File | What it is |
|---|---|
| `workflow.json` | The workflow, exactly as it ran |
| `invoices/` | The 13 demo invoice images, including the 3 traps |
| `purchase-orders.csv` | The PO list the gate matches against |
| `make-invoices.mjs` | Regenerates all 13 invoices |
| `run-summary.json`, `flagged.json` | The on-camera run's receipts |

Every invoice is a generated document from a fictional vendor billing a
fictional company.

## Run it yourself

1. Self-hosted n8n, started with:
   - `NODE_FUNCTION_ALLOW_BUILTIN=fs,path,https`
   - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
   - `N8N_RUNNERS_ENABLED=false`
2. Set `EP04_DIR` (a folder with a `data/` subfolder) and `FAL_KEY` (fal.ai)
3. Import `workflow.json`, then put `purchase-orders.csv` and the `invoices/`
   folder under `data/`
4. Execute. Receipts land in `out/`: `approved.json`, `flagged.json`,
   `summary.json`

Vision model: `google/gemini-flash-1.5` via fal's `any-llm/vision` endpoint.
Swap the model name in the `Vision: read every invoice` node for another one.

## What this doesn't do

It doesn't connect to a real AP inbox or accounting system — that's OAuth and
approval chains. It doesn't pay anything; it only writes receipts. And it
doesn't replace the human. The flags still land on somebody's desk. They just
land as a shorter, better-sorted pile.

---

Episode: [I Built an n8n AI Agent That Reads Every Invoice. It Refused to Pay 3.](https://www.youtube.com/watch?v=n4YUuLNQn84)
· [all builds](../)
