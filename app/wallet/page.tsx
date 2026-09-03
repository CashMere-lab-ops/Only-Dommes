'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Wallet, Plus, Loader2 } from 'lucide-react';
import Sidebar, { setCachedBalance } from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

const PRESETS = [10, 25, 50, 100];

function WalletPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const fromParam = (searchParams.get('from') || '').toLowerCase();
  const backHref =
    fromParam === 'dashboard'
      ? '/dashboard'
      : fromParam === 'account'
        ? '/account'
        : '/account';
  const backLabel =
    fromParam === 'dashboard'
      ? 'Back to dashboard'
      : fromParam === 'account'
        ? 'Back to My Account'
        : 'Back';

  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [custom, setCustom] = useState('');
  const [selected, setSelected] = useState<number | null>(25);
  const [toppingUp, setToppingUp] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [card, setCard] = useState<{ saved: boolean; brand?: string | null; last4?: string | null } | null>(null);
  const [savingCard, setSavingCard] = useState(false);

  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('balance_gbp')
      .eq('id', user.id)
      .single();

    const bal = Number(profile?.balance_gbp ?? 0);
    setBalance(bal);
    setCachedBalance(bal);

    const { data: txs } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    setTransactions(txs || []);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      const cardRes = await fetch('/api/billing/save-card', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const cardData = await cardRes.json().catch(() => ({}));
      if (cardRes.ok) setCard(cardData);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // After Stripe success: confirm session with our API (does not rely only on webhook)
  useEffect(() => {
    const topup = searchParams.get('topup');
    const sessionId = searchParams.get('session_id');

    if (searchParams.get('card') === 'saved') {
      setMessage('Backup card saved. We’ll use it if your wallet is short on a subscription.');
    }

    if (topup === 'cancelled') {
      setError('Top-up cancelled.');
      return;
    }

    if (topup !== 'success') return;

    setMessage('Payment received. Updating your balance…');

    const confirm = async () => {
      if (!sessionId) {
        // Webhook-only path — poll a few times
        setTimeout(() => load(), 1500);
        setTimeout(() => load(), 4000);
        setTimeout(() => load(), 8000);
        return;
      }

      setConfirming(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError('Please log in again to finish updating your balance');
          setConfirming(false);
          return;
        }

        const res = await fetch('/api/wallet/confirm-top-up', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(
            data.error ||
              'Payment went through but balance update failed. Contact support with your receipt.'
          );
          // Still try loading in case webhook succeeded
          await load();
        } else {
          if (typeof data.balance === 'number') {
            setBalance(data.balance);
            setCachedBalance(data.balance);
          }
          setMessage(
            data.already
              ? 'Balance already updated.'
              : `Top-up successful. New balance £${Number(data.balance).toFixed(2)}.`
          );
          await load();
        }
      } catch {
        setError('Could not confirm top-up. Refresh in a moment.');
        await load();
      }
      setConfirming(false);
    };

    confirm();
  }, [searchParams]);

  const amountToCharge = (): number | null => {
    if (selected != null) return selected;
    const n = Number(custom);
    if (!Number.isFinite(n) || n < 10) return null;
    return Math.round(n * 100) / 100;
  };

  const startTopUp = async () => {
    setError('');
    setMessage('');
    const amount = amountToCharge();
    if (amount == null) {
      setError('Choose a preset or enter at least £10');
      return;
    }

    setToppingUp(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Please log in again');
        setToppingUp(false);
        return;
      }

      const res = await fetch('/api/wallet/top-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount,
          from: fromParam === 'dashboard' ? 'dashboard' : 'account',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not start top-up');
        setToppingUp(false);
        return;
      }
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || 'Top-up failed');
      setToppingUp(false);
    }
  };

  const formatMoney = (n: number) =>
    `£${Number(n).toLocaleString('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const typeLabel = (t: string) => {
    const map: Record<string, string> = {
      top_up: 'Top-up',
      tip_sent: 'Tip sent',
      tip_received: 'Tip received',
      unlock_sent: 'Unlock',
      unlock_received: 'Unlock earned',
      call_sent: 'Voice call',
      call_received: 'Call earned',
      shop_sent: 'Shop purchase',
      shop_received: 'Shop sale',
      payout: 'Payout',
      payout_requested: 'Payout requested',
      payout_fee: 'Payout fee',
      refund: 'Refund',
      adjustment: 'Adjustment',
    };
    return map[t] || t;
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-8">
          <div className="max-w-2xl mx-auto px-4 lg:px-8 py-6 lg:py-8">
            <div className="flex items-center gap-3 mb-2">
              <Wallet className="text-pink-500 hidden lg:block" size={28} />
              <h1 className="text-2xl lg:text-3xl font-bold">Wallet</h1>
            </div>
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-pink-400 mb-6 lg:mb-8 transition"
            >
              <ArrowLeft size={16} /> {backLabel}
            </Link>

            {message && (
              <div className="mb-4 rounded-xl border border-pink-500/30 bg-pink-500/10 text-pink-200 px-4 py-3 text-sm">
                {confirming ? 'Confirming payment… ' : ''}
                {message}
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <div className="rounded-3xl bg-gradient-to-br from-pink-600/20 via-zinc-900 to-zinc-900 border border-pink-500/20 p-6 mb-8">
              <p className="text-sm text-zinc-400 mb-1">Available balance</p>
              {loading || balance === null ? (
                <p className="text-3xl font-bold text-zinc-500">…</p>
              ) : (
                <p className="text-4xl font-bold tracking-tight">
                  {formatMoney(balance)}
                </p>
              )}
              <p className="text-xs text-zinc-500 mt-3">
                Balances are held in GBP. Use this balance to tip, unlock, call,
                and buy on World of Dommes.
              </p>
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 mb-8">
              <h2 className="font-semibold mb-1">Backup card</h2>
              <p className="text-sm text-zinc-500 mb-4">
                Used only if your wallet is short on a subscription renewal.
              </p>
              {card?.saved ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">
                    {(card.brand || 'Card').toUpperCase()} ····· {card.last4}
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      const {
                        data: { session },
                      } = await supabase.auth.getSession();
                      if (!session?.access_token) return;
                      await fetch('/api/billing/save-card', {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${session.access_token}` },
                      });
                      setCard({ saved: false });
                    }}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
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
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium disabled:opacity-50"
                >
                  {savingCard ? 'Opening…' : 'Add backup card'}
                </button>
              )}
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 mb-8">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Plus size={18} className="text-pink-400" /> Top up
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setSelected(p);
                      setCustom('');
                    }}
                    className={`py-3 rounded-xl text-sm font-semibold transition border ${
                      selected === p
                        ? 'bg-pink-600 border-pink-500 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-500'
                    }`}
                  >
                    £{p}
                  </button>
                ))}
              </div>
              <label className="text-xs text-zinc-500 mb-1.5 block">
                Custom amount (min £10)
              </label>
              <input
                type="number"
                min={10}
                step="0.01"
                placeholder="e.g. 40"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setSelected(null);
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:border-pink-500 mb-4"
              />
              <button
                type="button"
                onClick={startTopUp}
                disabled={toppingUp}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {toppingUp ? (
                  <>
                    <Loader2 className="animate-spin" size={18} /> Redirecting
                    to card payment…
                  </>
                ) : (
                  `Top up ${
                    amountToCharge() != null
                      ? formatMoney(amountToCharge()!)
                      : ''
                  }`.trim()
                )}
              </button>
              <p className="text-[11px] text-zinc-500 mt-3 text-center">
                Test mode: use Stripe test card 4242 4242 4242 4242
              </p>
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
              <h2 className="font-semibold mb-4">Recent activity</h2>
              {loading ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No transactions yet. Top up to get started.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {transactions.map((tx) => {
                    const positive = Number(tx.amount_gbp) >= 0;
                    return (
                      <li
                        key={tx.id}
                        className="py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {typeLabel(tx.type)}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {new Date(tx.created_at).toLocaleString('en-GB')}
                          </p>
                        </div>
                        <p
                          className={`text-sm font-semibold flex-shrink-0 ${
                            positive ? 'text-emerald-400' : 'text-zinc-200'
                          }`}
                        >
                          {positive ? '+' : ''}
                          {formatMoney(tx.amount_gbp)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default function WalletPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
          Loading wallet…
        </div>
      }
    >
      <WalletPageInner />
    </Suspense>
  );
}
