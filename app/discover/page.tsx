'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Search, Heart, MessageCircle, Share2, Plus, MoreHorizontal, DollarSign } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

const POSTS_PER_PAGE = 20;

export default function DiscoverPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const loadPosts = useCallback(async (pageNumber: number, reset = false) => {
    if (pageNumber === 0) setLoading(true);
    else setLoadingMore(true);

    const from = pageNumber * POSTS_PER_PAGE;
    const to = from + POSTS_PER_PAGE - 1;

    const { data: postsData, error } = await supabase
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

    if (!error && postsData) {
      if (reset) {
        setPosts(postsData);
      } else {
        setPosts((prev) => [...prev, ...postsData]);
      }

      if (postsData.length < POSTS_PER_PAGE) {
        setHasMore(false);
      }
    }

    setLoading(false);
    setLoadingMore(false);
  }, []);

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

        // Load which posts the user has already liked
        const { data: likesData } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', user.id);

        if (likesData) {
          setLikedPosts(new Set(likesData.map((like) => like.post_id)));
        }
      }

      await loadPosts(0, true);
    };

    loadInitial();
  }, [loadPosts]);

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

  const handleLike = async (postId: string) => {
    if (!user) return;

    const isLiked = likedPosts.has(postId);

    // Optimistic UI update
    setLikedPosts((prev) => {
      const newSet = new Set(prev);
      if (isLiked) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
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
        // Unlike
        await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);
      } else {
        // Like
        await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: user.id });
      }

      // Get the real current count from the likes table
      const { count } = await supabase
        .from('post_likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId);

      // Update the posts table with the real count
      await supabase
        .from('posts')
        .update({ likes_count: count || 0 })
        .eq('id', postId);

    } catch (err) {
      console.error('Like error:', err);
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

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />

        <main className="flex-1 overflow-y-auto relative">
          <div className="max-w-3xl mx-auto px-4 py-6">

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Search className="text-pink-500" size={28} />
                Discover
              </h1>
            </div>

            {/* Feed */}
            <div className="space-y-5 pb-24">
              {loading ? (
                <div className="text-center py-20 text-zinc-400">
                  Loading posts...
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-zinc-400 text-lg">No posts yet</p>
                  <p className="text-zinc-500 mt-2 text-sm">Be the first to post something!</p>
                </div>
              ) : (
                <>
                  {posts.map((post) => {
                    const isLiked = likedPosts.has(post.id);

                    return (
                      <div
                        key={post.id}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
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
                          <button className="text-zinc-400 hover:text-white p-1">
                            <MoreHorizontal size={18} />
                          </button>
                        </div>

                        {/* Caption */}
                        {post.content && (
                          <div className="px-4 pb-3">
                            <p className="text-sm leading-relaxed text-zinc-100">{post.content}</p>
                          </div>
                        )}

                        {/* Media */}
                        {post.media_type === 'photo' && post.media_url && (
                          <div className="bg-zinc-800 border-y border-zinc-800 max-h-[420px] overflow-hidden">
                            <img
                              src={post.media_url}
                              alt="Post"
                              className="w-full max-h-[420px] object-cover"
                            />
                          </div>
                        )}

                        {post.media_type === 'video' && post.media_url && (
                          <div className="bg-zinc-800 border-y border-zinc-800 max-h-[420px] overflow-hidden relative">
                            <video
                              src={post.media_url}
                              controls
                              className="w-full max-h-[420px]"
                            />
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
                              className={`group-hover:scale-110 transition ${isLiked ? 'fill-pink-500' : ''}`}
                            />
                            <span className="text-sm">{post.likes_count || 0}</span>
                          </button>

                          <button className="flex items-center gap-1.5 text-zinc-400 hover:text-pink-400 transition group">
                            <MessageCircle size={22} className="group-hover:scale-110 transition" />
                            <span className="text-sm">{post.comments_count || 0}</span>
                          </button>

                          <button className="flex items-center gap-1.5 text-zinc-400 hover:text-pink-400 transition group">
                            <DollarSign size={20} className="group-hover:scale-110 transition" />
                            <span className="text-sm">Tip</span>
                          </button>

                          <button className="text-zinc-400 hover:text-pink-400 transition group ml-auto">
                            <Share2 size={20} className="group-hover:scale-110 transition" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Load more trigger */}
                  <div ref={loadMoreRef} className="py-6 text-center">
                    {loadingMore && (
                      <p className="text-zinc-400 text-sm">Loading more posts...</p>
                    )}
                    {!hasMore && posts.length > 0 && (
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
        </main>
      </div>
    </AuthGuard>
  );
}