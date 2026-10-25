# Online Multiplayer Plan

## Goal

Add room-code online multiplayer to Amjonotar Kopal without changing the core political-satire rules. Friends should be able to join from separate devices and take turns in one shared game.

## Recommended architecture

- **Frontend:** existing React + TypeScript + Vite app.
- **API:** same-origin Vercel Functions under `/api/multiplayer/*`.
- **Persistence:** Postgres (Neon) with a serverless-compatible driver.
- **Synchronization:** short polling while a room is active; the game is turn-based, so WebSockets are not required for the first release.
- **Authority:** server validates each action and stores the canonical game state. Clients never write game state directly to the database.
- **Identity:** random per-seat secret token stored locally by the browser; only a hash is stored server-side. Room codes are discovery identifiers, not authorization credentials.

## First release scope

1. Create a room and receive a short, human-readable room code.
2. Join an open room by code and display name.
3. At game start, randomly select one joined player as Politician; all other players become Citizens. Roles are locked when the game starts.
4. Support 2–6 human seats. The host can start once at least two players have joined; no AI seats are added to online rooms.
5. Players see the same board, cash, ownership, events, and current turn.
6. Only the player whose seat owns the current turn can submit an action; the UI also disables turn actions for other seats, while the API remains the enforcement boundary.
7. Reconnect after refresh using the seat token.
8. Room lifecycle: waiting, active, finished, expired.
9. Polling includes a monotonically increasing state version; action writes use optimistic concurrency so simultaneous requests cannot overwrite one another. A client must accept only snapshots at least as new as its current snapshot.
11. Each consequential action carries a unique request ID. The server validates the action type and payload, rejects stale versions with the latest snapshot, and makes retries of the last committed request idempotent.
12. Clients heartbeat seat presence, show disconnected seats after 15 seconds, stop submissions while offline, and recover by polling after reconnecting. Presence updates do not bump the game-state version.
10. Keep single-player mode unchanged and available.

## Server API sketch

- `POST /api/multiplayer/rooms` — create a room and host seat.
- `POST /api/multiplayer/rooms/:code/join` — join an open room.
- `GET /api/multiplayer/rooms/:code` — fetch the public room/game snapshot; never includes seat token hashes.
- `POST /api/multiplayer/rooms/:code/heartbeat` — authenticated seat-presence update that does not increment the game-state version.
- `POST /api/multiplayer/rooms/:code/start` — host starts the game when seat requirements are met.
- `POST /api/multiplayer/rooms/:code/actions` — submit a typed game action with expected state version and seat token.
- `POST /api/multiplayer/rooms/:code/leave` — release a seat while waiting. Active-game seats remain reserved so a disconnected player can reconnect.

## Game-engine integration

The current engine creates exactly one human seat and three AI seats, and several property actions explicitly require a `human` controller. Multiplayer should not duplicate or bypass those rules. First, generalize game creation to accept an explicit seat/controller setup, then expose a single typed action dispatcher that invokes existing engine functions. The API must validate the current actor, game phase, ownership, affordability, and expected state version before committing a new state.

## Database outline

- `multiplayer_rooms`: room code, host seat ID, lifecycle status, serialized canonical game state, state version, timestamps, expiry.
- `multiplayer_seats`: room ID, stable player ID, display name, role, token hash, connection/last-seen metadata, seat index.
- Use transactions/conditional updates to increment the state version only when the submitted expected version matches. Never trust a client-supplied role, cash amount, property ledger, or game state.

## Security and reliability requirements

- Generate room codes and seat tokens with cryptographically secure randomness.
- Store only a hash of each seat token; compare tokens server-side.
- Rate-limit room creation and join attempts; expire abandoned waiting rooms.
- Validate all request bodies and cap display-name and room-code lengths.
- Do not return seat token hashes or other players' secrets in snapshots.
- Treat each action as atomic. Reject stale state versions with a conflict response and the latest safe snapshot.
- Do not expose database credentials to browser code.
- Add tests for invalid tokens, full/started rooms, out-of-turn actions, stale versions, invalid engine actions, and concurrent action submissions.

## Delivery sequence

1. **Engine readiness:** configurable player seats and a typed action dispatcher, with unit tests. No change to existing single-player defaults.
2. **Persistence/API:** schema migration, room lifecycle endpoints, token-based seat authorization, optimistic concurrency.
3. **Client lobby:** create/join room, waiting room, seat list, copy/share room code.
4. **Shared game:** bind existing board UI to canonical snapshots, submit actions only for the local seat, poll while active.
5. **Multiplayer hardening (in progress):** idempotent action request IDs, action-payload validation, latest-snapshot conflict recovery, online/offline state, authenticated heartbeats and disconnected-seat indicators. Still required: automated API/concurrency tests and a deployment smoke test.

## Deployment prerequisites

The current repository has no backend, database, or multiplayer environment variables. Before the online mode can run in production, connect a Postgres database and configure its server-only connection string for the Vercel project. Deploy the API and frontend together on the same origin. No production environment variables should be committed to Git.
