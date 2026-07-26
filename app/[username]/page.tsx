'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, Heart, DollarSign, TrendingUp, MessageCircle
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

  useEffect(() => {
    const loadProfile = async () => {
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

      // Load posts
      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .eq('creator_id', profileData.id)
        .order('created_at', { ascending: false })
        .limit(20);

      setPosts(postsData || []);

      // Load followers count
      const { count } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileData.id);

      setFollowersCount(count || 0);

      // Check if current user is following this profile
      if (user) {
        const { data: followData } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', profileData.id)
          .maybeSingle();

        setIsFollowing(!!followData);
      }

      setLoading(false);
    };

    if (username) {
      loadProfile();
    }
  }, [username]);

  const handleFollow = async () => {
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!profile || followLoading) return;

    setFollowLoading(true);

    try {
      if (isFollowing) {
        // Unfollow
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', profile.id);

        setIsFollowing(false);
        setFollowersCount((prev) => Math.max(0, prev - 1));
      } else {
        // Follow
        await supabase.from('follows').insert({
          follower_id: currentUser.id,
          following_id: profile.id,
        });

        setIsFollowing(true);
        setFollowersCount((prev) => prev + 1);
      }
    } catch (err) {
      console.error('Follow error:', err);
      alert('Something went wrong');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleMessage = () => {
    if (!currentUser) {
      router.push('/login');
      return;
    }
    // For now go to messages page (we can make proper DMs later)
    router.push(`/messages?user=${profile.username}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-zinc-400">Loading profile...</p>
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">User not found</h1>
            <p className="text-zinc-400 mb-6">@{username} doesn’t exist</p>
            <Link href="/discover" className="text-pink-400 hover:text-pink-300">
              ← Back to Discover
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const displayName = profile.display_name || profile.username;
  const initial = displayName.charAt(0).toUpperCase();
  const joinedDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      })
    : '';

  const isOwnProfile = currentUser?.id === profile.id;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Mobile Top Bar */}
        <div className="lg:hidden sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-semibold">@{profile.username}</h1>
        </div>

        <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8">
          {/* Profile Header */}
          <div className="flex flex-col sm:flex-row gap-6 mb-8">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3 flex-shrink-0">
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-5xl font-bold overflow-hidden">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initial
                )}
              </div>

              {profile.x_username && (
                <a
                  href={`https://x.com/${profile.x_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded-xl transition"
                >
                  <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                    <span className="text-white font-bold text-xs">𝕏</span>
                  </div>
                  <span className="text-sm font-medium">@{profile.x_username}</span>
                </a>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-1">
                  <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
                    {displayName}
                  </h1>
                  <p className="text-pink-400 text-lg leading-tight">
                    @{profile.username}
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5 text-sm text-zinc-400 pt-1">
                    {joinedDate && <span>Joined {joinedDate}</span>}
                    {profile.account_type && (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20 capitalize">
                        {profile.account_type}
                      </span>
                    )}
                  </div>
                </div>

                {/* Buttons */}
                {isOwnProfile ? (
                  <Link
                    href="/account"
                    className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium transition w-fit"
                  >
                    Edit Profile
                  </Link>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleFollow}
                      disabled={followLoading}
                      className={`px-5 py-2.5 rounded-xl text-sm font-medium transition w-fit disabled:opacity-50 ${
                        isFollowing
                          ? 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white'
                          : 'bg-pink-600 hover:bg-pink-700 text-white'
                      }`}
                    >
                      {followLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
                    </button>

                    <button
                      onClick={handleMessage}
                      className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium transition w-fit"
                    >
                      <MessageCircle size={16} />
                      Message
                    </button>
                  </div>
                )}
              </div>

              {profile.bio && (
                <p className="mt-5 text-zinc-300 max-w-2xl leading-relaxed">
                  {profile.bio}
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <Users size={16} />
                <span>Followers</span>
              </div>
              <div className="text-3xl font-semibold">{followersCount}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <Heart size={16} />
                <span>Subscribers</span>
              </div>
              <div className="text-3xl font-semibold">0</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <DollarSign size={16} />
                <span>Total Tips</span>
              </div>
              <div className="text-3xl font-semibold">£0</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-1">
                <TrendingUp size={16} />
                <span>Posts</span>
              </div>
              <div className="text-3xl font-semibold">{posts.length}</div>
            </div>
          </div>

          {/* Posts */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Posts</h2>

            {posts.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                <p className="text-zinc-400">No posts yet</p>
              </div>
            ) : (
              <div className="space-y-5">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
                  >
                    {post.content && (
                      <div className="px-4 py-3">
                        <p className="text-sm leading-relaxed text-zinc-100">
                          {post.content}
                        </p>
                      </div>
                    )}

                    {post.media_type === 'photo' && post.media_url && (
                      <div className="max-h-[420px] overflow-hidden">
                        <img
                          src={post.media_url}
                          alt="Post"
                          className="w-full max-h-[420px] object-cover"
                        />
                      </div>
                    )}

                    {post.media_type === 'video' && post.media_url && (
                      <div className="max-h-[420px] overflow-hidden">
                        <video
                          src={post.media_url}
                          controls
                          className="w-full max-h-[420px]"
                        />
                      </div>
                    )}

                    <div className="px-4 py-3 flex items-center gap-4 text-sm text-zinc-400">
                      <span>{post.likes_count || 0} likes</span>
                      <span>{post.comments_count || 0} comments</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}