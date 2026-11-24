'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart, CreditCard, MoreHorizontal } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import SiteFooter from '../../components/SiteFooter';
import { createClient } from '../../lib/supabase';

export default function SubscriptionsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<{ saved?: boolean; brand?: string | null; last4?: string | null } | null>(null);
  const [savingCard, setSavingCard] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [resuming, setResuming] = useState<string | null>(null);

  const cooldownKey = (creatorId: string) => `sub-cancel-cooldown-${creatorId}`;

  const canCancel = (creatorId: string) => {
    if (typeof window === 'undefined') return true;
    const until = localStorage.getItem(cooldownKey(creatorId));
    if (!until) return true;
    return Date.now() >= Number(until);
  };

  const setCooldown = (creatorId: string) => {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem(cooldownKey(creatorId), String(until));
  };

  const cancelSubscription = async (creatorId: string) => {
    if (!canCancel(creatorId)) {
      alert('You need to wait 24 hours after resuming before you can cancel again.');
      return;
    }
    setCancelling(creatorId);
    setMenuOpen(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ creator_id: creatorId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not cancel');
      }
      setRows((prev) =>
        prev.map((r) =>
          r.creator_id === creatorId ? { ...r, cancel_at_period_end: true } : r
        )
      );
    } catch (err: any) {
      alert(err.message || 'Something went wrong');
    } finally {
      setCancelling(null);
    }
  };

  const resumeSubscription = async (creatorId: string) => {
    setResuming(creatorId);
    setMenuOpen(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch('/api/subscriptions/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ creator_id: creatorId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not resume');
      setCooldown(creatorId);
      setRows((prev) =>
        prev.map((r) =>
          r.creator_id === creatorId ? { ...r, cancel_at_period_end: false } : r
        )
      );
    } catch (err: any) {
      alert(err.message || 'Something went wrong');
    } finally {
      setResuming(null);
    }
  };

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
                const isActive = r.status === 'active' && !r.cancel_at_period_end;
                return (
                  <div
                    key={r.id}
                    className="relative flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4"
                  >
                    <Link
                      href={r.creator?.username ? `/${r.creator.username}` : '/discover'}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      {r.creator?.avatar_url ? (
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
                    </Link>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full ${
                        r.cancel_at_period_end ? 'mr-3' : 'mr-1'
                      } ${
                        isActive
                          ? 'bg-pink-500/15 text-pink-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {r.cancel_at_period_end ? 'Ending' : r.status}
                    </span>
                    {(isActive || r.cancel_at_period_end) && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMenuOpen(menuOpen === r.id ? null : r.id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800"
                          aria-label="More"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {menuOpen === r.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-10 py-1">
                            {r.cancel_at_period_end ? (
                              <button
                                type="button"
                                disabled={resuming === r.creator_id}
                                onClick={() => resumeSubscription(r.creator_id)}
                                className="w-full text-left px-4 py-2.5 text-sm text-pink-400 hover:bg-zinc-800 disabled:opacity-50"
                              >
                                {resuming === r.creator_id ? 'Resuming…' : 'Subscribe again'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={cancelling === r.creator_id || !canCancel(r.creator_id)}
                                onClick={() => cancelSubscription(r.creator_id)}
                                className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-800 disabled:opacity-50"
                              >
                                {cancelling === r.creator_id
                                  ? 'Cancelling…'
                                  : !canCancel(r.creator_id)
                                  ? 'Cancel (24h cooldown)'
                                  : 'Cancel subscription'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
                <SiteFooter />
        </main>
    </div>
  );
}
