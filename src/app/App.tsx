import { useEffect, useState } from "react";
import { BOARD } from "../game/board";
import { buyCooperativeProperty, contributeToCooperative, createNewGame, endTurn, getCurrentPlayer, isHumanTurn, resolvePropertyAction, rollAndMove, validateSetup, voteForCharter } from "../game/engine";
import { runAiTurn } from "../game/turns";
import { getLegalPropertyActions } from "../game/properties";
import type { GameState, PlayerRole } from "../game/types";

const money = (amount: number) => `৳${amount.toLocaleString("en-BD")}`;
const roleName = (role: PlayerRole) => role === "politician" ? "Politician" : "Citizen";
function boardPosition(index: number): { gridRow: number; gridColumn: number } {
  if (index <= 10) return { gridRow: 11, gridColumn: 11 - index };
  if (index <= 20) return { gridRow: 21 - index, gridColumn: 1 };
  if (index <= 30) return { gridRow: 1, gridColumn: index - 19 };
  return { gridRow: index - 29, gridColumn: 11 };
}

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState("Choose your role to start a new game.");

  useEffect(() => {
    if (!game || game.phase !== "awaiting-roll" || isHumanTurn(game)) return;
    setBusy(true);
    const timer = window.setTimeout(() => {
      setGame((current) => {
        if (!current || current.phase !== "awaiting-roll" || isHumanTurn(current)) return current;
        const moved = runAiTurn(current);
        setLastAction(`${getCurrentPlayer(current).name} completed an AI turn.`);
        return moved;
      });
      setBusy(false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [game]);

  function startGame(role: PlayerRole) {
    const next = createNewGame({ humanRole: role });
    if (!validateSetup(next)) throw new Error("Invalid four-player setup.");
    setGame(next);
    setBusy(false);
    setLastAction(`Game started. You are the ${roleName(role)}.`);
  }
  function roll() {
    if (!game || !isHumanTurn(game) || game.phase !== "awaiting-roll") return;
    const next = rollAndMove(game);
    setGame(next);
    const player = getCurrentPlayer(game);
    const landed = BOARD[next.players[game.currentPlayerIndex].position];
    setLastAction(`You rolled ${player.role === "politician" ? "two dice" : "one die"} and landed on ${landed.name}.`);
  }
  function finishTurn() {
    if (!game || !isHumanTurn(game) || game.phase !== "awaiting-end-turn") return;
    setGame(endTurn(game));
    setLastAction("Your turn ended. The computer opponents will play automatically.");
  }
  function restart() {
    setGame(null);
    setBusy(false);
    setLastAction("Choose your role to start a new game.");
  }

  if (!game) return <main className="app-shell">
    <header className="masthead"><span className="seal">আ</span><span>PLACEHOLDER POLITICS CLUB</span><span className="masthead-right">BOARD GAME NO. 01</span></header>
    <section className="hero">
      <p className="eyebrow">একটি রাজনৈতিক ব্যঙ্গাত্মক বোর্ড গেম</p>
      <h1>আমজনতার<br /><em>কপাল।</em></h1>
      <p className="lede">The people pay. The powerful play.</p>
      <p className="intro">A crooked little property game about big promises, public money, and who gets to make the rules. Choose your seat. Three computer opponents will take the others.</p>
      <div className="role-picks">
        <button className="role-card politician-card" onClick={() => startGame("politician")}><span className="role-number">01 / POWER</span><strong>Play as Politician</strong><span>Two dice. Special privileges. Keep the system on your side.</span><span className="button-copy">TAKE THE CHAIR ↗</span></button>
        <button className="role-card citizen-card" onClick={() => startGame("citizen")}><span className="role-number">02 / PEOPLE</span><strong>Play as Citizen</strong><span>One die. Three citizens. Your best chance is to work together.</span><span className="button-copy">JOIN THE PUBLIC ↗</span></button>
      </div>
    </section>
    <footer className="site-footer"><span>FICTIONAL POLITICAL SATIRE</span><span>4 SEATS · 1 HUMAN · 3 AI</span></footer>
  </main>;

  const current = getCurrentPlayer(game);
  const propertyActions = game.pendingPropertyId ? getLegalPropertyActions(game, current) : [];
  return <main className="game-shell">
    <header className="game-header">
      <button className="wordmark" onClick={restart} aria-label="Return to role selection">আমজনতার কপাল<span>BACK TO MENU ↗</span></button>
      <div className="turn-pill"><span className={current.controller === "human" ? "pulse-dot" : "pulse-dot ai-dot"} />{current.controller === "human" ? "YOUR TURN" : "COMPUTER TURN"} · ROUND {game.round}</div>
      <button className="reset-button" onClick={restart}>Restart ↻</button>
    </header>
    <section className="game-intro"><div><p className="eyebrow">THE PEOPLE PAY. THE POWERFUL PLAY.</p><h1>The board is <em>rigged.</em></h1></div><p>{busy ? "The computer is making its move…" : lastAction}</p></section>
    {game.phase === "game-over" && <section className="game-over-panel"><strong>GAME OVER</strong><p>{game.winner === "politician" ? "The Politician wins. Two Citizens have gone bankrupt." : game.winner === "citizens" ? "The Politician has gone bankrupt. The Citizens win together." : "The game has ended."}</p><button className="primary-action" onClick={restart}>Start a new game ↗</button></section>}
    <section className="game-layout">
      <div className="board-wrap">
        <div className="board-heading"><span>THE REPUBLIC OF OPPORTUNITY</span><span>40 SPACES</span></div>
        <div className="board-grid">
          {BOARD.map((space, index) => {
            const occupants = game.players.filter((player) => player.position === index);
            return <div style={boardPosition(index)} className={`space space-${space.type} ${space.color ? `color-${space.color}` : ""}`} key={space.id}>
              <span className="space-index">{String(index).padStart(2, "0")}</span><strong>{space.name}</strong><small>{space.subtitle}</small>
              {space.price !== undefined && <span className="space-price">{money(space.price)}</span>}
              {game.cooperativePropertyIds.includes(space.id) && <small className="ownership-tag">OWN: CITIZENS CO-OP</small>}{game.properties[space.id]?.ownerId && <small className="ownership-tag">OWN: {game.players.find((player) => player.id === game.properties[space.id].ownerId)?.name ?? "Unknown"}</small>}
              {game.properties[space.id]?.leaseholderId && <small className="ownership-tag">LEASE: {game.players.find((player) => player.id === game.properties[space.id].leaseholderId)?.name ?? "Unknown"}</small>}
              {occupants.length > 0 && <div className="tokens">{occupants.map((player) => <span title={`${player.name} · ${roleName(player.role)}`} key={player.id} className={`token ${player.role} ${player.controller}`}>{player.controller === "human" ? "YOU" : player.role === "politician" ? "P" : player.name.slice(0,1)}</span>)}</div>}
            </div>;
          })}
          <div className="board-center"><span className="center-kicker">THE REPUBLIC OF</span><strong>OPPORTUNITY</strong><span className="center-stamp">PUBLIC MONEY<br />PRIVATE RULES</span><span className="center-caption">A BOARD GAME FOR FOUR SEATS</span></div>
        </div>
      </div>
      <aside className="sidebar">
        <section className="panel current-panel"><div className="panel-label">NOW PLAYING</div><div className="current-player"><span className={`large-token ${current.role}`}>{current.controller === "human" ? "YOU" : current.role === "politician" ? "P" : current.name.slice(0,1)}</span><div><h2>{current.name}</h2><p>{roleName(current.role)} · {current.controller === "human" ? "Human player" : "Computer opponent"}</p></div></div><div className="cash-line"><span>AVAILABLE CASH</span><strong>{money(current.cash)}</strong></div>
          {current.controller === "human" && game.pendingPropertyId && <div className="property-decision"><div className="panel-label">PROPERTY DECISION</div><strong>{BOARD.find((space) => space.id === game.pendingPropertyId)?.name}</strong><p>Choose what to do with this unclaimed space.</p>{propertyActions.map((action) => <button className={action.type === "decline" ? "secondary-action" : "primary-action"} key={action.type} onClick={() => setGame((state) => state ? resolvePropertyAction(state, action.type) : state)}>{action.label}<span>{action.type === "decline" ? "↷" : money(action.cost)}</span></button>)}{current.role === "citizen" && game.cooperativeFund >= (BOARD.find((space) => space.id === game.pendingPropertyId)?.price ?? Infinity) && <button className="secondary-action" onClick={() => setGame((state) => state ? buyCooperativeProperty(state, current.id) : state)}>Buy for Citizens co-op <span>{money(BOARD.find((space) => space.id === game.pendingPropertyId)?.price ?? 0)}</span></button>}</div>}
          {current.controller === "human" ? <div className="actions"><button className="primary-action" onClick={roll} disabled={busy || game.phase !== "awaiting-roll"}>Roll {current.role === "politician" ? "two dice" : "one die"} <span>↗</span></button><button className="secondary-action" onClick={finishTurn} disabled={busy || game.phase !== "awaiting-end-turn" || Boolean(game.pendingPropertyId)}>End turn →</button></div> : <p className="ai-note">{busy ? "Thinking through the next move…" : "Computer turn will begin shortly."}</p>}
        </section>
        <section className="panel players-panel"><div className="panel-label">THE FOUR SEATS</div>{game.players.map((player) => <div className={`player-row ${player.id === current.id ? "selected" : ""}`} key={player.id}><span className={`mini-token ${player.role}`}>{player.controller === "human" ? "Y" : player.role === "politician" ? "P" : player.name.slice(0,1)}</span><div className="player-row-name"><strong>{player.name}</strong><small>{roleName(player.role)} · {player.controller === "human" ? "You" : "AI"}{player.bankrupt ? " · BANKRUPT" : ""}</small></div><strong className="player-cash">{money(player.cash)}</strong><small className="position-label">#{player.position}</small></div>)}</section>
        <section className="panel funds-panel"><div className="panel-label">THE COMMON POOL</div><div className="fund-row"><span>Public treasury</span><strong>{money(game.publicFund)}</strong></div><div className="fund-row"><span>Citizens' cooperative</span><strong>{money(game.cooperativeFund)}</strong></div><p>These funds are tracked separately. The Politician rules are part of the satire.</p>
          {current.controller === "human" && current.role === "citizen" && <div className="cooperative-actions">
            <div className="panel-label">ORGANIZE TOGETHER</div>
            <div className="cooperative-buttons">
              <button className="secondary-action" disabled={current.cash < 100 || game.phase === "game-over"} onClick={() => setGame((state) => state ? contributeToCooperative(state, current.id, 100) : state)}>Contribute ৳100</button>
              <button className="secondary-action" disabled={current.cash < 500 || game.phase === "game-over"} onClick={() => setGame((state) => state ? contributeToCooperative(state, current.id, 500) : state)}>Contribute ৳500</button>
            </div>
            <button className="primary-action" disabled={game.charterPendingRound !== null || game.charterActivated || game.charterVotes.includes(current.id) || game.cooperativeFund < 1000} onClick={() => setGame((state) => state ? voteForCharter(state, current.id) : state)}>Vote for People's Charter <span>{game.charterVotes.length}/3</span></button>
            <small>{game.charterPendingRound !== null ? "Charter pending: preserve the fund and victory conditions until the next Citizen round." : "A majority vote and ৳1,000 cooperative fund are required to propose the Charter."}</small>
          </div>}<div className="fund-row"><span>Community cards drawn</span><strong>{game.cardDrawCounts.community}/16</strong></div><div className="fund-row"><span>Chance cards drawn</span><strong>{game.cardDrawCounts.chance}/16</strong></div></section>
      </aside>
    </section>
    <section className="panel log-panel"><div className="panel-label">THE OFFICIAL RECORD <span>RECENT EVENTS</span></div><div className="event-list">{[...game.events].reverse().slice(0,8).map((event) => <div className={`event event-${event.kind}`} key={event.id}><span>{String(event.id).padStart(3,"0")}</span><p>{event.message}</p></div>)}</div></section>
    <footer className="site-footer"><span>FICTIONAL POLITICAL SATIRE · NOT A SIMULATION OF ANY SPECIFIC PERSON</span><button onClick={restart}>NEW GAME ↗</button></footer>
  </main>;
}
