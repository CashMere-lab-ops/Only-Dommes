'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  BookOpen,
  Film,
  Loader2,
  Play,
  Search,
  X,
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

const MuxPlayer = dynamic(() => import('@mux/mux-player-react'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <Loader2 className="animate-spin text-pink-500" size={28} />
    </div>
  ),
});

type OwnedClip = {
  id: string;
  title: string;
  description?: string | null;
  price_gbp: number;
  video_url: string;
  mux_playback_id?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
  category?: string | null;
  creator_id: string;
  purchased_at?: string;
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

/** Full owned clip — Mux Player + signed token when available */
function LibraryPlayer({ clip }: { clip: OwnedClip }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [thumbToken, setThumbToken] = useState<string | null>(null);
  const [usePublic, setUsePublic] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr('');
      setToken(null);
      setThumbToken(null);
      setUsePublic(false);

      // Older clips without Mux id — fall back to stored URL
      if (!clip.mux_playback_id) {
        setUsePublic(true);
        setLoading(false);
        return;
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setErr('Please log in again');
          setLoading(false);
          return;
        }

        const res = await fetch(
          `/api/mux/playback-token?clipId=${encodeURIComponent(clip.id)}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (data.public || (!data.token && res.ok)) {
          // Signing not configured — public playback id still works
          setUsePublic(true);
        } else if (!res.ok) {
          setErr(data.error || 'Could not load video');
        } else {
          setToken(data.token);
          setThumbToken(data.thumbnailToken || null);
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
  }, [clip.id, clip.mux_playback_id]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-pink-500" size={28} />
      </div>
    );
  }

  if (err) {
    return (
      <div className="w-full h-full flex items-center justify-center text-red-300 text-sm px-4 text-center">
        {err}
      </div>
    );
  }

  // Legacy non-Mux clip
  if (!clip.mux_playback_id) {
    if (!clip.video_url) {
      return (
        <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
          Video not available
        </div>
      );
    }
    return (
      <video
        src={clip.video_url}
        controls
        autoPlay
        playsInline
        className="w-full h-full"
        poster={clip.thumbnail_url || undefined}
      />
    );
  }

  return (
    <MuxPlayer
      playbackId={clip.mux_playback_id}
      tokens={
        token
          ? {
              playback: token,
              ...(thumbToken ? { thumbnail: thumbToken } : {}),
            }
          : undefined
      }
      streamType="on-demand"
      autoPlay
      playsInline
      accentColor="#ec4899"
      primaryColor="#ffffff"
      secondaryColor="#18181b"
      metadata={{
        video_title: clip.title,
      }}
      poster={clip.thumbnail_url || undefined}
      style={{ width: '100%', height: '100%', aspectRatio: '16/9' }}
    />
  );
}

export default function LibraryPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [clips, setClips] = useState<OwnedClip[]>([]);
  const [search, setSearch] = useState('');
  const [viewer, setViewer] = useState<OwnedClip | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setClips([]);
        setLoading(false);
        return;
      }

      const { data: buys, error: buyErr } = await supabase
        .from('clip_purchases')
        .select('clip_id, created_at, amount_gbp')
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false });

      if (buyErr) {
        setError(buyErr.message);
        setLoading(false);
        return;
      }

      const ids = (buys || []).map((b: any) => b.clip_id).filter(Boolean);
      if (!ids.length) {
        setClips([]);
        setLoading(false);
        return;
      }

      const purchaseAt: Record<string, string> = {};
      (buys || []).forEach((b: any) => {
        purchaseAt[b.clip_id] = b.created_at;
      });

      const { data: rows, error: clipErr } = await supabase
        .from('clips')
        .select(
          'id, creator_id, title, description, price_gbp, category, video_url, mux_playback_id, thumbnail_url, duration_seconds'
        )
        .in('id', ids);

      if (clipErr) {
        setError(clipErr.message);
        setLoading(false);
        return;
      }

      const creatorIds = [
        ...new Set((rows || []).map((c: any) => c.creator_id).filter(Boolean)),
      ];
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

      const ordered = ids
        .map((id: string) => {
          const c = (rows || []).find((r: any) => r.id === id);
          if (!c) return null;
          return {
            ...c,
            purchased_at: purchaseAt[id],
            profiles: profileMap[c.creator_id] || null,
          } as OwnedClip;
        })
        .filter(Boolean) as OwnedClip[];

      setClips(ordered);
      setLoading(false);
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clips;
    return clips.filter((c) => {
      const hay = `${c.title} ${c.description || ''} ${
        c.profiles?.display_name || ''
      } ${c.profiles?.username || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [clips, search]);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-10">
          <div className="p-4 lg:p-8 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-3">
                  <BookOpen className="text-pink-500" size={28} />
                  My Library
                </h1>
                <p className="text-zinc-500 text-sm mt-1">
                  Clips you’ve unlocked — yours forever
                </p>
              </div>
              <Link
                href="/clips"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 hover:border-pink-500/40 transition"
              >
                <Film size={16} className="text-pink-400" />
                Browse more clips
              </Link>
            </div>

            <div className="relative mb-6 max-w-md">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your library..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-pink-500"
              />
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
                <Film className="mx-auto text-zinc-600 mb-3" size={36} />
                <p className="text-zinc-200 font-medium text-lg">
                  Your library is empty
                </p>
                <p className="text-sm text-zinc-500 mt-2 max-w-sm mx-auto">
                  Unlock paid clips from creators and they’ll appear here so you
                  can rewatch anytime.
                </p>
                <Link
                  href="/clips"
                  className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-sm font-semibold transition"
                >
                  Explore clips
                </Link>
              </div>
            ) : (
              <>
                <p className="text-xs text-zinc-500 mb-4">
                  {filtered.length} clip{filtered.length === 1 ? '' : 's'}{' '}
                  unlocked
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((clip) => {
                    const name =
                      clip.profiles?.display_name ||
                      (clip.profiles?.username
                        ? `@${clip.profiles.username}`
                        : 'Creator');
                    const dur = formatDuration(clip.duration_seconds);
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => setViewer(clip)}
                        className="text-left bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-pink-500/40 transition group"
                      >
                        <div className="relative aspect-video bg-zinc-800">
                          {clip.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={clip.thumbnail_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Film className="text-zinc-600" size={36} />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/45 flex items-center justify-center transition">
                            <div className="w-12 h-12 rounded-full bg-pink-600/90 flex items-center justify-center shadow-lg">
                              <Play size={22} className="text-white ml-0.5" />
                            </div>
                          </div>
                          {dur && (
                            <span className="absolute bottom-2 right-2 text-[10px] bg-black/75 px-1.5 py-0.5 rounded">
                              {dur}
                            </span>
                          )}
                          <span className="absolute top-2 left-2 text-[10px] font-semibold bg-emerald-500/95 text-white px-2 py-0.5 rounded-full">
                            Owned
                          </span>
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
                              href={
                                clip.profiles?.username
                                  ? `/${clip.profiles.username}`
                                  : '#'
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-zinc-400 hover:text-pink-400 truncate"
                            >
                              {name}
                            </Link>
                          </div>
                          <div className="flex items-center justify-between mt-3 text-xs text-zinc-500">
                            <span>
                              {clip.purchased_at
                                ? `Unlocked ${new Date(
                                    clip.purchased_at
                                  ).toLocaleDateString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}`
                                : 'Unlocked'}
                            </span>
                            <span className="text-zinc-600">
                              {money(Number(clip.price_gbp))}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </main>

        {viewer && (
          <div className="fixed inset-0 z-[100] bg-black/85 flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div className="min-w-0 pr-4">
                  <h3 className="font-semibold truncate">{viewer.title}</h3>
                  {viewer.profiles?.username && (
                    <Link
                      href={`/${viewer.profiles.username}`}
                      className="text-xs text-pink-400 hover:text-pink-300"
                    >
                      @
                      {viewer.profiles.display_name || viewer.profiles.username}
                    </Link>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setViewer(null)}
                  className="text-zinc-400 hover:text-white p-1"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="bg-black aspect-video">
                <LibraryPlayer key={viewer.id} clip={viewer} />
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
