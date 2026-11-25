'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, Heart, DollarSign, TrendingUp, MessageCircle, Package, ShoppingBag, Film, Lock, Play, Radio,
  MoreHorizontal, Share2, Ban, Flag, Link as LinkIcon, X
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import SiteFooter from '../../components/SiteFooter';
import { ProfileStoryRing, HighlightRail } from '../../components/StoriesRail';
import FeedPosts from '../../components/FeedPosts';
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
  const [followingCount, setFollowingCount] = useState(0);
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
  const [peopleOpen, setPeopleOpen] = useState<null | 'followers' | 'following'>(null);
  const [people, setPeople] = useState<any[]>([]);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [subSheet, setSubSheet] = useState(false);
  const [offlineSheet, setOfflineSheet] = useState(false);
  const [tab, setTab] = useState<'posts' | 'clips' | 'shop'>('posts');

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
        .from('public_profiles')
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

      const { count: following } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profileData.id);
      setFollowingCount(following || 0);

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
          .in('status', ['active', 'ending'])
          .maybeSingle();

        setIsSubscribed(!!subData);
        setSubCancelling(subData?.status === 'ending');
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

  useEffect(() => {
    if (!profile || loading || typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('subscribe') === '1') setSubSheet(true);
    if (q.get('offline') === '1') setOfflineSheet(true);
  }, [profile, loading]);

  const actorName = () =>
    myProfile?.display_name || myProfile?.username || 'Someone';

  const openPeople = async (kind: 'followers' | 'following') => {
    if (!profile) return;
    setPeopleOpen(kind);
    setPeopleQuery('');
    setPeopleLoading(true);
    setPeople([]);

    const col = kind === 'followers' ? 'follower_id' : 'following_id';
    const other = kind === 'followers' ? 'following_id' : 'follower_id';

    const { data: rows } = await supabase
      .from('follows')
      .select(col)
      .eq(other, profile.id)
      .limit(200);

    const ids = (rows || []).map((r: any) => r[col]).filter(Boolean);
    if (ids.length === 0) {
      setPeople([]);
      setPeopleLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, account_type')
      .in('id', ids);

    setPeople(profiles || []);
    setPeopleLoading(false);
  };

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
            if (go) router.push('/wallet?card=1');
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
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
              <button
                onClick={() => router.back()}
                className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center"
                aria-label="Back"
              >
                <ArrowLeft size={18} />
              </button>
              {!isOwnProfile && (
                <button
                  type="button"
                  onClick={() => setShowMore(true)}
                  className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center"
                  aria-label="More"
                >
                  <MoreHorizontal size={18} />
                </button>
              )}
            </div>
          </div>

          <div className="px-4 lg:px-8 -mt-12">
            <div className="flex items-end justify-between gap-3">
              <div className="relative">
                <ProfileStoryRing
                  profileId={profile.id}
                  userId={currentUser?.id || null}
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
                      <img
                        src={profile.avatar_url}
                        alt={displayName}
                        className="w-full h-full object-cover"
                      />
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
              <div className="flex items-center gap-2 pb-1">
                {isOwnProfile ? (
                  <Link
                    href="/settings"
                    className="px-4 py-2 rounded-full bg-zinc-900 border border-zinc-700 text-sm font-medium"
                  >
                    Edit profile
                  </Link>
                ) : (
                  <>
                    <button
                      onClick={handleFollow}
                      disabled={followLoading || blockedPair}
                      className={`px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50 transition ${
                        isFollowing
                          ? 'bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:border-pink-500/40 hover:text-pink-400'
                          : 'bg-white text-black hover:bg-pink-500 hover:text-white'
                      }`}
                    >
                      {followLoading ? '...' : isFollowing ? 'Following' : 'Follow'}
                    </button>
                    {messagingAllowed ? (
                      <button
                        onClick={handleMessage}
                        className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center"
                        aria-label="Message"
                      >
                        <MessageCircle size={16} />
                      </button>
                    ) : null}
                  </>
                )}
              </div>
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
                <p className="text-sm text-pink-400">@{profile.username}</p>
              )}
            </div>

            <div className="flex gap-5 mt-4 text-sm">
              <span><b>{posts.length}</b> <span className="text-zinc-400">posts</span></span>
              <button
                type="button"
                onClick={() => openPeople('following')}
                className="group cursor-pointer"
              >
                <b className="group-hover:text-pink-400">{followingCount}</b> <span className="text-zinc-400 group-hover:text-pink-400">following</span>
              </button>
              <button
                type="button"
                onClick={() => openPeople('followers')}
                className="group cursor-pointer"
              >
                <b className="group-hover:text-pink-400">{followersCount}</b> <span className="text-zinc-400 group-hover:text-pink-400">followers</span>
              </button>
            </div>

            {profile.bio && (
              <p className="mt-3 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                {profile.bio}
              </p>
            )}

            {joinedDate && (
              <p className="mt-3 text-xs text-zinc-500">Joined {joinedDate}</p>
            )}

            {showSubscribe && (
              isSubscribed ? (
                <Link
                  href="/subscriptions"
                  className="mt-5 inline-flex items-center justify-center px-6 py-2 rounded-full text-sm font-medium border border-pink-500/30 bg-pink-500/5 text-pink-300 hover:bg-pink-500/10 transition"
                >
                  Subscribed
                </Link>
              ) : (
                <button
                  onClick={handleSubscribe}
                  disabled={subLoading}
                  className="mt-5 inline-flex items-center justify-center px-6 py-2 rounded-full text-sm font-medium disabled:opacity-50 bg-pink-600 hover:bg-pink-500 text-white transition shadow-md shadow-pink-950/30"
                >
                  {subLoading ? '...' : `Subscribe · £${subPrice}/mo`}
                </button>
              )
            )}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6">

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

          {profile.account_type === 'creator' && (
            <HighlightRail
              profileId={profile.id}
              userId={currentUser?.id || null}
              name={displayName}
              username={profile.username}
              avatarUrl={profile.avatar_url}
              isOwner={isOwnProfile}
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
              <FeedPosts
                posts={posts}
                setPosts={setPosts}
                userId={currentUser?.id || null}
                profile={myProfile || profile}
                hideHeader
              />
            )}
          </div>
          )}

          {profile?.account_type === 'creator' && tab === 'clips' && (
            <div>
              {clips.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                  <p className="text-zinc-400">No clips yet</p>
                </div>
              ) : (
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
              )}
            </div>
          )}

          {profile?.account_type === 'creator' && tab === 'shop' && (
            <div>
              {shopItems.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                  <p className="text-zinc-400">No shop items yet</p>
                </div>
              ) : (
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
              )}
            </div>
          )}
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
              <div
                className="relative w-full lg:w-[440px] bg-zinc-950 border border-zinc-800 rounded-t-3xl lg:rounded-3xl h-[78vh] flex flex-col sheet-up"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                  <h3 className="text-lg font-semibold capitalize">{peopleOpen}</h3>
                  <button type="button" onClick={() => setPeopleOpen(null)} className="text-zinc-400 hover:text-white">
                    <X size={22} />
                  </button>
                </div>
                <div className="px-4 py-3">
                  <input
                    type="text"
                    value={peopleQuery}
                    onChange={(e) => setPeopleQuery(e.target.value)}
                    placeholder="Search"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-pink-500"
                  />
                </div>
                <div className="flex-1 overflow-y-auto px-2">
                  {peopleLoading ? (
                    <p className="text-center text-zinc-500 py-10 text-sm">Loading…</p>
                  ) : shown.length === 0 ? (
                    <p className="text-center text-zinc-500 py-10 text-sm">No results</p>
                  ) : (
                    shown.map((p) => (
                      <Link
                        key={p.id}
                        href={`/${p.username}`}
                        onClick={() => setPeopleOpen(null)}
                        className="group flex items-center gap-3 px-3 py-3 border-b border-zinc-800/70 hover:bg-zinc-900"
                      >
                        <div className="w-11 h-11 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0 flex items-center justify-center text-sm font-semibold">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (p.display_name || p.username || 'U')[0]
                          )}
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

        {subSheet && (
          <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setSubSheet(false)}>
            <div className="w-full max-w-sm bg-zinc-950 border border-[#d4b483]/40 rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#d4b483]">Subscribe</p>
              <h3 className="mt-2 text-xl font-semibold">{displayName}</h3>
              <p className="mt-2 text-sm text-zinc-400">
                £{subPrice} a month. Fans pay the listed price. You can cancel any time.
              </p>
              <button
                type="button"
                onClick={() => void handleSubscribe()}
                disabled={subLoading || !showSubscribe}
                className="mt-5 w-full h-11 rounded-full bg-[#ff2d87] text-sm font-semibold disabled:opacity-50"
              >
                {subLoading
                  ? 'Please wait'
                  : isSubscribed
                    ? 'Subscribed'
                    : `Subscribe · £${subPrice}/mo`}
              </button>
              <button type="button" onClick={() => setSubSheet(false)} className="mt-2 w-full h-11 rounded-full text-sm text-zinc-400">
                Not now
              </button>
            </div>
          </div>
        )}

        {offlineSheet && (
          <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setOfflineSheet(false)}>
            <div className="w-full max-w-sm bg-zinc-950 border border-white/10 rounded-3xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#d4b483]">Live</p>
              <h3 className="mt-2 text-xl font-semibold">This creator is not live</h3>
              <p className="mt-2 text-sm text-zinc-400">
                {displayName} has ended this stream. Check back when they go live again.
              </p>
              <button type="button" onClick={() => setOfflineSheet(false)} className="mt-5 w-full h-11 rounded-full bg-white text-black text-sm font-semibold">
                Close
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
                <SiteFooter />
        </main>
    </div>
  );
}