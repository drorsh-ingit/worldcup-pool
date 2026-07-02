# World Cup Pool — Build Backlog

## Robust finished-match result handling (DONE — commit b7377a2)
Bug: BEL–SEN (R32) ET 90'=2–2 / 120'=3–2; DB stored `actualHomeScore90=null` → scored on
3–2 (120') not 2–2 (90'), UI hid the ET. Causes: write-once/never-heal, 4 duplicated
writers, fragile `regularTime ?? fullTime`, ambiguous `score90 ?? scoreFt` fallback.
- [x] `football-data.ts`: `deriveMatchResult(fd)` → complete result or null (gate completion); dropped regulationScore/ninetyMinuteScore/fdWinnerCode
- [x] `match-results.ts` (new): shared `applyMatchResult` — orientation-safe, idempotent, self-healing → `{ completed, scoringChanged }`
- [x] `scoring.ts`: `scoreBets` `{ rescore }` to re-grade already-scored per-game bets
- [x] `reconcile.ts` + `live-scores.ts`: route completion through `applyMatchResult`; rescore on completed OR scoringChanged
- [x] rewrote `football-data.test.ts` for `deriveMatchResult` (incl. BEL–SEN + settle-window); tsc + build + 15 tests green
- [x] deployed; healed all 4 pools via reconcileTournament against prod DB

### Review
- Root cause was structural (write-once completion + 4 writers), not a one-off. Fixed by a
  single gated, self-healing derivation/writer. Completion now waits for a coherent 90'.
- Live repair verified: all 4 BEL–SEN rows now 90'=2–2 / FT=3–2 / winner BEL; group null-90'
  count 0; BEL–SEN match_winner re-graded (draw ×5 correct, home ×2 wrong) — points on 90'.
- UI needs no change: with 90' always populated, `wentToExtraTime` is reliable, so the card
  shows Final 3–2 + "90' score 2–2" correctly.
- Note: `revalidatePath` in results.ts warns (doesn't throw) outside request scope, so the
  standalone heal completed; kept per-pool try/catch + explicit recalculateLeaderboard anyway.

## Completed
- [x] Phase 1: Auth, groups, dashboard, leaderboard, user predictions
- [x] Phase 2: Tournament core (data, actions, scoring, admin, bets, matches)
- [x] Per-match odds freeze + open + notification system (cron-driven)
- [x] Auto-progress knockout rounds from enterMatchResult

## Auto-Progression (just completed)
- [x] `src/lib/actions/progression.ts` — `progressTournament()` idempotent function
  - Group stage complete → resolve group_predictions + reverse_dark_horse → create R32 → open bracket/golden_ball/golden_glove
  - R32 complete → create R16 → open semifinalists
  - R16 complete → create QF → resolve dark_horse
  - QF complete → create SF
  - SF complete → create FINAL → resolve semifinalists
  - FINAL complete → resolve winner + runner_up + bracket
- [x] Wired into `enterMatchResult` in `src/lib/actions/results.ts`
- [x] Uses `promoteBetTypeGlobally` for cross-group opening + notifications
- [x] No circular imports (progression.ts doesn't import from results.ts)

## Feature: Stats tab
New tab next to Standings/Matches/Tournament Bets. Shows per-user prediction
accuracy: correct scores / correct winners / wrong.

- [x] 1. `src/lib/group-stats.ts` → `getGroupStats(groupId)`
- [x] 2. `src/components/stats/stats-summary.tsx` — personal 3 cards
- [x] 3. `src/components/stats/stats-grid.tsx` — desktop matrix, color-coded, legend
- [x] 4. `src/components/stats/stats-h2h.tsx` — mobile, pick one user, side-by-side
- [x] 5. Route `src/app/(app)/group/[groupId]/stats/page.tsx`
- [x] 6. Nav wired (layout + group-tabs + app-nav ICON_MAP; inline grid cols)
- [x] 7. Verified: tsc clean; SSR render OK (login redirect, no errors); data logic vs
        live הפועל שופן = 12 completed, per-user exact+winner+wrong sums to 12

## Review (Stats tab)
- Result coding computed directly from prediction vs actual score (not reliant on
  scoring having run): exact/winner/wrong; pending = locked-not-completed; none = no pick.
- Only locked matches included → no unrevealed prediction exposed.
- Desktop: full members×matches grid (sticky first col, horizontal scroll, legend).
  Mobile: H2H picker comparing you vs one chosen member + tallies.
- Mobile bottom-bar grid switched to inline gridTemplateColumns so 4–5 tabs lay out
  (Tailwind dynamic grid-cols-5 would be scanned-out per known quirk).
- NOT visually verified in-browser (needs auth session). Layout confirmed via tsc + SSR.

## Phase 3 Remaining
- [ ] Scoring settings UI (admin can configure tier weights from UI)
- [ ] Dark horse / advancing / reverse dark horse bet types UI (data model supports them)
- [ ] Improved user predictions page (format predictions nicely by bet subType)
- [ ] Milestone bets beyond semifinalists (golden_glove, biggest_upset, penalty_in_final)

## Feature: Daily AI standings analysis (Hebrew roast)
- [x] `@anthropic-ai/sdk` dependency; Claude Opus 4.8, adaptive thinking, effort medium
- [x] `DailyAnalysis` model (one per group per day) — caches Hebrew text + standings snapshot for day-over-day diff; applied via `prisma db push`
- [x] `src/lib/actions/daily-analysis.ts` — gatherContext (standings deltas, recent results w/ per-user picks, no-shows) + generateDailyAnalysis (idempotent per UTC day) + getLatestAnalysis
- [x] Cron `src/app/api/cron/daily-analysis/route.ts` (CRON_SECRET-auth) + vercel.json entry (07:00 UTC)
- [x] `DailyAnalysisCard` (RTL Hebrew) on the Standings page
- [x] `.env.example`: ANTHROPIC_API_KEY + CRON_SECRET
- Verified: tsc clean; context build correct vs live group; standings SSR + cron 401 OK
- PENDING (user): add ANTHROPIC_API_KEY to .env + Vercel; then live generation can be tested

## Feature: Match predictions page (all users)
Dedicated page per match: game status (live score if in-play, final if done) +
every member's prediction. Reveal gate = **at kickoff** (locked). Reachable by
clicking a locked match card on your own Matches tab or another user's page.

Decisions: route `/group/[groupId]/match/[matchId]`; server-side gate so opponent
picks never reach the client pre-lock; points shown when COMPLETED (sum stored
`totalPoints` of match_winner + correct_score bets).

- [x] 1. `isMatchLocked(match, effectiveNow)` helper in `bets-page-data.ts`
- [x] 2. `src/lib/match-predictions.ts` → `getMatchPredictions(groupId, matchId)`
- [x] 3. `src/components/match-status-header.tsx` (client, live-score polling)
- [x] 4. `src/components/match-predictions-table.tsx` (server, rows + ✓/✗ + points)
- [x] 5. Route `src/app/(app)/group/[groupId]/match/[matchId]/page.tsx`
- [x] 6. Locked `MatchBetCard` links to the page (`href` + `effectiveNow`); wire both call sites
- [x] 7. Verify (tsc clean; data logic checked vs live GER–CUR; route renders SSR + login redirect, no errors)

## Review
- Server-side reveal gate in `getMatchPredictions`: when `!locked`, no opponent picks
  are ever queried/returned. Page shows a "hidden until kickoff" placeholder.
- Points read from stored `bet.totalPoints` (match_winner + correct_score) and shown only
  when COMPLETED; in-play shows predictions without points.
- Locked cards become links on BOTH the Matches tab and another user's predictions page
  (same `MatchBetCard`). `revealLocked` (kickoff/LOCKED/COMPLETED) is distinct from the
  card's `isLocked` (which also covers "betting never opened"), so non-open future matches
  don't become links.
- Verified data on live הפועל שופן GER–CUR: locked=true, 6 picks + 1 missing, points null
  (not completed yet) — as designed.
- NOT visually verified in-browser: needs an authenticated session (no creds available).
  Layout confirmed only via typecheck + SSR render. Worth an eyeball once logged in.
