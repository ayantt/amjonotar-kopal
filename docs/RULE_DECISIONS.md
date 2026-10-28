# Rule Decisions

Track unresolved conflicts here. When resolving one, update the rulebook/catalog, add tests, and remove contradictory provisional text.

## Locked
- RD-001: exactly one Politician and three Citizens.
- RD-002: single-player; one human against three local AI opponents; no pass-and-play.
- RD-003: human chooses a role; remaining seats are assigned to AI while preserving one Politician and three Citizens.
- RD-004: Politician privilege intentional. (Cooperative Citizen victory was superseded by RD-125.)
- RD-005: fictional composites only.
- RD-006: integer taka; public and cooperative funds separate.
- RD-007: engine validates every action; AI chooses only from legal actions.
- RD-008: no building on another player's property; permit mechanic deferred.
- RD-120: Housing: Citizens need a full color group and build evenly; costs are ৳200/৳300/৳400/৳600 for houses/hotel, with 2×/3×/4×/6× rent multipliers. Politician pays half, needs no group, may build a hotel directly, and pays no maintenance. Citizens pay ৳50 per house and ৳200 per hotel when passing GO.
- RD-009: declined properties remain unowned; no auction in MVP.
- RD-010: no backend/auth/remote AI service in the single-player MVP. Online multiplayer was added later as a separate mode (RD-128); single-player stays local and offline.
- RD-011: AI receives only player-appropriate information; no cheating or hidden-state access.
- RD-012: AI decisions are bounded, validated, and logged in concise user-facing language.

- **RD-125: Victory is last player standing.** The game runs until exactly one player is not bankrupt; that player (Politician or Citizen) wins. The 7-property, ৳8,000 wealth, two-Citizen-bankruptcy and People's Charter victories were removed, along with Charter voting. Open follow-ups: game length and balance (see Playtest notes in the final audit report).

- **RD-128: Online multiplayer mode.** A room holds 2–6 human players and no AI seats. When the host starts the game, one seat is drawn at random as Politician and every other seat is a Citizen; roles are locked for the match. Seats take turns in join order, so the Politician is not necessarily first. All rules (cash, dice, GO, tax escalation, bankruptcy, last-player-standing victory) are identical to single-player and are enforced by the server through the same engine functions. The 70% Politician balance target (RD-127) was measured only for the four-player all-AI game; online games with other player counts are not balance-tested. Single-player and online share one game screen (`GameScreen.tsx`).
- **RD-129: Anonymous analytics (product decision, not a game rule).** The engine records structured counters (`GameState.stats`: money flow by category, landings, rent by space, card draws, property decisions, builds, bankruptcy causes, per-round cash) purely for measurement; they never influence play, and seeded games play out identically with or without them. A finished game becomes a `GameSummary` that contains no names, player ids, IPs or room codes: only seats, roles and numbers. Single-player clients report a random per-game id plus that summary (skipped when the browser sends Do Not Track); online games are recorded by the multiplayer API itself under a hashed id. Summaries are validated and rebuilt from known fields before storage. Single-player clients also report only the current round number every 5 rounds (no other data) to measure drop-off. Counts are games, not people: nothing links one game to another. Reading aggregates requires `ANALYTICS_ADMIN_TOKEN`. Counters are stripped from room payloads sent to clients.
- **RD-126: Tax escalation.** Every `taxEscalationEveryRounds` (4) rounds each tax rises by `taxEscalationPercent` (100%) of its base amount. Without it, money simply recirculates and some seeded games never ended (2 of 1,000 exceeded 20,000 turns).
- **RD-127: Balance target — the Politician wins about 70% of seeded all-AI games.** Measured over 1,000 fresh-seed games: 69% Politician wins, every game finishes, median 258 turns (p90 409). Findings behind the tuning: with *no* Politician privileges the AI Politician already wins ~70% (it moves first, plays better, and gets the favourable card decks), and the Politician never went bankrupt under the old numbers (Citizens were killed by taxes 44%, rent 40%, cards 14%); the privileges that fed on the public treasury (tax exemption, Plaza jackpot, Citizen-asset inheritance) pushed the win rate to ~100%. **Kept:** two dice, ৳2,000 start, half rent as a visitor, double railroad fares and 10×+৳30 utility charges for Citizens, full-price mortgage, role-specific cards, cheap/maintenance-free building. **Changed:** GO ৳200 (Politician) vs ৳400 (Citizen), equal taxes for everyone, Plaza open to all, bankrupt assets go to the creditor, tax escalation (RD-126). The target is enforced by `tests/game/balance.test.ts` (60–80% band over 300 seeded games). Caveat: the number is for AI-vs-AI play; a human Citizen may do better or worse than the AI.

## Open decisions
- ~~RD-101 Politician wealth~~ — obsolete: property-count and wealth victory conditions were removed (RD-125).
- ~~RD-102 Leases in Citizen property count~~ — obsolete: property-count and wealth victory conditions were removed (RD-125).
- **RD-103 Public fund shortfall — resolved for Phase 3:** “If available” collections transfer only the available balance; shortfalls are waived, not carried as hidden liabilities. Revisit if explicit debt instruments are added.
- **RD-104 Lease rent:** Provisional: active leaseholder alone collects rent; owner does not also collect.
- **RD-105 Debt order — provisional implementation:** The engine automatically spends cash, then mortgages owned unmortgaged properties using the role-specific loan terms (Citizen: half price less 5% fee; Politician: full price, no fee), then declares bankruptcy if the amount remains unpaid. Manual mortgage redemption is implemented; player-selected liquidation and cooperative rescue are deferred.
- ~~RD-106 Cooperative vote~~ — obsolete: the People's Charter and its vote were removed (RD-125).
- **RD-107 Doubles:** Extra roll after resolving landing, maximum two consecutive bonus rolls. **Status: not implemented in code** (the Constitution now says so); extra rolls currently come only from the Public Holiday card. Implementing it would further favour the Politician, so decide together with balance tuning.
- **RD-108 Luxury tax contribution:** Politician receives 25% only from available public fund; no money created silently.
- **RD-109 Maintenance:** ৳50 per house and provisional ৳200 per hotel each time player passes GO.
- **RD-110 Multi-player card payment failure — resolved for Phase 3:** Process Citizens in player-array order; each transfer invokes the same cash/mortgage/bankruptcy resolver before continuing.

- **RD-121 Buildings on ownership change (partly resolved; bankruptcy to the market also demolishes):** Buildings are demolished when the Politician sells a property back to the government (it becomes unowned land). **Still open:** buildings currently survive a Citizen-to-Politician sale and a Citizen bankruptcy transfer (the Politician inherits them and pays no maintenance). Bankruptcy transfer also clears the mortgage flag for free. Decide whether transferred buildings should be demolished and whether inherited mortgages should survive.
- **RD-122 Politician bankruptcy (resolved by RD-125):** the Politician can go bankrupt like anyone else and the game continues if two or more players remain. The rulebook's old "government support" sentence was removed.
- ~~RD-123~~ obsolete: the ৳8,000 wealth victory (and its mortgage double-count) was removed (RD-125).
- **RD-124 Community Service (resolved):** CH-11 is "contribute ৳100 to the public fund or lose the next turn"; the turn is lost only when the contribution is declined or unaffordable.

Never silently invent behavior for unresolved rules. Mark decision resolved, record rationale, update docs, and add normal/edge-case tests.

## Phase 3 implementation notes
- RD-111: Decks are catalog-ordered, not shuffled, for deterministic tests. Shuffling and discard piles remain deferred.
- RD-112: Optional contributions are skipped automatically for a human player because a card-choice interaction is not yet implemented; AI contributes only when affordable.
- RD-113: Card draws are deterministic and cycle through the 16-card catalog in order; deck draw counts are tracked in state.
- RD-114: Citizen bankruptcy transfers owned assets to the Politician while the Politician is in play. Bankruptcy no longer ends the game by itself (superseded by RD-125).

## Cooperative economy implementation notes
- RD-115: Citizen contributions are currently explicit ৳100/৳500 actions; no forced contributions are made by the UI.
- RD-116: Cooperative properties are tracked separately from individual owners; rent is paid into the cooperative fund.
- ~~RD-117~~ obsolete: Charter activation removed (RD-125).
- ~~RD-118~~ obsolete: the 7-property, ৳8,000 and two-bankruptcy Politician victories were removed (RD-125).

- RD-119: Cooperative property purchases can currently be made by the current Citizen when the fund covers the price; a separate majority spending vote is deferred.

## Reliability decisions
- RD-130: Online absence. A seat is *away* when it has sent no heartbeat for 30 s. The server (lazily, on room reads) has the computer play the current seat's turn when that seat is away and the turn is past a 20 s grace, or when the turn has been idle for 180 s. Each automatic turn adds one to the seat's `missedTurns`; any real action resets it. At 3 consecutive misses the seat forfeits. Leaving via the LEAVE button forfeits immediately. Forfeit sends cash to the public fund, returns properties to the bank with no buildings, marks the player bankrupt, and passes play on; last-player-standing (RD-125) then decides the winner. Constants: `src/game/absence.ts`.
- RD-131: Single-player autosave. The game is saved to `localStorage` (`amjonotar-kopal-save-v1`, versioned, strictly validated) after changes (debounced) and on page hide, only at awaiting-roll or end-turn phases. It is cleared when the game ends or the player discards it. A corrupt, unknown-version or storage-blocked save is ignored and the menu offers a new game. The analytics game id is kept on resume so a resumed game is not counted twice.
- RD-132: Abuse limits and clean-up. Fixed-window limits per client address, stored in Postgres as salted hashes (addresses are never stored): room creation 5/min and 30/h; join 20/min; start/leave 30/min; actions 300/min; forfeit 10/min; analytics writes 120/min; admin-summary attempts 20/min (blocks token guessing); room polling 600/min and heartbeats 120/min (about 50 requests a minute per open tab, so a shared address stays well inside it). Clients poll every 1.6 s while visible and every 5 s while the tab is hidden, and pause for `Retry-After` (at most 60 s) after a 429. Over the limit returns 429 with `Retry-After`. The limiter fails open if its storage errors. Daily `/api/maintenance` (Vercel Cron, `CRON_SECRET`) deletes rooms expired over 1 h, rate-limit rows over 2 h, unfinished analytics games idle over 30 days, and all analytics rows over 365 days; room creation also prunes opportunistically (about 2%).
- RD-133: Extra anonymous analytics. (a) Game endings: the engine records forfeits (`left` or `absent`) and the computer's auto-played turns; each finished game summary carries `endedBy` (bankruptcy, left, absent) and `autoPlayedTurns`, each seat a `forfeitReason`. Older summaries lack these and count as "unknown". (b) Player journey: anonymous daily counters in `analytics_events` (`visit` once per tab session, `lobby-open`, `replay` after a finished game in the same tab session, server-side `room-created`), combined with game rows (started, reached round 5, finished). Counts are tab sessions and games, never people; there are no ids or cookies, Do Not Track is honoured and the admin dashboard is not counted. (c) Online room health: rooms created vs started vs finished vs abandoned. Events older than 365 days are deleted by the cleanup. No gameplay rule changes.
- RD-134: Event media. Game events may carry an optional machine-readable `key` (`space:<id>`, `card:<id>`, `pass-go`, `buy`, `build`, `bankrupt`, `forfeit`, `game-over`). The UI maps keys to optional video, image or audio in the event popup via `src/app/eventMedia.json` (see `docs/EVENT_MEDIA.md`). The key is presentation-only: it never changes rules, money or outcomes; every player sees the same clip because it comes from the shared event log; a missing or broken file falls back to the text popup. Saves and rooms from before keys existed still load.
