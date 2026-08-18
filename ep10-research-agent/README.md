# EP10 — A Research Agent That Can't Cite What It Didn't Read

Ask a question, get a report where every claim carries a quote and a link —
and a deterministic gate has already checked, in plain code, that the link is
one the workflow actually fetched and the quote actually appears in those
bytes. Claims that fail stay in the report, crossed out, with the reason.

Two model calls per question. Everything else is `fs`, `https`, and rules.

## How it works

```
Form → run-init → plan-call → split-urls → fetch-page → page-text
     → answer-call → split-claims → cite-gate → report → Send report
```

1. **plan-call** asks the model which sources it *wants*. It never fetches
   anything itself.
2. **split-urls** enforces the domain allowlist **in code** — the model can
   propose whatever it likes; only allowlisted hosts are ever requested.
3. **fetch-page** does one polite GET per URL (one redirect followed, 15s
   timeout, failures routed to `DEAD_URL`) and caches the raw HTML.
4. **page-text** strips it to text and slices it. **Same-bytes rule:** that
   exact slice is what the model reads *and* what the gate later checks.
5. **answer-call** asks for claims, each with a ≤40-word verbatim quote and
   the URL it came from.
6. **cite-gate** — the centerpiece, zero AI. A claim is `VERIFIED` only if its
   URL is in the fetched set with status 200 **and** its normalized quote is
   found in the cached text. Otherwise `UNKNOWN_URL`, `DEAD_URL:<status>`,
   `QUOTE_NOT_FOUND`, or `PARSE_FAIL`.
7. **report** writes `report.html` (verified claims with quote + link, rejected
   ones struck through with the reason) and `stats.json`, then emails it.

Every run writes its own evidence to `runs/<run-id>/`: the raw model
responses, `receipts.jsonl` (one line per API call with the provider's
billable-units header), `gate.jsonl` (one line per claim with verdict, reason
and decision time), the cached pages, the report, and the stats.

## Run it yourself

Self-hosted n8n with:

```
NODE_FUNCTION_ALLOW_BUILTIN=fs,path,https
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
FAL_KEY=<your key>
EP10_PRICE_PER_REQ=<provider's per-request price, from their pricing page>
```

The price is an env var on purpose: the report multiplies your own call count
by the number *you* read on the pricing page, so the cost line in the report
is yours, not ours.

1. Import `workflow.json`, publish, open the form's Production URL.
2. Ask a question, give it an inbox, submit.
3. `workflow-batch.json` runs `questions.txt` (20 questions) from the Execute
   button — same chain, no email node.

The Send Email node needs an SMTP credential (host, port 465, SSL, an app
password — not OAuth). `workflow-batch.json` deliberately has no email node,
so no delivery claim can ever ride on batch numbers.

## What this doesn't do

Search the open web — sources come from a four-domain allowlist, which is
what makes the gate meaningful. It doesn't judge whether a *verified* claim
actually answers your question: the gate proves the quote is real and the
source is real, not that the reasoning is sound. It doesn't re-check pages
later, so a source that changes after the run won't be caught. And it runs on
localhost until you put it behind a domain.

Reports carry a SAMPLE ribbon. `runs/` is gitignored — cached third-party
pages and recipient addresses are local evidence, not shippable code.
