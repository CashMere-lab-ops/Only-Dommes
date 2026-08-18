'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Film,
  Lock,
  Play,
  Search,
  ShoppingBag,
  X,
  Loader2,
  Check,
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';
import { notifyBalanceUpdated } from '../../lib/wallet';

type ClipRow = {
  id: string;
  creator_id: string;
  title: string;
  description?: string | null;
  price_gbp: number;
  category?: string | null;
  video_url: string;
  preview_url?: string | null;
  mux_playback_id?: string | null;
  mux_preview_playback_id?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
  sales_count?: number;
  created_at: string;
  profiles?: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

function money(n: number) {
  return `£${Number(n || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDuration(sec?: number | null) {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function previewSrc(clip: ClipRow) {
  if (clip.preview_url) return clip.preview_url;
  if (clip.mux_playback_id) {
    return `https://stream.mux.com/${clip.mux_playback_id}.m3u8?asset_start_time=0&asset_end_time=15`;
  }
  return null;
}

function fullSrc(clip: ClipRow) {
  return clip.video_url || null;
}

function MuxVideo({
  src,
  className,
  poster,
  muted,
  loop,
  autoPlay,
  controls,
}: {
  src: string;
  className?: string;
  poster?: string;
  muted?: boolean;
  loop?: boolean;
  autoPlay?: boolean;
  controls?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls: any = null;
    let cancelled = false;

    const setup = async () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        if (autoPlay) video.play().catch(() => {});
        return;
      }

      try {
        const w = window as any;
        if (!w.Hls) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('hls.js load failed'));
            document.head.appendChild(s);
          });
        }
        if (cancelled) return;
        const Hls = (window as any).Hls;
        if (Hls?.isSupported()) {
          hls = new Hls({ enableWorker: true, maxBufferLength: 20 });
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (autoPlay) video.play().catch(() => {});
          });
        } else {
          video.src = src;
          if (autoPlay) video.play().catch(() => {});
        }
      } catch {
        video.src = src;
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (hls) {
        try {
          hls.destroy();
        } catch {
          /* ignore */
        }
      }
    };
  }, [src, autoPlay]);

  return (
    <video
      ref={videoRef}
      className={className}
      poster={poster}
      muted={muted}
      loop={loop}
      playsInline
      controls={controls}
      preload="metadata"
    />
  );
}

function ClipCard({
  clip,
  owns,
  buying,
  onOpen,
}: {
  clip: ClipRow;
  owns: boolean;
  buying: boolean;
  onOpen: () => void;
}) {
  const [hovering, setHovering] = useState(false);
  const preview = previewSrc(clip);
  const name =
    clip.profiles?.display_name ||
    (clip.profiles?.username ? `@${clip.profiles.username}` : 'Creator');
  const dur = formatDuration(clip.duration_seconds);

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onTouchStart={() => setHovering(true)}
      className="text-left bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-pink-500/40 transition group"
    >
      <div className="relative aspect-video bg-zinc-800 overflow-hidden">
        {clip.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clip.thumbnail_url}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
              hovering && preview ? 'opacity-0' : 'opacity-100'
            }`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className="text-zinc-600" size={36} />
          </div>
        )}

        {preview && hovering && (
          <MuxVideo
            key={`hover-${clip.id}`}
            src={preview}
            muted
            loop
            autoPlay
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        <div
          className={`absolute inset-0 flex items-center justify-center transition ${
            hovering && preview
              ? 'bg-black/10'
              : 'bg-black/30 group-hover:bg-black/40'
          }`}
        >
          {owns ? (
            <div className="w-12 h-12 rounded-full bg-pink-600/90 flex items-center justify-center">
              <Play size={22} className="text-white ml-0.5" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-zinc-900/80 border border-zinc-600 flex items-center justify-center">
              <Lock size={18} className="text-zinc-200" />
            </div>
          )}
        </div>

        {dur && (
          <span className="absolute bottom-2 right-2 text-[10px] bg-black/70 px-1.5 py-0.5 rounded">
            {dur}
          </span>
        )}
        {!owns && (
          <span className="absolute bottom-2 left-2 text-[10px] bg-black/70 px-1.5 py-0.5 rounded text-zinc-200">
            15s preview
          </span>
        )}
        {owns && (
          <span className="absolute top-2 left-2 text-[10px] font-medium bg-emerald-500/90 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
            <Check size={10} /> Owned
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="font-semibold truncate">{clip.title}</p>
        <div className="flex items-center gap-2 mt-1.5">
          {clip.profiles?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clip.profiles.avatar_url}
              alt=""
              className="w-5 h-5 rounded-full object-cover"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-zinc-700" />
          )}
          <Link
            href={clip.profiles?.username ? `/${clip.profiles.username}` : '#'}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-zinc-400 hover:text-pink-400 truncate"
          >
            {name}
          </Link>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-sm font-semibold text-pink-400">
            {Number(clip.price_gbp) === 0
              ? 'Free'
              : money(Number(clip.price_gbp))}
          </span>
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <ShoppingBag size={12} />
            {clip.sales_count || 0}
          </span>
        </div>
        {buying && (
          <p className="text-xs text-pink-300 mt-2 flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> Unlocking…
          </p>
        )}
      </div>
    </button>
  );
}

export default function ClipsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [clips, setClips] = useState<ClipRow[]>([]);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [tab, setTab] = useState<'browse' | 'owned'>('browse');
  const [viewer, setViewer] = useState<ClipRow | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id || null);

    const { data: rows, error: qErr } = await supabase
      .from('clips')
      .select(
        'id, creator_id, title, description, price_gbp, category, video_url, preview_url, mux_playback_id, mux_preview_playback_id, thumbnail_url, duration_seconds, sales_count, created_at'
      )
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(100);

    if (qErr) {
      setError(qErr.message);
      setLoading(false);
      return;
    }

    const list = rows || [];
    const creatorIds = [...new Set(list.map((c: any) => c.creator_id))];
    const profileMap: Record<string, any> = {};
    if (creatorIds.length) {
      const { data: people } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', creatorIds);
      (people || []).forEach((p: any) => {
        profileMap[p.id] = p;
      });
    }

    setClips(
      list.map((c: any) => ({
        ...c,
        profiles: profileMap[c.creator_id] || null,
      }))
    );

    if (user) {
      const { data: buys } = await supabase
        .from('clip_purchases')
        .select('clip_id')
        .eq('buyer_id', user.id);
      setOwnedIds(new Set((buys || []).map((b: any) => b.clip_id)));
    } else {
      setOwnedIds(new Set());
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    clips.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return ['all', ...Array.from(set).sort()];
  }, [clips]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clips.filter((c) => {
      if (tab === 'owned' && !ownedIds.has(c.id) && c.creator_id !== userId)
        return false;
      if (category !== 'all' && c.category !== category) return false;
      if (!q) return true;
      const hay = `${c.title} ${c.description || ''} ${
        c.profiles?.display_name || ''
      } ${c.profiles?.username || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [clips, search, category, tab, ownedIds, userId]);

  const buy = async (clip: ClipRow) => {
    if (!userId) {
      setError('Please log in to buy clips');
      return;
    }
    if (clip.creator_id === userId) {
      setViewer(clip);
      return;
    }
    if (ownedIds.has(clip.id)) {
      setViewer(clip);
      return;
    }

    setBuyingId(clip.id);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in again');

      const res = await fetch('/api/clips/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ clip_id: clip.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_BALANCE') {
          const go = confirm(
            `Not enough balance (need ${money(data.needed || clip.price_gbp)}). Open wallet?`
          );
          if (go) window.location.href = '/wallet';
          return;
        }
        throw new Error(data.error || 'Purchase failed');
      }
      if (typeof data.balance === 'number') {
        notifyBalanceUpdated(data.balance);
      }
      setOwnedIds((prev) => new Set([...prev, clip.id]));
      setClips((prev) =>
        prev.map((c) =>
          c.id === clip.id
            ? { ...c, sales_count: Number(c.sales_count || 0) + 1 }
            : c
        )
      );
      setViewer({ ...clip });
    } catch (e: any) {
      setError(e.message || 'Purchase failed');
    } finally {
      setBuyingId(null);
    }
  };

  const openClip = (clip: ClipRow) => {
    setViewer(clip);
  };

  const ownsViewer =
    viewer &&
    (ownedIds.has(viewer.id) ||
      viewer.creator_id === userId ||
      Number(viewer.price_gbp) === 0);

  const viewerPreview = viewer ? previewSrc(viewer) : null;
  const viewerFull = viewer ? fullSrc(viewer) : null;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-10">
          <div className="p-4 lg:p-8 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-3">
                  <Film className="text-pink-500" size={28} />
                  Clips
                </h1>
                <p className="text-zinc-500 text-sm mt-1">
                  Hover or tap for a 15s preview · unlock once, watch anytime
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTab('browse')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    tab === 'browse'
                      ? 'bg-pink-600 text-white'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                  }`}
                >
                  Browse
                </button>
                <button
                  type="button"
                  onClick={() => setTab('owned')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    tab === 'owned'
                      ? 'bg-pink-600 text-white'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                  }`}
                >
                  Owned here
                </button>
                <Link
                  href="/library"
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-pink-500/40 transition"
                >
                  Full library →
                </Link>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search clips or creators..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-pink-500"
                />
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-pink-500"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === 'all' ? 'All categories' : c}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-pink-500" size={28} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                <Film className="mx-auto text-zinc-600 mb-3" size={32} />
                <p className="text-zinc-300 font-medium">
                  {tab === 'owned'
                    ? 'No clips in your library yet'
                    : 'No clips yet'}
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  {tab === 'owned'
                    ? 'Buy a clip to unlock it here forever.'
                    : 'Creators can upload from their Dashboard.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((clip) => {
                  const owns =
                    ownedIds.has(clip.id) ||
                    clip.creator_id === userId ||
                    Number(clip.price_gbp) === 0;
                  return (
                    <ClipCard
                      key={clip.id}
                      clip={clip}
                      owns={owns}
                      buying={buyingId === clip.id}
                      onOpen={() => openClip(clip)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {viewer && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <h3 className="font-semibold truncate pr-4">{viewer.title}</h3>
                <button
                  type="button"
                  onClick={() => setViewer(null)}
                  className="text-zinc-400 hover:text-white p-1"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="bg-black aspect-video relative">
                {ownsViewer && viewerFull ? (
                  <MuxVideo
                    key={`full-${viewer.id}`}
                    src={viewerFull}
                    controls
                    autoPlay
                    className="w-full h-full"
                    poster={viewer.thumbnail_url || undefined}
                  />
                ) : viewerPreview ? (
                  <>
                    <MuxVideo
                      key={`prev-${viewer.id}`}
                      src={viewerPreview}
                      controls
                      autoPlay
                      className="w-full h-full"
                      poster={viewer.thumbnail_url || undefined}
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-10 pointer-events-none">
                      <div className="pointer-events-auto">
                        <p className="text-xs text-zinc-300 mb-2 flex items-center gap-1.5">
                          <Lock size={12} /> 15s preview · unlock for full video
                        </p>
                        <button
                          type="button"
                          disabled={buyingId === viewer.id}
                          onClick={() => buy(viewer)}
                          className="w-full py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 font-semibold text-sm transition disabled:opacity-50"
                        >
                          {buyingId === viewer.id
                            ? 'Unlocking…'
                            : `Unlock · ${money(Number(viewer.price_gbp))}`}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-zinc-400 p-6 relative">
                    {viewer.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={viewer.thumbnail_url}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-40"
                      />
                    )}
                    <div className="relative z-10 flex flex-col items-center gap-3">
                      <Lock size={28} />
                      <p className="text-sm text-center">
                        Unlock to watch the full clip
                      </p>
                      <button
                        type="button"
                        disabled={buyingId === viewer.id}
                        onClick={() => buy(viewer)}
                        className="mt-2 px-6 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 font-semibold text-sm transition disabled:opacity-50"
                      >
                        {buyingId === viewer.id
                          ? 'Unlocking…'
                          : `Unlock · ${money(Number(viewer.price_gbp))}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {viewer.description && (
                <p className="px-4 py-3 text-sm text-zinc-400 border-t border-zinc-800">
                  {viewer.description}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
