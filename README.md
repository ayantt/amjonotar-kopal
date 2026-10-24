# আমজনতার কপাল | Amjonotar Kopal

A satirical, Bangladesh-inspired property board game: **The people pay. The powerful play.**

A single human plays against three computer-controlled opponents. Each game has exactly four seats: one Politician and three Citizens. The intentionally unequal rules parody patronage, rent-seeking, and public-service failures. Citizens can win only by cooperating, including when their seats are AI-controlled.

> Fictional political satire. Use fictional composites; do not imply allegations about specific real people.

## Status
**Playable systems implemented so far:** role selection, 40-space fictional board, role-based dice and GO rewards; property buy/lease/decline; ownership, rent, railroads and utilities; 32 role-specific cards; public/cooperative fund transfers; skipped turns and extra rolls; automatic mortgage fallback and bankruptcy outcomes. The game now includes cooperative contributions, shared-property purchases and rent, Charter voting, and initial Politician/Citizen victory checks. Remaining work includes full playtesting, card-choice UI, shuffled decks, mortgage redemption, housing, and balance tuning.

## Docs
- [Product specification](docs/PRODUCT_SPEC.md)
- [Game rulebook](docs/GAME_RULEBOOK.md)
- [Card catalog](docs/CARD_CATALOG.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Rule decisions](docs/RULE_DECISIONS.md)
- [Contributing](CONTRIBUTING.md)
- [Claude Code instructions](CLAUDE.md)

## Stack
React + TypeScript + Vite; pure TypeScript game engine; Vitest. Client-only MVP: no backend, accounts, or online multiplayer. AI opponents run locally in the browser.

## Run
Requires current Node.js LTS and npm.
```bash
npm install
npm run dev
```
Checks: `npm run typecheck`, `npm test`, `npm run build`.

## Principles
- One human player versus three AI opponents.
- Centralized, data-driven rules.
- Explicit and logged money transfers and AI decisions.
- Integer Bangladeshi taka (৳).
- Cooperative Citizen victory must be viable.
- Engine owns validation and state transitions.
