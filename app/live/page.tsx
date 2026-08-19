'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Radio, Loader2, Users, Video } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

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

export default function LiveIndexPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [streams, setStreams] = useState<LiveCard[]>([]);
  const [error, setError] = useState('');
  const [isCreator, setIsCreator] = useState(false);
  const [goingLive, setGoingLive] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('id', user.id)
        .single();
      setIsCreator(data?.account_type === 'creator');
    })();
  }, []);

  const goLive = async () => {
    setGoingLive(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in again');
      const res = await fetch('/api/live/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ title: 'Live now' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not go live');
      router.push(data.watchPath || `/live/${data.stream?.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed');
      setGoingLive(false);
    }
  };

  const load = async () => {
    try {
      const res = await fetch('/api/live/active');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load lives');
      setStreams(data.streams || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-10">
          <div className="p-4 lg:p-8 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-3">
                  <Radio className="text-pink-500" size={28} />
                  Live
                </h1>
                <p className="text-zinc-500 text-sm mt-1">
                  Creators broadcasting right now
                </p>
              </div>
              {isCreator && (
                <button
                  type="button"
                  onClick={goLive}
                  disabled={goingLive}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 font-semibold text-sm disabled:opacity-50 transition"
                >
                  {goingLive ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Video size={18} />
                  )}
                  {goingLive ? 'Starting…' : 'Go live'}
                </button>
              )}
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
            ) : streams.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                <Radio className="mx-auto text-zinc-600 mb-3" size={36} />
                <p className="text-zinc-200 font-medium text-lg">No one is live</p>
                <p className="text-sm text-zinc-500 mt-2">
                  When creators go live, they’ll show up here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {streams.map((s) => {
                  const name =
                    s.creator?.display_name ||
                    (s.creator?.username
                      ? `@${s.creator.username}`
                      : 'Creator');
                  return (
                    <Link
                      key={s.id}
                      href={`/live/${s.id}`}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-pink-500/40 transition group"
                    >
                      <div className="aspect-video bg-zinc-800 relative">
                        {s.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.thumbnail_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900" />
                        )}
                        <span className="absolute top-3 left-3 bg-red-600 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          LIVE
                        </span>
                        <span className="absolute bottom-3 right-3 text-[11px] bg-black/70 px-2 py-0.5 rounded flex items-center gap-1">
                          <Users size={12} />
                          {s.viewer_count || 0}
                        </span>
                      </div>
                      <div className="p-4">
                        <p className="font-semibold truncate group-hover:text-pink-300 transition">
                          {s.title}
                        </p>
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
                          <span className="text-sm text-zinc-400 truncate">
                            {name}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
