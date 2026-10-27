# Game Rulebook

Provisional values must be play-tested. If documents conflict, resolve it in RULE_DECISIONS.md before coding.

## Setup
This section describes single-player. In online multiplayer (RD-128) a room holds 2–6 human players with no AI seats; the host starts the game, one seat is drawn at random as Politician, and everyone else is a Citizen. Turns follow join order, and every rule below applies unchanged. A player who is away is replaced by the computer for that turn, and forfeits after three missed turns in a row or on leaving (RD-130): cash goes to the public fund and properties return to the bank. Single-player games autosave and can be resumed after a refresh (RD-131).

Exactly four seats: one human-controlled player and three AI-controlled players. The human chooses Politician or Citizen; fill remaining seats with AI while preserving exactly one Politician and three Citizens. There is no local pass-and-play. AI turns advance automatically and display their actions in the event log.

| Setting | Politician | Each Citizen |
|---|---:|---:|
| Starting cash | ৳2,000 | ৳1,500 |
| Dice | 2 | 1 |
| GO pass/landing reward | ৳200 | ৳400 |
| Exact GO landing bonus | +৳100 | +৳200 |

The GO rewards are deliberately larger for Citizens: the Politician's two dice cross GO about twice as often, so GO income per turn is roughly equal (RD-127). All of these numbers live in `src/game/rules.ts`.

Order: Politician, Citizen 1, Citizen 2, Citizen 3. Public and cooperative funds start at ৳0. Cash cannot be negative; unaffordable payments enter debt resolution.

## Turns and GO
Roll, move, reward each GO crossing, resolve destination, complete legal actions, log events, check victory, advance. Human chooses among legal actions. AI chooses one action from the engine's legal-action list; the engine validates it. AI choices use only player-appropriate information, have a bounded decision process, and show a short rationale in the log. Politician doubles grant an additional roll after the landing resolves; cap bonus rolls at two consecutive. **Current code: the doubles bonus is NOT implemented** (see RD-107); extra rolls come only from the Public Holiday card. Citizens roll one die. Moving forward across GO pays reward; backward movement does not unless a card says otherwise.

## Properties and leases
Buy an unowned property at listed price or decline; no auction in MVP. A Citizen may lease for half price (round down), collects full base rent, and lease expires after passing GO five times after signing. Politician may lease for half price, collects half base rent, and lease never expires. During an active lease only the designated leaseholder collects rent; do not double-pay owner and leaseholder.

Citizen on another Citizen's property pays normal development-adjusted rent. Citizen on Politician-controlled property pays the applicable rent; Politician lease rent is half base rent unless a specific rule overrides it. Politician landing on Citizen property pays half normal rent. Own property costs no rent. Cooperative-property rent goes to cooperative fund; cooperative-property rules are distinct from individual ownership.

## Property sales

- A human player may sell an individually owned, unmortgaged property during their own turn from the property's detail popup. Properties with an active lease, a mortgage, and Citizens' Cooperative properties cannot be sold through this action.
- When a Citizen sells, the Politician must have enough available cash to pay the property's full listed price. The Politician buys the property automatically; the seller receives 90% of the listed price and 10% is paid to the public treasury as sales tax.
- When the Politician sells, the government buys the property back at its full listed price. The Politician receives the full amount and pays no sales tax. The property becomes unowned and returns to the market, and any houses or hotel on it are demolished so the next buyer does not receive free development. The government treasury is allowed to go negative for this buy-back; player cash is never allowed to go negative.
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
- Income Tax and the Development Levy each charge every player ৳100 as a base amount (Politician included, RD-127), paid to the public treasury. Taxes escalate (RD-126): every 4 rounds each tax rises by its base amount (rounds 1–4: ৳100, 5–8: ৳200, 9–12: ৳300, …), so a game cannot stall forever. Any player landing on Public Plaza withdraws the entire public treasury.
- These are initial Phase 2 values. Card effects and debt/bankruptcy settlement are implemented. Cooperative purchases, victory triggers, mortgage redemption, and houses/hotels are implemented (see sections below); player-directed debt choices remain future work.

## Implemented card and debt resolution

- The two typed decks contain 16 Community cards and 16 Chance cards each. Cards are drawn in a deterministic catalog order, which makes tests reproducible; shuffling is not implemented yet.
- Card effects are role-specific and execute in listed order. Current effects include cash income and costs, payments to the public fund, conditional withdrawals from available public funds, Citizen contributions, Citizen-to-Politician collections, movement with destination resolution, skipped turns, Administrative Hold, and an extra roll.
- Community Service (CH-11) is "contribute ৳100 to the public fund or lose the next turn": an AI Citizen who can afford it contributes and keeps its turn; otherwise (always, for the human player, under the temporary rule below) the next turn is lost.
- Optional Citizen contributions are automatically skipped for the human player (to avoid silently spending their cash without a choice); AI Citizens contribute only when they can afford the amount. The human receives an event-log explanation. This is a temporary interaction rule until explicit card-choice UI is added.
- Conditional public-fund collections pay only the available amount; any shortfall is waived rather than carried as hidden debt. Conditional public payments are skipped when the public-fund condition is not met.
- Payments first use available cash, then automatically mortgage eligible unmortgaged owned properties using the debtor's role-specific loan amount and processing-fee rules. If the bill still cannot be paid, the debtor is declared bankrupt, remaining cash is set to zero, owned property is transferred according to the current rule (Citizen assets go to the Politician; Politician assets go to the named creditor where applicable), and the player's leases are cleared.
- Bankruptcy removes the player from the game; the game ends only when a single non-bankrupt player remains (see Victory below). Mortgage redemption is implemented.
- The event log records card draws, payments, mortgage actions, bankruptcy, and skip-turn effects. The board UI shows deck draw counts and a game-over message.

## Houses and hotels

- Only individually owned land spaces (not railroads or utilities) may be developed. The property must not be mortgaged, leased, or held by the Citizens' Cooperative.
- Rent multiplier: undeveloped 1×; one house 2×; two houses 3×; three houses 4×; hotel 6×. The multiplier applies to land rent before the existing role-based rent adjustment.
- Citizen building costs are incremental: first house ৳200, second ৳300, third ৳400, and hotel upgrade ৳600. Citizens must own every property in the same color group and build evenly; they must have three houses on a property before upgrading it to a hotel.
- Politicians may build on any land they own without completing a color group, pay half the listed upgrade cost, and may build a hotel directly from an undeveloped property. Political privilege is exempt from building maintenance.
- Each time a Citizen passes Shurur Line, maintenance is charged for every building they own: ৳50 per house and ৳200 per hotel. Maintenance is paid from cash and uses the existing debt/mortgage/bankruptcy resolver if the player cannot cover it.
- Building actions are available to the human player during their own turn from the property detail panel. AI building strategy is deferred; permit-fee mechanics remain deferred.

## Railroads and utilities (later phase)
Citizen pays normal fare on Citizen-controlled railroad, double fare on Politician-controlled railroad. Politician pays nothing; if Citizen-controlled, Politician pays half fare as “Public Service Contribution.” Citizens pay utility charge plus service-adjustment fee if Politician-controlled. Politician pays nothing and collects half utility charge from any Citizen landing there, or full charge plus adjustment if Politician-controlled. Store formulas in data.

## Cards and public fund
Draw from Chance/Community Chest; shuffle at start and reshuffle when draw pile empties. Card effects are typed engine actions. Taxes and penalties go to public fund unless specified. Any player landing on Free Parking (Public Plaza) withdraws all available public funds; there is no support payment when the treasury is empty. Luxury Tax (Development Levy) is a flat escalating charge on every player; the earlier wealth surcharge, Politician exemption and 25% Politician share are not implemented (see Taxes under Implemented property-loop details).

## Public services and jail
Citizen landing on Politician-controlled Water Works pays standard charge plus maintenance even if service is disrupted. Politician pays nothing; collects half water charge from Citizens, or full plus emergency fee when Politician-controlled. Debt resolution and lost turns are separate states. Jailed Citizens may pay bail or use release card and do not collect rent while jailed. Politician may pay processing fee to remain free unless investigation overrides privilege.

## Debt and bankruptcy
Citizens may use cash, sell assets, mortgage (Citizen receives 47.5% net after fee; Politician receives full price; mortgaged property earns no rent until redemption), or request cooperative rescue. Politician mortgages for the full listed price with no processing fee; like Citizens, the Politician collects no rent from mortgaged property until redemption. Citizen-to-Citizen trades allowed. Selling to Politician requires unanimous active-Citizen approval. If still unable to pay, Citizen goes bankrupt and remaining cash/property transfer to Politician after atomic settlement. The Politician can also go bankrupt (RD-125); there is no government-support safety net in the current rules.

## Cooperative fund
Citizens can contribute ৳100 or ৳500 through the UI to a separate fund; the Politician cannot withdraw, tax, or seize it. A Citizen may purchase an unclaimed property from the fund when it can cover the listed price. Cooperative property rent flows into the cooperative fund. The fund confers no victory by itself (the People's Charter was removed by RD-125); it is a voluntary mutual-aid tool.

## Victory — last player standing (RD-125)
The game continues until **exactly one player is not bankrupt**. That player wins, whether Politician or Citizen. There is no other victory condition: owning many properties, personal wealth, and the cooperative fund do not end the game.

- A bankrupt player takes no further turns, owns nothing, and cannot be revived.
- Victory is checked immediately after every bankruptcy. Once a winner is declared the game is terminal: rolls, sales, builds, mortgages, contributions and turn changes are all rejected, and no money moves.
- The winner is recorded as that player's id in `GameState.winner`.
- Bankruptcy inheritance: a bankrupt player's property passes to the creditor if the creditor is a solvent player; otherwise (public treasury, taxes, cards) it returns to the unowned market with any buildings demolished. Leases held by the bankrupt player end. (`citizenBankruptcyToPolitician` in `rules.ts` can restore the older "Citizen assets go to the Politician" rule; it is off for balance, RD-127.)

## Deferred rules
Negotiation/private deals and optional Election Day challenge are deferred. Do not implement until core game is stable and rules are finalized.
