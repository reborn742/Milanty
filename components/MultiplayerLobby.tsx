import React, { useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { isMultiplayerConfigured } from '../services/supabaseClient';
import {
  generatePlayerId,
  generateRoomCode,
  openRoomChannel,
  subscribeAndTrack,
  onPresenceSync,
  getPresenceList,
  closeRoomChannel,
  PresenceMember,
} from '../services/roomService';

interface ResumeSession {
  channel: RealtimeChannel;
  myId: string;
  myName: string;
  isHost: boolean;
  roomCode: string;
}

interface MultiplayerLobbyProps {
  onConnected: (channel: RealtimeChannel, myId: string, myName: string, isHost: boolean, roomCode: string) => void;
  onConnectFailed: () => void;
  onStart: (members: PresenceMember[]) => void;
  onBack: () => void;
  initialCode?: string;
  resumeSession?: ResumeSession;
  liveMembers?: PresenceMember[];
  reconnectingIds?: Set<string>;
}

type View = 'CHOOSE' | 'CREATE_NAME' | 'JOIN_FORM' | 'CONNECTING' | 'WAITING';

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({ onConnected, onConnectFailed, onStart, onBack, initialCode, resumeSession, liveMembers, reconnectingIds }) => {
  const [view, setView] = useState<View>(resumeSession ? 'WAITING' : initialCode ? 'JOIN_FORM' : 'CHOOSE');
  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState(initialCode ? initialCode.toUpperCase() : '');
  const [roomCode, setRoomCode] = useState(resumeSession?.roomCode || '');
  const [isHost, setIsHost] = useState(resumeSession?.isHost || false);
  const [members, setMembers] = useState<PresenceMember[]>(resumeSession ? getPresenceList(resumeSession.channel) : []);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // The App-level member list is grace-period protected against transient
  // presence blips; this component's own local copy (seeded below, kept only
  // as a fallback) is not, so prefer the protected one whenever it's available.
  const displayedMembers = liveMembers ?? members;

  if (!isMultiplayerConfigured) {
    return (
      <div className="max-w-md w-full mx-auto bg-slate-800 p-8 rounded-[2.5rem] shadow-2xl border border-slate-700 text-center">
        <h2 className="text-2xl font-brand text-yellow-400 mb-3">Multiplayer isn't set up yet</h2>
        <p className="text-slate-400 text-sm mb-6">
          Add <code className="text-indigo-300">SUPABASE_URL</code> and <code className="text-indigo-300">SUPABASE_ANON_KEY</code> to your <code className="text-indigo-300">.env.local</code> (and enable Realtime on your Supabase project) to play with other people.
        </p>
        <button onClick={onBack} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition">Back</button>
      </div>
    );
  }

  const connect = (code: string, playerName: string, asHost: boolean) => {
    setError('');
    setView('CONNECTING');
    const myId = generatePlayerId();
    let opened: RealtimeChannel | null = null;
    try {
      opened = openRoomChannel(code, myId, playerName);

      onPresenceSync(opened, (list) => setMembers(list));

      // Hand the channel to the parent BEFORE subscribing, so it can register its
      // own listeners (game actions, chat, state, presence-leave). Supabase forbids
      // adding .on() bindings to a channel after subscribe() has been called.
      onConnected(opened, myId, playerName, asHost, code);
    } catch (e) {
      // Setup threw before we even subscribed - show an error rather than
      // leaving the screen stuck on "Connecting to room...".
      closeRoomChannel(opened);
      onConnectFailed();
      setError('Could not connect to the room. Please try again.');
      setView(asHost ? 'CREATE_NAME' : 'JOIN_FORM');
      return;
    }
    const channel = opened as RealtimeChannel;

    subscribeAndTrack(
      channel,
      myId,
      playerName,
      () => {
        // The room's member count is only knowable once presence has
        // synced, which is after we've already joined it - so a full room
        // is caught here and we leave immediately rather than let a game
        // start with more players than the deck (10 values) can support.
        const currentMembers = getPresenceList(channel);
        if (currentMembers.length > MAX_PLAYERS) {
          closeRoomChannel(channel);
          onConnectFailed();
          setError(`That room is already full (max ${MAX_PLAYERS} players).`);
          setView(asHost ? 'CREATE_NAME' : 'JOIN_FORM');
          return;
        }
        setRoomCode(code);
        setIsHost(asHost);
        setMembers(currentMembers);
        setView('WAITING');
      },
      (reason) => {
        closeRoomChannel(channel);
        onConnectFailed();
        setError(reason);
        setView(asHost ? 'CREATE_NAME' : 'JOIN_FORM');
      }
    );
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    connect(generateRoomCode(), name.trim(), true);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (codeInput.trim().length < 4) {
      setError('Enter the room code your host shared with you.');
      return;
    }
    connect(codeInput.trim().toUpperCase(), name.trim(), false);
  };

  const roomLink = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  const [linkCopied, setLinkCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard?.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(roomLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    });
  };

  const shareMessage = `Join my Milanty room — code ${roomCode}: ${roomLink}`;

  const shareToWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, '_blank', 'noopener,noreferrer');
  };

  const shareToMessenger = () => {
    // Deep link opens the Messenger app on mobile if installed; falls back to
    // copying the link so it can still be pasted into a Messenger chat.
    const deepLink = `fb-messenger://share/?link=${encodeURIComponent(roomLink)}`;
    const fallbackTimer = setTimeout(() => copyLink(), 800);
    window.addEventListener('blur', () => clearTimeout(fallbackTimer), { once: true });
    window.location.href = deepLink;
  };

  const shareToTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(roomLink)}&text=${encodeURIComponent(`Join my Milanty room — code ${roomCode}`)}`, '_blank', 'noopener,noreferrer');
  };

  const shareToTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}`, '_blank', 'noopener,noreferrer');
  };

  const shareToInstagram = () => {
    // Instagram has no web intent for pre-filled DM text, so we open the app
    // (if installed) and fall back to copying the link to paste into a chat.
    const deepLink = `instagram://direct-inbox`;
    const fallbackTimer = setTimeout(() => copyLink(), 800);
    window.addEventListener('blur', () => clearTimeout(fallbackTimer), { once: true });
    window.location.href = deepLink;
  };

  if (view === 'CHOOSE') {
    return (
      <div className="max-w-md w-full mx-auto bg-slate-800 p-6 sm:p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-slate-700 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-600/20 rounded-full blur-3xl"></div>
        <h1 className="text-3xl sm:text-4xl font-logo text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-indigo-500 tracking-wider uppercase relative z-10">Multiplayer</h1>
        <p className="text-center text-slate-400 text-sm mb-10 relative z-10">Play Milanty live with friends in a room</p>
        <div className="space-y-4 relative z-10">
          <button
            onClick={() => setView('CREATE_NAME')}
            className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl text-xl uppercase tracking-widest border-b-4 border-indigo-800 active:scale-95"
          >
            Create Room
          </button>
          <button
            onClick={() => setView('JOIN_FORM')}
            className="w-full py-6 bg-slate-700 hover:bg-slate-600 text-white font-black rounded-2xl transition-all shadow-xl text-xl uppercase tracking-widest border-b-4 border-slate-900 active:scale-95"
          >
            Join Room
          </button>
          <button onClick={onBack} className="w-full py-3 text-slate-500 hover:text-slate-300 font-semibold text-sm transition">
            Back
          </button>
        </div>
      </div>
    );
  }

  if (view === 'CREATE_NAME' || view === 'JOIN_FORM') {
    const isCreate = view === 'CREATE_NAME';
    return (
      <div className="max-w-md w-full mx-auto bg-slate-800 p-6 sm:p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-slate-700">
        <h2 className="text-2xl sm:text-3xl font-brand text-center mb-8 text-white">{isCreate ? 'Create a Room' : 'Join a Room'}</h2>
        <form onSubmit={isCreate ? handleCreateSubmit : handleJoinSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold mb-3 uppercase tracking-widest text-slate-400">Your Name</label>
            <input
              autoFocus
              required
              type="text"
              maxLength={20}
              className="w-full px-6 py-4 bg-slate-900 border-2 border-slate-700 rounded-2xl focus:border-indigo-400 outline-none transition-all text-lg text-white font-medium"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name..."
            />
          </div>
          {!isCreate && (
            <div>
              <label className="block text-xs font-semibold mb-3 uppercase tracking-widest text-slate-400">Room Code</label>
              <input
                required
                type="text"
                maxLength={6}
                className="w-full px-6 py-4 bg-slate-900 border-2 border-slate-700 rounded-2xl focus:border-indigo-400 outline-none transition-all text-lg text-white font-medium tracking-[0.3em] uppercase text-center"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="ABCDE"
              />
            </div>
          )}
          {error && <p className="text-rose-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl text-lg uppercase tracking-widest border-b-4 border-indigo-800 active:scale-95"
          >
            {isCreate ? 'Create & Continue' : 'Join'}
          </button>
          <button type="button" onClick={() => setView('CHOOSE')} className="w-full py-2 text-slate-500 hover:text-slate-300 font-semibold text-sm transition">
            Back
          </button>
        </form>
      </div>
    );
  }

  if (view === 'CONNECTING') {
    return (
      <div className="text-center text-slate-400">
        <p className="text-lg font-bold animate-pulse">Connecting to room...</p>
      </div>
    );
  }

  // WAITING room
  const canStart = isHost && displayedMembers.length >= MIN_PLAYERS;
  return (
    <div className="max-w-lg w-full mx-auto bg-slate-800 p-6 sm:p-8 md:p-10 rounded-[2.5rem] shadow-2xl border border-slate-700">
      <div className="text-center mb-8">
        <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-2">Room Code</p>
        <button
          onClick={copyCode}
          className="text-4xl sm:text-5xl font-logo tracking-[0.3em] text-yellow-400 hover:text-yellow-300 transition-colors"
          title="Click to copy"
        >
          {roomCode}
        </button>
        <p className="text-xs text-slate-500 mt-2">{copied ? 'Copied!' : 'Tap the code to copy and share it'}</p>
        <div className="flex gap-2 justify-center mt-4 flex-wrap">
          <button
            onClick={shareToWhatsApp}
            title="Share via WhatsApp"
            className="w-11 h-11 flex items-center justify-center bg-[#25D366] hover:brightness-110 text-white rounded-full transition shadow-lg"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12.001 2C6.478 2 2 6.478 2 12c0 1.98.578 3.827 1.578 5.382L2 22l4.735-1.545A9.953 9.953 0 0 0 12 22c5.523 0 10-4.478 10-10S17.523 2 12 2zm0 18.2a8.17 8.17 0 0 1-4.166-1.14l-.299-.177-3.107 1.014 1.032-3.02-.194-.31A8.19 8.19 0 0 1 3.8 12C3.8 7.47 7.47 3.8 12 3.8c4.53 0 8.2 3.67 8.2 8.2s-3.67 8.2-8.199 8.2z"/>
            </svg>
          </button>
          <button
            onClick={shareToMessenger}
            title="Share via Messenger"
            className="w-11 h-11 flex items-center justify-center bg-gradient-to-tr from-[#00B2FF] via-[#5462EB] to-[#A93EFA] hover:brightness-110 text-white rounded-full transition shadow-lg"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.9 1.436 5.49 3.68 7.181V22l3.363-1.846c.897.248 1.85.382 2.957.382 5.523 0 10-4.145 10-9.293C22 6.145 17.523 2 12 2zm1.008 12.502-2.55-2.72-4.977 2.72 5.475-5.815 2.612 2.72 4.916-2.72-5.476 5.815z"/>
            </svg>
          </button>
          <button
            onClick={shareToInstagram}
            title="Share via Instagram"
            className="w-11 h-11 flex items-center justify-center bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] hover:brightness-110 text-white rounded-full transition shadow-lg"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.98-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 9.837a3.837 3.837 0 1 1 0-7.674 3.837 3.837 0 0 1 0 7.674zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
            </svg>
          </button>
          <button
            onClick={shareToTelegram}
            title="Share via Telegram"
            className="w-11 h-11 flex items-center justify-center bg-[#26A5E4] hover:brightness-110 text-white rounded-full transition shadow-lg"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M21.198 2.433a2.242 2.242 0 0 0-1.022.215l-16.5 6.9c-1.28.535-1.272 1.283-.234 1.622l4.146 1.293 1.598 4.964c.192.593.088.826.723.826.487 0 .703-.223 1.014-.508l1.917-1.86 4.146 3.06c.763.42 1.31.203 1.5-.706l2.718-12.802c.29-1.153-.437-1.673-1.006-1.804z"/>
            </svg>
          </button>
          <button
            onClick={shareToTwitter}
            title="Share via X (Twitter)"
            className="w-11 h-11 flex items-center justify-center bg-black hover:brightness-125 text-white rounded-full transition shadow-lg border border-slate-700"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-3 mb-8">
        <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-3">
          Players ({displayedMembers.length}/{MAX_PLAYERS})
        </p>
        {displayedMembers.map((m) => {
          const reconnecting = reconnectingIds?.has(m.id);
          return (
            <div key={m.id} className="flex items-center gap-3 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3">
              <div className={`w-2.5 h-2.5 rounded-full ${reconnecting ? 'bg-amber-400 animate-ping' : 'bg-emerald-500 animate-pulse'}`}></div>
              <span className="font-bold text-white">{m.name}</span>
              {reconnecting && <span className="text-xs text-amber-400 font-semibold ml-auto">Reconnecting...</span>}
            </div>
          );
        })}
      </div>

      {isHost ? (
        <>
          <button
            onClick={() => onStart(displayedMembers)}
            disabled={!canStart}
            className={`w-full py-5 rounded-2xl font-black text-lg uppercase tracking-widest transition-all ${
              canStart
                ? 'bg-yellow-400 hover:bg-yellow-300 text-slate-950 shadow-[0_10px_20px_rgba(234,179,8,0.3)]'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            {canStart ? 'Start Game' : `Waiting for players (min ${MIN_PLAYERS})`}
          </button>
          {displayedMembers.length >= MAX_PLAYERS && (
            <p className="text-center text-xs text-slate-500 mt-3">Room is full.</p>
          )}
        </>
      ) : (
        <div className="text-center p-5 bg-indigo-950/40 border border-indigo-500/20 rounded-2xl text-indigo-300 font-bold animate-pulse">
          Waiting for the host to start the game...
        </div>
      )}
    </div>
  );
};
