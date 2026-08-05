# EP01 — I Replaced a $1,242/Year Zapier Stack With One Free Workflow

The n8n workflow from the episode: CRM export in → priced invoices + a chase
list out. Four nodes, no paid services.

## Run it yourself

1. Self-hosted n8n (free, sustainable-use license): `npm install n8n`
2. Import `workflow.json` (Workflows → Import from file)
3. Set the env vars the Code nodes read:
   - `EP01_DIR` — folder containing `data/crm-export.csv`
   - `NODE_FUNCTION_ALLOW_BUILTIN=fs,path`
   - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
4. Point it at your own CRM export (or the included sample) and execute

## The numbers from the episode's run (2026-08-05)

| Metric | Value |
|---|---|
| Deals in | 12 |
| Invoices out (won only) | 8 |
| Total billed | $16,738.33 |
| Execution time | 580 ms |
| Zapier Team equivalent | $103.50/mo = $1,242/yr |
| This workflow | $0 |

`sample-crm-export.csv` is demo data. The workflow, the run, and the timings
are real — `run-summary.json` and `chase-list.json` are the actual outputs of
the run shown on screen.

## What this doesn't do

It won't babysit itself. Self-hosting means updates and uptime are on you.
At low volume, Zapier's cheap tier is genuinely fine — this build pays off at
the shared-workflows tier, not before.
