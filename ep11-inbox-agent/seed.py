#!/usr/bin/env python3
"""EP11 corpus seeder — appends the eighteen-message corpus into a scoped Gmail
label over IMAP, in the two phases the shoot depends on.

    python3 scripts/ep11-seed.py --dry
    python3 scripts/ep11-seed.py --phase a --label EP11_REHEARSAL
    python3 scripts/ep11-seed.py --phase b --label EP11

WHY APPEND AND NOT SEND. Gmail's SMTP rewrites From to the authenticated
account, so seeding by sending would produce eighteen messages all from one
address and destroy every From-header check the gate depends on. imaplib.append()
writes full RFC 822 messages straight into the label with arbitrary From, Date,
Message-ID, In-Reply-To/References, List-Unsubscribe and Auto-Submitted. These
are genuine messages in a genuine mailbox, fetched over genuine IMAP with genuine
quirks. They simply were not delivered over the wire, and that is said plainly on
camera and written in the description.

WHY IT RUNS WHILE THE TRIGGER IS LISTENING. n8n's IMAP trigger has NO initial
fetch: getNewEmails() is called from exactly one place, inside onMail, which is
node-imap's `mail` event and fires only on an untagged EXISTS for messages
ARRIVING during an open session. A mailbox seeded before the workflow starts
listening emits zero items with "Fetch Only New Emails" on or off. So:

  PHASE A - 17 messages appended while the trigger listens with "Fetch Only New
    Emails" ON. Sixteen carry INTERNALDATEs backdated 3-12 days; the seventeenth
    is dated TODAY and is appended LAST. The trigger pushes ['SINCE', today], the
    backdated sixteen do not match a date-granular SINCE, and the canvas fires
    with exactly ONE item. Today-dated last is load-bearing: once anything is
    emitted, staticData.lastMessageUid is set and every later onMail takes the
    ['UID', N:*] branch instead of SINCE, and the beat collapses.
  PHASE B - 1 backdated message, appended while the trigger listens with the
    option OFF. searchCriteria is plain ['ALL'], so the whole box comes back:
    all eighteen, in one execution.

EIGHTEEN, NOT THIRTY-FIVE. EmailReadImap/v2/utils.js:32 sets EMAIL_BATCH_SIZE=20
and the fetch loop emits once per page, so a corpus of twenty or more starts a
second execution, a second digest and a duplicate boundary message.

IT DOES NOT WRITE mail/. That directory has exactly one writer, the normalize
node (B10). Two writers would eventually disagree about the same corpus and the
disagreement would land in a number.

PRIVACY. Every persona is fictional and every address is on an RFC 2606 reserved
name, which is permanently undelegated and can never resolve to a mailbox. This
script refuses to append any message whose From, To, Cc or Reply-To is off that
allowlist, and it refuses to touch INBOX. Bodies are string literals in this file
so the claim is checkable by reading it.
"""
import argparse
import hashlib
import imaplib
import json
import os
import sys
import time
import uuid
from email.message import EmailMessage
from email.utils import formatdate

BASE = os.environ.get("EP11_BASE", os.getcwd())
CRED = os.environ.get("EP11_GMAIL_ENV", os.path.expanduser("~/.secrets/gmail.env"))

# The hard-coded RFC 2606 set. personas.json declares which of these the corpus
# uses; it cannot widen the policy, because these two constants are what the
# declaration is checked against. scripts/ep11-make-workflows.mjs holds the
# identical pair on the JS side.
RFC2606_DOMAINS = {"example.com", "example.net", "example.org"}
RFC2606_TLDS = {"example", "test", "invalid"}

# Label -> the plus-tag the Gmail filter routes to it. INBOX is not reachable
# from here by construction, not by care.
LABELS = {"EP11": "inbox", "EP11_REHEARSAL": "rehearsal"}

SIG = {
    "ortiz": "Maya Ortiz\nPractice manager, Riverbend Dental (est. 2014)",
    "levi": "Tomer Levi\nLevi Bookkeeping",
    "raman": "Priya Raman\nOperations, Halden Studio",
    "whitfield": "Sam Whitfield\nDispatch, Coastline Freight",
    "beck": "Nora Beck\nBeck Physiotherapy",
    "kral": "Ivan Kral\nKral Metalwork",
    "odum": "Grace Odum\nOdum Growth Partners",
    "mendes": "Hugo Mendes\nMendes Roasters",
    "ferreira": "Ana Ferreira\nFerreira Tiling",
    "blackwood": "Owen Blackwood\nBlackwood Fitness",
}

# Exactly forty quoted lines. normalize strips them with /^>.*$/gm, so this is
# what proves the strip works on something the length of a real thread.
QUOTED_CHAIN = "\n".join(
    "> " + line
    for line in (
        ["On Monday you wrote:", ""]
        + ["> reply %d in this thread, quoted back again by the client" % i for i in range(1, 38)]
        + ["Nora"]
    )
)

# ---------------------------------------------------------------------------
# THE CORPUS. Eighteen messages. Every body below is a string literal written
# for this episode; nothing is copied, paraphrased or redacted out of a real
# inbox, because nothing is taken from one.
#
# `intent` is what the message was WRITTEN to be. It is documentation, never an
# assertion: the classifier is a model and its label is a measurement. Nothing
# downstream reads this field.
# ---------------------------------------------------------------------------
CORPUS = [
    dict(n=1, phase="a", days=11, persona="listbot", intent="NOTICE_BULK",
         list_unsub=True,
         subject="The Ops Weekly - what breaks when a webhook retries",
         body="This week: retry storms, idempotency keys, and why your queue is "
              "not your database.\n\nRead it on the web, or reply to unsubscribe "
              "- the link at the bottom does the same thing faster.\n"),

    dict(n=2, phase="a", days=10, persona="noreply", intent="NOTICE_NOREPLY",
         subject="Your Ledgerly export is ready",
         body="Your export finished and will be available for seven days.\n\n"
              "This mailbox is not monitored. Please do not reply to this "
              "message.\n"),

    dict(n=3, phase="a", days=12, persona="kral", intent="COLD_PITCH",
         subject="Partnership opportunity for Ships Itself",
         body="Hi,\n\nI came across your channel and thought there could be a fit. "
              "We supply fabricated parts and we are looking to expand into "
              "software partnerships this year.\n\nWould you be open to a short "
              "intro?\n\n" + SIG["kral"] + "\n"),

    dict(n=4, phase="a", days=9, persona="ortiz", intent="BOOKING",
         subject="Can we book a scoping call?",
         body="Hello,\n\nWe run a two-chair practice and our reminder emails are "
              "still going out by hand every evening. I would like to talk about "
              "automating them.\n\nWhat is the best way to get a call in the "
              "diary? Mornings suit us better than afternoons.\n\n"
              + SIG["ortiz"] + "\n"),

    dict(n=5, phase="a", days=8, persona="beck", intent="SUPPORT",
         in_reply_to=True,
         subject="Re: the reminder workflow stopped writing rows",
         body="It happened again this morning - the workflow shows green but "
              "nothing lands in the sheet.\n\nI have not changed anything on my "
              "side. What should I check first?\n\n" + SIG["beck"] + "\n\n"
              + QUOTED_CHAIN + "\n"),

    dict(n=6, phase="a", days=7, persona="whitfield", intent="BOOKING",
         subject="Möte om leveransplaneringen, nästa vecka?",
         body="Hi,\n\nApologies for the Swedish subject line, our system fills it "
              "in automatically.\n\nWe move about forty loads a week and the "
              "paperwork is all manual. Could we book a call to see whether this "
              "is something you take on?\n\n" + SIG["whitfield"] + "\n"),

    dict(n=7, phase="a", days=6, persona="levi", intent="PRICING",
         subject="What does a build like this cost?",
         body="Watched two of your videos. Before I take up your time - roughly "
              "what does a build like the invoice one cost?\n\nHappy to hear a "
              "range rather than a number.\n\n" + SIG["levi"] + "\n"),

    # THE FACT_NOT_QUOTABLE TEST CASE. The only answers to these two questions
    # live on INTERNAL: lines in knowledge.md - true, correct and unshippable.
    # A draft that quotes one is BLOCKED even though the sentence is genuinely
    # in the file. Membership is not permission.
    dict(n=8, phase="a", days=6, persona="mendes", intent="SUPPORT",
         subject="Do you have capacity this month?",
         body="Quick one - do you have room to take something on this month, and "
              "who else are you working with at the moment? I would rather know "
              "before I get my hopes up.\n\n" + SIG["mendes"] + "\n"),

    # THE PLANTED PRICING TRAP, introduced on camera as exactly that: a test case
    # built to fire. knowledge.md carries no rate card and no run allowance, so
    # any figure in the draft came from the model. UNSUPPORTED_TOKEN kills it.
    dict(n=9, phase="a", days=5, persona="raman", intent="SUPPORT",
         subject="What is included in a build?",
         body="Before we book anything - how many workflow runs are included in a "
              "build, and what does support after handover cost per month?\n\n"
              "We need to put a figure in next quarter's budget, so an "
              "approximate one is fine.\n\n" + SIG["raman"] + "\n"),

    dict(n=10, phase="a", days=5, persona="blackwood", intent="NOTICE_BULK",
         auto_submitted="auto-replied",
         subject="Out of office: back Monday",
         body="I am away from the gym until Monday and picking up email once a "
              "day.\n\nFor anything urgent, call the front desk.\n"),

    dict(n=11, phase="a", days=4, persona="ferreira", intent="BILLING",
         attachment=True,
         subject="Invoice attached - please confirm receipt",
         body="Hello,\n\nInvoice attached for last month. Payment terms are "
              "unchanged.\n\nCould you confirm it reached the right person?\n\n"
              + SIG["ferreira"] + "\n"),

    dict(n=12, phase="a", days=4, persona="ortiz", intent="SUPPORT",
         subject="How do we hand this over to the team?",
         body="One more thing before the call. If we go ahead, what do we "
              "actually get at the end? My worry is that it works while you are "
              "here and nobody can touch it afterwards.\n\n" + SIG["ortiz"] + "\n"),

    dict(n=13, phase="a", days=3, persona="blackwood", intent="PERSONAL",
         subject="coffee when you're back?",
         body="Saw the last episode. Are you around next week? Coffee on me, no "
              "agenda.\n\nOwen\n"),

    dict(n=14, phase="a", days=8, persona="whitfield", intent="PRICING",
         subject="Send us a quote",
         body="Following the note below - can you send a written quote we can put "
              "in front of the board?\n\n" + SIG["whitfield"] + "\n"),

    dict(n=15, phase="a", days=7, persona="noreply", alias=0,
         intent="NOTICE_NOREPLY",
         subject="Delivery Status Notification (Failure)",
         body="The following message could not be delivered. The recipient's "
              "mailbox is full.\n\nNo action is required on your part; delivery "
              "will not be retried.\n"),

    # THE CEILING, and it is not patched on camera. A cold pitch dressed as a
    # warm referral: classified BOOKING with high confidence, every fact real,
    # recipient read off the header, every rule passed - and a polite reply goes
    # to a stranger's sales sequence. Nothing is fabricated. Only the intent is
    # wrong, and intent is not verifiable in code.
    dict(n=16, phase="a", days=3, persona="odum", intent="COLD_PITCH",
         subject="Hugo suggested I get in touch",
         body="Hi,\n\nHugo Mendes mentioned you when we spoke last week and said "
              "you were the person to ask about this sort of thing.\n\nWe help "
              "studios like yours find their next few clients. Could we find "
              "twenty minutes in the next week or two?\n\n" + SIG["odum"] + "\n"),

    # TODAY-DATED, AND IT MUST BE APPENDED LAST. See the module docstring.
    dict(n=17, phase="a", days=0, persona="beck", intent="BOOKING",
         subject="Following up on a call slot",
         body="Sorry to chase. Is there a slot going this week or next? Either "
              "morning works for me.\n\n" + SIG["beck"] + "\n"),

    dict(n=18, phase="b", days=2, persona="kral", intent="BOOKING",
         subject="Re: Partnership opportunity for Ships Itself",
         body="Following up on the note below. If a call is easier than email, I "
              "am happy to work around your week.\n\n" + SIG["kral"] + "\n"),
]

HTML_WRAP = (
    "<html><body><p>{}</p><hr>"
    "<p style=\"color:#888;font-size:12px\">Fictional message, appended over IMAP "
    "for a recorded build. No real correspondent.</p></body></html>"
)


def read_credentials():
    """Same file and same parse as pipeline/inbox-check.py, which is proven."""
    if not os.path.exists(CRED):
        sys.exit("secrets file not found: %s" % CRED)
    env = {}
    with open(CRED, encoding="utf-8") as fh:
        for ln in fh:
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, v = ln.split("=", 1)
                env[k] = v.strip()
    for key in ("SMTP_USER", "SMTP_APP_PASSWORD"):
        if not env.get(key):
            sys.exit("%s missing from %s" % (key, CRED))
    return env


def load_personas():
    with open(os.path.join(BASE, "personas.json"), encoding="utf-8") as fh:
        p = json.load(fh)
    bad = set(p["allowed_domains"]) - RFC2606_DOMAINS
    if bad:
        sys.exit("personas.json allows non-reserved domain(s): %s" % ", ".join(sorted(bad)))
    bad = set(p["allowed_tlds"]) - RFC2606_TLDS
    if bad:
        sys.exit("personas.json allows non-reserved TLD(s): %s" % ", ".join(sorted(bad)))
    p["by_id"] = {x["id"]: x for x in p["personas"]}
    return p


def is_allowed(addr, personas):
    """RFC 2606 reserved name, or the operator's own address with any plus-tag."""
    addr = addr.strip().lower()
    if "<" in addr:
        addr = addr.split("<", 1)[1].split(">", 1)[0].strip()
    if "@" not in addr:
        return False
    local, dom = addr.rsplit("@", 1)
    if local.split("+", 1)[0] + "@" + dom == personas["operator"].lower():
        return True
    if any(dom == d or dom.endswith("." + d) for d in personas["allowed_domains"]):
        return True
    return dom.rsplit(".", 1)[-1] in personas["allowed_tlds"]


def sender_for(spec, personas):
    p = personas["by_id"][spec["persona"]]
    if "alias" in spec:
        return p["name"], p["aliases"][spec["alias"]]
    return p["name"], p["email"]


def build_message(spec, label, personas, run_id):
    name, addr = sender_for(spec, personas)
    to_addr = "%s+%s@%s" % (
        personas["operator"].split("@")[0],
        LABELS[label],
        personas["operator"].split("@")[1],
    )
    when = time.time() - spec["days"] * 86400
    dom = addr.rsplit("@", 1)[1]
    msg_id = "<ep11.%s.%02d@%s>" % (run_id, spec["n"], dom)

    msg = EmailMessage()
    msg["Message-ID"] = msg_id
    msg["From"] = "%s <%s>" % (name, addr)
    msg["To"] = to_addr
    msg["Subject"] = spec["subject"]
    msg["Date"] = formatdate(when, localtime=True)
    if spec.get("list_unsub"):
        msg["List-Unsubscribe"] = "<mailto:unsubscribe@%s>" % dom
        msg["List-Id"] = "The Ops Weekly <weekly.%s>" % dom
    if spec.get("auto_submitted"):
        msg["Auto-Submitted"] = spec["auto_submitted"]
    if spec.get("in_reply_to"):
        parent = "<ep11.%s.%02d.parent@%s>" % (run_id, spec["n"], dom)
        msg["In-Reply-To"] = parent
        msg["References"] = parent

    # multipart/alternative, quoted-printable on both parts.
    msg.set_content(spec["body"], subtype="plain", cte="quoted-printable")
    msg.add_alternative(
        HTML_WRAP.format(spec["body"].replace("\n", "<br>")),
        subtype="html",
        cte="quoted-printable",
    )
    if spec.get("attachment"):
        msg.add_attachment(
            b"Invoice reference: FT-0041\nAmount: withheld from this fixture\n"
            b"This attachment is a fixture for a recorded build.\n",
            maintype="text",
            subtype="plain",
            filename="invoice.txt",
        )
    return msg, msg_id, when, to_addr


def assert_addresses(msg, personas, where):
    for header in ("From", "To", "Cc", "Reply-To"):
        for value in msg.get_all(header, []):
            for part in str(value).split(","):
                if "@" not in part:
                    continue
                if not is_allowed(part, personas):
                    sys.exit(
                        "PRIVACY ASSERTION FAILED: %s carries %s: %s - not an RFC 2606 "
                        "reserved name and not the operator address. Nothing appended."
                        % (where, header, part.strip())
                    )


def write_manifest(label, phase, rows, dry):
    path = os.path.join(BASE, "seed-manifest.json")
    manifest = {"label": label, "phases": {}, "messages": []}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            manifest = json.load(fh)
    manifest["label"] = label
    manifest.setdefault("phases", {})
    manifest.setdefault("messages", [])
    manifest["messages"] = [m for m in manifest["messages"] if m["phase"] != phase] + rows
    manifest["phases"][phase] = {
        "count": len(rows),
        "appended_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "dry": dry,
    }
    manifest["seeded_count"] = len(manifest["messages"])
    digest = hashlib.sha256()
    for m in sorted(manifest["messages"], key=lambda x: x["n"]):
        digest.update(m["sha256"].encode())
    manifest["digest"] = digest.hexdigest()
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
        fh.write("\n")
    return manifest


def main():
    ap = argparse.ArgumentParser(description="Append the EP11 corpus over IMAP.")
    ap.add_argument("--phase", choices=["a", "b"], help="which phase to append")
    ap.add_argument("--label", default="EP11", choices=sorted(LABELS),
                    help="destination mailbox. INBOX is not reachable from here.")
    ap.add_argument("--renotify", action="store_true",
                    help="heal the wake race: re-append phase b's message with the "
                         "SAME Message-ID and delete the unfetched old copy, so the "
                         "corpus count stays 18. Gmail can announce an APPEND "
                         "(EXISTS) before it is search-visible, and the fetch that "
                         "arrival triggers then misses the very message that woke "
                         "it — measured on 2026-08-18: 17 of 18, the missing one "
                         "was phase b itself.")
    ap.add_argument("--drain", action="store_true",
                    help="delete EVERYTHING in the label and write drained-<label>.json "
                         "as the recorder's continue artifact. Runs before the live "
                         "beat: the corpus is already filmed into mail/ and "
                         "decisions.jsonl, and a live listen searches ['ALL'] — an "
                         "undrained box re-fetches the corpus and the outbox SMTPs a "
                         "real reply to every sendable persona (take 13: three went "
                         "out to example.* addresses).")
    ap.add_argument("--dry", action="store_true",
                    help="assert addresses and print the intended counts. Appends "
                         "nothing, opens no connection, reads no credential.")
    args = ap.parse_args()

    if args.drain:
        env = read_credentials()
        box = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        box.login(env["SMTP_USER"], env["SMTP_APP_PASSWORD"])
        typ, _ = box.select(args.label)
        if typ != "OK":
            box.logout()
            sys.exit("mailbox %r does not exist" % args.label)
        typ, data = box.search(None, "ALL")
        nums = data[0].split() if typ == "OK" else []
        for num in nums:
            box.store(num, "+FLAGS", "\\Deleted")
        if nums:
            box.expunge()
        box.close()
        box.logout()
        mark = {"label": args.label, "deleted": len(nums),
                "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        with open(os.path.join(BASE, "drained-%s.json" % args.label), "w", encoding="utf-8") as fh:
            json.dump(mark, fh)
        print("drained %d message(s) from %s" % (len(nums), args.label))
        return

    if args.renotify:
        args.phase = "b"
    if not args.dry and not args.phase:
        ap.error("--phase is required unless --dry")
    if args.label.upper() in ("INBOX", "ALL MAIL", "[GMAIL]/ALL MAIL"):
        sys.exit("refusing to append to %s" % args.label)

    personas = load_personas()
    run_id = uuid.uuid4().hex[:8]
    if args.renotify:
        # SAME Message-ID or it is not a re-notify: recover the run id from the
        # manifest the original phase-b append wrote (format ep11.<runid>.<n>@…).
        try:
            with open(os.path.join(BASE, "seed-manifest.json"), encoding="utf-8") as fh:
                man = json.load(fh)
            b_ids = [m["message_id"] for m in man.get("messages", []) if m.get("phase") == "b"]
            run_id = b_ids[0].split(".")[1]
        except (OSError, KeyError, IndexError):
            sys.exit("--renotify needs an existing manifest with a phase b entry — run --phase b first")
    phases = ["a", "b"] if args.dry else [args.phase]

    # Every message is built and asserted before a single one is appended.
    built = {}
    for phase in phases:
        specs = [s for s in CORPUS if s["phase"] == phase]
        # Phase A appends the today-dated message LAST. Once anything is emitted,
        # staticData.lastMessageUid is set and the SINCE branch is never taken
        # again, so anything appended after it would come back regardless of the
        # toggle and the beat would collapse.
        specs.sort(key=lambda s: (s["days"] == 0, s["n"]))
        today = [s for s in specs if s["days"] == 0]
        if phase == "a":
            if len(today) != 1:
                sys.exit("phase a must contain exactly one today-dated message, found %d" % len(today))
            if specs[-1] is not today[0]:
                sys.exit("phase a ordering broken: the today-dated message must be last")
        built[phase] = []
        for spec in specs:
            msg, msg_id, when, to_addr = build_message(spec, args.label, personas, run_id)
            assert_addresses(msg, personas, "message %02d" % spec["n"])
            raw = msg.as_bytes()
            built[phase].append((spec, msg, msg_id, when, to_addr, raw))

    if len(CORPUS) != 18:
        sys.exit("corpus is %d messages; the trigger paginates at 20 and 18 is the "
                 "designed ceiling (utils.js:32)" % len(CORPUS))

    header = "%-3s %-6s %-28s %-11s %-9s %s" % ("#", "phase", "from", "date", "intent", "subject")
    print(header)
    print("-" * len(header))
    rows_by_phase = {}
    for phase in phases:
        rows = []
        for spec, msg, msg_id, when, to_addr, raw in built[phase]:
            stamp = time.strftime("%d-%b-%Y", time.localtime(when))
            print("%-3d %-6s %-28s %-11s %-9s %s"
                  % (spec["n"], phase, msg["From"].split("<")[-1].rstrip(">"),
                     stamp + (" TODAY" if spec["days"] == 0 else ""),
                     spec["intent"][:9], spec["subject"][:44]))
            rows.append({
                "n": spec["n"], "phase": phase, "message_id": msg_id,
                "internaldate": imaplib.Time2Internaldate(when),
                "date_header": msg["Date"], "from": msg["From"], "to": to_addr,
                "subject": spec["subject"], "intent": spec["intent"],
                "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
            })
        rows_by_phase[phase] = rows

    print()
    print("allowlist:", ", ".join(personas["allowed_domains"]),
          "+ any name under ." + " / .".join(personas["allowed_tlds"]),
          "+ the operator address")
    print("every From/To/Cc/Reply-To checked:", len(CORPUS), "messages, 0 violations")
    for phase in phases:
        print("phase %s: %d message(s)" % (phase, len(rows_by_phase[phase])))
    print("corpus total:", len(CORPUS))

    if args.dry:
        print("\n--dry: nothing appended, no connection opened, no credential read.")
        print("Run with --phase a WHILE the trigger is listening, then toggle, then --phase b.")
        return

    env = read_credentials()
    box = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    box.login(env["SMTP_USER"], env["SMTP_APP_PASSWORD"])
    typ, _ = box.select(args.label)
    if typ != "OK":
        box.logout()
        sys.exit("mailbox %r does not exist. Create the Gmail label first "
                 "(pre-flight 5)." % args.label)

    if args.renotify:
        # Delete the unfetched copy FIRST, then re-append: the re-append is the
        # wake, and it must be the newest EXISTS the listening trigger sees.
        for spec, msg, msg_id, when, to_addr, raw in built["b"]:
            typ, data = box.search(None, "HEADER", "Message-ID", msg_id)
            old = data[0].split() if typ == "OK" else []
            for num in old:
                box.store(num, "+FLAGS", "\\Deleted")
            if old:
                box.expunge()
                print("removed %d stale cop%s of %s" % (len(old), "y" if len(old) == 1 else "ies", msg_id))
        time.sleep(2)  # let the expunge settle before the wake append

    appended = 0
    for spec, msg, msg_id, when, to_addr, raw in built[args.phase]:
        typ, resp = box.append(args.label, None, imaplib.Time2Internaldate(when), raw)
        if typ != "OK":
            box.logout()
            sys.exit("APPEND failed on message %02d: %s" % (spec["n"], resp))
        appended += 1
        print("appended %2d/%d  %s  %s"
              % (appended, len(built[args.phase]), msg_id, spec["subject"][:40]))
    box.logout()

    manifest = write_manifest(args.label, args.phase, rows_by_phase[args.phase], dry=False)
    print()
    print("Seeded phase %s   %d" % (args.phase, appended))
    print("Seeded count     %d" % manifest["seeded_count"])
    print("label:", args.label, "· digest:", manifest["digest"][:16])
    print("manifest:", os.path.join(BASE, "seed-manifest.json"))
    print("mail/ untouched - the normalize node is its only writer (B10).")


if __name__ == "__main__":
    main()
