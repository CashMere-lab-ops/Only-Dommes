'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Radio,
  Users,
  X,
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

      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        // Only show remote video from creator (not other viewers)
        if (track.kind === Track.Kind.Video) {
          if (remoteVideoRef.current) {
            track.attach(remoteVideoRef.current);
          }
        }
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.autoplay = true;
          (el as HTMLMediaElement).setAttribute('playsinline', 'true');
          document.body.appendChild(el);
        }
        void participant;
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

      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Disconnected) {
          // If stream ended by creator, meta poll will flip UI
        }
      });

      await room.connect(data.url, data.token);

      if (asCreator) {
        // Publish camera + mic from THIS browser (LoyalFans-style)
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

        // Mark active in DB
        await supabase
          .from('live_streams')
          .update({
            status: 'active',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', streamRow.id);
      } else {
        // Attach any tracks already published
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

      setViewerCount(Math.max(0, room.numParticipants - (asCreator ? 0 : 0)));
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
      // Auto-connect: creator starts publishing, viewers join to watch
      await connectLive(meta.stream, asCreator);
    })();

    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('live_streams')
        .select('status, viewer_count, tip_raised_gbp, tip_goal_gbp')
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

  // Push viewer count from room periodically (creator)
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
      router.push('/dashboard');
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setEnding(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-pink-500" size={28} />
          </main>
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

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-8">
          <div className="lg:hidden sticky top-0 z-40 bg-zinc-950/95 border-b border-zinc-800 px-3 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/live')}
              className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate text-sm">
                {stream?.title || 'Live'}
              </p>
              <p className="text-xs text-zinc-400 truncate">{name}</p>
            </div>
            {!ended && (
              <span className="bg-red-600 text-[10px] font-bold px-2 py-1 rounded-full">
                LIVE
              </span>
            )}
          </div>

          <div className="max-w-6xl mx-auto p-4 lg:p-8">
            <div className="hidden lg:flex items-center gap-3 mb-4">
              <Link
                href="/live"
                className="text-zinc-400 hover:text-white flex items-center gap-1 text-sm"
              >
                <ArrowLeft size={16} /> Live
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <div className="relative bg-black rounded-2xl overflow-hidden aspect-video border border-zinc-800">
                  {ended ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 gap-2">
                      <Radio size={32} className="text-zinc-600" />
                      <p className="font-medium text-zinc-300">Stream ended</p>
                      <p className="text-sm">This live was not saved</p>
                    </div>
                  ) : (
                    <>
                      {/* Creator sees local preview; viewers see remote */}
                      <video
                        ref={isOwner ? localVideoRef : remoteVideoRef}
                        autoPlay
                        playsInline
                        muted={isOwner}
                        className="w-full h-full object-cover"
                      />
                      {/* Hidden remote for owner if needed later */}
                      {isOwner && (
                        <video
                          ref={remoteVideoRef}
                          autoPlay
                          playsInline
                          className="hidden"
                        />
                      )}
                      {(connecting || liveStatus === 'connecting') && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3">
                          <Loader2
                            className="animate-spin text-pink-500"
                            size={32}
                          />
                          <p className="text-sm text-zinc-300">
                            {isOwner
                              ? 'Turning on camera…'
                              : 'Joining live…'}
                          </p>
                        </div>
                      )}
                      {error && liveStatus === 'error' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6 text-center">
                          <p className="text-red-300 text-sm mb-4">{error}</p>
                          <button
                            type="button"
                            onClick={() =>
                              stream &&
                              connectLive(stream, isOwner)
                            }
                            className="px-4 py-2 rounded-xl bg-pink-600 text-sm font-medium"
                          >
                            Try again
                          </button>
                        </div>
                      )}
                      {!ended && (
                        <span className="absolute top-3 left-3 bg-red-600 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 z-10">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Creator controls */}
                {isOwner && !ended && liveStatus === 'live' && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={toggleMic}
                      className={`w-12 h-12 rounded-full flex items-center justify-center border transition ${
                        micOn
                          ? 'bg-zinc-900 border-zinc-700'
                          : 'bg-red-600/20 border-red-500 text-red-400'
                      }`}
                      title={micOn ? 'Mute' : 'Unmute'}
                    >
                      {micOn ? <Mic size={20} /> : <MicOff size={20} />}
                    </button>
                    <button
                      type="button"
                      onClick={toggleCam}
                      className={`w-12 h-12 rounded-full flex items-center justify-center border transition ${
                        camOn
                          ? 'bg-zinc-900 border-zinc-700'
                          : 'bg-red-600/20 border-red-500 text-red-400'
                      }`}
                      title={camOn ? 'Camera off' : 'Camera on'}
                    >
                      {camOn ? <Video size={20} /> : <VideoOff size={20} />}
                    </button>
                    <button
                      type="button"
                      onClick={endLive}
                      disabled={ending}
                      className="h-12 px-6 rounded-full bg-red-600 hover:bg-red-500 font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      {ending ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <PhoneOff size={18} />
                      )}
                      End live
                    </button>
                  </div>
                )}

                <div className="mt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold truncate">
                      {stream?.title}
                    </h1>
                    <Link
                      href={creator?.username ? `/${creator.username}` : '#'}
                      className="flex items-center gap-2 mt-2"
                    >
                      {creator?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={creator.avatar_url}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-zinc-800" />
                      )}
                      <span className="font-medium text-sm hover:text-pink-400">
                        {name}
                      </span>
                    </Link>
                  </div>
                  <div className="text-sm text-zinc-400 flex items-center gap-1 flex-shrink-0">
                    <Users size={16} />
                    {viewerCount || stream?.viewer_count || 0}
                  </div>
                </div>

                {Number(stream?.tip_goal_gbp) > 0 && (
                  <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-zinc-400">Tip goal</span>
                      <span className="font-medium">
                        £{Number(stream?.tip_raised_gbp || 0).toFixed(0)} / £
                        {Number(stream?.tip_goal_gbp).toFixed(0)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-pink-600 to-rose-500 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (Number(stream?.tip_raised_gbp || 0) /
                              Number(stream?.tip_goal_gbp || 1)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {isOwner && !ended && (
                  <div className="bg-zinc-900 border border-pink-500/30 rounded-2xl p-5">
                    <h2 className="font-semibold mb-1 flex items-center gap-2">
                      <Radio className="text-pink-500" size={18} /> You are
                      live
                    </h2>
                    <p className="text-xs text-zinc-400 mb-3">
                      Your camera is streaming from this page — same idea as
                      LoyalFans. Allow camera & mic when the browser asks.
                    </p>
                    <button
                      type="button"
                      onClick={endLive}
                      disabled={ending}
                      className="w-full py-3 rounded-xl bg-red-600/90 hover:bg-red-600 font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {ending ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <X size={16} />
                      )}
                      End live
                    </button>
                  </div>
                )}

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <h2 className="font-semibold mb-2">About this live</h2>
                  <p className="text-sm text-zinc-400">
                    When the stream ends, it is not saved. Tips, live chat and
                    private requests come next.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
