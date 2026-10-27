import { useEffect, useMemo, useRef, useState } from "react";
import { BOARD } from "../game/board";
import { buildProperty, buyCooperativeProperty, contributeToCooperative, createNewGame, endTurn, getCurrentPlayer, isHumanTurn, mortgageProperty, redeemMortgage, resolvePropertyAction, rollAndMove, sellProperty, validateSetup } from "../game/engine";
import { runAiTurn } from "../game/turns";
import type { GameState, PlayerRole } from "../game/types";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { GameScreen, type GameActions } from "./GameScreen";
import { MultiplayerLobby } from "./MultiplayerLobby";
import { clearSavedGame, loadSavedGame, writeSavedGame } from "./saveStorage";
import { playSound } from "./sound";
import { newGameId, trackGameFinish, trackGameProgress, trackGameStart } from "./telemetry";
import { useEventFeed } from "./useEventFeed";

const roleName = (role: PlayerRole) => role === "politician" ? "Politician" : "Citizen";

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [gameNumber, setGameNumber] = useState(0);
  const gameId = useRef<string | null>(null);
  /** The resumable game found on this device (shown on the menu), if any. */
  const [saved, setSaved] = useState(loadSavedGame);
  const gameRef = useRef<GameState | null>(null);
  gameRef.current = game;
  useEffect(() => {
    const syncRoute = () => setShowAnalytics(window.location.hash === "#/analytics");
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(() => window.location.hash === "#/analytics");
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

  const round = game?.round ?? 0;
  const lastProgressRound = useRef(0);
  useEffect(() => {
    // Report progress every 5 rounds (not every action) so abandoned games show where players stopped.
    if (!gameId.current || round < 5 || round % 5 !== 0 || round <= lastProgressRound.current) return;
    lastProgressRound.current = round;
    trackGameProgress(gameId.current, round);
  }, [round]);

  // Autosave shortly after every change, and immediately when the page is hidden or closed. A finished game clears the save.
  useEffect(() => {
    if (!game) return;
    if (game.phase === "game-over") { clearSavedGame(); return; }
    const timer = window.setTimeout(() => writeSavedGame(game, gameId.current), 300);
    return () => window.clearTimeout(timer);
  }, [game]);
  useEffect(() => {
    const flush = () => { if (gameRef.current) writeSavedGame(gameRef.current, gameId.current); };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const victory = game?.phase === "game-over";
  useEffect(() => {
    if (victory && game && gameId.current) {
      trackGameFinish(gameId.current, game);
      gameId.current = null;
    }
    if (victory) playSound("victory", soundEnabled);
    // Only the transition into game-over should chime, not later sound toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [victory]);

  function startGame(role: PlayerRole) {
    const next = createNewGame({ humanRole: role });
    if (!validateSetup(next)) throw new Error("Invalid four-player setup.");
    setGame(next);
    setGameNumber((n) => n + 1);
    setSaved(null);
    gameId.current = newGameId();
    lastProgressRound.current = 0;
    trackGameStart(gameId.current, role);
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
  function leaveToMenu() {
    if (document.fullscreenElement) void document.exitFullscreen();
    // Flush first so the menu's "Resume" card reflects the very latest position.
    if (game) writeSavedGame(game, gameId.current);
    setGame(null);
    setSaved(loadSavedGame());
    setBusy(false);
    setLastAction("Choose your role to start a new game.");
  }
  /** Abandons the current game for good (Restart / New game). An unfinished game asks first, since it would be lost. */
  function restart() {
    if (game && game.phase !== "game-over" && !window.confirm("Discard this game and start over? Your saved progress will be lost.")) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    clearSavedGame();
    setSaved(null);
    setGame(null);
    setBusy(false);
    setLastAction("Choose your role to start a new game.");
  }
  function resumeGame() {
    if (!saved) return;
    setGame(saved.game);
    setGameNumber((n) => n + 1);
    gameId.current = saved.gameId;
    lastProgressRound.current = saved.game.round;
    setSaved(null);
    setBusy(false);
    setLastAction("Game resumed. Welcome back.");
    playSound("start", soundEnabled);
  }
  function discardSave() {
    clearSavedGame();
    setSaved(null);
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

  if (showAnalytics) return <AnalyticsDashboard onBack={() => { window.location.hash = ""; setShowAnalytics(false); }} />;
  if (!game && showMultiplayer) return <MultiplayerLobby onBack={() => setShowMultiplayer(false)} />;

  if (!game) return <main className="app-shell">
    <header className="masthead"><span className="seal">আ</span><span>PiFLUX POLITICS CLUB</span><span className="masthead-right">BOARD GAME NO. 01</span></header>
    <section className="hero">
      <p className="eyebrow">একটি রাজনৈতিক ব্যঙ্গাত্মক বোর্ড গেম</p>
      <h1>আমজনতার<br /><em>কপাল।</em></h1>
      <p className="lede">The people pay. The powerful play.</p>
      <p className="intro">A crooked little property game about big promises, public money, and who gets to make the rules. Choose your seat. Three computer opponents will take the others.</p>
      {saved && (() => {
        const you = saved.game.players.find((player) => player.controller === "human");
        const minutes = Math.max(0, Math.round((Date.now() - Date.parse(saved.savedAt)) / 60_000));
        const ago = minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} d ago`;
        return <div className="resume-card">
          <div><span className="role-number">SAVED GAME</span><strong>Resume your game</strong><span>{you ? `${roleName(you.role)} · ৳${you.cash.toLocaleString("en-BD")} · round ${saved.game.round}` : `Round ${saved.game.round}`} · saved {ago}</span></div>
          <div className="resume-actions"><button className="primary-action" onClick={resumeGame}>RESUME ↗</button><button className="secondary-action" onClick={discardSave}>DISCARD</button></div>
        </div>;
      })()}
      <div className="role-picks">
        <button className="role-card politician-card" onClick={() => startGame("politician")}><span className="role-number">01 / POWER</span><strong>Play as Politician</strong><span>Two dice. Special privileges. Keep the system on your side.</span><span className="button-copy">TAKE THE CHAIR ↗</span></button>
        <button className="role-card citizen-card" onClick={() => startGame("citizen")}><span className="role-number">02 / PEOPLE</span><strong>Play as Citizen</strong><span>One die. Three citizens. Your best chance is to work together.</span><span className="button-copy">JOIN THE PUBLIC ↗</span></button>
      </div>
      <button className="multiplayer-entry" onClick={() => setShowMultiplayer(true)}><span><strong>PLAY WITH FRIENDS</strong><small>Online multiplayer · room code · four human players</small></span><b>CREATE / JOIN ROOM ↗</b></button>
    </section>
    <footer className="site-footer"><span>FICTIONAL POLITICAL SATIRE</span><span>4 SEATS · SINGLE-PLAYER OR ONLINE</span><span className="privacy-note">ANONYMOUS GAME STATS ONLY · NO NAMES, NO TRACKING IDS · DO NOT TRACK HONOURED</span></footer>
  </main>;

  const current = getCurrentPlayer(game);
  return <GameScreen
    game={game}
    viewerId={human?.id ?? current.id}
    online={false}
    wordmarkNote="BACK TO MENU"
    onWordmark={leaveToMenu}
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
