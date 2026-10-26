import { useEffect, useRef, useState, type ReactNode } from "react";
import { BOARD } from "../game/board";
import { getCurrentPlayer, type BuildingAction } from "../game/engine";
import { getLegalPropertyActions, type PropertyAction } from "../game/properties";
import type { GameState, PlayerRole } from "../game/types";
import { BoardView } from "./BoardView";
import { Constitution } from "./Constitution";
import { EventLog } from "./EventLog";
import type { EventFeed } from "./useEventFeed";
import { PropertyModal } from "./PropertyModal";

const money = (amount: number) => `৳${amount.toLocaleString("en-BD")}`;
const roleName = (role: PlayerRole) => role === "politician" ? "Politician" : "Citizen";
const NUMBER_WORDS = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX"];

/** Everything a player can do. Single-player runs these against the local engine; online play sends them to the server. */
export type GameActions = {
  roll: () => void;
  endTurn: () => void;
  propertyAction: (action: PropertyAction) => void;
  buyCooperative: () => void;
  contribute: (amount: number) => void;
  build: (spaceId: string, building: BuildingAction) => void;
  mortgage: (spaceId: string) => void;
  redeem: (spaceId: string) => void;
  sell: (spaceId: string) => void;
};

export type GameScreenProps = {
  game: GameState;
  /** The seat this screen belongs to. Other seats are shown as opponents. */
  viewerId: string;
  online: boolean;
  /** Short label under the wordmark; clicking it runs `onWordmark` when provided. */
  wordmarkNote: string;
  onWordmark?: () => void;
  turnLabel: string;
  statusMessage: string;
  /** The viewer is the active player and the game is accepting their actions. */
  canAct: boolean;
  /** An action or opponent move is in flight; controls are disabled. */
  busy: boolean;
  waitingNote: string;
  soundEnabled: boolean;
  onToggleSound: () => void;
  feed: EventFeed;
  actions: GameActions;
  headerActions?: ReactNode;
  banner?: ReactNode;
  gameOverAction?: ReactNode;
  footerAction?: ReactNode;
};

/** The complete in-game screen. Single-player and online modes both render through this component so they match exactly. */
export function GameScreen(props: GameScreenProps) {
  const { game, viewerId, online, canAct, busy, feed, actions } = props;
  const shellRef = useRef<HTMLElement>(null);
  const [showConstitution, setShowConstitution] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowConstitution(false);
      setSelectedPropertyId(null);
    };
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("fullscreenchange", syncFullscreen);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen?.();
    } catch {
      // Fullscreen is a convenience; browsers may refuse it.
    }
  }

  const current = getCurrentPlayer(game);
  const viewer = game.players.find((player) => player.id === viewerId) ?? current;
  const isViewerTurn = canAct && current.id === viewer.id;
  const pendingSpace = game.pendingPropertyId ? BOARD.find((space) => space.id === game.pendingPropertyId) : undefined;
  const propertyActions = isViewerTurn && game.pendingPropertyId ? getLegalPropertyActions(game, current) : [];
  const selectedSpace = selectedPropertyId ? BOARD.find((space) => space.id === selectedPropertyId) : undefined;
  const selectedProperty = selectedSpace ? game.properties[selectedSpace.id] : undefined;
  const selectedColorGroup = selectedSpace?.color ? BOARD.filter((space) => space.type === "property" && space.color === selectedSpace.color) : [];
  const selectedLevel = selectedProperty?.hotel ? 4 : selectedProperty?.houses ?? 0;
  const viewerCanBuildSelected = viewer.role === "politician" || (selectedColorGroup.length > 0 && selectedColorGroup.every((space) => {
    const property = game.properties[space.id];
    const level = property?.hotel ? 4 : property?.houses ?? 0;
    return property?.ownerId === viewer.id && !property.mortgaged && !property.leaseholderId && !game.cooperativePropertyIds.includes(space.id) && level >= selectedLevel;
  }));

  const tokenLabel = (player: GameState["players"][number], large: boolean) =>
    player.id === viewer.id ? (large ? "YOU" : "Y") : player.role === "politician" ? "P" : player.name.slice(0, 1);
  const controllerLabel = (player: GameState["players"][number]) =>
    player.id === viewer.id ? "You" : player.controller === "ai" ? "AI" : "Online";
  const gameOverMessage = [...game.events].reverse().find((event) => /wins|win\b/i.test(event.message))?.message
    ?? (game.players.find((player) => player.id === game.winner) ? `${game.players.find((player) => player.id === game.winner)?.name} is the last player standing.` : "The game has ended.");

  return <main className={`game-shell ${online ? "online-game" : ""}`} ref={shellRef}>
    <header className="game-header">
      {props.onWordmark
        ? <button className="wordmark" onClick={props.onWordmark} aria-label={props.wordmarkNote}>আমজনতার কপাল<span>{props.wordmarkNote} ↗</span></button>
        : <div className="wordmark">আমজনতার কপাল<span>{props.wordmarkNote}</span></div>}
      <div className="turn-pill"><span className={isViewerTurn ? "pulse-dot" : "pulse-dot ai-dot"} />{props.turnLabel} · ROUND {game.round}</div>
      <div className="header-actions">
        <button className={`sound-toggle ${props.soundEnabled ? "is-on" : ""}`} type="button" aria-pressed={props.soundEnabled} aria-label={props.soundEnabled ? "Mute sound effects" : "Enable sound effects"} onClick={props.onToggleSound}>{props.soundEnabled ? "SOUND ON ♪" : "SOUND OFF ♫"}</button>
        <button className="constitution-button" onClick={() => setShowConstitution(true)}>সংবিধান <span>RULE BOOK ↗</span></button>
        {props.headerActions}
      </div>
    </header>
    {showConstitution && <Constitution online={online} playerCount={game.players.length} onClose={() => setShowConstitution(false)} />}
    {props.banner}
    <section className="game-intro"><div><p className="eyebrow">THE PEOPLE PAY. THE POWERFUL PLAY.</p><h1>The board is <em>rigged.</em></h1></div><p>{props.statusMessage}</p></section>
    {game.phase === "game-over" && <section className="game-over-panel"><strong>GAME OVER</strong><p>{gameOverMessage}</p>{props.gameOverAction}</section>}
    <section className="game-layout">
      <EventLog events={feed.displayedEvents} popupsEnabled={feed.popupsEnabled} onTogglePopups={feed.togglePopups} />
      <BoardView
        game={game}
        current={current}
        localPlayerId={viewer.id}
        isFullscreen={isFullscreen}
        showEventPopup={feed.popupsEnabled}
        activeEvent={feed.activeEvent}
        onSelectProperty={setSelectedPropertyId}
        onToggleFullscreen={() => void toggleFullscreen()}
        onDismissEvent={feed.dismiss}
      />
      <aside className="sidebar">
        <section className="panel current-panel"><div className="panel-label">NOW PLAYING</div>
          <div className="current-player"><span className={`large-token ${current.role} player-color-${current.id}`}>{tokenLabel(current, true)}</span><div><h2>{current.name}</h2><p>{roleName(current.role)} · {current.id === viewer.id ? "Your seat" : current.controller === "ai" ? "Computer opponent" : "Online player"}</p></div></div>
          <div className="cash-line"><span>AVAILABLE CASH</span><strong>{money(current.cash)}</strong></div>
          {isViewerTurn && game.pendingPropertyId && <div className="property-decision"><div className="panel-label">PROPERTY DECISION</div><strong>{pendingSpace?.name}</strong><p>Choose what to do with this unclaimed space.</p>
            {propertyActions.map((action) => <button className={action.type === "decline" ? "secondary-action" : "primary-action"} key={action.type} disabled={busy} onClick={() => actions.propertyAction(action.type)}>{action.label}<span>{action.type === "decline" ? "↷" : money(action.cost)}</span></button>)}
            {current.role === "citizen" && game.cooperativeFund >= (pendingSpace?.price ?? Infinity) && <button className="secondary-action" disabled={busy} onClick={actions.buyCooperative}>Buy for Citizens co-op <span>{money(pendingSpace?.price ?? 0)}</span></button>}
          </div>}
          {isViewerTurn
            ? <div className="actions">
              <button className="primary-action" onClick={actions.roll} disabled={busy || game.phase !== "awaiting-roll"}>Roll {current.role === "politician" ? "two dice" : "one die"} <span>↗</span></button>
              <button className="secondary-action" onClick={actions.endTurn} disabled={busy || game.phase !== "awaiting-end-turn" || Boolean(game.pendingPropertyId)}>{game.extraRollAvailable ? "Take extra roll →" : "End turn →"}</button>
            </div>
            : game.phase !== "game-over" && <p className="ai-note">{props.waitingNote}</p>}
        </section>
        <section className="panel players-panel"><div className="panel-label">THE {NUMBER_WORDS[game.players.length] ?? game.players.length} SEATS</div>
          {game.players.map((player) => <div className={`player-row ${player.id === current.id ? "selected" : ""}`} key={player.id}>
            <span className={`mini-token ${player.role} player-color-${player.id}`}>{tokenLabel(player, false)}</span>
            <div className="player-row-name"><strong>{player.name}</strong><small>{roleName(player.role)} · {controllerLabel(player)}{player.bankrupt ? " · BANKRUPT" : ""}</small></div>
            <strong className="player-cash">{money(player.cash)}</strong><small className="position-label">#{player.position}</small>
          </div>)}
        </section>
        <section className="panel funds-panel"><div className="panel-label">THE COMMON POOL</div>
          <div className="fund-row"><span>Public treasury</span><strong>{money(game.publicFund)}</strong></div>
          <div className="fund-row"><span>Citizens' cooperative</span><strong>{money(game.cooperativeFund)}</strong></div>
          <p>These funds are tracked separately. The Politician rules are part of the satire.</p>
          {isViewerTurn && current.role === "citizen" && <div className="cooperative-actions">
            <div className="panel-label">ORGANIZE TOGETHER</div>
            <div className="cooperative-buttons">
              <button className="secondary-action" disabled={busy || current.cash < 100 || game.phase === "game-over"} onClick={() => actions.contribute(100)}>Contribute ৳100</button>
              <button className="secondary-action" disabled={busy || current.cash < 500 || game.phase === "game-over"} onClick={() => actions.contribute(500)}>Contribute ৳500</button>
            </div>
            <small>The cooperative fund can buy unclaimed property for the Citizens; its rent returns to the fund. Contributions are voluntary.</small>
          </div>}
          <div className="fund-row"><span>Community cards drawn</span><strong>{game.cardDrawCounts.community}/16</strong></div>
          <div className="fund-row"><span>Chance cards drawn</span><strong>{game.cardDrawCounts.chance}/16</strong></div>
        </section>
      </aside>
    </section>
    {selectedSpace && <PropertyModal
      game={game}
      current={viewer}
      selectedSpace={selectedSpace}
      isCurrentPlayerTurn={isViewerTurn && !busy}
      citizenCanBuildSelected={viewerCanBuildSelected}
      onClose={() => setSelectedPropertyId(null)}
      onBuild={actions.build}
      onMortgage={actions.mortgage}
      onRedeem={actions.redeem}
      onSell={actions.sell}
    />}
    <footer className="site-footer"><span>FICTIONAL POLITICAL SATIRE · NOT A SIMULATION OF ANY SPECIFIC PERSON</span>{props.footerAction}</footer>
  </main>;
}
