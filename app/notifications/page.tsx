'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Heart,
  MessageCircle,
  Radio,
  UserPlus,
  DollarSign,
  Unlock,
  Trash2,
  Loader2,
} from 'lucide-react';
import Sidebar from '../../../components/Sidebar';
import SiteFooter from '../../../components/SiteFooter';
import AuthGuard from '../../../components/AuthGuard';
import { createClient } from '../../../lib/supabase';

type Notif = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  is_read?: boolean;
  created_at: string;
  actor_id?: string | null;
  actor?: {
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function NotifIcon({ type }: { type: string }) {
  const cls = 'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0';
  switch (type) {
    case 'live':
      return (
        <div className={`${cls} bg-red-600/20 text-red-400`}>
          <Radio size={18} />
        </div>
      );
    case 'tip':
    case 'gift_received':
    case 'subscribe':
      return (
        <div className={`${cls} bg-pink-600/20 text-pink-400`}>
          <DollarSign size={18} />
        </div>
      );
    case 'follow':
      return (
        <div className={`${cls} bg-blue-600/20 text-blue-400`}>
          <UserPlus size={18} />
        </div>
      );
    case 'like':
      return (
        <div className={`${cls} bg-rose-600/20 text-rose-400`}>
          <Heart size={18} />
        </div>
      );
    case 'comment':
    case 'message':
      return (
        <div className={`${cls} bg-zinc-700 text-zinc-200`}>
          <MessageCircle size={18} />
        </div>
      );
    case 'unlock':
      return (
        <div className={`${cls} bg-amber-600/20 text-amber-400`}>
          <Unlock size={18} />
        </div>
      );
    default:
      return (
        <div className={`${cls} bg-zinc-800 text-zinc-300`}>
          <Bell size={18} />
        </div>
      );
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) {
      setItems([]);
      setLoading(false);
      return;
    }

    const rows = data || [];
    const actorIds = [
      ...new Set(
        rows.map((n: any) => n.actor_id).filter((id: string | null) => !!id)
      ),
    ] as string[];

    let actors: Record<string, any> = {};
    if (actorIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', actorIds);
      for (const p of profiles || []) {
        actors[p.id] = p;
      }
    }

    setItems(
      rows.map((n: any) => ({
        ...n,
        actor: n.actor_id ? actors[n.actor_id] || null : null,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserId(user.id);
      await load(user.id);

      const channel = supabase
        .channel(`notif-page-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            load(user.id);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    })();
  }, []);

  const markAllRead = async () => {
    if (!userId || marking) return;
    setMarking(true);
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setMarking(false);
  };

  const markOneRead = async (id: string) => {
    if (!userId) return;
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', userId);
  };

  const clearAll = async () => {
    if (!userId) return;
    if (!confirm('Clear all notifications?')) return;
    await supabase.from('notifications').delete().eq('user_id', userId);
    setItems([]);
  };

  const unread = items.filter((n) => !n.is_read).length;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-10">
          <div className="lg:hidden sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-zinc-400 hover:text-white"
            >
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-lg font-semibold flex-1">Notifications</h1>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs text-pink-400 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-w-2xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
            <div className="hidden lg:flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                  <Bell className="text-pink-500" size={28} />
                  Notifications
                </h1>
                <p className="text-zinc-500 text-sm mt-1">
                  {unread > 0
                    ? `${unread} unread`
                    : 'You are all caught up'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    disabled={marking}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 hover:border-pink-500/40 transition"
                  >
                    <CheckCheck size={16} className="text-pink-400" />
                    Mark all read
                  </button>
                )}
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void clearAll()}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-400 hover:text-red-300 hover:border-red-500/30 transition"
                  >
                    <Trash2 size={16} />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-pink-500" size={28} />
              </div>
            ) : items.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                <Bell className="mx-auto text-zinc-600 mb-3" size={36} />
                <p className="text-zinc-200 font-medium text-lg">No notifications yet</p>
                <p className="text-sm text-zinc-500 mt-2">
                  Tips, follows, lives and messages will show up here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((n) => {
                  const name =
                    n.actor?.display_name ||
                    (n.actor?.username ? `@${n.actor.username}` : null);
                  const href = n.link || '#';
                  const inner = (
                    <div
                      className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3.5 transition ${
                        n.is_read
                          ? 'bg-zinc-900/60 border-zinc-800/80'
                          : 'bg-zinc-900 border-pink-500/25'
                      }`}
                    >
                      {n.actor?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={n.actor.avatar_url}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <NotifIcon type={n.type} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm leading-snug ${
                            n.is_read ? 'text-zinc-300' : 'text-white font-medium'
                          }`}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                            {n.body}
                          </p>
                        )}
                        <p className="text-[11px] text-zinc-600 mt-1">
                          {name ? `${name} · ` : ''}
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-pink-500 flex-shrink-0 mt-2" />
                      )}
                    </div>
                  );

                  if (href && href !== '#') {
                    return (
                      <Link
                        key={n.id}
                        href={href}
                        onClick={() => void markOneRead(n.id)}
                        className="block"
                      >
                        {inner}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className="w-full text-left"
                      onClick={() => void markOneRead(n.id)}
                    >
                      {inner}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
                  <SiteFooter />
        </main>
      </div>
    </AuthGuard>
  );
}
