import { BOARD } from "../game/board";
import type { GameState } from "../game/types";

type ActiveEvent = { id: number; message: string; kind: string };
type Player = GameState["players"][number];

type BoardViewProps = {
  game: GameState;
  current: Player;
  isFullscreen: boolean;
  showEventPopup: boolean;
  activeEvent: ActiveEvent | null;
  onSelectProperty: (spaceId: string) => void;
  onToggleFullscreen: () => void;
  onDismissEvent: () => void;
  localPlayerId?: string;
};

const money = (amount: number) => `৳${amount.toLocaleString("en-BD")}`;
const roleName = (role: Player["role"]) => role === "politician" ? "Politician" : "Citizen";
const isPurchasableSpace = (type: string) => ["property", "railroad", "utility"].includes(type);

/** Presentational board shared by local and server-authoritative game modes. */
export function BoardView({
  game,
  current,
  isFullscreen,
  showEventPopup,
  activeEvent,
  onSelectProperty,
  onToggleFullscreen,
  onDismissEvent,
  localPlayerId,
}: BoardViewProps) {
  return <div className="board-wrap">
    <div className="board-heading"><span>THE REPUBLIC OF OPPORTUNITY</span><span className="board-heading-actions"><span>40 SPACES</span><button className="fullscreen-button" onClick={onToggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{isFullscreen ? "EXIT FULLSCREEN ↙" : "FULLSCREEN ↗"}</button></span></div>
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
        return <div style={edge} className={`space space-${space.type} ${space.color ? `color-${space.color}` : ""} ${isPurchasableSpace(space.type) ? "space-clickable" : ""}`} key={space.id} role={isPurchasableSpace(space.type) ? "button" : undefined} tabIndex={isPurchasableSpace(space.type) ? 0 : undefined} aria-label={isPurchasableSpace(space.type) ? `View details for ${space.name}` : undefined} onClick={isPurchasableSpace(space.type) ? () => onSelectProperty(space.id) : undefined} onKeyDown={isPurchasableSpace(space.type) ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectProperty(space.id); } } : undefined}>
          <strong>{space.name}</strong>
          {space.price !== undefined && <span className="space-price">{money(space.price)}</span>}
          {game.cooperativePropertyIds.includes(space.id) && <small className="ownership-tag">OWN: CITIZENS CO-OP</small>}{game.properties[space.id]?.ownerId && <small className="ownership-tag">OWN: {game.players.find((player) => player.id === game.properties[space.id].ownerId)?.name ?? "Unknown"}</small>}{game.properties[space.id]?.mortgaged && <small className="ownership-tag">MORTGAGED</small>}{(game.properties[space.id]?.houses ?? 0) > 0 && <small className="ownership-tag">HOUSES: {game.properties[space.id].houses}</small>}{game.properties[space.id]?.hotel && <small className="ownership-tag">HOTEL · 6× RENT</small>}
          {game.properties[space.id]?.leaseholderId && <small className="ownership-tag">LEASE: {game.players.find((player) => player.id === game.properties[space.id].leaseholderId)?.role === "politician" ? "Leader" : game.players.find((player) => player.id === game.properties[space.id].leaseholderId)?.name ?? "Unknown"}</small>}
          {occupants.length > 0 && <div className="tokens">{occupants.map((player) => <span title={`${player.name} · ${roleName(player.role)}`} key={player.id} className={`token ${player.role} ${player.controller} player-color-${player.id}`}>{localPlayerId ? (player.id === localPlayerId ? "YOU" : player.role === "politician" ? "P" : player.name.slice(0,1)) : player.controller === "human" ? "YOU" : player.role === "politician" ? "P" : player.name.slice(0,1)}</span>)}</div>}
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
    {showEventPopup && activeEvent && <div className={`board-event-popup event-popup-${activeEvent.kind}`} role="status" aria-live="polite" key={activeEvent.id}>
      <span className="board-event-kicker">OFFICIAL RECORD · EVENT {String(activeEvent.id).padStart(3, "0")}</span>
      <p>{activeEvent.message}</p>
      <button type="button" aria-label="Dismiss event" onClick={onDismissEvent}>DISMISS ×</button>
    </div>}
  </div>;
}
