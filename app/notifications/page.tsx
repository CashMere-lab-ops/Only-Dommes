'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Bell, MessageCircle, Heart, Users, DollarSign,
  Check, CheckCheck
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { createClient } from '../../lib/supabase';

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const loadNotifications = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      setNotifications([]);
    } else {
      // Enrich with actor profile
      const enriched = await Promise.all(
        (data || []).map(async (n) => {
          if (!n.actor_id) return { ...n, actor: null };
          const { data: actor } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', n.actor_id)
            .single();
          return { ...n, actor };
        })
      );
      setNotifications(enriched);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserId(user.id);
      await loadNotifications(user.id);
    };
    init();
  }, [loadNotifications, router]);

  // Realtime new notifications
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => loadNotifications(userId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadNotifications]);

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true }))
    );
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'message':
        return <MessageCircle size={18} className="text-blue-400" />;
      case 'tip':
        return <DollarSign size={18} className="text-green-400" />;
      case 'follow':
        return <Users size={18} className="text-pink-400" />;
      case 'subscribe':
        return <Heart size={18} className="text-rose-400" />;
      default:
        return <Bell size={18} className="text-zinc-400" />;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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
            <h1 className="text-xl font-semibold">Notifications</h1>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-pink-400 text-sm font-medium"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Desktop header */}
          <div className="hidden lg:flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Bell className="text-pink-500" size={30} />
              Notifications
            </h1>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-2 text-sm text-pink-400 hover:text-pink-300 font-medium"
              >
                <CheckCheck size={16} />
                Mark all as read
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-4 bg-zinc-900 rounded-2xl animate-pulse"
                >
                  <div className="w-12 h-12 rounded-full bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-zinc-800 rounded w-2/3" />
                    <div className="h-3 bg-zinc-800 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-5">
                <Bell size={36} className="text-zinc-600" />
              </div>
              <p className="text-zinc-300 text-lg font-medium">No notifications yet</p>
              <p className="text-zinc-500 text-sm mt-2 max-w-xs mx-auto">
                When someone messages you, tips you, or follows you, it will show up here
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((n) => {
                const actorName =
                  n.actor?.display_name || n.actor?.username || 'Someone';
                const initial = actorName.charAt(0).toUpperCase();

                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3.5 p-4 rounded-2xl transition ${
                      n.is_read
                        ? 'hover:bg-zinc-900/50'
                        : 'bg-pink-500/5 hover:bg-pink-500/10'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold overflow-hidden">
                        {n.actor?.avatar_url ? (
                          <img
                            src={n.actor.avatar_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          initial
                        )}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-zinc-900 flex items-center justify-center border-2 border-zinc-950">
                        {getIcon(n.type)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={n.link || '#'}
                        onClick={() => {
                          if (!n.is_read) markAsRead(n.id);
                        }}
                        className="block"
                      >
                        <p className={`text-sm leading-snug ${n.is_read ? 'text-zinc-300' : 'text-white font-medium'}`}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-sm text-zinc-500 mt-0.5 truncate">
                            {n.body}
                          </p>
                        )}
                        <p className="text-xs text-zinc-600 mt-1">
                          {formatTime(n.created_at)}
                        </p>
                      </Link>
                    </div>

                    {/* Unread dot + mark read */}
                    {!n.is_read && (
                      <button
                        onClick={() => markAsRead(n.id)}
                        className="flex-shrink-0 mt-1.5 w-2.5 h-2.5 rounded-full bg-pink-500"
                        title="Mark as read"
                      />
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