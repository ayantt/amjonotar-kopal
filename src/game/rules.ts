/** Centralized constants; keep aligned with docs/GAME_RULEBOOK.md. */
export const GAME_RULES = {
  playerCount: 4,
  citizenCount: 3,
  politicianStartingCash: 2_000,
  citizenStartingCash: 1_500,
  politicianDiceCount: 2,
  citizenDiceCount: 1,
  politicianGoReward: 200,
  citizenGoReward: 400,
  politicianExactGoBonus: 100,
  citizenExactGoBonus: 200,
  /** The Politician pays 1/N of normal rent when visiting Citizen-controlled land, railroads and cooperative property. */
  politicianVisitorRentDivisor: 2,
  incomeTaxCitizen: 100,
  incomeTaxPolitician: 100,
  luxuryTaxCitizen: 100,
  luxuryTaxPolitician: 100,
  /** Share of the listed price the Politician receives when mortgaging (Citizens always receive 50%, less a 5% fee). */
  politicianMortgageAdvancePercent: 100,
  /** 1 = a bankrupt Citizen's property passes to a solvent Politician; 0 = it goes to the creditor or the open market. */
  citizenBankruptcyToPolitician: 0 as 0 | 1,
  /** Multiplier on railroad fares Citizens pay on Politician-controlled railroads. */
  citizenRailroadFareMultiplier: 2,
  /** Utility charge on Politician-controlled utilities: dice total × multiplier + flat fee (Citizen-controlled: dice total × 4). */
  politicianUtilityMultiplier: 10,
  politicianUtilityFlat: 30,
  /** Share (0-100) of the public treasury a Citizen collects when landing on Public Plaza; the Politician always collects all of it. */
  plazaCitizenSharePercent: 100,
  /** Taxes rise by `taxEscalationPercent` of their base amount every `taxEscalationEveryRounds` rounds (0 = never), so games always end. */
  taxEscalationEveryRounds: 4,
  taxEscalationPercent: 100,
} as const;