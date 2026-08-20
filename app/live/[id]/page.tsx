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
  private_active?: boolean;
  private_user_id?: string | null;
  private_ends_at?: string | null;
  private_request_id?: string | null;
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
  const [showTip, setShowTip] = useState(false);
  const [tipAmount, setTipAmount] = useState(5);
  const [customTip, setCustomTip] = useState('');
  const [tipping, setTipping] = useState(false);
  const [tipError, setTipError] = useState('');
  const [tipFlash, setTipFlash] = useState<string | null>(null);

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
    if (data.status === 'ended') setLiveStatus('ended');

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', data.creator_id)
      .single();
    setCreator(profile);
    setLoading(false);

    // Private rate from creator voice settings
    const { data: creatorRates } = await supabase
      .from('profiles')
      .select('voice_rate_per_minute, voice_min_minutes')
      .eq('id', data.creator_id)
      .single();
    if (creatorRates) {
      setPrivateRate(Number(creatorRates.voice_rate_per_minute ?? 5));
      setPrivateMin(Math.max(1, Number(creatorRates.voice_min_minutes ?? 1)));
      setPrivateMinutes(Math.max(5, Number(creatorRates.voice_min_minutes ?? 1)));
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
        setIncomingPrivates(
          list.map((r: any) => ({
            ...r,
            profile: pmap.get(r.requester_id) || null,
          }))
        );
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
        setViewerCount(Math.max(0, room.numParticipants - 1));
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        setViewerCount(Math.max(0, room.numParticipants - 1));
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

      setViewerCount(Math.max(0, room.numParticipants - 1));
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
          'status, viewer_count, tip_raised_gbp, tip_goal_gbp, title, private_active, private_user_id, private_ends_at, private_request_id'
        )
        .eq('id', id)
        .single();
      if (data) {
        setStream((s) => (s ? { ...s, ...data } : s));
        setPrivateEndsAt(data.private_ends_at || null);
        if (data.private_active && userId) {
          const allowed =
            data.creator_id === userId || data.private_user_id === userId;
          // stream may not have creator_id in poll - use stream state
          setPrivateLockedOut((prev) => {
            const s = stream;
            const isC = s && s.creator_id === userId;
            const isF = data.private_user_id === userId;
            return !!(data.private_active && !isC && !isF);
          });
        } else if (!data.private_active) {
          setPrivateLockedOut(false);
        }
        if (data.status === 'ended') {
          setLiveStatus('ended');
          cleanupRoom();
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

  useEffect(() => {
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
              return [...prev, { ...row, profile }];
            });
          }
          if (row.status !== 'pending') {
            setIncomingPrivates((prev) => prev.filter((p) => p.id !== row.id));
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
    if (!isOwner || liveStatus !== 'live') return;
    const t = setInterval(() => {
      const n = roomRef.current
        ? Math.max(0, roomRef.current.numParticipants - 1)
        : 0;
      setViewerCount(n);
      void supabase
        .from('live_streams')
        .update({ viewer_count: n, updated_at: new Date().toISOString() })
        .eq('id', id);
    }, 10000);
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
            }
          : s
      );
      setTipFlash(`You tipped £${Number(data.amount).toFixed(2)}`);
      setTimeout(() => setTipFlash(null), 3000);
      setShowTip(false);
      setCustomTip('');

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
      await cleanupRoom();
      const res = await fetch('/api/live/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ stream_id: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not end');
      setLiveStatus('ended');
      router.push('/live');
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setEnding(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <Loader2 className="animate-spin text-pink-500" size={28} />
        </div>
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
      <div className="min-h-screen bg-black text-white flex">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden relative">
          <div className="flex-1 min-h-0 relative bg-black">
            {ended ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 gap-2 px-6">
                <Radio size={40} className="text-zinc-600" />
                <p className="font-semibold text-zinc-200 text-lg">
                  Stream ended
                </p>
                <p className="text-sm text-center">This live was not saved</p>
                <Link
                  href="/live"
                  className="mt-4 px-5 py-2.5 rounded-xl bg-pink-600 text-sm font-semibold"
                >
                  Back to Live
                </Link>
              </div>
            ) : (
              <>
                <video
                  ref={isOwner ? localVideoRef : remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={isOwner}
                  className="absolute inset-0 w-full h-full object-cover"
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
                  paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
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
                  <div className="min-w-0 bg-black/40 backdrop-blur rounded-2xl px-3 py-1.5 border border-white/10">
                    <p className="text-sm font-semibold truncate max-w-[50vw] sm:max-w-xs">
                      {stream?.title}
                    </p>
                    <Link
                      href={creator?.username ? `/${creator.username}` : '#'}
                      className="text-[11px] text-pink-300 truncate block"
                    >
                      {name}
                    </Link>
                  </div>
                </div>
                <div className="flex items-center gap-2 pointer-events-auto flex-shrink-0">
                  <span className="bg-red-600 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </span>
                  <span className="bg-black/50 backdrop-blur text-xs px-2.5 py-1 rounded-full flex items-center gap-1 border border-white/10">
                    <Users size={12} />
                    {viewerCount || stream?.viewer_count || 0}
                  </span>
                </div>
              </div>
            )}

            {/* Tip goal */}
            {!ended && (goal > 0 || raised > 0) && (
              <div className="absolute top-16 sm:top-20 left-3 right-3 z-20 pointer-events-none">
                <div className="bg-black/50 backdrop-blur rounded-xl px-3 py-2 border border-white/10 max-w-md">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-zinc-300">
                      {goal > 0 ? 'Tip goal' : 'Tips this live'}
                    </span>
                    <span className="font-medium">
                      {goal > 0
                        ? `£${raised.toFixed(0)} / £${goal.toFixed(0)}`
                        : `£${raised.toFixed(2)}`}
                    </span>
                  </div>
                  {goal > 0 && (
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
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

            {tipFlash && (
              <div className="absolute top-1/3 inset-x-0 z-30 flex justify-center pointer-events-none px-4">
                <div className="bg-pink-600/95 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl">
                  {tipFlash}
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
              <div className="absolute top-16 sm:top-20 right-3 z-25 pointer-events-none">
                <div className="bg-pink-600/90 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow">
                  <Lock size={12} />
                  PRIVATE
                  {privateCountdown && (
                    <span className="font-mono ml-1">{privateCountdown}</span>
                  )}
                </div>
              </div>
            )}

            {/* Floating chat (LoyalFans / IG Live style) */}
            {!ended && (
              <div
                ref={chatBoxRef}
                className="absolute left-0 right-0 z-20 pointer-events-none px-3"
                style={{
                  bottom:
                    'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))',
                  maxHeight: '38vh',
                }}
              >
                <div className="max-w-md space-y-1.5 overflow-y-auto pointer-events-auto mask-fade-chat pr-2">
                  {chatMessages.slice(-25).map((m) => (
                    <div
                      key={m.id}
                      className="flex items-start gap-2 animate-in fade-in"
                    >
                      <div className="bg-black/45 backdrop-blur-sm rounded-2xl px-2.5 py-1.5 max-w-[90%]">
                        <span
                          className={`text-xs font-semibold mr-1.5 ${
                            isCreatorMsg(m)
                              ? 'text-pink-400'
                              : 'text-pink-200/90'
                          }`}
                        >
                          {displayName(m)}
                          {isCreatorMsg(m) ? ' · Host' : ''}
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
                className="absolute bottom-0 inset-x-0 z-20 px-3 pointer-events-none"
                style={{
                  paddingBottom:
                    'max(0.75rem, calc(env(safe-area-inset-bottom) + 0.5rem))',
                }}
              >
                <div className="pointer-events-auto flex items-center gap-2 max-w-2xl mx-auto">
                  <div className="flex-1 flex items-center gap-1.5 bg-black/55 backdrop-blur border border-white/15 rounded-full pl-4 pr-1.5 py-1.5 min-w-0">
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
                      className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-zinc-400"
                      maxLength={300}
                    />
                    <button
                      type="button"
                      onClick={() => void sendChat()}
                      disabled={sendingChat || !chatText.trim()}
                      className="w-10 h-10 rounded-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 flex items-center justify-center flex-shrink-0 transition"
                    >
                      {sendingChat ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                    </button>
                  </div>

                  {!isOwner && !stream?.private_active && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setTipError('');
                          setShowTip(true);
                        }}
                        className="w-12 h-12 rounded-full bg-gradient-to-r from-pink-600 to-rose-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-pink-900/40"
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
                        className="h-12 px-3 rounded-full bg-zinc-900/90 border border-pink-500/50 text-pink-300 text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
                        title="Request private"
                      >
                        <Lock size={14} />
                        {myPendingPrivate ? 'Pending' : 'Private'}
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
        {isOwner && incomingPrivates.length > 0 && !stream?.private_active && (
          <div className="fixed inset-x-0 top-16 z-[210] flex justify-center px-3 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md space-y-2">
              {incomingPrivates.map((req) => {
                const n =
                  req.profile?.display_name ||
                  (req.profile?.username
                    ? `@${req.profile.username}`
                    : 'Fan');
                return (
                  <div
                    key={req.id}
                    className="bg-zinc-900 border border-pink-500/40 rounded-2xl p-4 shadow-xl"
                  >
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <Lock size={14} className="text-pink-400" />
                      Private request
                    </p>
                    <p className="text-sm text-zinc-300 mt-1">
                      <span className="text-white font-medium">{n}</span>
                      {' · '}
                      {req.minutes} min · £{Number(req.amount_gbp).toFixed(2)}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        disabled={privateBusy}
                        onClick={() => respondPrivate(req.id, 'decline')}
                        className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-sm font-medium"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={privateBusy}
                        onClick={() => respondPrivate(req.id, 'accept')}
                        className="flex-1 py-2.5 rounded-xl bg-pink-600 text-sm font-semibold"
                      >
                        Accept
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
