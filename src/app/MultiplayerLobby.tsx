import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOARD } from "../game/board";
import { getLegalPropertyActions } from "../game/properties";
import { getBuildingCost, getMortgageTerms } from "../game/engine";
import { BoardView } from "./BoardView";
import { EventLog } from "./EventLog";
import { PropertyModal } from "./PropertyModal";
import type { GameState } from "../game/types";

type PublicSeat = { playerId: string; name: string; role: "politician" | "citizen" | null; joinedAt: string };
type Room = { code: string; status: "waiting" | "active" | "finished"; version: number; hostPlayerId: string; seats: PublicSeat[]; state: GameState | null; createdAt: string; expiresAt: string };
type Credentials = { code: string; playerId: string; token: string };
const storageKey = "amjonotar-kopal-multiplayer-seat";
const money = (value: number) => `৳${value.toLocaleString("en-BD")}`;
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Multiplayer request failed.");
  return data as T;
}
export function MultiplayerLobby({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [credentials, setCredentials] = useState<Credentials | null>(() => {
    try { const value = localStorage.getItem(storageKey); return value ? JSON.parse(value) as Credentials : null; } catch { return null; }
  });
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("Create a room or join friends with a room code.");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEventPopups, setShowEventPopups] = useState(true);
  const [activeEvent, setActiveEvent] = useState<GameState["events"][number] | null>(null);
  const lastSeenEventId = useRef<number | null>(null);

  const saveCredentials = useCallback((value: Credentials | null) => {
    setCredentials(value);
    if (value) localStorage.setItem(storageKey, JSON.stringify(value));
    else localStorage.removeItem(storageKey);
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!credentials) return;
    try {
      const data = await request<{ room: Room }>(`/api/multiplayer/rooms/${encodeURIComponent(credentials.code)}`);
      setRoom(data.room);
      setError("");
      if (data.room.status === "finished") setNotice("Game finished. The final result is shown below.");
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : "Could not load this room.");
    }
  }, [credentials]);

  useEffect(() => {
    if (!credentials || working) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 1600);
    return () => window.clearInterval(timer);
  }, [credentials, refresh, working]);

  useEffect(() => {
    const events = room?.state?.events ?? [];
    if (events.length === 0) return;
    const latest = events[events.length - 1];
    if (lastSeenEventId.current === null) {
      lastSeenEventId.current = latest.id;
      return;
    }
    if (latest.id <= lastSeenEventId.current) return;
    lastSeenEventId.current = latest.id;
    if (!showEventPopups) return;
    setActiveEvent(latest);
    const timer = window.setTimeout(() => setActiveEvent((active) => active?.id === latest.id ? null : active), 2600);
    return () => window.clearTimeout(timer);
  }, [room?.state?.events, showEventPopups]);

  const current = room?.state?.players[room.state.currentPlayerIndex];
  const isMyTurn = Boolean(current && credentials && current.id === credentials.playerId && room?.status === "active");
  const legalActions = useMemo(() => room?.state && current ? getLegalPropertyActions(room.state, current) : [], [room?.state, current]);
  const pendingSpace = room?.state?.pendingPropertyId ? BOARD.find((space) => space.id === room?.state?.pendingPropertyId) : undefined;
  const selectedSpace = selectedPropertyId ? BOARD.find((space) => space.id === selectedPropertyId) : undefined;
  const selectedProperty = selectedSpace && room?.state ? room.state.properties[selectedSpace.id] : undefined;
  const selectedColorGroup = selectedSpace?.color ? BOARD.filter((space) => space.type === "property" && space.color === selectedSpace.color) : [];
  const selectedDevelopmentLevel = selectedProperty?.hotel ? 4 : selectedProperty?.houses ?? 0;
  const citizenCanBuildSelected = Boolean(current && room?.state && (current.role === "politician" || (selectedColorGroup.length > 0 && selectedColorGroup.every((space) => {
    const property = room.state!.properties[space.id];
    const level = property?.hotel ? 4 : property?.houses ?? 0;
    return property?.ownerId === current.id && !property.mortgaged && !property.leaseholderId && !room.state!.cooperativePropertyIds.includes(space.id) && level >= selectedDevelopmentLevel;
  }))));

  async function createRoom() {
    setWorking(true); setError("");
    try {
      const result = await request<{ room: Room; playerId: string; token: string }>("/api/multiplayer/rooms", { method: "POST", body: JSON.stringify({ name }) });
      const next = { code: result.room.code, playerId: result.playerId, token: result.token };
      saveCredentials(next); setRoom(result.room); setNotice("Room created. Invite at least one and up to five other players.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create room."); }
    finally { setWorking(false); }
  }

  async function joinRoom() {
    setWorking(true); setError("");
    const code = joinCode.trim().toUpperCase();
    try {
      const result = await request<{ room: Room; playerId: string; token: string }>(`/api/multiplayer/rooms/${encodeURIComponent(code)}/join`, { method: "POST", body: JSON.stringify({ name }) });
      saveCredentials({ code: result.room.code, playerId: result.playerId, token: result.token });
      setRoom(result.room); setNotice("You joined the room. Wait for the host to start the game.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not join room."); }
    finally { setWorking(false); }
  }

  async function hostStart() {
    if (!room || !credentials) return;
    await perform(`/api/multiplayer/rooms/${room.code}/start`, { version: room.version });
  }

  async function perform(path: string, body: Record<string, unknown>) {
    if (!credentials) return;
    setWorking(true); setError("");
    try {
      const result = await request<{ room: Room }>(path, { method: "POST", headers: { Authorization: `Bearer ${credentials.token}` }, body: JSON.stringify(body) });
      setRoom(result.room); setNotice("Game state synchronized.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      await refresh(true);
    } finally { setWorking(false); }
  }

  async function submitAction(action: Record<string, unknown>) {
    if (!room) return;
    await perform(`/api/multiplayer/rooms/${room.code}/actions`, { version: room.version, action });
  }

  async function disconnect() {
    if (credentials && room?.status === "waiting") {
      try {
        await request(`/api/multiplayer/rooms/${encodeURIComponent(credentials.code)}/leave`, {
          method: "POST",
          headers: { Authorization: `Bearer ${credentials.token}` },
          body: JSON.stringify({ version: room.version }),
        });
      } catch {
        // Leaving this device should remain possible even if the room has already changed.
      }
    }
    saveCredentials(null); setRoom(null); setError(""); setNotice("Create a room or join friends with a room code.");
  }

  return <main className="app-shell multiplayer-shell">
    <header className="masthead"><span className="seal">আ</span><span>PiStack POLITICS CLUB</span><button className="secondary-action" onClick={onBack}>SINGLE PLAYER ↗</button></header>
    <section className="hero multiplayer-hero">
      <p className="eyebrow">ONLINE MODE · ROOM-CODE MULTIPLAYER</p>
      <h1>Play<br/><em>together.</em></h1>
      <p className="intro">Create a private room and invite 1–5 other players. The host can start with 2–6 players. At game start, one player is randomly selected as Politician; everyone else becomes a Citizen.</p>
    </section>
    {!credentials ? <section className="multiplayer-panel">
      <label className="multiplayer-label">YOUR DISPLAY NAME<input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Enter a name" /></label>
      <div className="multiplayer-actions"><button className="primary-action" disabled={working || !name.trim()} onClick={() => void createRoom()}>{working ? "PLEASE WAIT…" : "CREATE A ROOM"}</button></div>
      <div className="multiplayer-join"><label className="multiplayer-label">ROOM CODE<input value={joinCode} maxLength={6} autoCapitalize="characters" onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ""))} placeholder="ABC234" /></label><button className="secondary-action" disabled={working || !name.trim() || joinCode.length !== 6} onClick={() => void joinRoom()}>JOIN ROOM ↗</button></div>
    </section> : room ? <section className="multiplayer-panel">
      <div className="multiplayer-room-heading"><div><span className="eyebrow">ROOM CODE</span><h2>{room.code}</h2></div><button className="secondary-action" onClick={() => void navigator.clipboard?.writeText(room.code)}>COPY CODE</button></div>
      <p className="multiplayer-notice">{notice}</p>
      <div className="multiplayer-seats">{Array.from({ length: 6 }, (_, index) => {
        const seat = room.seats[index];
        return <div className="multiplayer-seat" key={index}><span className="role-number">SEAT 0{index + 1} · {room.status === "waiting" ? "ROLE DRAW AT START" : (seat?.role ?? "PLAYER").toUpperCase()}</span><strong>{seat?.name ?? "Waiting for player…"}</strong><small>{seat ? (seat.playerId === credentials.playerId ? "YOU" : seat.playerId === room.hostPlayerId ? "HOST" : "CONNECTED") : "OPEN SEAT"}</small></div>;
      })}</div>
      {room.status === "waiting" && <div className="multiplayer-actions">{credentials.playerId === room.hostPlayerId ? <button className="primary-action" disabled={working || room.seats.length < 2} onClick={() => void hostStart()}>{room.seats.length >= 2 ? "START GAME" : "WAITING FOR 1 MORE PLAYER"}</button> : <p>Waiting for the host to start with at least 2 players. Keep this page open.</p>}</div>}
      {room.state && current && <div className="multiplayer-game game-shell multiplayer-board-shell">
        <div className="game-header multiplayer-active-header">
          <div className="wordmark">আমজনতার কপাল<span>ONLINE REPUBLIC · ROOM {room.code}</span></div>
          <div className="turn-pill"><span className={isMyTurn ? "pulse-dot" : "pulse-dot ai-dot"} />{room.status === "finished" ? "GAME OVER" : isMyTurn ? "YOUR TURN" : `${current.name.toUpperCase()}'S TURN`} · ROUND {room.state.round}</div>
          <div className="header-actions"><button className="reset-button" onClick={() => void refresh()}>SYNC ↻</button></div>
        </div>
        {room.state.phase === "game-over" && <section className="game-over-panel"><strong>GAME OVER</strong><p>{[...room.state.events].reverse().find((event) => /wins|win\\b/i.test(event.message))?.message ?? (room.state.winner === "citizens" ? "The Citizens win together." : "The Politician wins.")}</p></section>}
        <section className="game-intro"><div><p className="eyebrow">THE PEOPLE PAY. THE POWERFUL PLAY.</p><h1>The board is <em>rigged.</em></h1></div><p>{working ? "Synchronizing with the room…" : isMyTurn ? "Your seat is active. Actions are validated by the game server." : `Waiting for ${current.name} to complete their turn.`}</p></section>
        <section className="game-layout">
          <EventLog events={room.state.events} popupsEnabled={showEventPopups} onTogglePopups={() => { setShowEventPopups((enabled) => !enabled); setActiveEvent(null); }} />
          <BoardView game={room.state} current={current} isFullscreen={isFullscreen} showEventPopup={showEventPopups} activeEvent={activeEvent} onSelectProperty={setSelectedPropertyId} onToggleFullscreen={async () => {
            try {
              if (document.fullscreenElement) await document.exitFullscreen();
              else await document.querySelector(".multiplayer-board-shell")?.requestFullscreen?.();
            } catch { setError("Fullscreen is not available in this browser."); }
          }} onDismissEvent={() => setActiveEvent(null)} />
          <aside className="sidebar">
            <section className="panel current-panel"><div className="panel-label">NOW PLAYING</div>
              <div className="current-player"><span className={`large-token ${current.role} player-color-${current.id}`}>{current.role === "politician" ? "P" : current.name.slice(0,1)}</span><div><h2>{current.name}</h2><p>{current.role === "politician" ? "Politician" : "Citizen"} · {current.id === credentials.playerId ? "Your seat" : "Online player"}</p></div></div>
              <div className="cash-line"><span>AVAILABLE CASH</span><strong>{money(current.cash)}</strong></div>
              {isMyTurn && room.state.phase === "awaiting-roll" && <button className="primary-action" disabled={working} onClick={() => void submitAction({ type: "roll" })}>ROLL {current.role === "politician" ? "TWO DICE" : "ONE DIE"} <span>↗</span></button>}
              {isMyTurn && room.state.pendingPropertyId && <div className="property-decision"><div className="panel-label">PROPERTY DECISION</div><strong>{pendingSpace?.name ?? room.state.pendingPropertyId}</strong><p>Choose what to do with this unclaimed space.</p>{legalActions.map((action) => <button className={action.type === "decline" ? "secondary-action" : "primary-action"} key={action.type} disabled={working} onClick={() => void submitAction({ type: "property", action: action.type })}>{action.label}<span>{action.type === "decline" ? "↷" : money(action.cost)}</span></button>)}{current.role === "citizen" && room.state.charterPendingRound === null && room.state.cooperativeFund >= (pendingSpace?.price ?? Infinity) && <button className="secondary-action" disabled={working} onClick={() => void submitAction({ type: "buy-cooperative-property" })}>BUY FOR CITIZENS' CO-OP <span>{money(pendingSpace?.price ?? 0)}</span></button>}</div>}
              {isMyTurn && room.state.phase === "awaiting-end-turn" && !room.state.pendingPropertyId && <button className="primary-action" disabled={working} onClick={() => void submitAction({ type: "end-turn" })}>{room.state.extraRollAvailable ? "TAKE EXTRA ROLL" : "END TURN →"}</button>}
              {!isMyTurn && room.state.phase !== "game-over" && <p className="ai-note">Waiting for the active player. This board updates automatically.</p>}
            </section>
            <section className="panel players-panel"><div className="panel-label">PLAYERS IN THIS ROOM</div>{room.state.players.map((player) => <div className={`player-row ${player.id === current.id ? "selected" : ""}`} key={player.id}><span className={`mini-token ${player.role} player-color-${player.id}`}>{player.role === "politician" ? "P" : player.name.slice(0,1)}</span><div className="player-row-name"><strong>{player.name}</strong><small>{player.role.toUpperCase()} · {player.id === credentials.playerId ? "YOU" : "ONLINE"}{player.bankrupt ? " · BANKRUPT" : ""}</small></div><strong className="player-cash">{money(player.cash)}</strong><small className="position-label">#{player.position}</small></div>)}</section>
            <section className="panel funds-panel"><div className="panel-label">THE COMMON POOL</div><div className="fund-row"><span>Public treasury</span><strong>{money(room.state.publicFund)}</strong></div><div className="fund-row"><span>Citizens' cooperative</span><strong>{money(room.state.cooperativeFund)}</strong></div>
              {isMyTurn && current.role === "citizen" && <div className="cooperative-actions"><div className="panel-label">ORGANIZE TOGETHER</div><div className="cooperative-buttons"><button className="secondary-action" disabled={working || current.cash < 100} onClick={() => void submitAction({ type: "contribute", amount: 100 })}>CONTRIBUTE ৳100</button><button className="secondary-action" disabled={working || current.cash < 500} onClick={() => void submitAction({ type: "contribute", amount: 500 })}>CONTRIBUTE ৳500</button></div><button className="primary-action" disabled={working || room.state.charterPendingRound !== null || room.state.charterActivated || room.state.charterVotes.includes(current.id) || room.state.cooperativeFund < 1000} onClick={() => void submitAction({ type: "vote-charter" })}>VOTE FOR PEOPLE'S CHARTER <span>{room.state.charterVotes.length}</span></button></div>}
              <div className="fund-row"><span>Community cards drawn</span><strong>{room.state.cardDrawCounts.community}/16</strong></div><div className="fund-row"><span>Chance cards drawn</span><strong>{room.state.cardDrawCounts.chance}/16</strong></div>
            </section>
          </aside>
        </section>
        {selectedSpace && <PropertyModal game={room.state} current={current} selectedSpace={selectedSpace} isCurrentPlayerTurn={isMyTurn} citizenCanBuildSelected={citizenCanBuildSelected} onClose={() => setSelectedPropertyId(null)} onBuild={(spaceId, building) => void submitAction({ type: "build", spaceId, building })} onMortgage={(spaceId) => void submitAction({ type: "mortgage", spaceId })} onRedeem={(spaceId) => void submitAction({ type: "redeem-mortgage", spaceId })} onSell={(spaceId) => void submitAction({ type: "sell-property", spaceId })} />}
      </div>}
      <div className="multiplayer-actions"><button className="secondary-action" onClick={disconnect}>LEAVE THIS DEVICE</button><button className="secondary-action" onClick={() => void refresh()}>REFRESH STATE ↻</button></div>
    </section> : null}
    {error && <p className="multiplayer-error" role="alert">{error}</p>}
    <footer className="site-footer"><span>ROOMS EXPIRE AFTER 12 HOURS</span><span>SERVER-VALIDATED TURNS</span></footer>
  </main>;
}
