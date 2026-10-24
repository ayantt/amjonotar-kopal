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

## Property sales

- A human player may sell an individually owned, unmortgaged property during their own turn from the property's detail popup. Properties with an active lease, a mortgage, and Citizens' Cooperative properties cannot be sold through this action.
- When a Citizen sells, the Politician must have enough available cash to pay the property's full listed price. The Politician buys the property automatically; the seller receives 90% of the listed price and 10% is paid to the public treasury as sales tax.
- When the Politician sells, the government buys the property back at its full listed price. The Politician receives the full amount and pays no sales tax. The property becomes unowned and returns to the market. The government treasury is allowed to go negative for this buy-back; player cash is never allowed to go negative.
- Sales are recorded in the Official Record and are resolved by the game engine.

## Property mortgages

- A human player may mortgage an individually owned property during their own turn from its property detail popup. Properties with an active lease and Citizens' Cooperative properties cannot be mortgaged. A mortgaged property earns no rent until redeemed.
- Citizen mortgage: gross advance is 50% of the listed price; a processing fee of 5% of the loan principal is paid to the public treasury and deducted from the advance. The Citizen receives 95% of the half-price advance (net 47.5% of listed price). Clearing the mortgage costs 110% of the loan principal (the half-price advance plus 10% interest).
- Politician mortgage: advance is 100% of listed price, with no processing fee. Clearing the mortgage costs 108% of listed price (principal plus 8% interest).
- Mortgage redemption requires available cash and is performed by the property owner during their own turn. Interest is calculated on the gross loan principal, not on net proceeds. Amounts are rounded down for the Citizen's fee and rounded up for redemption where necessary.
- Automatic mortgage actions during debt settlement use the same role-specific advance and fee rules. Processing fees enter the public treasury. The mortgage remains until the owner pays the full redemption amount.
- Mortgage and redemption actions are recorded in the Official Record. A property cannot be sold while mortgaged under the current sale rule.

## Implemented property-loop details (current code)

- Unclaimed land, railroads, and utilities pause the turn for Buy, Lease, or Decline. The engine exposes only affordable actions; the same legal-action list drives the human panel and AI.
- Land base rent is 10% of purchase price rounded up, with a ৳10 minimum. Railroad base rent is ৳50 multiplied by the number of railroads controlled by its owner/leaseholder. Citizen visitors pay double on Politician-controlled railroads; Politician visitors pay half on Citizen-controlled railroads.
- Utility charge uses the visitor's roll total: Citizen-controlled utility costs 4× that total; Politician-controlled utility costs 10× plus ৳30. Politician visitors pay no utility charge.
- Politician visitors pay half rent on Citizen-controlled land. Politician leases collect half land rent. An active leaseholder receives rent instead of the property owner, preventing duplicate payouts. Citizen leases expire after five GO passes; Politician leases are permanent.
- Income Tax currently charges Citizens ৳100 and the Politician ৳50. Development Levy charges Citizens ৳100 and exempts the Politician. Politician landing on Public Plaza withdraws the available public treasury; other players receive no jackpot.
- These are initial Phase 2 values. Card effects and debt/bankruptcy settlement are implemented. Cooperative purchases and victory triggers are now partially implemented; houses and player-directed debt choices remain future work.

## Implemented card and debt resolution

- The two typed decks contain 16 Community cards and 16 Chance cards each. Cards are drawn in a deterministic catalog order, which makes tests reproducible; shuffling is not implemented yet.
- Card effects are role-specific and execute in listed order. Current effects include cash income and costs, payments to the public fund, conditional withdrawals from available public funds, Citizen contributions, Citizen-to-Politician collections, movement with destination resolution, skipped turns, Administrative Hold, and an extra roll.
- Optional Citizen contributions are automatically skipped for the human player (to avoid silently spending their cash without a choice); AI Citizens contribute only when they can afford the amount. The human receives an event-log explanation. This is a temporary interaction rule until explicit card-choice UI is added.
- Conditional public-fund collections pay only the available amount; any shortfall is waived rather than carried as hidden debt. Conditional public payments are skipped when the public-fund condition is not met.
- Payments first use available cash, then automatically mortgage eligible unmortgaged owned properties using the debtor's role-specific loan amount and processing-fee rules. If the bill still cannot be paid, the debtor is declared bankrupt, remaining cash is set to zero, owned property is transferred according to the current rule (Citizen assets go to the Politician; Politician assets go to the named creditor where applicable), and the player's leases are cleared.
- Bankruptcy ends the game if the Politician goes bankrupt (Citizens win) or when two Citizens go bankrupt (Politician wins). The cooperative Citizen victory condition is implemented in initial form as described below; mortgage redemption is implemented.
- The event log records card draws, payments, mortgage actions, bankruptcy, and skip-turn effects. The board UI shows deck draw counts and a game-over message.

## Housing (later phase)
Levels: none (1×), 1 house (2×), 2 houses (3×), 3 houses (4×), hotel (6×). Incremental Citizen costs: ৳200, ৳300, ৳400, ৳600. Citizens must own full color group and build evenly. Citizen maintenance: ৳50 per house each GO pass; hotel maintenance provisionally ৳200 per GO pass. Politician may build on owned properties without group completion, pays half upgrade cost, and may upgrade directly to hotel. No building on another player's property; permit-fee idea is deferred.

## Railroads and utilities (later phase)
Citizen pays normal fare on Citizen-controlled railroad, double fare on Politician-controlled railroad. Politician pays nothing; if Citizen-controlled, Politician pays half fare as “Public Service Contribution.” Citizens pay utility charge plus service-adjustment fee if Politician-controlled. Politician pays nothing and collects half utility charge from any Citizen landing there, or full charge plus adjustment if Politician-controlled. Store formulas in data.

## Cards and public fund
Draw from Chance/Community Chest; shuffle at start and reshuffle when draw pile empties. Card effects are typed engine actions. Taxes and penalties go to public fund unless specified. Politician landing on Free Parking withdraws all available public funds; if empty, gets provisional ৳200 government-backed support recorded as liability. Citizens get no jackpot. Citizens pay Luxury Tax plus wealth surcharge when they own more than two properties; Politician is exempt. Politician receives 25% of Citizen Luxury Tax only from available public funds—never create money silently.

## Public services and jail
Citizen landing on Politician-controlled Water Works pays standard charge plus maintenance even if service is disrupted. Politician pays nothing; collects half water charge from Citizens, or full plus emergency fee when Politician-controlled. Debt resolution and lost turns are separate states. Jailed Citizens may pay bail or use release card and do not collect rent while jailed. Politician may pay processing fee to remain free unless investigation overrides privilege.

## Debt and bankruptcy
Citizens may use cash, sell assets, mortgage (Citizen receives 47.5% net after fee; Politician receives full price; mortgaged property earns no rent until redemption), or request cooperative rescue. Politician mortgages for the full listed price with no processing fee; like Citizens, the Politician collects no rent from mortgaged property until redemption. Citizen-to-Citizen trades allowed. Selling to Politician requires unanimous active-Citizen approval. If still unable to pay, Citizen goes bankrupt and remaining cash/property transfer to Politician after atomic settlement. Politician cannot bankrupt from ordinary debt; government support covers shortfall and records liability.

## Cooperative fund and victory
Citizens can contribute ৳100 or ৳500 through the UI to a separate fund; the Politician cannot withdraw, tax, or seize it. A Citizen may purchase an unclaimed property from the fund when it can cover the listed price. Cooperative property rent flows into the cooperative fund. The UI supports a majority vote for the People's Charter; once approved with at least ৳1,000 in the fund, the Charter is pending until the next Citizen round. The Citizens must keep all three active, control at least eight properties jointly (including cooperative properties), retain combined cash of at least ৳3,000, and preserve at least ৳1,000 in the cooperative fund for the joint victory to trigger.

**Politician wins** if any trigger occurs:
1. Controls at least 7 properties, including active Politician leases.
2. Reaches ৳8,000 in cash plus the listed purchase value of individually owned property (leases and liabilities are not included in this provisional calculation).
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
