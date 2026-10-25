# Claude Code Instructions

Build **Amjonotar Kopal**, a fictional Bangladesh-inspired satirical property board game. Read PRODUCT_SPEC, GAME_RULEBOOK, CARD_CATALOG, ARCHITECTURE, RULE_DECISIONS, and ROADMAP under `docs/` before feature work.

## Constraints
- Exactly four seats: one human player and three computer-controlled AI opponents.
- At game setup, the human chooses Politician or Citizen; assign the other three seats to AI opponents so the match always has one Politician and three Citizens total.
- No local pass-and-play. AI turns run automatically with visible turn/action feedback and a way to review their decisions.
- AI follows the same role rules, action validation, cash limits, and information availability as a human. No cheating or hidden-state access.
- Politician privileges are intentional. The winner is the last player standing: the game ends when exactly one player is not bankrupt (RD-125). Citizens may cooperate through the shared cooperative fund, but it confers no victory.
- Use fictional places/institutions/characters, not identifiable real politicians or parties.
- Bangla-ready responsive UI; English code identifiers.
- Pure TypeScript game engine and AI strategy modules; no React/browser imports in `src/game`.
- Integer taka only. No negative cash.
- Inject randomness for tests. Do not depend on uncontrolled randomness.
- All state transitions go through engine functions; never mutate state in UI components.
- Keep board, cards, properties, rules, and AI strategies data-driven.
- Strict TypeScript; avoid `any`; don't add dependencies without reason.
- Failed actions must be atomic and leave state unchanged.
- Log money, movement, ownership, cards, jail, debt, victory, and AI decision events.
- Do not commit, push, or change Git identity unless explicitly asked.

## Workflow
1. Read relevant docs and existing code.
2. Rule changes require updating RULE_DECISIONS and the rulebook/card catalog.
3. Implement domain logic before UI; AI chooses from legal actions exposed by the engine.
4. Add normal, boundary, failure-path, and AI decision tests.
5. Run typecheck, tests, and build when configured; report exactly what ran.
6. Never claim checks passed if they were not run.

## Definition of done
Documented behavior, engine validation, logged outcomes, automated tests, understandable UI, updated docs, and AI turns that finish without illegal actions or getting stuck.
