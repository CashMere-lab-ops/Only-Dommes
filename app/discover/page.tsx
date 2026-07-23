'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Search, Heart, MessageCircle, Share2, Plus, MoreHorizontal,
  DollarSign, Send, X, Trash2, Flag, Link as LinkIcon, EyeOff, Ban,
  RefreshCw
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

const POSTS_PER_PAGE = 20;
const TIP_AMOUNTS = [5, 10, 20, 50];
const REPORT_REASONS = [
  'Spam or scam',
  'Inappropriate content',
  'Harassment or bullying',
  'Copyright violation',
  'Other',
];

export default function DiscoverPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Tabs & Search
  const [activeTab, setActiveTab] = useState<'foryou' | 'following'>('foryou');
  const [searchQuery, setSearchQuery] = useState('');

  // Comments
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [postingComment, setPostingComment] = useState<string | null>(null);

  // Tip
  const [tipPost, setTipPost] = useState<any>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(10);
  const [customAmount, setCustomAmount] = useState('');
  const [tipMessage, setTipMessage] = useState('');
  const [sendingTip, setSendingTip] = useState(false);
  const [tipSuccess, setTipSuccess] = useState(false);

  // Post menu
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [hiddenPosts, setHiddenPosts] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Report modal
  const [reportPostId, setReportPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);

  // Double-tap like
  const lastTap = useRef<Record<string, number>>({});
  const [likedAnimation, setLikedAnimation] = useState<string | null>(null);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadPosts = useCallback(async (pageNumber: number, reset = false, tab = activeTab) => {
    if (pageNumber === 0) setLoading(true);
    else setLoadingMore(true);

    const from = pageNumber * POSTS_PER_PAGE;
    const to = from + POSTS_PER_PAGE - 1;

    let query = supabase
      .from('posts')
      .select(`
        *,
        profiles:creator_id (
          username,
          display_name,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false })
      .range(from, to);

    // Following tab filter
    if (tab === 'following' && followingIds.size > 0) {
      query = query.in('creator_id', Array.from(followingIds));
    } else if (tab === 'following' && followingIds.size === 0) {
      setPosts([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      return;
    }

    const { data: postsData, error } = await query;

    if (!error && postsData) {
      if (reset) setPosts(postsData);
      else setPosts((prev) => [...prev, ...postsData]);

      if (postsData.length < POSTS_PER_PAGE) setHasMore(false);
      else setHasMore(true);
    }

    setLoading(false);
    setLoadingMore(false);
    setRefreshing(false);
  }, [activeTab, followingIds]);

  useEffect(() => {
    const loadInitial = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setProfile(profileData);

        // Load likes
        const { data: likesData } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id);
        if (likesData) {
          setLikedPosts(new Set(likesData.map((like) => like.post_id)));
        }

        // Load following
        const { data: followsData } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);
        if (followsData) {
          setFollowingIds(new Set(followsData.map((f) => f.following_id)));
        }
      }

      await loadPosts(0, true);
    };

    loadInitial();
  }, []);

  // Reload when tab changes
  useEffect(() => {
    setPage(0);
    setHasMore(true);
    loadPosts(0, true, activeTab);
  }, [activeTab]);

  // Infinite scroll
  useEffect(() => {
    if (loading) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadPosts(nextPage);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [loading, hasMore, loadingMore, page, loadPosts]);

  // Pull to refresh (simple version)
  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(0);
    setHasMore(true);
    await loadPosts(0, true, activeTab);
  };

  const handleLike = async (postId: string) => {
    if (!user) return;
    const isLiked = likedPosts.has(postId);

    // Animation
    if (!isLiked) {
      setLikedAnimation(postId);
      setTimeout(() => setLikedAnimation(null), 600);
    }

    setLikedPosts((prev) => {
      const newSet = new Set(prev);
      if (isLiked) newSet.delete(postId);
      else newSet.add(postId);
      return newSet;
    });

    setPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          return {
            ...post,
            likes_count: isLiked
              ? Math.max(0, (post.likes_count || 0) - 1)
              : (post.likes_count || 0) + 1,
          };
        }
        return post;
      })
    );

    try {
      if (isLiked) {
        await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
      } else {
        await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
      }

      const { count } = await supabase
        .from('post_likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      await supabase.from('posts').update({ likes_count: count || 0 }).eq('id', postId);
    } catch (err) {
      console.error('Like error:', err);
    }
  };

  // Double-tap to like
  const handleDoubleTap = (postId: string) => {
    const now = Date.now();
    const last = lastTap.current[postId] || 0;

    if (now - last < 300) {
      // Double tap detected
      if (!likedPosts.has(postId)) {
        handleLike(postId);
      } else {
        // Already liked – still show animation
        setLikedAnimation(postId);
        setTimeout(() => setLikedAnimation(null), 600);
      }
    }
    lastTap.current[postId] = now;
  };

  const toggleComments = async (postId: string) => {
    if (openComments === postId) {
      setOpenComments(null);
      return;
    }

    setOpenComments(postId);

    if (!comments[postId]) {
      const { data } = await supabase
        .from('post_comments')
        .select(`
          *,
          profiles:user_id (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      setComments((prev) => ({ ...prev, [postId]: data || [] }));
    }
  };

  const handleAddComment = async (postId: string) => {
    if (!user || !newComment[postId]?.trim()) return;
    setPostingComment(postId);

    try {
      const { data, error } = await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content: newComment[postId].trim(),
        })
        .select(`
          *,
          profiles:user_id (
            username,
            display_name,
            avatar_url
          )
        `)
        .single();

      if (error) throw error;

      setComments((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), data],
      }));

      setPosts((prev) =>
        prev.map((post) => {
          if (post.id === postId) {
            return { ...post, comments_count: (post.comments_count || 0) + 1 };
          }
          return post;
        })
      );

      const { count } = await supabase
        .from('post_comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      await supabase.from('posts').update({ comments_count: count || 0 }).eq('id', postId);
      setNewComment((prev) => ({ ...prev, [postId]: '' }));
    } catch (err) {
      console.error('Comment error:', err);
    } finally {
      setPostingComment(null);
    }
  };

  // ===== POST MENU ACTIONS =====
  const handleDeletePost = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;

      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setOpenMenu(null);
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete post');
    }
  };

  const handleCopyLink = (postId: string) => {
    const url = `${window.location.origin}/discover?post=${postId}`;
    navigator.clipboard.writeText(url);
    setOpenMenu(null);
    alert('Link copied to clipboard');
  };

  const handleHidePost = (postId: string) => {
    setHiddenPosts((prev) => new Set(prev).add(postId));
    setOpenMenu(null);
  };

  const handleReportPost = (postId: string) => {
    setOpenMenu(null);
    setReportPostId(postId);
    setReportReason('');
  };

  const submitReport = async () => {
    if (!reportReason) return;
    setReporting(true);

    // For now just show success (we can save reports to DB later)
    setTimeout(() => {
      setReporting(false);
      setReportPostId(null);
      alert('Thank you. The post has been reported.');
    }, 800);
  };

  const handleBlockUser = (username: string) => {
    if (!confirm(`Block @${username}? You will no longer see their posts.`)) return;
    setOpenMenu(null);
    alert(`@${username} has been blocked. (Full block system coming soon)`);
  };

  const handleShare = (post: any) => {
    const url = `${window.location.origin}/discover?post=${post.id}`;

    if (navigator.share) {
      navigator.share({
        title: `Post by ${post.profiles?.display_name || 'Creator'}`,
        text: post.content || 'Check out this post on Only Dommes',
        url: url,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      alert('Link copied to clipboard');
    }
  };

  // Tip functions
  const openTipModal = (post: any) => {
    setTipPost(post);
    setSelectedAmount(10);
    setCustomAmount('');
    setTipMessage('');
    setTipSuccess(false);
  };

  const closeTipModal = () => {
    setTipPost(null);
    setTipSuccess(false);
  };

  const handleSendTip = async () => {
    if (!user || !tipPost) return;
    const amount = customAmount ? parseFloat(customAmount) : selectedAmount;
    if (!amount || amount <= 0) return;

    setSendingTip(true);
    try {
      const { error } = await supabase.from('tips').insert({
        post_id: tipPost.id,
        from_user_id: user.id,
        to_user_id: tipPost.creator_id,
        amount,
        message: tipMessage.trim() || null,
      });

      if (error) throw error;
      setTipSuccess(true);
      setTimeout(() => closeTipModal(), 1800);
    } catch (err) {
      console.error('Tip error:', err);
      alert('Failed to send tip');
    } finally {
      setSendingTip(false);
    }
  };

  const isCreator = profile?.account_type === 'creator';

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  // Filter posts by search
  const filteredPosts = posts.filter((post) => {
    if (hiddenPosts.has(post.id)) return false;
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    const name = (post.profiles?.display_name || '').toLowerCase();
    const username = (post.profiles?.username || '').toLowerCase();
    const content = (post.content || '').toLowerCase();

    return name.includes(q) || username.includes(q) || content.includes(q);
  });

  // Skeleton card
  const SkeletonCard = () => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-pulse">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-10 h-10 rounded-full bg-zinc-800" />
        <div className="flex-1">
          <div className="h-3 w-28 bg-zinc-800 rounded mb-2" />
          <div className="h-2.5 w-20 bg-zinc-800 rounded" />
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="h-3 w-full bg-zinc-800 rounded mb-2" />
        <div className="h-3 w-2/3 bg-zinc-800 rounded" />
      </div>
      <div className="aspect-square bg-zinc-800" />
      <div className="px-4 py-3 flex gap-5">
        <div className="h-5 w-12 bg-zinc-800 rounded" />
        <div className="h-5 w-12 bg-zinc-800 rounded" />
        <div className="h-5 w-12 bg-zinc-800 rounded" />
      </div>
    </div>
  );

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />

        <main ref={mainRef} className="flex-1 overflow-y-auto relative">
          <div className="max-w-3xl mx-auto px-4 py-6">

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Search className="text-pink-500" size={28} />
                Discover
              </h1>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
              >
                <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative mb-5">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search creators or posts..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-full py-2.5 pl-11 pr-4 text-sm outline-none focus:border-pink-500 transition"
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setActiveTab('foryou')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
                  activeTab === 'foryou'
                    ? 'bg-pink-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                For You
              </button>
              <button
                onClick={() => setActiveTab('following')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
                  activeTab === 'following'
                    ? 'bg-pink-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                Following
              </button>
            </div>

            {/* Feed */}
            <div className="space-y-5 pb-24">
              {loading ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-zinc-400 text-lg">
                    {activeTab === 'following'
                      ? 'No posts from people you follow'
                      : searchQuery
                      ? 'No posts found'
                      : 'No posts yet'}
                  </p>
                  <p className="text-zinc-500 mt-2 text-sm">
                    {activeTab === 'following'
                      ? 'Follow some creators to see their posts here'
                      : 'Be the first to post something!'}
                  </p>
                </div>
              ) : (
                <>
                  {filteredPosts.map((post) => {
                    const isLiked = likedPosts.has(post.id);
                    const isCommentsOpen = openComments === post.id;
                    const postComments = comments[post.id] || [];
                    const isOwnPost = user?.id === post.creator_id;
                    const isMenuOpen = openMenu === post.id;
                    const showHeartAnim = likedAnimation === post.id;

                    return (
                      <div
                        key={post.id}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative"
                      >
                        {/* Post Header */}
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/${post.profiles?.username}`}
                              className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden flex-shrink-0"
                            >
                              {post.profiles?.avatar_url ? (
                                <img src={post.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                (post.profiles?.display_name || 'U').charAt(0)
                              )}
                            </Link>
                            <div>
                              <Link
                                href={`/${post.profiles?.username}`}
                                className="font-semibold text-sm leading-tight hover:text-pink-400 transition"
                              >
                                {post.profiles?.display_name || 'Unknown'}
                              </Link>
                              <p className="text-xs text-zinc-400">
                                <Link
                                  href={`/${post.profiles?.username}`}
                                  className="hover:text-pink-400 transition"
                                >
                                  @{post.profiles?.username}
                                </Link>
                                {' · '}{formatTime(post.created_at)}
                              </p>
                            </div>
                          </div>

                          {/* 3 Dots Menu */}
                          <div className="relative" ref={isMenuOpen ? menuRef : null}>
                            <button
                              onClick={() => setOpenMenu(isMenuOpen ? null : post.id)}
                              className="text-zinc-400 hover:text-white p-1.5 rounded-full hover:bg-zinc-800 transition"
                            >
                              <MoreHorizontal size={18} />
                            </button>

                            {isMenuOpen && (
                              <div className="absolute right-0 top-9 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden">
                                {isOwnPost ? (
                                  <>
                                    <button
                                      onClick={() => handleCopyLink(post.id)}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 transition"
                                    >
                                      <LinkIcon size={16} />
                                      Copy link
                                    </button>
                                    <button
                                      onClick={() => handleDeletePost(post.id)}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-zinc-800 transition border-t border-zinc-800"
                                    >
                                      <Trash2 size={16} />
                                      Delete post
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleReportPost(post.id)}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 transition"
                                    >
                                      <Flag size={16} />
                                      Report
                                    </button>
                                    <button
                                      onClick={() => handleCopyLink(post.id)}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 transition"
                                    >
                                      <LinkIcon size={16} />
                                      Copy link
                                    </button>
                                    <button
                                      onClick={() => handleHidePost(post.id)}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 transition"
                                    >
                                      <EyeOff size={16} />
                                      Hide post
                                    </button>
                                    <button
                                      onClick={() => handleBlockUser(post.profiles?.username)}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-zinc-800 transition border-t border-zinc-800"
                                    >
                                      <Ban size={16} />
                                      Block @{post.profiles?.username}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Caption */}
                        {post.content && (
                          <div className="px-4 pb-3">
                            <p className="text-sm leading-relaxed text-zinc-100">{post.content}</p>
                          </div>
                        )}

                        {/* Media with double-tap */}
                        {post.media_type === 'photo' && post.media_url && (
                          <div
                            className="bg-zinc-800 border-y border-zinc-800 max-h-[420px] overflow-hidden relative cursor-pointer"
                            onClick={() => handleDoubleTap(post.id)}
                          >
                            <img
                              src={post.media_url}
                              alt="Post"
                              className="w-full max-h-[420px] object-cover"
                            />
                            {showHeartAnim && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <Heart
                                  size={80}
                                  className="text-pink-500 fill-pink-500 animate-ping"
                                  style={{ animationDuration: '0.6s' }}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {post.media_type === 'video' && post.media_url && (
                          <div
                            className="bg-zinc-800 border-y border-zinc-800 max-h-[420px] overflow-hidden relative"
                            onClick={() => handleDoubleTap(post.id)}
                          >
                            <video
                              src={post.media_url}
                              controls
                              className="w-full max-h-[420px]"
                            />
                            {showHeartAnim && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <Heart
                                  size={80}
                                  className="text-pink-500 fill-pink-500 animate-ping"
                                  style={{ animationDuration: '0.6s' }}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="px-4 py-3 flex items-center gap-5">
                          <button
                            onClick={() => handleLike(post.id)}
                            className={`flex items-center gap-1.5 transition group ${
                              isLiked ? 'text-pink-500' : 'text-zinc-400 hover:text-pink-400'
                            }`}
                          >
                            <Heart
                              size={22}
                              className={`group-hover:scale-110 transition-transform ${
                                isLiked ? 'fill-pink-500 scale-110' : ''
                              }`}
                            />
                            <span className="text-sm">{post.likes_count || 0}</span>
                          </button>

                          <button
                            onClick={() => toggleComments(post.id)}
                            className={`flex items-center gap-1.5 transition group ${
                              isCommentsOpen ? 'text-pink-400' : 'text-zinc-400 hover:text-pink-400'
                            }`}
                          >
                            <MessageCircle size={22} className="group-hover:scale-110 transition" />
                            <span className="text-sm">{post.comments_count || 0}</span>
                          </button>

                          <button
                            onClick={() => openTipModal(post)}
                            className="flex items-center gap-1.5 text-zinc-400 hover:text-pink-400 transition group"
                          >
                            <DollarSign size={20} className="group-hover:scale-110 transition" />
                            <span className="text-sm">Tip</span>
                          </button>

                          <button
                            onClick={() => handleShare(post)}
                            className="text-zinc-400 hover:text-pink-400 transition group ml-auto"
                          >
                            <Share2 size={20} className="group-hover:scale-110 transition" />
                          </button>
                        </div>

                        {/* Comments */}
                        {isCommentsOpen && (
                          <div className="border-t border-zinc-800 px-4 py-3">
                            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                              {postComments.length === 0 ? (
                                <p className="text-sm text-zinc-500 text-center py-2">No comments yet</p>
                              ) : (
                                postComments.map((comment) => (
                                  <div key={comment.id} className="flex gap-2.5">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden">
                                      {comment.profiles?.avatar_url ? (
                                        <img src={comment.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        (comment.profiles?.display_name || 'U').charAt(0)
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm">
                                        <span className="font-semibold text-pink-400">
                                          {comment.profiles?.display_name || 'User'}
                                        </span>{' '}
                                        <span className="text-zinc-300">{comment.content}</span>
                                      </p>
                                      <p className="text-xs text-zinc-500 mt-0.5">
                                        {formatTime(comment.created_at)}
                                      </p>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={newComment[post.id] || ''}
                                onChange={(e) =>
                                  setNewComment((prev) => ({
                                    ...prev,
                                    [post.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddComment(post.id);
                                }}
                                placeholder="Add a comment..."
                                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2 text-sm outline-none focus:border-pink-500"
                              />
                              <button
                                onClick={() => handleAddComment(post.id)}
                                disabled={postingComment === post.id || !newComment[post.id]?.trim()}
                                className="w-9 h-9 rounded-full bg-pink-600 hover:bg-pink-700 flex items-center justify-center transition disabled:opacity-40"
                              >
                                <Send size={16} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div ref={loadMoreRef} className="py-6 text-center">
                    {loadingMore && <p className="text-zinc-400 text-sm">Loading more posts...</p>}
                    {!hasMore && filteredPosts.length > 0 && (
                      <p className="text-zinc-500 text-sm">No more posts</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Floating Create Post Button */}
          {isCreator && (
            <Link
              href="/discover/create"
              className="fixed bottom-24 right-6 lg:bottom-8 lg:right-8 z-40 w-14 h-14 rounded-full bg-gradient-to-r from-pink-600 to-rose-500 flex items-center justify-center shadow-lg transition opacity-80 hover:opacity-100"
            >
              <Plus size={28} className="text-white" />
            </Link>
          )}

          {/* Tip Modal */}
          {tipPost && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                  <h2 className="font-semibold text-lg">Send a Tip</h2>
                  <button onClick={closeTipModal} className="text-zinc-400 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                {tipSuccess ? (
                  <div className="px-5 py-10 text-center">
                    <div className="w-16 h-16 rounded-full bg-pink-500/20 flex items-center justify-center mx-auto mb-4">
                      <DollarSign size={32} className="text-pink-400" />
                    </div>
                    <p className="text-xl font-semibold mb-1">Tip Sent!</p>
                    <p className="text-zinc-400 text-sm">
                      You tipped {tipPost.profiles?.display_name}
                    </p>
                  </div>
                ) : (
                  <div className="px-5 py-5">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden">
                        {tipPost.profiles?.avatar_url ? (
                          <img src={tipPost.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (tipPost.profiles?.display_name || 'U').charAt(0)
                        )}
                      </div>
                      <div>
                        <p className="font-semibold">{tipPost.profiles?.display_name}</p>
                        <p className="text-sm text-zinc-400">@{tipPost.profiles?.username}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {TIP_AMOUNTS.map((amount) => (
                        <button
                          key={amount}
                          onClick={() => {
                            setSelectedAmount(amount);
                            setCustomAmount('');
                          }}
                          className={`py-2.5 rounded-xl text-sm font-medium transition ${
                            selectedAmount === amount && !customAmount
                              ? 'bg-pink-600 text-white'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          £{amount}
                        </button>
                      ))}
                    </div>

                    <div className="mb-4">
                      <label className="text-xs text-zinc-400 mb-1.5 block">Custom amount</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">£</span>
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          value={customAmount}
                          onChange={(e) => {
                            setCustomAmount(e.target.value);
                            setSelectedAmount(null);
                          }}
                          placeholder="0.00"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 pl-8 pr-4 outline-none focus:border-pink-500"
                        />
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="text-xs text-zinc-400 mb-1.5 block">Message (optional)</label>
                      <input
                        type="text"
                        value={tipMessage}
                        onChange={(e) => setTipMessage(e.target.value)}
                        placeholder="Say something nice..."
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl py-2.5 px-4 outline-none focus:border-pink-500 text-sm"
                      />
                    </div>

                    <button
                      onClick={handleSendTip}
                      disabled={sendingTip || (!selectedAmount && !customAmount)}
                      className="w-full bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
                    >
                      {sendingTip
                        ? 'Sending...'
                        : `Send £${customAmount || selectedAmount || 0} Tip`}
                    </button>

                    <p className="text-xs text-zinc-500 text-center mt-3">
                      Real payments will be connected with Stripe later
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Report Modal */}
          {reportPostId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                  <h2 className="font-semibold text-lg">Report Post</h2>
                  <button
                    onClick={() => setReportPostId(null)}
                    className="text-zinc-400 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="px-5 py-5">
                  <p className="text-sm text-zinc-400 mb-4">
                    Why are you reporting this post?
                  </p>

                  <div className="space-y-2 mb-6">
                    {REPORT_REASONS.map((reason) => (
                      <button
                        key={reason}
                        onClick={() => setReportReason(reason)}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm transition ${
                          reportReason === reason
                            ? 'bg-pink-600/20 border border-pink-500 text-pink-400'
                            : 'bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-600'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={submitReport}
                    disabled={!reportReason || reporting}
                    className="w-full bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
                  >
                    {reporting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}