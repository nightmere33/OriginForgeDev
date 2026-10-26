# OriginForge: open tasks

Saved 26 October 2026, to pick up when there is usage budget. Branch
`rebuild/originforge`; **nothing of the rebuild is committed yet** (do that first).

## Built in the last batch (working, not committed)

- Live updates: Django Channels (`backend/live/`), one WebSocket per signed-in visitor,
  in-app notifications, nav bell with toasts, conversations, request lists and project hubs
  refresh live (poll kept at 90 s as a safety net).
- E-mail: Gmail SMTP wired in `backend/.env` (password still empty), branded HTML twin of
  every e-mail, language-aware, reply-to the studio.
- Onboarding (`/welcome`): language, currency, how they found you, preferred channel +
  handle; portal nudge; the studio sees the preference on each request.
- Account deletion (Settings): password + typed word, anonymises, keeps legal records,
  refused during an active project; confirmation e-mail.
- Start wizard: price figures decode on change; desktop notice that follows the scroll and
  docks back into the estimate; drafts open by `?draft=REF`, start fresh, discard; portal
  rows can delete a draft.
- `ForgeVideo` player: no download / PiP / casting / context menu (film, showreel, progress).
- Reviews: verified (live/closed projects only), one per project, consent, moderation page
  `/studio/reviews`, client form in the project hub, home Reviews section (count-up score,
  gold stars, bars), AggregateRating JSON-LD only from real reviews. Demo reviews only via
  `seed_demo` (DEBUG only).
- Secured payments line with Chargily, CIB, Edahabia, Algérie Poste, PayPal, USDT
  (footer, start review step, payments panel).
- Legal pages `/legal/{privacy,terms,cookies,data-deletion}` (EN/FR) + cookie notice.
- Auto-portfolio: going live drafts an unpublished case study (skipped under NDA) and
  sends a review invite.
- Galaxy auto-feed: published projects without picked clips contribute 3 gallery items;
  every upload gets a 640 px galaxy still.
- `deploy/nginx.conf` + `deploy/README.md` (ASGI, `/ws/`, Redis, hotlink protection).

## To do next (in order)

1. **Commit** the rebuild (identity: GitHub noreply address, see memory).
2. **Media** (built and seeded 26 Oct: Alquilar 17 gallery / 31 galaxy, MediGate 16 / 17):
   look at the Alquilar and MediGate pages and the galaxy in the browser. Note for
   `build_media.py`: add new STILLS entries *after* a project's existing ones, or run
   `--only stills --force`, since numbering decides the file names.
3. **Tests**: full backend suite (64, last run had 1 error, fixed), Playwright e2e,
   `next build` (never run on this batch).
4. **Visual QA** at 375 / 768 / 1280 / 1600 of the new screens: welcome, settings
   (delete), reviews section, review form, moderation, legal pages, cookie notice, bell
   panel, docked estimate, ForgeVideo (incl. iPhone full screen).
5. **Live system end to end** with two browsers: client message → studio toast, studio
   progress → client hub refresh. Clear the demo notifications on the studio account.
6. **Performance** on a production build vs getartcraft.com (last dev numbers: reload
   frames > 33 ms 8 vs 2, wheel p99 23.5 vs 16.8 ms); mobile pass like their source.
7. **Gmail app password**: Younes creates it (Google Account → Security → 2-Step
   Verification → App passwords) and pastes it into `EMAIL_HOST_PASSWORD`; then send a
   real test e-mail.
8. **Legal review** by Younes (`frontend/src/i18n/legal.ts`); make the server match what
   it says (logs 90 days, backups replaced within 30 days, CDN).

## Hosting (started 26 Oct)

- Old site on the Hostinger KVM 1 (76.13.3.229, Ubuntu 24.04, 1 vCPU, 3.8 GB RAM, 48 GB
  disk with 45 GB free, no swap), subscription ends in ~5 months. Host key verified 26 Oct
  (`SHA256:fodV9N0…z/Q`); this PC's ed25519 key is authorized for root.
- Audit 26 Oct (read-only): vdzservice.cloud has **no human traffic** in 14 days of logs
  (40 to 90 requests a day, all bots and probes; the OTP relay got no real calls). Still
  running: `deep_scanner` (active, ~22 % CPU), `fast_scanner` (timing out), `spain-monitor`
  (403 errors for 14 days), `mosaic_api` (gunicorn :5000), `otp_server` (Flask :5001).
  Firewall **off**, and :5000/:5001 are open to the internet.
- Decided 26 Oct: back up, stop everything, clean reinstall. **Done:** backup in
  `AndroidStudioProjects/vps-backup-2026-10-26/` (code, data, nginx, service units, pip
  freezes; sha256 verified; contains a Firebase service-account key, keep private); all 8
  services stopped and disabled. Data center: Frankfurt, ~89 ms from Algeria.
- Reinstalled 26 Oct (new host key `SHA256:sbpbQuUO…3Bhs`, verified). Provisioned: ufw
  (22/80/443), fail2ban, 2 GB swap, unattended upgrades, Postgres 16, Redis, Node 22,
  nginx. **OriginForge deployed on http://76.13.3.229** (code uploaded from the PC, not
  from git), all pages and APIs 200. See `deploy/README.md`.
- **Live on https://originforgedev.com since 26 Oct** (Namecheap → Cloudflare NS
  miki/phil, A @ + www proxied). Let's Encrypt cert (both names, until 24 Jan 2027,
  auto-renew timer, dry-run passed), http → https and www → apex redirects, unknown
  hosts dropped. Younes accepted the LE terms with younesoft2017@gmail.com.
- Done 26 Oct: Cloudflare Full (strict), Always Use HTTPS (edge redirect verified), TLS
  1.2 minimum (1.1 refused); renewal dry-run passes behind the redirect; studio account
  (superuser, developer); Gmail app password set, SMTP login OK; secure CSRF cookie and
  CSRF over HTTPS verified.
- Left: Younes signs in once (check the live socket in the uvicorn log); a real e-mail
  (password reset to himself); raise `DJANGO_HSTS_SECONDS` to 31536000 after a few clean
  days; payment details in Site settings (CCP/RIP/USDT) and Chargily/PayPal keys.
- Later: `deploy.sh` from git with zero downtime, nightly backups + offsite (MediGate kit),
  logrotate (legal text says 90 days), restrict 80/443 to Cloudflare IPs.
- Domain: Younes buys it (shortlist in the chat of 26 Oct).
- Deploy kit: adapt MediGate's (`../wadoud_quiz/deploy/`): provision, deploy, rollback,
  backup + offsite, logrotate, systemd units (ASGI Django, Celery worker + beat, Next,
  Redis), certbot, Cloudflare in front.

## Later (waiting on Younes or on accounts)

- Chargily keys (test then live), PayPal keys, USDT BEP20 address.
- Google / Facebook sign-in (and Facebook's data-deletion callback URL).
- 2FA for the studio account (django-otp).
- Arabic (RTL) pass.
- Showreel caption track (WebVTT).
- Business-rules tweaks Younes is preparing; promo video tweak once the domain is known.
