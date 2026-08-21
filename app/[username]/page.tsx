'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, Heart, DollarSign, TrendingUp, MessageCircle, Package, ShoppingBag, Film, Lock, Play, Radio
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { createClient } from '../../lib/supabase';
import { createNotification } from '../../lib/notifications';

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const username = params.username as string;

  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [shopItems, setShopItems] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [ownedClipIds, setOwnedClipIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [subscribersCount, setSubscribersCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [liveStream, setLiveStream] = useState<any>(null);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      if (user) {
        const { data: me } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', user.id)
          .single();
        setMyProfile(me);
      }

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

      // Active live for this creator
      if (profileData.account_type === 'creator') {
        const { data: live } = await supabase
          .from('live_streams')
          .select('id, title, status, thumbnail_url, viewer_count, private_active')
          .eq('creator_id', profileData.id)
          .in('status', ['active', 'idle_ready', 'disconnected'])
          .eq('private_active', false)
          .order('started_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        setLiveStream(live || null);
      } else {
        setLiveStream(null);
      }

      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .eq('creator_id', profileData.id)
        .order('created_at', { ascending: false })
        .limit(20);

      setPosts(postsData || []);

      if (profileData.account_type === 'creator') {
        const { data: shopData } = await supabase
          .from('shop_items')
          .select('*')
          .eq('creator_id', profileData.id)
          .in('status', ['available', 'reserved'])
          .order('created_at', { ascending: false });
        setShopItems(
          (shopData || []).map((row: any) => ({
            ...row,
            photos: Array.isArray(row.photos) ? row.photos : [],
          }))
        );

        const { data: clipData } = await supabase
          .from('clips')
          .select(
            'id, title, price_gbp, thumbnail_url, duration_seconds, sales_count, is_published'
          )
          .eq('creator_id', profileData.id)
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(12);
        setClips(clipData || []);
      } else {
        setShopItems([]);
        setClips([]);
      }

      if (user) {
        const { data: buys } = await supabase
          .from('clip_purchases')
          .select('clip_id')
          .eq('buyer_id', user.id);
        setOwnedClipIds(new Set((buys || []).map((b: any) => b.clip_id)));
      } else {
        setOwnedClipIds(new Set());
      }

      const { count: fCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileData.id);

      setFollowersCount(fCount || 0);

      const { count: sCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', profileData.id)
        .eq('status', 'active');

      setSubscribersCount(sCount || 0);

      if (user) {
        const { data: followData } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', profileData.id)
          .maybeSingle();

        setIsFollowing(!!followData);

        const { data: subData } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('subscriber_id', user.id)
          .eq('creator_id', profileData.id)
          .eq('status', 'active')
          .maybeSingle();

        setIsSubscribed(!!subData);
      }

      setLoading(false);
    };

    if (username) loadProfile();
  }, [username]);

  const actorName = () =>
    myProfile?.display_name || myProfile?.username || 'Someone';

  const handleFollow = async () => {
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!profile || followLoading) return;

    setFollowLoading(true);
    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', profile.id);
        setIsFollowing(false);
        setFollowersCount((prev) => Math.max(0, prev - 1));
      } else {
        await supabase.from('follows').insert({
          follower_id: currentUser.id,
          following_id: profile.id,
        });
        setIsFollowing(true);
        setFollowersCount((prev) => prev + 1);

        await createNotification({
          userId: profile.id,
          actorId: currentUser.id,
          type: 'follow',
          title: `${actorName()} started following you`,
          body: null,
          link: `/${myProfile?.username || ''}`,
        });
      }
    } catch (err) {
      console.error('Follow error:', err);
      alert('Something went wrong');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!profile || subLoading) return;

    setSubLoading(true);
    try {
      if (isSubscribed) {
        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('subscriber_id', currentUser.id)
          .eq('creator_id', profile.id);
        setIsSubscribed(false);
        setSubscribersCount((prev) => Math.max(0, prev - 1));
      } else {
        const price = profile.subscription_price ?? 9.99;
        const { error } = await supabase.from('subscriptions').upsert(
          {
            subscriber_id: currentUser.id,
            creator_id: profile.id,
            price,
            status: 'active',
            started_at: new Date().toISOString(),
          },
          { onConflict: 'subscriber_id,creator_id' }
        );
        if (error) throw error;
        setIsSubscribed(true);
        setSubscribersCount((prev) => prev + 1);

        await createNotification({
          userId: profile.id,
          actorId: currentUser.id,
          type: 'subscribe',
          title: `${actorName()} subscribed to you`,
          body: `£${Number(price).toFixed(2)}/mo`,
          link: `/${myProfile?.username || ''}`,
        });
      }
    } catch (err: any) {
      console.error('Subscribe error:', err);
      alert(err.message || 'Something went wrong');
    } finally {
      setSubLoading(false);
    }
  };

  const canMessage = () => {
    if (!profile) return false;
    if (currentUser?.id === profile.id) return true;
    const privacy = profile.message_privacy || 'everyone';
    if (privacy === 'nobody') return false;
    if (privacy === 'subscribers') return isSubscribed;
    return true;
  };

  const handleMessage = async () => {
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!profile) return;

    const privacy = profile.message_privacy || 'everyone';
    if (privacy === 'nobody') {
      alert('This user is not accepting messages.');
      return;
    }
    if (privacy === 'subscribers' && !isSubscribed) {
      alert('Only subscribers can message this user.');
      return;
    }

    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(
          `and(participant_1.eq.${currentUser.id},participant_2.eq.${profile.id}),and(participant_1.eq.${profile.id},participant_2.eq.${currentUser.id})`
        )
        .maybeSingle();

      if (existing) {
        router.push(`/messages/${existing.id}`);
        return;
      }

      const { data: newConvo, error } = await supabase
        .from('conversations')
        .insert({
          participant_1: currentUser.id,
          participant_2: profile.id,
        })
        .select('id')
        .single();

      if (error) throw error;
      router.push(`/messages/${newConvo.id}`);
    } catch (err) {
      console.error('Message error:', err);
      alert('Could not start conversation');
    }
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
  const showSubscribe =
    profile.account_type === 'creator' &&
    profile.subscriptions_enabled &&
    !isOwnProfile;
  const subPrice = Number(profile.subscription_price ?? 9.99).toFixed(2);
  const messagingAllowed = canMessage();

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
        <div className="lg:hidden sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-semibold">@{profile.username}</h1>
        </div>

        <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8">
          {liveStream && (
            <Link
              href={`/live/${liveStream.id}`}
              className="mb-6 flex items-center gap-3 bg-gradient-to-r from-red-600/20 to-pink-600/10 border border-red-500/40 rounded-2xl p-3.5 hover:border-red-400/60 transition group"
            >
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0 relative">
                {(liveStream.thumbnail_url || profile.avatar_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={liveStream.thumbnail_url || profile.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Radio size={22} className="text-zinc-500" />
                  </div>
                )}
                <span className="absolute top-1 left-1 bg-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded">
                  LIVE
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white group-hover:text-pink-200 transition truncate">
                  {liveStream.title || 'Live now'}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {displayName} is live
                  {liveStream.viewer_count
                    ? ` · ${liveStream.viewer_count} watching`
                    : ''}
                </p>
              </div>
              <span className="flex-shrink-0 text-sm font-semibold text-pink-400 group-hover:text-pink-300">
                Watch →
              </span>
            </Link>
          )}
          <div className="flex flex-col sm:flex-row gap-6 mb-8">
            <div className="flex flex-col items-center gap-3 flex-shrink-0">
              <div className="relative">
                <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-5xl font-bold overflow-hidden ring-offset-2 ring-offset-zinc-950">
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
                {liveStream && (
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-600 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-lg border border-red-400/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </span>
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

                {isOwnProfile ? (
                  <Link
                    href="/account"
                    className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium transition w-fit"
                  >
                    Edit Profile
                  </Link>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {showSubscribe && (
                      <button
                        onClick={handleSubscribe}
                        disabled={subLoading}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50 ${
                          isSubscribed
                            ? 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white'
                            : 'bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 text-white'
                        }`}
                      >
                        {subLoading
                          ? '...'
                          : isSubscribed
                          ? 'Subscribed'
                          : `Subscribe · £${subPrice}/mo`}
                      </button>
                    )}

                    <button
                      onClick={handleFollow}
                      disabled={followLoading}
                      className={`px-5 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50 ${
                        isFollowing
                          ? 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white'
                          : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white'
                      }`}
                    >
                      {followLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
                    </button>

                    {messagingAllowed ? (
                      <button
                        onClick={handleMessage}
                        className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium transition"
                      >
                        <MessageCircle size={16} />
                        Message
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-500 cursor-not-allowed"
                        title={
                          (profile.message_privacy || 'everyone') === 'subscribers'
                            ? 'Subscribers only'
                            : 'Not accepting messages'
                        }
                      >
                        <MessageCircle size={16} />
                        {(profile.message_privacy || 'everyone') === 'subscribers'
                          ? 'Subscribers only'
                          : 'Messages off'}
                      </button>
                    )}
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
              <div className="text-3xl font-semibold">{subscribersCount}</div>
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

          {profile?.account_type === 'creator' && clips.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Film size={22} className="text-pink-400" />
                  Clips
                </h2>
                <Link
                  href="/clips"
                  className="text-sm text-pink-400 hover:text-pink-300"
                >
                  View all →
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {clips.map((clip) => {
                  const owns =
                    ownedClipIds.has(clip.id) ||
                    currentUser?.id === profile.id ||
                    Number(clip.price_gbp) === 0;
                  const dur =
                    clip.duration_seconds && clip.duration_seconds > 0
                      ? `${Math.floor(clip.duration_seconds / 60)}:${String(
                          clip.duration_seconds % 60
                        ).padStart(2, '0')}`
                      : null;
                  return (
                    <Link
                      key={clip.id}
                      href="/clips"
                      className="bg-zinc-900 border border-zinc-800 hover:border-pink-500/40 rounded-2xl overflow-hidden transition group"
                    >
                      <div className="aspect-video bg-zinc-800 relative">
                        {clip.thumbnail_url ? (
                          <img
                            src={clip.thumbnail_url}
                            alt={clip.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <Film size={28} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          {owns ? (
                            <Play size={22} className="text-white" />
                          ) : (
                            <Lock size={18} className="text-white" />
                          )}
                        </div>
                        {dur && (
                          <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/75 px-1.5 py-0.5 rounded">
                            {dur}
                          </span>
                        )}
                        {owns && (
                          <span className="absolute top-1.5 left-1.5 text-[9px] font-semibold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">
                            Owned
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-sm font-medium truncate">{clip.title}</p>
                        <p className="text-pink-400 text-sm font-semibold">
                          {Number(clip.price_gbp) === 0
                            ? 'Free'
                            : `£${Number(clip.price_gbp).toFixed(2)}`}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {profile?.account_type === 'creator' && shopItems.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <ShoppingBag size={22} className="text-pink-400" />
                  Shop
                </h2>
                <Link
                  href="/shop"
                  className="text-sm text-pink-400 hover:text-pink-300"
                >
                  View all →
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {shopItems.map((item) => (
                  <Link
                    key={item.id}
                    href="/shop"
                    className="bg-zinc-900 border border-zinc-800 hover:border-pink-500/40 rounded-2xl overflow-hidden transition group"
                  >
                    <div className="aspect-square bg-zinc-800 relative">
                      {item.photos?.[0] ? (
                        <img
                          src={item.photos[0]}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Package size={28} />
                        </div>
                      )}
                      {item.status === 'reserved' && (
                        <span className="absolute top-2 left-2 text-[10px] font-semibold bg-amber-500 text-black px-2 py-0.5 rounded-full">
                          Reserved
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-pink-400 text-sm font-semibold">
                        £{Number(item.price).toFixed(2)}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {item.category} · {item.condition}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

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