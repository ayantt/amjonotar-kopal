# Roadmap

## Phase 0 — Foundation (current)
- [x] Product constraints, initial rules, architecture, AI instructions.
- [ ] Resolve open decisions and reconcile rules/cards.
- [ ] Finalize 40-space board data and balance values.
Exit: docs agree and clean checkout builds.

## Phase 1 — Playable board and human seat
- [ ] Role selection: human chooses Politician or Citizen.
- [ ] Assign exactly three AI-controlled seats; always one Politician and three Citizens total.
- [ ] Data-driven 40-space fictional board, four tokens and cash balances.
- [ ] Role-specific dice, movement, GO rewards, turn sequencing.
- [ ] Human action panel, AI turn status, readable event log, restart.
- [ ] Engine and setup tests, including role/controller combinations.
Exit: user plays full rounds against three automatic opponents without manual state repair.

## Phase 2 — Property loop and baseline AI
- [ ] Purchase/lease, ownership, rent, railroad, utilities, tax, special spaces.
- [ ] Legal-action API consumed by both human UI and AI.
- [ ] Baseline Politician strategy and Citizen strategy.
- [ ] AI choices are validated, logged, bounded, and use no hidden information.
- [ ] Tests for illegal-action fallback and completed AI turns.
Exit: several laps can be played with all AI turns resolving reliably.

## Phase 3 — Cards and funds
- [ ] Typed card resolver, 32 cards, shuffling/discard.
- [ ] Public and cooperative funds, jail, skip turns.
- [ ] AI card/debt handling; tests for effects and transfer destinations.

## Phase 4 — Cooperation/economy
- [ ] Contributions, voting, cooperative property.
- [ ] Housing, mortgages, debt, bankruptcy.
- [ ] AI Citizens coordinate through explicit shared rules and actions.
- [ ] Both victory routes and boundary tests.
- [ ] Simulate balance; tune values.

## Phase 5 — UX/release
- [ ] Responsive board/property inspector and clear action panel.
- [ ] Bangla-facing labels/tutorial/rule reference.
- [ ] AI pacing controls and decision explanations.
- [ ] Versioned local save, accessibility pass.
- [ ] Clean install, test, build, static deployment.

## Deferred
Local pass-and-play, online multiplayer/accounts, remote AI services, negotiation UI, Election Day challenge, analytics/backend, real-person likenesses.
