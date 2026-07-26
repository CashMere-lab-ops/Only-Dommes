'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import Sidebar from '../../../components/Sidebar';
import AuthGuard from '../../../components/AuthGuard';
import { createClient } from '../../../lib/supabase';

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const conversationId = params.id as string;

  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadChat = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUserId(user.id);

      const { data: convo, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (error || !convo) {
        router.push('/messages');
        return;
      }

      if (convo.participant_1 !== user.id && convo.participant_2 !== user.id) {
        router.push('/messages');
        return;
      }

      const otherId =
        convo.participant_1 === user.id
          ? convo.participant_2
          : convo.participant_1;

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', otherId)
        .single();

      setOtherUser(profile);

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      setMessages(msgs || []);
      setLoading(false);

      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .neq('sender_id', user.id);
    };

    if (conversationId) loadChat();
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId || sending) return;

    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.id)) return prev;
          return [...prev, data];
        });
      }

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);
    } catch (err) {
      console.error('Send error:', err);
      alert('Failed to send message');
      setNewMessage(content);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateLabel = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  // Group messages by date
  const groupedMessages: { label: string; messages: any[] }[] = [];
  messages.forEach((msg) => {
    const label = formatDateLabel(msg.created_at);
    const lastGroup = groupedMessages[groupedMessages.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.messages.push(msg);
    } else {
      groupedMessages.push({ label, messages: [msg] });
    }
  });

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <div className="hidden lg:block">
            <Sidebar />
          </div>
          <main className="flex-1 flex items-center justify-center">
            <p className="text-zinc-400">Loading chat...</p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  const name = otherUser?.display_name || otherUser?.username || 'User';
  const initial = name.charAt(0).toUpperCase();

  const MessageList = () => (
    <>
      {groupedMessages.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-base">No messages yet</p>
          <p className="text-sm mt-1 text-zinc-600">Say hello 👋</p>
        </div>
      ) : (
        groupedMessages.map((group) => (
          <div key={group.label}>
            {/* Date separator */}
            <div className="flex items-center justify-center my-4">
              <span className="text-[11px] font-medium text-zinc-500 bg-zinc-900/80 px-3 py-1 rounded-full">
                {group.label}
              </span>
            </div>

            <div className="space-y-1.5">
              {group.messages.map((msg) => {
                const isMine = msg.sender_id === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] lg:max-w-[60%] px-3.5 py-2 rounded-2xl ${
                        isMine
                          ? 'bg-pink-600 text-white rounded-br-md'
                          : 'bg-zinc-800 text-white rounded-bl-md'
                      }`}
                    >
                      <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                      <p
                        className={`text-[10px] mt-1 ${
                          isMine ? 'text-pink-200/80' : 'text-zinc-500'
                        }`}
                      >
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </>
  );

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* ================= MOBILE ================= */}
        <div className="lg:hidden fixed inset-0 bg-zinc-950 flex flex-col z-50">
          <div className="flex-shrink-0 border-b border-zinc-800 px-3 py-3 flex items-center gap-3">
            <button onClick={() => router.push('/messages')} className="text-zinc-400 p-1">
              <ArrowLeft size={24} />
            </button>
            <Link href={`/${otherUser?.username}`} className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden flex-shrink-0">
                {otherUser?.avatar_url ? (
                  <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{name}</p>
                <p className="text-xs text-zinc-400 truncate">@{otherUser?.username}</p>
              </div>
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            <MessageList />
          </div>

          <form
            onSubmit={handleSend}
            className="flex-shrink-0 border-t border-zinc-800 px-3 py-2"
            style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Message..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-2.5 outline-none focus:border-pink-500"
                style={{ fontSize: '16px' }}
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className="w-10 h-10 rounded-full bg-pink-600 flex items-center justify-center disabled:opacity-40 flex-shrink-0"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </div>

        {/* ================= DESKTOP ================= */}
        <main className="hidden lg:flex flex-1 flex-col h-screen overflow-hidden">
          <div className="flex-shrink-0 border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
            <Link href="/messages" className="text-zinc-400 hover:text-white">
              <ArrowLeft size={22} />
            </Link>
            <Link href={`/${otherUser?.username}`} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden">
                {otherUser?.avatar_url ? (
                  <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              <div>
                <p className="font-semibold text-sm">{name}</p>
                <p className="text-xs text-zinc-400">@{otherUser?.username}</p>
              </div>
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <MessageList />
          </div>

          <form onSubmit={handleSend} className="flex-shrink-0 border-t border-zinc-800 px-6 py-4">
            <div className="flex items-center gap-3 max-w-3xl">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-5 py-3 text-sm outline-none focus:border-pink-500"
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className="w-12 h-12 rounded-full bg-pink-600 hover:bg-pink-700 flex items-center justify-center transition disabled:opacity-40"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </main>
      </div>
    </AuthGuard>
  );
}