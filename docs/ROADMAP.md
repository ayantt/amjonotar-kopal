# Roadmap

## Phase 0 — Foundation
- [x] Product constraints, initial rules, architecture, AI instructions.
- [x] Define single-human versus three-AI match model.
- [ ] Resolve open decisions and reconcile rules/cards.
- [x] Define 40 fictional Bangladesh-inspired board spaces.

## Phase 1 — Playable board and human seat
- [x] Role selection: human chooses Politician or Citizen.
- [x] Assign exactly three AI-controlled seats; preserve one Politician and three Citizens total.
- [x] Data-driven 40-space board, four tokens and starting cash.
- [x] Role-specific dice, movement, GO rewards, turn sequencing.
- [x] Human roll/end-turn controls, automatic AI turns, event log, restart.
- [x] Deterministic engine tests for setup, movement, GO rewards, dice, and turn order.
- [ ] Run install, typecheck, tests, and production build in a Node environment.
Exit: a user can play successive rounds against three automatic opponents without manual state repair.

## Phase 2 — Property loop and strategic AI
- [x] Purchase/lease, ownership, rent, railroad, utilities, tax, and destination effects.
- [x] Legal property-action list consumed by both human UI and AI.
- [x] Baseline Politician and Citizen property strategies based on legal actions.
- [x] AI choices are validated against legal actions, logged, bounded, and use only its current role/cash/legal options.
- [x] Tests for property actions, rent transfers, and completed AI turns.
Exit: several laps can be played with all AI turns resolving reliably and property decisions available.

## Phase 3 — Cards and funds
- [x] Typed card resolver and 32 role-specific card definitions. Shuffling/discard remains future work.
- [x] Public and cooperative fund transfers, Administrative Hold, skip turns, and extra-roll effects.
- [x] AI card handling, automatic mortgage fallback, bankruptcy outcomes, and initial card/debt tests.

## Phase 4 — Cooperation/economy
- [x] Citizen contributions, Charter voting, cooperative property purchases, and shared-rent transfers.
- [x] Housing and mortgage redemption (human-driven; AI does not build or redeem).
- [ ] Debt-choice UI and broader bankruptcy edge-case coverage.
- [x] AI Citizens contribute when affordable, vote on the Charter, and can purchase cooperative property from the shared fund.
- [x] Politician property/wealth/bankruptcy victory and Citizen Charter victory conditions, with initial boundary tests.
- [ ] Simulate balance; tune values and expand full-game playtesting.

## Phase 5 — UX/release
- [ ] Responsive board/property inspector and clear action panel.
- [ ] Bangla-facing labels/tutorial/rule reference.
- [ ] AI pacing controls and decision explanations.
- [ ] Versioned local save, accessibility pass.
- [ ] Clean install, test, build, static deployment.

## Deferred
Local pass-and-play, online multiplayer/accounts, remote AI services, negotiation UI, Election Day challenge, analytics/backend, real-person likenesses.
