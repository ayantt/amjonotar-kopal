import { useEffect, useState } from "react";
import { BOARD } from "../game/board";
import { buyCooperativeProperty, contributeToCooperative, createNewGame, endTurn, getCurrentPlayer, isHumanTurn, resolvePropertyAction, rollAndMove, validateSetup, voteForCharter } from "../game/engine";
import { runAiTurn } from "../game/turns";
import { getLegalPropertyActions } from "../game/properties";
import type { GameState, PlayerRole } from "../game/types";

const money = (amount: number) => `৳${amount.toLocaleString("en-BD")}`;
const roleName = (role: PlayerRole) => role === "politician" ? "Politician" : "Citizen";
export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState("Choose your role to start a new game.");
  const [showConstitution, setShowConstitution] = useState(false);

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
      <div className="header-actions"><button className="constitution-button" onClick={() => setShowConstitution(true)}>সংবিধান <span>RULE BOOK ↗</span></button><button className="reset-button" onClick={restart}>Restart ↻</button></div>
    </header>
    {showConstitution && <div className="constitution-backdrop" role="presentation" onClick={() => setShowConstitution(false)}>
      <section className="constitution-modal" role="dialog" aria-modal="true" aria-labelledby="constitution-title" onClick={(event) => event.stopPropagation()}>
        <header className="constitution-header"><div><p className="constitution-kicker">THE REPUBLIC OF OPPORTUNITY · FOUNDING INSTRUMENT</p><h2 id="constitution-title">সংবিধান</h2><p className="constitution-subtitle">The Constitution of the Board</p></div><button className="constitution-close" aria-label="Close rule book" onClick={() => setShowConstitution(false)}>CLOSE ×</button></header>
        <div className="constitution-preamble"><strong>প্রস্তাবনা · PREAMBLE</strong><p>We, the occupants of these four seats, establish these rules to govern the movement of money, land, privilege, and public power. The rules are binding upon every player; where privilege is expressly granted, equality shall not be presumed.</p></div>
        <div className="constitution-body">
          <article><span className="article-number">ARTICLE I</span><h3>Of the Republic and its Seats</h3><p><b>Section 1.</b> The Republic shall consist of four players: one Politician and three Citizens. One seat shall be controlled by the human player; the remaining seats shall be controlled by the computer.</p><p><b>Section 2.</b> The human player may choose either office. The composition of the Republic shall remain one Politician and three Citizens at all times.</p></article>
          <article><span className="article-number">ARTICLE II</span><h3>Of Turns and Passage</h3><p><b>Section 1.</b> The Politician shall cast two dice. Each Citizen shall cast one die. A player shall move according to the result and submit to the law of the space upon which they arrive.</p><p><b>Section 2.</b> Upon passing the starting space, the Politician shall receive ৳400 and each Citizen ৳200. A player landing exactly upon the starting space shall receive an additional ৳200 if Politician, or ৳100 if Citizen.</p><p><b>Section 3.</b> A Politician rolling doubles may receive an additional roll, subject to the engine's limit. A movement expressly ordered by a card shall be governed by that card.</p></article>
          <article><span className="article-number">ARTICLE III</span><h3>Of Property, Title, and Lease</h3><p><b>Section 1.</b> An eligible player landing on unclaimed property may purchase it at its listed price, lease it where permitted, or decline. No auction shall be held under the present rules.</p><p><b>Section 2.</b> A Citizen may lease for half the listed price, rounded down, and collect the applicable base rent. Such lease shall expire after five passages across the starting space. A Politician may lease for half price, collect half base land rent, and retain the lease indefinitely.</p><p><b>Section 3.</b> Rent shall be determined by the property type, the parties' roles, and any specific rule applicable to that space. A leaseholder entitled to rent shall receive it in place of the owner; duplicate collection is prohibited.</p><p><b>Section 4.</b> Property held by the Citizens' Cooperative shall be recorded separately. Rent from such property shall be paid into the cooperative fund.</p></article>
          <article><span className="article-number">ARTICLE IV</span><h3>Of Revenue and Public Funds</h3><p><b>Section 1.</b> The public treasury and the Citizens' Cooperative fund are distinct accounts. No transfer between them shall be presumed.</p><p><b>Section 2.</b> Taxes and penalties shall be assessed according to the space and the player's role. Under current law, Income Tax is ৳100 for a Citizen and ৳50 for the Politician; the Development Levy is ৳100 for a Citizen, while the Politician is exempt.</p><p><b>Section 3.</b> When the Politician lands on Public Plaza, the Politician may withdraw the available public treasury. Other players acquire no such entitlement by landing there.</p><p><b>Section 4.</b> The Politician's privileges are intentional features of this satirical Republic; they shall not be construed as a declaration of fairness.</p></article>
          <article><span className="article-number">ARTICLE V</span><h3>Of Cards, Debt, and Insolvency</h3><p><b>Section 1.</b> A Chance or Community Chest card shall be resolved according to its stated effect, including any role-specific provision. The current decks follow a fixed order and are not shuffled.</p><p><b>Section 2.</b> A debt shall first be paid from available cash. If cash is insufficient, eligible unmortgaged property may be mortgaged automatically at half its listed purchase price. Cash shall not fall below zero.</p><p><b>Section 3.</b> If the debt remains unpaid, the debtor shall be declared bankrupt. A bankrupt Citizen's assets shall pass to the Politician under the current rule. The Politician's bankruptcy shall confer victory upon the Citizens.</p><p><b>Section 4.</b> The bankruptcy of two Citizens shall confer victory upon the Politician.</p></article>
          <article><span className="article-number">ARTICLE VI</span><h3>Of Mutual Aid and the People's Charter</h3><p><b>Section 1.</b> A Citizen may contribute ৳100 or ৳500 to the cooperative fund. Such fund is separate from personal cash and the public treasury.</p><p><b>Section 2.</b> An unclaimed property may be acquired by the Citizens' Cooperative when the fund can meet its listed price. Cooperative property shall count once toward collective control.</p><p><b>Section 3.</b> A majority of Citizens may approve the People's Charter when the cooperative fund contains at least ৳1,000. The Charter shall remain pending until the next Citizen round, and its conditions must be preserved until activation.</p><p><b>Section 4.</b> The Citizens shall prevail jointly only when all three remain active, collectively control at least eight properties, hold combined personal cash of at least ৳3,000, maintain at least ৳1,000 in the cooperative fund, and the Charter is activated.</p></article>
          <article><span className="article-number">ARTICLE VII</span><h3>Of Victory and Final Authority</h3><p><b>Section 1.</b> The Politician shall prevail upon controlling at least seven properties, attaining at least ৳8,000 in personal cash and the listed purchase value of individually owned property, or causing two Citizens to become bankrupt.</p><p><b>Section 2.</b> For the provisional wealth test, leases and liabilities shall not be included. Cooperative property is not individually owned by the Politician.</p><p><b>Section 3.</b> Victory shall be checked after actions and at the relevant round boundary. Where both sides' victory conditions arise in the same atomic action, Politician victory takes precedence under the provisional rules.</p></article>
          <article><span className="article-number">ARTICLE VIII</span><h3>Of Interpretation and Amendments</h3><p><b>Section 1.</b> The rules currently implemented by the game engine shall govern play. Where a provision describes a future or deferred mechanic, it shall not be treated as available until implemented.</p><p><b>Section 2.</b> This Constitution is a work of fictional political satire. It describes the laws of this game and makes no allegation concerning any specific person.</p></article>
        </div>
        <footer className="constitution-footer"><span>ENACTED FOR PLAY · SUBJECT TO GAME ENGINE</span><button className="primary-action" onClick={() => setShowConstitution(false)}>I HAVE READ THE CONSTITUTION <span>×</span></button></footer>
      </section>
    </div>}
    <section className="game-intro"><div><p className="eyebrow">THE PEOPLE PAY. THE POWERFUL PLAY.</p><h1>The board is <em>rigged.</em></h1></div><p>{busy ? "The computer is making its move…" : lastAction}</p></section>
    {game.phase === "game-over" && <section className="game-over-panel"><strong>GAME OVER</strong><p>{game.winner === "politician" ? "The Politician wins by consolidating power, wealth, or through Citizen bankruptcies." : game.winner === "citizens" ? (game.charterActivated ? "The Citizens held the People's Charter and win together." : "The Politician has gone bankrupt. The Citizens win together.") : "The game has ended."}</p><button className="primary-action" onClick={restart}>Start a new game ↗</button></section>}
    <section className="game-layout">
    <section className="panel log-panel"><div className="panel-label">THE OFFICIAL RECORD <span>RECENT EVENTS</span></div><div className="event-list">{[...game.events].reverse().map((event) => <div className={`event event-${event.kind}`} key={event.id}><span>{String(event.id).padStart(3,"0")}</span><p>{event.message}</p></div>)}</div></section>
      <div className="board-wrap">
        <div className="board-heading"><span>THE REPUBLIC OF OPPORTUNITY</span><span>40 SPACES</span></div>
        <div className="board-grid">
          {BOARD.map((space, index) => {
            const occupants = game.players.filter((player) => player.position === index);
            const edge = index <= 10
              ? { gridColumn: 11 - index, gridRow: 11 }
              : index <= 19
                ? { gridColumn: 1, gridRow: 21 - index }
                : index <= 30
                  ? { gridColumn: index - 19, gridRow: 1 }
                  : { gridColumn: 11, gridRow: index - 29 };
            return <div style={edge} className={`space space-${space.type} ${space.color ? `color-${space.color}` : ""}`} key={space.id}>
              <span className="space-index">{String(index).padStart(2, "0")}</span><strong>{space.name}</strong><small>{space.subtitle}</small>
              {space.price !== undefined && <span className="space-price">{money(space.price)}</span>}
              {game.cooperativePropertyIds.includes(space.id) && <small className="ownership-tag">OWN: CITIZENS CO-OP</small>}{game.properties[space.id]?.ownerId && <small className="ownership-tag">OWN: {game.players.find((player) => player.id === game.properties[space.id].ownerId)?.name ?? "Unknown"}</small>}
              {game.properties[space.id]?.leaseholderId && <small className="ownership-tag">LEASE: {game.players.find((player) => player.id === game.properties[space.id].leaseholderId)?.name ?? "Unknown"}</small>}
              {occupants.length > 0 && <div className="tokens">{occupants.map((player) => <span title={`${player.name} · ${roleName(player.role)}`} key={player.id} className={`token ${player.role} ${player.controller}`}>{player.controller === "human" ? "YOU" : player.role === "politician" ? "P" : player.name.slice(0,1)}</span>)}</div>}
            </div>;
          })}
          <div className="board-center">
            <span className="center-kicker">THE REPUBLIC OF OPPORTUNITY</span>
            <strong>আমজনতার <em>কপাল</em></strong>
            <span className="center-stamp">THE BOARD<br />IS RIGGED</span>
            <span className="center-caption">FORTY SPACES · FOUR SEATS · ONE CROOKED SYSTEM</span>
            <div className="center-status">{current.name} · {roleName(current.role)} · {money(current.cash)}</div>
          </div>
        </div>
      </div>
      <aside className="sidebar">
        <section className="panel current-panel"><div className="panel-label">NOW PLAYING</div><div className="current-player"><span className={`large-token ${current.role}`}>{current.controller === "human" ? "YOU" : current.role === "politician" ? "P" : current.name.slice(0,1)}</span><div><h2>{current.name}</h2><p>{roleName(current.role)} · {current.controller === "human" ? "Human player" : "Computer opponent"}</p></div></div><div className="cash-line"><span>AVAILABLE CASH</span><strong>{money(current.cash)}</strong></div>
          {current.controller === "human" && game.pendingPropertyId && <div className="property-decision"><div className="panel-label">PROPERTY DECISION</div><strong>{BOARD.find((space) => space.id === game.pendingPropertyId)?.name}</strong><p>Choose what to do with this unclaimed space.</p>{propertyActions.map((action) => <button className={action.type === "decline" ? "secondary-action" : "primary-action"} key={action.type} onClick={() => setGame((state) => state ? resolvePropertyAction(state, action.type) : state)}>{action.label}<span>{action.type === "decline" ? "↷" : money(action.cost)}</span></button>)}{current.role === "citizen" && game.charterPendingRound === null && game.cooperativeFund >= (BOARD.find((space) => space.id === game.pendingPropertyId)?.price ?? Infinity) && <button className="secondary-action" onClick={() => setGame((state) => state ? buyCooperativeProperty(state, current.id) : state)}>Buy for Citizens co-op <span>{money(BOARD.find((space) => space.id === game.pendingPropertyId)?.price ?? 0)}</span></button>}</div>}
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
    <footer className="site-footer"><span>FICTIONAL POLITICAL SATIRE · NOT A SIMULATION OF ANY SPECIFIC PERSON</span><button onClick={restart}>NEW GAME ↗</button></footer>
  </main>;
}
