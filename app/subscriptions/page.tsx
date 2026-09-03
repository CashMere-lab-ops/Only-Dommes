'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart, CreditCard } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { createClient } from '../../lib/supabase';

export default function SubscriptionsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<{ saved?: boolean; brand?: string | null; last4?: string | null } | null>(null);
  const [savingCard, setSavingCard] = useState(false);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('subscriptions')
        .select(
          'id, status, price, current_period_end, cancel_at_period_end, creator_id'
        )
        .eq('subscriber_id', user.id)
        .order('started_at', { ascending: false });

      const list = data || [];
      const ids = [...new Set(list.map((r: any) => r.creator_id))];
      let map: Record<string, any> = {};
      if (ids.length) {
        const { data: people } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', ids);
        (people || []).forEach((p: any) => {
          map[p.id] = p;
        });
      }
      setRows(list.map((r: any) => ({ ...r, creator: map[r.creator_id] })));

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        const cr = await fetch('/api/billing/save-card', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const cj = await cr.json().catch(() => ({}));
        if (cr.ok) setCard(cj);
      }

      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-24 lg:pb-10">
        <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8">
          <div className="flex items-center gap-3 mb-8">
            <Link href="/dashboard" className="text-zinc-400 hover:text-white lg:hidden">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Heart className="text-pink-500" size={22} /> Subscriptions
            </h1>
          </div>

          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center flex-shrink-0">
                <CreditCard className="text-pink-400" size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Backup card</p>
                <p className="text-sm text-zinc-500 mt-0.5">
                  If your wallet is short on renew day, we charge this card and keep the subscription.
                </p>
                {card?.saved ? (
                  <p className="text-sm text-zinc-200 mt-3">
                    {(card.brand || 'Card').toUpperCase()} ····· {card.last4}
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={savingCard}
                    onClick={async () => {
                      setSavingCard(true);
                      const {
                        data: { session },
                      } = await supabase.auth.getSession();
                      if (!session?.access_token) return;
                      const res = await fetch('/api/billing/save-card', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${session.access_token}` },
                      });
                      const data = await res.json().catch(() => ({}));
                      setSavingCard(false);
                      if (data.url) window.location.href = data.url;
                      else alert(data.error || 'Could not open card setup');
                    }}
                    className="mt-3 px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-sm font-medium disabled:opacity-50"
                  >
                    {savingCard ? 'Opening…' : 'Add backup card'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <p className="text-zinc-500">Loading...</p>
          ) : rows.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
              <p className="text-zinc-300 font-medium">No subscriptions yet</p>
              <Link href="/discover" className="inline-block mt-4 text-pink-400 text-sm">
                Discover creators →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => {
                const name =
                  r.creator?.display_name ||
                  (r.creator?.username ? `@${r.creator.username}` : 'Creator');
                const ends = r.current_period_end
                  ? new Date(r.current_period_end).toLocaleDateString('en-GB')
                  : null;
                return (
                  <Link
                    key={r.id}
                    href={r.creator?.username ? `/${r.creator.username}` : '/discover'}
                    className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700"
                  >
                    {r.creator?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.creator.avatar_url}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-pink-600 flex items-center justify-center font-bold">
                        {name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{name}</p>
                      <p className="text-sm text-zinc-500">
                        £{Number(r.price || 0).toFixed(2)}/mo
                        {ends ? ` · ${r.cancel_at_period_end ? 'Ends' : 'Renews'} ${ends}` : ''}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full ${
                        r.status === 'active'
                          ? 'bg-pink-500/15 text-pink-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {r.cancel_at_period_end ? 'Ending' : r.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
