'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, X } from 'lucide-react';
import { createClient } from '../lib/supabase';
import { createNotification } from '../lib/notifications';

type CallRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  conversation_id: string | null;
  status: string;
  rate_per_minute: number;
  min_minutes: number;
  amount_held?: number;
  created_at: string;
};

type CallerProfile = {
  username?: string;
  display_name?: string;
  avatar_url?: string;
};

const CALL_PREFIX = '__CALL_EVENT__:';

export default function IncomingCallListener() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<CallRow | null>(null);
  const [caller, setCaller] = useState<CallerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const ringRef = useRef<{
    ctx: AudioContext;
    interval: ReturnType<typeof setInterval>;
  } | null>(null);
  const userIdRef = useRef<string | null>(null);
  const incomingIdRef = useRef<string | null>(null);
  const notifRef = useRef<Notification | null>(null);

  const stopRingtone = () => {
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

  const startRingtone = () => {
    stopRingtone();
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const beep = () => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.stop(ctx.currentTime + 0.4);
      };
      beep();
      const interval = setInterval(beep, 1800);
      ringRef.current = { ctx, interval };
    } catch {
      /* autoplay blocked — overlay still shows */
    }
  };

  const closeBrowserNotif = () => {
    try {
      notifRef.current?.close();
    } catch {
      /* ignore */
    }
    notifRef.current = null;
  };

  const ensureNotifPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  };

  const showBrowserNotif = async (profile: CallerProfile | null, call: CallRow) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    // Only when tab is in the background
    if (!document.hidden) return;

    const permission = await ensureNotifPermission();
    if (permission !== 'granted') return;

    const name = profile?.display_name || profile?.username || 'Someone';
    const rate = Number(call.rate_per_minute || 0).toFixed(2);

    closeBrowserNotif();

    try {
      const n = new Notification('Incoming voice call', {
        body: `${name} · £${rate}/min`,
        tag: `voice-call-${call.id}`,
        
        requireInteraction: true,
        icon: profile?.avatar_url || '/favicon.ico',
      });
      notifRef.current = n;
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* ignore */
    }
  };

  const loadCaller = async (subscriberId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', subscriberId)
      .single();
    setCaller(data || null);
    return data as CallerProfile | null;
  };

  const insertDeclineReceipt = async (call: CallRow, creatorId: string) => {
    if (!call.conversation_id) return;
    const label = 'Voice call declined';
    const content = `${CALL_PREFIX}declined|${label}`;
    await supabase.from('messages').insert({
      conversation_id: call.conversation_id,
      sender_id: creatorId,
      content,
    });
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', call.conversation_id);
  };

  const clearIncoming = () => {
    stopRingtone();
    closeBrowserNotif();
    incomingIdRef.current = null;
    setIncoming(null);
    setCaller(null);
  };

  const presentIncoming = async (row: CallRow) => {
    // Load profile first so UI never flashes "Someone"
    const profile = await loadCaller(row.subscriber_id);
    setCaller(profile);
    setIncoming(row);
    incomingIdRef.current = row.id;
    startRingtone();
    await showBrowserNotif(profile, row);
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

      // Soft-ask permission early so background calls can notify
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          // Don't force popup on load — wait until first interaction or first call
        }
      }

      const { data: pending } = await supabase
        .from('voice_calls')
        .select('*')
        .eq('creator_id', user.id)
        .eq('status', 'requested')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pending && alive) {
        await presentIncoming(pending as CallRow);
      }
    };

    init();
    return () => {
      alive = false;
      stopRingtone();
      closeBrowserNotif();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`incoming-voice-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'voice_calls',
        },
        async (payload: any) => {
          const row = payload.new as CallRow;
          if (!row || row.creator_id !== userIdRef.current) return;
          if (row.status !== 'requested') return;
          await presentIncoming(row);
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
          if (!row || row.creator_id !== userIdRef.current) return;
          if (
            incomingIdRef.current &&
            row.id === incomingIdRef.current &&
            row.status !== 'requested'
          ) {
            clearIncoming();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // 60s UI timeout
  useEffect(() => {
    if (!incoming || incoming.status !== 'requested') return;
    const created = new Date(incoming.created_at).getTime();
    const wait = Math.max(1000, 60000 - (Date.now() - created));
    const t = setTimeout(() => clearIncoming(), wait);
    return () => clearTimeout(t);
  }, [incoming?.id, incoming?.created_at, incoming?.status]);

  // Request permission once user interacts with Accept/Decline area (browser rules)
  useEffect(() => {
    if (!incoming) return;
    ensureNotifPermission();
  }, [incoming?.id]);

  const respond = async (accept: boolean) => {
    if (!incoming || !userId || loading) return;
    setLoading(true);
    try {
      const updates: any = {
        status: accept ? 'active' : 'declined',
      };
      if (accept) {
        updates.started_at = new Date().toISOString();
        updates.livekit_room = `call-${incoming.id}`;
      }

      const { error } = await supabase
        .from('voice_calls')
        .update(updates)
        .eq('id', incoming.id)
        .eq('creator_id', userId);

      if (error) throw error;

      if (accept) {
        const { data: me } = await supabase
          .from('profiles')
          .select('display_name, username')
          .eq('id', userId)
          .single();
        const actor = me?.display_name || me?.username || 'Creator';

        await createNotification({
          userId: incoming.subscriber_id,
          actorId: userId,
          type: 'message',
          title: `${actor} accepted your call`,
          body: 'Connecting…',
          link: incoming.conversation_id
            ? `/messages/${incoming.conversation_id}`
            : '/messages',
        });

        const convoId = incoming.conversation_id;
        clearIncoming();
        if (convoId) router.push(`/messages/${convoId}`);
      } else {
        await insertDeclineReceipt(incoming, userId);
        clearIncoming();
      }
    } catch (err: any) {
      alert(err.message || 'Could not update call');
    } finally {
      setLoading(false);
    }
  };

  // Wait until caller profile is ready — avoids "Someone" flash
  if (!incoming || !caller) return null;

  const displayName = caller.display_name || caller.username || 'Fan';
  const initial = displayName.charAt(0).toUpperCase();
  const rate = Number(incoming.rate_per_minute || 0).toFixed(2);
  const minMins = incoming.min_minutes || 1;

  return (
    <div className="fixed inset-0 z-[200] bg-black/75 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-3xl p-6 shadow-2xl">
        <div className="flex justify-end mb-1">
          <button
            type="button"
            onClick={() => respond(false)}
            disabled={loading}
            className="text-zinc-500 hover:text-zinc-300 p-1"
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>
        </div>

        <div className="text-center mb-6">
          <div className="relative mx-auto w-20 h-20 mb-4">
            <div className="absolute inset-0 rounded-full bg-pink-500/20 animate-ping" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center text-2xl font-bold">
              {caller?.avatar_url ? (
                <img
                  src={caller.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                initial
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-pink-400 mb-2">
            <Phone size={18} className="animate-pulse" />
            <span className="text-sm font-medium">Incoming voice call</span>
          </div>

          <h3 className="text-xl font-semibold text-white">{displayName}</h3>
          {caller?.username && (
            <p className="text-sm text-zinc-400">@{caller.username}</p>
          )}
          <p className="text-sm text-zinc-400 mt-3">
            £{rate}/min · min {minMins} min
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => respond(false)}
            disabled={loading}
            className="py-3.5 rounded-2xl border border-zinc-600 text-zinc-200 font-semibold hover:bg-zinc-800 disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => respond(true)}
            disabled={loading}
            className="py-3.5 rounded-2xl bg-pink-600 hover:bg-pink-700 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Phone size={18} />
            {loading ? '…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
