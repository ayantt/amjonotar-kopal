import { mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { aggregateSummaries, summarizeGame, type AnalyticsReport } from "../../src/game/analytics";
import { simulateAiGame } from "../../src/game/simulate";

const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const flow = (record: Record<string, number | undefined>) => Object.entries(record).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([key, amount]) => `${key} ৳${amount}`).join(", ") || "—";

const counts = (record: Record<string, number | undefined>) => Object.entries(record).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([key, count]) => `${key} ${count}`).join(", ") || "—";

function toMarkdown(report: AnalyticsReport, meta: { games: number; seedBase: number; unfinished: number }): string {
  const rate = report.politicianWinRate;
  const spaces = [...report.spaces].sort((a, b) => b.landingsPerGame - a.landingsPerGame);
  const rent = [...report.spaces].sort((a, b) => b.rentPerGame - a.rentPerGame).slice(0, 8);
  return `# Balance report

Simulated ${meta.games} all-AI four-player games (seeds ${meta.seedBase}…${meta.seedBase + meta.games - 1}); ${meta.unfinished} did not finish within the turn cap.

## Outcome
- Politician win rate: **${pct(rate.rate)}** (95% CI ${pct(rate.low)}–${pct(rate.high)}, ${rate.wins}/${rate.games})
- Game length in rounds: ${report.rounds ? `median ${report.rounds.median}, mean ${report.rounds.mean}, p90 ${report.rounds.p90}, max ${report.rounds.max}` : "—"}
- Players ending bankrupt: Politician ${pct(report.bankruptRate.politician)}, Citizen ${pct(report.bankruptRate.citizen)}
- Mean final net worth: Politician ৳${report.meanNetWorth.politician}, Citizen ৳${report.meanNetWorth.citizen}

## Bankruptcy causes
- Politician (players): ${counts(report.bankruptcyCauses.politician)}
- Citizen (players): ${counts(report.bankruptcyCauses.citizen)}

## Money per seat per game
- Politician in: ${flow(report.moneyFlow.politician.in)}
- Politician out: ${flow(report.moneyFlow.politician.out)}
- Citizen in: ${flow(report.moneyFlow.citizen.in)}
- Citizen out: ${flow(report.moneyFlow.citizen.out)}

## Property decisions
- Politician: buy ${pct(report.decisionRates.politician.buy)}, lease ${pct(report.decisionRates.politician.lease)}, decline ${pct(report.decisionRates.politician.decline)}; builds per game ${report.buildsPerGame.politician}
- Citizen: buy ${pct(report.decisionRates.citizen.buy)}, lease ${pct(report.decisionRates.citizen.lease)}, decline ${pct(report.decisionRates.citizen.decline)}; builds per game ${report.buildsPerGame.citizen}

## Most landed-on spaces (per game)
${spaces.slice(0, 8).map((s) => `- ${s.name}: ${s.landingsPerGame}`).join("\n")}

## Least landed-on spaces (per game)
${spaces.slice(-5).map((s) => `- ${s.name}: ${s.landingsPerGame}`).join("\n")}

## Highest rent-earning spaces (৳ per game)
${rent.map((s) => `- ${s.name}: ${s.rentPerGame}`).join("\n")}
`;
}

// Run with `npm run analytics:report` (GAMES and SEED_BASE environment variables are optional).
it("writes a balance report from seeded all-AI games", () => {
  const games = Number(process.env.GAMES ?? 500);
  const seedBase = Number(process.env.SEED_BASE ?? 1);
  const summaries = [];
  let unfinished = 0;
  for (let i = 0; i < games; i += 1) {
    const { state } = simulateAiGame((seedBase + i) * 104_729);
    if (state.phase !== "game-over") { unfinished += 1; continue; }
    summaries.push(summarizeGame(state, "single"));
  }
  const report = aggregateSummaries(summaries);
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/balance-report.json", JSON.stringify(report, null, 2));
  writeFileSync("reports/balance-report.md", toMarkdown(report, { games, seedBase, unfinished }));
}, 600_000);
