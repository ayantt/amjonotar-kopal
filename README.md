# আমজনতার কপাল | Amjonotar Kopal

A satirical, Bangladesh-inspired property board game: **The people pay. The powerful play.**

A single human plays against three computer-controlled opponents. Each game has exactly four seats: one Politician and three Citizens. The intentionally unequal rules parody patronage, rent-seeking, and public-service failures. Citizens can win only by cooperating, including when their seats are AI-controlled.

> Fictional political satire. Use fictional composites; do not imply allegations about specific real people.

## Status
**Playable systems implemented so far:** role selection, 40-space fictional board, role-based dice and GO rewards; property buy/lease/decline; ownership, rent, railroads and utilities; 32 role-specific cards; public/cooperative fund transfers; skipped turns and extra rolls; automatic mortgage fallback and bankruptcy outcomes. The game now includes cooperative contributions, shared-property purchases and rent, Charter voting, and initial Politician/Citizen victory checks. Houses/hotels, mortgages with redemption, and property sales are also implemented for the human player. Remaining work includes full playtesting, card-choice UI, shuffled decks, AI building/redemption, the doubles bonus roll, and balance tuning (in seeded all-AI simulations the Politician currently wins every game).

## Online multiplayer (in progress)\n\nThe `feature/online-multiplayer` branch contains an initial room-code multiplayer implementation: create/join rooms, 2–6 human seats, a randomly assigned Politician and remaining Citizens, server-side turn validation, state-version conflict checks, polling-based synchronization, and a shared game view. It is not enabled on the live site yet. It requires a Postgres database and the server-only `DATABASE_URL` environment variable in Vercel. Rooms expire after 12 hours. See [the multiplayer plan](docs/MULTIPLAYER_PLAN.md). Full browser playtesting and deployment configuration are still required.\n\n## Docs
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
