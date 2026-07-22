'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Heart, MessageCircle, Share2, Plus, MoreHorizontal, Play, DollarSign } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

export default function DiscoverPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setProfile(profileData);
      }

      // Load real posts with creator info
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
        .order('created_at', { ascending: false });

      if (!error && postsData) {
        setPosts(postsData);
      }

      setLoading(false);
    };

    loadData();
  }, []);

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
                posts.map((post) => (
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
                      <button className="flex items-center gap-1.5 text-zinc-400 hover:text-pink-400 transition group">
                        <Heart size={22} className="group-hover:scale-110 transition" />
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
                ))
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