# EP11 — An Inbox Agent That Can't Send What It Can't Cite

Point it at a mailbox. It reads everything, decides what deserves a reply, and
drafts one. Then 18 lines of plain code decide whether that draft is allowed to
leave the machine: every fact in the reply has to exist in `knowledge.md`, a
file a human wrote, and be quotable from it. The model classifies and drafts.
Code rules on sending, and on who the recipient is.

## How it works

```
Email Trigger (IMAP) → normalize → prefilter → classify-call → draft-call
                     → send-gate → digest → outbox → Send reply
```

1. **normalize** flattens each message to headers plus a text body.
2. **prefilter** drops the things no agent should spend a model call on —
   auto-replies, bounces, list mail, no-reply senders. 4 of 18 never reached
   the model on the filmed run.
3. **classify-call** puts each survivor in a category. Only BOOKING and
   SUPPORT are sendable; everything else is reported, never answered.
4. **draft-call** writes a reply and lists the sentences from `knowledge.md`
   it is relying on.
5. **send-gate** — no model, no network. A draft is APPROVED only if it clears
   all eight rules; otherwise it is blocked with the rule that stopped it:

   | rule | what it checks |
   |---|---|
   | `CATEGORY_NOT_SENDABLE` | category is not BOOKING or SUPPORT |
   | `LOW_CONFIDENCE` | the classifier wasn't sure enough |
   | `NO_FACTS_CITED` | the reply asserts things it never sourced |
   | `FACT_NOT_IN_KB` | a cited sentence isn't in the file |
   | `FACT_NOT_QUOTABLE` | it is in the file, but marked internal |
   | `UNSUPPORTED_TOKEN` | a number or name in the body that no cited fact backs |
   | `RECIPIENT_MISMATCH` | the To: doesn't match the header the run parsed |
   | `ALREADY_REPLIED` | this Message-ID is in the ledger |

   Membership is not permission: `knowledge.md` marks some lines readable but
   not quotable, and rules 4 and 5 are separate on purpose.
6. **outbox** writes the ledger entry *before* the send node runs, so a crash
   mid-send can lose a reply but can never double one.
7. **Send reply** is the only node in the workflow that talks to the outside.

## The number the episode is about

The gate approved a body. The transport shipped a different one.

```
Approved body bytes   182
Landed body bytes     251
Added after body       69     "This email was sent automatically with n8n."
Diff bytes ep10       312     the same feature in HTML: a tracked link with a campaign parameter
```

`verify-landed.mjs` reads the message back out of Sent Mail over IMAP and
diffs it against the bytes the gate ruled on. n8n's Send Email node appends
attribution *after* the node's own parameters are resolved, which is after any
gate you build. Your gate covers the draft. It does not cover the last mile.

## The other thing that broke

The first listen returned **1 item** out of 17 appended messages, with no
error anywhere. "Fetch Only New Emails" is on by default, and on this node
version it pushes `SINCE <today>` onto the IMAP search — date-granular, so
backdated test mail simply doesn't match. Turning it off is half the fix; the
other half is clearing the watermark the workflow already stored. After both:
18 of 18.

If you are testing an IMAP trigger with mail you appended yourself, this is
the first thing to check. A default that filters is indistinguishable from an
empty mailbox.

## Run it yourself

Self-hosted n8n with:

```
NODE_FUNCTION_ALLOW_BUILTIN=fs,path,https
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
FAL_KEY=<your key>
EP11_DIR=<absolute path to this folder>
EP11_OPERATOR=<the address escalations go to>
EP11_MODE=dry            # dry writes drafts to disk and sends nothing
```

`EP11_DIR` is what the workflow's code nodes read. The scripts in this folder
default to the directory you run them from, so `cd` here and they agree with
it; set `EP11_BASE` if you keep them somewhere else. `seed.py` and
`verify-landed.mjs` read IMAP credentials from `EP11_GMAIL_ENV` (defaults to
`~/.secrets/gmail.env`), and `verify-landed.mjs` needs `N8N_MODULES` pointed
at your n8n install if you want it to name the attribution branch in n8n's own
source.

`EP11_MODE=dry` is the default for a reason — run it against a real mailbox in
`live` only once you have read what it wants to send.

1. Import `workflow.json`. It needs two credentials: an IMAP one for the
   trigger and an SMTP one for the send node (port 465, SSL, an app password —
   not OAuth). The published copy has the mailbox stubbed as
   `you@example.com`; point it at your own.
2. `python3 seed.py` appends the test corpus to a label in your own mailbox.
   `--renotify` re-appends the wake message when a fetch races the append;
   `--drain` empties the label before a live run.
3. `node dryrun.mjs` runs the whole chain outside n8n against a sandbox copy,
   so you can change a rule and see the verdicts without touching the mailbox.
4. `node audit.mjs` produces `gate-audit.txt` — the counts in this README,
   recomputed from the run's own artifacts.
5. `node verify-landed.mjs --uid <uid>` does the Sent Mail diff.

`workflow-rehearsal.json` swaps the IMAP trigger for a manual one so the chain
can be executed from the Execute button. `workflow-batch.json` runs the corpus
without the send node attached, so no delivery claim can ever ride on batch
numbers.

## What this gate cannot verify

That a sender is who they say they are. That a plausible request is a real
one. That a reply which cites correctly is also *useful*. That the transport
won't append to an approved body — it did, 69 bytes of it, and the only reason
this repo can say so is that the diff was run after the fact.

The corpus in `personas.json` is fiction, written for this build and appended
to my own mailbox; every fictional address is on an RFC 2606 reserved domain.
`runs/` is not published — it holds real message bodies and recipient
addresses, which are local evidence, not shippable code.
