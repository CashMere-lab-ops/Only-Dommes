'use client';

import { useEffect, useRef, useState } from 'react';
import { PhoneOff, Mic, MicOff } from 'lucide-react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { createClient } from '../lib/supabase';

type CallRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  conversation_id: string | null;
  status: string;
  rate_per_minute: number;
  min_minutes: number;
  amount_held?: number;
  started_at?: string | null;
  livekit_room?: string | null;
};

const CALL_PREFIX = '__CALL_EVENT__:';

export default function ActiveVoiceCall() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [call, setCall] = useState<CallRow | null>(null);
  const [otherName, setOtherName] = useState('Connecting…');
  const [otherAvatar, setOtherAvatar] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const roomRef = useRef<Room | null>(null);
  const userIdRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const hangingUp = useRef(false);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const runningCost = () => {
    if (!call) return 0;
    const rate = Number(call.rate_per_minute || 0);
    const mins = Math.max(call.min_minutes || 1, Math.ceil(seconds / 60) || 1);
    // While in call show projected charge: at least min, else rate * full minutes used
    const usedMins = Math.max(call.min_minutes || 1, Math.ceil(Math.max(seconds, 1) / 60));
    return Math.round(rate * usedMins * 100) / 100;
  };

  const disconnectRoom = async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        await room.disconnect();
      } catch {
        /* ignore */
      }
    }
  };

  const insertEndedReceipt = async (
    c: CallRow,
    durationSeconds: number,
    amountCharged: number,
    senderId: string
  ) => {
    if (!c.conversation_id) return;
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const dur = `${mins}:${String(secs).padStart(2, '0')}`;
    const label = `Voice call · ${dur} · £${amountCharged.toFixed(2)}`;
    const content = `${CALL_PREFIX}ended|${label}`;
    await supabase.from('messages').insert({
      conversation_id: c.conversation_id,
      sender_id: senderId,
      content,
    });
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', c.conversation_id);
  };

  const hangUp = async () => {
    if (!call || !userId || hangingUp.current) return;
    hangingUp.current = true;

    const durationSeconds = seconds;
    const rate = Number(call.rate_per_minute || 0);
    const minMins = call.min_minutes || 1;
    const usedMins = Math.max(minMins, Math.ceil(Math.max(durationSeconds, 1) / 60));
    const amountCharged = Math.round(rate * usedMins * 100) / 100;

    await disconnectRoom();

    try {
      await supabase
        .from('voice_calls')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
          amount_charged: amountCharged,
        })
        .eq('id', call.id)
        .eq('status', 'active');

      await insertEndedReceipt(call, durationSeconds, amountCharged, userId);
    } catch (e) {
      console.error(e);
    }

    setCall(null);
    callIdRef.current = null;
    setSeconds(0);
    hangingUp.current = false;
  };

  const connectToCall = async (c: CallRow, uid: string) => {
    if (callIdRef.current === c.id && roomRef.current) return;
    setConnecting(true);
    setError('');
    callIdRef.current = c.id;
    setCall(c);

    const otherId = c.creator_id === uid ? c.subscriber_id : c.creator_id;
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, username, avatar_url')
      .eq('id', otherId)
      .single();
    setOtherName(profile?.display_name || profile?.username || 'User');
    setOtherAvatar(profile?.avatar_url || null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not logged in');

      const res = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ callId: c.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not join call');

      await disconnectRoom();

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.autoplay = true;
          el.playsInline = true;
          el.style.display = 'none';
          document.body.appendChild(el);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        if (!hangingUp.current && callIdRef.current === c.id) {
          // Remote hang up — refresh status
          setCall(null);
          callIdRef.current = null;
        }
      });

      await room.connect(data.url, data.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setMuted(false);
      setConnecting(false);

      if (c.started_at) {
        const elapsed = Math.floor(
          (Date.now() - new Date(c.started_at).getTime()) / 1000
        );
        setSeconds(Math.max(0, elapsed));
      } else {
        setSeconds(0);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to connect');
      setConnecting(false);
      callIdRef.current = null;
      setCall(null);
      await disconnectRoom();
    }
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

      const { data: active } = await supabase
        .from('voice_calls')
        .select('*')
        .eq('status', 'active')
        .or(`creator_id.eq.${user.id},subscriber_id.eq.${user.id}`)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active && alive) {
        await connectToCall(active as CallRow, user.id);
      }
    };

    init();
    return () => {
      alive = false;
      disconnectRoom();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`active-voice-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'voice_calls',
        },
        async (payload: any) => {
          const row = payload.new as CallRow;
          if (!row) return;
          const uid = userIdRef.current;
          if (!uid) return;
          if (row.creator_id !== uid && row.subscriber_id !== uid) return;

          if (row.status === 'active' && callIdRef.current !== row.id) {
            await connectToCall(row, uid);
          }
          if (
            callIdRef.current === row.id &&
            ['ended', 'failed', 'declined', 'cancelled', 'missed'].includes(
              row.status
            )
          ) {
            await disconnectRoom();
            setCall(null);
            callIdRef.current = null;
            setSeconds(0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Timer
  useEffect(() => {
    if (!call || call.status !== 'active') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [call?.id, call?.status]);

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  if (!call && !connecting) return null;

  const initial = (otherName || 'U').charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-[210] bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="relative mx-auto w-28 h-28 mb-6">
          <div className="absolute inset-0 rounded-full bg-pink-500/15 animate-pulse" />
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center text-3xl font-bold">
            {otherAvatar ? (
              <img
                src={otherAvatar}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              initial
            )}
          </div>
        </div>

        <p className="text-sm text-pink-400 font-medium mb-1">
          {connecting ? 'Connecting…' : 'Voice call'}
        </p>
        <h2 className="text-2xl font-semibold text-white mb-2">{otherName}</h2>
        <p className="text-3xl font-mono text-white tabular-nums mb-1">
          {formatTime(seconds)}
        </p>
        {call && (
          <p className="text-sm text-zinc-400 mb-8">
            £{Number(call.rate_per_minute).toFixed(2)}/min · ~£
            {runningCost().toFixed(2)}
          </p>
        )}

        {error && (
          <p className="text-sm text-red-400 mb-4">{error}</p>
        )}

        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={toggleMute}
            disabled={connecting}
            className={`w-14 h-14 rounded-full flex items-center justify-center border transition ${
              muted
                ? 'bg-zinc-800 border-zinc-600 text-white'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-pink-500'
            }`}
          >
            {muted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>

          <button
            type="button"
            onClick={hangUp}
            disabled={connecting && !call}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-900/40"
          >
            <PhoneOff size={26} />
          </button>
        </div>

        <p className="text-xs text-zinc-600 mt-8">
          Minimum {call?.min_minutes || 1} min charged
        </p>
      </div>
    </div>
  );
}
