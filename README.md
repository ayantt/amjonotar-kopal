# আমজনতার কপাল | Amjonotar Kopal

A satirical, Bangladesh-inspired property board game: **The people pay. The powerful play.**

Exactly four local pass-and-play seats: one Politician and three Citizens. The intentionally unequal rules parody patronage, rent-seeking, and public-service failures. Citizens can win only by cooperating.

> Fictional political satire. Use fictional composites; do not imply allegations about specific real people.

## Status
Specification and starter scaffold. Full gameplay is not implemented yet.

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
React + TypeScript + Vite; pure TypeScript game engine; Vitest. Local-only MVP: no backend, accounts, or network multiplayer.

## Run
Requires current Node.js LTS and npm.
```bash
npm install
npm run dev
```
Checks: `npm run typecheck`, `npm test`, `npm run build`.

## Principles
- Centralized, data-driven rules.
- Explicit and logged money transfers.
- Integer Bangladeshi taka (৳).
- Cooperative Citizen victory must be viable.
- Engine owns validation and state transitions.
