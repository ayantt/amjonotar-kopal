# Rule Decisions

Track unresolved conflicts here. When resolving one, update the rulebook/catalog, add tests, and remove contradictory provisional text.

## Locked
- RD-001: exactly one Politician and three Citizens.
- RD-002: single-player; one human against three local AI opponents; no pass-and-play.
- RD-003: human chooses a role; remaining seats are assigned to AI while preserving one Politician and three Citizens.
- RD-004: Politician privilege intentional; Citizen victory cooperative.
- RD-005: fictional composites only.
- RD-006: integer taka; public and cooperative funds separate.
- RD-007: engine validates every action; AI chooses only from legal actions.
- RD-008: no building on another player's property; permit mechanic deferred.
- RD-009: declined properties remain unowned; no auction in MVP.
- RD-010: no backend/auth/multiplayer/remote AI service in MVP.
- RD-011: AI receives only player-appropriate information; no cheating or hidden-state access.
- RD-012: AI decisions are bounded, validated, and logged in concise user-facing language.

## Open decisions
- **RD-101 Politician wealth:** Is ৳8,000 cash or net worth? Provisional: cash + documented asset valuation − liabilities. Resolve before victory coding.
- **RD-102 Leases in Citizen property count:** Provisional: only owned and cooperative properties count, not leased property.
- **RD-103 Public fund shortfall — resolved for Phase 3:** “If available” collections transfer only the available balance; shortfalls are waived, not carried as hidden liabilities. Revisit if explicit debt instruments are added.
- **RD-104 Lease rent:** Provisional: active leaseholder alone collects rent; owner does not also collect.
- **RD-105 Debt order — provisional implementation:** The engine automatically spends cash, mortgages owned unmortgaged properties at half purchase price, then declares bankruptcy if the amount remains unpaid. Player-selected liquidation, cooperative rescue, and mortgage redemption are deferred.
- **RD-106 Cooperative vote:** Majority of active Citizens; Citizen victory still requires all three active.
- **RD-107 Doubles:** Extra roll after resolving landing, maximum two consecutive bonus rolls.
- **RD-108 Luxury tax contribution:** Politician receives 25% only from available public fund; no money created silently.
- **RD-109 Maintenance:** ৳50 per house and provisional ৳200 per hotel each time player passes GO.
- **RD-110 Multi-player card payment failure — resolved for Phase 3:** Process Citizens in player-array order; each transfer invokes the same cash/mortgage/bankruptcy resolver before continuing.

Never silently invent behavior for unresolved rules. Mark decision resolved, record rationale, update docs, and add normal/edge-case tests.

## Phase 3 implementation notes
- RD-111: Decks are catalog-ordered, not shuffled, for deterministic tests. Shuffling and discard piles remain deferred.
- RD-112: Optional contributions are skipped automatically for a human player because a card-choice interaction is not yet implemented; AI contributes only when affordable.
- RD-113: Card draws are deterministic and cycle through the 16-card catalog in order; deck draw counts are tracked in state.
- RD-114: Citizen bankruptcy transfers owned assets to the Politician. Politician bankruptcy ends the game in a Citizen victory. The Politician wins on the second Citizen bankruptcy.
