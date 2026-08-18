# Ships Itself — builds

Working [n8n](https://n8n.io) workflows from [Ships Itself](https://www.youtube.com/@shipsitself),
a channel that builds one automation on camera and publishes every number it
measures — including the runs that went wrong.

One folder per episode. Each folder holds the exact workflow JSON that ran on
screen, the sample data it ran on, and a README with the stopwatch times, the
run summary, and the part that broke.

Nothing here is a mock-up. Every number in this repo came off a stopwatch, an
n8n execution log, or a provider's own billing page.

## The builds

| Build | What it does | Measured on camera | Video |
|---|---|---|---|
| [**EP01** — Replace a Zapier stack](ep01-zapier-stack-replacement/) | CRM export in; priced invoices and a chase list out | 8 invoices · $16,738.33 billed · **580 ms** · $0 vs $1,242/yr | [watch](https://www.youtube.com/watch?v=b0KJgFtLsPs) |
| [**EP02** — n8n vs Make vs Zapier](ep02-three-stopwatches/) | The same job built three times, on a stopwatch | n8n **75s** to built · Make 28s (partial) · Zapier blocked by a 1s cap | [watch](https://www.youtube.com/watch?v=lS1c_-s_MXc) |
| [**EP03** — Support agent](ep03-support-agent/) | Answers tickets only from your knowledge base, or escalates | 12 tickets → **75%** auto-answered · ~⅕¢ per ticket | [watch](https://www.youtube.com/watch?v=xA063hK6cW4) |
| [**EP04** — Invoice-reading agent](ep04-invoice-agent/) | A vision model reads invoices; pure code decides what gets paid | 13 invoices → 10 approved · 3 traps caught 3-for-3 · **$1,411.25 stopped** | [watch](https://www.youtube.com/watch?v=n4YUuLNQn84) |
| [**EP05** — What an agent really costs](ep05-cost-teardown/) | The EP03 agent run 100 times, with the bill counted call by call | 1,200 calls · **$1.20** · 98/100 runs identical | [watch](https://www.youtube.com/watch?v=tQn3ET0Yxic) |
| [**EP06** — $0 booking page](ep06-zero-calendly/) | Hosted form, code gatekeeper, real `.ics` invites, no double-bookings | **85s** blank canvas → published page · $0 vs $10/seat/mo | [watch](https://www.youtube.com/watch?v=qq7HJG5JAV0) |
| [**EP07** — Lead-qualifying agent](ep07-lead-qualifier/) | Scores inbound leads against your ICP; no receipt, no verdict | 40 leads in **36s** · 14 hot / 11 nurture / 13 out / 2 review · $0.001 each | [watch](https://www.youtube.com/watch?v=pBT-4pQ2ayk) |
| [**EP09** — Client onboarding](ep09-client-onboarding/) | One intake form writes the folder, docs, contract, invite and CRM row | 2m58s by hand → **17s** · 2 ms of machine time · $0 | [watch](https://www.youtube.com/watch?v=RzXBWCqHFRg) (from Aug 20) |

EP08 is the odd one out — a failure retrospective with no new build. See
[What broke](#ep08--what-broke) at the bottom.

## Run any of them

Every build is a plain n8n workflow export. Nothing is bundled, and nothing
phones home.

1. **Get n8n running.** Self-hosted n8n is free under the
   [Sustainable Use License](https://github.com/n8n-io/n8n/blob/master/LICENSE.md):
   `npx n8n` for a quick look, or `npm install -g n8n` to keep it.
2. **Start it with the env vars the Code nodes need.** These builds use Node
   builtins and read config from the environment, both of which n8n blocks by
   default:

   ```bash
   export NODE_FUNCTION_ALLOW_BUILTIN=fs,path,https
   export N8N_BLOCK_ENV_ACCESS_IN_NODE=false
   export N8N_RUNNERS_ENABLED=false
   n8n start
   ```

3. **Import the workflow.** In n8n: Workflows → Import from File → pick that
   folder's `workflow.json`.
4. **Set that build's own env vars.** Every build reads a `EPxx_DIR` pointing at
   its folder, so it knows where to find `data/` and where to write `out/`. The
   per-build README lists the rest.
5. **Execute**, and read your own receipts in `out/`.

### What each build needs

| Build | Trigger | Model calls | Extra env |
|---|---|---|---|
| EP01, EP02 | Manual | none — pure code | `EP01_DIR` |
| EP03 | Manual | yes | `EP03_DIR`, `FAL_KEY` |
| EP04 | Manual | yes (vision) | `EP04_DIR`, `FAL_KEY` |
| EP05 | Manual | yes (1,200 of them) | `EP03_DIR`, `EP05_DIR`, `FAL_KEY`, `N8N_RUNNERS_TASK_TIMEOUT=3600` |
| EP06 | Hosted form | none — pure code | `EP06_DIR` |
| EP07 | Schedule | yes | `EP07_DIR`, `FAL_KEY` |
| EP09 | Hosted form | none — pure code | `EP09_DIR` |

`FAL_KEY` is a [fal.ai](https://fal.ai) API key. The model calls go through
fal's `any-llm` endpoint, so swapping providers is a one-line change in the
Code node — the HTTP call is written out in plain JavaScript, not hidden behind
a credential picker.

The four AI builds all share the same shape on purpose: **a cheap model
proposes, deterministic code disposes.** The model never decides anything on
its own. A Code node checks its work against something real — a knowledge-base
citation, a purchase order, an ICP tag quoted verbatim — and anything that
fails the check goes to a human. That gate is the part worth stealing.

## About the data

The CSVs, invoices, tickets and leads are generated demo data from fictional
companies, and the folders say so. The workflows, the runs, the timings and the
bills are real.

## EP08 — What broke

No new build that week: an honest retrospective of the five failures behind the
first seven builds. All five live in the folders above, with the fixes that
shipped.

| Failure | Where |
|---|---|
| Zapier's free tier caps a Code step at 1 second of runtime | [EP02](ep02-three-stopwatches/) |
| The Make build abandoned on camera, unfinished | [EP02](ep02-three-stopwatches/) |
| n8n's default task timeout killed a long run at exactly 5:00 | [EP05](ep05-cost-teardown/) |
| A vision model read `02/08` as February 8, not August 2 | [EP04](ep04-invoice-agent/) |
| A contradiction slipped past the gate in 2 of 5 identical reruns | [EP07](ep07-lead-qualifier/) |

The EP07 flake still has no shipped fix — the gate checks that receipts exist,
not that they are the whole truth. A claim-vs-field cross-check would close it.
PRs welcome.

---

Built and measured by [Ships Itself](https://www.youtube.com/@shipsitself).
Found something wrong in a number? Open an issue — corrections are the whole
point.
