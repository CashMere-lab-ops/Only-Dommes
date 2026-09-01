'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, Heart, DollarSign, TrendingUp, MessageCircle, Package, ShoppingBag, Film, Lock, Play, Radio,
  MoreHorizontal, Share2, Ban, Flag, Link as LinkIcon, X
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { createClient } from '../../lib/supabase';
import { createNotification } from '../../lib/notifications';
import { applyUserBlock } from '../../lib/blocks';

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
  const [subCancelling, setSubCancelling] = useState(false);
  const [subPeriodEnd, setSubPeriodEnd] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [liveStream, setLiveStream] = useState<any>(null);
  const [showMore, setShowMore] = useState(false);
  const [iBlockedThem, setIBlockedThem] = useState(false);
  const [theyBlockedMe, setTheyBlockedMe] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);

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

        const { data: myBlock } = await supabase
          .from('blocks')
          .select('blocker_id')
          .eq('blocker_id', user.id)
          .eq('blocked_id', profileData.id)
          .maybeSingle();
        setIBlockedThem(!!myBlock);

        const { data: theirBlock } = await supabase
          .from('blocks')
          .select('blocker_id')
          .eq('blocker_id', profileData.id)
          .eq('blocked_id', user.id)
          .maybeSingle();
        setTheyBlockedMe(!!theirBlock);

        const { data: subData } = await supabase
          .from('subscriptions')
          .select('id, status, price')
          .eq('subscriber_id', user.id)
          .eq('creator_id', profileData.id)
          .in('status', ['active', 'cancelling'])
          .maybeSingle();

        setIsSubscribed(!!subData && subData.status === 'active');
        setSubCancelling(subData?.status === 'cancelling');
        setSubPeriodEnd(null);
      }

      setLoading(false);
    };

    if (username) loadProfile();
  }, [username]);

  useEffect(() => {
    if (!profile?.id) return;
    const refreshCount = async () => {
      const { count } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', profile.id)
        .eq('status', 'active');
      setSubscribersCount(count || 0);
    };
    const channel = supabase
      .channel(`profile-subs-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `creator_id=eq.${profile.id}`,
        },
        () => {
          refreshCount();
        }
      )
      .subscribe();
    const poll = setInterval(refreshCount, 10000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [profile?.id]);

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
        const { data: blk } = await supabase
          .from('blocks')
          .select('blocker_id')
          .or(
            `and(blocker_id.eq.${currentUser.id},blocked_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_id.eq.${currentUser.id})`
          )
          .limit(1);
        if (blk && blk.length) {
          alert('You can’t follow this user.');
          return;
        }
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

    const { data: blk } = await supabase
      .from('blocks')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${currentUser.id},blocked_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_id.eq.${currentUser.id})`
      )
      .limit(1);
    if (blk && blk.length) {
      if (!isSubscribed) {
        alert('You can’t subscribe to this creator.');
        return;
      }
    }

    setSubLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        router.push('/login');
        return;
      }

      if (isSubscribed && !subCancelling) {
        const res = await fetch('/api/subscriptions/cancel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ creator_id: profile.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not cancel');
        setIsSubscribed(false);
        setSubCancelling(false);
        setSubscribersCount((prev) => Math.max(0, prev - 1));
        alert('Subscription cancelled.');
      } else {
        const res = await fetch('/api/subscriptions/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ creator_id: profile.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.code === 'INSUFFICIENT_BALANCE' || data.needs_card || data.code === 'NO_CARD') {
            const go = confirm(
              data.needs_card || data.code === 'NO_CARD'
                ? 'Wallet is short. Add a backup card or top up to subscribe.'
                : `Not enough balance. Need £${Number(data.needed || 0).toFixed(2)}. Open wallet?`
            );
            if (go) router.push('/wallet');
            return;
          }
          throw new Error(data.error || 'Could not subscribe');
        }
        setIsSubscribed(true);
        setSubCancelling(false);
        setSubPeriodEnd(data.period_end || null);
        if (!data.already && !data.resumed) {
          setSubscribersCount((prev) => prev + 1);
        }
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

    const { data: blk } = await supabase
      .from('blocks')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${currentUser.id},blocked_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_id.eq.${currentUser.id})`
      )
      .limit(1);
    if (blk && blk.length) {
      alert('You can’t message this user.');
      return;
    }

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

  const profileUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/${profile?.username || username}`
      : `https://www.worldofdommes.com/${username}`;

  const shareProfile = async () => {
    setShowMore(false);
    const url = `${window.location.origin}/${profile.username}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${displayName} on World of Dommes`,
          text: `Check out @${profile.username}`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        alert('Link copied');
      }
    } catch {
      /* cancelled */
    }
  };

  const copyProfileLink = async () => {
    setShowMore(false);
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/${profile.username}`
      );
      alert('Link copied');
    } catch {
      alert('Could not copy');
    }
  };

  const blockFromProfile = async () => {
    if (!currentUser || !profile) {
      router.push('/login');
      return;
    }
    setShowMore(false);
    if (iBlockedThem) {
      if (!confirm(`Unblock @${profile.username}?`)) return;
      await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', currentUser.id)
        .eq('blocked_id', profile.id);
      setIBlockedThem(false);
      return;
    }
    if (
      !confirm(
        `Block @${profile.username}? They won’t be able to message, follow, tip, or call you.`
      )
    ) {
      return;
    }
    const wasFollowing = isFollowing;
    const res = await applyUserBlock(supabase, currentUser.id, profile.id);
    if (!res.ok) {
      alert(res.error || 'Could not block');
      return;
    }
    setIBlockedThem(true);
    if (wasFollowing) {
      setIsFollowing(false);
      setFollowersCount((n) => Math.max(0, n - 1));
    }
  };

  const submitReport = async () => {
    if (!currentUser || !reportReason.trim()) return;
    setReporting(true);
    try {
      await supabase.from('support_tickets').insert({
        user_id: currentUser.id,
        email: currentUser.email || 'unknown@worldofdommes.com',
        name: myProfile?.display_name || null,
        username: myProfile?.username || null,
        account_type: null,
        topic: 'Report a user',
        message: `Report @${profile.username} (${profile.id})\nReason: ${reportReason.trim()}`,
        status: 'open',
      });
      setReportOpen(false);
      setReportReason('');
      alert('Report sent. We’ll review it.');
    } catch {
      alert('Could not send report');
    } finally {
      setReporting(false);
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

  if (theyBlockedMe && currentUser?.id !== profile.id) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
              <Ban size={26} />
            </div>
            <h1 className="text-2xl font-bold mb-2">This profile isn’t available</h1>
            <p className="text-zinc-400 mb-6">
              You can’t view this account.
            </p>
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
  const blockedPair = iBlockedThem || theyBlockedMe;
  const showSubscribe =
    profile.account_type === 'creator' &&
    profile.subscriptions_enabled &&
    !isOwnProfile &&
    !(blockedPair && !isSubscribed);
  const subPrice = Number(profile.subscription_price ?? 9.99).toFixed(2);
  const messagingAllowed = canMessage() && !blockedPair;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
        <div className="lg:hidden sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-semibold flex-1 truncate">@{profile.username}</h1>
          {!isOwnProfile && (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="text-zinc-400 hover:text-white p-1"
            >
              <MoreHorizontal size={22} />
            </button>
          )}
        </div>

        <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row gap-6 mb-6">
            <div className="flex flex-col items-center gap-3 flex-shrink-0">
              <div className="relative">
                <div
                  className={`w-28 h-28 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-5xl font-bold overflow-hidden ${
                    liveStream
                      ? 'ring-4 ring-red-500 ring-offset-2 ring-offset-zinc-950 shadow-[0_0_24px_rgba(239,68,68,0.45)]'
                      : 'ring-2 ring-zinc-800 ring-offset-2 ring-offset-zinc-950'
                  }`}
                >
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
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
                  <Link
                    href={`/live/${liveStream.id}`}
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 hover:bg-red-500 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-lg border border-red-400/40"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </Link>
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
                          ? 'Subscribed · Cancel'
                          : `Subscribe · £${subPrice}/mo`}
                      </button>
                    )}

                    <button
                      onClick={handleFollow}
                      disabled={followLoading || blockedPair}
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
                          blockedPair
                            ? 'Unavailable'
                            : (profile.message_privacy || 'everyone') === 'subscribers'
                            ? 'Subscribers only'
                            : 'Not accepting messages'
                        }
                      >
                        <MessageCircle size={16} />
                        {blockedPair
                          ? 'Unavailable'
                          : (profile.message_privacy || 'everyone') === 'subscribers'
                          ? 'Subscribers only'
                          : 'Messages off'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowMore(true)}
                      className="hidden lg:inline-flex w-10 h-10 items-center justify-center rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white transition"
                      title="More"
                    >
                      <MoreHorizontal size={20} />
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

          {liveStream && (
            <Link
              href={`/live/${liveStream.id}`}
              className="mb-8 block rounded-2xl overflow-hidden border border-red-500/50 bg-gradient-to-br from-red-950/40 via-zinc-900 to-pink-950/30 hover:border-red-400/70 transition group shadow-lg shadow-red-900/10"
            >
              <div className="relative aspect-[2.4/1] sm:aspect-[3/1] bg-zinc-900">
                {(liveStream.thumbnail_url || profile.avatar_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={liveStream.thumbnail_url || profile.avatar_url}
                    alt=""
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-pink-950/40" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <span className="absolute top-3 left-3 bg-red-600 text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE NOW
                </span>
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base font-semibold text-white truncate">
                      {liveStream.title || 'Live now'}
                    </p>
                    <p className="text-xs text-zinc-300 mt-0.5">
                      {displayName} is live
                      {liveStream.viewer_count
                        ? ` · ${liveStream.viewer_count} watching`
                        : ''}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs sm:text-sm font-semibold bg-pink-600 group-hover:bg-pink-500 text-white px-3 py-1.5 rounded-full">
                    Watch
                  </span>
                </div>
              </div>
            </Link>
          )}

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

        {showMore && !isOwnProfile && (
          <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowMore(false)}>
            <div
              className="w-full sm:max-w-sm bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <p className="font-medium">@{profile.username}</p>
                <button type="button" onClick={() => setShowMore(false)} className="text-zinc-400">
                  <X size={18} />
                </button>
              </div>
              <button type="button" onClick={shareProfile} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800 text-left text-sm">
                <Share2 size={18} className="text-pink-400" /> Share profile
              </button>
              <button type="button" onClick={copyProfileLink} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800 text-left text-sm">
                <LinkIcon size={18} className="text-zinc-400" /> Copy link
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMore(false);
                  setReportOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800 text-left text-sm"
              >
                <Flag size={18} className="text-zinc-400" /> Report
              </button>
              <button type="button" onClick={blockFromProfile} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800 text-left text-sm text-red-400">
                <Ban size={18} /> {iBlockedThem ? 'Unblock' : 'Block'}
              </button>
            </div>
          </div>
        )}

        {reportOpen && (
          <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4" onClick={() => setReportOpen(false)}>
            <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold mb-1">Report @{profile.username}</h3>
              <p className="text-xs text-zinc-500 mb-3">This goes to support. They won’t be notified.</p>
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                rows={4}
                placeholder="What’s wrong?"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-pink-500 mb-3"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setReportOpen(false)} className="flex-1 py-2 rounded-xl border border-zinc-700 text-sm">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!reportReason.trim() || reporting}
                  onClick={submitReport}
                  className="flex-1 py-2 rounded-xl bg-pink-600 text-sm font-medium disabled:opacity-50"
                >
                  {reporting ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}