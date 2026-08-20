'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Radio, Users, Loader2, Video } from 'lucide-react';
import Sidebar from '../components/Sidebar';

type LiveCard = {
  id: string;
  title: string;
  status: string;
  viewer_count?: number;
  tip_goal_gbp?: number;
  tip_raised_gbp?: number;
  thumbnail_url?: string | null;
  creator?: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

export default function Home() {
  const [streams, setStreams] = useState<LiveCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch('/api/live/active');
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const list = [...(data.streams || [])] as LiveCard[];
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        setStreams(list.slice(0, 10));
      }
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const featured = streams[0] || null;
  const rest = streams.slice(1);
  const featuredName =
    featured?.creator?.display_name ||
    (featured?.creator?.username
      ? `@${featured.creator.username}`
      : 'Creator');

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto pb-24 lg:pb-10">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {loading ? (
            <div className="rounded-2xl mb-10 h-56 sm:h-72 md:h-96 bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Loader2 className="animate-spin text-pink-500" size={28} />
            </div>
          ) : featured ? (
            <Link
              href={`/live/${featured.id}`}
              className="block relative rounded-2xl overflow-hidden mb-10 h-56 sm:h-72 md:h-96 bg-zinc-900 border border-zinc-800 group"
            >
              {(featured.thumbnail_url || featured.creator?.avatar_url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featured.thumbnail_url || featured.creator?.avatar_url || ""}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-500"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-pink-950/40" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10" />
              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 z-20">
                <div className="flex items-center gap-3 mb-2 sm:mb-3">
                  <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </span>
                  <span className="text-white/80 text-sm flex items-center gap-1">
                    <Users size={14} />
                    {featured.viewer_count || 0} watching
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-1 line-clamp-2">
                  {featured.title}
                </h1>
                <div className="flex items-center gap-2 mt-2">
                  {featured.creator?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={featured.creator.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover border border-white/20"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-700" />
                  )}
                  <p className="text-zinc-200 font-medium">{featuredName}</p>
                </div>
              </div>
            </Link>
          ) : (
            <div className="relative rounded-2xl overflow-hidden mb-10 h-56 sm:h-72 md:h-96 bg-zinc-900 border border-zinc-800">
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-pink-950/30" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
                <Radio className="text-zinc-600 mb-3" size={40} />
                <p className="text-xl font-semibold text-zinc-200">
                  No one is live right now
                </p>
                <p className="text-sm text-zinc-500 mt-2 max-w-md">
                  When creators go live, they appear here first — homepage
                  placement means more viewers and tips.
                </p>
                <Link
                  href="/live"
                  className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-sm font-semibold"
                >
                  <Video size={16} /> Browse Live
                </Link>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Radio className="text-pink-500" size={22} /> Live Now
            </h2>
            <Link
              href="/live"
              className="text-pink-500 text-sm hover:underline font-medium"
            >
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-pink-500" size={28} />
            </div>
          ) : streams.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
              <p className="text-zinc-300 font-medium">Quiet right now</p>
              <p className="text-sm text-zinc-500 mt-2">
                Check back soon — or go live if you are a creator.
              </p>
              <Link
                href="/live"
                className="inline-block mt-4 text-pink-400 text-sm font-medium hover:text-pink-300"
              >
                Open Live page →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {(rest.length ? rest : streams).map((s) => {
                const cname =
                  s.creator?.display_name ||
                  (s.creator?.username
                    ? `@${s.creator.username}`
                    : 'Creator');
                return (
                  <Link
                    key={s.id}
                    href={`/live/${s.id}`}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-pink-500/40 transition group active:scale-[0.99]"
                  >
                    <div className="aspect-video bg-zinc-800 relative">
                      {(s.thumbnail_url || s.creator?.avatar_url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.thumbnail_url || s.creator?.avatar_url || ""}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-pink-950/30 flex items-center justify-center">
                          <Radio className="text-zinc-600" size={36} />
                        </div>
                      )}
                      <span className="absolute top-3 left-3 bg-red-600 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        LIVE
                      </span>
                      <span className="absolute bottom-3 right-3 text-[11px] bg-black/70 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Users size={12} />
                        {s.viewer_count || 0}
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold truncate group-hover:text-pink-300 transition">
                        {s.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-2">
                        {s.creator?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.creator.avatar_url}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-zinc-700" />
                        )}
                        <p className="text-sm text-zinc-400 truncate">{cname}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {streams.length > 0 && (
            <p className="text-center text-xs text-zinc-600 mt-8">
              Showing up to 10 lives · refreshed automatically
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
