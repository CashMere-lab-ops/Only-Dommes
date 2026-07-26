'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const loadConversations = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUserId(user.id);

      // Get all conversations the user is in
      const { data: convos, error } = await supabase
        .from('conversations')
        .select('*')
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .order('last_message_at', { ascending: false });

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      if (!convos || convos.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Get the other user's profile for each conversation
      const enriched = await Promise.all(
        convos.map(async (convo) => {
          const otherId =
            convo.participant_1 === user.id
              ? convo.participant_2
              : convo.participant_1;

          const { data: profile } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', otherId)
            .single();

          // Get last message
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('content, created_at, sender_id')
            .eq('conversation_id', convo.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...convo,
            otherUser: profile,
            lastMessage: lastMsg,
          };
        })
      );

      setConversations(enriched);
      setLoading(false);
    };

    loadConversations();
  }, []);

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return date.toLocaleDateString();
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {/* Mobile header */}
          <div className="lg:hidden sticky top-0 z-50 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
            <Link href="/" className="text-zinc-400">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-xl font-semibold">Messages</h1>
          </div>

          <div className="max-w-2xl mx-auto px-4 py-6">
            <h1 className="hidden lg:block text-3xl font-bold mb-6 flex items-center gap-3">
              <MessageCircle className="text-pink-500" size={28} />
              Messages
            </h1>

            {loading ? (
              <p className="text-zinc-400 text-center py-20">Loading conversations...</p>
            ) : conversations.length === 0 ? (
              <div className="text-center py-20">
                <MessageCircle size={48} className="mx-auto text-zinc-600 mb-4" />
                <p className="text-zinc-400 text-lg">No messages yet</p>
                <p className="text-zinc-500 text-sm mt-2">
                  Click Message on someone’s profile to start a chat
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map((convo) => {
                  const name =
                    convo.otherUser?.display_name ||
                    convo.otherUser?.username ||
                    'User';
                  const initial = name.charAt(0).toUpperCase();

                  return (
                    <Link
                      key={convo.id}
                      href={`/messages/${convo.id}`}
                      className="flex items-center gap-4 p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl transition"
                    >
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-lg font-bold overflow-hidden flex-shrink-0">
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

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold truncate">{name}</p>
                          {convo.lastMessage && (
                            <span className="text-xs text-zinc-500 flex-shrink-0">
                              {formatTime(convo.lastMessage.created_at)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400 truncate mt-0.5">
                          {convo.lastMessage
                            ? convo.lastMessage.content
                            : 'No messages yet'}
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