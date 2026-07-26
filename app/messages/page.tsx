'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageCircle, ArrowLeft } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

export default function MessagesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const loadConversations = useCallback(async (userId: string) => {
    const { data: convos, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      .order('last_message_at', { ascending: false });

    if (error || !convos) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const enriched = await Promise.all(
      convos.map(async (convo) => {
        const otherId =
          convo.participant_1 === userId
            ? convo.participant_2
            : convo.participant_1;

        const { data: profile } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', otherId)
          .single();

        const { data: lastMsg } = await supabase
          .from('messages')
          .select('content, created_at, sender_id, is_read, media_type')
          .eq('conversation_id', convo.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', convo.id)
          .eq('is_read', false)
          .neq('sender_id', userId);

        return {
          ...convo,
          otherUser: profile,
          lastMessage: lastMsg,
          unreadCount: unreadCount || 0,
        };
      })
    );

    setConversations(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUserId(user.id);
      await loadConversations(user.id);
    };

    init();
  }, [loadConversations, router]);

  // Live update when new messages arrive
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('messages-list-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        () => {
          loadConversations(currentUserId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          loadConversations(currentUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, loadConversations]);

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const previewText = (msg: any, isFromMe: boolean) => {
    if (!msg) return 'No messages yet';
    if (msg.media_type === 'image') {
      return `${isFromMe ? 'You: ' : ''}📷 Photo`;
    }
    if (msg.media_type === 'tip' || (msg.content || '').includes('💸')) {
      return msg.content || 'Tip';
    }
    return `${isFromMe ? 'You: ' : ''}${msg.content || ''}`;
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
          {/* Mobile header */}
          <div className="lg:hidden sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
            <Link href="/" className="text-zinc-400">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-xl font-semibold">Messages</h1>
          </div>

          <div className="max-w-2xl mx-auto px-4 py-6">
            <h1 className="hidden lg:flex text-3xl font-bold mb-8 items-center gap-3">
              <MessageCircle className="text-pink-500" size={30} />
              Messages
            </h1>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-zinc-900 rounded-2xl animate-pulse">
                    <div className="w-14 h-14 rounded-full bg-zinc-800" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-zinc-800 rounded w-1/3" />
                      <div className="h-3 bg-zinc-800 rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-24">
                <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-5">
                  <MessageCircle size={36} className="text-zinc-600" />
                </div>
                <p className="text-zinc-300 text-lg font-medium">No messages yet</p>
                <p className="text-zinc-500 text-sm mt-2 max-w-xs mx-auto">
                  When someone messages you, or you message them, it will show up here
                </p>
                <Link
                  href="/discover"
                  className="inline-block mt-6 text-pink-400 hover:text-pink-300 text-sm font-medium"
                >
                  Find people on Discover →
                </Link>
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((convo) => {
                  const name =
                    convo.otherUser?.display_name ||
                    convo.otherUser?.username ||
                    'User';
                  const initial = name.charAt(0).toUpperCase();
                  const hasUnread = convo.unreadCount > 0;
                  const isFromMe = convo.lastMessage?.sender_id === currentUserId;

                  return (
                    <Link
                      key={convo.id}
                      href={`/messages/${convo.id}`}
                      className="flex items-center gap-3.5 p-3.5 hover:bg-zinc-900/80 rounded-2xl transition group"
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-lg font-bold overflow-hidden">
                          {convo.otherUser?.avatar_url ? (
                            <img
                              src={convo.otherUser.avatar_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            initial
                          )}
                        </div>
                        {hasUnread && (
                          <div className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-zinc-950">
                            {convo.unreadCount > 9 ? '9+' : convo.unreadCount}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`truncate ${hasUnread ? 'font-bold text-white' : 'font-semibold text-zinc-100'}`}>
                            {name}
                          </p>
                          {convo.lastMessage && (
                            <span className={`text-xs flex-shrink-0 ${hasUnread ? 'text-pink-400 font-medium' : 'text-zinc-500'}`}>
                              {formatTime(convo.lastMessage.created_at)}
                            </span>
                          )}
                        </div>
                        <p className={`text-sm truncate mt-0.5 ${hasUnread ? 'text-zinc-200' : 'text-zinc-500'}`}>
                          {previewText(convo.lastMessage, isFromMe)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}