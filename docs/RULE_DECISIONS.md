# Rule Decisions

Track unresolved conflicts here. When resolving one, update the rulebook/catalog, add tests, and remove contradictory provisional text.

## Locked
- RD-001: exactly one Politician and three Citizens.
- RD-002: local pass-and-play MVP.
- RD-003: Politician privilege intentional; Citizen victory cooperative.
- RD-004: fictional composites only.
- RD-005: integer taka; public and cooperative funds separate.
- RD-006: engine validates every action.
- RD-007: no building on another player's property; permit mechanic deferred.
- RD-008: declined properties remain unowned; no auction in MVP.
- RD-009: no backend/auth/multiplayer in MVP.

## Open decisions
- **RD-101 Politician wealth:** Is ৳8,000 cash or net worth? Provisional: cash + documented asset valuation − liabilities. Resolve before victory coding.
- **RD-102 Leases in Citizen property count:** Provisional: only owned and cooperative properties count, not leased property.
- **RD-103 Public fund shortfall:** Each card must specify if shortfall is forgiven or becomes liability; “if available” pays only existing balance.
- **RD-104 Lease rent:** Provisional: active leaseholder alone collects rent; owner does not also collect.
- **RD-105 Debt order:** Let player choose legal sale/mortgage/cooperative rescue until solvent or no options; bankruptcy settlement atomic.
- **RD-106 Cooperative vote:** Majority of active Citizens; Citizen victory still requires all three active.
- **RD-107 Doubles:** Extra roll after resolving landing, maximum two consecutive bonus rolls.
- **RD-108 Luxury tax contribution:** Politician receives 25% only from available public fund; no money created silently.
- **RD-109 Maintenance:** ৳50 per house and provisional ৳200 per hotel each time player passes GO.
- **RD-110 Multi-player card payment failure:** Resolve each player in stable turn order; debt resolution before continuing.

Never silently invent behavior for unresolved rules. Mark decision resolved, record rationale, update docs, and add normal/edge-case tests.
