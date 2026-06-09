# World Cup Pool — Build Backlog

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

## Phase 3 Remaining
- [ ] Scoring settings UI (admin can configure tier weights from UI)
- [ ] Dark horse / advancing / reverse dark horse bet types UI (data model supports them)
- [ ] Improved user predictions page (format predictions nicely by bet subType)
- [ ] Milestone bets beyond semifinalists (golden_glove, biggest_upset, penalty_in_final)
