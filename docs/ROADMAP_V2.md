# OriginForge: client lifecycle v2 (plan of 28 October 2026)

Everything Younes asked for on 28 Oct, grouped by area, in the order it is built.
Each phase ends with tests passing and a commit; the testing phase walks the whole
flow with a test client and the studio account.

## Phase 1: bugs that block the flow
1. **Review: "Request failed (500)"** when a client sends a review. Reproduce, fix, test.
2. **PayPal stays on "Confirming with PayPal"** after a sandbox payment. Find why the
   capture does not settle (logs, a replay of the approval); the button must never stay
   dimmed: it hands over to the payment tracker, which always ends in paid, held or failed.
3. **PayPal buttons appear abruptly.** Reveal them only once PayPal says they are drawn
   (`onInit`), in a reserved height (no jump), with the site's tear-in.
4. **Revisions unusable on the studio side.** Show each round, and let Younes grant an
   extra round.
5. **"Live" is a dead end.** Live projects get: the maintenance countdown, "report a
   problem" for the client (a maintenance request in the chat), "extend maintenance" and
   "close the project" for Younes; the review invitation stays visible.
6. **Notifications that open nothing** (e.g. "maintenance until"): every notification
   links to the right tab of the project (plan, payments, progress, messages).

## Phase 2: money
1. **Payment schedule.** Deposit (40 or 50 %) due when the contract is signed (5 days,
   as now). The rest is scheduled; Younes can ask for it whenever the work is far enough
   along ("request now"), and it is asked automatically when he marks the work ready
   for review (finalisation). The client may pay a scheduled part early himself.
2. **Extra costs and optional offers.** Younes creates a cost at any time (AI credits,
   APIs, hosting, an extra feature): label, description, amount, currency, and a flag:
   *required* (due now) or *optional* (the client accepts and pays, or declines). It is
   paid like any other payment (card, PayPal, CCP, BaridiMob, USDT, cash if allowed),
   gets its own invoice, sends reminders, and never mixes with the contract total.
   Every cost and offer also appears in the chat as a card, so it can be discussed.
3. **Invoices.** One numbered invoice per payment (OF-2026-0001…), PDF, e-mailed to the
   client with the PDF attached, listed in the client's Payments tab and in the studio.
   Seller details (name, address, tax numbers, legal mention) are set in Studio →
   Settings.

## Phase 3: negotiation
1. **Younes answers a counter-offer** with Accept, Decline, or a new offer (prefilled).
2. **Final offer**: a version the client can only accept or decline.
3. **No negotiation** switch on the first proposal (on by default for product films):
   the client sees Accept and Decline only.

## Phase 4: the contract
1. The contract on a white sheet: letterhead, parties, numbered clauses, the payment
   schedule as a table, two signature blocks (Younes's already signed).
2. Signing draws the client's signature on the sheet in a handwritten stroke, then the
   date and the fingerprint (SHA-256) stamp in.

## Phase 5: messages, like Instagram
1. A chat bubble at the bottom right of the client space and the studio: unread count,
   opens a compact panel, expands to a full window.
2. Bubbles (mine right, theirs left), grouped by time, read marks; replies (quote);
   emoji reactions; sounds for sent and received messages (with mute).
3. Voice notes with a waveform player (no download button); images inline with a
   viewer; files as chips. Progress updates (pictures, preview links) and costs or
   offers arrive as cards in the thread.

## Phase 6: the client space
1. **Home**: the client's projects as cards (status, next step, payment progress, plan,
   unread messages).
2. **Project page in tabs**: Overview (next step, stages, plan and its benefits, key
   dates), Payments (schedule, extras and offers, invoices), Progress (milestones,
   updates, reviews, revisions), Messages, Files, Contract. Notifications open the
   right tab.
3. **The plan is visible**: Standard, Pro or Ultimate with what it includes
   (maintenance until…, revisions left, reply time); the studio shows the plan on every
   request.

## Phase 7: the request form
1. "Show my project in the OriginForge portfolio" or "keep it confidential", as a clear
   choice (it feeds the contract clause and the case-study draft).

## Phase 8: finishing
1. VDZ Service: form and final-page screenshots (local run with invented travellers).
2. Deploy, then the **testing phase**: a test client and the studio account walk the
   whole flow (request, proposal, counter, contract, deposit by card and PayPal, extras,
   progress, review, balance, live, maintenance, close), on desktop and phone, light
   and dark; every bug found is fixed and re-tested.
