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
- RD-120: Housing: Citizens need a full color group and build evenly; costs are ৳200/৳300/৳400/৳600 for houses/hotel, with 2×/3×/4×/6× rent multipliers. Politician pays half, needs no group, may build a hotel directly, and pays no maintenance. Citizens pay ৳50 per house and ৳200 per hotel when passing GO.
- RD-009: declined properties remain unowned; no auction in MVP.
- RD-010: no backend/auth/multiplayer/remote AI service in MVP.
- RD-011: AI receives only player-appropriate information; no cheating or hidden-state access.
- RD-012: AI decisions are bounded, validated, and logged in concise user-facing language.

## Open decisions
- **RD-101 Politician wealth — provisional implementation:** ৳8,000 is cash plus listed purchase value of individually owned properties; leases and liabilities are excluded until balancing review.
- **RD-102 Leases in Citizen property count:** Provisional: only owned and cooperative properties count, not leased property.
- **RD-103 Public fund shortfall — resolved for Phase 3:** “If available” collections transfer only the available balance; shortfalls are waived, not carried as hidden liabilities. Revisit if explicit debt instruments are added.
- **RD-104 Lease rent:** Provisional: active leaseholder alone collects rent; owner does not also collect.
- **RD-105 Debt order — provisional implementation:** The engine automatically spends cash, then mortgages owned unmortgaged properties using the role-specific loan terms (Citizen: half price less 5% fee; Politician: full price, no fee), then declares bankruptcy if the amount remains unpaid. Manual mortgage redemption is implemented; player-selected liquidation and cooperative rescue are deferred.
- **RD-106 Cooperative vote:** Majority of active Citizens; Citizen victory still requires all three active.
- **RD-107 Doubles:** Extra roll after resolving landing, maximum two consecutive bonus rolls. **Status: not implemented in code** (the Constitution now says so); extra rolls currently come only from the Public Holiday card. Implementing it would further favour the Politician, so decide together with balance tuning.
- **RD-108 Luxury tax contribution:** Politician receives 25% only from available public fund; no money created silently.
- **RD-109 Maintenance:** ৳50 per house and provisional ৳200 per hotel each time player passes GO.
- **RD-110 Multi-player card payment failure — resolved for Phase 3:** Process Citizens in player-array order; each transfer invokes the same cash/mortgage/bankruptcy resolver before continuing.

- **RD-121 Buildings on ownership change (partly resolved):** Buildings are demolished when the Politician sells a property back to the government (it becomes unowned land). **Still open:** buildings currently survive a Citizen-to-Politician sale and a Citizen bankruptcy transfer (the Politician inherits them and pays no maintenance). Bankruptcy transfer also clears the mortgage flag for free. Decide whether transferred buildings should be demolished and whether inherited mortgages should survive.
- **RD-122 Politician bankruptcy conflict (open):** The rulebook's "Debt and bankruptcy" section says the Politician cannot go bankrupt from ordinary debt (government support covers it), but the implemented rule and RD-114 end the game in a Citizen victory when the Politician goes bankrupt. Pick one.
- **RD-123 Politician wealth and mortgages (open balance risk):** The ৳8,000 wealth test counts the full listed value of owned property even when mortgaged, while the Politician receives the full price in cash when mortgaging. Mortgaging therefore counts the same value twice toward the wealth victory.
- **RD-124 Community Service (resolved):** CH-11 is "contribute ৳100 to the public fund or lose the next turn"; the turn is lost only when the contribution is declined or unaffordable.

Never silently invent behavior for unresolved rules. Mark decision resolved, record rationale, update docs, and add normal/edge-case tests.

## Phase 3 implementation notes
- RD-111: Decks are catalog-ordered, not shuffled, for deterministic tests. Shuffling and discard piles remain deferred.
- RD-112: Optional contributions are skipped automatically for a human player because a card-choice interaction is not yet implemented; AI contributes only when affordable.
- RD-113: Card draws are deterministic and cycle through the 16-card catalog in order; deck draw counts are tracked in state.
- RD-114: Citizen bankruptcy transfers owned assets to the Politician. Politician bankruptcy ends the game in a Citizen victory. The Politician wins on the second Citizen bankruptcy.

## Cooperative economy implementation notes
- RD-115: Citizen contributions are currently explicit ৳100/৳500 actions; no forced contributions are made by the UI.
- RD-116: Cooperative properties are tracked separately from individual owners; rent is paid into the cooperative fund.
- RD-117: Charter activation requires a majority of active Citizen votes and at least ৳1,000 in the cooperative fund. The fund and victory thresholds are checked at the next Citizen round.
- RD-118: Politician victory checks are evaluated after movement/property actions and at turn advancement: seven controlled properties, ৳8,000 cash plus owned-property value, or two bankrupt Citizens.

- RD-119: Cooperative property purchases can currently be made by the current Citizen when the fund covers the price; a separate majority spending vote is deferred to avoid blocking the MVP. Charter activation still requires a majority vote.
