// The full job in one Code by Zapier step (Run Javascript).
// NOTE: on the free tier this DIES — code steps are capped at 1 second of
// runtime, and the network fetch alone exceeds it. Shown as-is in the episode.
const res = await fetch('YOUR_CSV_URL');
const raw = await res.text();
const [header, ...lines] = raw.trim().split('\n');
const cols = header.split(',');
const deals = lines.map(l => {
  const v = l.split(',');
  return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
});
const won = deals.filter(d => d.status === 'won');
let total = 0;
const invoices = won.map(d => {
  const amount = Number(d.amount_usd);
  const billed = d.billing_cycle === 'quarterly'
    ? Math.round(amount / 3 * 100) / 100 : amount;
  total += billed;
  return { client: d.client, billed_usd: billed };
});
output = { invoices: invoices.length, total_billed: Math.round(total * 100) / 100 };
