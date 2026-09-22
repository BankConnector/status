# BankConnector status checker

A private copy of [UptimeFlare](https://github.com/lyc8503/UptimeFlare) (Apache-2.0; its own `README.md` and
`LICENSE` are unchanged) that watches BankConnector from **outside** the production server: a Cloudflare
Worker checks every minute, stores history in Cloudflare D1, emails ops@bankconnector.com when a service
stays down, and publishes the feed that **bankconnector.com/status** and the app's sidebar read.

Board rows: T-1788304900001 (status page), T-1789940688531 (off-box uptime check).

## What BankConnector changed from upstream

| File | Change |
| --- | --- |
| `uptime.config.ts` | Our checks, page title, and the outage email via `callbacks` |
| `bankconnector/alerts.ts` | The email: grace period + maintenance skip, sent through Brevo's API |
| `bankconnector/feed.ts`, `pages/api/status.ts` | The public feed `/api/status` (current state, 90-day uptime, incidents, maintenance) |
| `deploy.tf`, `.github/workflows/deploy.yml` | Project name `bankconnector-status`; the Brevo key bound as a Worker secret; deploy refuses without it; our tests run first |
| `.eslintrc.json`, `tsconfig.json` | `pages/api/status.ts` exempted like upstream's `data.ts` (server-side only); tests excluded from the Next build |
| removed `sync.yaml`, `issue_translate.yml` | No one-click upstream sync: upstream code is reviewed before it lands here |

## Secrets (GitHub → Settings → Secrets and variables → Actions)

- `CLOUDFLARE_API_TOKEN` — deploys the Worker, D1 and Pages project.
- `BREVO_API_KEY` — a Brevo API key used for nothing else, so it can be revoked alone. Becomes a Worker
  secret; it is never in a file, and never in the browser bundle.

## Announcing maintenance (SLA: at least 7 days ahead)

Add an entry to `maintenances` in `uptime.config.ts` and push to `main`; the deploy takes a few minutes and
the entry shows as **Upcoming** on bankconnector.com/status straight away:

```ts
const maintenances: MaintenanceConfig[] = [
  {
    monitors: ['app'],                    // the services it affects: app, sandbox, docs
    title: 'Database upgrade',
    body: 'The API and dashboard may be unavailable for up to 15 minutes.',
    start: '2026-10-10T06:00:00+02:00',
    end: '2026-10-10T06:30:00+02:00',
  },
]
```

Outage emails for the named services are suppressed while it runs. Remove old entries once they are more
than 90 days past — the feed stops showing them then anyway.

## Taking an upstream update

`git fetch upstream && git merge upstream/main`, read the diff, run
`node --experimental-strip-types --test bankconnector/*.test.ts` and `npx @cloudflare/next-on-pages`, then push.
Check upstream's security advisories first: https://github.com/lyc8503/UptimeFlare/security/advisories
