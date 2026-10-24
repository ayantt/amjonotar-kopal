import { useEffect, useRef, useState } from "react";
import { BOARD } from "../game/board";
import { buildProperty, buyCooperativeProperty, contributeToCooperative, createNewGame, endTurn, getBuildingCost, getCurrentPlayer, getMortgageTerms, isHumanTurn, mortgageProperty, redeemMortgage, resolvePropertyAction, rollAndMove, sellProperty, validateSetup, voteForCharter } from "../game/engine";
import { runAiTurn } from "../game/turns";
import { getBaseRent, getLegalPropertyActions } from "../game/properties";
import type { GameState, PlayerRole } from "../game/types";


type SoundName = "start" | "roll" | "turn" | "money" | "event" | "victory";
let sharedAudioContext: AudioContext | null = null;

function playSound(name: SoundName, enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  try {
    const context = sharedAudioContext ?? (sharedAudioContext = new AudioContextClass());
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    const patterns: Record<SoundName, Array<{ frequency: number; duration: number; wave?: OscillatorType; delay?: number }>> = {
      start: [{ frequency: 440, duration: 0.09 }, { frequency: 587.33, duration: 0.13, delay: 0.08 }],
      roll: [{ frequency: 190, duration: 0.045, wave: "square" }, { frequency: 270, duration: 0.045, wave: "square", delay: 0.055 }, { frequency: 360, duration: 0.06, wave: "triangle", delay: 0.11 }],
      turn: [{ frequency: 330, duration: 0.07 }, { frequency: 247, duration: 0.1, delay: 0.07 }],
      money: [{ frequency: 660, duration: 0.07 }, { frequency: 880, duration: 0.11, delay: 0.065 }],
      event: [{ frequency: 520, duration: 0.08, wave: "triangle" }],
      victory: [{ frequency: 523.25, duration: 0.12 }, { frequency: 659.25, duration: 0.12, delay: 0.1 }, { frequency: 783.99, duration: 0.2, delay: 0.2 }],
    };
    patterns[name].forEach(({ frequency, duration, wave = "sine", delay = 0 }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = now + delay;
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.09, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.015);
    });
  } catch {
    // Audio restrictions must never interrupt gameplay.
  }
}

const money = (amount: number) => `৳${amount.toLocaleString("en-BD")}`;
const roleName = (role: PlayerRole) => role === "politician" ? "Politician" : "Citizen";
export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const victorySoundPlayed = useRef(false);
  const [lastAction, setLastAction] = useState("Choose your role to start a new game.");
  const [showConstitution, setShowConstitution] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEventPopups, setShowEventPopups] = useState(true);
  const [displayedEvents, setDisplayedEvents] = useState<GameState["events"]>([]);
  const [eventQueue, setEventQueue] = useState<Array<{ id: number; message: string; kind: string }>>([]);
  const [activeEvent, setActiveEvent] = useState<{ id: number; message: string; kind: string } | null>(null);
  const lastSeenEventId = useRef<number | null>(null);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (!game || game.phase !== "awaiting-roll" || isHumanTurn(game) || activeEvent || eventQueue.length > 0) return;
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
  }, [game, activeEvent, eventQueue.length]);

  useEffect(() => {
    if (!game) return;
    if (game.events.length === 0) {
      setDisplayedEvents([]);
      return;
    }
    const latestId = game.events[game.events.length - 1].id;
    if (lastSeenEventId.current === null) {
      lastSeenEventId.current = latestId;
      setDisplayedEvents(game.events);
      return;
    }
    const newEvents = game.events.filter((event) => event.id > (lastSeenEventId.current ?? 0));
    if (!showEventPopups) {
      lastSeenEventId.current = latestId;
      setDisplayedEvents(game.events);
      setEventQueue([]);
      setActiveEvent(null);
      return;
    }
    if (newEvents.length > 0) {
      lastSeenEventId.current = latestId;
      setEventQueue((queue) => [...queue, ...newEvents.map((event) => ({ id: event.id, message: event.message, kind: event.kind }))]);
    }
  }, [game, showEventPopups]);

  useEffect(() => {
    if (!showEventPopups || activeEvent || eventQueue.length === 0) return;
    setActiveEvent(eventQueue[0]);
    setEventQueue((queue) => queue.slice(1));
  }, [showEventPopups, activeEvent, eventQueue]);

  useEffect(() => {
    if (!activeEvent || !showEventPopups) return;
    playSound(activeEvent.kind === "money" ? "money" : activeEvent.kind === "ai" ? "event" : "turn", soundEnabled);
    setDisplayedEvents((events) => events.some((event) => event.id === activeEvent.id)
      ? events
      : [...events, activeEvent as GameState["events"][number]]);
    const timer = window.setTimeout(() => setActiveEvent(null), 2600);
    return () => window.clearTimeout(timer);
  }, [activeEvent, showEventPopups, soundEnabled]);

  useEffect(() => {
    if (game?.phase === "game-over" && !victorySoundPlayed.current) {
      victorySoundPlayed.current = true;
      playSound("victory", soundEnabled);
    }
    if (!game || game.phase !== "game-over") victorySoundPlayed.current = false;
  }, [game?.phase, soundEnabled]);


  function startGame(role: PlayerRole) {
    const next = createNewGame({ humanRole: role });
    if (!validateSetup(next)) throw new Error("Invalid four-player setup.");
    setGame(next);
    playSound("start", soundEnabled);
    victorySoundPlayed.current = false;
    lastSeenEventId.current = null;
    setDisplayedEvents([]);
    setEventQueue([]);
    setActiveEvent(null);
    setBusy(false);
    setLastAction(`Game started. You are the ${roleName(role)}.`);
  }
  function roll() {
    if (!game || !isHumanTurn(game) || game.phase !== "awaiting-roll") return;
    const next = rollAndMove(game);
    setGame(next);
    playSound("roll", soundEnabled);
    const player = getCurrentPlayer(game);
    const landed = BOARD[next.players[game.currentPlayerIndex].position];
    setLastAction(`You rolled ${player.role === "politician" ? "two dice" : "one die"} and landed on ${landed.name}.`);
  }
  function finishTurn() {
    if (!game || !isHumanTurn(game) || game.phase !== "awaiting-end-turn") return;
    setGame(endTurn(game));
    playSound("turn", soundEnabled);
    setLastAction("Your turn ended. The computer opponents will play automatically.");
  }
  async function toggleFullscreen() {
    const shell = document.querySelector(".game-shell") as HTMLElement | null;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell?.requestFullscreen) await shell.requestFullscreen();
    } catch {
      setLastAction("Fullscreen is not available in this browser.");
    }
  }
  function restart() {
    if (document.fullscreenElement) void document.exitFullscreen();
    setIsFullscreen(false);
    setGame(null);
    setBusy(false);
    setLastAction("Choose your role to start a new game.");
  }

  if (!game) return <main className="app-shell">
    <header className="masthead"><span className="seal">আ</span><span>PiStack POLITICS CLUB</span><span className="masthead-right">BOARD GAME NO. 01</span></header>
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
  const selectedSpace = selectedPropertyId ? BOARD.find((space) => space.id === selectedPropertyId) : undefined;
  const selectedProperty = selectedSpace ? game.properties[selectedSpace.id] : undefined;
  const selectedOwner = selectedProperty?.ownerId ? game.players.find((player) => player.id === selectedProperty.ownerId) : undefined;
  const selectedLeaseholder = selectedProperty?.leaseholderId ? game.players.find((player) => player.id === selectedProperty.leaseholderId) : undefined;
  const selectedColorGroup = selectedSpace?.color ? BOARD.filter((space) => space.type === "property" && space.color === selectedSpace.color) : [];
  const selectedDevelopmentLevel = selectedProperty?.hotel ? 4 : selectedProperty?.houses ?? 0;
  const citizenHasCompleteGroup = selectedColorGroup.length > 0 && selectedColorGroup.every((space) => {
    const property = game.properties[space.id];
    return property?.ownerId === current.id && !property.mortgaged && !property.leaseholderId && !game.cooperativePropertyIds.includes(space.id);
  });
  const citizenCanBuildSelected = current.role === "politician" || (citizenHasCompleteGroup && selectedColorGroup.every((space) => {
    const property = game.properties[space.id];
    const level = property?.hotel ? 4 : property?.houses ?? 0;
    return level >= selectedDevelopmentLevel;
  }));

  const isPurchasableSpace = (type: string) => ["property", "railroad", "utility"].includes(type);
  return <main className="game-shell">
    <header className="game-header">
      <button className="wordmark" onClick={restart} aria-label="Return to role selection">আমজনতার কপাল<span>BACK TO MENU ↗</span></button>
      <div className="turn-pill"><span className={current.controller === "human" ? "pulse-dot" : "pulse-dot ai-dot"} />{current.controller === "human" ? "YOUR TURN" : "COMPUTER TURN"} · ROUND {game.round}</div>
      <div className="header-actions"><button className={`sound-toggle ${soundEnabled ? "is-on" : ""}`} type="button" aria-pressed={soundEnabled} aria-label={soundEnabled ? "Mute sound effects" : "Enable sound effects"} onClick={() => setSoundEnabled((enabled) => !enabled)}>{soundEnabled ? "SOUND ON ♪" : "SOUND OFF ♫"}</button><button className="constitution-button" onClick={() => setShowConstitution(true)}>সংবিধান <span>RULE BOOK ↗</span></button><button className="reset-button" onClick={restart}>Restart ↻</button></div>
    </header>
    {showConstitution && <div className="constitution-backdrop" role="presentation" onClick={() => setShowConstitution(false)}>
      <section className="constitution-modal" role="dialog" aria-modal="true" aria-labelledby="constitution-title" onClick={(event) => event.stopPropagation()}>
        <header className="constitution-header"><div><p className="constitution-kicker">THE REPUBLIC OF OPPORTUNITY · FOUNDING INSTRUMENT</p><h2 id="constitution-title">সংবিধান</h2><p className="constitution-subtitle">The Constitution of the Board</p></div><button className="constitution-close" aria-label="Close rule book" onClick={() => setShowConstitution(false)}>CLOSE ×</button></header>
        <div className="constitution-body">

          <div className="constitution-preamble"><strong>প্রস্তাবনা · PREAMBLE</strong><p>We, the occupants of these four seats, establish these rules to govern the movement of money, land, privilege, and public power. The rules are binding upon every player; where privilege is expressly granted, equality shall not be presumed.</p><p lang="bn">আমরা, এই চার আসনের অধিবাসীরা, অর্থ, জমি, বিশেষ সুবিধা ও জনক্ষমতার চলাচল নিয়ন্ত্রণের জন্য এই বিধান প্রতিষ্ঠা করছি। এই নিয়ম প্রত্যেক খেলোয়াড়ের জন্য বাধ্যতামূলক; যেখানে বিশেষ সুবিধা স্পষ্টভাবে দেওয়া হয়েছে, সেখানে সমতা আছে বলে ধরে নেওয়া যাবে না।</p></div>
          <article><span className="article-number">ARTICLE I</span><h3>Of the Republic and its Seats</h3><p className="constitution-heading-bangla" lang="bn">প্রজাতন্ত্র ও আসনসমূহ</p><p><b>Section 1.</b> The Republic shall consist of four players: one Politician and three Citizens. One seat shall be controlled by the human player; the remaining seats shall be controlled by the computer.</p><p className="constitution-bangla" lang="bn">এই প্রজাতন্ত্রে মোট চারজন খেলোয়াড় থাকবে: একজন রাজনীতিবিদ এবং তিনজন নাগরিক। একজন আসন মানব খেলোয়াড় নিয়ন্ত্রণ করবেন; বাকি আসনগুলো কম্পিউটার নিয়ন্ত্রণ করবে।</p><p><b>Section 2.</b> The human player may choose either office. The composition of the Republic shall remain one Politician and three Citizens at all times.</p><p className="constitution-bangla" lang="bn">মানব খেলোয়াড় রাজনীতিবিদ অথবা নাগরিক—যেকোনো একটি ভূমিকা বেছে নিতে পারবেন। প্রজাতন্ত্রে একজন রাজনীতিবিদ ও তিনজন নাগরিকের বিন্যাস অপরিবর্তিত থাকবে।</p></article>
          <article><span className="article-number">ARTICLE II</span><h3>Of Turns and Passage</h3><p className="constitution-heading-bangla" lang="bn">চাল ও অতিক্রম</p><p><b>Section 1.</b> The Politician shall cast two dice. Each Citizen shall cast one die. A player shall move according to the result and submit to the law of the space upon which they arrive.</p><p className="constitution-bangla" lang="bn">রাজনীতিবিদ দুটি পাশা ফেলবেন। প্রত্যেক নাগরিক একটি পাশা ফেলবেন। ফল অনুযায়ী ঘুঁটি সরবে এবং যে ঘরে পৌঁছাবে, সেই ঘরের নিয়ম মানতে হবে।</p><p><b>Section 2.</b> Upon passing the starting space, the Politician shall receive ৳400 and each Citizen ৳200. A player landing exactly upon the starting space shall receive an additional ৳200 if Politician, or ৳100 if Citizen.</p><p className="constitution-bangla" lang="bn">শুরুর ঘর অতিক্রম করলে রাজনীতিবিদ ৳৪০০ এবং প্রত্যেক নাগরিক ৳২০০ পাবেন। শুরুর ঘরে ঠিক এসে থামলে রাজনীতিবিদ অতিরিক্ত ৳২০০ এবং নাগরিক অতিরিক্ত ৳১০০ পাবেন।</p><p><b>Section 3.</b> A Politician rolling doubles may receive an additional roll, subject to the engine's limit. A movement expressly ordered by a card shall be governed by that card.</p><p className="constitution-bangla" lang="bn">রাজনীতিবিদ জোড়া সংখ্যা পেলে, গেম ইঞ্জিনের সীমা সাপেক্ষে, আবার পাশা ফেলার সুযোগ পেতে পারেন। কার্ডের নির্দেশে চলাচল করলে সেই কার্ডের নিয়ম প্রযোজ্য হবে।</p></article>
          <article><span className="article-number">ARTICLE III</span><h3>Of Property, Title, and Lease</h3><p className="constitution-heading-bangla" lang="bn">সম্পত্তি, মালিকানা ও ইজারা</p><p><b>Section 1.</b> An eligible player landing on unclaimed property may purchase it at its listed price, lease it where permitted, or decline. No auction shall be held under the present rules.</p><p className="constitution-bangla" lang="bn">যোগ্য খেলোয়াড় কোনো দাবিহীন সম্পত্তিতে এসে নির্ধারিত দামে কিনতে, অনুমোদিত হলে ইজারা নিতে, অথবা প্রত্যাখ্যান করতে পারবেন। বর্তমান নিয়মে নিলাম হবে না।</p><p><b>Section 2.</b> A Citizen may lease for half the listed price, rounded down, and collect the applicable base rent. Such lease shall expire after five passages across the starting space. A Politician may lease for half price, collect half base land rent, and retain the lease indefinitely.</p><p className="constitution-bangla" lang="bn">নাগরিক নির্ধারিত দামের অর্ধেক (ভগ্নাংশ বাদ দিয়ে) দিয়ে ইজারা নিতে এবং প্রযোজ্য মূল ভাড়া পেতে পারেন। শুরুর ঘর পাঁচবার অতিক্রম করার পর ইজারার মেয়াদ শেষ হবে। রাজনীতিবিদ অর্ধেক দামে ইজারা নিয়ে জমির মূল ভাড়ার অর্ধেক পাবেন এবং ইজারা অনির্দিষ্টকাল রাখতে পারবেন।</p><p><b>Section 3.</b> Rent shall be determined by the property type, the parties' roles, and any specific rule applicable to that space. A leaseholder entitled to rent shall receive it in place of the owner; duplicate collection is prohibited.</p><p className="constitution-bangla" lang="bn">ভাড়া নির্ধারিত হবে সম্পত্তির ধরন, সংশ্লিষ্ট খেলোয়াড়দের ভূমিকা এবং ওই ঘরের বিশেষ নিয়ম অনুযায়ী। ভাড়া পাওয়ার অধিকারী ইজারাদার মালিকের পরিবর্তে ভাড়া পাবেন; একই ভাড়া দুবার আদায় করা যাবে না।</p><p><b>Section 4.</b> Property held by the Citizens' Cooperative shall be recorded separately. Rent from such property shall be paid into the cooperative fund.</p><p className="constitution-bangla" lang="bn">নাগরিক সমবায়ের সম্পত্তি আলাদাভাবে নথিভুক্ত হবে। সেই সম্পত্তির ভাড়া সমবায় তহবিলে জমা হবে।</p><p><b>Section 5.</b> During their own turn, a Citizen may sell individually owned, unleased property to the Politician for its listed price, provided the Politician has sufficient cash. The seller receives 90% of that price; the remaining 10% is sales tax paid to the public treasury. The Politician may sell individually owned, unleased property only back to the government at its listed price, without sales tax; the property returns to the unowned market. Government buy-backs may create a treasury deficit.</p><p className="constitution-bangla" lang="bn">নিজের চাল চলাকালে নাগরিক ব্যক্তিগত মালিকানাধীন, ইজারামুক্ত সম্পত্তি তালিকাভুক্ত দামে রাজনীতিবিদের কাছে বিক্রি করতে পারেন, যদি রাজনীতিবিদের যথেষ্ট নগদ অর্থ থাকে। বিক্রেতা মূল্যের ৯০% পাবেন; বাকি ১০% বিক্রয়কর হিসেবে সরকারি কোষাগারে জমা হবে। রাজনীতিবিদ ব্যক্তিগত মালিকানাধীন, ইজারামুক্ত সম্পত্তি কেবল তালিকাভুক্ত দামে সরকারের কাছে বিক্রি করতে পারবেন এবং কোনো বিক্রয়কর দেবেন না; সম্পত্তিটি পুনরায় দাবিহীন হবে। সরকারি পুনঃক্রয়ে কোষাগারে ঘাটতি হতে পারে।</p></article>
          <article><span className="article-number">ARTICLE IV</span><h3>Of Revenue and Public Funds</h3><p className="constitution-heading-bangla" lang="bn">রাজস্ব ও সরকারি তহবিল</p><p><b>Section 1.</b> The public treasury and the Citizens' Cooperative fund are distinct accounts. No transfer between them shall be presumed.</p><p className="constitution-bangla" lang="bn">সরকারি কোষাগার ও নাগরিক সমবায় তহবিল পৃথক হিসাব। স্পষ্ট নিয়ম ছাড়া এক তহবিল থেকে অন্য তহবিলে অর্থ স্থানান্তর হবে না।</p><p><b>Section 2.</b> Taxes and penalties shall be assessed according to the space and the player's role. Under current law, Income Tax is ৳100 for a Citizen and ৳50 for the Politician; the Development Levy is ৳100 for a Citizen, while the Politician is exempt.</p><p className="constitution-bangla" lang="bn">ঘর ও খেলোয়াড়ের ভূমিকা অনুযায়ী কর ও জরিমানা ধার্য হবে। বর্তমান নিয়মে আয়কর নাগরিকের জন্য ৳১০০ এবং রাজনীতিবিদের জন্য ৳৫০; উন্নয়ন কর নাগরিকের জন্য ৳১০০, আর রাজনীতিবিদ তা থেকে অব্যাহতি পাবেন।</p><p><b>Section 3.</b> When the Politician lands on Public Plaza, the Politician may withdraw the available public treasury. Other players acquire no such entitlement by landing there.</p><p className="constitution-bangla" lang="bn">রাজনীতিবিদ পাবলিক প্লাজায় এলে সরকারি কোষাগারে থাকা অর্থ তুলতে পারবেন। অন্য খেলোয়াড় সেখানে এলেই এমন অধিকার পাবেন না।</p><p><b>Section 4.</b> The Politician's privileges are intentional features of this satirical Republic; they shall not be construed as a declaration of fairness.</p><p className="constitution-bangla" lang="bn">রাজনীতিবিদের বিশেষ সুবিধাগুলো এই ব্যঙ্গাত্মক প্রজাতন্ত্রের ইচ্ছাকৃত বৈশিষ্ট্য; এগুলোকে ন্যায্যতার ঘোষণা হিসেবে ব্যাখ্যা করা যাবে না।</p></article>
          <article><span className="article-number">ARTICLE V</span><h3>Of Cards, Debt, and Insolvency</h3><p className="constitution-heading-bangla" lang="bn">কার্ড, ঋণ ও দেউলিয়াত্ব</p><p><b>Section 1.</b> A Chance or Community Chest card shall be resolved according to its stated effect, including any role-specific provision. The current decks follow a fixed order and are not shuffled.</p><p className="constitution-bangla" lang="bn">চান্স বা কমিউনিটি চেস্ট কার্ডে লেখা নির্দেশ, ভূমিকা-নির্দিষ্ট নিয়মসহ, কার্যকর হবে। বর্তমান ডেকের কার্ডগুলো নির্দিষ্ট ক্রমে আসে; এলোমেলো করা হয় না।</p><p><b>Section 2.</b> A debt shall first be paid from available cash. If cash is insufficient, eligible unmortgaged property may be mortgaged automatically under the owner's role-specific loan terms. Cash shall not fall below zero.</p><p className="constitution-bangla" lang="bn">প্রথমে হাতে থাকা নগদ অর্থ থেকে ঋণ পরিশোধ হবে। অর্থ অপর্যাপ্ত হলে, মালিকের ভূমিকা অনুযায়ী যোগ্য ও বন্ধকমুক্ত সম্পত্তি স্বয়ংক্রিয়ভাবে বন্ধক রাখা যেতে পারে। নগদ অর্থ কখনো শূন্যের নিচে নামবে না।</p>
<p><b>Section 3.</b> A Citizen receives half the listed price less a 5% processing fee on the loan principal and must repay 110% of the loan principal (the half-price advance plus 10% interest) to clear the mortgage. The Politician receives the full listed price without a fee and must repay the principal plus 8% interest (108% of the loan amount) to clear it. Mortgaged property earns no rent until cleared.</p><p className="constitution-bangla" lang="bn">নাগরিক তালিকাভুক্ত মূল্যের অর্ধেক ঋণ পাবেন; ঋণের মূল অঙ্কের ৫% প্রক্রিয়াকরণ ফি কাটা হবে। বন্ধক ছাড়াতে ঋণের মূল অঙ্কের ১১০% (মূল ঋণ ও ১০% সুদ) ফেরত দিতে হবে। রাজনীতিবিদ কোনো ফি ছাড়া সম্পূর্ণ তালিকাভুক্ত মূল্য পাবেন এবং বন্ধক ছাড়াতে ১০৮% ফেরত দেবেন। বন্ধক থাকা সম্পত্তি বন্ধক ছাড়ানো পর্যন্ত ভাড়া আয় করবে না।</p><p><b>Section 4.</b> If the debt remains unpaid, the debtor shall be declared bankrupt. A bankrupt Citizen's assets shall pass to the Politician under the current rule. The Politician's bankruptcy shall confer victory upon the Citizens.</p><p className="constitution-bangla" lang="bn">ঋণ তবুও পরিশোধ করা না গেলে ঋণগ্রহীতাকে দেউলিয়া ঘোষণা করা হবে। দেউলিয়া নাগরিকের সম্পদ বর্তমান নিয়ম অনুযায়ী রাজনীতিবিদের কাছে যাবে। রাজনীতিবিদ দেউলিয়া হলে নাগরিকেরা জয়ী হবেন।</p><p><b>Section 4.</b> The bankruptcy of two Citizens shall confer victory upon the Politician.</p><p className="constitution-bangla" lang="bn">দুইজন নাগরিক দেউলিয়া হলে রাজনীতিবিদ জয়ী হবেন।</p></article>
          <article><span className="article-number">ARTICLE VI</span><h3>Of Mutual Aid and the People's Charter</h3><p className="constitution-heading-bangla" lang="bn">পারস্পরিক সহায়তা ও জনগণের সনদ</p><p><b>Section 1.</b> A Citizen may contribute ৳100 or ৳500 to the cooperative fund. Such fund is separate from personal cash and the public treasury.</p><p className="constitution-bangla" lang="bn">একজন নাগরিক সমবায় তহবিলে ৳১০০ বা ৳৫০০ দিতে পারেন। এই তহবিল ব্যক্তিগত নগদ অর্থ ও সরকারি কোষাগার থেকে পৃথক।</p><p><b>Section 2.</b> An unclaimed property may be acquired by the Citizens' Cooperative when the fund can meet its listed price. Cooperative property shall count once toward collective control.</p><p className="constitution-bangla" lang="bn">তহবিলে নির্ধারিত ক্রয়মূল্য দেওয়ার মতো অর্থ থাকলে নাগরিক সমবায় দাবিহীন সম্পত্তি কিনতে পারে। সমবায়ের সম্পত্তি সম্মিলিত নিয়ন্ত্রণের হিসাবে একবারই গণনা হবে।</p><p><b>Section 3.</b> A majority of Citizens may approve the People's Charter when the cooperative fund contains at least ৳1,000. The Charter shall remain pending until the next Citizen round, and its conditions must be preserved until activation.</p><p className="constitution-bangla" lang="bn">সমবায় তহবিলে অন্তত ৳১,০০০ থাকলে নাগরিকদের সংখ্যাগরিষ্ঠ ভোটে জনগণের সনদ অনুমোদন করা যায়। পরবর্তী নাগরিক পর্ব পর্যন্ত সনদটি অপেক্ষমাণ থাকবে; এ সময় শর্তগুলো বজায় রাখতে হবে।</p><p><b>Section 4.</b> The Citizens shall prevail jointly only when all three remain active, collectively control at least eight properties, hold combined personal cash of at least ৳3,000, maintain at least ৳1,000 in the cooperative fund, and the Charter is activated.</p><p className="constitution-bangla" lang="bn">তিনজন নাগরিকই সক্রিয় থাকলে, সম্মিলিতভাবে অন্তত আটটি সম্পত্তি নিয়ন্ত্রণ করলে, ব্যক্তিগত নগদ মিলিয়ে অন্তত ৳৩,০০০ থাকলে, সমবায় তহবিলে অন্তত ৳১,০০০ বজায় থাকলে এবং সনদ কার্যকর হলে নাগরিকেরা যৌথভাবে জয়ী হবেন।</p></article>
          <article><span className="article-number">ARTICLE VII</span><h3>Of Victory and Final Authority</h3><p className="constitution-heading-bangla" lang="bn">জয় ও চূড়ান্ত কর্তৃত্ব</p><p><b>Section 1.</b> The Politician shall prevail upon controlling at least seven properties, attaining at least ৳8,000 in personal cash and the listed purchase value of individually owned property, or causing two Citizens to become bankrupt.</p><p className="constitution-bangla" lang="bn">রাজনীতিবিদ অন্তত সাতটি সম্পত্তি নিয়ন্ত্রণ করলে, ব্যক্তিগত নগদ ও নিজস্ব সম্পত্তির তালিকাভুক্ত ক্রয়মূল্য মিলিয়ে অন্তত ৳৮,০০০ সম্পদ অর্জন করলে, অথবা দুই নাগরিককে দেউলিয়া করলে জয়ী হবেন।</p><p><b>Section 2.</b> For the provisional wealth test, leases and liabilities shall not be included. Cooperative property is not individually owned by the Politician.</p><p className="constitution-bangla" lang="bn">অস্থায়ী সম্পদ-হিসাবে ইজারা ও দায় অন্তর্ভুক্ত হবে না। সমবায়ের সম্পত্তি রাজনীতিবিদের ব্যক্তিগত মালিকানাধীন বলে গণ্য হবে না।</p><p><b>Section 3.</b> Victory shall be checked after actions and at the relevant round boundary. Where both sides' victory conditions arise in the same atomic action, Politician victory takes precedence under the provisional rules.</p><p className="constitution-bangla" lang="bn">প্রতিটি পদক্ষেপের পরে এবং প্রাসঙ্গিক পর্বসীমায় জয়ের শর্ত পরীক্ষা করা হবে। একই পদক্ষেপে উভয় পক্ষের জয়ের শর্ত পূরণ হলে, অস্থায়ী নিয়ম অনুযায়ী রাজনীতিবিদের জয় অগ্রাধিকার পাবে।</p></article>
          <article><span className="article-number">ARTICLE VIII</span><h3>Of Interpretation and Amendments</h3><p className="constitution-heading-bangla" lang="bn">ব্যাখ্যা ও সংশোধন</p><p><b>Section 1.</b> The rules currently implemented by the game engine shall govern play. Where a provision describes a future or deferred mechanic, it shall not be treated as available until implemented.</p><p className="constitution-bangla" lang="bn">বর্তমানে গেম ইঞ্জিনে কার্যকর নিয়মই খেলা পরিচালনা করবে। কোনো ধারা ভবিষ্যৎ বা স্থগিত ব্যবস্থার বর্ণনা দিলে, তা বাস্তবায়িত না হওয়া পর্যন্ত ব্যবহারযোগ্য বলে গণ্য হবে না।</p><p><b>Section 2.</b> This Constitution is a work of fictional political satire. It describes the laws of this game and makes no allegation concerning any specific person.</p><p className="constitution-bangla" lang="bn">এই সংবিধান কাল্পনিক রাজনৈতিক ব্যঙ্গের অংশ। এটি শুধু এই গেমের নিয়ম বর্ণনা করে; কোনো নির্দিষ্ট ব্যক্তির বিরুদ্ধে অভিযোগ নয়।</p></article>
        </div>
        <footer className="constitution-footer"><span>ENACTED FOR PLAY · SUBJECT TO GAME ENGINE</span><button className="primary-action" onClick={() => setShowConstitution(false)}>I HAVE READ THE CONSTITUTION <span>×</span></button></footer>
      </section>
    </div>}
    <section className="game-intro"><div><p className="eyebrow">THE PEOPLE PAY. THE POWERFUL PLAY.</p><h1>The board is <em>rigged.</em></h1></div><p>{busy ? "The computer is making its move…" : lastAction}</p></section>
    {game.phase === "game-over" && <section className="game-over-panel"><strong>GAME OVER</strong><p>{[...game.events].reverse().find((event) => /wins|win\b/i.test(event.message))?.message ?? (game.winner === "politician" ? "The Politician wins." : game.winner === "citizens" ? "The Citizens win together." : "The game has ended.")}</p><button className="primary-action" onClick={restart}>Start a new game ↗</button></section>}
    <section className="game-layout">
    <section className="panel log-panel"><div className="panel-label"><span className="record-title">THE OFFICIAL RECORD <small>RECENT EVENTS</small></span><button className={`event-popup-toggle ${showEventPopups ? "is-on" : ""}`} type="button" aria-pressed={showEventPopups} onClick={() => {
      const next = !showEventPopups;
      setShowEventPopups(next);
      if (!next) {
        setDisplayedEvents(game.events);
        setEventQueue([]);
        setActiveEvent(null);
      }
    }}>POPUPS {showEventPopups ? "ON" : "OFF"}</button></div><div className="event-list">{[...displayedEvents].reverse().map((event) => <div className={`event event-${event.kind}`} key={event.id}><span>{String(event.id).padStart(3,"0")}</span><p>{event.message}</p></div>)}</div></section>
      <div className="board-wrap">
        <div className="board-heading"><span>THE REPUBLIC OF OPPORTUNITY</span><span className="board-heading-actions"><span>40 SPACES</span><button className="fullscreen-button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{isFullscreen ? "EXIT FULLSCREEN ↙" : "FULLSCREEN ↗"}</button></span></div>
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
            return <div style={edge} className={`space space-${space.type} ${space.color ? `color-${space.color}` : ""} ${isPurchasableSpace(space.type) ? "space-clickable" : ""}`} key={space.id} role={isPurchasableSpace(space.type) ? "button" : undefined} tabIndex={isPurchasableSpace(space.type) ? 0 : undefined} aria-label={isPurchasableSpace(space.type) ? `View details for ${space.name}` : undefined} onClick={isPurchasableSpace(space.type) ? () => setSelectedPropertyId(space.id) : undefined} onKeyDown={isPurchasableSpace(space.type) ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedPropertyId(space.id); } } : undefined}>
              <strong>{space.name}</strong>
              {space.price !== undefined && <span className="space-price">{money(space.price)}</span>}
              {game.cooperativePropertyIds.includes(space.id) && <small className="ownership-tag">OWN: CITIZENS CO-OP</small>}{game.properties[space.id]?.ownerId && <small className="ownership-tag">OWN: {game.players.find((player) => player.id === game.properties[space.id].ownerId)?.name ?? "Unknown"}</small>}{(game.properties[space.id]?.houses ?? 0) > 0 && <small className="ownership-tag">HOUSES: {game.properties[space.id].houses}</small>}{game.properties[space.id]?.hotel && <small className="ownership-tag">HOTEL · 6× RENT</small>}
              {game.properties[space.id]?.leaseholderId && <small className="ownership-tag">LEASE: {game.players.find((player) => player.id === game.properties[space.id].leaseholderId)?.role === "politician" ? "Leader" : game.players.find((player) => player.id === game.properties[space.id].leaseholderId)?.name ?? "Unknown"}</small>}
              {occupants.length > 0 && <div className="tokens">{occupants.map((player) => <span title={`${player.name} · ${roleName(player.role)}`} key={player.id} className={`token ${player.role} ${player.controller} player-color-${player.id}`}>{player.controller === "human" ? "YOU" : player.role === "politician" ? "P" : player.name.slice(0,1)}</span>)}</div>}
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
        {showEventPopups && activeEvent && <div className={`board-event-popup event-popup-${activeEvent.kind}`} role="status" aria-live="polite" key={activeEvent.id}>
          <span className="board-event-kicker">OFFICIAL RECORD · EVENT {String(activeEvent.id).padStart(3, "0")}</span>
          <p>{activeEvent.message}</p>
          <button type="button" aria-label="Dismiss event" onClick={() => setActiveEvent(null)}>DISMISS ×</button>
        </div>}
      </div>
      <aside className="sidebar">
        <section className="panel current-panel"><div className="panel-label">NOW PLAYING</div><div className="current-player"><span className={`large-token ${current.role} player-color-${current.id}`}>{current.controller === "human" ? "YOU" : current.role === "politician" ? "P" : current.name.slice(0,1)}</span><div><h2>{current.name}</h2><p>{roleName(current.role)} · {current.controller === "human" ? "Human player" : "Computer opponent"}</p></div></div><div className="cash-line"><span>AVAILABLE CASH</span><strong>{money(current.cash)}</strong></div>
          {current.controller === "human" && game.pendingPropertyId && <div className="property-decision"><div className="panel-label">PROPERTY DECISION</div><strong>{BOARD.find((space) => space.id === game.pendingPropertyId)?.name}</strong><p>Choose what to do with this unclaimed space.</p>{propertyActions.map((action) => <button className={action.type === "decline" ? "secondary-action" : "primary-action"} key={action.type} onClick={() => { setGame((state) => state ? resolvePropertyAction(state, action.type) : state); playSound(action.type === "decline" ? "turn" : "money", soundEnabled); }}>{action.label}<span>{action.type === "decline" ? "↷" : money(action.cost)}</span></button>)}{current.role === "citizen" && game.charterPendingRound === null && game.cooperativeFund >= (BOARD.find((space) => space.id === game.pendingPropertyId)?.price ?? Infinity) && <button className="secondary-action" onClick={() => { setGame((state) => state ? buyCooperativeProperty(state, current.id) : state); playSound("money", soundEnabled); }}>Buy for Citizens co-op <span>{money(BOARD.find((space) => space.id === game.pendingPropertyId)?.price ?? 0)}</span></button>}</div>}
          {current.controller === "human" ? <div className="actions"><button className="primary-action" onClick={roll} disabled={busy || game.phase !== "awaiting-roll"}>Roll {current.role === "politician" ? "two dice" : "one die"} <span>↗</span></button><button className="secondary-action" onClick={finishTurn} disabled={busy || game.phase !== "awaiting-end-turn" || Boolean(game.pendingPropertyId)}>End turn →</button></div> : <p className="ai-note">{busy ? "Thinking through the next move…" : "Computer turn will begin shortly."}</p>}
        </section>
        <section className="panel players-panel"><div className="panel-label">THE FOUR SEATS</div>{game.players.map((player) => <div className={`player-row ${player.id === current.id ? "selected" : ""}`} key={player.id}><span className={`mini-token ${player.role} player-color-${player.id}`}>{player.controller === "human" ? "Y" : player.role === "politician" ? "P" : player.name.slice(0,1)}</span><div className="player-row-name"><strong>{player.name}</strong><small>{roleName(player.role)} · {player.controller === "human" ? "You" : "AI"}{player.bankrupt ? " · BANKRUPT" : ""}</small></div><strong className="player-cash">{money(player.cash)}</strong><small className="position-label">#{player.position}</small></div>)}</section>
        <section className="panel funds-panel"><div className="panel-label">THE COMMON POOL</div><div className="fund-row"><span>Public treasury</span><strong>{money(game.publicFund)}</strong></div><div className="fund-row"><span>Citizens' cooperative</span><strong>{money(game.cooperativeFund)}</strong></div><p>These funds are tracked separately. The Politician rules are part of the satire.</p>
          {current.controller === "human" && current.role === "citizen" && <div className="cooperative-actions">
            <div className="panel-label">ORGANIZE TOGETHER</div>
            <div className="cooperative-buttons">
              <button className="secondary-action" disabled={current.cash < 100 || game.phase === "game-over"} onClick={() => { setGame((state) => state ? contributeToCooperative(state, current.id, 100) : state); playSound("money", soundEnabled); }}>Contribute ৳100</button>
              <button className="secondary-action" disabled={current.cash < 500 || game.phase === "game-over"} onClick={() => { setGame((state) => state ? contributeToCooperative(state, current.id, 500) : state); playSound("money", soundEnabled); }}>Contribute ৳500</button>
            </div>
            <button className="primary-action" disabled={game.charterPendingRound !== null || game.charterActivated || game.charterVotes.includes(current.id) || game.cooperativeFund < 1000} onClick={() => { setGame((state) => state ? voteForCharter(state, current.id) : state); playSound("event", soundEnabled); }}>Vote for People's Charter <span>{game.charterVotes.length}/3</span></button>
            <small>{game.charterPendingRound !== null ? "Charter pending: preserve the fund and victory conditions until the next Citizen round." : "A majority vote and ৳1,000 cooperative fund are required to propose the Charter."}</small>
          </div>}<div className="fund-row"><span>Community cards drawn</span><strong>{game.cardDrawCounts.community}/16</strong></div><div className="fund-row"><span>Chance cards drawn</span><strong>{game.cardDrawCounts.chance}/16</strong></div></section>
      </aside>
    </section>
    {selectedSpace && <div className="property-modal-backdrop" role="presentation" onClick={() => setSelectedPropertyId(null)}>
      <section className="property-modal" role="dialog" aria-modal="true" aria-labelledby="property-modal-title" onClick={(event) => event.stopPropagation()}>
        <header className={`property-modal-header ${selectedSpace.color ? `color-${selectedSpace.color}` : ""}`}>
          <div><span className="property-modal-kicker">PROPERTY REGISTER · {selectedSpace.type.toUpperCase()}</span><h2 id="property-modal-title">{selectedSpace.name}</h2><p>{selectedSpace.subtitle}</p></div>
          <button className="constitution-close" onClick={() => setSelectedPropertyId(null)} aria-label="Close property details">CLOSE ×</button>
        </header>
        <div className="property-modal-body">
          <div className="property-detail-grid">
            <div className="property-detail"><span>LISTED PRICE</span><strong>{selectedSpace.price !== undefined ? money(selectedSpace.price) : "—"}</strong></div>
            <div className="property-detail"><span>BASE RENT</span><strong>{selectedSpace.type === "utility" ? "Variable" : selectedSpace.price !== undefined ? money(getBaseRent(selectedSpace.id)) : "—"}</strong></div>
            <div className="property-detail"><span>OWNER</span><strong>{game.cooperativePropertyIds.includes(selectedSpace.id) ? "Citizens' Cooperative" : selectedOwner?.name ?? "Unclaimed"}</strong></div>
            <div className="property-detail"><span>LEASEHOLDER</span><strong>{selectedLeaseholder ? (selectedLeaseholder.name) : "None"}</strong></div>
          </div>
          <div className="property-detail-status"><span>STATUS</span><strong>{selectedProperty?.mortgaged ? "Mortgaged — no rent collected" : game.cooperativePropertyIds.includes(selectedSpace.id) ? "Shared cooperative property" : selectedOwner ? "Owned" : selectedLeaseholder ? "Leased" : "Available to purchase or lease"}</strong></div>
          {selectedSpace.type === "property" && selectedProperty?.ownerId === current.id && <div className="property-detail-status"><span>DEVELOPMENT</span><strong>{selectedProperty.hotel ? "Hotel · 6× base rent" : (selectedProperty.houses ?? 0) > 0 ? (selectedProperty.houses + " house(s) · " + ((selectedProperty.houses ?? 0) + 1) + "× base rent") : "Undeveloped · 1× base rent"}</strong><p className="property-detail-note">Houses cost ৳200 / ৳300 / ৳400; a hotel costs ৳600. Citizens must own the full color group and build evenly. Politicians pay half price and may build a hotel directly. Citizen maintenance is ৳50 per house or ৳200 per hotel each time they pass GO.</p>
          {current.controller === "human" && isHumanTurn(game) && !selectedProperty.mortgaged && !selectedProperty.leaseholderId && !game.cooperativePropertyIds.includes(selectedSpace.id) && !selectedProperty.hotel && <div className="property-modal-actions">
            {(selectedProperty.houses ?? 0) < 3 && <button className="sell-property-button" disabled={current.cash < getBuildingCost(current.role, "house", selectedProperty.houses ?? 0) || !citizenCanBuildSelected} onClick={() => setGame((state) => state ? buildProperty(state, current.id, selectedSpace.id, "house") : state)}>BUILD HOUSE <span>{money(getBuildingCost(current.role, "house", selectedProperty.houses ?? 0))}</span></button>}
            {(current.role === "politician" || (selectedProperty.houses ?? 0) === 3) && <button className="sell-property-button" disabled={current.cash < getBuildingCost(current.role, "hotel", selectedProperty.houses ?? 0) || !citizenCanBuildSelected} onClick={() => setGame((state) => state ? buildProperty(state, current.id, selectedSpace.id, "hotel") : state)}>BUILD HOTEL <span>{money(getBuildingCost(current.role, "hotel", selectedProperty.houses ?? 0))}</span></button>}
          </div>}</div>}

          {selectedProperty?.ownerId === current.id && selectedSpace.price !== undefined && <div className="property-detail-status"><span>MORTGAGE TERMS · {roleName(current.role).toUpperCase()}</span><strong>{selectedProperty.mortgaged ? `Clear for ${money(getMortgageTerms(current.role, selectedSpace.price).redemptionAmount)}` : `Receive ${money(getMortgageTerms(current.role, selectedSpace.price).netAdvance)} net`}</strong><p className="property-detail-note">{selectedProperty.mortgaged ? `Principal plus ${current.role === "politician" ? "8%" : "10%"} interest on the original loan amount. Rent is suspended until cleared.` : current.role === "politician" ? "Full listed price, no processing fee; 8% interest on the loan principal to clear." : `Half the listed price less a 5% fee on the loan amount (${money(getMortgageTerms(current.role, selectedSpace.price).processingFee)}); 10% interest on the loan principal to clear.`}</p></div>}
          <p className="property-detail-note">{selectedSpace.type === "utility"
            ? "Utility rent is calculated from the player's dice roll and the applicable role rules."
            : selectedSpace.type === "railroad"
              ? "Railroad rent depends on the railroad holdings and applicable role rules."
              : "Actual rent may differ from base rent depending on the owner's role, lease terms, and any applicable game rules."}</p>
        </div>
        <footer className="property-modal-footer"><span>THE REPUBLIC OF OPPORTUNITY · SPACE {BOARD.findIndex((space) => space.id === selectedSpace.id)}</span><div className="property-modal-actions">
          {selectedProperty?.ownerId === current.id && current.controller === "human" && isHumanTurn(game) && !selectedProperty.leaseholderId && !game.cooperativePropertyIds.includes(selectedSpace.id) && selectedSpace.price !== undefined && <button className="sell-property-button" disabled={selectedProperty.mortgaged ? current.cash < getMortgageTerms(current.role, selectedSpace.price).redemptionAmount : current.role === "citizen" && (game.players.find((player) => player.role === "politician")?.cash ?? 0) < selectedSpace.price} onClick={() => {
            if (selectedProperty.mortgaged) {
              setGame((state) => state ? redeemMortgage(state, current.id, selectedSpace.id) : state);
            } else {
              const next = sellProperty(game, current.id, selectedSpace.id);
              setGame(next);
            }
            setSelectedPropertyId(null);
          }}>{selectedProperty.mortgaged ? (current.cash >= getMortgageTerms(current.role, selectedSpace.price).redemptionAmount ? "CLEAR MORTGAGE" : "NOT ENOUGH CASH TO CLEAR") : current.role === "politician" ? "SELL TO GOVERNMENT" : (game.players.find((player) => player.role === "politician")?.cash ?? 0) < selectedSpace.price ? "POLITICIAN NEEDS CASH" : "SELL TO POLITICIAN"} <span>{selectedProperty.mortgaged ? money(getMortgageTerms(current.role, selectedSpace.price).redemptionAmount) : money(selectedSpace.price)}</span></button>}
          {selectedProperty?.ownerId === current.id && current.controller === "human" && isHumanTurn(game) && !selectedProperty.leaseholderId && !selectedProperty.mortgaged && !game.cooperativePropertyIds.includes(selectedSpace.id) && selectedSpace.price !== undefined && <button className="sell-property-button" onClick={() => {
            setGame((state) => state ? mortgageProperty(state, current.id, selectedSpace.id) : state);
            setSelectedPropertyId(null);
          }}>MORTGAGE PROPERTY <span>+{money(getMortgageTerms(current.role, selectedSpace.price).netAdvance)}</span></button>}
        </div></footer>
      </section>
    </div>}
    <footer className="site-footer"><span>FICTIONAL POLITICAL SATIRE · NOT A SIMULATION OF ANY SPECIFIC PERSON</span><button onClick={restart}>NEW GAME ↗</button></footer>
  </main>;
}
