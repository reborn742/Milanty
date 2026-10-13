import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Player, Card, GameStage, ChatMessage } from './types';
import { CARD_VALUES, COLORS, SHADOWS } from './constants';
import { SetupForm } from './components/SetupForm';
import { CardComponent } from './components/CardComponent';
import { ModeSelect } from './components/ModeSelect';
import { MultiplayerLobby } from './components/MultiplayerLobby';
import { ChatPanel } from './components/ChatPanel';
import { getCommentary } from './services/commentaryService';
import { audioService } from './services/audioService';
import {
  RoomAction,
  PresenceMember,
  sendAction,
  sendState,
  onAction,
  onState,
  sendChatMessage,
  onChatMessage,
  onPresenceLeave,
  onPresenceSync,
  closeRoomChannel,
} from './services/roomService';

const App: React.FC = () => {
  const [stage, setStage] = useState<GameStage | 'INTRO'>('INTRO');
  const [players, setPlayers] = useState<Player[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);
  const [commentary, setCommentary] = useState<string>('Welcome to Milanty!');
  const [roundWinners, setRoundWinners] = useState<string[]>([]);
  const [totalRounds, setTotalRounds] = useState(0);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem('match4_muted');
    return saved ? JSON.parse(saved) : false;
  });
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');

  // --- Multiplayer state ---
  const [mode, setMode] = useState<'AI' | 'MULTIPLAYER' | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('room') ? 'MULTIPLAYER' : null;
  });
  const sharedRoomCode = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const raw = new URLSearchParams(window.location.search).get('room') || '';
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    return cleaned || undefined;
  }, []);
  const [myId, setMyId] = useState<string>('human');
  const [myName, setMyName] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(true);
  const [roomCode, setRoomCode] = useState<string>('');
  const [mpStarted, setMpStarted] = useState<boolean>(false);
  const [mpGameStopped, setMpGameStopped] = useState<boolean>(false);
  const [lobbyMembers, setLobbyMembers] = useState<PresenceMember[]>([]);
  const [reconnectingIds, setReconnectingIds] = useState<Set<string>>(new Set());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const mpChannelRef = useRef<RealtimeChannel | null>(null);
  const isHostRef = useRef(isHost);
  const playersRef = useRef(players);
  const currentPlayerIdxRef = useRef(currentPlayerIdx);
  const cardsRef = useRef(cards);
  const handlePickCardRef = useRef<(cardIdx: number) => void>(() => {});
  const handlePassRef = useRef<(cardIdxOverride?: number) => void>(() => {});
  const guestSeenWinnersRef = useRef<number>(0);
  const pendingLeaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { currentPlayerIdxRef.current = currentPlayerIdx; }, [currentPlayerIdx]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  const myIdx = useMemo(() => players.findIndex(p => p.id === myId), [players, myId]);

  // Handle Intro Sequence
  useEffect(() => {
    if (stage === 'INTRO') {
      const timer = setTimeout(() => {
        setStage(GameStage.SETUP);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [stage]);

  // Dynamic pacing based on player count
  const getAIDelay = useCallback((base: number) => {
    const tableSizeFactor = players.length * 60; // Extra 60ms per player
    return base + tableSizeFactor;
  }, [players.length]);

  useEffect(() => {
    audioService.setMuted(isMuted);
    localStorage.setItem('match4_muted', JSON.stringify(isMuted));
  }, [isMuted]);

  // Initialize a new round
  const startNewRound = useCallback((pList: Player[]) => {
    const pCount = pList.length;
    const roundCardValues: number[] = [];
    
    const topValues = [...CARD_VALUES].sort((a, b) => b - a).slice(0, pCount);
    
    for (let i = 0; i < pCount; i++) {
      for (let j = 0; j < 4; j++) {
        roundCardValues.push(topValues[i]);
      }
    }

    const newCards: Card[] = roundCardValues
      .sort(() => Math.random() - 0.5)
      .map((val, idx) => ({ id: idx, value: val, isPicked: false }));

    setCards(newCards);
    // Reset round score to 0 so that score is strictly calculated for this round!
    setPlayers(pList.map(p => ({ 
      ...p, 
      cards: [], 
      score: 0, 
      isOut: false, 
      rank: undefined 
    })));
    setStage(GameStage.PICKING);
    setCurrentPlayerIdx(0);
    setRoundWinners([]);
    setSelectedCardIdx(null);
    setCommentary("Round starting! The highest cards are in play.");
  }, []);

  const handleGameStart = (name: string, count: number, chosenDifficulty: 'EASY' | 'MEDIUM' | 'HARD') => {
    setDifficulty(chosenDifficulty);
    const initialPlayers: Player[] = [
      { id: 'human', name, isAI: false, cards: [], score: 0, totalScore: 0, isOut: false }
    ];
    for (let i = 1; i < count; i++) {
      initialPlayers.push({
        id: `ai-${i}`,
        name: `AI Bot ${i}`,
        isAI: true,
        cards: [],
        score: 0,
        totalScore: 0,
        isOut: false
      });
    }
    setPlayers(initialPlayers);
    startNewRound(initialPlayers);
  };

  const resetToSetup = () => {
    if (mode === 'MULTIPLAYER') {
      closeRoomChannel(mpChannelRef.current);
      mpChannelRef.current = null;
      setMode(null);
      setMpStarted(false);
      setMyId('human');
      setMyName('');
      setIsHost(true);
      setRoomCode('');
      setChatMessages([]);
      Object.values(pendingLeaveTimersRef.current).forEach(clearTimeout);
      pendingLeaveTimersRef.current = {};
      setReconnectingIds(new Set());
    }
    setPlayers([]);
    setCards([]);
    setCurrentPlayerIdx(0);
    setSelectedCardIdx(null);
    setCommentary('Welcome to Milanty!');
    setRoundWinners([]);
    setTotalRounds(0);
    setStage(GameStage.SETUP);
  };

  const checkWin = useCallback((hand: number[]): boolean => {
    if (hand.length < 4) return false;
    const counts: Record<number, number> = {};
    hand.forEach(v => counts[v] = (counts[v] || 0) + 1);
    return Object.values(counts).some(c => c === 4);
  }, []);

  // Complete the picking phase and check if anyone matched 4 on initial pick (Rule 1)
  const finishPickingPhase = useCallback((updatedPlayers: Player[]) => {
    const initialWinners: { player: Player; matchedVal: number }[] = [];
    updatedPlayers.forEach(p => {
      const counts: Record<number, number> = {};
      p.cards.forEach(v => counts[v] = (counts[v] || 0) + 1);
      const match = Object.keys(counts).find(k => counts[Number(k)] >= 4);
      if (match) {
        initialWinners.push({ player: p, matchedVal: Number(match) });
      }
    });

    initialWinners.sort((a, b) => b.matchedVal - a.matchedVal);

    const winnerIds: string[] = [];
    initialWinners.forEach(({ player, matchedVal }, idx) => {
      player.isOut = true;
      player.score = matchedVal;
      player.totalScore = (player.totalScore || 0) + matchedVal;
      player.rank = idx + 1;
      winnerIds.push(player.id);
    });

    if (winnerIds.length > 0) {
      setRoundWinners(winnerIds);
      audioService.playMatch();
      getCommentary(initialWinners[0].player.name, 'WIN').then(setCommentary);

      if (winnerIds.includes(myId)) {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#FACC15', '#10B981', '#3B82F6']
        });
      }
    }

    const remainingActive = updatedPlayers.filter(p => !p.isOut);
    // Rule: When 2 or fewer players remain, the round ends immediately (last 2 get 0)
    if (remainingActive.length <= 2 && winnerIds.length > 0) {
      setPlayers(updatedPlayers);
      setTimeout(() => {
        setStage(GameStage.ROUND_OVER);
        setTotalRounds(prev => prev + 1);
        audioService.playRoundOver();
      }, 1200);
      return;
    }

    const firstActiveIdx = updatedPlayers.findIndex(p => !p.isOut);
    setCurrentPlayerIdx(firstActiveIdx !== -1 ? firstActiveIdx : 0);
    setStage(GameStage.PASSING);
    setPlayers(updatedPlayers);
  }, [myId]);

  const handlePickCard = (cardIdx: number) => {
    if (stage !== GameStage.PICKING) return;
    const activePlayer = players[currentPlayerIdx];
    if (activePlayer.isAI) return;
    if (activePlayer.cards.length >= 4) return;

    const card = cards[cardIdx];
    if (card.isPicked) return;

    audioService.playPick();

    const newCards = [...cards];
    newCards[cardIdx].isPicked = true;
    setCards(newCards);

    const newPlayers = [...players];
    newPlayers[currentPlayerIdx].cards.push(card.value);

    const allHave4 = newPlayers.every(p => p.cards.length === 4);
    if (allHave4) {
      finishPickingPhase(newPlayers);
    } else {
      setCurrentPlayerIdx((prev) => (prev + 1) % players.length);
      setPlayers(newPlayers);
    }
  };

  useEffect(() => {
    if (mode === 'MULTIPLAYER' && !isHost) return;
    if (stage === GameStage.PICKING && players[currentPlayerIdx]?.isAI) {
      const timer = setTimeout(() => {
        const available = cards.filter(c => !c.isPicked);
        if (available.length > 0) {
          audioService.playPick();
          
          let chosenCardId: number | null = null;
          // During the initial card-picking phase, all cards are face-down, so both human and AI must pick completely randomly.
          const randomIndex = Math.floor(Math.random() * available.length);
          chosenCardId = available[randomIndex].id;
          
          const actualCardIdx = cards.findIndex(c => c.id === chosenCardId);
          
          if (actualCardIdx !== -1) {
            const newCards = [...cards];
            newCards[actualCardIdx].isPicked = true;
            setCards(newCards);

            const newPlayers = [...players];
            newPlayers[currentPlayerIdx].cards.push(cards[actualCardIdx].value);

            const allHave4 = newPlayers.every(p => p.cards.length === 4);
            if (allHave4) {
              finishPickingPhase(newPlayers);
            } else {
              setCurrentPlayerIdx((prev) => (prev + 1) % players.length);
              setPlayers(newPlayers);
            }
          }
        }
      }, getAIDelay(300)); 
      return () => clearTimeout(timer);
    }
  }, [stage, currentPlayerIdx, cards, players, getAIDelay, checkWin, roundWinners, difficulty, finishPickingPhase, mode, isHost]);

  const getNextActivePlayerIdx = useCallback((currentIdx: number, currentPlayersList: Player[]): number => {
    let checkIdx = (currentIdx + 1) % currentPlayersList.length;
    for (let i = 0; i < currentPlayersList.length; i++) {
      if (!currentPlayersList[checkIdx].isOut) {
        return checkIdx;
      }
      checkIdx = (checkIdx + 1) % currentPlayersList.length;
    }
    return currentIdx;
  }, []);

  const handlePass = useCallback((cardIdxOverride?: number) => {
    if (stage !== GameStage.PASSING) return;
    const cardIdx = cardIdxOverride ?? selectedCardIdx;
    if (cardIdx === null || cardIdx === undefined) return;

    const currentPlayersList = players.map(p => ({ ...p, cards: [...p.cards] }));
    const fromIdx = currentPlayerIdx;
    const fromPlayer = currentPlayersList[fromIdx];
    
    if (fromPlayer.isOut) return;

    const toIdx = getNextActivePlayerIdx(fromIdx, currentPlayersList);

    audioService.playPass();

    const passedValue = fromPlayer.cards[cardIdx];

    currentPlayersList[fromIdx].cards.splice(cardIdx, 1);
    currentPlayersList[toIdx].cards.push(passedValue);

    setPlayers(currentPlayersList);
    setSelectedCardIdx(null);
    setCurrentPlayerIdx(toIdx);
  }, [stage, currentPlayerIdx, players, selectedCardIdx, getNextActivePlayerIdx]);

  // Turn and Match Handler (turn-by-turn, realistic pacing, no cheating)
  useEffect(() => {
    if (mode === 'MULTIPLAYER' && !isHost) return;
    if (stage !== GameStage.PASSING) return;

    // If 2 or fewer players remain active and at least one winner matched, round is already ending
    const activeRemaining = players.filter(p => !p.isOut);
    if (activeRemaining.length <= 2 && roundWinners.length > 0) {
      return;
    }

    const activePlayer = players[currentPlayerIdx];
    if (!activePlayer) return;

    // If active player is already out, shift turn to next active player
    if (activePlayer.isOut) {
      const nextIdx = getNextActivePlayerIdx(currentPlayerIdx, players);
      if (nextIdx !== currentPlayerIdx) {
        setCurrentPlayerIdx(nextIdx);
      }
      return;
    }

    // 1. Check if the active player has a match of 4
    if (checkWin(activePlayer.cards)) {
      const timer = setTimeout(() => {
        const currentPlayersList = players.map(p => ({ ...p, cards: [...p.cards] }));
        const fromIdx = currentPlayerIdx;
        const p = currentPlayersList[fromIdx];

        // Find the matched value
        const counts: Record<number, number> = {};
        p.cards.forEach(v => counts[v] = (counts[v] || 0) + 1);
        const matchedValStr = Object.keys(counts).find(k => counts[Number(k)] >= 4);
        const matchedVal = matchedValStr ? Number(matchedValStr) : p.cards[0];

        p.isOut = true;
        // Score strictly for this round
        p.score = matchedVal;
        p.totalScore = (p.totalScore || 0) + matchedVal;
        
        const newRank = roundWinners.length + 1;
        p.rank = newRank;
        
        const newRoundWinners = [...roundWinners, p.id];
        setRoundWinners(newRoundWinners);
        
        audioService.playMatch();
        getCommentary(p.name, 'WIN').then(setCommentary);

        // Confetti Celebration: triggers when a player matches 4 and wins!
        if (p.id === myId) {
          if (newRank === 1) {
            // High-intensity full side-cannon shower for winning the round!
            const end = Date.now() + 2500;
            const colors = ['#FACC15', '#6366F1', '#10B981', '#EC4899', '#3B82F6'];
            const frame = () => {
              confetti({
                particleCount: 4,
                angle: 60,
                spread: 55,
                origin: { x: 0, y: 0.8 },
                colors: colors
              });
              confetti({
                particleCount: 4,
                angle: 120,
                spread: 55,
                origin: { x: 1, y: 0.8 },
                colors: colors
              });
              if (Date.now() < end) {
                requestAnimationFrame(frame);
              }
            };
            frame();
          } else {
            // Joyful medium burst for escaping and matching 4 of a kind!
            confetti({
              particleCount: 80,
              spread: 60,
              origin: { y: 0.7 },
              colors: ['#FACC15', '#10B981', '#3B82F6']
            });
          }
        } else if (newRank === 1) {
          // AI won the round - clean aesthetic burst to show the round is won
          confetti({
            particleCount: 40,
            spread: 50,
            origin: { y: 0.7 },
            colors: ['#6366F1', '#475569']
          });
        }

        let nextIdx = fromIdx;
        
        if (p.cards.length === 5) {
          // Pass the extra card to the next active player before getting out
          const extraCardVal = p.cards.find(v => v !== matchedVal) ?? p.cards[4];
          const extraCardIdx = p.cards.indexOf(extraCardVal);
          if (extraCardIdx !== -1) {
            p.cards.splice(extraCardIdx, 1);
          }
          const toIdx = getNextActivePlayerIdx(fromIdx, currentPlayersList);
          currentPlayersList[toIdx].cards.push(extraCardVal);
          nextIdx = toIdx;
        } else {
          nextIdx = getNextActivePlayerIdx(fromIdx, currentPlayersList);
        }

        setPlayers(currentPlayersList);
        setSelectedCardIdx(null);

        const remainingActive = currentPlayersList.filter(pl => !pl.isOut);
        // Rule: The last 2 players remaining in the round get 0 points!
        if (remainingActive.length <= 2) {
          setTimeout(() => {
            setStage(GameStage.ROUND_OVER);
            setTotalRounds(prev => prev + 1);
            audioService.playRoundOver();
          }, 1200);
        } else {
          if (currentPlayersList[nextIdx].isOut) {
            nextIdx = getNextActivePlayerIdx(nextIdx, currentPlayersList);
          }
          setCurrentPlayerIdx(nextIdx);
        }
      }, 1200); // 1.2s pause for a realistic visual reaction of matching

      return () => clearTimeout(timer);
    }

    // 2. If no match, and it's an AI's turn to pass:
    if (activePlayer.isAI) {
      const timer = setTimeout(() => {
        const currentPlayersList = players.map(p => ({ ...p, cards: [...p.cards] }));
        const fromIdx = currentPlayerIdx;
        const fromPlayer = currentPlayersList[fromIdx];
        
        const toIdx = getNextActivePlayerIdx(fromIdx, currentPlayersList);

        audioService.playPass();

        // Count frequencies in its own hand ONLY (Zero cheating!)
        const counts: Record<number, number> = {};
        fromPlayer.cards.forEach(v => counts[v] = (counts[v] || 0) + 1);

        // Score cards: we want to keep high frequencies and higher values.
        const cardScores = fromPlayer.cards.map((val, idx) => {
          const score = (counts[val] || 0) * 1000 + val;
          return { val, idx, score };
        });

        // Sort ascending (lowest score first)
        cardScores.sort((a, b) => a.score - b.score);

        // Decide if we pass randomly based on difficulty:
        // EASY: 60% chance of passing a random card.
        // MEDIUM: 15% chance of passing a random card.
        // HARD: 0% chance of passing a random card.
        const isEasyRandom = difficulty === 'EASY' && Math.random() < 0.60;
        const isMediumRandom = difficulty === 'MEDIUM' && Math.random() < 0.15;

        let cardIdxToPass = 0;
        if (isEasyRandom || isMediumRandom) {
          cardIdxToPass = Math.floor(Math.random() * fromPlayer.cards.length);
        } else {
          cardIdxToPass = cardScores[0].idx;
        }

        const passedValue = fromPlayer.cards[cardIdxToPass];

        currentPlayersList[fromIdx].cards.splice(cardIdxToPass, 1);
        currentPlayersList[toIdx].cards.push(passedValue);

        setPlayers(currentPlayersList);
        setSelectedCardIdx(null);
        setCurrentPlayerIdx(toIdx);
      }, getAIDelay(1000));

      return () => clearTimeout(timer);
    }
  }, [stage, currentPlayerIdx, players, getAIDelay, getNextActivePlayerIdx, checkWin, roundWinners, difficulty, mode, isHost, myId]);

  // Guests don't run the host-only win-detection effect above, so give them their own
  // "you won" celebration when they see themselves appear in roundWinners via synced state.
  useEffect(() => {
    if (mode !== 'MULTIPLAYER' || isHost) return;
    if (roundWinners.length === 0) {
      guestSeenWinnersRef.current = 0;
      return;
    }
    if (roundWinners.length <= guestSeenWinnersRef.current) return;
    guestSeenWinnersRef.current = roundWinners.length;

    const latestWinnerId = roundWinners[roundWinners.length - 1];
    if (latestWinnerId !== myId) return;

    const rank = roundWinners.length;
    if (rank === 1) {
      const end = Date.now() + 2500;
      const colors = ['#FACC15', '#6366F1', '#10B981', '#EC4899', '#3B82F6'];
      const frame = () => {
        confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors });
        confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    } else {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 }, colors: ['#FACC15', '#10B981', '#3B82F6'] });
    }
  }, [roundWinners, mode, isHost, myId]);

  // Keep refs pointing at the latest versions of the engine functions so the
  // realtime listeners (registered once on connect) never call stale closures.
  useEffect(() => { handlePickCardRef.current = handlePickCard; });
  useEffect(() => { handlePassRef.current = handlePass; });

  // Host applies a validated action coming from a guest, then the state-broadcast
  // effect below (which fires on any players/cards/stage change) syncs everyone.
  const lastActionAtRef = useRef<Record<string, number>>({});
  const lastChatAtRef = useRef<Record<string, number>>({});

  // Trust boundary: everything in `action` comes from another player's browser
  // and must never be assumed well-formed. We check the type, that it's really
  // that player's turn, that cardIdx is an in-bounds integer, and throttle
  // bursts from a single sender - all before it ever reaches the game engine.
  const handleRemoteAction = useCallback((action: RoomAction) => {
    if (!isHostRef.current) return;
    if (!action || (action.type !== 'PICK' && action.type !== 'PASS')) return;
    if (typeof action.playerId !== 'string' || !action.playerId) return;

    const now = Date.now();
    const last = lastActionAtRef.current[action.playerId] || 0;
    if (now - last < 150) return; // basic per-player rate limit against action flooding
    lastActionAtRef.current[action.playerId] = now;

    const currentPlayers = playersRef.current;
    const idx = currentPlayerIdxRef.current;
    const activePlayer = currentPlayers[idx];
    if (!activePlayer || activePlayer.id !== action.playerId) return; // not their turn

    if (!Number.isInteger(action.cardIdx)) return;

    if (action.type === 'PICK') {
      if (action.cardIdx < 0 || action.cardIdx >= cardsRef.current.length) return;
      handlePickCardRef.current(action.cardIdx);
    } else if (action.type === 'PASS') {
      if (action.cardIdx < 0 || action.cardIdx >= activePlayer.cards.length) return;
      handlePassRef.current(action.cardIdx);
    }
  }, []);

  // Host applies a disconnect: the departed player is marked out (removed from
  // the active rotation) and flagged hasLeft so the next round excludes them.
  // Guarded on hasLeft (not isOut) — isOut is also true for anyone who simply
  // won/matched that round, so guarding on it would silently ignore a leave
  // from someone who just won.
  const applyPlayerLeft = useCallback((leftId: string) => {
    setLobbyMembers(prev => prev.filter(p => p.id !== leftId));
    setReconnectingIds(prev => {
      if (!prev.has(leftId)) return prev;
      const next = new Set(prev);
      next.delete(leftId);
      return next;
    });
    if (!isHostRef.current) return;
    setPlayers(prev => {
      const idx = prev.findIndex(p => p.id === leftId);
      if (idx === -1 || prev[idx].hasLeft) return prev;
      return prev.map((p, i) => (i === idx ? { ...p, isOut: true, hasLeft: true } : p));
    });
  }, []);

  // A presence "leave" fires on any dropped connection — a network blip, a
  // locked phone screen, a backgrounded tab, a proxy/CDN hiccup — not only a
  // genuine quit, and reconnecting is a real round-trip (new socket, auth,
  // resubscribe, re-announce presence) that can easily take several seconds
  // on a real network. So the two are split: the UI shows "reconnecting..."
  // immediately (feels fast, nothing waits on it), but the actual removal -
  // voiding/stopping the game - waits a safer window so a genuine reconnect
  // still saves them. This must run on every client, not just the host: each
  // player's own waiting-room view needs this same protection.
  const LEAVE_GRACE_MS = 8000;
  const handlePlayerLeft = useCallback((leftId: string) => {
    if (pendingLeaveTimersRef.current[leftId]) return; // already waiting on this one
    setReconnectingIds(prev => (prev.has(leftId) ? prev : new Set(prev).add(leftId)));
    pendingLeaveTimersRef.current[leftId] = setTimeout(() => {
      delete pendingLeaveTimersRef.current[leftId];
      applyPlayerLeft(leftId);
    }, LEAVE_GRACE_MS);
  }, [applyPlayerLeft]);

  // Cancels any pending removals for players presence shows are still (or
  // once again) connected — called on every presence sync.
  const cancelPendingLeaves = useCallback((presentIds: Set<string>) => {
    Object.keys(pendingLeaveTimersRef.current).forEach((id) => {
      if (presentIds.has(id)) {
        clearTimeout(pendingLeaveTimersRef.current[id]);
        delete pendingLeaveTimersRef.current[id];
      }
    });
    setReconnectingIds(prev => {
      let changed = false;
      const next = new Set(prev);
      prev.forEach((id) => {
        if (presentIds.has(id)) { next.delete(id); changed = true; }
      });
      return changed ? next : prev;
    });
  }, []);

  // Host broadcasts the full authoritative state after every change.
  useEffect(() => {
    if (mode !== 'MULTIPLAYER' || !isHost) return;
    const channel = mpChannelRef.current;
    if (!channel) return;
    sendState(channel, { stage, players, cards, currentPlayerIdx, roundWinners, totalRounds, commentary, mpGameStopped });
  }, [mode, isHost, stage, players, cards, currentPlayerIdx, roundWinners, totalRounds, commentary, mpGameStopped]);

  const handleMultiplayerConnected = useCallback((
    channel: RealtimeChannel,
    id: string,
    name: string,
    host: boolean,
    code: string
  ) => {
    mpChannelRef.current = channel;
    setMyId(id);
    setMyName(name);
    setIsHost(host);
    setRoomCode(code);

    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.toString());
    }

    onAction(channel, (action) => handleRemoteAction(action));
    onChatMessage(channel, (message) => {
      if (!message || typeof message.senderId !== 'string' || !message.senderId) return;

      const now = Date.now();
      const last = lastChatAtRef.current[message.senderId] || 0;
      if (now - last < 400) return; // throttle: ignore rapid-fire messages from one sender
      lastChatAtRef.current[message.senderId] = now;

      if (message.type === 'text') {
        if (typeof message.text !== 'string' || message.text.length === 0 || message.text.length > 500) return;
      } else if (message.type === 'image') {
        if (typeof message.imageData !== 'string' || message.imageData.length > 400_000) return;
        if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(message.imageData)) return;
      } else {
        return;
      }

      setChatMessages((prev) => [...prev, message].slice(-200));
    });
    onPresenceLeave(channel, (leftId) => handlePlayerLeft(leftId));
    onPresenceSync(channel, (members) => {
      const presentIds = new Set(members.map((m) => m.id));
      cancelPendingLeaves(presentIds);
      setLobbyMembers(prev => {
        // Anyone a sync snapshot momentarily omits but who still has a
        // pending-leave timer running hasn't actually left yet - keep
        // showing them rather than letting them flicker out and back in.
        const stillInGrace = prev.filter(p => !presentIds.has(p.id) && pendingLeaveTimersRef.current[p.id]);
        return [...members, ...stillInGrace];
      });
    });
    onState(channel, (state) => {
      setStage(state.stage);
      setPlayers(state.players);
      setCards(state.cards);
      setCurrentPlayerIdx(state.currentPlayerIdx);
      setRoundWinners(state.roundWinners);
      setTotalRounds(state.totalRounds);
      setCommentary(state.commentary);
      setMpGameStopped(Boolean(state.mpGameStopped));
      setMpStarted(state.stage !== GameStage.SETUP);
    });
  }, [handleRemoteAction, handlePlayerLeft, cancelPendingLeaves]);

  // A join attempt can be rejected after the fact (e.g. the room was already
  // full by the time presence synced) even though the channel was handed
  // over eagerly above. This unwinds exactly what that call set up, so the
  // app doesn't think it's still connected to a room it just left.
  const handleMultiplayerConnectFailed = useCallback(() => {
    mpChannelRef.current = null;
    setMyId('human');
    setMyName('');
    setIsHost(true);
    setRoomCode('');
  }, []);

  const handleMultiplayerStart = useCallback((members: PresenceMember[]) => {
    const hostPlayers: Player[] = members.map(m => ({
      id: m.id,
      name: m.name,
      isAI: false,
      cards: [],
      score: 0,
      totalScore: 0,
      isOut: false,
    }));
    setDifficulty('MEDIUM');
    setPlayers(hostPlayers);
    setRoundWinners([]);
    setTotalRounds(0);
    setMpGameStopped(false);
    setMpStarted(true);
    startNewRound(hostPlayers);
  }, [startNewRound]);

  // Host-only: end the current game immediately (from any point mid-round or
  // between rounds) and send everyone - host included - back to this same
  // room's waiting lobby, still on the same room code. Reuses the exact
  // stage/mpStarted reset already used when a game is voided due to too few
  // players remaining; guests pick it up automatically via the existing
  // state broadcast, since their mpStarted is derived from stage !== SETUP.
  const handleEndGameToLobby = useCallback(() => {
    if (!window.confirm('End this game for everyone and return to the waiting room?')) return;
    setMpStarted(false);
    setStage(GameStage.SETUP);
  }, []);

  const lastOwnChatAtRef = useRef<number>(0);

  // Chat is peer-to-peer over the room channel: broadcast doesn't echo back to
  // the sender (self: false), so we add our own message locally right away.
  const sendChat = useCallback((partial: Pick<ChatMessage, 'type' | 'text' | 'imageData'>) => {
    if (partial.type === 'text' && (!partial.text || partial.text.length > 500)) return;
    if (partial.type === 'image' && (!partial.imageData || partial.imageData.length > 400_000)) return;

    const now = Date.now();
    if (now - lastOwnChatAtRef.current < 400) return; // basic client-side throttle
    lastOwnChatAtRef.current = now;

    const channel = mpChannelRef.current;
    const message: ChatMessage = {
      id: `${myId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: myId,
      senderName: myName || 'Player',
      timestamp: Date.now(),
      ...partial,
    };
    setChatMessages((prev) => [...prev, message]);
    if (channel) sendChatMessage(channel, message);
  }, [myId, myName]);

  const handleSendChatText = useCallback((text: string) => {
    sendChat({ type: 'text', text });
  }, [sendChat]);

  const handleSendChatImage = useCallback((imageData: string) => {
    sendChat({ type: 'image', imageData });
  }, [sendChat]);

  // UI-facing wrappers: on the host (or in single-device AI mode) act on the
  // engine directly; a multiplayer guest instead sends the action to the host.
  const handleCardClick = (cardIdx: number) => {
    if (mode === 'MULTIPLAYER' && !isHost) {
      if (stage !== GameStage.PICKING) return;
      if (players[currentPlayerIdx]?.id !== myId) return;
      if (cards[cardIdx]?.isPicked) return;
      const channel = mpChannelRef.current;
      if (channel) sendAction(channel, { type: 'PICK', playerId: myId, cardIdx });
      return;
    }
    handlePickCard(cardIdx);
  };

  const handlePassClick = () => {
    if (mode === 'MULTIPLAYER' && !isHost) {
      if (stage !== GameStage.PASSING || selectedCardIdx === null) return;
      if (players[currentPlayerIdx]?.id !== myId) return;
      const channel = mpChannelRef.current;
      if (channel) sendAction(channel, { type: 'PASS', playerId: myId, cardIdx: selectedCardIdx });
      setSelectedCardIdx(null);
      return;
    }
    handlePass();
  };

  // If the player whose turn it is disconnects, hand the turn to the next
  // active player immediately instead of leaving the game stuck.
  useEffect(() => {
    if (mode !== 'MULTIPLAYER' || !isHost) return;
    if (stage !== GameStage.PICKING && stage !== GameStage.PASSING) return;
    const activePlayer = players[currentPlayerIdx];
    if (activePlayer?.isOut) {
      const nextIdx = getNextActivePlayerIdx(currentPlayerIdx, players);
      if (nextIdx !== currentPlayerIdx) setCurrentPlayerIdx(nextIdx);
    }
  }, [players, stage, currentPlayerIdx, mode, isHost, getNextActivePlayerIdx]);

  // A disconnect during an active round is handled based on how many players
  // are left once the departed player(s) are excluded, not just on whether a
  // round has already finished:
  // - Round 1 never finished yet, OR fewer than 3 players remain -> void this
  //   attempt entirely and send the host back to the waiting room (no
  //   marksheet shown, nothing to freeze on) to gather players for a new game.
  // - A round already finished AND 3+ players still remain -> just make sure
  //   the round result is showing, exactly like a normal round ending. The
  //   host then uses the existing "Next Round" button, which already excludes
  //   `hasLeft` players and deals the correct number of cards for whatever
  //   roster size remains. Gated on hasLeft so this never fires on the normal
  //   win-based round-end path, which already handles itself.
  useEffect(() => {
    if (mode !== 'MULTIPLAYER' || !isHost) return;
    if (stage !== GameStage.PICKING && stage !== GameStage.PASSING && stage !== GameStage.ROUND_OVER) return;
    if (!players.some(p => p.hasLeft)) return;

    const remaining = players.filter(p => !p.hasLeft);

    if (totalRounds === 0 || remaining.length < 3) {
      setMpStarted(false);
      setStage(GameStage.SETUP);
    } else {
      setStage(GameStage.ROUND_OVER);
    }
  }, [players, stage, mode, isHost, totalRounds]);

  // Host chooses "New Game" after a disconnect-stopped game: return to the
  // waiting room with the same room/connection, ready to deal a fresh game.
  const handleReturnToLobby = useCallback(() => {
    setMpGameStopped(false);
    setMpStarted(false);
    setStage(GameStage.SETUP);
  }, []);

  const sortedPlayersByScore = useMemo(() => {
    return [...players].sort((a, b) => b.score - a.score);
  }, [players]);

  const sortedPlayersByTotalScore = useMemo(() => {
    return [...players].sort((a, b) => (b.totalScore ?? b.score) - (a.totalScore ?? a.score));
  }, [players]);

  const humanPlayer = players.find(p => p.id === myId);

  // Celebrate overall game victory when stage changes to GAME_OVER and human player won
  useEffect(() => {
    if (stage === GameStage.GAME_OVER && sortedPlayersByTotalScore[0]?.id === myId) {
      const duration = 5 * 1000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.8 },
          colors: ['#FACC15', '#6366F1', '#10B981', '#EC4899', '#3B82F6']
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.8 },
          colors: ['#FACC15', '#6366F1', '#10B981', '#EC4899', '#3B82F6']
        });

        if (Date.now() < end && stage === GameStage.GAME_OVER) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [stage, sortedPlayersByTotalScore, myId]);

  if (stage === 'INTRO') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden z-[100]">
        <div className="milanty-logo-box">
          <span className="milanty-logo-m font-logo">M</span>
        </div>
        <h1 className="milanty-text font-logo tracking-widest">Milanty</h1>
        <div className="absolute bottom-12 text-slate-500 font-bold uppercase tracking-[0.3em] text-xs opacity-50 animate-pulse">
          Crafting the cards...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 relative">
      {/* Top Navigation */}
      <div className="fixed top-6 right-6 z-50 flex items-center gap-3">
        <button 
          onClick={() => setShowInstructions(true)}
          className="px-5 py-3 bg-yellow-400 text-slate-950 font-black rounded-xl shadow-xl hover:bg-yellow-300 transition-all uppercase tracking-tighter text-sm flex items-center gap-2 group border-b-4 border-yellow-600 active:translate-y-1 active:border-b-0"
        >
          <span className="bg-slate-950 text-yellow-400 w-5 h-5 rounded-full flex items-center justify-center text-[10px]">?</span>
          How to Play
        </button>
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-all active:scale-95 shadow-lg"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <svg className="w-6 h-6 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.41.32-.85.59-1.32.79v2.06c1.02-.23 1.97-.68 2.8-1.29L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
          ) : (
            <svg className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          )}
        </button>
      </div>

      {/* Instructions Modal */}
      {showInstructions && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowInstructions(false)}></div>
          <div className="bg-slate-800 w-full max-w-2xl rounded-[2.5rem] border border-slate-700 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 sm:p-8 md:p-12 overflow-y-auto">
              <div className="flex justify-between items-center mb-8 md:mb-10">
                <h2 className="text-3xl md:text-4xl font-logo text-yellow-400 tracking-tighter uppercase">Game Rules</h2>
                <button onClick={() => setShowInstructions(false)} className="text-slate-500 hover:text-white transition-colors">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              <div className="space-y-8 md:space-y-10">
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                  <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center font-black text-2xl text-white shadow-lg">1</div>
                  <div>
                    <h3 className="font-bold text-xl md:text-2xl text-white mb-2">Initial Pick</h3>
                    <p className="text-slate-400 text-base md:text-lg leading-relaxed">
                      Choose <strong>4 cards</strong> from the face-down deck. If you're lucky enough to pick four matching numbers (like four 100s), you <strong>win immediately</strong>!
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                  <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center font-black text-2xl text-white shadow-lg">2</div>
                  <div>
                    <h3 className="font-bold text-xl md:text-2xl text-white mb-2">The Circular Relay</h3>
                    <p className="text-slate-400 text-base md:text-lg leading-relaxed">
                      If you haven't matched 4 yet, choose <strong>one card</strong> to pass to your neighbor. The cards flow in a relay: <strong>Player A passes to B, B to C</strong>, and so on until the round ends.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                  <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center font-black text-2xl text-white shadow-lg">3</div>
                  <div>
                    <h3 className="font-bold text-xl md:text-2xl text-white mb-2">Winning the Round</h3>
                    <p className="text-slate-400 text-base md:text-lg leading-relaxed">
                      Collect <strong>four of the same number</strong> to win. The card value determines your points (100 is best). The last 2 players remaining in the round get <strong>0 points</strong>!
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 md:p-8 bg-slate-900/50 border-t border-slate-700 text-center">
              <button 
                onClick={() => setShowInstructions(false)}
                className="w-full sm:w-auto px-12 py-4 bg-yellow-400 text-slate-950 font-black rounded-2xl uppercase tracking-widest hover:bg-yellow-300 transition shadow-xl"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multiplayer room chat: text, emoji, and photo sharing with your table */}
      {mode === 'MULTIPLAYER' && roomCode && (
        <ChatPanel
          messages={chatMessages}
          myId={myId}
          onSendText={handleSendChatText}
          onSendImage={handleSendChatImage}
        />
      )}

      {stage !== GameStage.SETUP && (
        <div className="flex flex-col md:flex-row justify-start items-start md:items-center mt-14 md:mt-0 mb-8 gap-4 md:gap-12 pr-0 md:pr-48 lg:pr-72">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center shadow-lg">
                  <span className="font-logo text-slate-950 text-2xl font-black">M</span>
               </div>
               <div>
                 <h2 className="text-3xl font-logo text-yellow-400 leading-none">Milanty</h2>
                 <div className="flex items-center gap-2 mt-1">
                   <p className="text-slate-400 text-xs uppercase tracking-widest font-bold leading-none">Round {totalRounds + 1}</p>
                   <span className="text-[8px] text-slate-600 leading-none">•</span>
                   {mode === 'MULTIPLAYER' ? (
                     <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border bg-indigo-500/10 text-indigo-300 border-indigo-500/20">
                       Room {roomCode}
                     </span>
                   ) : (
                     <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${
                       difficulty === 'EASY' 
                         ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                         : difficulty === 'MEDIUM'
                         ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20'
                         : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                     }`}>
                       {difficulty}
                     </span>
                   )}
                 </div>
               </div>
            </div>
            {mode === 'MULTIPLAYER' && isHost && (stage === GameStage.PICKING || stage === GameStage.PASSING || stage === GameStage.ROUND_OVER) && (
              <button
                onClick={handleEndGameToLobby}
                className="text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest border bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20 transition"
                title="End this game and return everyone to the waiting room"
              >
                End Game
              </button>
            )}
          </div>
          <div className="bg-slate-800/50 backdrop-blur p-4 rounded-xl border border-slate-700 flex items-center gap-6 max-w-md">
            <div className="text-left">
              <span className="block text-xs text-slate-400 uppercase tracking-widest font-bold">Commentary</span>
              <span className="text-indigo-300 font-medium italic">"{commentary}"</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center py-8">
        {stage === GameStage.SETUP && mode === null && (
          <ModeSelect onSelect={setMode} />
        )}

        {stage === GameStage.SETUP && mode === 'AI' && (
          <SetupForm onStart={handleGameStart} />
        )}

        {stage === GameStage.SETUP && mode === 'MULTIPLAYER' && !mpStarted && (
          <MultiplayerLobby
            onConnected={handleMultiplayerConnected}
            onConnectFailed={handleMultiplayerConnectFailed}
            onStart={handleMultiplayerStart}
            onBack={() => setMode(null)}
            initialCode={sharedRoomCode}
            resumeSession={
              mpChannelRef.current
                ? { channel: mpChannelRef.current, myId, myName, isHost, roomCode }
                : undefined
            }
            liveMembers={lobbyMembers}
            reconnectingIds={reconnectingIds}
          />
        )}

        {stage === GameStage.PICKING && (
          <div className="w-full max-w-5xl flex flex-col items-center">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold mb-4 text-white uppercase tracking-wider">
                {players[currentPlayerIdx]?.isAI
                  ? "AI is picking..."
                  : mode === 'MULTIPLAYER' && players[currentPlayerIdx]?.id !== myId
                    ? `${players[currentPlayerIdx]?.name || 'Player'} is picking...`
                    : "Pick your 4 cards"}
              </h3>
              <div className="flex justify-center gap-2 mb-4">
                {players.map((p, i) => (
                  <div 
                    key={p.id} 
                    className={`h-2 w-16 rounded-full transition-all duration-500 ${
                      i === currentPlayerIdx ? 'bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]' : 'bg-slate-700'
                    } ${i === currentPlayerIdx && p.isAI ? 'animate-pulse' : ''} ${p.hasLeft ? 'bg-slate-700/40' : p.isOut ? 'bg-green-500' : ''}`} 
                  />
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-4 justify-items-center mb-12">
              {cards.map((card, idx) => (
                <div key={card.id} className={card.isPicked ? "opacity-0 scale-90 transition-all duration-500 pointer-events-none" : ""}>
                  <CardComponent
                    isFaceDown={true}
                    onClick={() => handleCardClick(idx)}
                    disabled={card.isPicked || players[currentPlayerIdx]?.isAI || (mode === 'MULTIPLAYER' && players[currentPlayerIdx]?.id !== myId)}
                  />
                </div>
              ))}
            </div>

            <div className={`w-full max-w-md bg-slate-800/30 p-4 sm:p-6 rounded-2xl border border-slate-700/50 relative transition-all ${players[currentPlayerIdx]?.id === myId ? 'ring-2 ring-indigo-500/20' : ''}`}>
               <h4 className="text-center text-slate-400 font-bold uppercase text-xs tracking-widest mb-4">Your Progress</h4>
               <div className="flex justify-center gap-2">
                 {[0, 1, 2, 3].map((slotIdx) => {
                   const cardValue = humanPlayer?.cards[slotIdx];
                   return (
                     <div key={slotIdx}>
                        {cardValue !== undefined ? (
                          <CardComponent value={cardValue} isFaceDown={false} disabled />
                        ) : (
                          <div className="w-16 h-24 sm:w-20 sm:h-28 md:w-24 md:h-36 border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center text-slate-700 font-bold text-xl sm:text-2xl">
                            {slotIdx + 1}
                          </div>
                        )}
                     </div>
                   );
                 })}
               </div>
            </div>
          </div>
        )}

        {stage === GameStage.PASSING && (
          <div className="w-full max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4 h-fit">
                {players.map((p, idx) => {
                  if (p.id === myId) return null;
                  const isAIThinking = stage === GameStage.PASSING && currentPlayerIdx === idx && p.isAI && !p.isOut;
                  const won = p.isOut && !p.hasLeft; // matched 4-of-a-kind this round
                  return (
                    <div 
                      key={p.id}
                      className={`p-6 rounded-2xl border transition-all relative overflow-hidden ${
                        won
                          ? 'winner-aura bg-slate-800 border-none' 
                          : p.hasLeft ? 'bg-slate-800/40 border-slate-700/60 opacity-60'
                          : isAIThinking ? 'ai-active-glow bg-slate-800 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.2)]' : 'bg-slate-800 border-slate-700 shadow-xl'
                      }`}
                    >
                      {won && <div className="winner-aura-inner"></div>}
                      {isAIThinking && <div className="ai-processing-line"></div>}
                      <div className="flex justify-between items-center mb-4 relative z-10">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${won ? 'bg-yellow-400 animate-ping' : p.hasLeft ? 'bg-slate-600' : isAIThinking ? 'bg-indigo-400 animate-pulse' : 'bg-green-500 animate-pulse'}`}></div>
                          <span className={`font-bold text-lg ${isAIThinking ? 'text-indigo-300 font-brand' : ''}`}>{p.name}</span>
                        </div>
                        {won ? (
                          <span className="bg-yellow-400 text-slate-950 px-3 py-1 rounded text-xs font-black uppercase tracking-tighter">
                            RANKED #{p.rank}
                          </span>
                        ) : p.hasLeft ? (
                          <span className="bg-slate-700 text-slate-400 px-3 py-1 rounded text-xs font-black uppercase tracking-tighter">
                            Left
                          </span>
                        ) : (
                          <span className={`text-xs font-bold uppercase tracking-widest ${isAIThinking ? 'text-indigo-400 animate-pulse' : 'text-slate-500'}`}>
                            {isAIThinking ? 'Thinking...' : 'In Game'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 relative z-10">
                        {p.cards.map((_, cIdx) => (
                          <div 
                            key={cIdx} 
                            style={{ animationDelay: `${cIdx * 0.2}s` }}
                            className={`w-10 h-14 border rounded-lg flex items-center justify-center transition-all animate-milanti-card ${won ? 'bg-yellow-400/20 border-yellow-400/50 scale-110 shadow-[0_0_15px_rgba(250,204,21,0.4)]' : p.hasLeft ? 'bg-slate-800/40 border-slate-700/40' : isAIThinking ? 'bg-indigo-900/40 border-indigo-400/40 shadow-[0_0_15px_rgba(129,140,248,0.2)]' : 'bg-indigo-950 border-indigo-500/20'}`}
                          >
                             <div className={`w-6 h-8 border rounded flex items-center justify-center ${won ? 'border-yellow-400/30' : p.hasLeft ? 'border-slate-700/40' : isAIThinking ? 'border-indigo-400/30' : 'border-indigo-500/10'}`}>
                                <span className={`${won ? 'text-yellow-400' : p.hasLeft ? 'text-slate-600' : isAIThinking ? 'text-indigo-400/50' : 'text-indigo-500/20'} text-xs font-black`}>
                                   {won ? '✓' : p.hasLeft ? '—' : '?'}
                                </span>
                             </div>
                          </div>
                        ))}
                      </div>
                      {won && (
                        <>
                           <div className="floating-sparkle" style={{ left: '20%', bottom: '20%', animationDelay: '0.2s' }}></div>
                           <div className="floating-sparkle" style={{ left: '80%', bottom: '40%', animationDelay: '0.8s' }}></div>
                           <div className="floating-sparkle" style={{ left: '50%', bottom: '10%', animationDelay: '0.5s' }}></div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div 
                className={`lg:col-span-5 p-4 sm:p-6 md:p-8 rounded-[2rem] shadow-2xl h-fit sticky top-8 transition-all relative overflow-hidden ${
                  humanPlayer?.isOut 
                    ? 'winner-aura bg-slate-800 border-none' 
                    : myIdx === currentPlayerIdx 
                      ? 'bg-slate-800 border-2 border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.35)]' 
                      : 'bg-slate-800 border border-slate-700 shadow-xl'
                }`}
              >
                {humanPlayer?.isOut && <div className="winner-aura-inner"></div>}

                <div className="flex justify-between items-center mb-8 relative z-10">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${humanPlayer?.isOut ? 'bg-yellow-400 animate-ping' : myIdx === currentPlayerIdx ? 'bg-indigo-400 animate-pulse' : 'bg-green-500 animate-pulse'}`}></div>
                    <h3 className="text-2xl font-brand text-white">{humanPlayer?.name || 'Your Hand'}</h3>
                  </div>
                  {humanPlayer?.isOut ? (
                    <span className="bg-yellow-400 text-slate-950 px-4 py-1.5 rounded-full text-xs font-black animate-bounce shadow-lg shadow-yellow-400/20 uppercase">
                      MATCHED! RANKED #{humanPlayer?.rank}
                    </span>
                  ) : (
                    <span className={`text-xs font-bold uppercase tracking-widest ${myIdx === currentPlayerIdx ? 'text-indigo-400 animate-pulse' : 'text-slate-500'}`}>
                      {myIdx === currentPlayerIdx ? 'Your Turn' : 'Waiting...'}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-10 min-h-[160px] relative z-10">
                  {humanPlayer?.cards.map((val, idx) => (
                    <div 
                      key={idx} 
                      className={`animate-milanti-card rounded-xl transition-all duration-500 ${
                        humanPlayer?.isOut 
                          ? 'scale-110 ring-4 ring-yellow-400 shadow-[0_0_25px_rgba(250,204,21,0.6)]' 
                          : ''
                      }`}
                      style={{ animationDelay: `${idx * 0.3}s` }}
                    >
                      <CardComponent
                        value={val}
                        isFaceDown={false}
                        isSelected={selectedCardIdx === idx}
                        onClick={() => { if (!humanPlayer?.isOut && myIdx === currentPlayerIdx) setSelectedCardIdx(idx); }}
                      />
                    </div>
                  ))}
                </div>

                {!humanPlayer?.isOut ? (
                  myIdx !== currentPlayerIdx ? (
                    <div className="text-center p-5 bg-indigo-950/40 border border-indigo-500/20 rounded-2xl text-indigo-300 font-bold relative z-10 animate-pulse flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                      Waiting for {players[currentPlayerIdx]?.name}...
                    </div>
                  ) : (
                    <button
                      onClick={handlePassClick}
                      disabled={selectedCardIdx === null}
                      className={`w-full py-5 rounded-2xl font-black text-xl transition-all uppercase tracking-widest relative z-10 ${
                        selectedCardIdx !== null 
                          ? 'bg-yellow-400 hover:bg-yellow-300 text-slate-950 shadow-[0_10px_20px_rgba(234,179,8,0.3)] transform hover:-translate-y-1' 
                          : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {selectedCardIdx !== null ? 'Pass Selected Card' : 'Select a Card to Pass'}
                    </button>
                  )
                ) : (
                  <div className="text-center p-6 bg-slate-900/50 rounded-2xl border border-slate-700 text-slate-400 font-medium relative z-10">
                    {mode === 'MULTIPLAYER' ? 'Matched! Waiting for other players...' : 'Matched! Waiting for AI bots...'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {stage === GameStage.ROUND_OVER && (
          <div className="max-w-xl w-full bg-slate-800 rounded-3xl border border-slate-700 p-6 sm:p-8 shadow-2xl">
            <h2 className="text-3xl sm:text-4xl font-brand text-center mb-1 text-yellow-400">Round {totalRounds} Result</h2>
            <p className="text-center text-slate-400 text-sm mb-6">First to match win big, last two get zero!</p>
            <div className="space-y-4 mb-8">
              {sortedPlayersByScore.map((p, idx) => (
                <div key={p.id} className={`flex items-center justify-between p-4 rounded-2xl ${idx === 0 && p.score > 0 ? 'bg-yellow-500/10 border-2 border-yellow-500/30' : 'bg-slate-900/50'}`}>
                  <div className="flex items-center gap-3 sm:gap-4">
                    <span className={`w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 flex items-center justify-center rounded-full font-black ${idx === 0 && p.score > 0 ? 'bg-yellow-500 text-slate-900' : 'bg-slate-700 text-white'}`}>
                      {p.rank ? `#${p.rank}` : idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-lg sm:text-xl block">{p.name}</span>
                      {p.rank ? (
                        <span className="text-[10px] sm:text-xs text-emerald-400 font-semibold">Matched 4 cards</span>
                      ) : (
                        <span className="text-[10px] sm:text-xs text-rose-400/80 font-medium">Last 2 (0 pts)</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-2xl sm:text-3xl font-brand ${idx === 0 && p.score > 0 ? 'text-yellow-400' : p.score > 0 ? 'text-white' : 'text-slate-500'}`}>
                      {p.score} pts
                    </span>
                    {totalRounds > 1 && (
                      <span className="block text-[10px] sm:text-xs text-slate-400 font-medium">Total: {p.totalScore || 0} pts</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {mode === 'MULTIPLAYER' && !isHost ? (
              <div className="text-center p-5 bg-indigo-950/40 border border-indigo-500/20 rounded-2xl text-indigo-300 font-bold animate-pulse">
                {mpGameStopped ? 'A player left the room. Waiting for the host...' : 'Waiting for the host to continue...'}
              </div>
            ) : mpGameStopped ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={handleReturnToLobby} className="py-3 sm:py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition shadow-lg">New Game</button>
                <button onClick={() => setStage(GameStage.GAME_OVER)} className="py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition shadow-lg">End Game</button>
              </div>
            ) : (() => {
              const nextRoundRoster = players.filter(p => !p.hasLeft);
              const canContinue = mode !== 'MULTIPLAYER' || nextRoundRoster.length >= 3;
              return (
                <div className="space-y-3">
                  {mode === 'MULTIPLAYER' && !canContinue && (
                    <p className="text-center text-xs text-rose-400 font-semibold">
                      Not enough players left to start another round.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      onClick={() => startNewRound(nextRoundRoster)}
                      disabled={!canContinue}
                      className={`py-3 sm:py-4 font-bold rounded-xl transition shadow-lg ${
                        canContinue ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                      }`}
                    >
                      Next Round
                    </button>
                    <button onClick={() => setStage(GameStage.GAME_OVER)} className="py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition shadow-lg">End Game</button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {stage === GameStage.GAME_OVER && (
          <div className="max-w-2xl w-full bg-slate-900 rounded-[40px] p-6 sm:p-12 text-center border-4 border-indigo-500 shadow-2xl">
             <h2 className="text-4xl sm:text-5xl font-logo mb-2 text-white uppercase tracking-tighter">The Winner</h2>
             <p className="text-slate-400 text-sm mb-8">Overall tournament results after {totalRounds} round{totalRounds > 1 ? 's' : ''}</p>
             <div className="space-y-4 mb-8 sm:mb-12 text-left">
                {sortedPlayersByTotalScore.map((p, idx) => (
                  <div key={p.id} className={`flex items-center justify-between p-4 sm:p-6 rounded-2xl ${idx === 0 && (p.totalScore ?? p.score) > 0 ? 'bg-yellow-400/10 border-2 border-yellow-400' : 'bg-slate-800'}`}>
                    <div className="flex items-center gap-3 sm:gap-4">
                      <span className={`w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 flex items-center justify-center rounded-full font-black ${idx === 0 && (p.totalScore ?? p.score) > 0 ? 'bg-yellow-500 text-slate-900' : 'bg-slate-700 text-white'}`}>
                        {idx + 1}
                      </span>
                      <span className="text-lg sm:text-xl font-bold">{p.name}</span>
                    </div>
                    <span className="text-2xl sm:text-3xl font-brand text-indigo-400">{(p.totalScore ?? p.score)} pts</span>
                  </div>
                ))}
             </div>
             <button onClick={resetToSetup} className="w-full sm:w-auto px-8 sm:px-12 py-4 sm:py-5 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black text-xl rounded-2xl transition shadow-xl">New Game</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;