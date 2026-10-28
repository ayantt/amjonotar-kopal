import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlayerRole } from "../game/types";
import type { AnalyticsOverview } from "../server/analyticsStore";
import { BarList, ChartCard, ColumnChart, Kpi, Legend, NEUTRAL, ROLE_COLOR, ShareBar, WealthChart, money, pct, titleCase } from "./analyticsCharts";

type Scope = "all" | "single" | "online";
type Rate = AnalyticsOverview["reports"]["all"]["politicianWinRate"];
const TOKEN_KEY = "amjonotar-kopal-analytics-token";
const ROLES: PlayerRole[] = ["politician", "citizen"];
const roleLabel = (role: PlayerRole) => role === "politician" ? "Politician" : "Citizen";
const rateHint = (rate: Rate) => rate.rate === null ? "no finished games" : `95% CI ${pct(rate.low)}–${pct(rate.high)} · n=${rate.games}`;
const sorted = (record: Partial<Record<string, number>>) => Object.entries(record).filter(([, value]) => (value ?? 0) > 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as Array<[string, number]>;

function readToken(): string {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; }
}
function saveToken(value: string) {
  try { if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* Remembering the token is a convenience only. */ }
}

export function AnalyticsDashboard({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState(readToken);
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (value: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/analytics/summary", { headers: { Authorization: `Bearer ${value}` } });
      const body = await response.json().catch(() => ({})) as AnalyticsOverview & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load analytics.");
      setData(body);
      saveToken(value);
    } catch (e) {
      setData(null);
      if (e instanceof Error && /token/i.test(e.message)) saveToken("");
      setError(e instanceof Error ? e.message : "Could not load analytics.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { const saved = readToken(); if (saved) void load(saved); }, [load]);

  const report = data?.reports[scope];
  const endings = report ? ([["Last opponent went bankrupt", report.endReasons.bankruptcy], ["Last opponent left the game", report.endReasons.left], ["Last opponent timed out (away)", report.endReasons.absent], ["Unknown (older games)", report.endReasons.unknown]] as Array<[string, number]>)
    .map(([label, value]) => ({ label, value })).filter((row) => row.value > 0) : [];
  const activity = data?.activity[scope];
  // Hours are stored in UTC; show them in the viewer's own time zone.
  const hourOffset = useMemo(() => -new Date().getTimezoneOffset() / 60, []);
  const hours = useMemo(() => activity ? Array.from({ length: 24 }, (_, hour) => ({
    label: String(hour), values: [activity.startsByHour[(((hour - Math.round(hourOffset)) % 24) + 24) % 24]],
    tip: `${hour}:00–${hour}:59 · ${activity.startsByHour[(((hour - Math.round(hourOffset)) % 24) + 24) % 24]} games started`,
  })) : [], [activity, hourOffset]);

  return <main className="app-shell analytics-shell">
    <header className="masthead"><span className="seal">আ</span><span>ANALYTICS · ADMIN</span><button className="secondary-action" onClick={onBack}>BACK TO GAME ↗</button></header>
    <section className="analytics-panel">
      <h1>Players &amp; gameplay</h1>
      <p className="analytics-note">Anonymous, per-game data only: no names, IP addresses or room codes are stored, and players are not tracked across games, so counts are games, not people. Single-player results are reported by the browser and are not verified; online results are recorded by the server. Based on the latest 5,000 games.</p>
      <form className="analytics-login" onSubmit={(event) => { event.preventDefault(); void load(token); }}>
        <label className="multiplayer-label">ADMIN TOKEN<input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="ANALYTICS_ADMIN_TOKEN" /></label>
        <button className="primary-action" disabled={loading || !token}>{loading ? "LOADING…" : data ? "REFRESH ↻" : "LOAD ANALYTICS"}</button>
      </form>
      {error && <p className="multiplayer-error" role="alert">{error}</p>}
      {data && report && activity && <>
        <div className="analytics-tabs" role="tablist" aria-label="Game mode">{(["all", "single", "online"] as const).map((item) => <button key={item} role="tab" aria-selected={scope === item} className={scope === item ? "is-on" : ""} onClick={() => setScope(item)}>{item === "all" ? "ALL GAMES" : item === "single" ? "SINGLE-PLAYER" : "ONLINE"}</button>)}</div>

        {scope !== "online" && <>
          <h2>Player journey</h2>
          <div className="viz-grid">
            <ChartCard wide title="From opening the game to playing again" note={`Single-player only. Each step is a count of games or tab sessions, not people${data.journey.since ? `; visits and replays are counted since ${data.journey.since}` : ""}. The percentage is the share of the step above.`}
              table={{ head: ["Step", "Count", "Of previous step"], rows: data.journey.steps.map((step) => [step.label, step.count, pct(step.rateOfPrevious)]) }}>
              <BarList color={NEUTRAL.strong} empty="No visits yet." rows={data.journey.steps.map((step) => ({ label: step.label, value: step.count, detail: step.rateOfPrevious === null ? undefined : pct(step.rateOfPrevious) }))} />
            </ChartCard>
          </div>
        </>}
        {scope !== "single" && <>
          <h2>Online rooms</h2>
          <div className="viz-kpis">
            <Kpi label="Lobby opened" value={String(data.onlineHealth.lobbyOpens)} hint="times the room screen was opened" />
            <Kpi label="Rooms created" value={String(data.onlineHealth.roomsCreated)} hint={data.onlineHealth.since ? `since ${data.onlineHealth.since}` : "none counted yet"} />
            <Kpi label="Rooms that started" value={String(data.onlineHealth.started)} hint={`start rate ${pct(data.onlineHealth.startRate)} of rooms created`} />
            <Kpi label="Finished" value={String(data.onlineHealth.finished)} hint={`${data.onlineHealth.inProgress} in progress · ${data.onlineHealth.abandoned} abandoned`} />
            <Kpi label="Completion" value={pct(data.onlineHealth.finishRate)} hint={data.onlineHealth.medianMinutes === null ? "no finished rooms" : `median ${data.onlineHealth.medianMinutes} min`} />
          </div>
        </>}

        <h2>Players</h2>
        <div className="viz-kpis">
          <Kpi label="Games started" value={String(activity.started)} />
          <Kpi label="Finished" value={String(activity.finished)} hint={`${activity.inProgress} in progress`} />
          <Kpi label="Abandoned" value={String(activity.abandoned)} hint={scope === "online" ? "room expired unfinished" : "no report for 60+ min"} />
          <Kpi label="Completion" value={pct(activity.completionRate)} hint="finished ÷ (finished + abandoned)" />
          <Kpi label="Median session" value={activity.durationMinutes ? `${activity.durationMinutes.median} min` : "—"} hint={activity.durationMinutes ? `p90 ${activity.durationMinutes.p90} min` : "no finished games"} />
        </div>
        <div className="viz-grid">
          <ChartCard wide title="Games per day" note="Last 30 days, all modes." table={{ head: ["Day", "Started", "Finished"], rows: [...data.daily].reverse().map((d) => [d.day, d.started, d.finished]) }}>
            <Legend items={[{ name: "Started", color: NEUTRAL.soft }, { name: "Finished", color: NEUTRAL.strong }]} />
            <ColumnChart ariaLabel="Games started and finished per day" series={[{ name: "Started", color: NEUTRAL.soft }, { name: "Finished", color: NEUTRAL.strong }]} data={data.daily.map((d) => ({ label: d.day.slice(5), values: [d.started, d.finished] }))} />
          </ChartCard>
          {scope !== "online" && <ChartCard title="Office chosen" note="Single-player starts. Win rate is among finished games." table={{ head: ["Role", "Chosen", "Human win rate"], rows: ROLES.map((r) => [roleLabel(r), activity.roleChoice[r], pct(report.humanWinRateByRole[r].rate)]) }}>
            {ROLES.map((role) => <div key={role} className="viz-role-row"><span className="viz-role-name"><i style={{ background: ROLE_COLOR[role] }} />{roleLabel(role)}</span>
              <BarList color={ROLE_COLOR[role]} rows={[{ label: "Games started", value: activity.roleChoice[role] }]} />
              <p className="viz-note">Human win rate {pct(report.humanWinRateByRole[role].rate)} · {rateHint(report.humanWinRateByRole[role])}</p></div>)}
          </ChartCard>}
          {scope !== "single" && <ChartCard title="Online room size" note="Players in each online game when it started." table={{ head: ["Players", "Games"], rows: activity.roomSizes.map((r) => [r.players, r.games]) }}>
            <BarList color={NEUTRAL.strong} empty="No online games yet." rows={activity.roomSizes.map((r) => ({ label: `${r.players} players`, value: r.games }))} />
          </ChartCard>}
          {scope !== "online" && <ChartCard title="Where players stop" note="Abandoned single-player games by the last round reached." table={{ head: ["Last round", "Games"], rows: activity.dropOff.map((d) => [d.label, d.games]) }}>
            <ColumnChart ariaLabel="Abandoned games by last round reached" series={[{ name: "Abandoned games", color: NEUTRAL.strong }]} data={activity.dropOff.map((d) => ({ label: d.label, values: [d.games], tip: `${d.games} abandoned games` }))} />
          </ChartCard>}
          <ChartCard title="When games start" note="Hour of day in your time zone." table={{ head: ["Hour", "Games started"], rows: hours.map((h) => [`${h.label}:00`, h.values[0]]) }}>
            <ColumnChart ariaLabel="Games started by hour of day" series={[{ name: "Games started", color: NEUTRAL.strong }]} data={hours} />
          </ChartCard>
        </div>

        <h2>Gameplay</h2>
        {report.games === 0 ? <p className="analytics-empty">No finished games in this view yet.</p> : <>
          <div className="viz-kpis">
            <Kpi label="Finished games" value={String(report.games)} />
            <Kpi label="Politician win rate" value={pct(report.politicianWinRate.rate)} hint={rateHint(report.politicianWinRate)} />
            <Kpi label="Median length" value={report.rounds ? `${report.rounds.median} rounds` : "—"} hint={report.rounds ? `p90 ${report.rounds.p90} · longest ${report.rounds.max}` : ""} />
            <Kpi label="Citizens bankrupt" value={pct(report.bankruptRate.citizen)} hint="of Citizen seats" />
            <Kpi label="Politicians bankrupt" value={pct(report.bankruptRate.politician)} hint="of Politician seats" />
          </div>
          <div className="viz-grid">
            <ChartCard wide title="Wealth over time" note="Mean cash per seat at the start of each round (rounds with at least 3 games)." table={{ head: ["Round", "Politician", "Citizen"], rows: report.wealthCurve.filter((p) => p.games >= 3).map((p) => [p.round, p.politician === null ? "—" : money(p.politician), p.citizen === null ? "—" : money(p.citizen)]) }}>
              <WealthChart points={report.wealthCurve.filter((p) => p.games >= 3)} />
            </ChartCard>
            {ROLES.map((role) => <ChartCard key={role} title={`${roleLabel(role)} money per game`} note="Average per seat. Income on top, spending below." table={{ head: ["Direction", "Category", "৳ per seat"], rows: [...sorted(report.moneyFlow[role].in).map(([k, v]) => ["in", titleCase(k), v]), ...sorted(report.moneyFlow[role].out).map(([k, v]) => ["out", titleCase(k), v])] }}>
              <h4>Income</h4><BarList color={ROLE_COLOR[role]} format={money} rows={sorted(report.moneyFlow[role].in).slice(0, 6).map(([k, v]) => ({ label: titleCase(k), value: v }))} />
              <h4>Spending</h4><BarList color={ROLE_COLOR[role]} format={money} rows={sorted(report.moneyFlow[role].out).slice(0, 6).map(([k, v]) => ({ label: titleCase(k), value: v }))} />
            </ChartCard>)}
            <ChartCard title="How games end" note="What removed the last defeated player. Older games recorded before this was tracked show as unknown." table={{ head: ["Ending", "Games"], rows: endings.map((e) => [e.label, e.value]) }}>
              <BarList color={NEUTRAL.strong} empty="No finished games." rows={endings} />
              {scope !== "single" && <p className="viz-note">{report.forfeits.seats} forfeited seats ({pct(report.forfeits.rate)} of seats): {report.forfeits.left} left, {report.forfeits.absent} timed out. The computer played {report.autoPlayedTurnsPerGame ?? "—"} turns per online game for absent players.</p>}
            </ChartCard>
            <ChartCard title="Why players go bankrupt" note="Cause of bankruptcy, as a count of players." table={{ head: ["Role", "Cause", "Players"], rows: ROLES.flatMap((r) => sorted(report.bankruptcyCauses[r]).map(([k, v]) => [roleLabel(r), titleCase(k), v])) }}>
              {ROLES.map((role) => <div key={role} className="viz-role-row"><span className="viz-role-name"><i style={{ background: ROLE_COLOR[role] }} />{roleLabel(role)}</span>
                <BarList color={ROLE_COLOR[role]} empty="No bankruptcies." rows={sorted(report.bankruptcyCauses[role]).slice(0, 5).map(([k, v]) => ({ label: titleCase(k), value: v }))} /></div>)}
            </ChartCard>
            <ChartCard title="Property decisions" note="Share of unclaimed-property decisions, and builds per game." table={{ head: ["Role", "Buy", "Lease", "Decline", "Builds / game"], rows: ROLES.map((r) => [roleLabel(r), pct(report.decisionRates[r].buy), pct(report.decisionRates[r].lease), pct(report.decisionRates[r].decline), report.buildsPerGame[r]]) }}>
              {ROLES.map((role) => <div key={role} className="viz-role-row"><span className="viz-role-name"><i style={{ background: ROLE_COLOR[role] }} />{roleLabel(role)} · {report.buildsPerGame[role]} builds / game</span>
                <ShareBar parts={[{ name: "Buy", value: report.decisionRates[role].buy, color: "#20241e" }, { name: "Lease", value: report.decisionRates[role].lease, color: "#7d8a78" }, { name: "Decline", value: report.decisionRates[role].decline, color: "#a39c8a" }]} /></div>)}
            </ChartCard>
            <ChartCard title="Most profitable spaces" note="Rent collected per game." table={{ head: ["Space", "Rent / game", "Landings / game"], rows: [...report.spaces].sort((a, b) => b.rentPerGame - a.rentPerGame).slice(0, 10).map((s) => [s.name, money(s.rentPerGame), s.landingsPerGame]) }}>
              <BarList color={NEUTRAL.strong} format={money} rows={[...report.spaces].sort((a, b) => b.rentPerGame - a.rentPerGame).slice(0, 10).map((s) => ({ label: s.name, value: s.rentPerGame }))} />
            </ChartCard>
            <ChartCard title="Most visited spaces" note="Landings per game." table={{ head: ["Space", "Landings / game"], rows: [...report.spaces].sort((a, b) => b.landingsPerGame - a.landingsPerGame).slice(0, 10).map((s) => [s.name, s.landingsPerGame]) }}>
              <BarList color={NEUTRAL.strong} rows={[...report.spaces].sort((a, b) => b.landingsPerGame - a.landingsPerGame).slice(0, 10).map((s) => ({ label: s.name, value: s.landingsPerGame }))} />
            </ChartCard>
          </div>
        </>}
        <p className="analytics-note">Generated {new Date(data.generatedAt).toLocaleString()}.</p>
      </>}
    </section>
  </main>;
}
