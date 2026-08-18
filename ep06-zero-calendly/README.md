# EP06 — The $0 Booking Page (a Calendly Replacement)

## The problem

A booking page is a form, a list of taken slots, and one rule: don't sell the
same slot twice. That is a Code node. The paid seat is for the polish.

Three n8n nodes: a hosted form, a pure-code gatekeeper, and a confirmation
page. Booked slots land in a CSV, every booking writes a real `.ics` calendar
invite, and double-bookings are refused — demonstrated live, on camera.

## The measured build (2026-08-07, one take)

| Metric | Value |
|---|---|
| Blank canvas → published page | **85 seconds** |
| Including two live submissions | 105 seconds |
| Live demo | 1 booked (invite written) · 1 double-booking blocked |
| Monthly cost | $0 (self-hosted n8n on a box you already have) |

Price anchor, verified on calendly.com/pricing at time of recording: Calendly
Standard is $10/seat/month on annual billing; their free tier covers one event
type and one calendar.

## The honest part

- **The gatekeeper has a race condition.** It reads the CSV, checks the slot,
  then appends. Two submissions landing in the same instant can both read
  "free" and both write. It never happened on camera, and it will happen to you
  the day the page gets busy. The fix is a lock or an atomic append — not a
  bigger prompt.
- **The CSV is written with `join(',')` and no escaping.** A guest whose name
  contains a comma will shift the columns of that row and quietly corrupt the
  next read. User input becomes file content: sanitize it.
- **85 seconds is one take by someone who had already built it.** It measures
  how little ceremony n8n needs to publish a working form, not how long this
  takes to invent.
- **Slots are hard-coded** to 09:00–15:00 in the gatekeeper *and* in the form's
  dropdown. Changing your hours means editing both, in two places, which is
  exactly the kind of duplication that drifts.

## What's in this folder

| File | What it is |
|---|---|
| `workflow.json` | The three-node workflow, exactly as it ran |
| `data/bookings.csv` | The slot ledger the gatekeeper reads and appends to |
| `out/` | The `.ics` invite written by the on-camera booking |

## Run it yourself

1. Self-hosted n8n, started with:
   - `NODE_FUNCTION_ALLOW_BUILTIN=fs,path`
   - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
2. Set `EP06_DIR` to this folder (it holds `data/bookings.csv` and gets `out/`)
3. Import `workflow.json`, publish it, and open the form's Production URL
4. Book a slot — then try booking the same one again

## What this doesn't do

It doesn't sync Google Calendar — the invites are `.ics` files on disk, and
syncing is an OAuth flow. It doesn't handle timezones; slots run on the
server's clock. It doesn't send confirmation emails, and it doesn't serve the
public internet until you put it behind a domain.

And if Calendly's free tier covers you, use Calendly. This build replaces the
paid seat, not the concept.

---

Episode: [Calendly Charges $10/mo. I Built It in n8n in 85 Seconds for $0.](https://www.youtube.com/watch?v=qq7HJG5JAV0)
· [all builds](../)
