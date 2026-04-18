# World Cup Pool — Build Backlog

## Phase 2: Tournament Core

### Data & Actions
- [ ] `src/lib/data/wc2026.ts` — FIFA 2026 teams, groups, match schedule
- [ ] `src/lib/actions/tournaments.ts` — initTournament, seedTeams, updateTournamentStatus
- [ ] `src/lib/actions/bet-types.ts` — createPreTournamentBetTypes, openBetType, closeBetType
- [ ] `src/lib/actions/bets.ts` — placeBet, updateBet
- [ ] `src/lib/actions/results.ts` — enterMatchResult, resolveMatchBets
- [ ] `src/lib/actions/leaderboard.ts` — recalculateLeaderboard
- [ ] `src/lib/scoring.ts` — full scoring engine implementation

### Admin Pages
- [ ] Admin: Tournament setup card (init, view teams, manage)
- [ ] Admin: Scoring settings card (tier weights, base %, multipliers)
- [ ] Admin: Result entry card (enter scores per match)
- [ ] Admin: Bet type management (open/close/resolve bet types)

### User Pages
- [ ] Match center — group stage schedule + results, knockout bracket
- [ ] Bets page — pre-tournament bet submission UI
- [ ] Bets page — per-game prediction submission

## Phase 3: Polish & Extras
- [ ] User profile page — improve bet display formatting
- [ ] Milestone bets (bracket, semifinalists, penalty in final)
- [ ] Curated props (admin-created custom bets)
