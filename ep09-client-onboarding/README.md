# EP09 — Client Onboarding From One Intake Form

## The problem

Onboarding a new client is six small chores nobody enjoys: make the folder,
write the welcome doc, fill in the contract, send a kickoff invite, add the CRM
row, build the task checklist. Each one is two minutes and a chance to get a
name wrong.

One n8n Form Trigger and five small Code nodes do all six. The client fills in
the form; code writes the whole onboarding. No SaaS, no AI, self-hosted, $0.

## The measured build (2026-08-13, one take)

| Metric | Value |
|---|---|
| Manual baseline (same client, by hand, every advantage given) | 2m 58s |
| Blank canvas → published production form | 2m 35s |
| Form open → all files on disk, typing included | **17 seconds** |
| The machine part (n8n's own execution log) | **2 ms** |
| Running cost | $0 (self-hosted n8n) |

The hand-made files from the manual baseline came out byte-identical to the
workflow's output — the `.ics` differs only in line endings. Both runs are in
the episode.

## The honest part

Two things broke on camera, and both stayed in:

- **A slash in a company name created a nested folder.** "Acme/West Coast
  Consulting" went straight into `mkdirSync(recursive: true)`, which cheerfully
  treats user input as a path. The fix that ships here is the slug line in the
  folder node. User input becomes file paths: sanitize it, every time.
- **Re-running after the fix re-appended the CRM row.** The CSV in the episode
  shows four rows for three clients. The file writes are idempotent because
  they overwrite; the append-only log is not. Idempotency is your job, not
  n8n's — key the append on something and check before you write.

One more, less dramatic: **there is no AI in this build on purpose.** Every
field is copied, templated or computed. If a job is deterministic, a model adds
cost, latency and a new failure mode in exchange for nothing.

## What's in this folder

| File | What it is |
|---|---|
| `workflow.json` | The workflow, exactly as it ran (Form Trigger + 5 Code nodes + Form Ending) |
| `templates/` | Welcome doc, contract and checklist templates |
| `import-workflow.mjs` | Imports and activates the workflow against a local n8n |
| `submit-client.mjs` | Fills the form like a human and prints both clocks |
| `viewer.html` | The "disk view" page used on camera to show the real folder tree and CSV |
| `manual/editor.html` | The bare editor used for the manual baseline |

`viewer.html` exists because headless Chromium won't render `file://` directory
listings or CSVs — it reads the real disk and displays it.

## Run it yourself

1. Self-hosted n8n, started with:
   - `NODE_FUNCTION_ALLOW_BUILTIN=fs,path`
   - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
2. Set `EP09_DIR` to this folder (it holds `templates/`, and gets `clients/`
   and `crm/crm.csv`)
3. Import `workflow.json`, publish it, and open the form's Production URL
4. Submit a client — five files and a CRM row appear in about a second

To script the whole thing instead:

```bash
export N8N_URL=http://localhost:5678
export N8N_USER=you@example.com          # your n8n owner account
export N8N_PASSWORD=...                  # never hard-code this
export EP09_DIR="$PWD"

node import-workflow.mjs                 # prints WORKFLOW_ID and FORM_URL
EP09_FORM_URL=<the printed URL> node submit-client.mjs 0
```

`submit-client.mjs` needs Playwright (`npm i playwright`) and types like a
human on purpose — pass `--fast` to skip the delays.

## What this doesn't do

It doesn't serve the public internet (localhost until you put it behind a
domain), email anyone (the invite and welcome doc are files; sending is another
node), or sync a calendar (the `.ics` imports anywhere, but nothing pushes it).

All client data is fictional, and the contract template carries a SAMPLE ribbon
on purpose. It is a template, not legal advice.

---

Episode: [Onboarding a Client Took Me 3 Minutes. Now It Takes 17 Seconds.](https://www.youtube.com/watch?v=RzXBWCqHFRg)
(publishes 2026-08-20) · [all builds](../)
