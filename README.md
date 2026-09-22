# BankConnector status checker

The external uptime checker behind **[bankconnector.com/status](https://bankconnector.com/status)**.

Every minute, a Cloudflare Worker checks BankConnector's API, dashboard, sandbox and developer docs from
**outside** our own servers, so it keeps reporting when they are down. It keeps 90 days of history,
emails our operations team when a service stays down, and publishes the public feed the status page and the
BankConnector app read.

Built on [UptimeFlare](https://github.com/lyc8503/UptimeFlare) by lyc8503 (Apache-2.0 — see `LICENSE`;
upstream's own documentation is kept in `upstream/`). Thank you to its author.

This repository is public so its deploys run on GitHub Actions' free tier for public projects. It holds no
credentials: every key lives in GitHub and Cloudflare secrets. It is not open for contributions.

## What BankConnector changed from upstream

| File | Change |
| --- | --- |
| `uptime.config.ts` | Our checks, page title, and the outage email via `callbacks` |
| `bankconnector/alerts.ts` | The email: grace period + maintenance skip, sent through Brevo's API |
| `bankconnector/feed.ts`, `pages/api/status.ts` | The public feed `/api/status` (current state, 90-day uptime, incidents, maintenance) |
| `deploy.tf`, `.github/workflows/deploy.yml` | Project name `bankconnector-status`; the Brevo key bound as a Worker secret; deploy refuses without it; our tests run first |
| `.eslintrc.json`, `tsconfig.json` | `pages/api/status.ts` exempted like upstream's `data.ts` (server-side only); tests excluded from the Next build |
| removed `sync.yaml`, `issue_translate.yml`, `FUNDING.yml` | No one-click upstream sync: upstream code is reviewed before it lands here |
| `README.md` | This file; upstream's README moved to `upstream/` |

## Secrets (GitHub → Settings → Secrets and variables → Actions)

- `CLOUDFLARE_API_TOKEN` — deploys the Worker, D1 and Pages project (Workers Scripts, D1 and Pages read +
  write, Account Settings read; no zone access).
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account it deploys to.
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
