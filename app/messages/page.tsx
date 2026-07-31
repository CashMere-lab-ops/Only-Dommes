'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MessageCircle, ArrowLeft, Megaphone, Search, Pin, BellOff, MoreHorizontal, Volume2
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { createClient } from '../../lib/supabase';

export default function MessagesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const userIdRef = useRef<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Settings for this user (pin / mute)
    const { data: settings } = await supabase
      .from('conversation_settings')
      .select('*')
      .eq('user_id', userId);

    const settingsMap = new Map(
      (settings || []).map((s) => [s.conversation_id, s])
    );

    const enriched = await Promise.all(
      convos.map(async (convo) => {
        const otherId =
          convo.participant_1 === userId
            ? convo.participant_2
            : convo.participant_1;

        const { data: profile } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url, last_seen_at')
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

        const setting = settingsMap.get(convo.id);

        return {
          ...convo,
          otherUser: profile,
          lastMessage: lastMsg,
          unreadCount: unreadCount || 0,
          isPinned: !!setting?.is_pinned,
          isMuted: !!setting?.is_muted,
          pinnedAt: setting?.pinned_at || null,
        };
      })
    );

    // Pinned first, then by last message
    enriched.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (a.isPinned && b.isPinned) {
        return new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime();
      }
      return (
        new Date(b.last_message_at || 0).getTime() -
        new Date(a.last_message_at || 0).getTime()
      );
    });

    setConversations(enriched);
    setLoading(false);
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      if (userIdRef.current) loadConversations(userIdRef.current);
    }, 300);
  }, [loadConversations]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      setCurrentUserId(user.id);
      userIdRef.current = user.id;

      // Update own last seen
      await supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('id', user.id)
        .single();

      setIsCreator(profile?.account_type === 'creator');
      await loadConversations(user.id);
    };

    init();
  }, [loadConversations, router]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`messages-list-fast-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => scheduleRefresh()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => scheduleRefresh()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        () => scheduleRefresh()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        () => scheduleRefresh()
      )
      .subscribe();

    const interval = setInterval(() => {
      if (userIdRef.current) loadConversations(userIdRef.current);
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [currentUserId, loadConversations, scheduleRefresh]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const upsertSetting = async (
    conversationId: string,
    updates: { is_pinned?: boolean; is_muted?: boolean; pinned_at?: string | null }
  ) => {
    if (!currentUserId) return;

    const { data: existing } = await supabase
      .from('conversation_settings')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('conversation_settings')
        .update(updates)
        .eq('id', existing.id);
    } else {
      await supabase.from('conversation_settings').insert({
        user_id: currentUserId,
        conversation_id: conversationId,
        is_pinned: updates.is_pinned ?? false,
        is_muted: updates.is_muted ?? false,
        pinned_at: updates.pinned_at ?? null,
      });
    }

    await loadConversations(currentUserId);
    setOpenMenu(null);
  };

  const togglePin = async (convo: any) => {
    const next = !convo.isPinned;
    await upsertSetting(convo.id, {
      is_pinned: next,
      pinned_at: next ? new Date().toISOString() : null,
    });
  };

  const toggleMute = async (convo: any) => {
    await upsertSetting(convo.id, {
      is_muted: !convo.isMuted,
    });
  };

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

  const formatLastSeen = (dateString?: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 90) return 'Online';
    if (diff < 3600) return `Active ${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `Active ${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `Active ${Math.floor(diff / 86400)}d ago`;
    return `Active ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  };

  const previewText = (msg: any, isFromMe: boolean) => {
    if (!msg) return 'No messages yet';
    if (msg.media_type === 'image') return `${isFromMe ? 'You: ' : ''}📷 Photo`;
    if (msg.media_type === 'tip' || (msg.content || '').includes('💸')) {
      return msg.content || 'Tip';
    }
    return `${isFromMe ? 'You: ' : ''}${msg.content || ''}`;
  };

  const filtered = conversations.filter((convo) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = (convo.otherUser?.display_name || '').toLowerCase();
    const username = (convo.otherUser?.username || '').toLowerCase();
    return name.includes(q) || username.includes(q);
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-zinc-400">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-xl font-semibold">Messages</h1>
          </div>
          {isCreator && (
            <Link
              href="/messages/mass-message"
              className="text-pink-400 text-sm font-medium flex items-center gap-1"
            >
              <Megaphone size={16} />
              Mass
            </Link>
          )}
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Desktop header */}
          <div className="hidden lg:flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <MessageCircle className="text-pink-500" size={30} />
              Messages
            </h1>
            {isCreator && (
              <Link
                href="/messages/mass-message"
                className="inline-flex items-center gap-2 bg-pink-600 hover:bg-pink-700 px-4 py-2.5 rounded-xl text-sm font-medium transition"
              >
                <Megaphone size={16} />
                Mass Message
              </Link>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-5">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-full py-2.5 pl-11 pr-4 text-sm outline-none focus:border-pink-500 transition"
            />
          </div>

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
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-5">
                <MessageCircle size={36} className="text-zinc-600" />
              </div>
              <p className="text-zinc-300 text-lg font-medium">
                {searchQuery ? 'No chats found' : 'No messages yet'}
              </p>
              <p className="text-zinc-500 text-sm mt-2 max-w-xs mx-auto">
                {searchQuery
                  ? 'Try a different name'
                  : 'When someone messages you, or you message them, it will show up here'}
              </p>
              {!searchQuery && (
                <Link
                  href="/discover"
                  className="inline-block mt-6 text-pink-400 hover:text-pink-300 text-sm font-medium"
                >
                  Find people on Discover →
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((convo) => {
                const name =
                  convo.otherUser?.display_name ||
                  convo.otherUser?.username ||
                  'User';
                const initial = name.charAt(0).toUpperCase();
                const hasUnread = convo.unreadCount > 0;
                const isFromMe = convo.lastMessage?.sender_id === currentUserId;
                const isMenuOpen = openMenu === convo.id;
                const onlineLabel = formatLastSeen(convo.otherUser?.last_seen_at);

                return (
                  <div key={convo.id} className="relative group">
                    <Link
                      href={`/messages/${convo.id}`}
                      className="flex items-center gap-3.5 p-3.5 hover:bg-zinc-900/80 rounded-2xl transition"
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
                        {onlineLabel === 'Online' && (
                          <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-zinc-950" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {convo.isPinned && (
                              <Pin size={12} className="text-pink-400 flex-shrink-0" />
                            )}
                            {convo.isMuted && (
                              <BellOff size={12} className="text-zinc-500 flex-shrink-0" />
                            )}
                            <p
                              className={`truncate ${
                                hasUnread ? 'font-bold text-white' : 'font-semibold text-zinc-100'
                              }`}
                            >
                              {name}
                            </p>
                          </div>
                          {convo.lastMessage && (
                            <span
                              className={`text-xs flex-shrink-0 ${
                                hasUnread ? 'text-pink-400 font-medium' : 'text-zinc-500'
                              }`}
                            >
                              {formatTime(convo.lastMessage.created_at)}
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-sm truncate mt-0.5 ${
                            hasUnread ? 'text-zinc-200' : 'text-zinc-500'
                          }`}
                        >
                          {previewText(convo.lastMessage, isFromMe)}
                        </p>
                        {onlineLabel && onlineLabel !== 'Online' && (
                          <p className="text-[11px] text-zinc-600 mt-0.5 truncate">
                            {onlineLabel}
                          </p>
                        )}
                      </div>
                    </Link>

                    {/* Menu button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenMenu(isMenuOpen ? null : convo.id);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition"
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {isMenuOpen && (
                      <div
                        ref={menuRef}
                        className="absolute right-3 top-12 w-44 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => togglePin(convo)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 transition"
                        >
                          <Pin size={15} />
                          {convo.isPinned ? 'Unpin chat' : 'Pin chat'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMute(convo)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 transition border-t border-zinc-800"
                        >
                          {convo.isMuted ? <Volume2 size={15} /> : <BellOff size={15} />}
                          {convo.isMuted ? 'Unmute' : 'Mute'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}