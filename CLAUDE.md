# Claude Code Instructions

Build **Amjonotar Kopal**, a fictional Bangladesh-inspired satirical property board game. Read PRODUCT_SPEC, GAME_RULEBOOK, CARD_CATALOG, ARCHITECTURE, RULE_DECISIONS, and ROADMAP under `docs/` before feature work.

## Constraints
- Exactly four local players: one Politician, three Citizens.
- Pass-and-play on one device; no backend, accounts, telemetry, or online multiplayer in MVP.
- Politician privileges are intentional. Citizens' victory requires cooperation and all three active Citizens.
- Use fictional places/institutions/characters, not identifiable real politicians or parties.
- Bangla-ready responsive UI; English code identifiers.
- Pure TypeScript game engine; no React/browser imports in `src/game`.
- Integer taka only. No negative cash.
- Inject randomness for tests. Do not depend on uncontrolled randomness.
- All state transitions go through engine functions; never mutate state in UI components.
- Keep board, cards, properties, and rules data-driven.
- Strict TypeScript; avoid `any`; don't add dependencies without reason.
- Failed actions must be atomic and leave state unchanged.
- Log money, movement, ownership, cards, jail, debt, and victory events.
- Do not commit, push, or change Git identity unless explicitly asked.

## Workflow
1. Read relevant docs and existing code.
2. Rule changes require updating RULE_DECISIONS and the rulebook/card catalog.
3. Implement domain logic before UI.
4. Add normal, boundary, and failure-path tests.
5. Run typecheck, tests, and build when configured; report exactly what ran.
6. Never claim checks passed if they were not run.

## Definition of done
Documented behavior, engine validation, logged outcomes, automated tests, understandable UI, updated docs.
