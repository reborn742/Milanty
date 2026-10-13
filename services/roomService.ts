import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { ChatMessage } from '../types';

// Room codes avoid ambiguous characters (0/O, 1/I/L).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const generateRoomCode = (): string => {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
};

export const generatePlayerId = (): string => {
  return `p-${Math.random().toString(36).slice(2, 10)}`;
};

export interface PresenceMember {
  id: string;
  name: string;
  joinedAt: number;
}

export type RoomAction =
  | { type: 'PICK'; playerId: string; cardIdx: number }
  | { type: 'PASS'; playerId: string; cardIdx: number };

const channelName = (code: string) => `milanty-room-${code.toUpperCase()}`;

export const openRoomChannel = (code: string, myId: string, myName: string): RealtimeChannel => {
  if (!supabase) throw new Error('Multiplayer is not configured.');
  // supabase.channel() returns the *existing* channel object when one with the
  // same topic is still registered on the client - even one we already
  // unsubscribed. Re-using it makes .on() throw ("cannot add presence
  // callbacks after subscribe()") and the join hangs on "Connecting...", which
  // is what happened when someone retried a room code after a failed attempt
  // or re-joined a room they had left. Always start from a fresh channel.
  const topic = `realtime:${channelName(code)}`;
  supabase.getChannels().filter((c) => c.topic === topic).forEach((c) => {
    Promise.resolve(supabase!.removeChannel(c)).catch(() => {});
  });
  return supabase.channel(channelName(code), {
    config: {
      presence: { key: myId },
      broadcast: { self: false, ack: true },
    },
  });
};

export const subscribeAndTrack = (
  channel: RealtimeChannel,
  myId: string,
  myName: string,
  onReady?: () => void,
  onError?: (reason: string) => void
) => {
  let settled = false;
  let joined = false;
  const joinedAt = Date.now();

  // channel.track() resolves to 'ok' | 'timed out' | 'error' - it does not
  // throw - so a failed announce used to be treated as success: the player
  // landed in the waiting room but was never visible to anyone else, and the
  // host could not see them or start with them. Retry briefly and only
  // report success on a real 'ok'.
  const trackSelf = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await channel.track({ id: myId, name: myName, joinedAt } as PresenceMember);
        if (res === 'ok') return true;
      } catch (e) {
        // fall through and retry
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
    return false;
  };

  const timeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    onError?.('Connection timed out. Check your internet connection and try again.');
  }, 10000);

  channel.subscribe(async (status, err) => {
    if (status === 'SUBSCRIBED') {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        if (await trackSelf()) {
          joined = true;
          onReady?.();
        } else {
          onError?.('Could not join the room. Please try again.');
        }
      } else if (joined) {
        // The connection dropped and supabase-js re-joined the channel on its
        // own. The server forgot our presence when the old connection died,
        // so announce ourselves again - otherwise everyone else sees us leave
        // and we never come back, even though we are still playing.
        void trackSelf();
      }
      return;
    }

    if (settled) return;

    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      settled = true;
      clearTimeout(timeoutId);
      onError?.(
        status === 'CHANNEL_ERROR'
          ? 'Could not connect to the room server. Double-check your Supabase URL/key and that Realtime is enabled, then try again.'
          : status === 'TIMED_OUT'
            ? 'Connection timed out. Check your internet connection and try again.'
            : 'Connection closed unexpectedly. Please try again.'
      );
    }
  });
};

export const getPresenceList = (channel: RealtimeChannel): PresenceMember[] => {
  const state = channel.presenceState<PresenceMember>();
  const members = Object.values(state)
    .map((entries) => entries[0])
    .filter(Boolean) as unknown as PresenceMember[];
  return members.sort((a, b) => a.joinedAt - b.joinedAt);
};

export const onPresenceSync = (channel: RealtimeChannel, cb: (members: PresenceMember[]) => void) => {
  channel.on('presence', { event: 'sync' }, () => {
    cb(getPresenceList(channel));
  });
};

export const onPresenceLeave = (channel: RealtimeChannel, cb: (playerId: string) => void) => {
  channel.on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
    cb(key);
  });
};

export const sendAction = (channel: RealtimeChannel, action: RoomAction) => {
  channel.send({ type: 'broadcast', event: 'action', payload: action });
};

export const onAction = (channel: RealtimeChannel, cb: (action: RoomAction) => void) => {
  channel.on('broadcast', { event: 'action' }, ({ payload }) => cb(payload as RoomAction));
};

export const sendState = (channel: RealtimeChannel, state: unknown) => {
  channel.send({ type: 'broadcast', event: 'state', payload: state });
};

export const onState = (channel: RealtimeChannel, cb: (state: any) => void) => {
  channel.on('broadcast', { event: 'state' }, ({ payload }) => cb(payload));
};

// --- Room chat (text, emoji, and photo messages) ---
// Uses the same broadcast pattern as sendAction/onAction above, on its own
// 'chat' event so it never interferes with game-state or action messages.
export const sendChatMessage = (channel: RealtimeChannel, message: ChatMessage) => {
  channel.send({ type: 'broadcast', event: 'chat', payload: message });
};

export const onChatMessage = (channel: RealtimeChannel, cb: (message: ChatMessage) => void) => {
  channel.on('broadcast', { event: 'chat' }, ({ payload }) => cb(payload as ChatMessage));
};

export const closeRoomChannel = (channel: RealtimeChannel | null) => {
  if (!channel) return;
  channel.untrack();
  // removeChannel unsubscribes AND drops the channel from the client's list;
  // a bare unsubscribe() leaves a dead channel registered under the same
  // topic, which then gets handed back on the next join of that room.
  if (supabase) {
    Promise.resolve(supabase.removeChannel(channel)).catch(() => {});
  } else {
    channel.unsubscribe();
  }
};
