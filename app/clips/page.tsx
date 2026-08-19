'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
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

const MuxPlayer = dynamic(() => import('@mux/mux-player-react'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <Loader2 className="animate-spin text-pink-500" size={28} />
    </div>
  ),
});

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

/** Bare Mux id only — never a full URL */
function barePlaybackId(raw?: string | null) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/stream\.mux\.com\/([A-Za-z0-9]+)/);
  if (m?.[1]) return m[1];
  if (s.includes('://')) return null;
  return s.split('?')[0].replace(/\.m3u8$/i, '') || null;
}

type PlayAuth = {
  playbackId: string;
  token: string | null;
  thumbnailToken: string | null;
  isPublic: boolean;
};

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
  const [auth, setAuth] = useState<PlayAuth | null>(null);
  const rawId = barePlaybackId(clip.mux_playback_id);

  const name =
    clip.profiles?.display_name ||
    (clip.profiles?.username ? `@${clip.profiles.username}` : 'Creator');
  const dur = formatDuration(clip.duration_seconds);

  useEffect(() => {
    if (!hovering || !rawId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/mux/preview-token?clipId=${encodeURIComponent(clip.id)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const id = barePlaybackId(data.playbackId) || rawId;
        setAuth({
          playbackId: id!,
          token: data.token || null,
          thumbnailToken: data.thumbnailToken || null,
          isPublic: !!data.public || !data.token,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hovering, rawId, clip.id]);

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
              hovering && auth ? 'opacity-0' : 'opacity-100'
            }`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className="text-zinc-600" size={36} />
          </div>
        )}

        {hovering && auth?.playbackId && (
          <div className="absolute inset-0">
            <MuxPlayer
              playbackId={auth.playbackId}
              {...(auth.token
                ? {
                    tokens: {
                      playback: auth.token,
                      ...(auth.thumbnailToken
                        ? { thumbnail: auth.thumbnailToken }
                        : {}),
                    },
                  }
                : {})}
              {...(auth.isPublic
                ? {
                    extraSourceParams: {
                      asset_start_time: 0,
                      asset_end_time: 15,
                    },
                  }
                : {})}
              muted
              autoPlay
              loop
              playsInline
              streamType="on-demand"
              style={
                {
                  width: '100%',
                  height: '100%',
                  '--controls': 'none',
                } as any
              }
            />
          </div>
        )}

        <div
          className={`absolute inset-0 flex items-center justify-center pointer-events-none transition ${
            hovering && auth
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

function ViewerPlayer({ clip, owns }: { clip: ClipRow; owns: boolean }) {
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<PlayAuth | null>(null);
  const [err, setErr] = useState('');
  const supabase = createClient();
  const rawId = barePlaybackId(clip.mux_playback_id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!rawId) {
        setErr('No video');
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr('');
      try {
        if (owns) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const res = await fetch(
            `/api/mux/playback-token?clipId=${encodeURIComponent(clip.id)}`,
            {
              headers: session?.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : {},
            }
          );
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok && !data.public) {
            setErr(data.error || 'Could not load video');
          } else {
            setAuth({
              playbackId: barePlaybackId(data.playbackId) || rawId,
              token: data.token || null,
              thumbnailToken: data.thumbnailToken || null,
              isPublic: !!data.public || !data.token,
            });
          }
        } else {
          const res = await fetch(
            `/api/mux/preview-token?clipId=${encodeURIComponent(clip.id)}`
          );
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            setErr(data.error || 'Preview unavailable');
          } else {
            setAuth({
              playbackId: barePlaybackId(data.playbackId) || rawId,
              token: data.token || null,
              thumbnailToken: data.thumbnailToken || null,
              isPublic: !!data.public || !data.token,
            });
          }
        }
      } catch (e: any) {
        if (!cancelled) setErr(e.message || 'Player error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clip.id, owns, rawId]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-pink-500" size={28} />
      </div>
    );
  }

  if (err || !auth?.playbackId) {
    return (
      <div className="w-full h-full flex items-center justify-center text-red-300 text-sm px-4 text-center">
        {err || 'Video not available'}
      </div>
    );
  }

  return (
    <MuxPlayer
      playbackId={auth.playbackId}
      {...(auth.token
        ? {
            tokens: {
              playback: auth.token,
              ...(auth.thumbnailToken
                ? { thumbnail: auth.thumbnailToken }
                : {}),
            },
          }
        : {})}
      {...(!owns && auth.isPublic
        ? {
            extraSourceParams: {
              asset_start_time: 0,
              asset_end_time: 15,
            },
          }
        : {})}
      streamType="on-demand"
      autoPlay
      playsInline
      accentColor="#ec4899"
      primaryColor="#ffffff"
      secondaryColor="#18181b"
      metadata={{ video_title: clip.title }}
      className="w-full h-full"
      style={{
        width: '100%',
        height: '100%',
        minHeight: '100%',
        display: 'block',
        background: '#000',
        // bigger controls on touch devices
        ['--media-button-size' as any]: '44px',
        ['--controls-backdrop-color' as any]: 'rgba(0,0,0,0.45)',
      }}
    />
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
        'id, creator_id, title, description, price_gbp, category, video_url, preview_url, mux_playback_id, mux_preview_playback_id, mux_asset_id, thumbnail_url, duration_seconds, sales_count, created_at'
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
    if (clip.creator_id === userId || ownedIds.has(clip.id)) {
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

  const ownsViewer =
    !!viewer &&
    (ownedIds.has(viewer.id) ||
      viewer.creator_id === userId ||
      Number(viewer.price_gbp) === 0);

  // Lock page scroll while watching (mobile/tablet)
  useEffect(() => {
    if (!viewer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [viewer]);

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
                  Hover for 15s preview · unlock once, watch anytime
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
                      onOpen={() => setViewer(clip)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {viewer && (
          <div
            className="fixed inset-0 z-[200] bg-black flex flex-col"
            role="dialog"
            aria-modal="true"
          >
            {/* Top bar — safe for notches */}
            <div
              className="flex-shrink-0 flex items-center gap-3 px-3 sm:px-4 border-b border-zinc-800/80 bg-zinc-950/95"
              style={{
                paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
                paddingBottom: '0.75rem',
              }}
            >
              <button
                type="button"
                onClick={() => setViewer(null)}
                className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white active:bg-zinc-800 flex-shrink-0"
                aria-label="Close"
              >
                <X size={22} />
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-sm sm:text-base truncate">
                  {viewer.title}
                </h3>
                {viewer.profiles?.username && (
                  <Link
                    href={`/${viewer.profiles.username}`}
                    className="text-xs text-pink-400 truncate block"
                  >
                    @
                    {viewer.profiles.display_name || viewer.profiles.username}
                  </Link>
                )}
              </div>
              {!ownsViewer && (
                <span className="hidden sm:inline-flex text-[10px] uppercase tracking-wide text-zinc-400 bg-zinc-900 border border-zinc-700 px-2 py-1 rounded-full flex-shrink-0">
                  Preview
                </span>
              )}
            </div>

            {/* Player — fills remaining height on phone/tablet */}
            <div className="flex-1 min-h-0 relative bg-black flex items-center justify-center">
              <div className="w-full h-full max-h-full sm:max-w-4xl sm:max-h-[min(80vh,720px)] sm:aspect-video">
                <ViewerPlayer clip={viewer} owns={!!ownsViewer} />
              </div>
            </div>

            {/* Unlock / info — above bottom nav + home indicator */}
            <div
              className="flex-shrink-0 bg-zinc-950 border-t border-zinc-800 px-4 pt-3"
              style={{
                paddingBottom:
                  'max(1rem, calc(env(safe-area-inset-bottom) + 4.5rem))',
              }}
            >
              {!ownsViewer ? (
                <div className="max-w-lg mx-auto">
                  <p className="text-xs text-zinc-400 mb-2 flex items-center justify-center gap-1.5">
                    <Lock size={12} /> 15s preview · unlock for full video
                  </p>
                  <button
                    type="button"
                    disabled={buyingId === viewer.id}
                    onClick={() => buy(viewer)}
                    className="w-full min-h-[48px] py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 active:opacity-90 font-semibold text-base transition disabled:opacity-50"
                  >
                    {buyingId === viewer.id
                      ? 'Unlocking…'
                      : `Unlock · ${money(Number(viewer.price_gbp))}`}
                  </button>
                </div>
              ) : (
                <div className="max-w-lg mx-auto text-center">
                  <p className="text-xs text-emerald-400/90 font-medium">
                    Unlocked · yours to rewatch anytime
                  </p>
                  {viewer.description && (
                    <p className="text-sm text-zinc-400 mt-2 line-clamp-3">
                      {viewer.description}
                    </p>
                  )}
                </div>
              )}
              {!ownsViewer && viewer.description && (
                <p className="max-w-lg mx-auto text-xs text-zinc-500 mt-3 line-clamp-2 text-center">
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
