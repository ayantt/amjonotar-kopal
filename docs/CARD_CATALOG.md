# Card Catalog

Original fictional cards; amounts are provisional tuning values. Decks contain 16 Community Chest and 16 Chance cards.

## Conventions
Each card has stable ID, title, text, and typed effects. Every transfer names payer, payee, amount, and destination. Never allow negative cash; route inability to pay through debt resolution. Public fund and Citizens' cooperative fund are separate. Multi-player effects resolve in deterministic player order. “If available” transfers at most the available public balance; any shortfall must be explicitly forgiven or recorded as liability.

## Community Chest
| ID | Card | Citizen effect | Politician effect |
|---|---|---|---|
| CC-01 | Government Allowance | Collect ৳100, pay ৳20 processing | Collect ৳250 public grant |
| CC-02 | Public Service Bill | Pay ৳120 to public fund | Pay ৳20 fee |
| CC-03 | Public Benefit | Receive ৳100 after admin costs | Receive ৳200 |
| CC-04 | Road Repair Levy | Pay ৳100 to public fund | Collect ৳100 compensation |
| CC-05 | Unexpected Medical Expense | Pay ৳150 | Collect ৳100 reimbursement |
| CC-06 | Community Donation | Optionally contribute ৳50 to cooperative fund | Collect ৳100 Chanda from each Citizen |
| CC-07 | Paperwork Correction | Pay ৳60 | Pay ৳10 |
| CC-08 | Delayed Salary | Lose ৳100 | Collect ৳150 advance |
| CC-09 | Transport Subsidy | Collect ৳80 | Collect ৳200 grant |
| CC-10 | Maintenance Notice | Pay ৳90 | Pay ৳20 |
| CC-11 | School Fundraiser | Optionally contribute ৳50 to cooperative fund | Collect ৳100 constituency support |
| CC-12 | Electricity Adjustment | Pay ৳100 | Collect ৳100 allowance |
| CC-13 | Audit | Pay ৳100 | Pay ৳25; no further penalty |
| CC-14 | Public Contract | Pay ৳80 | Collect ৳250 advance |
| CC-15 | Neighbour Helps Neighbour | Collect ৳50 if another Citizen contributes ৳50 | Collect ৳100 from public fund if available |
| CC-16 | People's Meeting | Each Citizen may contribute ৳50; if all do, public fund adds ৳100 if available | Pay ৳20 venue fee |

## Chance
| ID | Card | Citizen effect | Politician effect |
|---|---|---|---|
| CH-01 | Price Hike | Pay ৳150 to public fund | Collect ৳200 from public fund; shortfall liability |
| CH-02 | Investigation Notice | Pay ৳100 and skip next turn | Pay ৳25 and continue |
| CH-03 | Tax Rebate | Receive ৳100 less ৳30 fee | Receive ৳250 |
| CH-04 | Road Diversion | Move back 3; resolve destination | Move forward 3; resolve destination/GO |
| CH-05 | Development Project | Pay ৳100 levy | Collect ৳200 advance |
| CH-06 | Public Holiday | Skip next turn | Extra roll, within cap |
| CH-07 | Broken Water Line | Pay ৳100 maintenance | Collect ৳100 from public fund if available |
| CH-08 | Permit Required | Pay ৳80 | Pay ৳10 |
| CH-09 | Transport Strike | Pay ৳100 compensation | Collect ৳100 compensation |
| CH-10 | Favourable Headline | Pay ৳50 PR fee | Collect ৳150 from public fund if available |
| CH-11 | Community Service | Contribute ৳100 (to the public fund) or lose next turn; the turn is lost only if the contribution is declined/unaffordable (human: automatic skip, RD-112) | Collect ৳100 allowance |
| CH-12 | Court Date | Go to jail | Pay ৳25 and remain free unless investigated |
| CH-13 | Contract Award | Pay ৳100 bid fee | Collect ৳300 contract income |
| CH-14 | Inflation Adjustment | Pay ৳120 | Collect ৳120 adjustment |
| CH-15 | Public Apology | Pay ৳50 | Pay ৳10, no skipped turn |
| CH-16 | Collective Action | If all agree, each may contribute ৳50 to cooperative fund | Pay ৳100 to public fund if available; otherwise liability |

Convert this catalog to typed discriminated-union effects before implementing the card resolver. Cards with multi-player effects must be atomic or specify deterministic partial resolution.
