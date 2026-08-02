'use client';

import { useEffect, useRef, useState } from 'react';
import { PhoneOff } from 'lucide-react';
import { createClient } from '../lib/supabase';

type CallRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  conversation_id: string | null;
  status: string;
  rate_per_minute: number;
  min_minutes: number;
  created_at: string;
};

type Profile = {
  username?: string;
  display_name?: string;
  avatar_url?: string;
};

const CALL_PREFIX = '__CALL_EVENT__:';

export default function OutgoingCallListener() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [outgoing, setOutgoing] = useState<CallRow | null>(null);
  const [creator, setCreator] = useState<Profile | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const outgoingIdRef = useRef<string | null>(null);
  const ringRef = useRef<{
    ctx: AudioContext;
    interval: ReturnType<typeof setInterval>;
  } | null>(null);

  const stopRingback = () => {
    if (ringRef.current) {
      clearInterval(ringRef.current.interval);
      try {
        ringRef.current.ctx.close();
      } catch {
        /* ignore */
      }
      ringRef.current = null;
    }
  };

  // Softer dual-tone ringback (different from incoming ringtone)
  const startRingback = () => {
    stopRingback();
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const tone = () => {
        const now = ctx.currentTime;
        [440, 480].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.value = 0.04;
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
          osc.stop(now + 1.15);
        });
      };
      tone();
      const interval = setInterval(tone, 2800);
      ringRef.current = { ctx, interval };
    } catch {
      /* autoplay blocked */
    }
  };

  const clearOutgoing = () => {
    stopRingback();
    outgoingIdRef.current = null;
    setOutgoing(null);
    setCreator(null);
  };

  const loadCreator = async (creatorId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', creatorId)
      .single();
    setCreator(data || null);
    return data as Profile | null;
  };

  const presentOutgoing = async (row: CallRow) => {
    setOutgoing(row);
    outgoingIdRef.current = row.id;
    await loadCreator(row.creator_id);
    startRingback();
  };

  useEffect(() => {
    let alive = true;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !alive) return;
      setUserId(user.id);
      userIdRef.current = user.id;

      const { data: pending } = await supabase
        .from('voice_calls')
        .select('*')
        .eq('subscriber_id', user.id)
        .eq('status', 'requested')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pending && alive) {
        await presentOutgoing(pending as CallRow);
      }
    };

    init();
    return () => {
      alive = false;
      stopRingback();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`outgoing-voice-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'voice_calls',
        },
        async (payload: any) => {
          const row = payload.new as CallRow;
          if (!row || row.subscriber_id !== userIdRef.current) return;
          if (row.status !== 'requested') return;
          await presentOutgoing(row);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'voice_calls',
        },
        (payload: any) => {
          const row = payload.new as CallRow;
          if (!row || row.subscriber_id !== userIdRef.current) return;
          if (
            outgoingIdRef.current &&
            row.id === outgoingIdRef.current &&
            row.status !== 'requested'
          ) {
            // Accepted → ActiveVoiceCall takes over; declined/missed/cancelled → clear
            clearOutgoing();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // 60s local safety — miss is also handled elsewhere
  useEffect(() => {
    if (!outgoing || outgoing.status !== 'requested') return;
    const created = new Date(outgoing.created_at).getTime();
    const wait = Math.max(1000, 60000 - (Date.now() - created));
    const t = setTimeout(() => clearOutgoing(), wait);
    return () => clearTimeout(t);
  }, [outgoing?.id, outgoing?.created_at, outgoing?.status]);

  const cancelCall = async () => {
    if (!outgoing || !userId || cancelling) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from('voice_calls')
        .update({ status: 'cancelled' })
        .eq('id', outgoing.id)
        .eq('subscriber_id', userId)
        .eq('status', 'requested');

      if (!error && outgoing.conversation_id) {
        const label = 'Voice call cancelled';
        await supabase.from('messages').insert({
          conversation_id: outgoing.conversation_id,
          sender_id: userId,
          content: `${CALL_PREFIX}cancelled|${label}`,
        });
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', outgoing.conversation_id);
      }
      clearOutgoing();
    } catch (e) {
      console.error(e);
    } finally {
      setCancelling(false);
    }
  };

  if (!outgoing || !creator) return null;

  const name = creator.display_name || creator.username || 'Creator';
  const initial = name.charAt(0).toUpperCase();
  const rate = Number(outgoing.rate_per_minute || 0).toFixed(2);

  return (
    <div className="fixed inset-0 z-[205] bg-zinc-950 flex flex-col items-center justify-center p-6">
      {/* Soft studio glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-pink-600/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm text-center">
        <div className="relative mx-auto w-28 h-28 mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-pink-500/40 animate-ping" />
          <div className="absolute inset-2 rounded-full border border-pink-500/20" />
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center text-3xl font-bold">
            {creator.avatar_url ? (
              <img
                src={creator.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              initial
            )}
          </div>
        </div>

        <p className="text-sm text-pink-400 font-medium mb-1 tracking-wide">
          Calling…
        </p>
        <h2 className="text-2xl font-semibold text-white mb-1">{name}</h2>
        {creator.username && (
          <p className="text-sm text-zinc-500 mb-3">@{creator.username}</p>
        )}
        <p className="text-sm text-zinc-400 mb-10">
          £{rate}/min · min {outgoing.min_minutes || 1} min
        </p>

        <button
          type="button"
          onClick={cancelCall}
          disabled={cancelling}
          className="mx-auto w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-900/40 disabled:opacity-50"
        >
          <PhoneOff size={26} />
        </button>
        <p className="text-xs text-zinc-500 mt-4">
          {cancelling ? 'Cancelling…' : 'Cancel'}
        </p>
      </div>
    </div>
  );
}
