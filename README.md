# আমজনতার কপাল | Amjonotar Kopal

A satirical, Bangladesh-inspired property board game: **The people pay. The powerful play.**

A single human plays against three computer-controlled opponents. Each game has exactly four seats: one Politician and three Citizens. The intentionally unequal rules parody patronage, rent-seeking, and public-service failures. The game is won by being the last player not bankrupt; Citizens may help each other through a shared cooperative fund.

> Fictional political satire. Use fictional composites; do not imply allegations about specific real people.

## Status
**Playable systems implemented so far:** role selection, 40-space fictional board, role-based dice and GO rewards; property buy/lease/decline; ownership, rent, railroads and utilities; 32 role-specific cards; public/cooperative fund transfers; skipped turns and extra rolls; automatic mortgage fallback and bankruptcy outcomes. The game now includes cooperative contributions, shared-property purchases and rent, and a last-player-standing victory rule. Houses/hotels, mortgages with redemption, and property sales are also implemented for the human player. Remaining work includes full playtesting, card-choice UI, shuffled decks, AI building/redemption, the doubles bonus roll, and further balance tuning (in seeded all-AI simulations the Politician now wins about 70% of games, with a median length of ~260 turns; see RD-127).

## Online multiplayer (in progress)

The `feature/online-multiplayer` branch contains an initial room-code multiplayer implementation: create/join rooms, 2–6 human seats, a randomly assigned Politician and remaining Citizens, server-side turn validation, state-version conflict checks, polling-based synchronization, and a shared game view. It is not enabled on the live site yet. It requires a Postgres database and the server-only `DATABASE_URL` environment variable in Vercel. Rooms expire after 12 hours. See [the multiplayer plan](docs/MULTIPLAYER_PLAN.md). Full browser playtesting and deployment configuration are still required.

## Analytics
Balance: `npm run analytics:report` simulates seeded all-AI games and writes `reports/balance-report.md` and `.json` (optional `GAMES=1000 SEED_BASE=1`). Real players: finished games are reported anonymously (no names, IPs or room codes; Do Not Track is honoured) to `/api/analytics`; set `DATABASE_URL` and `ANALYTICS_ADMIN_TOKEN` in Vercel, then open `/#/analytics` and enter the token (kept only for the browser session). The dashboard shows player activity (completion, abandonment, session length, drop-off, office chosen, online room sizes) and gameplay (win rates, wealth, money flow, bankruptcies, spaces). See RD-129 and `docs/ARCHITECTURE.md`.

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
- Last player standing wins: the game ends when every other player is bankrupt.
- Engine owns validation and state transitions.
