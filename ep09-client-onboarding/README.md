# EP09 — Client Onboarding From One Intake Form

One n8n Form Trigger and five small code nodes. A client fills the form; code
writes the whole onboarding: client folder, welcome doc, contract from a
template, a real `.ics` calendar invite, a CRM row, and a task checklist with
computed dates. No SaaS, no AI, self-hosted, $0.

## The measured build (2026-08-13, one take)

| Metric | Value |
|---|---|
| Manual baseline (same client, by hand, every advantage given) | 2m 58s |
| Blank canvas → published production form | 2m 35s |
| Form open → all files on disk, typing included | 17 seconds |
| The machine part (n8n's own execution log) | 2 ms |
| Running cost | $0 (self-hosted n8n) |

The hand-made files from the manual baseline came out byte-identical to the
workflow's output (the `.ics` differs only in line endings). Both runs are in
the episode.

## Run it yourself

1. Self-hosted n8n with: `NODE_FUNCTION_ALLOW_BUILTIN=fs,path`,
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
2. Env var: `EP09_DIR` = this folder (holds `templates/`, gets `clients/` and
   `crm/crm.csv`)
3. Import `workflow.json` (or run `import-workflow.mjs` against a local n8n),
   publish, open the form's Production URL
4. Submit a client — five files and a CRM row appear in about a second
5. `submit-client.mjs` types a client like a human and prints the two clocks
   (typing time and machine time)

`manual/editor.html` is the bare editor used for the on-camera manual
baseline; `viewer.html` is the "disk view" page the episode uses to show the
real folder tree and CSV (headless Chromium won't render `file://` directory
listings or CSVs).

## The honest part

- A company name with a slash ("Acme/West Coast Consulting") silently became
  a **nested folder** — `mkdirSync(recursive)` treats user input as a path.
  The fix that ships here is the slug line in the folder node. User input
  becomes file paths: sanitize it.
- Re-running the workflow after the fix **re-appended the CRM row**, so the
  CSV in the episode shows four rows for three clients. Files are idempotent;
  append-only logs aren't. Idempotency is your job, not n8n's.

## What this doesn't do

Serve the public internet (localhost until you put it behind a domain), email
anyone (the invite and welcome doc are files; sending is another node), or
sync a calendar (the `.ics` imports anywhere, but nothing pushes it). All
client data is fictional and the contract template carries a SAMPLE ribbon on
purpose.
