# Architecture

## Stack and boundaries
React + TypeScript + Vite, strict mode, Vitest. Client-only MVP; no backend, DB, auth, analytics, or online multiplayer. LocalStorage save/load may be added after core gameplay.

```text
React UI -> app/turn orchestration -> pure TypeScript game engine -> static board/rules/card data
                                         |
                                         v
                                   typed state + event log
```

The engine must not import React, DOM, localStorage, or networking. Persistence is an adapter outside the engine.

## Planned layout
```text
src/
  app/App.tsx
  components/{board,game,players,shared}/
  game/{types,board,rules,engine,turns,properties,cards,economy,victory}.ts
  pages/{MainMenu,RoleSelection,GamePage}.tsx
  styles/
  main.tsx
tests/game/
```

## Domain model
Player: stable ID, name, role, integer cash, board position, active/bankrupt state, jail/skip state, GO count, owned property IDs, turn metadata.

Property: stable ID/space ID, type (land/railroad/utility), purchase price, base rent/charge formula, owner or cooperative marker, leaseholder/expiry, mortgage state, development level, color group.

Game state: schema version, phase (setup/awaiting-roll/resolving/awaiting-action/debt-resolution/game-over), players, active index, board/property state, public/cooperative ledgers, draw/discard piles, structured event log, victory result.

## Proposed engine API
- createNewGame(config, randomSource)
- rollForCurrentPlayer(state, randomSource)
- resolveLanding(state)
- buyProperty(state, playerId, propertyId)
- leaseProperty(state, playerId, propertyId)
- endTurn(state)
- resolveDebt(state, playerId, action)
- developProperty(state, playerId, propertyId, targetLevel)
- mortgageProperty(state, playerId, propertyId)
- checkVictory(state)

Each action validates phase, actor, ownership, and affordability; computes before committing; applies atomically; returns typed state/events or a clear error. Failed actions leave state unchanged.

## Invariants
- Currency is integer taka and cash never negative.
- Every transfer names source/destination.
- Public and cooperative funds are distinct.
- Ownership and leaseholder are distinct; no double rent payout.
- Cooperative property counted once for victory.
- Bankrupt players do not take normal turns.
- Game-over state is terminal.
- Production randomness is wrapped behind an injectable RandomSource; tests are deterministic.
- Stored saves, when introduced, are versioned and validated.
