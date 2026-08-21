'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Radio,
  Users,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  DollarSign,
  X,
  Send,
  Lock,
  Unlock,
  Crown,
  Share2,
  Check,
  UserPlus,
  Sparkles,
  MoreHorizontal,
} from 'lucide-react';
import { notifyBalanceUpdated } from '../../../lib/wallet';
import {
  Room,
  RoomEvent,
  Track,
  createLocalVideoTrack,
  createLocalAudioTrack,
  type LocalTrack,
} from 'livekit-client';
import Sidebar from '../../../components/Sidebar';
import AuthGuard from '../../../components/AuthGuard';
import { createClient } from '../../../lib/supabase';

type StreamRow = {
  id: string;
  creator_id: string;
  title: string;
  status: string;
  livekit_room?: string | null;
  tip_goal_gbp?: number;
  tip_raised_gbp?: number;
  viewer_count?: number;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string | null;
  private_active?: boolean;
  private_user_id?: string | null;
  private_ends_at?: string | null;
  private_request_id?: string | null;
  showcase_user_id?: string | null;
  showcase_amount_gbp?: number;
  showcase_name?: string | null;
  showcase_avatar_url?: string | null;
};

type PrivateReq = {
  id: string;
  stream_id: string;
  creator_id: string;
  requester_id: string;
  minutes: number;
  rate_per_minute: number;
  amount_gbp: number;
  status: string;
  profile?: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

type ChatMsg = {
  id: string;
  stream_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

const TIP_PRESETS = [5, 10, 20, 50];


function playPrivateChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [[523.25, 0], [659.25, 0.12], [783.99, 0.24]].forEach(([freq, delay]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq as number;
      g.gain.setValueAtTime(0.0001, now + (delay as number));
      g.gain.exponentialRampToValueAtTime(0.08, now + (delay as number) + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + (delay as number) + 0.28);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + (delay as number));
      o.stop(now + (delay as number) + 0.3);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* ignore */
  }
}

function playTipChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [[880, 0], [1174.7, 0.1]].forEach(([freq, delay]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq as number;
      g.gain.setValueAtTime(0.0001, now + (delay as number));
      g.gain.exponentialRampToValueAtTime(0.06, now + (delay as number) + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + (delay as number) + 0.35);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + (delay as number));
      o.stop(now + (delay as number) + 0.4);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* ignore */
  }
}

function playGoalChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [[523.25, 0], [659.25, 0.15], [783.99, 0.3], [1046.5, 0.45]].forEach(
      ([freq, delay]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq as number;
        g.gain.setValueAtTime(0.0001, now + (delay as number));
        g.gain.exponentialRampToValueAtTime(0.09, now + (delay as number) + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + (delay as number) + 0.4);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now + (delay as number));
        o.stop(now + (delay as number) + 0.45);
      }
    );
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    /* ignore */
  }
}

export default function LiveWatchPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [stream, setStream] = useState<StreamRow | null>(null);
  const [creator, setCreator] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [error, setError] = useState('');
  const [ending, setEnding] = useState(false);
  const [liveStatus, setLiveStatus] = useState<
    'idle' | 'connecting' | 'live' | 'ended' | 'error'
  >('idle');
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [peakViewers, setPeakViewers] = useState(0);
  const [endSummary, setEndSummary] = useState<any>(null);
  const [myTipTotal, setMyTipTotal] = useState(0);
  const [liveStartedAt, setLiveStartedAt] = useState<number | null>(null);
  const [showTip, setShowTip] = useState(false);
  const [tipAmount, setTipAmount] = useState(5);
  const [customTip, setCustomTip] = useState('');
  const [tipping, setTipping] = useState(false);
  const [tipError, setTipError] = useState('');
  const [tipFlash, setTipFlash] = useState<string | null>(null);
  const [goalReachedFlash, setGoalReachedFlash] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const prevRaised = useRef(0);

  // Private
  const [showPrivate, setShowPrivate] = useState(false);
  const [privateMinutes, setPrivateMinutes] = useState(5);
  const [privateRate, setPrivateRate] = useState(5);
  const [privateMin, setPrivateMin] = useState(1);
  const [requestingPrivate, setRequestingPrivate] = useState(false);
  const [privateError, setPrivateError] = useState('');
  const [myPendingPrivate, setMyPendingPrivate] = useState<PrivateReq | null>(null);
  const [incomingPrivates, setIncomingPrivates] = useState<PrivateReq[]>([]);
  const [privateBusy, setPrivateBusy] = useState(false);
  const [privateLockedOut, setPrivateLockedOut] = useState(false);
  const [privateEndsAt, setPrivateEndsAt] = useState<string | null>(null);
  const [privateCountdown, setPrivateCountdown] = useState('');
  const [privateEnabled, setPrivateEnabled] = useState(true);
  const [privateReqLeft, setPrivateReqLeft] = useState<Record<string, number>>({});
  const privateTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatText, setChatText] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);

  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const isOwner = !!(userId && stream && stream.creator_id === userId);
  const isPrivateFan = !!(
    userId &&
    stream?.private_active &&
    stream.private_user_id === userId
  );
  const inPrivate = !!(stream?.private_active && (isOwner || isPrivateFan));

  const bumpViewers = (n: number) => {
    const v = Math.max(0, n);
    setViewerCount(v);
    setPeakViewers((p) => Math.max(p, v));
  };

  const cleanupRoom = useCallback(async () => {
    try {
      for (const t of localTracksRef.current) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
      localTracksRef.current = [];
      if (roomRef.current) {
        roomRef.current.removeAllListeners();
        await roomRef.current.disconnect(true);
        roomRef.current = null;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    } catch {
      /* ignore */
    }
  }, []);

  const enrichMessages = async (rows: any[]): Promise<ChatMsg[]> => {
    if (!rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', ids);
    const map = new Map((profiles || []).map((p: any) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      profile: map.get(r.user_id) || null,
    }));
  };

  const loadChat = async (streamId: string) => {
    const { data } = await supabase
      .from('live_chat_messages')
      .select('*')
      .eq('stream_id', streamId)
      .order('created_at', { ascending: false })
      .limit(40);
    const rows = (data || []).reverse();
    const enriched = await enrichMessages(rows);
    setChatMessages(enriched);
  };

  const loadMeta = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id || null);

    if (user) {
      const { data: me } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', user.id)
        .single();
      setMyProfile(me);
    }

    const { data, error: qErr } = await supabase
      .from('live_streams')
      .select('*')
      .eq('id', id)
      .single();

    if (qErr || !data) {
      setError('Stream not found');
      setLoading(false);
      return null;
    }

    setStream(data);
    prevRaised.current = Number(data.tip_raised_gbp || 0);

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', data.creator_id)
      .single();
    setCreator(profile);

    // Load this viewer's tip total on this stream
    if (user?.id && data.creator_id !== user.id) {
      try {
        const { data: mine } = await supabase
          .from('live_stream_tips')
          .select('total_gbp')
          .eq('stream_id', data.id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (mine) setMyTipTotal(Number(mine.total_gbp || 0));
      } catch {
        /* ignore */
      }
    }

    if (data.status === 'ended') {
      setLiveStatus('ended');
      const started = data.started_at || data.created_at
        ? new Date(data.started_at || data.created_at).getTime()
        : Date.now();
      const endedTs = data.ended_at
        ? new Date(data.ended_at).getTime()
        : Date.now();
      let my_tip = 0;
      let tipper_count = 0;
      try {
        if (user?.id) {
          const { data: mine } = await supabase
            .from('live_stream_tips')
            .select('total_gbp')
            .eq('stream_id', data.id)
            .eq('user_id', user.id)
            .maybeSingle();
          my_tip = Number(mine?.total_gbp || 0);
          setMyTipTotal(my_tip);
        }
        const { count } = await supabase
          .from('live_stream_tips')
          .select('*', { count: 'exact', head: true })
          .eq('stream_id', data.id);
        tipper_count = count || 0;
      } catch {
        /* ignore */
      }
      setEndSummary({
        title: data.title,
        duration_seconds: Math.max(0, Math.floor((endedTs - started) / 1000)),
        tip_raised_gbp: Number(data.tip_raised_gbp || 0),
        tip_goal_gbp: Number(data.tip_goal_gbp || 0),
        peak_viewers: Number(data.viewer_count || 0),
        tipper_count,
        showcase_name: data.showcase_name,
        showcase_amount_gbp: data.showcase_amount_gbp,
        showcase_avatar_url: data.showcase_avatar_url,
        my_tip_gbp: my_tip,
        is_host: data.creator_id === user?.id,
      });
    }

    setLoading(false);

    // Private rate from creator live-private settings (fallback voice)
    const { data: creatorRates } = await supabase
      .from('profiles')
      .select(
        'live_private_enabled, live_private_rate_per_minute, live_private_min_minutes, voice_rate_per_minute, voice_min_minutes'
      )
      .eq('id', data.creator_id)
      .single();
    if (creatorRates) {
      setPrivateEnabled(creatorRates.live_private_enabled !== false);
      const rate = Number(
        creatorRates.live_private_rate_per_minute ??
          creatorRates.voice_rate_per_minute ??
          8
      );
      const minM = Math.max(
        1,
        Number(
          creatorRates.live_private_min_minutes ??
            creatorRates.voice_min_minutes ??
            5
        )
      );
      setPrivateRate(rate);
      setPrivateMin(minM);
      setPrivateMinutes(Math.max(minM, 5));
    }

    if (data.private_active) {
      setPrivateEndsAt(data.private_ends_at || null);
      if (
        user?.id &&
        data.creator_id !== user.id &&
        data.private_user_id !== user.id
      ) {
        setPrivateLockedOut(true);
      }
    }

    await loadChat(data.id);

    // My pending request
    if (user?.id && user.id !== data.creator_id) {
      const { data: mine } = await supabase
        .from('live_private_requests')
        .select('*')
        .eq('stream_id', data.id)
        .eq('requester_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();
      setMyPendingPrivate(mine || null);
    }

    // Creator: load pending incoming
    if (user?.id && user.id === data.creator_id) {
      const { data: incoming } = await supabase
        .from('live_private_requests')
        .select('*')
        .eq('stream_id', data.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      const list = incoming || [];
      if (list.length) {
        const ids = list.map((r: any) => r.requester_id);
        const { data: people } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', ids);
        const pmap = new Map((people || []).map((p: any) => [p.id, p]));
        const enriched = list.map((r: any) => ({
          ...r,
          profile: pmap.get(r.requester_id) || null,
        }));
        setIncomingPrivates(enriched);
        enriched.forEach((r: any) => {
          if (privateTimers.current[r.id]) return;
          const created = r.created_at ? new Date(r.created_at).getTime() : Date.now();
          const elapsed = Math.floor((Date.now() - created) / 1000);
          const left = Math.max(1, 60 - elapsed);
          setPrivateReqLeft((m) => ({ ...m, [r.id]: left }));
          privateTimers.current[r.id] = setInterval(() => {
            setPrivateReqLeft((m) => {
              const nleft = (m[r.id] ?? left) - 1;
              if (nleft <= 0) {
                clearInterval(privateTimers.current[r.id]);
                delete privateTimers.current[r.id];
                void respondPrivate(r.id, 'decline');
                return { ...m, [r.id]: 0 };
              }
              return { ...m, [r.id]: nleft };
            });
          }, 1000);
        });
      } else {
        setIncomingPrivates([]);
      }
    }

    return { stream: data, userId: user?.id || null };
  };

  const connectLive = async (streamRow: StreamRow, asCreator: boolean) => {
    setConnecting(true);
    setError('');
    setLiveStatus('connecting');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in again');

      const res = await fetch('/api/live/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ streamId: streamRow.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'PRIVATE_SESSION') {
          setPrivateLockedOut(true);
          setLiveStatus('idle');
          setConnecting(false);
          return;
        }
        throw new Error(data.error || 'Could not join live');
      }
      if (data.private_active) {
        setPrivateEndsAt(data.private_ends_at || null);
      }

      await cleanupRoom();

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video) {
          if (remoteVideoRef.current) track.attach(remoteVideoRef.current);
        }
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.autoplay = true;
          (el as HTMLMediaElement).setAttribute('playsinline', 'true');
          document.body.appendChild(el);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        bumpViewers(Math.max(0, room.numParticipants - 1));
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        bumpViewers(Math.max(0, room.numParticipants - 1));
      });

      await room.connect(data.url, data.token);

      if (asCreator) {
        const videoTrack = await createLocalVideoTrack({
          facingMode: 'user',
        });
        const audioTrack = await createLocalAudioTrack();
        localTracksRef.current = [videoTrack, audioTrack];

        if (localVideoRef.current) {
          videoTrack.attach(localVideoRef.current);
        }

        await room.localParticipant.publishTrack(videoTrack);
        await room.localParticipant.publishTrack(audioTrack);
        setCamOn(true);
        setMicOn(true);

        await supabase
          .from('live_streams')
          .update({
            status: 'active',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', streamRow.id);
      } else {
        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            if (pub.track && pub.track.kind === Track.Kind.Video) {
              if (remoteVideoRef.current)
                pub.track.attach(remoteVideoRef.current);
            }
            if (pub.track && pub.track.kind === Track.Kind.Audio) {
              const el = pub.track.attach();
              el.autoplay = true;
              document.body.appendChild(el);
            }
          });
        });
      }

      bumpViewers(Math.max(0, room.numParticipants - 1));
      setLiveStatus('live');
      setStream((s) => (s ? { ...s, status: 'active' } : s));
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Could not connect');
      setLiveStatus('error');
      await cleanupRoom();
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meta = await loadMeta();
      if (cancelled || !meta?.stream) return;
      if (meta.stream.status === 'ended') return;
      const asCreator = meta.userId === meta.stream.creator_id;
      await connectLive(meta.stream, asCreator);
    })();

    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('live_streams')
        .select(
          'status, viewer_count, tip_raised_gbp, tip_goal_gbp, title, started_at, ended_at, created_at, private_active, private_user_id, private_ends_at, private_request_id, showcase_user_id, showcase_amount_gbp, showcase_name, showcase_avatar_url'
        )
        .eq('id', id)
        .single();
      if (data) {
        setStream((s) => {
          const next = s ? { ...s, ...data } : s;
          if (data.private_active && userId) {
            const isC = !!(next && next.creator_id === userId);
            const isF = data.private_user_id === userId;
            setPrivateLockedOut(!!(data.private_active && !isC && !isF));
          } else if (!data.private_active) {
            setPrivateLockedOut(false);
          }
          return next;
        });
        setPrivateEndsAt(data.private_ends_at || null);
        if (data.status === 'ended') {
          setLiveStatus('ended');
          void cleanupRoom();
          setStream((s) => {
            const merged = (s ? { ...s, ...data } : data) as StreamRow;
            // Fire summary once for non-owners (owner already has endSummary from API)
            if (s && s.creator_id !== userId) {
              void (async () => {
                const started = merged.started_at || merged.created_at
                  ? new Date(merged.started_at || merged.created_at!).getTime()
                  : Date.now();
                const endedTs = merged.ended_at
                  ? new Date(merged.ended_at).getTime()
                  : Date.now();
                let my_tip = 0;
                let tipper_count = 0;
                try {
                  if (userId) {
                    const { data: mine } = await supabase
                      .from('live_stream_tips')
                      .select('total_gbp')
                      .eq('stream_id', id)
                      .eq('user_id', userId)
                      .maybeSingle();
                    my_tip = Number(mine?.total_gbp || 0);
                    setMyTipTotal(my_tip);
                  }
                  const { count } = await supabase
                    .from('live_stream_tips')
                    .select('*', { count: 'exact', head: true })
                    .eq('stream_id', id);
                  tipper_count = count || 0;
                } catch {
                  /* ignore */
                }
                setEndSummary({
                  title: merged.title,
                  duration_seconds: Math.max(
                    0,
                    Math.floor((endedTs - started) / 1000)
                  ),
                  tip_raised_gbp: Number(merged.tip_raised_gbp || 0),
                  tip_goal_gbp: Number(merged.tip_goal_gbp || 0),
                  peak_viewers: Number(merged.viewer_count || 0),
                  tipper_count,
                  showcase_name: merged.showcase_name,
                  showcase_amount_gbp: merged.showcase_amount_gbp,
                  showcase_avatar_url: merged.showcase_avatar_url,
                  my_tip_gbp: my_tip,
                });
              })();
            }
            return merged;
          });
        }
      }
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      cleanupRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Realtime chat
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`live-chat-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_chat_messages',
          filter: `stream_id=eq.${id}`,
        },
        async (payload) => {
          const row = payload.new as any;
          if (!row?.id) return;
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              {
                ...row,
                profile: null,
              },
            ].slice(-50);
          });
          // Enrich profile in background
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', row.user_id)
            .single();
          if (profile) {
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === row.id ? { ...m, profile } : m
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, supabase]);

  const chatNearBottom = useRef(true);

  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box) return;
    const onScroll = () => {
      const dist = box.scrollHeight - box.scrollTop - box.clientHeight;
      chatNearBottom.current = dist < 80;
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => box.removeEventListener('scroll', onScroll);
  }, [liveStatus]);

  useEffect(() => {
    if (!chatNearBottom.current) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Realtime private requests + stream private flag
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`live-private-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_private_requests',
          filter: `stream_id=eq.${id}`,
        },
        async (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.status === 'pending' && isOwner) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('username, display_name, avatar_url')
              .eq('id', row.requester_id)
              .single();
            setIncomingPrivates((prev) => {
              if (prev.some((p) => p.id === row.id)) return prev;
              playPrivateChime();
              // 60s auto-decline countdown
              setPrivateReqLeft((m) => ({ ...m, [row.id]: 60 }));
              if (privateTimers.current[row.id]) {
                clearInterval(privateTimers.current[row.id]);
              }
              privateTimers.current[row.id] = setInterval(() => {
                setPrivateReqLeft((m) => {
                  const left = (m[row.id] ?? 60) - 1;
                  if (left <= 0) {
                    clearInterval(privateTimers.current[row.id]);
                    delete privateTimers.current[row.id];
                    void respondPrivate(row.id, 'decline');
                    return { ...m, [row.id]: 0 };
                  }
                  return { ...m, [row.id]: left };
                });
              }, 1000);
              return [...prev, { ...row, profile }];
            });
          }
          if (row.status !== 'pending') {
            setIncomingPrivates((prev) => prev.filter((p) => p.id !== row.id));
            if (privateTimers.current[row.id]) {
              clearInterval(privateTimers.current[row.id]);
              delete privateTimers.current[row.id];
            }
            setPrivateReqLeft((m) => {
              const n = { ...m };
              delete n[row.id];
              return n;
            });
            if (userId && row.requester_id === userId) {
              setMyPendingPrivate(null);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_streams',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          setStream((s) => (s ? { ...s, ...row } : s));
          setPrivateEndsAt(row.private_ends_at || null);
          if (!row.private_active) {
            setPrivateLockedOut(false);
          }
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
      Object.values(privateTimers.current).forEach(clearInterval);
      privateTimers.current = {};
    };
  }, [id, supabase, isOwner, userId]);

  // Countdown timer for private
  useEffect(() => {
    if (!privateEndsAt || !stream?.private_active) {
      setPrivateCountdown('');
      return;
    }
    const tick = () => {
      const ms = new Date(privateEndsAt).getTime() - Date.now();
      if (ms <= 0) {
        setPrivateCountdown('0:00');
        // auto end
        void (async () => {
          try {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            await fetch('/api/live/private/end', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({ stream_id: id }),
            });
          } catch {
            /* ignore */
          }
        })();
        return;
      }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setPrivateCountdown(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [privateEndsAt, stream?.private_active, id, supabase]);

  useEffect(() => {
    if (liveStatus !== 'live' || !id) return;
    const push = () => {
      const n = roomRef.current
        ? Math.max(0, roomRef.current.numParticipants - (isOwner ? 1 : 0))
        : viewerCount;
      // Creator subtracts self; viewers report room size minus 1 (creator)
      let count = n;
      if (!isOwner && roomRef.current) {
        count = Math.max(0, roomRef.current.numParticipants - 1);
      }
      bumpViewers(count);
      if (isOwner) {
        void supabase
          .from('live_streams')
          .update({
            viewer_count: count,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      }
    };
    push();
    const t = setInterval(push, 5000);
    return () => clearInterval(t);
  }, [isOwner, liveStatus, id, supabase]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const toggleCam = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOn;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  };

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  };

  const sendChat = async () => {
    const text = chatText.trim();
    if (!text || !userId || !stream || sendingChat) return;
    if (text.length > 300) return;
    setSendingChat(true);
    try {
      const { data, error: insErr } = await supabase
        .from('live_chat_messages')
        .insert({
          stream_id: stream.id,
          user_id: userId,
          content: text,
        })
        .select('*')
        .single();

      if (insErr) throw new Error(insErr.message);
      setChatText('');
      // Optimistic already covered by realtime; if slow, push local
      if (data) {
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === data.id)) return prev;
          return [
            ...prev,
            {
              ...data,
              profile: myProfile,
            },
          ].slice(-50);
        });
      }
    } catch (e: any) {
      alert(e.message || 'Could not send');
    } finally {
      setSendingChat(false);
    }
  };


  const requestPrivate = async () => {
    if (!stream || isOwner) return;
    setRequestingPrivate(true);
    setPrivateError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in again');
      const res = await fetch('/api/live/private/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          stream_id: stream.id,
          minutes: privateMinutes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_BALANCE') {
          const go = confirm(
            `Need £${Number(data.needed).toFixed(2)} in wallet. Top up?`
          );
          if (go) window.location.href = '/wallet';
          return;
        }
        throw new Error(data.error || 'Request failed');
      }
      setMyPendingPrivate(data.request);
      setShowPrivate(false);
    } catch (e: any) {
      setPrivateError(e.message || 'Failed');
    } finally {
      setRequestingPrivate(false);
    }
  };

  const respondPrivate = async (requestId: string, action: 'accept' | 'decline') => {
    setPrivateBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/live/private/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ request_id: requestId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      setIncomingPrivates((prev) => prev.filter((p) => p.id !== requestId));
      if (action === 'accept' && data.private_ends_at) {
        setPrivateEndsAt(data.private_ends_at);
        setStream((s) =>
          s
            ? {
                ...s,
                private_active: true,
                private_ends_at: data.private_ends_at,
              }
            : s
        );
      }
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setPrivateBusy(false);
    }
  };

  const endPrivate = async () => {
    if (!confirm('End private session and return to public live?')) return;
    setPrivateBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/live/private/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ stream_id: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      setStream((s) =>
        s
          ? {
              ...s,
              private_active: false,
              private_user_id: null,
              private_ends_at: null,
            }
          : s
      );
      setPrivateEndsAt(null);
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setPrivateBusy(false);
    }
  };


  const shareLive = async () => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/live/${id}`
        : '';
    try {
      if (navigator.share) {
        await navigator.share({
          title: stream?.title || 'Live on World Of Dommes',
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } catch {
        /* ignore */
      }
    }
  };

  const toggleFollow = async () => {
    if (!userId || !stream || isOwner || followBusy) return;
    setFollowBusy(true);
    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', userId)
          .eq('following_id', stream.creator_id);
        setIsFollowing(false);
      } else {
        await supabase.from('follows').insert({
          follower_id: userId,
          following_id: stream.creator_id,
        });
        setIsFollowing(true);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setFollowBusy(false);
    }
  };

  const sendTip = async (amount: number) => {
    if (!stream || isOwner) return;
    setTipping(true);
    setTipError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in again');

      const res = await fetch('/api/live/tip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ stream_id: stream.id, amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_BALANCE') {
          const go = confirm(
            `Not enough balance (need £${Number(data.needed || amount).toFixed(2)}). Open wallet?`
          );
          if (go) window.location.href = '/wallet';
          return;
        }
        throw new Error(data.error || 'Tip failed');
      }
      if (typeof data.balance === 'number') {
        notifyBalanceUpdated(data.balance);
      }
      setStream((s) =>
        s
          ? {
              ...s,
              tip_raised_gbp: data.tip_raised_gbp,
              tip_goal_gbp: data.tip_goal_gbp ?? s.tip_goal_gbp,
              showcase_user_id:
                data.showcase?.user_id ?? s.showcase_user_id,
              showcase_amount_gbp:
                data.showcase?.amount_gbp ?? s.showcase_amount_gbp,
              showcase_name: data.showcase?.name ?? s.showcase_name,
              showcase_avatar_url:
                data.showcase?.avatar_url ?? s.showcase_avatar_url,
            }
          : s
      );
      const flash = data.is_showcase
        ? `£${Number(data.amount).toFixed(2)} · You're top tipper 👑`
        : `£${Number(data.amount).toFixed(2)} tipped`;
      setTipFlash(flash);
      playTipChime();
      setTimeout(() => setTipFlash(null), 3200);
      setShowTip(false);
      setCustomTip('');

      if (typeof data.user_total === 'number') {
        setMyTipTotal(Number(data.user_total));
      } else {
        setMyTipTotal((prev) =>
          Math.round((prev + Number(data.amount || 0)) * 100) / 100
        );
      }
      const newRaised = Number(data.tip_raised_gbp || 0);
      const goalAmt = Number(data.tip_goal_gbp || stream.tip_goal_gbp || 0);
      if (goalAmt > 0 && prevRaised.current < goalAmt && newRaised >= goalAmt) {
        setGoalReachedFlash(true);
        playGoalChime();
        setTimeout(() => setGoalReachedFlash(false), 4500);
      }
      prevRaised.current = newRaised;

      // Optional system-style chat line from tipper
      const tipLine = `tipped £${Number(data.amount).toFixed(2)} 💸`;
      try {
        await supabase.from('live_chat_messages').insert({
          stream_id: stream.id,
          user_id: userId!,
          content: tipLine,
        });
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      setTipError(e.message || 'Tip failed');
    } finally {
      setTipping(false);
    }
  };


  const endLive = async () => {
    if (!confirm('End this live stream? It will not be saved.')) return;
    setEnding(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const peak = Math.max(peakViewers, viewerCount);
      await cleanupRoom();
      const res = await fetch('/api/live/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          stream_id: id,
          peak_viewers: peak,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not end');
      setLiveStatus('ended');
      setEndSummary({
        ...(data.summary || {
          title: stream?.title,
          duration_seconds: liveStartedAt
            ? Math.floor((Date.now() - liveStartedAt) / 1000)
            : 0,
          tip_raised_gbp: Number(stream?.tip_raised_gbp || 0),
          tip_goal_gbp: Number(stream?.tip_goal_gbp || 0),
          peak_viewers: peak,
          tipper_count: 0,
          showcase_name: stream?.showcase_name,
          showcase_amount_gbp: stream?.showcase_amount_gbp,
          showcase_avatar_url: stream?.showcase_avatar_url,
        }),
        my_tip_gbp: 0,
        is_host: true,
      });
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setEnding(false);
    }
  };

  const formatDuration = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0)
      return `${h}:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
    return `${m}:${r.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <Loader2 className="animate-spin text-pink-500" size={28} />
        </div>
  
        <style dangerouslySetInnerHTML={{ __html: `
.mask-fade-chat {
            mask-image: linear-gradient(to bottom, transparent, black 12%, black 100%);
            -webkit-mask-image: linear-gradient(to bottom, transparent, black 12%, black 100%);
          }
        `}} />
    </AuthGuard>
    );
  }

  if (error && !stream) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <p className="text-zinc-300 mb-4">{error}</p>
              <Link href="/live" className="text-pink-400 hover:text-pink-300">
                ← Back to Live
              </Link>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const name =
    creator?.display_name ||
    (creator?.username ? `@${creator.username}` : 'Creator');
  const ended = liveStatus === 'ended' || stream?.status === 'ended';
  const goal = Number(stream?.tip_goal_gbp || 0);
  const raised = Number(stream?.tip_raised_gbp || 0);

  const displayName = (m: ChatMsg) =>
    m.profile?.display_name ||
    (m.profile?.username ? `@${m.profile.username}` : 'Fan');

  const isCreatorMsg = (m: ChatMsg) =>
    !!stream && m.user_id === stream.creator_id;

  return (
    <AuthGuard>
      <div className="bg-black text-white flex lg:min-h-screen">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Mobile: fixed full viewport so no black gap under browser chrome */}
        <main
          className="flex-1 flex flex-col relative bg-black
            fixed inset-0 z-[45] lg:static lg:z-auto
            h-[100dvh] max-h-[100dvh] w-full overflow-hidden"
        >
          <div className="absolute inset-0 bg-black">
            {ended ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-5 overflow-y-auto py-10 bg-black">
                <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl">
                  {/* Header — creator focused for viewers */}
                  <div className="text-center mb-5">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center mx-auto mb-3 overflow-hidden text-2xl font-bold">
                      {creator?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={creator.avatar_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        (name || 'C')[0]?.toUpperCase()
                      )}
                    </div>
                    <p className="text-xl font-bold text-white leading-tight">
                      {isOwner ? 'Your live ended' : `${name} ended the live`}
                    </p>
                    <p className="text-sm text-zinc-300 mt-1.5 truncate px-2">
                      {endSummary?.title || stream?.title || 'Live stream'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Not saved · no replay
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 mb-4">
                    <div className="bg-zinc-800/80 rounded-2xl p-3 text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                        Duration
                      </p>
                      <p className="text-lg font-semibold mt-0.5 tabular-nums">
                        {formatDuration(
                          Number(endSummary?.duration_seconds || 0)
                        )}
                      </p>
                    </div>
                    {isOwner ? (
                      <div className="bg-zinc-800/80 rounded-2xl p-3 text-center">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                          Peak viewers
                        </p>
                        <p className="text-lg font-semibold mt-0.5 tabular-nums">
                          {Number(
                            endSummary?.peak_viewers || peakViewers || 0
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-zinc-800/80 rounded-2xl p-3 text-center">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                          You tipped
                        </p>
                        <p className="text-lg font-semibold mt-0.5 text-pink-400 tabular-nums">
                          £
                          {Number(
                            endSummary?.my_tip_gbp ?? myTipTotal ?? 0
                          ).toFixed(2)}
                        </p>
                      </div>
                    )}
                    <div className="bg-zinc-800/80 rounded-2xl p-3 text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                        {isOwner ? 'Tips raised' : 'Total tips'}
                      </p>
                      <p className="text-lg font-semibold text-pink-400 mt-0.5 tabular-nums">
                        £{Number(endSummary?.tip_raised_gbp || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-zinc-800/80 rounded-2xl p-3 text-center">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                        Tippers
                      </p>
                      <p className="text-lg font-semibold mt-0.5 tabular-nums">
                        {Number(endSummary?.tipper_count || 0)}
                      </p>
                    </div>
                  </div>

                  {/* Viewer personal line */}
                  {!isOwner && (
                    <div
                      className={`mb-4 rounded-2xl px-4 py-3 border ${
                        Number(endSummary?.my_tip_gbp ?? myTipTotal ?? 0) > 0
                          ? 'bg-pink-600/15 border-pink-500/30'
                          : 'bg-zinc-800/50 border-zinc-700'
                      }`}
                    >
                      <p className="text-[11px] text-zinc-400 uppercase font-medium">
                        Your support
                      </p>
                      {Number(endSummary?.my_tip_gbp ?? myTipTotal ?? 0) > 0 ? (
                        <p className="text-sm text-white mt-0.5">
                          You tipped{' '}
                          <span className="font-bold text-pink-300">
                            £
                            {Number(
                              endSummary?.my_tip_gbp ?? myTipTotal
                            ).toFixed(2)}
                          </span>{' '}
                          this live
                        </p>
                      ) : (
                        <p className="text-sm text-zinc-400 mt-0.5">
                          You didn&apos;t tip this live
                        </p>
                      )}
                    </div>
                  )}

                  {endSummary?.showcase_name &&
                    Number(endSummary?.showcase_amount_gbp || 0) > 0 && (
                      <div className="flex items-center gap-3 bg-gradient-to-r from-pink-600/20 to-rose-600/10 border border-pink-500/30 rounded-2xl px-3 py-2.5 mb-5">
                        {endSummary.showcase_avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={endSummary.showcase_avatar_url}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-pink-700 flex items-center justify-center text-sm font-bold">
                            {String(endSummary.showcase_name)[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase text-pink-300 font-bold flex items-center gap-1">
                            <Crown size={11} className="text-yellow-300" /> Top
                            tipper
                          </p>
                          <p className="text-sm font-semibold truncate">
                            {endSummary.showcase_name}
                          </p>
                          <p className="text-xs text-pink-200">
                            £
                            {Number(endSummary.showcase_amount_gbp).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    )}

                  {!isOwner && creator?.username && (
                    <Link
                      href={`/${creator.username}`}
                      className="block w-full text-center py-3 mb-2 rounded-2xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 font-medium text-sm transition"
                    >
                      View {name}&apos;s profile
                    </Link>
                  )}
                  <Link
                    href="/live"
                    className="block w-full text-center py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold text-sm"
                  >
                    {isOwner ? 'Back to Live' : 'Discover more lives'}
                  </Link>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => router.push('/live')}
                      className="w-full mt-2 py-2.5 text-sm text-zinc-400 hover:text-white"
                    >
                      Go live again
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={isOwner ? localVideoRef : remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={isOwner}
                  className="absolute inset-0 w-full h-full object-cover bg-black"
                />
                {isOwner && (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="hidden"
                  />
                )}

                {(connecting || liveStatus === 'connecting') && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3 z-10">
                    <Loader2 className="animate-spin text-pink-500" size={32} />
                    <p className="text-sm text-zinc-300">
                      {isOwner ? 'Turning on camera…' : 'Joining live…'}
                    </p>
                  </div>
                )}

                {error && liveStatus === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 text-center z-10">
                    <p className="text-red-300 text-sm mb-4">{error}</p>
                    <button
                      type="button"
                      onClick={() => stream && connectLive(stream, isOwner)}
                      className="px-4 py-2.5 rounded-xl bg-pink-600 text-sm font-medium min-h-[44px]"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Top bar */}
            {!ended && (
              <div
                className="absolute top-0 inset-x-0 z-20 flex items-start justify-between gap-3 px-3 pointer-events-none"
                style={{
                  paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
                }}
              >
                <div className="flex items-center gap-2 pointer-events-auto min-w-0">
                  <button
                    type="button"
                    onClick={() => router.push('/live')}
                    className="w-10 h-10 rounded-full bg-black/50 backdrop-blur border border-white/10 flex items-center justify-center flex-shrink-0"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="min-w-0 bg-black/45 backdrop-blur-md rounded-xl sm:rounded-2xl px-2.5 py-1 sm:px-3 sm:py-1.5 border border-white/10">
                    <p className="text-xs sm:text-sm font-semibold truncate max-w-[36vw] sm:max-w-xs leading-tight">
                      {name}
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-zinc-300 truncate max-w-[36vw] sm:max-w-xs leading-tight">
                      {stream?.title}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pointer-events-auto flex-shrink-0">
                  <span className="bg-red-600 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </span>
                  <span className="bg-black/50 backdrop-blur text-[11px] sm:text-xs px-2 py-1 rounded-full flex items-center gap-1 border border-white/10 tabular-nums">
                    <Users size={12} />
                    {viewerCount || stream?.viewer_count || 0}
                  </span>
                  {/* Desktop: follow + share inline */}
                  <div className="hidden sm:flex items-center gap-1.5">
                    {!isOwner && userId && (
                      <button
                        type="button"
                        onClick={() => void toggleFollow()}
                        disabled={followBusy}
                        className={`h-8 px-2.5 rounded-full text-[11px] font-semibold border backdrop-blur flex items-center gap-1 transition ${
                          isFollowing
                            ? 'bg-black/50 border-white/15 text-zinc-200'
                            : 'bg-pink-600/90 border-pink-400/40 text-white'
                        }`}
                      >
                        {isFollowing ? 'Following' : (
                          <>
                            <UserPlus size={12} /> Follow
                          </>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void shareLive()}
                      className="h-8 w-8 rounded-full bg-black/50 backdrop-blur border border-white/15 flex items-center justify-center"
                      title="Share"
                    >
                      {linkCopied ? (
                        <Check size={14} className="text-green-400" />
                      ) : (
                        <Share2 size={14} />
                      )}
                    </button>
                  </div>
                  {/* Mobile: overflow menu */}
                  <div className="relative sm:hidden">
                    <button
                      type="button"
                      onClick={() => setShowMore((v) => !v)}
                      className="h-8 w-8 rounded-full bg-black/50 backdrop-blur border border-white/15 flex items-center justify-center"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {showMore && (
                      <div className="absolute right-0 top-9 w-40 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-40">
                        {!isOwner && userId && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowMore(false);
                              void toggleFollow();
                            }}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <UserPlus size={14} className="text-pink-400" />
                            {isFollowing ? 'Unfollow' : 'Follow'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setShowMore(false);
                            void shareLive();
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-800 flex items-center gap-2"
                        >
                          <Share2 size={14} className="text-pink-400" />
                          {linkCopied ? 'Copied!' : 'Share'}
                        </button>
                        <Link
                          href={creator?.username ? `/${creator.username}` : '/live'}
                          onClick={() => setShowMore(false)}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-800 block"
                        >
                          View profile
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tip goal — left, never full-width on mobile */}
            {!ended && (goal > 0 || raised > 0) && (
              <div className="absolute top-[3.75rem] sm:top-20 left-3 z-20 pointer-events-none max-w-[48%] sm:max-w-[220px]">
                <div className="bg-black/55 backdrop-blur-md rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 border border-white/10">
                  <div className="flex justify-between gap-2 text-[10px] sm:text-[11px] mb-1">
                    <span className="text-zinc-300 truncate">
                      {goal > 0 ? 'Tip goal' : 'Tips'}
                    </span>
                    <span className="font-semibold tabular-nums flex-shrink-0">
                      {goal > 0
                        ? `£${raised.toFixed(0)}/£${goal.toFixed(0)}`
                        : `£${raised.toFixed(2)}`}
                    </span>
                  </div>
                  {goal > 0 && (
                    <div className="h-1 sm:h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-pink-600 to-rose-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, (raised / goal) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Top tipper — compact on mobile */}
            {!ended &&
              stream?.showcase_user_id &&
              Number(stream.showcase_amount_gbp || 0) > 0 && (
                <div className="absolute top-[3.75rem] sm:top-20 right-3 z-20 pointer-events-none max-w-[46%] sm:max-w-[180px]">
                  <div className="bg-gradient-to-br from-pink-600/95 to-rose-700/95 backdrop-blur border border-pink-400/30 rounded-xl sm:rounded-2xl px-2 py-1.5 sm:px-3 sm:py-2.5 shadow-lg">
                    <div className="flex items-center gap-1 mb-0.5 sm:mb-1.5">
                      <Crown size={10} className="text-yellow-300 flex-shrink-0" />
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-pink-100">
                        Top tipper
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {stream.showcase_avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={stream.showcase_avatar_url}
                          alt=""
                          className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover border border-white/30 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-pink-800 flex items-center justify-center text-[10px] sm:text-xs font-bold flex-shrink-0">
                          {(stream.showcase_name || '?')[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold truncate text-white leading-tight">
                          {stream.showcase_name || 'Fan'}
                        </p>
                        <p className="text-[10px] sm:text-xs text-pink-100/90 font-medium tabular-nums">
                          £{Number(stream.showcase_amount_gbp).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {tipFlash && (
              <div className="absolute top-[28%] inset-x-0 z-30 flex justify-center pointer-events-none px-4">
                <div className="bg-gradient-to-r from-pink-600 to-rose-500 text-white text-sm font-bold px-6 py-3.5 rounded-2xl shadow-2xl shadow-pink-900/50 border border-white/20 animate-in zoom-in-95 fade-in duration-300">
                  {tipFlash}
                </div>
              </div>
            )}

            {goalReachedFlash && (
              <div className="absolute top-[22%] inset-x-0 z-30 flex justify-center pointer-events-none px-4">
                <div className="bg-black/70 backdrop-blur-md text-white px-6 py-4 rounded-3xl shadow-2xl border border-yellow-400/40 flex items-center gap-3 animate-in zoom-in-95 fade-in">
                  <Sparkles className="text-yellow-300" size={22} />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-yellow-300">
                      Goal reached
                    </p>
                    <p className="text-sm font-semibold">
                      Tip goal smashed — thank you
                    </p>
                  </div>
                </div>
              </div>
            )}


            
            {/* Private locked out for other viewers */}
            {privateLockedOut && !ended && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 px-6 text-center">
                <Lock className="text-pink-500 mb-3" size={40} />
                <p className="text-lg font-semibold text-white">Private session</p>
                <p className="text-sm text-zinc-400 mt-2 max-w-sm">
                  The creator is in a paid private with another fan. Public live is paused.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/live')}
                  className="mt-6 px-5 py-2.5 rounded-xl bg-zinc-800 text-sm font-medium"
                >
                  Back to Live
                </button>
              </div>
            )}

            {/* Private active badge */}
            {!ended && stream?.private_active && (isOwner || isPrivateFan) && (
              <div className="absolute top-[7.5rem] sm:top-36 right-3 z-25 pointer-events-none">
                <div className="bg-pink-600/90 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow">
                  <Lock size={12} />
                  PRIVATE
                  {privateCountdown && (
                    <span className="font-mono ml-1">{privateCountdown}</span>
                  )}
                </div>
              </div>
            )}

            {/* Chat — fixed height, swipe/scroll to older messages */}
            {!ended && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none px-3"
                style={{
                  bottom:
                    'max(4.25rem, calc(env(safe-area-inset-bottom) + 3.5rem))',
                }}
              >
                <div
                  ref={chatBoxRef}
                  className="max-w-md max-h-[28vh] sm:max-h-[32vh] overflow-y-auto overscroll-contain pointer-events-auto mask-fade-chat pr-1 space-y-1.5"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'thin',
                  }}
                >
                  {chatMessages.slice(-40).map((m) => (
                    <div key={m.id} className="flex items-start gap-2">
                      <div className="bg-black/55 backdrop-blur-md rounded-2xl px-2.5 py-1.5 max-w-[92%] border border-white/5 shadow-sm">
                        <span
                          className={`text-xs font-semibold mr-1.5 ${
                            isCreatorMsg(m)
                              ? 'text-pink-300'
                              : 'text-zinc-200/90'
                          }`}
                        >
                          {displayName(m)}
                          {isCreatorMsg(m) && (
                            <span className="ml-1 text-[9px] font-bold uppercase tracking-wide bg-pink-500/30 text-pink-200 px-1.5 py-0.5 rounded-md">
                              Host
                            </span>
                          )}
                        </span>
                        <span className="text-sm text-white/95 break-words">
                          {m.content}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </div>
            )}

            {/* Bottom: chat input + tip / creator controls */}
            {!ended && liveStatus === 'live' && (
              <div
                className="absolute bottom-0 inset-x-0 z-30 px-3 pointer-events-none"
                style={{
                  paddingBottom:
                    'max(0.5rem, env(safe-area-inset-bottom))',
                }}
              >
                <div className="pointer-events-auto flex items-center gap-2 max-w-2xl mx-auto">
                  <div className="flex-1 flex items-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/15 rounded-full pl-3 sm:pl-4 pr-1 py-1 min-w-0">
                    <input
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value.slice(0, 300))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void sendChat();
                        }
                      }}
                      placeholder="Say something…"
                      className="flex-1 min-w-0 bg-transparent text-base sm:text-sm outline-none placeholder:text-zinc-400"
                      style={{ fontSize: '16px' }}
                      maxLength={300}
                      enterKeyHint="send"
                      autoComplete="off"
                      autoCorrect="on"
                    />
                    <button
                      type="button"
                      onClick={() => void sendChat()}
                      disabled={sendingChat || !chatText.trim()}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 flex items-center justify-center flex-shrink-0 transition"
                    >
                      {sendingChat ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                    </button>
                  </div>

                  {!isOwner && !stream?.private_active && privateEnabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setTipError('');
                          setShowTip(true);
                        }}
                        className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-r from-pink-600 to-rose-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-pink-900/40 active:scale-95 transition"
                        title="Tip"
                      >
                        <DollarSign size={20} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPrivateError('');
                          setShowPrivate(true);
                        }}
                        disabled={!!myPendingPrivate}
                        className="h-11 w-11 sm:h-12 sm:w-auto sm:px-3 rounded-full bg-zinc-900/90 border border-pink-500/50 text-pink-300 text-xs font-semibold flex items-center justify-center gap-1.5 flex-shrink-0 disabled:opacity-50"
                        title="Request private"
                      >
                        <Lock size={16} className="sm:w-3.5 sm:h-3.5" />
                        <span className="hidden sm:inline">
                          {myPendingPrivate ? 'Pending' : 'Private'}
                        </span>
                      </button>
                    </>
                  )}

                  {(isOwner || isPrivateFan) && stream?.private_active && (
                    <button
                      type="button"
                      onClick={() => void endPrivate()}
                      disabled={privateBusy}
                      className="h-12 px-3 rounded-full bg-pink-700 text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"
                    >
                      <Unlock size={14} />
                      End private
                    </button>
                  )}

                  {isOwner && (
                    <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur border border-white/15 rounded-full px-1.5 py-1.5">
                      <button
                        type="button"
                        onClick={toggleMic}
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          micOn ? 'bg-zinc-800' : 'bg-red-600'
                        }`}
                      >
                        {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                      </button>
                      <button
                        type="button"
                        onClick={toggleCam}
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          camOn ? 'bg-zinc-800' : 'bg-red-600'
                        }`}
                      >
                        {camOn ? <Video size={18} /> : <VideoOff size={18} />}
                      </button>
                      <button
                        type="button"
                        onClick={endLive}
                        disabled={ending}
                        className="h-10 px-3 rounded-full bg-red-600 text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        {ending ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <PhoneOff size={16} />
                        )}
                        End
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Tip sheet */}
        {showTip && (
          <div className="fixed inset-0 z-[220] bg-black/70 flex items-end sm:items-center justify-center">
            <div
              className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl overflow-hidden"
              style={{
                paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
              }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <DollarSign className="text-pink-500" size={20} /> Tip {name}
                </h3>
                <button
                  type="button"
                  onClick={() => !tipping && setShowTip(false)}
                  className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  {TIP_PRESETS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={tipping}
                      onClick={() => {
                        setTipAmount(a);
                        setCustomTip('');
                      }}
                      className={`py-3 rounded-xl text-sm font-semibold border transition ${
                        tipAmount === a && !customTip
                          ? 'bg-pink-600 border-pink-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-200'
                      }`}
                    >
                      £{a}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">
                    Custom amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                      £
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={customTip}
                      onChange={(e) => {
                        setCustomTip(e.target.value);
                        const n = Number(e.target.value);
                        if (n >= 1) setTipAmount(n);
                      }}
                      placeholder="Other"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-4 py-3 text-sm outline-none focus:border-pink-500"
                    />
                  </div>
                </div>
                {tipError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    {tipError}
                  </p>
                )}
                <button
                  type="button"
                  disabled={tipping || tipAmount < 1}
                  onClick={() => sendTip(tipAmount)}
                  className="w-full min-h-[48px] py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {tipping ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Sending…
                    </>
                  ) : (
                    <>Send £{Number(tipAmount).toFixed(2)}</>
                  )}
                </button>
                <p className="text-center text-xs text-zinc-500">
                  Paid from your wallet balance
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Incoming private requests (creator) */}
        
        {/* Fan waiting for private accept */}
        {!isOwner && myPendingPrivate && !stream?.private_active && (
          <div className="fixed inset-x-0 top-14 sm:top-16 z-[205] flex justify-center px-3 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md bg-zinc-900/95 border border-zinc-700 rounded-2xl px-4 py-3 shadow-xl flex items-center gap-3">
              <Loader2 className="animate-spin text-pink-500 flex-shrink-0" size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Private requested</p>
                <p className="text-xs text-zinc-400">
                  Waiting for creator · {myPendingPrivate.minutes} min · £
                  {Number(myPendingPrivate.amount_gbp).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        )}

        {isOwner && incomingPrivates.length > 0 && !stream?.private_active && (
          <div className="fixed inset-x-0 top-14 sm:top-16 z-[210] flex justify-center px-3 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md space-y-2">
              {incomingPrivates.map((req) => {
                const n =
                  req.profile?.display_name ||
                  (req.profile?.username
                    ? `@${req.profile.username}`
                    : 'Fan');
                const left = privateReqLeft[req.id];
                return (
                  <div
                    key={req.id}
                    className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-pink-950/40 border border-pink-500/50 rounded-2xl p-4 shadow-2xl shadow-pink-900/30 animate-in fade-in slide-in-from-top-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {req.profile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={req.profile.avatar_url}
                            alt=""
                            className="w-11 h-11 rounded-full object-cover border-2 border-pink-500/40"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-pink-600/30 flex items-center justify-center text-sm font-bold text-pink-200">
                            {(n || '?')[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide text-pink-400 flex items-center gap-1.5">
                            <Lock size={12} />
                            Private request
                          </p>
                          <p className="text-sm font-semibold text-white truncate mt-0.5">
                            {n}
                          </p>
                          <p className="text-xs text-zinc-300 mt-0.5">
                            {req.minutes} min ·{' '}
                            <span className="text-pink-300 font-semibold">
                              £{Number(req.amount_gbp).toFixed(2)}
                            </span>
                            {' · '}
                            £{Number(req.rate_per_minute).toFixed(2)}/min
                          </p>
                        </div>
                      </div>
                      {typeof left === 'number' && left > 0 && (
                        <div className="flex-shrink-0 text-center">
                          <p className="text-[10px] text-zinc-500 uppercase">Expires</p>
                          <p className="text-sm font-mono font-bold text-pink-300">
                            {left}s
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3.5">
                      <button
                        type="button"
                        disabled={privateBusy}
                        onClick={() => void respondPrivate(req.id, 'decline')}
                        className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={privateBusy}
                        onClick={() => void respondPrivate(req.id, 'accept')}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 text-sm font-semibold shadow-lg shadow-pink-900/40"
                      >
                        Accept · £{Number(req.amount_gbp).toFixed(2)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Request private sheet */}
        {showPrivate && (
          <div className="fixed inset-0 z-[220] bg-black/70 flex items-end sm:items-center justify-center">
            <div
              className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl overflow-hidden"
              style={{
                paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
              }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Lock className="text-pink-500" size={20} /> Request private
                </h3>
                <button
                  type="button"
                  onClick={() => !requestingPrivate && setShowPrivate(false)}
                  className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-5 py-5 space-y-5">
                <p className="text-sm text-zinc-400">
                  Public live pauses for everyone else. Only you and the creator
                  stay connected.
                </p>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-zinc-400">Minutes</span>
                    <span className="font-semibold text-white">
                      {privateMinutes} min
                    </span>
                  </div>
                  <input
                    type="range"
                    min={privateMin}
                    max={60}
                    step={1}
                    value={privateMinutes}
                    onChange={(e) => setPrivateMinutes(Number(e.target.value))}
                    className="w-full accent-pink-500"
                  />
                  <div className="flex justify-between text-[11px] text-zinc-500 mt-1">
                    <span>{privateMin} min</span>
                    <span>60 min</span>
                  </div>
                </div>
                <div className="bg-zinc-800/80 rounded-2xl p-4 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-zinc-500">Rate</p>
                    <p className="font-medium">
                      £{privateRate.toFixed(2)}/min
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500">Total</p>
                    <p className="text-xl font-bold text-pink-400">
                      £{(privateRate * privateMinutes).toFixed(2)}
                    </p>
                  </div>
                </div>
                {privateError && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    {privateError}
                  </p>
                )}
                <button
                  type="button"
                  disabled={requestingPrivate}
                  onClick={() => void requestPrivate()}
                  className="w-full min-h-[48px] py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {requestingPrivate ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Sending…
                    </>
                  ) : (
                    <>Request · £{(privateRate * privateMinutes).toFixed(2)}</>
                  )}
                </button>
                <p className="text-center text-xs text-zinc-500">
                  Charged from wallet only if the creator accepts
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </AuthGuard>
  );
}
