import { useEffect, useMemo, useState } from "react";
import { BOARD } from "../game/board";
import { buildProperty, buyCooperativeProperty, contributeToCooperative, createNewGame, endTurn, getCurrentPlayer, isHumanTurn, mortgageProperty, redeemMortgage, resolvePropertyAction, rollAndMove, sellProperty, validateSetup } from "../game/engine";
import { runAiTurn } from "../game/turns";
import type { GameState, PlayerRole } from "../game/types";
import { GameScreen, type GameActions } from "./GameScreen";
import { MultiplayerLobby } from "./MultiplayerLobby";
import { playSound } from "./sound";
import { useEventFeed } from "./useEventFeed";

const roleName = (role: PlayerRole) => role === "politician" ? "Politician" : "Citizen";

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [gameNumber, setGameNumber] = useState(0);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastAction, setLastAction] = useState("Choose your role to start a new game.");
  const feed = useEventFeed(game?.events ?? [], soundEnabled, game ? `single-${gameNumber}` : null);

  useEffect(() => {
    if (!game || game.phase !== "awaiting-roll" || isHumanTurn(game) || feed.isPlaying) return;
    setBusy(true);
    const timer = window.setTimeout(() => {
      setGame((current) => {
        if (!current || current.phase !== "awaiting-roll" || isHumanTurn(current)) return current;
        try {
          const moved = runAiTurn(current);
          setLastAction(`${getCurrentPlayer(current).name} completed an AI turn.`);
          return moved;
        } catch (error) {
          // Never let an engine error unmount the whole app; surface it instead.
          setLastAction(`The computer's move could not be completed: ${error instanceof Error ? error.message : "unknown error"}`);
          return current;
        }
      });
      setBusy(false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [game, feed.isPlaying]);

  const victory = game?.phase === "game-over";
  useEffect(() => {
    if (victory) playSound("victory", soundEnabled);
    // Only the transition into game-over should chime, not later sound toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [victory]);

  function startGame(role: PlayerRole) {
    const next = createNewGame({ humanRole: role });
    if (!validateSetup(next)) throw new Error("Invalid four-player setup.");
    setGame(next);
    setGameNumber((n) => n + 1);
    playSound("start", soundEnabled);
    setBusy(false);
    setLastAction(`Game started. You are the ${roleName(role)}.`);
  }
  /** Runs an engine action against the current state; rejected actions are reported instead of crashing the UI. */
  function act(action: (state: GameState) => GameState, sound?: Parameters<typeof playSound>[0]) {
    if (!game) return;
    try {
      setGame(action(game));
      if (sound) playSound(sound, soundEnabled);
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "That action is not available right now.");
    }
  }
  function restart() {
    if (document.fullscreenElement) void document.exitFullscreen();
    setGame(null);
    setBusy(false);
    setLastAction("Choose your role to start a new game.");
  }

  const human = game?.players.find((player) => player.controller === "human");
  const actions: GameActions = useMemo(() => ({
    roll: () => {
      if (!game || !isHumanTurn(game) || game.phase !== "awaiting-roll") return;
      const player = getCurrentPlayer(game);
      try {
        const next = rollAndMove(game);
        setGame(next);
        playSound("roll", soundEnabled);
        setLastAction(`You rolled ${player.role === "politician" ? "two dice" : "one die"} and landed on ${BOARD[next.players[game.currentPlayerIndex].position].name}.`);
      } catch (error) {
        setLastAction(error instanceof Error ? error.message : "That action is not available right now.");
      }
    },
    endTurn: () => {
      if (!game || !isHumanTurn(game) || game.phase !== "awaiting-end-turn") return;
      act((state) => endTurn(state), "turn");
      setLastAction("Your turn ended. The computer opponents will play automatically.");
    },
    propertyAction: (action) => act((state) => resolvePropertyAction(state, action), action === "decline" ? "turn" : "money"),
    buyCooperative: () => act((state) => buyCooperativeProperty(state, getCurrentPlayer(state).id), "money"),
    contribute: (amount) => act((state) => contributeToCooperative(state, getCurrentPlayer(state).id, amount), "money"),
    build: (spaceId, building) => act((state) => buildProperty(state, getCurrentPlayer(state).id, spaceId, building)),
    mortgage: (spaceId) => act((state) => mortgageProperty(state, getCurrentPlayer(state).id, spaceId)),
    redeem: (spaceId) => act((state) => redeemMortgage(state, getCurrentPlayer(state).id, spaceId)),
    sell: (spaceId) => act((state) => sellProperty(state, getCurrentPlayer(state).id, spaceId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [game, soundEnabled]);

  if (!game && showMultiplayer) return <MultiplayerLobby onBack={() => setShowMultiplayer(false)} />;

  if (!game) return <main className="app-shell">
    <header className="masthead"><span className="seal">আ</span><span>PiFLUX POLITICS CLUB</span><span className="masthead-right">BOARD GAME NO. 01</span></header>
    <section className="hero">
      <p className="eyebrow">একটি রাজনৈতিক ব্যঙ্গাত্মক বোর্ড গেম</p>
      <h1>আমজনতার<br /><em>কপাল।</em></h1>
      <p className="lede">The people pay. The powerful play.</p>
      <p className="intro">A crooked little property game about big promises, public money, and who gets to make the rules. Choose your seat. Three computer opponents will take the others.</p>
      <div className="role-picks">
        <button className="role-card politician-card" onClick={() => startGame("politician")}><span className="role-number">01 / POWER</span><strong>Play as Politician</strong><span>Two dice. Special privileges. Keep the system on your side.</span><span className="button-copy">TAKE THE CHAIR ↗</span></button>
        <button className="role-card citizen-card" onClick={() => startGame("citizen")}><span className="role-number">02 / PEOPLE</span><strong>Play as Citizen</strong><span>One die. Three citizens. Your best chance is to work together.</span><span className="button-copy">JOIN THE PUBLIC ↗</span></button>
      </div>
      <button className="multiplayer-entry" onClick={() => setShowMultiplayer(true)}><span><strong>PLAY WITH FRIENDS</strong><small>Online multiplayer · room code · four human players</small></span><b>CREATE / JOIN ROOM ↗</b></button>
    </section>
    <footer className="site-footer"><span>FICTIONAL POLITICAL SATIRE</span><span>4 SEATS · SINGLE-PLAYER OR ONLINE</span></footer>
  </main>;

  const current = getCurrentPlayer(game);
  return <GameScreen
    game={game}
    viewerId={human?.id ?? current.id}
    online={false}
    wordmarkNote="BACK TO MENU"
    onWordmark={restart}
    turnLabel={current.controller === "human" ? "YOUR TURN" : "COMPUTER TURN"}
    statusMessage={busy ? "The computer is making its move…" : lastAction}
    canAct={isHumanTurn(game) && game.phase !== "game-over"}
    busy={busy}
    waitingNote={busy ? "Thinking through the next move…" : "Computer turn will begin shortly."}
    soundEnabled={soundEnabled}
    onToggleSound={() => setSoundEnabled((enabled) => !enabled)}
    feed={feed}
    actions={actions}
    headerActions={<button className="reset-button" onClick={restart}>Restart ↻</button>}
    gameOverAction={<button className="primary-action" onClick={restart}>Start a new game ↗</button>}
    footerAction={<button onClick={restart}>NEW GAME ↗</button>}
  />;
}
