'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, MessageCircle, Heart, Lock, Play, Radio
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { createClient } from '../../lib/supabase';

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const username = params.username as string;

  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postsCount, setPostsCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [liveStream, setLiveStream] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username.toLowerCase())
        .single();

      if (error || !profileData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProfile(profileData);

      // Live
      if (profileData.account_type === 'creator') {
        const { data: live } = await supabase
          .from('live_streams')
          .select('id, title, status, thumbnail_url, viewer_count')
          .eq('creator_id', profileData.id)
          .in('status', ['active', 'idle_ready'])
          .eq('private_active', false)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setLiveStream(live || null);
      }

      // Posts
      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .eq('creator_id', profileData.id)
        .order('created_at', { ascending: false })
        .limit(30);
      setPosts(postsData || []);
      setPostsCount((postsData || []).length);

      // Counts
      const { count: fCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileData.id);
      setFollowersCount(fCount || 0);

      const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profileData.id);
      setFollowingCount(following || 0);

      if (user) {
        const { data: follow } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', profileData.id)
          .maybeSingle();
        setIsFollowing(!!follow);

        const { data: sub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('fan_id', user.id)
          .eq('creator_id', profileData.id)
          .eq('status', 'active')
          .maybeSingle();
        setIsSubscribed(!!sub);
      }

      setLoading(false);
    };
    load();
  }, [username]);

  const handleFollow = async () => {
    if (!currentUser) return router.push('/login');
    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', profile.id);
      setIsFollowing(false);
      setFollowersCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: profile.id });
      setIsFollowing(true);
      setFollowersCount((c) => c + 1);
    }
    setFollowLoading(false);
  };

  const handleSubscribe = async () => {
    if (!currentUser) return router.push('/login');
    // Placeholder – wire to your existing subscribe flow
    setSubLoading(true);
    setTimeout(() => setSubLoading(false), 600);
  };

  const handleMessage = () => {
    if (!currentUser) return router.push('/login');
    router.push(`/messages/${profile.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-zinc-400">Loading…</p>
        </main>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-zinc-400">Profile not found</p>
        </main>
      </div>
    );
  }

  const displayName = profile.display_name || profile.username;
  const isCreator = profile.account_type === 'creator';
  const isOwn = currentUser?.id === profile.id;
  const subPrice = profile.subscription_price || 9.99;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
        {/* Modern header */}
        <div className="relative">
          <div className="h-48 sm:h-56 bg-gradient-to-r from-pink-600 via-pink-500 to-purple-600">
            {profile.banner_url && (
              <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="absolute -bottom-16 left-6 sm:left-8">
            <div className="relative">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-zinc-950 overflow-hidden bg-zinc-800">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl font-bold bg-gradient-to-br from-pink-500 to-purple-600">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              {liveStream && (
                <Link
                  href={`/live/${liveStream.id}`}
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-red-400/40"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 pt-20 pb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold">{displayName}</h1>
                {isCreator && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-500/15 text-pink-400 border border-pink-500/30">
                    Creator
                  </span>
                )}
              </div>
              <p className="text-pink-400 text-lg">@{profile.username}</p>
              {profile.bio && (
                <p className="text-zinc-300 mt-3 max-w-xl whitespace-pre-wrap">{profile.bio}</p>
              )}
            </div>

            {!isOwn && (
              <div className="flex flex-wrap gap-2">
                {isCreator && (
                  <button
                    onClick={handleSubscribe}
                    disabled={subLoading}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
                      isSubscribed
                        ? 'bg-zinc-800 border border-zinc-700 text-white'
                        : 'bg-gradient-to-r from-pink-600 to-rose-500 text-white hover:opacity-90'
                    }`}
                  >
                    {subLoading ? '…' : isSubscribed ? 'Subscribed' : `Subscribe · £${subPrice}/mo`}
                  </button>
                )}
                <button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 transition"
                >
                  {followLoading ? '…' : isFollowing ? 'Following' : 'Follow'}
                </button>
                <button
                  onClick={handleMessage}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 transition flex items-center gap-2"
                >
                  <MessageCircle size={16} />
                  Message
                </button>
              </div>
            )}
            {isOwn && (
              <Link
                href="/account"
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 transition"
              >
                Edit Profile
              </Link>
            )}
          </div>

          {/* Stats */}
          <div className="flex gap-8 mt-6 text-sm">
            <div><span className="font-semibold">{postsCount}</span> <span className="text-zinc-400">posts</span></div>
            <div><span className="font-semibold">{followersCount}</span> <span className="text-zinc-400">followers</span></div>
            <div><span className="font-semibold">{followingCount}</span> <span className="text-zinc-400">following</span></div>
          </div>

          {/* Timeline */}
          <div className="mt-10">
            <h2 className="text-xl font-semibold mb-5">Timeline</h2>
            {posts.length === 0 ? (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-12 text-center">
                <p className="text-zinc-400">No posts yet</p>
              </div>
            ) : (
              <div className="space-y-6 max-w-2xl">
                {posts.map((post) => {
                  const locked = post.is_locked && !isSubscribed && !isOwn;
                  return (
                    <div
                      key={post.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
                    >
                      {post.content && (
                        <div className="px-4 pt-4 pb-2">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
                        </div>
                      )}
                      {post.media_url && (
                        <div className="relative">
                          {post.media_type === 'video' ? (
                            <video
                              src={post.media_url}
                              controls={!locked}
                              className="w-full max-h-[480px] object-cover"
                            />
                          ) : (
                            <img
                              src={post.media_url}
                              alt=""
                              className="w-full max-h-[480px] object-cover"
                            />
                          )}
                          {locked && (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                              <Lock size={28} className="text-white" />
                              <p className="text-sm font-medium">Subscribe to unlock</p>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="px-4 py-3 flex items-center gap-5 text-sm text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <Heart size={16} />
                          {post.likes_count || 0}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MessageCircle size={16} />
                          {post.comments_count || 0}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
