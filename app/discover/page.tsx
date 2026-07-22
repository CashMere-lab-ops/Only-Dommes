'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Heart, MessageCircle, Share2, Plus, MoreHorizontal } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

export default function DiscoverPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Temporary demo posts
  const demoPosts = [
    {
      id: 1,
      type: 'photo',
      creator: {
        username: 'scarletbloom',
        display_name: 'Scarlet Bloom',
        avatar_url: null,
      },
      content: 'New set dropping this weekend 🔥 Who’s ready?',
      media_url: null,
      likes: 128,
      comments: 14,
      created_at: '2h ago',
    },
    {
      id: 2,
      type: 'text',
      creator: {
        username: 'mistressivy',
        display_name: 'Mistress Ivy',
        avatar_url: null,
      },
      content: 'Remember: obedience is a privilege, not a right. Who’s earning theirs tonight?',
      media_url: null,
      likes: 89,
      comments: 23,
      created_at: '4h ago',
    },
    {
      id: 3,
      type: 'video',
      creator: {
        username: 'cashmere',
        display_name: 'CashMere',
        avatar_url: null,
      },
      content: 'Quick 12 second teaser 👀 Full version on my page',
      media_url: null,
      likes: 210,
      comments: 31,
      created_at: '6h ago',
    },
  ];

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setProfile(data);
      }
      setLoading(false);
    };

    loadProfile();
  }, []);

  const isCreator = profile?.account_type === 'creator';

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
            <div className="space-y-6 pb-24">
              {demoPosts.map((post) => (
                <div
                  key={post.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
                >
                  {/* Post Header */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden">
                        {post.creator.avatar_url ? (
                          <img src={post.creator.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          post.creator.display_name.charAt(0)
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{post.creator.display_name}</p>
                        <p className="text-xs text-zinc-400">@{post.creator.username} · {post.created_at}</p>
                      </div>
                    </div>
                    <button className="text-zinc-400 hover:text-white">
                      <MoreHorizontal size={20} />
                    </button>
                  </div>

                  {/* Post Content */}
                  {post.content && (
                    <div className="px-4 pb-3">
                      <p className="text-sm leading-relaxed">{post.content}</p>
                    </div>
                  )}

                  {/* Media Placeholder */}
                  {post.type === 'photo' && (
                    <div className="aspect-square bg-zinc-800 flex items-center justify-center">
                      <p className="text-zinc-500 text-sm">Photo Post</p>
                    </div>
                  )}

                  {post.type === 'video' && (
                    <div className="aspect-video bg-zinc-800 flex items-center justify-center relative">
                      <p className="text-zinc-500 text-sm">Video Post (max 15s)</p>
                      <div className="absolute bottom-3 right-3 bg-black/70 text-xs px-2 py-1 rounded">
                        0:12
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-5">
                      <button className="flex items-center gap-1.5 text-zinc-400 hover:text-pink-400 transition">
                        <Heart size={20} />
                        <span className="text-sm">{post.likes}</span>
                      </button>
                      <button className="flex items-center gap-1.5 text-zinc-400 hover:text-pink-400 transition">
                        <MessageCircle size={20} />
                        <span className="text-sm">{post.comments}</span>
                      </button>
                      <button className="text-zinc-400 hover:text-pink-400 transition">
                        <Share2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Floating Create Post Button (Creators only) - 80% opacity */}
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