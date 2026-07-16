# ExportReach — Self-Hosting Guide

This guide covers running ExportReach on your own server (VPS, cloud VM, or on-prem) with Docker.

---

## 1. Requirements
- A Linux host with **Docker** + **Docker Compose v2**
- A **domain name** pointing at the host (needed so email open/click tracking works)
- An **InsForge project** for the data store (URL + admin API key) — see the data-store note in §7
- Optional: a Gmail app-password or Resend key for sending, and a Gemini/OpenAI key for AI

Minimum resources: **1 vCPU / 1 GB RAM / 10 GB disk** for a small deployment; 2 vCPU / 2 GB for heavier use.

## 2. Configure
```bash
cp .env.example .env
# edit .env — fill EVERY required value
# generate secrets:
openssl rand -hex 48   # -> AUTH_SECRET
openssl rand -hex 24   # -> CRON_SECRET
openssl rand -hex 32   # -> SECRETS_ENCRYPTION_KEY
```
Set `NEXT_PUBLIC_APP_URL` to your public HTTPS URL (e.g. `https://outreach.yourco.com`).
For a private, single-org install set `ALLOW_REGISTRATION=false` and create users yourself.

## 3. Run
```bash
docker compose up -d --build
```
This starts:
- **app** on port `3000` (health at `/api/health`)
- **cron** sidecar that triggers follow-ups + reply polling hourly (replaces the hosted scheduler)

Check health:
```bash
curl -s http://localhost:3000/api/health | jq
# {"status":"ok","db":"ok", ...}
```

## 4. Reverse proxy + TLS
Put Nginx / Caddy / Traefik in front for HTTPS. Nginx example:
```nginx
server {
  server_name outreach.yourco.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
Then issue a certificate with `certbot --nginx` (or use Caddy for automatic TLS).
**`X-Forwarded-For` must be forwarded** — the app uses it for rate limiting and tracking.

## 5. Upgrades
```bash
git pull                       # or copy the new release
docker compose up -d --build   # rebuild + restart with zero data loss
```
Roll back by checking out the previous release and rebuilding.

## 6. Backup & restore
Data lives in your InsForge project. Export/restore via the InsForge CLI:
```bash
npx @insforge/cli db export > backup-$(date +%F).sql   # scheduled nightly (cron)
npx @insforge/cli db query < backup-YYYY-MM-DD.sql      # restore
```
Also back up your `.env` (it holds `SECRETS_ENCRYPTION_KEY`, without which stored SMTP/AI secrets cannot be decrypted).

## 7. Data store note (important)
Today the data store is an **InsForge project** (`INSFORGE_URL` / `INSFORGE_API_KEY`). Each self-hosted customer must use **their own** InsForge project — never a shared one. A fully self-contained Postgres option (no external dependency) is on the roadmap; until then, provision one InsForge project per deployment.

## 8. Security checklist
- [ ] Strong, unique `AUTH_SECRET`, `CRON_SECRET`, `SECRETS_ENCRYPTION_KEY`
- [ ] `ALLOW_REGISTRATION=false` for private deployments
- [ ] HTTPS enforced at the proxy
- [ ] `.env` file permissions locked down (`chmod 600 .env`)
- [ ] InsForge admin key kept server-side only (never a `NEXT_PUBLIC_*` var)
- [ ] Nightly DB backups verified

## 9. Deliverability (cold email)
Before sending volume: authenticate your sending domain (**SPF, DKIM, DMARC**), warm up gradually, validate your list (remove bad addresses), and include an unsubscribe/opt-out. Sending cold mail from an unauthenticated domain lands in spam.
