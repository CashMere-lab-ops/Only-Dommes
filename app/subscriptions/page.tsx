'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart, X } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { createClient } from '../../lib/supabase';

export default function SubscriptionsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Get active subscriptions + creator profile
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('subscriber_id', user.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false });

      if (error) {
        console.error(error);
        setSubs([]);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setSubs([]);
        setLoading(false);
        return;
      }

      // Load creator profiles
      const creatorIds = data.map((s) => s.creator_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, subscription_price')
        .in('id', creatorIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      const enriched = data.map((s) => ({
        ...s,
        creator: profileMap.get(s.creator_id) || null,
      }));

      setSubs(enriched);
      setLoading(false);
    };

    load();
  }, []);

  const handleCancel = async (sub: any) => {
    if (!confirm(`Cancel subscription to @${sub.creator?.username}?`)) return;

    setCancellingId(sub.id);

    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', sub.id);

      if (error) throw error;

      setSubs((prev) => prev.filter((s) => s.id !== sub.id));
    } catch (err: any) {
      alert(err.message || 'Could not cancel');
    } finally {
      setCancellingId(null);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
        {/* Mobile header */}
        <div className="lg:hidden sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
          <Link href="/account" className="text-zinc-400">
            <ArrowLeft size={22} />
          </Link>
          <h1 className="text-xl font-semibold">Subscriptions</h1>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 lg:py-8">
          <h1 className="hidden lg:flex text-3xl font-bold mb-2 items-center gap-3">
            <Heart className="text-pink-500" size={28} />
            Subscriptions
          </h1>
          <p className="text-zinc-400 mb-8 hidden lg:block">
            Creators you’re subscribed to
          </p>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-zinc-900 rounded-2xl animate-pulse">
                  <div className="w-14 h-14 rounded-full bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-zinc-800 rounded w-1/3" />
                    <div className="h-3 bg-zinc-800 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : subs.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-4">
                <Heart size={28} className="text-zinc-600" />
              </div>
              <p className="text-zinc-300 font-medium">No active subscriptions</p>
              <p className="text-zinc-500 text-sm mt-2 max-w-xs mx-auto">
                When you subscribe to a creator, they’ll show up here
              </p>
              <Link
                href="/discover"
                className="inline-block mt-6 text-pink-400 hover:text-pink-300 text-sm font-medium"
              >
                Discover creators →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {subs.map((sub) => {
                const name =
                  sub.creator?.display_name ||
                  sub.creator?.username ||
                  'Creator';
                const initial = name.charAt(0).toUpperCase();
                const price = Number(sub.price ?? sub.creator?.subscription_price ?? 0).toFixed(2);

                return (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3.5 p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl"
                  >
                    <Link
                      href={`/${sub.creator?.username}`}
                      className="flex items-center gap-3.5 flex-1 min-w-0"
                    >
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-lg font-bold overflow-hidden flex-shrink-0">
                        {sub.creator?.avatar_url ? (
                          <img
                            src={sub.creator.avatar_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          initial
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{name}</p>
                        <p className="text-sm text-pink-400 truncate">
                          @{sub.creator?.username}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          £{price}/mo · since {formatDate(sub.started_at)}
                        </p>
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleCancel(sub)}
                      disabled={cancellingId === sub.id}
                      className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/50 px-3 py-1.5 rounded-xl transition disabled:opacity-50 flex-shrink-0"
                    >
                      {cancellingId === sub.id ? '...' : 'Cancel'}
                    </button>
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