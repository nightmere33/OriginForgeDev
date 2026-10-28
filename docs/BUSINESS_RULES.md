# OriginForge business rules

**Approved by Younes on 22 October 2026, with every Recommendation adopted.** These rules are the platform's behaviour: statuses, timers, reminders, prices and the contract text all come from here. Numbers marked as settings are editable in the admin; changing a rule itself means editing this file first.

Approved values at a glance: maintenance 14 / 30 / 60 days · plan surcharge +0 / +15 / +30 % · revisions 2 / 3 / 5 · deposit 40 % (50 % under 60 000 DZD or 400 EUR, or for Rush) · milestones 40 / 30 / 30 above 500 000 DZD or 3 500 EUR · payment window 5 days with reminders on days 2 and 4 · 3 negotiation rounds · proposals expire after 14 days · 2 active projects, then a queue with positions and estimated starts (films taken directly) · all calculator variables at launch.

---

## 1. The three plans

Every project is priced on its scope (what gets built). The plan you pick on top decides **how much care comes after delivery**: free maintenance, response speed, help and priority. New features are never included in any plan; they are always quoted separately.

| | **Starter** | **Pro** | **Ultimate** |
|---|---|---|---|
| Free maintenance after launch | 7 days (your idea) · **Recommendation: 14 days** | 20 days (your idea) · **Recommendation: 30 days** | 1 month (your idea) · **Recommendation: 60 days** |
| Bug fixes during maintenance | Yes | Yes, priority | Yes, first in line |
| Reply time (working days) | within 48 h | within 24 h | same day (within 12 h) |
| Revision rounds during development | 2 | 3 | 5 |
| Small updates during maintenance (text, images, colours, settings) | No | Up to 3 | Unlimited small updates |
| Help and advice (hosting, growth, "how do I…?") | No | Yes, by message | Yes, plus one 30 min call per month during maintenance |
| Monitoring (uptime alert if the site goes down) | No | No | Yes |
| Price on top of the project | included | + 15 % | + 30 % |

**Why I recommend longer maintenance windows:** most bugs appear in the first two to four weeks of real use, when real clients start using the product. Seven days often ends before the client has even told their customers about the launch, and then every small bug becomes a paid argument. A slightly longer window costs you little (you'll fix those bugs anyway to protect your reputation) and is the strongest selling point of a freelancer over a cheap template.

**What "maintenance" covers (the same wording goes in the contract):**
- **A bug** is something that does not work as described in the signed proposal. It is fixed for free during the maintenance window.
- **Not a bug:** new features, design changes, new pages, content the client wants to change (except the small updates allowed by Pro/Ultimate), problems caused by the client's own changes, or outages of third parties (hosting provider, payment provider, Google, etc.).
- The maintenance window starts on the day the project goes to **production**, not the day development ends.
- After the window, maintenance continues on a **monthly care plan** (priced separately) or per request.

---

## 2. The price calculator (what the client can tweak)

Before writing the brief, the signed-in client sees a starting price for the service they chose and can adjust a few variables. The result is an **estimate range**, never a binding price: the binding price is the one in your proposal.

| Variable | Options | Effect on the estimate |
|---|---|---|
| Delivery speed | Standard · Fast (about 30 % shorter) · Rush (about 50 % shorter) | ×1.00 · ×1.25 · ×1.50. Rush only offered while you have free capacity. |
| Plan | Starter · Pro · Ultimate | +0 % · +15 % · +30 % |
| Design | Clean, based on a proven layout · Fully custom with motion | ×1.00 · ×1.35 |
| Languages | 1 included, each extra language | +10 % each (Arabic RTL: +15 %) |
| Platforms (apps) | Web only · Web + Android · Web + Android + iOS | ×1.00 · ×1.6 · ×1.9 |
| Online payments | None · Chargily / CCP flow · Chargily + PayPal | +0 · fixed add-on · fixed add-on |
| Admin back-office | Basic · Full (stats, roles, exports) | +0 · fixed add-on |
| Content | Client provides texts and images · I write and prepare them | +0 · fixed add-on |

- Every factor and add-on amount is **editable in the admin**, per service and per currency (DZD and EUR/USD). You can change prices any time without touching code.
- The estimate is shown as a range (for example "between 180 000 and 240 000 DZD") because the real scope is only known after reading the brief.
- The chosen options are saved with the request, so you see exactly what the client expected when you write the proposal.

---

## 3. The client journey, step by step

### 3.1 Arriving (Instagram, TikTok, Facebook…)
- The site works inside in-app browsers: videos play muted inline, the 3D hero falls back to a light version on weak phones, and nothing depends on pop-up windows.
- **Important:** Google blocks its sign-in inside the Instagram and Facebook in-app browsers. When we detect one, the site shows a small "Open in your browser" hint next to the Google button. E-mail sign-in and Facebook sign-in still work inside the app.

### 3.2 Signing in before requesting
- Clicking **Request** on a service asks the visitor to sign in first: **Google**, **Facebook**, or e-mail and password. **Apple** comes later (it needs an Apple Developer account, about 99 USD per year).
- Signing in first means you always know who you're talking to, and the client can leave and come back to an unfinished request.

### 3.3 The request (the form that exists today, extended)
- Service, the calculator options above, goals, requirements, features, budget range, ideal date, reference links and files (briefs, mock-ups, **voice notes** too).
- **Drafts:** if the client leaves halfway, everything is saved in their account (not just on their device) and they can continue later from their client space.

### 3.4 Review
- You see new requests in the studio inbox and mark them **In review**. The client sees that immediately.
- You can ask questions (**Needs clarification**). The client answers in the project conversation.
- You **decline** (a short reason is required, the client is told politely) or you **send a proposal**.
- **Promise to clients:** a first answer within 24 hours on working days.

### 3.5 Proposal and negotiation
A proposal contains: scope, deliverables, final price and currency, the plan, payment terms (deposit %), timeline with milestones, included revisions, what is **not** included, and an expiry date.

The client can **accept**, **decline**, or **counter-offer** (a different price, optionally with less scope).
- You answer a counter with a new version of the proposal, or you accept the client's price.
- **Recommendation: three rounds maximum** (your offer, their counter, your final). After that the request closes unless you reopen it. This stops endless haggling without being rude.
- Every version is kept. Nobody can change a proposal after it was sent; a change always creates a new version.
- A proposal **expires after 14 days** if nobody answers.

### 3.6 Contract and e-signature
When the price is agreed, the platform generates the contract from the accepted proposal plus these rules. The client signs it online:
1. reads the contract (a scroll-through page, also downloadable as PDF),
2. ticks "I have read and agree to this contract",
3. types their **full name** as a signature (optionally draws it with the finger on a phone),
4. confirms.

The platform records the date and time, the IP address, the device, and a fingerprint (SHA-256) of the exact contract text, then sends a signed PDF to both of you. This is a "simple electronic signature", the standard for freelance agreements. It is strong evidence of agreement, but it is not a certified signature: for very large contracts, an extra signed paper or a lawyer's review is wise.

### 3.7 Deposit
- **Deposit: 40 % of the price** (your range was 40 to 50 %). **Recommendation:** 40 % as the default, **50 %** for small projects under 60 000 DZD (or 400 EUR) and for Rush delivery, because those carry more risk for you.
- For large projects (above 500 000 DZD or 3 500 EUR), use **milestones** instead: 40 % deposit, 30 % at the main milestone, 30 % before launch.
- Payment methods: CCP, BaridiMob (RIP), cash, Chargily (CIB / Edahabia), PayPal and card (international).
  - **Cash by hand** is off by default: you switch it on in the proposal, only for clients you know and trust (added 28 October 2026). You can still record cash yourself on any project.
  - **Chargily** pays DZD charges; Chargily's card fee is added on its page, paid by the client (§5).
  - **PayPal** pays EUR and USD charges in their currency, and DZD charges in US dollars at the live street rate (§5.1), rounded up to the cent. The amount is fixed the moment PayPal opens, and PayPal must capture exactly that amount.
  - Online payments confirm themselves through the provider's signed notice; the client sees each step on the project page. A payment that arrives for a charge already paid (or expired) is flagged to you to refund, never counted twice.
- **Payment window: 5 days** after signing. Reminders go out automatically on day 2 and day 4. If nothing arrives, the request is marked **expired**. The client can ask to revive it (the proposal is then re-checked against your current calendar and prices).
- Manual payments (CCP, BaridiMob, cash): the client uploads a photo of the receipt; you confirm it in the studio. Card payments confirm themselves.
- **Work starts only when the deposit is confirmed.** The project start date and deadlines are counted from that day.

### 3.8 Development
- The project gets **milestones and tasks**, each with an estimated time remaining that the client can see (for example "Payment page, about 3 days left").
- You post **progress updates** with screenshots, videos and preview links at least once a week. **Recommendation:** at least weekly for Starter and Pro, twice a week for Ultimate.
- The client can **approve** a milestone or **request changes** on it. Changes that stay within the agreed scope use the included revision rounds. Anything new becomes a **change request**: a small quote that must be accepted (and paid, if needed) before you build it.
- **Conversation:** text messages, files and **recorded voice messages**, all inside the project, with read receipts and e-mail alerts.
- **Client delays:** if you are waiting on the client (content, feedback, access) for more than 5 working days, the timeline pauses automatically and the client is told. After 30 days without any answer, the project goes **on hold**; after 60 days it is **closed**, and the deposit covers the work already done.

### 3.9 Review, final payment and production
1. You mark development **ready for review**. The client tests on a preview link.
2. The client approves (or uses their remaining revision rounds).
3. The **balance (60 %)** is requested, with the same payment window and reminders.
4. Once it's paid, you put the project **in production**. The client is alerted ("Your project is live").
5. **Handover:** source code, accounts, passwords and short documentation are delivered in the client space. Ownership of the code passes to the client at this point, not before.
6. The **maintenance window** of their plan starts.

### 3.10 Closure
- When maintenance ends, the project is **closed**. The client keeps access to everything (files, conversation, invoices) and can request new work or a monthly care plan.
- The platform asks for a short **review** (shown on the site only if they agree and you approve it).

---

## 4. Capacity and the queue

**Changed by Younes on 27 October 2026: nobody is turned away; requests queue.**

- **Lanes.** Each service either shares the studio's limit (Site settings, "projects at once", 2 by default), has a limit of its own, or is **taken directly** and never queues (product films). All of it is set per service in the studio (Services).
- A place is taken by a project awaiting its deposit, in development or in client review, and by a request just released from the queue (its place is held until it starts).
- A request sent to a full lane, or to a lane where others already wait, **joins the queue** (first come, first served). The request form says so before sending: "Full right now… your request joins the queue at #N, estimated start around <date>". The first e-mail repeats the position and the date.
- **Estimated start** = when the earliest place frees (projects' deadlines, or start plus timeline), after everyone ahead has had theirs (their proposal's timeline, else the service's typical length).
- When a place frees (a project ships, a request is declined, withdrawn or expires), the head of the queue is told "it's your turn" by e-mail; everyone behind sees their new position on the site. The studio is told who is next.
- Younes can **start a request now** (ahead of the queue), put it back, or move it up or down (studio, Queue).
- **Every request gets a first answer within 24 to 48 hours**, queued or not (both figures are settings). After 24 hours without an answer the studio gets one reminder.
- **Pausing starts** (holidays) puts every new request in the queue, with "back from" as the earliest start. Messages and questions always stay open.

---

## 5. Money rules

- Prices are in **DZD** for Algerian clients and **EUR or USD** for international clients. The currency is fixed in the proposal.
- **Third-party costs** are paid by the client at cost: domain, hosting, paid APIs, store developer accounts (Google Play, Apple), Chargily and PayPal fees. You can set them up and invoice them, but they are not part of your price.
- Every payment produces a **receipt** in the client space.
- **Cancellation by the client:**
  - before work starts: the deposit is refunded minus 10 % (administration and time spent on the proposal);
  - after work starts: the deposit is not refunded; work done until then is delivered.
- **Cancellation by you** (illness, emergency): any amount not covered by delivered work is refunded in full.

### 5.1 Display currency and exchange rates (added 23 October 2026)

- Visitors and clients choose the currency prices are shown in: **DZD, EUR or USD** (nav switcher, and *Settings* in the client space). The choice is remembered on the device and on the account.
- Rates are the **street (parallel) rates**, not the Bank of Algeria rate. Source: **Binance P2P USDT/DZD** (midpoint of the buy and sell medians), with USDT taken as the street dollar; the euro is the street dollar crossed with the **ECB EUR/USD** rate. Refreshed every 30 minutes. If a source is down, the last good rate stays in use; with nothing stored yet the fallback is **256 DZD per USDT**. You can force a rate in *Site settings → street dollar override*.
- **Prices are set in DZD.** EUR and USD follow the live rate and are shown with "≈". Adding a price for EUR or USD on a service in the admin fixes that currency instead (useful if you want separate international pricing).
- A **contract keeps its currency**. Other currencies only appear as "≈" equivalents beside the real amount.

### 5.2 USDT payments (BEP20)

- Clients can pay any due amount in **USDT on BNB Smart Chain (BEP20)** to your address in *Site settings → USDT address*. While the address is empty, USDT shows as "Soon".
- The amount to send is the due amount converted at the live USDT rate, **rounded up to the cent**. The client pastes the **transaction hash**; the quote (USDT amount and rate) is locked in at that moment.
- You confirm the payment after checking the transaction on BscScan (one click from the receipt). One transaction can only pay one charge.

---

## 6. Ownership and portfolio

- The client owns the code and content **after the final payment**. Until then, you own it.
- You may show the project in your portfolio and on social media **unless the client asks for confidentiality** before signing (an NDA checkbox in the proposal). The platform respects that flag automatically.

---

## 7. What the platform will track for you (studio)

- All requests, proposals and versions, contracts and signatures, payments and receipts, milestones and tasks with time remaining, the conversation, and files.
- **Business metrics:** requests per month, how many become projects, revenue per month and currency, outstanding balances, average time per stage, and which plan sells best.
- **History:** every important action (who did what and when) is logged, so there is never an argument about who said what.

---

## 8. Decisions

All recommended values approved on 22 October 2026. Still to provide: Google Cloud and Facebook developer keys for the sign-in buttons, and Chargily / PayPal merchant keys for online payments.
