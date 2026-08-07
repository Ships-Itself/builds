# EP06 — The $0 Booking Page (a Calendly Replacement)

Three n8n nodes: a hosted form, a pure-code gatekeeper, and a confirmation
page. Booked slots land in a CSV, every booking writes a real `.ics` calendar
invite, and double-bookings are refused — demonstrated live on camera.

## The measured build (2026-08-07, one take)

| Metric | Value |
|---|---|
| Blank canvas → published page | 85 seconds |
| Including two live submissions | 105 seconds |
| Live demo | 1 booked (invite written) · 1 double-booking blocked |
| Monthly cost | $0 (self-hosted n8n on a box you already have) |

Price anchor, verified on calendly.com/pricing at time of recording:
Calendly Standard is $10/seat/month (annual billing); the free tier covers
one event type and one calendar.

## Run it yourself

1. Self-hosted n8n with: `NODE_FUNCTION_ALLOW_BUILTIN=fs,path`,
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`
2. Env var: `EP06_DIR` = this folder (holds `data/bookings.csv`, gets `out/`)
3. Import `workflow.json`, publish, and open the form's Production URL
4. Book a slot — then try booking it again

## What this doesn't do

Sync Google Calendar (that's an OAuth flow — the invites are `.ics` files on
disk), handle timezones (slots run on the server's clock), send confirmation
emails, or serve the public internet (it's on localhost until you put it
behind a domain). If Calendly's free tier covers you, use it — this build
replaces the paid seat, not the concept.
