# Game Rulebook

Provisional values must be play-tested. If documents conflict, resolve it in RULE_DECISIONS.md before coding.

## Setup
Exactly four seats: one human-controlled player and three AI-controlled players. The human chooses Politician or Citizen; fill remaining seats with AI while preserving exactly one Politician and three Citizens. There is no local pass-and-play. AI turns advance automatically and display their actions in the event log.

| Setting | Politician | Each Citizen |
|---|---:|---:|
| Starting cash | ৳2,000 | ৳1,500 |
| Dice | 2 | 1 |
| GO pass/landing reward | ৳400 | ৳200 |
| Exact GO landing bonus | +৳200 | +৳100 |

Order: Politician, Citizen 1, Citizen 2, Citizen 3. Public and cooperative funds start at ৳0. Cash cannot be negative; unaffordable payments enter debt resolution.

## Turns and GO
Roll, move, reward each GO crossing, resolve destination, complete legal actions, log events, check victory, advance. Human chooses among legal actions. AI chooses one action from the engine's legal-action list; the engine validates it. AI choices use only player-appropriate information, have a bounded decision process, and show a short rationale in the log. Politician doubles grant an additional roll after the landing resolves; cap bonus rolls at two consecutive. Citizens roll one die. Moving forward across GO pays reward; backward movement does not unless a card says otherwise.

## Properties and leases
Buy an unowned property at listed price or decline; no auction in MVP. A Citizen may lease for half price (round down), collects full base rent, and lease expires after passing GO five times after signing. Politician may lease for half price, collects half base rent, and lease never expires. During an active lease only the designated leaseholder collects rent; do not double-pay owner and leaseholder.

Citizen on another Citizen's property pays normal development-adjusted rent. Citizen on Politician-controlled property pays the applicable rent; Politician lease rent is half base rent unless a specific rule overrides it. Politician landing on Citizen property pays half normal rent. Own property costs no rent. Cooperative-property rent goes to cooperative fund; cooperative-property rules are distinct from individual ownership.

## Implemented property-loop details (current code)

- Unclaimed land, railroads, and utilities pause the turn for Buy, Lease, or Decline. The engine exposes only affordable actions; the same legal-action list drives the human panel and AI.
- Land base rent is 10% of purchase price rounded up, with a ৳10 minimum. Railroad base rent is ৳50 multiplied by the number of railroads controlled by its owner/leaseholder. Citizen visitors pay double on Politician-controlled railroads; Politician visitors pay half on Citizen-controlled railroads.
- Utility charge uses the visitor's roll total: Citizen-controlled utility costs 4× that total; Politician-controlled utility costs 10× plus ৳30. Politician visitors pay no utility charge.
- Politician visitors pay half rent on Citizen-controlled land. Politician leases collect half land rent. An active leaseholder receives rent instead of the property owner, preventing duplicate payouts. Citizen leases expire after five GO passes; Politician leases are permanent.
- Income Tax currently charges Citizens ৳100 and the Politician ৳50. Development Levy charges Citizens ৳100 and exempts the Politician. Politician landing on Public Plaza withdraws the available public treasury; other players receive no jackpot.
- These are initial Phase 2 values. Card effects, cooperative properties, debt/bankruptcy settlement, houses, and victory triggers are not yet active in the engine. If a player cannot pay, the current fallback charges available cash and logs the shortfall; full debt resolution is pending.

## Housing (later phase)
Levels: none (1×), 1 house (2×), 2 houses (3×), 3 houses (4×), hotel (6×). Incremental Citizen costs: ৳200, ৳300, ৳400, ৳600. Citizens must own full color group and build evenly. Citizen maintenance: ৳50 per house each GO pass; hotel maintenance provisionally ৳200 per GO pass. Politician may build on owned properties without group completion, pays half upgrade cost, and may upgrade directly to hotel. No building on another player's property; permit-fee idea is deferred.

## Railroads and utilities (later phase)
Citizen pays normal fare on Citizen-controlled railroad, double fare on Politician-controlled railroad. Politician pays nothing; if Citizen-controlled, Politician pays half fare as “Public Service Contribution.” Citizens pay utility charge plus service-adjustment fee if Politician-controlled. Politician pays nothing and collects half utility charge from any Citizen landing there, or full charge plus adjustment if Politician-controlled. Store formulas in data.

## Cards and public fund
Draw from Chance/Community Chest; shuffle at start and reshuffle when draw pile empties. Card effects are typed engine actions. Taxes and penalties go to public fund unless specified. Politician landing on Free Parking withdraws all available public funds; if empty, gets provisional ৳200 government-backed support recorded as liability. Citizens get no jackpot. Citizens pay Luxury Tax plus wealth surcharge when they own more than two properties; Politician is exempt. Politician receives 25% of Citizen Luxury Tax only from available public funds—never create money silently.

## Public services and jail
Citizen landing on Politician-controlled Water Works pays standard charge plus maintenance even if service is disrupted. Politician pays nothing; collects half water charge from Citizens, or full plus emergency fee when Politician-controlled. Debt resolution and lost turns are separate states. Jailed Citizens may pay bail or use release card and do not collect rent while jailed. Politician may pay processing fee to remain free unless investigation overrides privilege.

## Debt and bankruptcy (later phase)
Citizens may use cash, sell assets, mortgage (half purchase price; mortgaged property earns no rent and cannot be developed), or request cooperative rescue. Politician mortgages for full purchase price and still collects rent. Citizen-to-Citizen trades allowed. Selling to Politician requires unanimous active-Citizen approval. If still unable to pay, Citizen goes bankrupt and remaining cash/property transfer to Politician after atomic settlement. Politician cannot bankrupt from ordinary debt; government support covers shortfall and records liability.

## Cooperative fund and victory
Citizens may contribute voluntarily to a separate fund; Politician cannot withdraw, tax, or seize it. Majority of active Citizens may approve spending on joint property, development, rescue, or People's Charter. Cooperative property rent enters the fund. Politician landing there pays Chanda contribution.

**Politician wins** if any trigger occurs:
1. Controls at least 7 properties, including active Politician leases.
2. Reaches ৳8,000 defined personal wealth (asset valuation is an open decision).
3. Two Citizens go bankrupt.

**Citizens win together** only if all are true:
1. All three Citizens remain active.
2. They collectively control at least 8 properties, counting each cooperative property once.
3. Their combined cash is at least ৳3,000, excluding cooperative fund.
4. They contribute at least ৳1,000 to the cooperative fund for the People's Charter.
5. Fund remains at or above ৳1,000 until start of next Citizen round.
6. Charter is formally activated.

Check victory after every completed action and at round start. If both trigger in one atomic action, Politician victory takes precedence provisionally.

## Deferred rules
Negotiation/private deals and optional Election Day challenge are deferred. Do not implement until core game is stable and rules are finalized.
