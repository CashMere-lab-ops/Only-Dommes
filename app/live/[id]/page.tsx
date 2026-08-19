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
} from 'lucide-react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
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
};

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
  const [error, setError] = useState('');
  const [ending, setEnding] = useState(false);
  const [liveStatus, setLiveStatus] = useState<
    'idle' | 'connecting' | 'live' | 'ended' | 'error'
  >('idle');
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const isOwner = !!(userId && stream && stream.creator_id === userId);

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

  const loadMeta = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id || null);

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
      if (!res.ok) throw new Error(data.error || 'Could not join live');

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

      room.on(RoomEvent.ConnectionStateChanged, (_state) => {
        void _state;
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
              if (remoteVideoRef.current) pub.track.attach(remoteVideoRef.current);
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
        .select('status, viewer_count, tip_raised_gbp, tip_goal_gbp, title')
        .eq('id', id)
        .single();
      if (data) {
        setStream((s) => (s ? { ...s, ...data } : s));
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

  // Lock body scroll on mobile while watching
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

  return (
    <AuthGuard>
      <div className="min-h-screen bg-black text-white flex">
        {/* Desktop sidebar only */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden relative">
          {/* Video fills screen */}
          <div className="flex-1 min-h-0 relative bg-black">
            {ended ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 gap-2 px-6">
                <Radio size={40} className="text-zinc-600" />
                <p className="font-semibold text-zinc-200 text-lg">Stream ended</p>
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

            {/* Top overlay */}
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

            {/* Tip goal strip */}
            {!ended && goal > 0 && (
              <div className="absolute top-16 sm:top-20 left-3 right-3 z-20 pointer-events-none">
                <div className="bg-black/50 backdrop-blur rounded-xl px-3 py-2 border border-white/10 max-w-md">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-zinc-300">Tip goal</span>
                    <span className="font-medium">
                      £{raised.toFixed(0)} / £{goal.toFixed(0)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-pink-600 to-rose-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (raised / goal) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Creator controls — floating bottom */}
            {isOwner && !ended && liveStatus === 'live' && (
              <div
                className="absolute bottom-0 inset-x-0 z-20 flex justify-center gap-3 px-4 pointer-events-none"
                style={{
                  paddingBottom:
                    'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))',
                }}
              >
                <div className="pointer-events-auto flex items-center gap-3 bg-black/60 backdrop-blur border border-white/10 rounded-full px-3 py-2">
                  <button
                    type="button"
                    onClick={toggleMic}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                      micOn
                        ? 'bg-zinc-800 text-white'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {micOn ? <Mic size={20} /> : <MicOff size={20} />}
                  </button>
                  <button
                    type="button"
                    onClick={toggleCam}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                      camOn
                        ? 'bg-zinc-800 text-white'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {camOn ? <Video size={20} /> : <VideoOff size={20} />}
                  </button>
                  <button
                    type="button"
                    onClick={endLive}
                    disabled={ending}
                    className="h-12 px-5 rounded-full bg-red-600 hover:bg-red-500 font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {ending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <PhoneOff size={18} />
                    )}
                    End
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Desktop-only side note under video on large screens */}
          <div className="hidden lg:block flex-shrink-0 border-t border-zinc-800 bg-zinc-950 px-6 py-4">
            <div className="max-w-4xl flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">{stream?.title}</p>
                <p className="text-sm text-zinc-400">{name}</p>
              </div>
              <p className="text-xs text-zinc-500">
                Tips & live chat coming next
              </p>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
