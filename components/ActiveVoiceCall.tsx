'use client';

import { useEffect, useRef, useState } from 'react';
import { PhoneOff, Mic, MicOff } from 'lucide-react';
import { Room, RoomEvent, Track, ConnectionState, ConnectionQuality } from 'livekit-client';
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
  amount_charged?: number;
  duration_seconds?: number;
  started_at?: string | null;
  ended_at?: string | null;
  livekit_room?: string | null;
};

type UiPhase =
  | 'connecting'
  | 'waiting'
  | 'in_call'
  | 'reconnecting'
  | 'ended';

const CALL_PREFIX = '__CALL_EVENT__:';

export default function ActiveVoiceCall() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [call, setCall] = useState<CallRow | null>(null);
  const [otherName, setOtherName] = useState('…');
  const [otherAvatar, setOtherAvatar] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [phase, setPhase] = useState<UiPhase>('connecting');
  const [error, setError] = useState('');
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'unknown'>('unknown');
  const [endSummary, setEndSummary] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const userIdRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callRef = useRef<CallRow | null>(null);
  const hangingUp = useRef(false);
  const billingStarted = useRef(false);
  const secondsRef = useRef(0);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const runningCost = () => {
    if (!call || !billingStarted.current) return 0;
    const rate = Number(call.rate_per_minute || 0);
    const minMins = call.min_minutes || 1;
    const usedMins = Math.max(minMins, Math.ceil(Math.max(seconds, 1) / 60));
    return Math.round(rate * usedMins * 100) / 100;
  };

  const disconnectRoom = async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        room.removeAllListeners();
        await room.disconnect();
      } catch {
        /* ignore */
      }
    }
  };

  const insertReceipt = async (
    c: CallRow,
    kind: 'ended' | 'failed',
    label: string,
    senderId: string
  ) => {
    if (!c.conversation_id) return;
    const content = `${CALL_PREFIX}${kind}|${label}`;
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

  const markBillingStarted = async (c: CallRow) => {
    if (billingStarted.current) return;
    billingStarted.current = true;
    setPhase('in_call');
    setSeconds(0);
    secondsRef.current = 0;
    const now = new Date().toISOString();
    await supabase
      .from('voice_calls')
      .update({ started_at: now })
      .eq('id', c.id)
      .eq('status', 'active');
    setCall((prev) => (prev ? { ...prev, started_at: now } : prev));
  };

  const checkBothConnected = async (room: Room, c: CallRow) => {
    // Local + at least one remote participant
    const remoteCount = room.remoteParticipants.size;
    if (remoteCount >= 1 && room.state === ConnectionState.Connected) {
      await markBillingStarted(c);
    } else if (!billingStarted.current) {
      setPhase('waiting');
    }
  };

  const hangUp = async (reason: 'local' | 'remote' | 'failed' = 'local') => {
    if (hangingUp.current) return;
    const c = callRef.current;
    const uid = userIdRef.current;
    if (!c || !uid) return;
    hangingUp.current = true;

    const durationSeconds = billingStarted.current ? secondsRef.current : 0;
    const rate = Number(c.rate_per_minute || 0);
    const minMins = c.min_minutes || 1;

    let amountCharged = 0;
    let status: string = 'ended';
    let label = '';

    if (!billingStarted.current) {
      // Never both connected — no charge
      status = 'failed';
      amountCharged = 0;
      label = 'Call ended · no charge';
    } else {
      const usedMins = Math.max(minMins, Math.ceil(Math.max(durationSeconds, 1) / 60));
      amountCharged = Math.round(rate * usedMins * 100) / 100;
      const mins = Math.floor(durationSeconds / 60);
      const secs = durationSeconds % 60;
      const dur = `${mins}:${String(secs).padStart(2, '0')}`;
      label = `Voice call · ${dur} · £${amountCharged.toFixed(2)}`;
    }

    await disconnectRoom();

    try {
      // Only first hang-up writer wins
      const { data } = await supabase
        .from('voice_calls')
        .update({
          status,
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
          amount_charged: amountCharged,
        })
        .eq('id', c.id)
        .eq('status', 'active')
        .select()
        .maybeSingle();

      if (data) {
        await insertReceipt(
          c,
          status === 'failed' ? 'failed' : 'ended',
          label,
          uid
        );
      }
    } catch (e) {
      console.error(e);
    }

    setEndSummary(label || 'Call ended');
    setPhase('ended');
    setTimeout(() => {
      setCall(null);
      callRef.current = null;
      callIdRef.current = null;
      setSeconds(0);
      secondsRef.current = 0;
      billingStarted.current = false;
      setEndSummary(null);
      setPhase('connecting');
      setError('');
      hangingUp.current = false;
    }, 2500);
  };

  const connectToCall = async (c: CallRow, uid: string) => {
    if (callIdRef.current === c.id && roomRef.current) return;

    hangingUp.current = false;
    billingStarted.current = false;
    setPhase('connecting');
    setError('');
    setEndSummary(null);
    callIdRef.current = c.id;
    callRef.current = c;
    setCall(c);
    setSeconds(0);
    secondsRef.current = 0;

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
          const el = track.attach() as HTMLAudioElement;
          el.autoplay = true;
          el.setAttribute('playsinline', 'true');
          el.style.display = 'none';
          document.body.appendChild(el);
        }
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        checkBothConnected(room, c);
      });

      room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        // Prefer remote quality when available; else local
        const q = quality;
        if (q === ConnectionQuality.Excellent) setConnectionQuality('excellent');
        else if (q === ConnectionQuality.Good) setConnectionQuality('good');
        else if (q === ConnectionQuality.Poor) setConnectionQuality('poor');
        else setConnectionQuality('unknown');
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        // Other person left — end for both
        if (billingStarted.current || room.remoteParticipants.size === 0) {
          hangUp('remote');
        }
      });

      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Reconnecting) {
          setPhase('reconnecting');
        } else if (state === ConnectionState.Connected) {
          checkBothConnected(room, c);
        } else if (state === ConnectionState.Disconnected) {
          if (!hangingUp.current && callIdRef.current === c.id) {
            hangUp('remote');
          }
        }
      });

      await room.connect(data.url, data.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setMuted(false);

      // If other already in room
      await checkBothConnected(room, c);
      if (!billingStarted.current) {
        setPhase('waiting');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to connect');
      setPhase('ended');
      setEndSummary('Could not connect');
      callIdRef.current = null;
      callRef.current = null;
      setCall(null);
      await disconnectRoom();
      hangingUp.current = false;
      setTimeout(() => {
        setEndSummary(null);
        setError('');
      }, 2500);
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
        .order('created_at', { ascending: false })
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
            if (!hangingUp.current) {
              await disconnectRoom();
              const charged = Number(row.amount_charged || 0);
              const dur = Number(row.duration_seconds || 0);
              if (row.status === 'failed' || charged === 0) {
                setEndSummary('Call ended · no charge');
              } else {
                const m = Math.floor(dur / 60);
                const s = dur % 60;
                setEndSummary(
                  `Voice call · ${m}:${String(s).padStart(2, '0')} · £${charged.toFixed(2)}`
                );
              }
              setPhase('ended');
              setTimeout(() => {
                setCall(null);
                callRef.current = null;
                callIdRef.current = null;
                billingStarted.current = false;
                setEndSummary(null);
                setSeconds(0);
              }, 2500);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Timer only after both connected (billing started)
  useEffect(() => {
    if (phase !== 'in_call') return;
    const t = setInterval(() => {
      setSeconds((s) => {
        const n = s + 1;
        secondsRef.current = n;
        return n;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, call?.id]);

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  if (phase === 'ended' && endSummary) {
    return (
      <div className="fixed inset-0 z-[210] bg-zinc-950/95 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <PhoneOff size={28} className="text-zinc-400" />
          </div>
          <p className="text-lg font-semibold text-white mb-1">Call ended</p>
          <p className="text-sm text-zinc-400">{endSummary}</p>
        </div>
      </div>
    );
  }

  if (!call) return null;

  const initial = (otherName || 'U').charAt(0).toUpperCase();

  const statusLine = () => {
    if (phase === 'connecting') return 'Connecting…';
    if (phase === 'waiting') return 'Waiting for them to join…';
    if (phase === 'reconnecting') return 'Reconnecting…';
    return 'Voice call';
  };

  return (
    <div className="fixed inset-0 z-[210] bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="relative mx-auto w-28 h-28 mb-6">
          <div
            className={`absolute inset-0 rounded-full bg-pink-500/15 ${
              phase === 'in_call' ? 'animate-pulse' : ''
            }`}
          />
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

        <p className="text-sm text-pink-400 font-medium mb-1">{statusLine()}</p>
        <h2 className="text-2xl font-semibold text-white mb-2">{otherName}</h2>
        {phase === 'in_call' && (
          <div className="flex items-center justify-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => {
              const level =
                connectionQuality === 'excellent'
                  ? 3
                  : connectionQuality === 'good'
                  ? 2
                  : connectionQuality === 'poor'
                  ? 1
                  : 0;
              const on = i < level;
              return (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition ${
                    on ? 'bg-emerald-400' : 'bg-zinc-700'
                  }`}
                  style={{ height: 6 + i * 4 }}
                />
              );
            })}
            <span className="text-[11px] text-zinc-500 ml-1">
              {connectionQuality === 'excellent'
                ? 'Excellent'
                : connectionQuality === 'good'
                ? 'Good'
                : connectionQuality === 'poor'
                ? 'Weak signal'
                : 'Connecting'}
            </span>
          </div>
        )}

        {phase === 'in_call' ? (
          <>
            <p className="text-3xl font-mono text-white tabular-nums mb-1">
              {formatTime(seconds)}
            </p>
            <p className="text-sm text-zinc-400 mb-8">
              £{Number(call.rate_per_minute).toFixed(2)}/min · ~£
              {runningCost().toFixed(2)}
            </p>
          </>
        ) : (
          <p className="text-sm text-zinc-500 mb-8">
            {phase === 'waiting'
              ? 'Timer starts when both of you are connected'
              : 'Please allow microphone access'}
          </p>
        )}

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={toggleMute}
            disabled={phase === 'connecting'}
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
            onClick={() => hangUp('local')}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-900/40"
          >
            <PhoneOff size={26} />
          </button>
        </div>

        <p className="text-xs text-zinc-600 mt-8">
          {phase === 'in_call'
            ? `Minimum ${call.min_minutes || 1} min charged`
            : 'No charge until both join'}
        </p>
      </div>
    </div>
  );
}
