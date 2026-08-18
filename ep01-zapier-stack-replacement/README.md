# EP01 — I Replaced a $1,242/Year Zapier Stack With One Free Workflow

## The problem

A small agency was paying for a Zapier plan to do one thing: turn closed-won
deals into invoices and remind itself to chase them. The logic is a filter and
some arithmetic. The bill was $103.50 a month.

This is that job as four n8n nodes: a CRM export goes in, priced invoice
documents and a chase list come out. No paid services, no PDF API — invoices
are HTML, and every browser prints HTML to PDF.

## The measured run (2026-08-05, on camera)

| Metric | Value |
|---|---|
| Deals in | 12 |
| Invoices out (won only) | 8 |
| Total billed | $16,738.33 |
| Execution time | 580 ms |
| Zapier Team equivalent | $103.50/mo = $1,242/yr |
| This workflow | $0 |

`run-summary.json` and `chase-list.json` are the actual outputs of the run shown
on screen. `sample-crm-export.csv` is generated demo data; the workflow, the
run and the timings are real.

## The honest part

Nothing broke on camera in this one, so the honest part is what the build
quietly assumes:

- **The price comparison is against Zapier's Team plan.** $1,242/yr is where
  you land once you need shared workflows and multi-step zaps. Their cheaper
  tiers exist, and at five automations a month they are genuinely fine. This
  build pays off when a workflow is a business asset, not a hobby zap.
- **The run date is pinned.** `today` and `chase_after` are hard-coded to the
  recording date so the on-screen output stays reproducible. Swap them for
  `new Date()` before you use this for real.
- **CSV parsing is `split(',')`.** A client name with a comma in it will shift
  every column after it. Real exports need a real CSV parser.
- **It reads an export, not a CRM.** The Zapier stack it replaces was wired to
  a live CRM. Node 1 is where a webhook or a scheduled API pull goes; the three
  nodes downstream do not change.

## What's in this folder

| File | What it is |
|---|---|
| `workflow.json` | The workflow, exactly as it ran |
| `sample-crm-export.csv` | Demo CRM export — 12 deals, fictional clients |
| `run-summary.json` | The on-camera run's totals |
| `chase-list.json` | The chase list that run produced |

## Run it yourself

1. Self-hosted n8n (free under the Sustainable Use License): `npx n8n`
2. Start it with:
   - `NODE_FUNCTION_ALLOW_BUILTIN=fs,path`
   - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
3. Import `workflow.json` (Workflows → Import from File)
4. Set `EP01_DIR` to a folder containing `data/crm-export.csv` — copy
   `sample-crm-export.csv` there, or point it at your own export
5. Execute. Invoices, `chase-list.json` and `summary.json` land in `out/`

## What this doesn't do

It won't babysit itself. Self-hosting means updates, backups and uptime are
your job. It doesn't email anyone — writing the invoice and sending it are
different problems, and sending is one more node. And it doesn't touch your
accounting system; it produces documents, not ledger entries.

---

Episode: [I Replaced a $1,242/Year Zapier Stack With One Free n8n Workflow](https://www.youtube.com/watch?v=b0KJgFtLsPs)
· [all builds](../)
