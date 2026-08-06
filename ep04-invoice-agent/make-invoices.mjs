/**
 * Renders the 13 demo invoices as PNGs — fictional vendors billing a fictional
 * company ("Northgate Labs"). Four visual templates so the set looks like a
 * real AP inbox, not one form filled thirteen times. Invoice 10 is deliberately
 * a bad scan (rotated, grayscale, noisy) to stress the vision model.
 *
 * Planted problems the gate must catch:
 *   #11 total ≠ PO amount (surprise "priority support fee")
 *   #12 no PO number anywhere on the document
 *   #13 exact duplicate of invoice #2's number
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'data', 'invoices');
fs.mkdirSync(OUT, { recursive: true });

const BUYER = 'Northgate Labs Inc.<br>400 Sample Street<br>Springfield, CO 80014';

const INVOICES = [
  { file: 'inv-01', tpl: 'modern', vendor: 'Beacon Hosting Co.', addr: '18 Harbor Way, Portland, OR', num: 'INV-3021', date: 'Jul 28, 2026', due: 'Aug 27, 2026', po: 'PO-2081',
    items: [['Cloud hosting — July', '840.00']], total: '840.00' },
  { file: 'inv-02', tpl: 'classic', vendor: 'Fieldstone Office Supply', addr: '92 Mill Road, Boise, ID', num: 'INV-1447', date: '29/07/2026', due: '28/08/2026', po: 'PO-2082',
    items: [['Copy paper, A4 (12 reams)', '86.40'], ['Toner cartridges (4)', '183.80'], ['Whiteboard markers', '42.25']], total: '312.45' },
  { file: 'inv-03', tpl: 'compact', vendor: 'Cobalt Cloud Services', addr: '500 Congress Ave, Austin, TX', num: 'CC-88412', date: '2026-07-30', due: '2026-08-29', po: 'PO-2083',
    items: [['Team plan — 12 seats × $99', '1,188.00']], total: '1,188.00' },
  { file: 'inv-04', tpl: 'modern', vendor: 'Juniper Print Studio', addr: '7 Alder Lane, Asheville, NC', num: 'JPS-0912', date: 'Jul 30, 2026', due: 'Aug 14, 2026', po: 'PO-2084',
    items: [['Tri-fold brochures × 2,000', '395.00'], ['Design touch-up', '60.00']], total: '455.00' },
  { file: 'inv-05', tpl: 'classic', vendor: 'Alto Logistics', addr: '1200 Dock Street, Tacoma, WA', num: 'AL-77103', date: '31/07/2026', due: '30/08/2026', po: 'PO-2085',
    items: [['Freight — Q3 shipment, 2 pallets', '1,980.00'], ['Fuel surcharge', '160.00']], total: '2,140.00' },
  { file: 'inv-06', tpl: 'compact', vendor: 'Marlow & Finch Legal', addr: '44 Court Square, Richmond, VA', num: 'MF-2026-081', date: 'Aug 1, 2026', due: 'Aug 31, 2026', po: 'PO-2086',
    items: [['Contract review retainer — August', '1,500.00']], total: '1,500.00' },
  { file: 'inv-07', tpl: 'modern', vendor: 'Quarry Analytics', addr: '310 5th Ave, Seattle, WA', num: 'QA-5518', date: '2026-08-01', due: '2026-08-31', po: 'PO-2087',
    items: [['Data plan — July usage', '624.00']], total: '624.00' },
  { file: 'inv-08', tpl: 'classic', vendor: 'Hartline Catering', addr: '65 Orchard St, Denver, CO', num: 'HC-2237', date: 'Aug 2, 2026', due: 'Aug 16, 2026', po: 'PO-2088',
    items: [['Offsite lunch — 24 guests', '336.00'], ['Delivery + setup', '53.60']], total: '389.60' },
  { file: 'inv-09', tpl: 'modern', vendor: 'Beacon Hosting Co.', addr: '18 Harbor Way, Portland, OR', num: 'INV-3106', date: 'Aug 3, 2026', due: 'Sep 2, 2026', po: 'PO-2089',
    items: [['Cloud hosting — August', '840.00']], total: '840.00' },
  { file: 'inv-10', tpl: 'scan', vendor: 'Pemberton Facilities', addr: '9 Depot Rd, Springfield, CO', num: 'PF-4402', date: '02/08/2026', due: '01/09/2026', po: 'PO-2090',
    items: [['Office deep clean — all floors', '640.00'], ['Carpet treatment', '120.00']], total: '760.00' },
  { file: 'inv-11', tpl: 'compact', vendor: 'Cobalt Cloud Services', addr: '500 Congress Ave, Austin, TX', num: 'CC-88977', date: '2026-08-03', due: '2026-09-02', po: 'PO-2091',
    items: [['Team plan renewal — 12 seats', '1,188.00'], ['Priority support fee', '118.80']], total: '1,306.80' },
  { file: 'inv-12', tpl: 'modern', vendor: 'Sable Creative GmbH', addr: 'Hafenstr. 12, Hamburg, DE', num: 'SC-2026-19', date: 'Aug 4, 2026', due: 'Aug 18, 2026', po: null,
    items: [['Brand consultation — half day', '980.00']], total: '980.00' },
  { file: 'inv-13', tpl: 'classic', vendor: 'Fieldstone Office Supply', addr: '92 Mill Road, Boise, ID', num: 'INV-1447', date: '29/07/2026', due: '28/08/2026', po: 'PO-2082',
    items: [['Copy paper, A4 (12 reams)', '86.40'], ['Toner cartridges (4)', '183.80'], ['Whiteboard markers', '42.25']], total: '312.45' },
];

const rows = (items, pad = '10px 14px') =>
  items.map(([d, a]) => `<tr><td style="padding:${pad}">${d}</td><td style="padding:${pad};text-align:right">$${a}</td></tr>`).join('');

const TPL = {
  modern: (v) => `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1f2b;padding:56px 64px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:6px solid #2b4c7e;padding-bottom:24px">
        <div><div style="font-size:30px;font-weight:700">${v.vendor}</div><div style="color:#6b7280;margin-top:6px">${v.addr}</div></div>
        <div style="font-size:40px;font-weight:200;letter-spacing:6px;color:#2b4c7e">INVOICE</div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:32px">
        <div><div style="color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:1px">Billed to</div><div style="margin-top:8px;line-height:1.5">${BUYER}</div></div>
        <table style="font-size:15px"><tr><td style="color:#6b7280;padding:3px 18px 3px 0">Invoice #</td><td style="font-weight:600">${v.num}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 18px 3px 0">Date</td><td>${v.date}</td></tr>
        <tr><td style="color:#6b7280;padding:3px 18px 3px 0">Due</td><td>${v.due}</td></tr>
        ${v.po ? `<tr><td style="color:#6b7280;padding:3px 18px 3px 0">PO number</td><td style="font-weight:600">${v.po}</td></tr>` : ''}</table>
      </div>
      <table style="width:100%;margin-top:44px;border-collapse:collapse;font-size:15px">
        <tr style="background:#2b4c7e;color:#fff;text-align:left"><th style="padding:12px 14px">Description</th><th style="padding:12px 14px;text-align:right">Amount</th></tr>
        ${rows(v.items)}
      </table>
      <div style="text-align:right;margin-top:28px;font-size:22px">Total due <span style="font-weight:700;margin-left:20px">$${v.total}</span></div>
      <div style="color:#9ca3af;font-size:12px;margin-top:70px">Payment via ACH within terms. Thank you for your business.</div>
    </div>`,
  classic: (v) => `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#222;padding:60px 70px">
      <div style="text-align:center;border-bottom:1px solid #222;padding-bottom:18px">
        <div style="font-size:32px">${v.vendor}</div><div style="font-style:italic;color:#555;margin-top:4px">${v.addr}</div>
      </div>
      <div style="text-align:center;font-size:20px;letter-spacing:8px;margin:26px 0">I N V O I C E</div>
      <div style="display:flex;justify-content:space-between;font-size:15px">
        <div><u>Bill to:</u><div style="margin-top:6px;line-height:1.5">${BUYER}</div></div>
        <div style="line-height:1.7;text-align:right">No. <b>${v.num}</b><br>Date: ${v.date}<br>Due: ${v.due}${v.po ? `<br>Ref. PO: <b>${v.po}</b>` : ''}</div>
      </div>
      <table style="width:100%;margin-top:38px;border-collapse:collapse;font-size:15px;border-top:2px solid #222;border-bottom:2px solid #222">
        ${rows(v.items, '12px 8px')}
      </table>
      <div style="text-align:right;margin-top:22px;font-size:19px">Balance due: <b>$${v.total}</b></div>
      <div style="text-align:center;color:#777;font-size:13px;margin-top:80px">Kindly remit payment by the due date.</div>
    </div>`,
  compact: (v) => `
    <div style="font-family:'SF Mono',Menlo,monospace;color:#111;padding:54px 60px;font-size:14px">
      <div style="display:flex;justify-content:space-between"><div style="font-size:22px;font-weight:700">${v.vendor}</div><div style="background:#111;color:#fff;padding:6px 16px;font-size:15px">INVOICE ${v.num}</div></div>
      <div style="color:#555;margin-top:4px">${v.addr}</div>
      <div style="margin-top:28px;display:flex;gap:60px">
        <div>BILL TO<br><span style="color:#333;line-height:1.6">${BUYER}</span></div>
        <div>ISSUED: ${v.date}<br>DUE: ${v.due}${v.po ? `<br>PO: ${v.po}` : ''}</div>
      </div>
      <table style="width:100%;margin-top:34px;border-collapse:collapse">
        <tr style="border-bottom:1px dashed #111;text-align:left"><th style="padding:8px 6px">ITEM</th><th style="padding:8px 6px;text-align:right">USD</th></tr>
        ${rows(v.items, '8px 6px')}
        <tr style="border-top:1px dashed #111"><td style="padding:10px 6px;font-weight:700">TOTAL</td><td style="padding:10px 6px;text-align:right;font-weight:700">$${v.total}</td></tr>
      </table>
      <div style="color:#888;margin-top:64px">// net terms apply — see master agreement</div>
    </div>`,
  scan: (v) => `
    <div style="background:#e8e6e1;padding:40px;min-height:1334px">
      <div style="font-family:'Courier New',monospace;color:#2d2d2d;background:#f6f4ef;padding:50px 58px;transform:rotate(-1.3deg);box-shadow:0 4px 18px rgba(0,0,0,.35);filter:grayscale(1) contrast(.92) brightness(.97)">
        <div style="font-size:24px;font-weight:700">${v.vendor}</div>
        <div style="color:#555">${v.addr}</div>
        <div style="margin:22px 0;font-size:18px;letter-spacing:4px">* * * INVOICE * * *</div>
        <div>No: ${v.num} &nbsp; Date: ${v.date} &nbsp; Due: ${v.due}</div>
        <div>${v.po ? `PO Ref: ${v.po}` : ''}</div>
        <div style="margin-top:18px">Bill to: ${BUYER.replaceAll('<br>', ', ')}</div>
        <table style="width:100%;margin-top:30px;border-collapse:collapse;font-family:inherit;font-size:15px">
          ${rows(v.items, '9px 4px')}
        </table>
        <div style="margin-top:20px;font-size:18px">TOTAL DUE ......... $${v.total}</div>
        <div style="margin-top:60px;color:#666">received AP desk — pls process</div>
      </div>
    </div>`,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1414 }, deviceScaleFactor: 1 });
for (const inv of INVOICES) {
  await page.setContent(`<body style="margin:0;background:#fff">${TPL[inv.tpl](inv)}</body>`);
  await page.screenshot({ path: path.join(OUT, `${inv.file}.png`) });
  console.log(`${inv.file}.png  ${inv.vendor}  $${inv.total}${inv.po ? '' : '  (no PO)'}`);
}
await browser.close();
console.log(`\n${INVOICES.length} invoices rendered to ${OUT}`);
