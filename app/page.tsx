'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Radio, Users, Loader2, Video, Search, Heart } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import FeedPosts from '../components/FeedPosts';
import { createClient } from '../lib/supabase';

type LiveCard = {
  id: string;
  title: string;
  creator_id?: string;
  viewer_count?: number;
  thumbnail_url?: string | null;
  creator?: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

type PostCard = {
  id: string;
  creator_id: string;
  content?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
  likes_count?: number;
  comments_count?: number;
  created_at?: string;
  profiles?: {
    username?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

export default function Home() {
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [lives, setLives] = useState<LiveCard[]>([]);
  const [posts, setPosts] = useState<PostCard[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
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
        setProfile(me);
      }

      if (!user) {
        setFollowingIds([]);
        setLives([]);
        setPosts([]);
        setReady(true);
        setLoading(false);
        return;
      }

      const [{ data: follows }, { data: iBlocked }, { data: blockedMe }] =
        await Promise.all([
          supabase.from('follows').select('following_id').eq('follower_id', user.id),
          supabase.from('blocks').select('blocked_id').eq('blocker_id', user.id),
          supabase.from('blocks').select('blocker_id').eq('blocked_id', user.id),
        ]);

      const hide = new Set<string>();
      (iBlocked || []).forEach((b: any) => b.blocked_id && hide.add(b.blocked_id));
      (blockedMe || []).forEach((b: any) => b.blocker_id && hide.add(b.blocker_id));

      const ids = [
        ...new Set(
          (follows || [])
            .map((f: any) => String(f.following_id || ''))
            .filter((id) => id && id !== user.id && !hide.has(id))
        ),
      ];
      setFollowingIds(ids);

      const feedIds = [...ids, user.id];

      const { data: liveRows } = await supabase
        .from('live_streams')
        .select(
          'id, creator_id, title, status, thumbnail_url, viewer_count, private_active'
        )
        .in('creator_id', feedIds)
        .in('status', ['active', 'idle_ready', 'disconnected'])
        .eq('private_active', false)
        .order('started_at', { ascending: false, nullsFirst: false })
        .limit(20);

      const liveList = liveRows || [];
      const liveCreatorIds = [...new Set(liveList.map((r: any) => r.creator_id))];
      let people: Record<string, any> = {};
      if (liveCreatorIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', liveCreatorIds);
        (profiles || []).forEach((p: any) => {
          people[p.id] = p;
        });
      }
      setLives(
        liveList.map((r: any) => ({
          ...r,
          creator: people[r.creator_id] || null,
        }))
      );

      const { data: postRows } = await supabase
        .from('posts')
        .select(
          `
          id, creator_id, content, media_type, media_url, thumbnail_url,
          likes_count, comments_count, created_at,
          profiles:creator_id ( username, display_name, avatar_url )
        `
        )
        .in('creator_id', feedIds)
        .order('created_at', { ascending: false })
        .limit(20);

      setPosts((postRows as any) || []);
      setReady(true);
      setLoading(false);
    };

    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const featured = lives[0] || null;
  const rest = lives.slice(1);
  const featuredName =
    featured?.creator?.display_name ||
    (featured?.creator?.username ? `@${featured.creator.username}` : 'Creator');

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-24 lg:pb-10">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          <div className="flex items-end justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold">Home</h1>
              <p className="text-sm text-zinc-500 mt-1">
                Lives and posts from people you follow
              </p>
            </div>
            <Link href="/discover" className="text-sm text-pink-400 hover:text-pink-300 font-medium">
              Discover →
            </Link>
          </div>

          {!userId && ready && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center mb-8">
              <p className="text-lg font-semibold mb-2">Log in to see your following feed</p>
              <p className="text-sm text-zinc-500 mb-5">
                Home shows lives and posts from creators you follow.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/login?next=/"
                  className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-sm font-semibold"
                >
                  Log in
                </Link>
                <Link
                  href="/discover"
                  className="px-5 py-2.5 rounded-xl border border-zinc-700 text-sm font-medium hover:bg-zinc-800"
                >
                  Browse Discover
                </Link>
              </div>
            </div>
          )}

          {userId && ready && followingIds.length === 0 && !loading && posts.length === 0 && lives.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center mb-8">
              <Heart className="mx-auto text-pink-500 mb-3" size={28} />
              <p className="text-lg font-semibold mb-2">Your feed is empty</p>
              <p className="text-sm text-zinc-500 mb-5 max-w-md mx-auto">
                Your own posts show here. Follow creators on Discover to fill the rest.
              </p>
              <Link
                href="/discover"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-sm font-semibold"
              >
                <Search size={16} /> Open Discover
              </Link>
            </div>
          )}

          {loading && (
            <div className="rounded-2xl mb-10 h-48 bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Loader2 className="animate-spin text-pink-500" size={28} />
            </div>
          )}

          {userId && featured && (
            <Link
              href={`/live/${featured.id}`}
              className="block relative rounded-2xl overflow-hidden mb-8 h-52 sm:h-72 md:h-80 bg-zinc-900 border border-zinc-800 group"
            >
              {featured.thumbnail_url || featured.creator?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={featured.thumbnail_url || featured.creator?.avatar_url || ''}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition duration-500"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-pink-950/40" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10" />
              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 z-20">
                <div className="flex items-center gap-3 mb-2">
                  <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </span>
                  <span className="text-white/80 text-sm flex items-center gap-1">
                    <Users size={14} />
                    {featured.viewer_count || 0} watching
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-2 line-clamp-2">
                  {featured.title}
                </h2>
                <div className="flex items-center gap-2">
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
          )}

          {userId && (followingIds.length > 0 || posts.length > 0 || lives.length > 0) && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Radio className="text-pink-500" size={20} /> Following live
                </h2>
                <Link href="/live" className="text-pink-500 text-sm hover:underline font-medium">
                  All lives →
                </Link>
              </div>

              {!loading && lives.length === 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center mb-10">
                  <p className="text-zinc-300 font-medium">None of your follows are live</p>
                  <Link href="/live" className="inline-flex items-center gap-2 mt-3 text-pink-400 text-sm">
                    <Video size={16} /> Browse all lives
                  </Link>
                </div>
              )}

              {rest.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-5 mb-10">
                  {rest.map((s) => {
                    const name =
                      s.creator?.display_name ||
                      (s.creator?.username ? `@${s.creator.username}` : 'Creator');
                    return (
                      <Link
                        key={s.id}
                        href={`/live/${s.id}`}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-pink-500/40 transition"
                      >
                        <div className="aspect-video bg-zinc-800 relative">
                          {s.thumbnail_url || s.creator?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={s.thumbnail_url || s.creator?.avatar_url || ''}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                              <Radio className="text-zinc-600" size={28} />
                            </div>
                          )}
                          <span className="absolute top-2 left-2 bg-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            LIVE
                          </span>
                        </div>
                        <div className="p-3">
                          <p className="font-medium text-sm truncate">{s.title}</p>
                          <p className="text-xs text-zinc-500 truncate mt-0.5">{name}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              <h2 className="text-lg font-bold mb-4">Following feed</h2>
              {posts.length === 0 && !loading ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500 text-sm">
                  No posts from people you follow yet.
                </div>
              ) : (
                <FeedPosts
                  posts={posts}
                  setPosts={setPosts}
                  userId={userId}
                  profile={profile}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
