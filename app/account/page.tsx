'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Edit3, LogOut
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { ProfileStoryRing, HighlightRail } from '../../components/StoriesRail';
import { createClient } from '../../lib/supabase';

export default function MyAccountPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [subscribersCount, setSubscribersCount] = useState(0);
  const [postsCount, setPostsCount] = useState(0);
  const [liveStream, setLiveStream] = useState<any>(null);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(data);

      const { count: fCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id);
      setFollowersCount(fCount || 0);

      const { count: sCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .eq('status', 'active');
      setSubscribersCount(sCount || 0);

      const { count: pCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id);
      setPostsCount(pCount || 0);

      if (data?.account_type === 'creator') {
        const { data: live } = await supabase
          .from('live_streams')
          .select('id, title, status, thumbnail_url, viewer_count, private_active')
          .eq('creator_id', user.id)
          .in('status', ['active', 'idle_ready', 'disconnected'])
          .eq('private_active', false)
          .order('started_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        setLiveStream(live || null);
      }

      setLoading(false);
    };
    loadProfile();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <p className="text-zinc-400">Loading profile...</p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const displayName = profile?.display_name || profile?.username || 'User';
  const username = profile?.username || 'username';
  const initial = displayName.charAt(0).toUpperCase();
  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      })
    : 'Recently';

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
          <div className="max-w-3xl mx-auto">
            <div className="relative h-40 sm:h-52 bg-zinc-900">
              {profile.banner_url || profile.avatar_url ? (
                <img
                  src={profile.banner_url || profile.avatar_url}
                  alt=""
                  className={`w-full h-full object-cover ${profile.banner_url ? '' : 'blur-sm scale-110 opacity-70'}`}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-pink-600/40 via-zinc-900 to-purple-900/40" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-black/20" />
            </div>

            <div className="px-4 lg:px-8 -mt-12">
              <div className="flex items-end justify-between gap-3">
                <div className="relative">
                  <ProfileStoryRing
                    profileId={profile.id}
                    userId={profile.id}
                    avatarUrl={profile.avatar_url}
                    name={displayName}
                    username={profile.username}
                    live={!!liveStream}
                  >
                    <div
                      className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-4xl font-bold overflow-hidden ring-4 ring-zinc-950 ${
                        liveStream ? 'shadow-[0_0_24px_rgba(239,68,68,0.45)]' : ''
                      }`}
                    >
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        initial
                      )}
                    </div>
                  </ProfileStoryRing>
                  {liveStream && (
                    <Link
                      href={`/live/${liveStream.id}`}
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      LIVE
                    </Link>
                  )}
                </div>
                <Link
                  href="/settings"
                  className="px-4 py-2 rounded-full bg-zinc-900 border border-zinc-700 text-sm font-medium inline-flex items-center gap-2"
                >
                  <Edit3 size={14} /> Edit profile
                </Link>
              </div>

              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{displayName}</h1>
                  {profile.account_type && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20 capitalize">
                      {profile.account_type === 'sub' ? 'Subscriber' : profile.account_type}
                    </span>
                  )}
                </div>
                {profile.x_username ? (
                  <a
                    href={`https://x.com/${profile.x_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-pink-400"
                  >
                    @{profile.x_username}
                  </a>
                ) : (
                  <p className="text-sm text-pink-400">@{username}</p>
                )}
              </div>

              <div className="flex gap-5 mt-4 text-sm">
                <span><b>{postsCount}</b> <span className="text-zinc-400">posts</span></span>
                <span><b>{followersCount}</b> <span className="text-zinc-400">followers</span></span>
                <span><b>{subscribersCount}</b> <span className="text-zinc-400">subscribers</span></span>
              </div>

              {profile.bio && (
                <p className="mt-3 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {profile.bio}
                </p>
              )}
              <p className="mt-3 text-xs text-zinc-500">Joined {joinedDate}</p>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6">
            {profile.account_type === 'creator' && (
              <HighlightRail
                profileId={profile.id}
                userId={profile.id}
                name={displayName}
                username={profile.username}
                avatarUrl={profile.avatar_url}
                isOwner
              />
            )}

            <div className="mt-10">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-3 bg-zinc-900 hover:bg-red-950/30 border border-zinc-800 hover:border-red-900/50 text-red-400 py-4 rounded-2xl font-medium transition"
              >
                <LogOut size={20} /> Log Out
              </button>
              <p className="text-center text-xs text-zinc-500 mt-4">
                World Of Dommes • v1.0
              </p>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
