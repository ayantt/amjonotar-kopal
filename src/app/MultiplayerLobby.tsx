import { useCallback, useEffect, useMemo, useState } from "react";
import { BOARD } from "../game/board";
import { getLegalPropertyActions } from "../game/properties";
import type { GameState } from "../game/types";

type PublicSeat = { playerId: string; name: string; role: "politician" | "citizen"; joinedAt: string };
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
    if (!credentials) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 1600);
    return () => window.clearInterval(timer);
  }, [credentials, refresh]);

  const current = room?.state?.players[room.state.currentPlayerIndex];
  const isMyTurn = Boolean(current && credentials && current.id === credentials.playerId && room?.status === "active");
  const legalActions = useMemo(() => room?.state && current ? getLegalPropertyActions(room.state, current) : [], [room?.state, current]);
  const pendingName = room?.state?.pendingPropertyId ? BOARD.find((space) => space.id === room?.state?.pendingPropertyId)?.name : undefined;

  async function createRoom() {
    setWorking(true); setError("");
    try {
      const result = await request<{ room: Room; playerId: string; token: string }>("/api/multiplayer/rooms", { method: "POST", body: JSON.stringify({ name }) });
      const next = { code: result.room.code, playerId: result.playerId, token: result.token };
      saveCredentials(next); setRoom(result.room); setNotice("Room created. Share the code with three other players.");
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

  function disconnect() {
    saveCredentials(null); setRoom(null); setError(""); setNotice("Create a room or join friends with a room code.");
  }

  return <main className="app-shell multiplayer-shell">
    <header className="masthead"><span className="seal">আ</span><span>PiStack POLITICS CLUB</span><button className="secondary-action" onClick={onBack}>SINGLE PLAYER ↗</button></header>
    <section className="hero multiplayer-hero">
      <p className="eyebrow">ONLINE MODE · ROOM-CODE MULTIPLAYER</p>
      <h1>Play<br/><em>together.</em></h1>
      <p className="intro">Create a private room and invite three other players. Each player uses their own device; the server synchronizes turns and validates game actions.</p>
    </section>
    {!credentials ? <section className="multiplayer-panel">
      <label className="multiplayer-label">YOUR DISPLAY NAME<input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Enter a name" /></label>
      <div className="multiplayer-actions"><button className="primary-action" disabled={working || !name.trim()} onClick={() => void createRoom()}>{working ? "PLEASE WAIT…" : "CREATE A ROOM"}</button></div>
      <div className="multiplayer-join"><label className="multiplayer-label">ROOM CODE<input value={joinCode} maxLength={6} autoCapitalize="characters" onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ""))} placeholder="ABC234" /></label><button className="secondary-action" disabled={working || !name.trim() || joinCode.length !== 6} onClick={() => void joinRoom()}>JOIN ROOM ↗</button></div>
    </section> : room ? <section className="multiplayer-panel">
      <div className="multiplayer-room-heading"><div><span className="eyebrow">ROOM CODE</span><h2>{room.code}</h2></div><button className="secondary-action" onClick={() => void navigator.clipboard?.writeText(room.code)}>COPY CODE</button></div>
      <p className="multiplayer-notice">{notice}</p>
      <div className="multiplayer-seats">{Array.from({ length: 4 }, (_, index) => {
        const seat = room.seats[index];
        return <div className="multiplayer-seat" key={index}><span className="role-number">SEAT 0{index + 1} · {index === 0 ? "POLITICIAN" : "CITIZEN"}</span><strong>{seat?.name ?? "Waiting for player…"}</strong><small>{seat ? (seat.playerId === credentials.playerId ? "YOU" : seat.playerId === room.hostPlayerId ? "HOST" : "CONNECTED") : "OPEN SEAT"}</small></div>;
      })}</div>
      {room.status === "waiting" && <div className="multiplayer-actions">{credentials.playerId === room.hostPlayerId ? <button className="primary-action" disabled={working || room.seats.length !== 4} onClick={() => void hostStart()}>{room.seats.length === 4 ? "START GAME" : `WAITING FOR ${4 - room.seats.length} PLAYER(S)`}</button> : <p>Waiting for the host to start. Keep this page open.</p>}</div>}
      {room.state && <div className="multiplayer-game">
        <div className="multiplayer-room-heading"><div><span className="eyebrow">ROUND {room.state.round}</span><h2>{room.status === "finished" ? "GAME OVER" : current ? `${current.name}'s turn` : "Game in progress"}</h2></div><span className="multiplayer-version">STATE v{room.version}</span></div>
        {room.state.phase === "game-over" && <p className="multiplayer-result">{room.state.winner === "citizens" ? "The Citizens win together." : "The Politician wins."}</p>}
        <div className="multiplayer-scoreboard">{room.state.players.map((player) => <div className={player.id === current?.id ? "multiplayer-player is-current" : "multiplayer-player"} key={player.id}><strong>{player.name}</strong><span>{player.role.toUpperCase()}</span><b>{money(player.cash)}</b><small>SPACE {player.position + 1} · {player.bankrupt ? "BANKRUPT" : player.id === credentials.playerId ? "YOUR SEAT" : "CONNECTED"}</small></div>)}</div>
        {isMyTurn && room.state.phase === "awaiting-roll" && <button className="primary-action" disabled={working} onClick={() => void submitAction({ type: "roll" })}>ROLL DICE</button>}
        {isMyTurn && room.state.pendingPropertyId && <div className="multiplayer-actions"><p>Unclaimed property: <strong>{pendingName}</strong></p>{legalActions.map((action) => <button className="secondary-action" disabled={working} key={action.type} onClick={() => void submitAction({ type: "property", action: action.type })}>{action.type.toUpperCase()} {action.cost ? `· ${money(action.cost)}` : ""}</button>)}</div>}
        {isMyTurn && room.state.phase === "awaiting-end-turn" && !room.state.pendingPropertyId && <button className="primary-action" disabled={working} onClick={() => void submitAction({ type: "end-turn" })}>{room.state.extraRollAvailable ? "TAKE EXTRA ROLL" : "END TURN"}</button>}
        <div className="multiplayer-events"><h3>GAME EVENTS</h3>{room.state.events.slice(-8).reverse().map((event) => <p key={event.id}>{event.message}</p>)}</div>
      </div>}
      <div className="multiplayer-actions"><button className="secondary-action" onClick={disconnect}>LEAVE THIS DEVICE</button><button className="secondary-action" onClick={() => void refresh()}>REFRESH STATE ↻</button></div>
    </section> : null}
    {error && <p className="multiplayer-error" role="alert">{error}</p>}
    <footer className="site-footer"><span>ROOMS EXPIRE AFTER 12 HOURS</span><span>SERVER-VALIDATED TURNS</span></footer>
  </main>;
}
