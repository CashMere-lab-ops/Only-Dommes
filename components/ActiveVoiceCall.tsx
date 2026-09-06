'use client';

import { useEffect, useRef, useState } from 'react';
import { PhoneOff, Mic, MicOff, Volume2, Volume1, Video, VideoOff } from 'lucide-react';
import { Room, RoomEvent, Track, ConnectionState, ConnectionQuality } from 'livekit-client';
import { createClient } from '../lib/supabase';

type CallRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  conversation_id: string | null;
  status: string;
  call_kind?: string;
  rate_per_minute: number;
  min_minutes: number;
  max_minutes?: number;
  amount_held?: number;
  amount_charged?: number;
  duration_seconds?: number;
  started_at?: string | null;
  ended_at?: string | null;
  livekit_room?: string | null;
  extend_request_status?: string | null;
  extend_request_at?: string | null;
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
  const [holdToast, setHoldToast] = useState('');
  const [extendActing, setExtendActing] = useState(false);
  const [earningsToast, setEarningsToast] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [camOff, setCamOff] = useState(false);
  const remoteAudioEls = useRef<HTMLAudioElement[]>([]);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [blockDone, setBlockDone] = useState(false);

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

  const elapsedCost = () => {
    if (!call || phase !== 'in_call') return 0;
    return Math.round(rateNum * (seconds / 60) * 100) / 100;
  };
  const minCharge = rateNum * minMinsNum;

  const disconnectRoom = async () => {
    const room = roomRef.current;
    roomRef.current = null;
    remoteAudioEls.current.forEach((el) => {
      try {
        el.remove();
      } catch {
        /* ignore */
      }
    });
    remoteAudioEls.current = [];
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
      status = 'failed';
      amountCharged = 0;
      label =
        reason === 'failed'
          ? 'Call failed · you were not charged'
          : 'Call ended · you were not charged';
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
        if (status === 'ended' && amountCharged > 0) {
          try {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (session?.access_token) {
              await fetch('/api/wallet/charge-call', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ call_id: c.id }),
              });
            }
          } catch (chargeErr) {
            console.error('Call charge failed', chargeErr);
          }
        }
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

  const submitCallReport = async () => {
    if (!callRef.current || !userIdRef.current || !reportReason || reporting) return;
    setReporting(true);
    try {
      await supabase.from('call_reports').insert({
        call_id: callRef.current.id,
        reporter_id: userIdRef.current,
        reported_id:
          userIdRef.current === callRef.current.creator_id
            ? callRef.current.subscriber_id
            : callRef.current.creator_id,
        reason: reportReason,
      });
      setReportDone(true);
      setShowReport(false);
    } catch (e) {
      console.error(e);
      setError('Could not submit report');
    } finally {
      setReporting(false);
    }
  };

  const blockOtherUser = async () => {
    if (!callRef.current || !userIdRef.current || blocking || blockDone) return;
    setBlocking(true);
    try {
      const otherId =
        userIdRef.current === callRef.current.creator_id
          ? callRef.current.subscriber_id
          : callRef.current.creator_id;
      const { error } = await supabase.from('blocks').insert({
        blocker_id: userIdRef.current,
        blocked_id: otherId,
      });
      if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
        throw error;
      }
      setBlockDone(true);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Could not block user');
    } finally {
      setBlocking(false);
    }
  };

  const requestMoreTime = async () => {
    if (!call || extending || phase !== 'in_call') return;
    if (userId !== call.subscriber_id) return;
    if (call.extend_request_status === 'pending') return;
    setExtending(true);
    try {
      const { error } = await supabase
        .from('voice_calls')
        .update({
          extend_request_status: 'pending',
          extend_request_at: new Date().toISOString(),
        })
        .eq('id', call.id)
        .eq('status', 'active');
      if (error) throw error;
      const next = { ...call, extend_request_status: 'pending' };
      setCall(next);
      callRef.current = next;
      setHoldToast('Request sent · waiting for them');
    } catch (e) {
      console.error(e);
      setHoldToast('Could not send request');
      setTimeout(() => setHoldToast(''), 3000);
    } finally {
      setExtending(false);
    }
  };

  const respondMoreTime = async (accept: boolean) => {
    if (!call || extendActing || phase !== 'in_call') return;
    if (userId !== call.creator_id) return;
    setExtendActing(true);
    try {
      const extra = Math.round(rateNum * 5 * 100) / 100;
      const nextHold = Math.round((Number(call.amount_held || 0) + extra) * 100) / 100;
      const { error } = await supabase
        .from('voice_calls')
        .update(
          accept
            ? {
                extend_request_status: 'accepted',
                amount_held: nextHold,
              }
            : { extend_request_status: 'declined' }
        )
        .eq('id', call.id)
        .eq('status', 'active');
      if (error) throw error;
      const next = {
        ...call,
        extend_request_status: accept ? 'accepted' : 'declined',
        amount_held: accept ? nextHold : call.amount_held,
      };
      setCall(next);
      callRef.current = next;
      setHoldToast(accept ? 'Extra time accepted' : 'Request declined');
      setTimeout(() => setHoldToast(''), 2800);
    } catch (e) {
      console.error(e);
      setHoldToast('Could not respond');
      setTimeout(() => setHoldToast(''), 3000);
    } finally {
      setExtendActing(false);
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
          remoteAudioEls.current.push(el);
        }
        if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
        }
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        checkBothConnected(room, c);
      });

      room.on(RoomEvent.ConnectionQualityChanged, (quality) => {
        const q = quality;
        if (q === ConnectionQuality.Excellent) setConnectionQuality('excellent');
        else if (q === ConnectionQuality.Good) setConnectionQuality('good');
        else if (q === ConnectionQuality.Poor) setConnectionQuality('poor');
        else setConnectionQuality('unknown');
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        if (!billingStarted.current) return;
        if (secondsRef.current < 3) return;
        if (room.remoteParticipants.size === 0) {
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
            setPhase('reconnecting');
            setTimeout(() => {
              const roomNow = roomRef.current;
              if (
                !hangingUp.current &&
                callIdRef.current === c.id &&
                (!roomNow || roomNow.state === ConnectionState.Disconnected)
              ) {
                hangUp('remote');
              }
            }, 8000);
          }
        }
      });

      await room.connect(data.url, data.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setMuted(false);
      if ((c.call_kind || 'voice') === 'video') {
        try {
          await room.localParticipant.setCameraEnabled(true);
          const cam = room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (cam?.track && localVideoRef.current) {
            cam.track.attach(localVideoRef.current);
          }
        } catch (camErr: any) {
          setError(camErr?.message || 'Camera permission denied');
        }
      }

      await checkBothConnected(room, c);
      if (!billingStarted.current) {
        setPhase('waiting');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to connect');
      setPhase('ended');
      setEndSummary('Call failed · you were not charged');
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
          if (row.status === 'active' && callIdRef.current === row.id) {
            setCall((prev) => (prev ? { ...prev, ...row } : row));
            callRef.current = { ...(callRef.current || row), ...row };
            const st = row.extend_request_status;
            if (st === 'accepted' && uid === row.subscriber_id) {
              setHoldToast('They accepted · +5 min added');
              setTimeout(() => setHoldToast(''), 3500);
            }
            if (st === 'declined' && uid === row.subscriber_id) {
              setHoldToast('They declined extra time');
              setTimeout(() => setHoldToast(''), 3500);
            }
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
                setEndSummary(
                  row.status === 'failed'
                    ? 'Call failed · you were not charged'
                    : 'Call ended · you were not charged'
                );
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

  useEffect(() => {
    if (phase !== 'in_call') return;
    const t = setInterval(() => {
      setSeconds((s) => {
        const n = s + 1;
        secondsRef.current = n;
        const maxMins = callRef.current?.max_minutes || 0;
        if (maxMins > 0 && n >= maxMins * 60) {
          setTimeout(() => hangUp('local'), 0);
          return n;
        }
        const c = callRef.current;
        if (c && billingStarted.current) {
          const rate = Number(c.rate_per_minute || 0);
          const held = Number(c.amount_held || 0);
          if (held > 0 && rate > 0) {
            const costNow = rate * (n / 60);
            if (costNow >= held - 0.001) {
              setTimeout(() => hangUp('local'), 0);
            }
          }
        }
        return n;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, call?.id]);

  const toggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    remoteAudioEls.current.forEach((el) => {
      try {
        el.volume = next ? 1 : 0.85;
      } catch {
        /* ignore */
      }
    });
  };

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  const toggleCam = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOff;
    await room.localParticipant.setCameraEnabled(!next);
    setCamOff(next);
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

          <div className="mt-6 flex flex-col items-center gap-2">
            {!showReport && !reportDone && (
              <button
                type="button"
                onClick={() => setShowReport(true)}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline"
              >
                Report this call
              </button>
            )}
            {!blockDone ? (
              <button
                type="button"
                disabled={blocking}
                onClick={blockOtherUser}
                className="text-xs text-red-400/80 hover:text-red-300 underline disabled:opacity-50"
              >
                {blocking ? 'Blocking…' : 'Block this user'}
              </button>
            ) : (
              <p className="text-xs text-zinc-400">User blocked</p>
            )}
          </div>

          {reportDone && (
            <p className="mt-4 text-xs text-zinc-400">Report submitted. Thank you.</p>
          )}

          {showReport && (
            <div className="mt-6 text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-sm font-medium mb-3">Why are you reporting?</p>
              <div className="space-y-2 mb-4">
                {[
                  'Spam or scam',
                  'Harassment or abuse',
                  'Inappropriate behaviour',
                  'Technical issue / fraud',
                  'Other',
                ].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReportReason(r)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition ${
                      reportReason === r
                        ? 'bg-pink-600/20 border border-pink-500 text-pink-300'
                        : 'bg-zinc-800 border border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowReport(false);
                    setReportReason('');
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!reportReason || reporting}
                  onClick={submitCallReport}
                  className="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-sm font-medium disabled:opacity-50"
                >
                  {reporting ? 'Sending…' : 'Submit'}
                </button>
              </div>
            </div>
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
    if (phase === 'reconnecting') return 'Connection lost — reconnecting…';
    return (call?.call_kind || 'voice') === 'video' ? 'Video call' : 'Voice call';
  };

  const isVideo = (call?.call_kind || 'voice') === 'video';
  const held = Number(call?.amount_held || 0);
  const holdLow = held > 0 && elapsedCost() >= held * 0.8;

  return (
    <div className="fixed inset-0 z-[210] bg-black overflow-hidden">
      {isVideo ? (
        <>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover bg-black"
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute right-4 w-[72px] h-[104px] sm:right-5 sm:w-28 sm:h-40 object-cover rounded-[18px] ring-1 ring-white/25 bg-zinc-900 z-20 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
            style={{ top: 'max(4.5rem, calc(env(safe-area-inset-top) + 3.25rem))' }}
          />
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/75 via-black/20 to-transparent pointer-events-none z-10" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none z-10" />
        </>
      ) : (
        <div className="absolute inset-0 pointer-events-none">
          {otherAvatar ? (
            <>
              <img
                src={otherAvatar}
                alt=""
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-3xl opacity-35"
              />
              <div className="absolute inset-0 bg-zinc-950/75" />
            </>
          ) : (
            <div className="absolute inset-0 bg-zinc-950" />
          )}
        </div>
      )}

      <div
        className="relative z-20 flex flex-col h-full"
        style={{
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex items-start justify-between px-4" style={{ paddingTop: 4 }}>
          <div className="min-w-0 max-w-[38%] pt-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/45 truncate">
              {isVideo ? 'Video' : 'Voice'}
            </p>
            <p className="text-sm font-semibold text-white truncate drop-shadow">{otherName}</p>
          </div>
          <div className="w-[38%]" />
        </div>

        <div
          className="absolute left-1/2 -translate-x-1/2 z-30 text-center pointer-events-none"
          style={{ top: 'max(10px, calc(env(safe-area-inset-top) + 6px))' }}
        >
          {phase === 'in_call' ? (
            <div className="inline-flex flex-col items-center rounded-full bg-black/45 backdrop-blur-xl border border-white/10 px-4 py-1">
              <span className="text-[15px] font-medium text-white tabular-nums tracking-[0.08em]">
                {formatTime(seconds)}
              </span>
              <span className="text-[10px] text-pink-300/90 tabular-nums">
                £{elapsedCost().toFixed(2)}
              </span>
            </div>
          ) : (
            <p className="text-xs text-white/60">{statusLine()}</p>
          )}
        </div>

        <div className="h-4 shrink-0" />

        {!isVideo && (
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center text-3xl font-bold ring-2 ring-white/10 shadow-2xl">
              {otherAvatar ? (
                <img src={otherAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <h2 className="text-2xl font-semibold text-white mt-5">{otherName}</h2>
            <p className="text-sm text-white/50 mt-1">{statusLine()}</p>
          </div>
        )}

        {isVideo && <div className="flex-1" />}

        {phase === 'reconnecting' && (
          <div className="mx-5 mb-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 text-center">
            Reconnecting…
          </div>
        )}

        <div className="px-5 pt-2">
          {userId === call.creator_id && call.extend_request_status === 'pending' && (
            <div className="mb-4 rounded-3xl border border-white/10 bg-black/55 backdrop-blur-xl p-4 shadow-2xl">
              <p className="text-[11px] uppercase tracking-[0.18em] text-pink-300 text-center mb-1">Time request</p>
              <p className="text-sm text-white text-center">
                <span className="font-semibold">{otherName}</span> would like +5 minutes
              </p>
              <p className="text-xs text-white/45 text-center mt-1 mb-4">
                Extra hold £{(rateNum * 5).toFixed(2)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={extendActing}
                  onClick={() => respondMoreTime(false)}
                  className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm text-white/80 disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={extendActing}
                  onClick={() => respondMoreTime(true)}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {extendActing ? '…' : 'Accept'}
                </button>
              </div>
            </div>
          )}
          {holdToast && (
            <div className="mb-3 text-center">
              <span className="inline-flex rounded-full bg-black/55 backdrop-blur-md border border-white/10 px-4 py-1.5 text-sm text-pink-200">
                {holdToast}
              </span>
            </div>
          )}
          {holdLow && userId === call.subscriber_id && call.extend_request_status !== 'pending' && (
            <p className="text-center text-xs text-amber-200/90 mb-3">Time running low</p>
          )}
          {error && <p className="text-center text-sm text-red-400 mb-3">{error}</p>}

          <div className="flex items-center justify-center gap-3 pb-1">
            <button
              type="button"
              onClick={toggleMute}
              disabled={phase === 'connecting'}
              className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition ${
                muted
                  ? 'bg-white text-zinc-950 border-white'
                  : 'bg-white/10 border-white/15 text-white'
              }`}
            >
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            {(call.call_kind || 'voice') === 'video' && (
              <button
                type="button"
                onClick={toggleCam}
                disabled={phase === 'connecting'}
                className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition ${
                  camOff
                    ? 'bg-white text-zinc-950 border-white'
                    : 'bg-white/10 border-white/15 text-white'
                }`}
                title={camOff ? 'Camera off' : 'Camera on'}
              >
                {camOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
            )}

            {!isVideo && (
              <button
                type="button"
                onClick={toggleSpeaker}
                disabled={phase === 'connecting'}
                className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md border transition ${
                  speakerOn
                    ? 'bg-white/10 border-pink-400/40 text-pink-300'
                    : 'bg-white/10 border-white/15 text-white'
                }`}
                title={speakerOn ? 'Speaker on' : 'Quieter'}
              >
                {speakerOn ? <Volume2 size={22} /> : <Volume1 size={22} />}
              </button>
            )}

            <button
              type="button"
              onClick={() => hangUp('local')}
              className="w-[68px] h-[68px] rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-[0_10px_30px_rgba(220,38,38,0.45)]"
            >
              <PhoneOff size={26} />
            </button>

            {phase === 'in_call' && userId === call.subscriber_id && (
              <button
                type="button"
                onClick={requestMoreTime}
                disabled={extending || call.extend_request_status === 'pending'}
                className="w-14 h-14 rounded-full flex flex-col items-center justify-center backdrop-blur-md border border-white/15 bg-white/10 text-white text-[10px] font-semibold leading-tight disabled:opacity-50"
                title="Request +5 minutes"
              >
                {extending || call.extend_request_status === 'pending' ? (
                  <span className="text-[10px] text-pink-200">Wait</span>
                ) : (
                  <>
                    <span className="text-sm text-pink-300">+5</span>
                    <span className="text-white/70">min</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}