# Support, conversations and the assistant

How people reach Younes on the site, and how fast they are answered. Written
29 Oct 2026 from Younes's brief and a look at how the big help desks do it.

## What the big help desks do (and what we take)

- **One messenger, two kinds of thread.** Intercom starts everything in the
  Messenger: quick conversations and tracked tickets live side by side in one
  window, the tickets in their own space. We do the same: one launcher, with
  the project conversations and the support tickets in separate spaces.
- **Bot first, a human on request, with no maze.** Users abandon when they
  must press several buttons before reaching a person; a plain "talk to a
  person" must always be one tap away. Our assistant answers first and always
  shows "Talk to Younes", which opens a ticket carrying the transcript.
- **Service levels by priority, the most demanding first.** Zendesk applies
  the first matching SLA policy, top-down, with VIP customers first; targets
  are a first-reply time and a next-reply time. We map the client's standing
  (care plan, active project, past client, newcomer) to a priority and a
  reply target.
- **Statuses: open, pending, solved, closed.** Pending means waiting on the
  customer and pauses the clock; a customer reply reopens; solved tickets close
  by themselves after a while; pending tickets with no answer close after 48
  to 72 h (Freshdesk's guidance). We auto-solve after 7 days pending (with a
  reminder at 3) and close 72 h after solved.
- **Canned replies.** Every help desk has macros; ours are slash commands
  typed in the composer (`/how-start` sends the how-to film).

Sources: Zendesk SLA policies (support.zendesk.com/hc/en-us/articles/204770038),
Zendesk ticket lifecycle (support.zendesk.com/hc/en-us/articles/8263915942938),
Freshdesk ticket statuses (support.freshdesk.com/support/solutions/articles/196642),
Intercom conversations and tickets (intercom.com/changes, community.intercom.com),
Cloudflare Workers AI pricing (developers.cloudflare.com/workers-ai/platform/pricing).

## Who gets what

| Standing | When | Priority | First reply within |
|---|---|---|---|
| Ultimate | an Ultimate project in progress or in maintenance | 1 | the plan's reply time (12 h) |
| Pro | a Pro project in progress or in maintenance | 2 | 24 h |
| Starter | a Starter project in progress or in maintenance | 3 | 48 h |
| Past client | a finished project, care over | 4 | 48 h |
| Requester | a request sent, no project yet | 4 | 48 h |
| Newcomer | an account, nothing sent | 5 | 72 h, best effort |

The reply time comes from the plan itself (Studio → Services), so changing a
plan's promise changes the target. The standing is taken when the ticket is
opened and again at each client message (a newcomer who starts a project moves
up). The studio inbox lists overdue tickets first, then by priority, then by
due time. Every client sees their own line ("Pro plan: replies within 24 h");
newcomers see that projects and care plans are answered first, with a link to
the plans. That is where the plans earn their value.

## The three spaces of the messenger

1. **Assistant**, for everyone, guests included. It answers from the site's
   own knowledge: FAQ, services and starting prices, plans, payments, process,
   maintenance, support levels. Retrieval runs on the server (no outside
   service). When `CF_AI_ACCOUNT_ID` and `CF_AI_TOKEN` are set, a small model
   on Cloudflare Workers AI (free: 10,000 Neurons a day) writes the answer
   from what retrieval found; past a daily cap, or on any error, the plain
   retrieval answer is shown. "Talk to Younes" opens a ticket with the
   conversation attached (guests sign in first).
2. **Projects**, the conversation of each request once it is sent (never for
   drafts). Proposals, counter-offers and answers appear as cards; when Younes
   sends a proposal the thread opens by itself on the client's screen. It
   closes 72 h after maintenance ends (docs/BUSINESS_RULES.md).
3. **Support**, tickets for any signed-in person: a question, a problem, billing,
   anything. Past clients whose project conversation has closed keep this.
   Younes can also start a conversation with anyone from Studio → People.

## Slash commands

Typed at the start of a message, in any thread, by either side:

- `/how-start`: the how-to film, in the reader's language when it exists
- `/showreel`: the studio film
- `/start`: the link to start a project
- `/plans`: the care plans and what each includes
- `/pay`: the payment methods
- `/work`: the portfolio

## Studio

- **People**: every account with its standing, projects, open tickets, last
  visit; search and filters; start a conversation.
- **Support**: the ticket inbox, by priority and due time, with internal notes
  only the studio sees.
- **Media**: the films in full quality (the originals, not the web encodes),
  each with its post caption, to download on a phone and publish.

## Turning on the free model (optional)

The assistant works without it, answering with the closest note itself. With
it, a small model rewrites that note as a short, natural answer.

1. In the Cloudflare dashboard (the account that already serves the domain),
   open **AI → Workers AI** and copy the **Account ID**.
2. Create an API token with the template **Workers AI** (permission
   "Workers AI: Read"), and copy it.
3. On the server, save both without them ever showing:

       bash /srv/originforge/app/deploy/set_secret.sh CF_AI_ACCOUNT_ID
       bash /srv/originforge/app/deploy/set_secret.sh CF_AI_TOKEN

The free allowance is 10,000 Neurons a day, a few hundred answers. The site
stops calling the model after `ASSISTANT_DAILY_LIMIT` answers (300 by
default) and falls back to the notes, so it never costs anything.

## Media library

Originals go up once from the PC, then are registered on the server:

    scp OriginForge-Promo-EN-v5.1.mp4 post-description.txt root@SERVER:/tmp/of-library/
    sudo -u originforge -H bash -c 'cd /srv/originforge/app/backend && \
      .venv/bin/python manage.py add_library_film /tmp/of-library/OriginForge-Promo-EN-v5.1.mp4 \
      --title "OriginForge promo" --kind promo --lang en --caption /tmp/of-library/post-description.txt'

The same title and language replaces the earlier cut.
