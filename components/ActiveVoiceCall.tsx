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
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const [extending, setExtending] = useState(false);
  const [earningsToast, setEarningsToast] = useState<string | null>(null);

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

  const rateNum = call ? Number(call.rate_per_minute || 0) : 0;
  const minMinsNum = call ? call.min_minutes || 1 : 1;

  // Live estimate: pro-rate by seconds, but never show below minimum once connected
  const liveCost = () => {
    if (!call || phase !== 'in_call') return 0;
    const elapsedMins = Math.max(seconds, 1) / 60;
    const raw = rateNum * elapsedMins;
    const minCharge = rateNum * minMinsNum;
    // Until min duration reached, show minimum; after that tick up
    const cost = Math.max(minCharge, raw);
    return Math.round(cost * 100) / 100;
  };

  const runningCost = liveCost;

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
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 30, 40]);
      }
    } catch {
      /* ignore */
    }
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
      const extra = Math.max(0, usedMins - minMins);
      const breakdown =
        extra > 0
          ? `min ${minMins} min + ${extra} extra`
          : `min ${minMins} min`;
      label = `Voice call · ${dur} · £${amountCharged.toFixed(2)} · ${breakdown}`;
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
        if (uid === c.creator_id && amountCharged > 0) {
          setEarningsToast(`You earned £${amountCharged.toFixed(2)}`);
          setTimeout(() => setEarningsToast(null), 4000);
        }
      }
    } catch (e) {
      console.error(e);
    }

    setEndSummary(label || 'Call ended');
    setPhase('ended');
    const isSub = uid === c.subscriber_id;
    const offerRating = isSub && status === 'ended' && amountCharged > 0;
    if (offerRating) {
      setShowRating(true);
      setRating(0);
      setRatingDone(false);
      hangingUp.current = false;
    } else {
      setTimeout(() => {
        setCall(null);
        callRef.current = null;
        callIdRef.current = null;
        setSeconds(0);
        secondsRef.current = 0;
        billingStarted.current = false;
        setEndSummary(null);
        setShowRating(false);
        setPhase('connecting');
        setError('');
        hangingUp.current = false;
      }, 2500);
    }
  };

  const submitRating = async (stars: number) => {
    if (!callRef.current || !userIdRef.current || ratingSaving) return;
    setRating(stars);
    setRatingSaving(true);
    try {
      await supabase
        .from('voice_calls')
        .update({ rating: stars, rated_by: userIdRef.current })
        .eq('id', callRef.current.id);
      setRatingDone(true);
    } catch (e) {
      console.error(e);
    } finally {
      setRatingSaving(false);
      setTimeout(() => {
        setCall(null);
        callRef.current = null;
        callIdRef.current = null;
        setSeconds(0);
        secondsRef.current = 0;
        billingStarted.current = false;
        setEndSummary(null);
        setShowRating(false);
        setRating(0);
        setRatingDone(false);
        setPhase('connecting');
        setError('');
      }, 1200);
    }
  };

  const skipRating = () => {
    setShowRating(false);
    setCall(null);
    callRef.current = null;
    callIdRef.current = null;
    setSeconds(0);
    secondsRef.current = 0;
    billingStarted.current = false;
    setEndSummary(null);
    setPhase('connecting');
    setError('');
  };

  const extendHold = async () => {
    if (!call || extending || phase !== 'in_call') return;
    setExtending(true);
    try {
      const extra = Math.round(rateNum * 5 * 100) / 100; // +5 minutes worth
      const next = Math.round((Number(call.amount_held || 0) + extra) * 100) / 100;
      const { error } = await supabase
        .from('voice_calls')
        .update({ amount_held: next })
        .eq('id', call.id)
        .eq('status', 'active');
      if (error) throw error;
      setCall({ ...call, amount_held: next });
      callRef.current = { ...call, amount_held: next };
    } catch (e) {
      console.error(e);
      setError('Could not extend hold');
    } finally {
      setExtending(false);
    }
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
                if (uid === row.creator_id && charged > 0) {
                  setEarningsToast(`You earned £${charged.toFixed(2)}`);
                  setTimeout(() => setEarningsToast(null), 4000);
                }
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
        {earningsToast && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-pink-600 to-rose-500 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl">
            {earningsToast}
          </div>
        )}
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
            <PhoneOff size={28} className="text-zinc-400" />
          </div>
          <p className="text-lg font-semibold text-white mb-1">Call ended</p>
          <p className="text-sm text-zinc-400 mb-6">{endSummary}</p>

          {showRating && !ratingDone && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <p className="text-sm text-zinc-300 mb-4">How was the call?</p>
              <div className="flex items-center justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    disabled={ratingSaving}
                    onClick={() => submitRating(star)}
                    className={`text-3xl transition ${
                      star <= rating ? 'text-pink-400' : 'text-zinc-600 hover:text-pink-300'
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={skipRating}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Skip
              </button>
            </div>
          )}

          {ratingDone && (
            <p className="text-sm text-pink-400">Thanks for your feedback</p>
          )}
        </div>
      </div>
    );
  }

  if (!call) {
    if (!earningsToast) return null;
    return (
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[220] px-4">
        <div className="bg-gradient-to-r from-pink-600 to-rose-500 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl shadow-pink-900/40">
          {earningsToast}
        </div>
      </div>
    );
  }

  const initial = (otherName || 'U').charAt(0).toUpperCase();

  const statusLine = () => {
    if (phase === 'connecting') return 'Connecting…';
    if (phase === 'waiting') return 'Waiting for them to join…';
    if (phase === 'reconnecting') return 'Reconnecting…';
    return 'Voice call';
  };

  return (
    <div className="fixed inset-0 z-[210] bg-zinc-950 flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Studio blurred background */}
      <div className="absolute inset-0 pointer-events-none">
        {otherAvatar ? (
          <>
            <img
              src={otherAvatar}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-3xl opacity-40"
            />
            <div className="absolute inset-0 bg-zinc-950/70" />
            <div className="absolute inset-0 bg-gradient-to-b from-pink-950/30 via-transparent to-zinc-950/90" />
          </>
        ) : (
          <>
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-pink-600/25 blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-rose-600/15 blur-3xl" />
          </>
        )}
      </div>

      <div className="relative w-full max-w-sm text-center">
        <div className="relative mx-auto w-28 h-28 mb-6">
          <div
            className={`absolute inset-0 rounded-full bg-pink-500/20 ${
              phase === 'in_call' ? 'animate-pulse' : ''
            }`}
          />
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center text-3xl font-bold ring-2 ring-white/10 shadow-2xl shadow-pink-900/40">
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
            <div className="mb-6">
              <p className="text-2xl font-semibold text-pink-400 tabular-nums">
                £{liveCost().toFixed(2)}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                £{rateNum.toFixed(2)}/min
                {seconds < minMinsNum * 60
                  ? ` · min charge £${(rateNum * minMinsNum).toFixed(2)} until ${minMinsNum} min`
                  : ' · running'}
              </p>
              {Number(call.amount_held || 0) > 0 &&
                liveCost() >= Number(call.amount_held) * 0.8 && (
                <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {liveCost() >= Number(call.amount_held)
                    ? 'Hold limit reached — call may end soon'
                    : 'Running low on hold (80%+)'}
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500 mb-8">
            {phase === 'waiting'
              ? 'Timer starts when both of you are connected'
              : 'Please allow microphone access'}
          </p>
        )}

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex items-center justify-center gap-5">
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

          {phase === 'in_call' && (
            <button
              type="button"
              onClick={extendHold}
              disabled={extending}
              className="w-14 h-14 rounded-full flex flex-col items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-pink-500 text-[10px] font-semibold leading-tight disabled:opacity-50"
              title="Add 5 minutes to hold"
            >
              {extending ? '…' : (
                <>
                  <span className="text-sm text-pink-400">+5</span>
                  <span>min</span>
                </>
              )}
            </button>
          )}
        </div>
        {phase === 'in_call' && Number(call.amount_held || 0) > 0 && (
          <p className="text-xs text-zinc-600 mt-3">
            Hold: £{Number(call.amount_held).toFixed(2)}
          </p>
        )}

        <p className="text-xs text-zinc-600 mt-8">
          {phase === 'in_call'
            ? `Minimum ${call.min_minutes || 1} min charged`
            : 'No charge until both join'}
        </p>
      </div>
    </div>
  );
}
