# Deploying OriginForge

Live on the Hostinger KVM 1 (76.13.3.229, Frankfurt, Ubuntu 24.04) since 26 October 2026,
on the bare IP until the domain is active. Everything runs as the `originforge` user
under `/srv/originforge` (`app/`, `media/`, `private_media/`, `static/`, `shared/` for
the env files, `backups/`).

## Scripts (run as root on the VPS, from `/srv/originforge/app/deploy`)

| Script | What it does |
|---|---|
| `setup_backend.sh` | production settings in `shared/backend.env`, venv, migrations, `collectstatic` (`UNPACK=1` first unpacks a new `/tmp/code.tar.gz`) |
| `install_services.sh` | `shared/frontend.env` + the systemd units: `originforge-django` (uvicorn ASGI, also the `/ws/` socket), `-worker` (Celery, concurrency 1), `-beat`, `-next` |
| `build_frontend.sh` | `next build` on the server (it renders against the local Django), copies static files, restarts Next |
| `configure_nginx.sh` | `MODE=ip`, `domain-http` or `domain-tls`; validates before reloading and keeps the old config if the new one fails |
| `go_live_domain.sh` | `DOMAIN=… EMAIL=…`: checks the domain reaches the server, gets the Let's Encrypt certificate (webroot, so renewals work behind Cloudflare), switches nginx to HTTPS, updates the app's address and rebuilds |

`nginx/upstreams.conf` (upstreams + maps) and `nginx/locations.conf` (routes, media
hotlink protection, private files, the ACME folder) are shared by every mode.

## Updating the code

From the PC: pack `backend frontend deploy` (exclude `.venv`, `node_modules`, `.next`,
`backend/media`, `backend/private_media`, `.env*`), upload to `/tmp/code.tar.gz`, then
`UNPACK=1 bash setup_backend.sh && bash build_frontend.sh && systemctl restart originforge-django originforge-worker originforge-beat`.
(To do: a `deploy.sh` that does this from git with zero downtime, adapted from MediGate.)

## Settings that need Younes

- **Studio account:** `sudo -u originforge -H /srv/originforge/app/backend/.venv/bin/python /srv/originforge/app/backend/manage.py createsuperuser`
- **Gmail app password:** put it in `EMAIL_HOST_PASSWORD` in `/srv/originforge/shared/backend.env`, then `systemctl restart originforge-django originforge-worker`.
- `NEXT_PUBLIC_WS_URL` stays **unset** in production: the socket is same-origin.

## Before launch

- Review the legal pages (`frontend/src/i18n/legal.ts`). They describe backups replaced
  within 30 days, server logs kept 90 days and a CDN for media: make the server match
  (backup job + logrotate) or change the text.
- `seed_demo` refuses to run with DEBUG off: demo accounts and reviews never reach production.
- Raise `DJANGO_HSTS_SECONDS` to 31536000 once HTTPS has run cleanly for a while.
