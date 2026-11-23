'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Edit3, LogOut, Film, Play, ShoppingBag, Package
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import SiteFooter from '../../components/SiteFooter';
import AuthGuard from '../../components/AuthGuard';
import { ProfileStoryRing, HighlightRail } from '../../components/StoriesRail';
import FeedPosts from '../../components/FeedPosts';
import { createClient } from '../../lib/supabase';

export default function MyAccountPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postsCount, setPostsCount] = useState(0);
  const [posts, setPosts] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [shopItems, setShopItems] = useState<any[]>([]);
  const [tab, setTab] = useState<'posts' | 'clips' | 'shop'>('posts');
  const [peopleOpen, setPeopleOpen] = useState<null | 'following' | 'followers'>(null);
  const [people, setPeople] = useState<any[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState('');
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

      const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', user.id);
      setFollowingCount(following || 0);

      const { count: pCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id);
      setPostsCount(pCount || 0);

      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setPosts(postsData || []);

      if (data?.account_type === 'creator') {
        const { data: clipData } = await supabase
          .from('clips')
          .select('id, title, price_gbp, thumbnail_url, duration_seconds, is_published')
          .eq('creator_id', user.id)
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(12);
        setClips(clipData || []);
        const { data: shopData } = await supabase
          .from('shop_items')
          .select('*')
          .eq('creator_id', user.id)
          .in('status', ['available', 'reserved'])
          .order('created_at', { ascending: false });
        setShopItems(
          (shopData || []).map((row: any) => ({
            ...row,
            photos: Array.isArray(row.photos) ? row.photos : [],
          }))
        );
      }

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

  useEffect(() => {
    if (!peopleOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [peopleOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const openPeople = async (kind: 'following' | 'followers') => {
    if (!profile?.id) return;
    setPeopleOpen(kind);
    setPeopleQuery('');
    setPeopleLoading(true);
    setPeople([]);
    const column = kind === 'followers' ? 'following_id' : 'follower_id';
    const other = kind === 'followers' ? 'follower_id' : 'following_id';
    const { data: rows } = await supabase
      .from('follows')
      .select(other)
      .eq(column, profile.id)
      .limit(100);
    const ids = (rows || []).map((r: any) => r[other]).filter(Boolean);
    if (!ids.length) {
      setPeople([]);
      setPeopleLoading(false);
      return;
    }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', ids);
    setPeople(profiles || []);
    setPeopleLoading(false);
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
                      {profile.account_type === 'sub' ? 'Fan' : profile.account_type}
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
                <button type="button" onClick={() => openPeople('following')} className="group cursor-pointer">
                  <b className="group-hover:text-pink-400">{followingCount}</b> <span className="text-zinc-400 group-hover:text-pink-400">following</span>
                </button>
                <button type="button" onClick={() => openPeople('followers')} className="group cursor-pointer">
                  <b className="group-hover:text-pink-400">{followersCount}</b> <span className="text-zinc-400 group-hover:text-pink-400">followers</span>
                </button>
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

            {profile.account_type === 'creator' && (
              <div className="flex border-b border-zinc-800 mb-6">
                {(['posts', 'clips', 'shop'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`flex-1 py-3 text-sm font-medium capitalize border-b-2 ${
                      tab === key ? 'border-pink-500 text-white' : 'border-transparent text-zinc-500'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            )}

            {(profile.account_type !== 'creator' || tab === 'posts') && (
            <div>
              {posts.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                  <p className="text-zinc-400">No posts yet</p>
                </div>
              ) : (
                <FeedPosts posts={posts} setPosts={setPosts} userId={profile.id} profile={profile} hideHeader />
              )}
            </div>
            )}

            {profile.account_type === 'creator' && tab === 'clips' && (
              <div>
                {clips.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                    <p className="text-zinc-400">No clips yet</p>
                  </div>
                ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {clips.map((clip) => {
                    const dur =
                      clip.duration_seconds && clip.duration_seconds > 0
                        ? `${Math.floor(clip.duration_seconds / 60)}:${String(clip.duration_seconds % 60).padStart(2, '0')}`
                        : null;
                    return (
                      <Link
                        key={clip.id}
                        href="/clips"
                        className="bg-zinc-900 border border-zinc-800 hover:border-pink-500/40 rounded-2xl overflow-hidden transition group"
                      >
                        <div className="aspect-video bg-zinc-800 relative">
                          {clip.thumbnail_url ? (
                            <img src={clip.thumbnail_url} alt={clip.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <Film size={28} />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <Play size={22} className="text-white" />
                          </div>
                          {dur && (
                            <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/75 px-1.5 py-0.5 rounded">
                              {dur}
                            </span>
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="text-sm font-medium truncate">{clip.title}</p>
                          <p className="text-pink-400 text-sm font-semibold">
                            {Number(clip.price_gbp) === 0 ? 'Free' : `£${Number(clip.price_gbp).toFixed(2)}`}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
                )}
              </div>
            )}

            {profile.account_type === 'creator' && tab === 'shop' && (
              <div>
                {shopItems.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                    <p className="text-zinc-400">No shop items yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {shopItems.map((item) => (
                      <Link key={item.id} href="/shop" className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                        <div className="aspect-square bg-zinc-800 relative">
                          {item.photos?.[0] ? (
                            <img src={item.photos[0]} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <Package size={28} />
                            </div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-pink-400 text-sm font-semibold">£{Number(item.price).toFixed(2)}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
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
                  <SiteFooter />
        </main>
        {peopleOpen && (() => {
          const q = peopleQuery.trim().toLowerCase();
          const shown = people.filter((p) =>
            !q ||
            (p.display_name || '').toLowerCase().includes(q) ||
            (p.username || '').toLowerCase().includes(q)
          );
          return (
          <div className="fixed inset-0 z-[80] flex items-end lg:items-center justify-center" onClick={() => setPeopleOpen(null)}>
            <div className="absolute inset-0 bg-black/75" />
            <div className="relative w-full lg:w-[440px] bg-zinc-950 border border-zinc-800 rounded-t-3xl lg:rounded-3xl h-[78vh] flex flex-col sheet-up" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <p className="font-semibold capitalize">{peopleOpen}</p>
                <button type="button" onClick={() => setPeopleOpen(null)} className="w-8 h-8 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800" aria-label="Close">×</button>
              </div>
              <div className="px-5 pb-3">
                <input
                  value={peopleQuery}
                  onChange={(e) => setPeopleQuery(e.target.value)}
                  placeholder="Search"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2.5 text-sm outline-none focus:border-pink-500"
                />
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-2">
                {peopleLoading ? (
                  <p className="text-sm text-zinc-500 py-8 text-center">Loading</p>
                ) : shown.length === 0 ? (
                  <p className="text-sm text-zinc-500 py-8 text-center">{q ? 'No matches' : 'No one yet'}</p>
                ) : (
                  shown.map((p) => (
                    <Link key={p.id} href={p.username ? `/${p.username}` : '/'} onClick={() => setPeopleOpen(null)} className="group flex items-center gap-3 px-3 py-3 border-b border-zinc-800/70 hover:bg-zinc-900">
                      <div className="w-11 h-11 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-sm font-semibold flex-shrink-0">
                        {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" /> : (p.display_name || p.username || 'U')[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-pink-400">{p.display_name || p.username}</p>
                        {p.username && <p className="text-xs text-zinc-500 truncate">@{p.username}</p>}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
          );
        })()}
      </div>
    </AuthGuard>
  );
}
