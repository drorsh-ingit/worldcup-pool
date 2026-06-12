# Commit scopes — worldcup-pool

Conventional Commits format for this repo:

```
type(scope): subject
```

Pick the single scope that best matches the primary area of the change.
If a change genuinely spans many areas (e.g. a big refactor), it's fine
to omit the scope.

## Allowed scopes

- **auth** — login, signup, NextAuth, session, password handling
- **groups** — group CRUD, membership, approval, invites
- **admin** — admin panel (`src/components/admin/`, admin pages)
- **settings** — user profile / settings page
- **bets** — bet placement UI and lifecycle, bet types, lock/open gating
- **scoring** — scoring engine, odds, weights, herding, multipliers
- **leaderboard** — standings page, leaderboard computation, live overlays
- **live** — live-score ingestion (ESPN, football-data), in-play deltas, reconciliation
- **matches** — match data, schedule, kickoffs, results entry
- **data** — static tournament data (teams, players, candidates, odds seeds)
- **notifications** — push notifications, VAPID, subscriptions, reminder UX
- **cron** — Vercel cron routes and schedules (`src/app/api/cron/*`, `vercel.json`)
- **ui** — generic visual / layout changes that don't fit a feature scope
- **deps** — dependency bumps, lockfile changes
- **db** — Prisma schema, migrations, raw data backfills

## Style notes

- Subject in imperative mood ("add X", not "added X" / "adds X")
- Keep the subject under 72 characters; put detail in the body
- Reason-first titles win: say *why* the change matters, not which files moved
- For fixes, the title is the symptom or behavior change; the body explains the root cause
