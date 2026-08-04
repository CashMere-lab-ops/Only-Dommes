'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MessageCircle,
  ArrowLeft,
  Megaphone,
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Search,
  X,
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { createClient } from '../../lib/supabase';

type Filter = 'all' | 'unread' | 'fans' | 'subscribers' | 'archived';

const CALL_PREFIX = '__CALL_EVENT__:';

export default function MessagesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [fanIds, setFanIds] = useState<Set<string>>(new Set());
  const [subIds, setSubIds] = useState<Set<string>>(new Set());
  const userIdRef = useRef<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMeta = async (userId: string, creator: boolean) => {
    if (!creator) {
      setFanIds(new Set());
      setSubIds(new Set());
      return;
    }
    const { data: fans } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', userId);
    setFanIds(new Set((fans || []).map((f: any) => f.follower_id)));
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('subscriber_id')
      .eq('creator_id', userId)
      .eq('status', 'active');
    setSubIds(new Set((subs || []).map((s: any) => s.subscriber_id)));
  };

  const loadConversations = useCallback(
    async (userId: string) => {
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
          const isP1 = convo.participant_1 === userId;
          const otherId = isP1 ? convo.participant_2 : convo.participant_1;
          const isArchived = isP1
            ? !!convo.participant_1_archived
            : !!convo.participant_2_archived;
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url, account_type')
            .eq('id', otherId)
            .single();
          const { data: lastMessages } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', convo.id)
            .order('created_at', { ascending: false })
            .limit(1);
          const lastMessage = lastMessages?.[0] || null;
          const { data: allMsgs } = await supabase
            .from('messages')
            .select('content')
            .eq('conversation_id', convo.id)
            .not('content', 'is', null);
          const searchBlob = (allMsgs || [])
            .map((m: any) => m.content || '')
            .join(' ')
            .toLowerCase();
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', convo.id)
            .neq('sender_id', userId)
            .eq('is_read', false);
          return {
            ...convo,
            otherId,
            otherProfile: profile,
            lastMessage,
            unreadCount: count || 0,
            isArchived,
            searchBlob,
          };
        })
      );
      setConversations(enriched);
      setLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUserId(user.id);
      userIdRef.current = user.id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('id', user.id)
        .single();
      const creator = profile?.account_type === 'creator';
      setIsCreator(creator);
      await loadMeta(user.id, creator);
      await loadConversations(user.id);
    };
    init();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel('messages-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => {
            if (userIdRef.current) loadConversations(userIdRef.current);
          }, 400);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [currentUserId, loadConversations]);

  useEffect(() => {
    if (!isCreator && (filter === 'fans' || filter === 'subscribers')) {
      setFilter('all');
    }
  }, [isCreator, filter]);

  const toggleArchive = async (convo: any) => {
    if (!currentUserId) return;
    const isP1 = convo.participant_1 === currentUserId;
    const field = isP1 ? 'participant_1_archived' : 'participant_2_archived';
    const next = !convo.isArchived;
    const { error } = await supabase
      .from('conversations')
      .update({ [field]: next })
      .eq('id', convo.id);
    if (!error) {
      setConversations((prev) =>
        prev.map((c) => (c.id === convo.id ? { ...c, isArchived: next } : c))
      );
    }
    setMenuOpenId(null);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString();
  };

  const previewText = (msg: any, isFromMe: boolean) => {
    if (!msg) return 'No messages yet';

    const content = msg.content || '';

    // Voice call system receipts — clean labels only
    if (content.startsWith(CALL_PREFIX)) {
      const label = content.slice(CALL_PREFIX.length).split('|')[1] || 'Voice call';
      return label;
    }

    const prefix = isFromMe ? 'You: ' : '';
    if (msg.media_type === 'order_request' || content.includes('ORDER_REQUEST')) {
      const titleLine = content.split('\n').find((l: string) => l.startsWith('title:'));
      const title = titleLine ? titleLine.slice(6) : 'item';
      return `${prefix}🛒 Order · ${title}`;
    }
    if (
      msg.media_type === 'image' ||
      msg.media_url?.match(/\.(jpg|jpeg|png|gif|webp)/i)
    ) {
      return `${prefix}Photo`;
    }
    if (msg.media_type === 'video' || msg.media_url?.match(/\.(mp4|webm|mov)/i)) {
      return `${prefix}Video`;
    }
    if (msg.media_type === 'audio') {
      return `${prefix}Voice note`;
    }
    if (msg.is_locked) return `${prefix}Locked content`;
    return `${prefix}${content}`;
  };

  const q = search.trim().toLowerCase();
  const filtered = conversations.filter((c) => {
    if (filter === 'archived') {
      if (!c.isArchived) return false;
    } else {
      if (c.isArchived) return false;
      if (filter === 'unread' && c.unreadCount === 0) return false;
      if (filter === 'fans' && !fanIds.has(c.otherId)) return false;
      if (filter === 'subscribers' && !subIds.has(c.otherId)) return false;
    }
    if (!q) return true;
    const displayName = (c.otherProfile?.display_name || '').toLowerCase();
    const username = (c.otherProfile?.username || '').toLowerCase();
    const nameMatch =
      displayName.includes(q) ||
      username.includes(q) ||
      `@${username}`.includes(q);
    const messageMatch = (c.searchBlob || '').includes(q);
    return nameMatch || messageMatch;
  });

  const tabs: { id: Filter; label: string }[] = isCreator
    ? [
        { id: 'all', label: 'All' },
        { id: 'unread', label: 'Unread' },
        { id: 'fans', label: 'Fans' },
        { id: 'subscribers', label: 'Subscribers' },
        { id: 'archived', label: 'Archived' },
      ]
    : [
        { id: 'all', label: 'All' },
        { id: 'unread', label: 'Unread' },
        { id: 'archived', label: 'Archived' },
      ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <div className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="lg:hidden text-zinc-400 hover:text-white">
                <ArrowLeft size={22} />
              </Link>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <MessageCircle className="text-pink-500" size={22} />
                Messages
              </h1>
            </div>
            {isCreator && (
              <Link
                href="/messages/mass-message"
                className="flex items-center gap-2 text-sm bg-pink-600 hover:bg-pink-700 px-3 py-2 rounded-xl transition"
              >
                <Megaphone size={16} />
                <span className="hidden sm:inline">Mass message</span>
              </Link>
            )}
          </div>
          <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
                  filter === tab.id
                    ? 'bg-pink-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="max-w-3xl mx-auto px-4 pb-3">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search names or messages..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-10 text-sm outline-none focus:border-pink-500 placeholder:text-zinc-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1 max-w-3xl w-full mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-zinc-500">
              Loading messages...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <MessageCircle className="text-zinc-700 mb-4" size={48} />
              <p className="text-zinc-400 text-lg">
                {q
                  ? 'No chats match your search'
                  : filter === 'archived'
                  ? 'No archived chats'
                  : filter === 'unread'
                  ? 'No unread messages'
                  : filter === 'fans'
                  ? 'No chats with fans yet'
                  : filter === 'subscribers'
                  ? 'No chats with subscribers yet'
                  : 'No messages yet'}
              </p>
              <p className="text-zinc-600 text-sm mt-2">
                {q
                  ? 'Try a different name or word'
                  : filter === 'all'
                  ? 'Start a conversation from someone’s profile'
                  : 'Try another filter'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-900">
              {filtered.map((convo) => {
                const name =
                  convo.otherProfile?.display_name ||
                  convo.otherProfile?.username ||
                  'User';
                const avatar = convo.otherProfile?.avatar_url;
                const initial = (name || '?')[0].toUpperCase();
                const hasUnread = convo.unreadCount > 0;
                const isFromMe = convo.lastMessage?.sender_id === currentUserId;
                return (
                  <div
                    key={convo.id}
                    className="relative flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-900/60 transition group"
                  >
                    <Link
                      href={`/messages/${convo.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <div className="relative flex-shrink-0">
                        {avatar ? (
                          <img
                            src={avatar}
                            alt={name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center font-bold">
                            {initial}
                          </div>
                        )}
                        {hasUnread && (
                          <div className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-pink-500 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-zinc-950">
                            {convo.unreadCount > 9 ? '9+' : convo.unreadCount}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`truncate ${
                              hasUnread
                                ? 'font-bold text-white'
                                : 'font-semibold text-zinc-100'
                            }`}
                          >
                            {name}
                          </p>
                          {convo.lastMessage && (
                            <span
                              className={`text-xs flex-shrink-0 ${
                                hasUnread
                                  ? 'text-pink-400 font-medium'
                                  : 'text-zinc-500'
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
                      </div>
                    </Link>
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setMenuOpenId(menuOpenId === convo.id ? null : convo.id);
                        }}
                        className="p-2 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {menuOpenId === convo.id && (
                        <div className="absolute right-0 top-10 z-50 w-44 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl py-1 overflow-hidden">
                          <button
                            onClick={() => toggleArchive(convo)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 transition"
                          >
                            {convo.isArchived ? (
                              <>
                                <ArchiveRestore size={16} /> Unarchive
                              </>
                            ) : (
                              <>
                                <Archive size={16} /> Archive
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
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