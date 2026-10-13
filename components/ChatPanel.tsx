import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  myId: string;
  onSendText: (text: string) => void;
  onSendImage: (dataUrl: string) => void;
}

// Small, familiar emoji set — kept short so the picker stays fast on mobile.
const EMOJIS = [
  '😀', '😂', '😅', '😉', '😍', '😎', '🤔', '😮', '😢', '😭',
  '😡', '🥳', '👍', '👎', '👏', '🙌', '🙏', '💪', '🔥', '💯',
  '🎉', '❤️', '😴', '🤝', '🃏', '♠️', '♥️', '♦️', '♣️', '🏆',
];

// Photos are sent as base64 over the realtime channel (no storage backend),
// so every image is downscaled + compressed client-side before sending to
// keep broadcast payloads small and fast for everyone in the room.
const MAX_IMAGE_DIMENSION = 480;
const IMAGE_QUALITY = 0.6;
const MAX_DATA_URL_LENGTH = 300000; // ~225KB, safety cap after compression

const fileToCompressedDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > MAX_IMAGE_DIMENSION) {
          height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
          width = MAX_IMAGE_DIMENSION;
        } else if (height > MAX_IMAGE_DIMENSION) {
          width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
          height = MAX_IMAGE_DIMENSION;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
};

const formatTime = (ts: number) => {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, myId, onSendText, onSendImage }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [unread, setUnread] = useState(0);
  const [imageError, setImageError] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastCountRef = useRef(0);

  const bottomAvatarColors = useMemo(
    () => ['bg-indigo-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-fuchsia-500', 'bg-cyan-500'],
    []
  );
  const colorForSender = (senderId: string) => {
    let hash = 0;
    for (let i = 0; i < senderId.length; i++) hash = (hash * 31 + senderId.charCodeAt(i)) >>> 0;
    return bottomAvatarColors[hash % bottomAvatarColors.length];
  };

  // Track unread count while the panel is closed.
  useEffect(() => {
    if (messages.length > lastCountRef.current) {
      if (!isOpen) {
        setUnread((u) => u + (messages.length - lastCountRef.current));
      }
      lastCountRef.current = messages.length;
    }
  }, [messages.length, isOpen]);

  useEffect(() => {
    if (isOpen) setUnread(0);
  }, [isOpen]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSendText = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setDraft('');
    setShowEmoji(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendText();
    }
  };

  const handlePickEmoji = (emoji: string) => {
    setDraft((d) => d + emoji);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageError('Please choose an image file.');
      return;
    }
    setImageError('');
    setIsProcessingImage(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      if (dataUrl.length > MAX_DATA_URL_LENGTH) {
        setImageError('That photo is too large — try a smaller one.');
      } else {
        onSendImage(dataUrl);
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Could not send that photo.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-[90] w-16 h-16 bg-indigo-600 hover:bg-indigo-500 rounded-2xl shadow-2xl border-b-4 border-indigo-800 active:translate-y-0.5 active:border-b-0 transition-all flex items-center justify-center"
        title={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 5.94 2 10.8c0 2.76 1.44 5.22 3.7 6.84-.13 1.13-.5 2.4-1.4 3.6-.15.2 0 .5.26.46 1.86-.28 3.4-1.1 4.4-1.8.96.27 1.98.4 3.04.4 5.52 0 10-3.94 10-8.8S17.52 2 12 2z" />
          </svg>
        )}
        {!isOpen && unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 bg-rose-500 text-white text-xs font-black rounded-full flex items-center justify-center shadow-lg border-2 border-slate-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-[90] w-[calc(100vw-2rem)] max-w-sm h-[70vh] max-h-[560px] bg-slate-800 rounded-[1.75rem] border border-slate-700 shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 bg-slate-900/60 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="font-bold text-white text-lg leading-none">Room Chat</h3>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1">Only your table can see this</p>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center px-6">
                <p className="text-slate-500 text-sm font-medium">
                  No messages yet. Say hi, drop an emoji, or share a photo with the table! 👋
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.senderId === myId;
                return (
                  <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <div
                      className={`w-7 h-7 flex-shrink-0 rounded-full ${colorForSender(m.senderId)} flex items-center justify-center text-[11px] font-black text-white`}
                      title={m.senderName}
                    >
                      {m.senderName?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className={`max-w-[75%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      {!mine && (
                        <span className="text-[10px] text-slate-400 font-bold mb-0.5 px-1">{m.senderName}</span>
                      )}
                      {m.type === 'image' && m.imageData ? (
                        <img
                          src={m.imageData}
                          alt="Shared in chat"
                          className="rounded-2xl max-w-full max-h-56 object-cover border border-slate-700 shadow-lg"
                        />
                      ) : (
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm font-medium break-words whitespace-pre-wrap ${
                            mine
                              ? 'bg-indigo-600 text-white rounded-br-sm'
                              : 'bg-slate-900/70 text-slate-100 rounded-bl-sm border border-slate-700'
                          }`}
                        >
                          {m.text}
                        </div>
                      )}
                      <span className="text-[9px] text-slate-500 font-semibold mt-1 px-1">{formatTime(m.timestamp)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {imageError && (
            <p className="text-rose-400 text-xs font-semibold px-4 pb-1">{imageError}</p>
          )}

          {/* Emoji picker */}
          {showEmoji && (
            <div className="px-4 pb-2">
              <div className="grid grid-cols-8 gap-1 bg-slate-900/60 border border-slate-700 rounded-2xl p-2 max-h-32 overflow-y-auto">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handlePickEmoji(emoji)}
                    className="text-xl hover:bg-slate-700 rounded-lg py-1 transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Composer */}
          <div className="px-3 py-3 border-t border-slate-700 bg-slate-900/40 flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowEmoji((s) => !s)}
              className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center text-xl transition-colors ${
                showEmoji ? 'bg-indigo-600' : 'bg-slate-800 hover:bg-slate-700'
              }`}
              title="Emoji"
            >
              😀
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingImage}
              className="w-10 h-10 flex-shrink-0 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors disabled:opacity-50"
              title="Share a photo"
            >
              {isProcessingImage ? (
                <svg className="w-5 h-5 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </button>

            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={300}
              placeholder="Message the table..."
              className="flex-1 min-w-0 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white font-medium outline-none focus:border-indigo-400 transition-colors"
            />

            <button
              onClick={handleSendText}
              disabled={!draft.trim()}
              className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center transition-all ${
                draft.trim()
                  ? 'bg-yellow-400 hover:bg-yellow-300 text-slate-950'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
              title="Send"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
