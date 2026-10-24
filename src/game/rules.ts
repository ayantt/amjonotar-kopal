/** Centralized constants; keep aligned with docs/GAME_RULEBOOK.md. */
export const GAME_RULES = {
  playerCount: 4,
  citizenCount: 3,
  politicianStartingCash: 2_000,
  citizenStartingCash: 1_500,
  politicianDiceCount: 2,
  citizenDiceCount: 1,
  politicianGoReward: 400,
  citizenGoReward: 200,
  politicianExactGoBonus: 200,
  citizenExactGoBonus: 100,
} as const;