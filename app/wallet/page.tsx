'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Wallet, Plus, Loader2 } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

const PRESETS = [10, 25, 50, 100];

function WalletPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [custom, setCustom] = useState('');
  const [selected, setSelected] = useState<number | null>(25);
  const [toppingUp, setToppingUp] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

    setBalance(Number(profile?.balance_gbp ?? 0));

    const { data: txs } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    setTransactions(txs || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const topup = searchParams.get('topup');
    if (topup === 'success') {
      setMessage('Payment received. Your balance will update in a few seconds.');
      // Refresh a few times while webhook processes
      const t1 = setTimeout(() => load(), 1500);
      const t2 = setTimeout(() => load(), 4000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    if (topup === 'cancelled') {
      setError('Top-up cancelled.');
    }
  }, [searchParams]);

  const amountToCharge = (): number | null => {
    if (selected != null) return selected;
    const n = Number(custom);
    if (!Number.isFinite(n) || n < 5) return null;
    return Math.round(n * 100) / 100;
  };

  const startTopUp = async () => {
    setError('');
    setMessage('');
    const amount = amountToCharge();
    if (amount == null) {
      setError('Choose a preset or enter at least £5');
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
        body: JSON.stringify({ amount }),
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
    `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
          <div className="lg:hidden sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
            <Link href="/account" className="text-zinc-400">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-lg font-semibold">Wallet</h1>
          </div>

          <div className="max-w-2xl mx-auto px-4 lg:px-8 py-8">
            <div className="hidden lg:flex items-center gap-3 mb-8">
              <Wallet className="text-pink-500" size={28} />
              <h1 className="text-3xl font-bold">Wallet</h1>
            </div>

            {message && (
              <div className="mb-4 rounded-xl border border-pink-500/30 bg-pink-500/10 text-pink-200 px-4 py-3 text-sm">
                {message}
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {/* Balance card */}
            <div className="rounded-3xl bg-gradient-to-br from-pink-600/20 via-zinc-900 to-zinc-900 border border-pink-500/20 p-6 mb-8">
              <p className="text-sm text-zinc-400 mb-1">Available balance</p>
              {loading || balance === null ? (
                <p className="text-3xl font-bold text-zinc-500">…</p>
              ) : (
                <p className="text-4xl font-bold tracking-tight">{formatMoney(balance)}</p>
              )}
              <p className="text-xs text-zinc-500 mt-3">
                Balances are held in GBP. Use this balance to tip, unlock, call, and buy on World of Dommes.
              </p>
            </div>

            {/* Top up */}
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
              <label className="text-xs text-zinc-500 mb-1.5 block">Custom amount (min £5)</label>
              <input
                type="number"
                min={5}
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
                    <Loader2 className="animate-spin" size={18} /> Redirecting to card payment…
                  </>
                ) : (
                  `Top up ${
                    amountToCharge() != null ? formatMoney(amountToCharge()!) : ''
                  }`.trim()
                )}
              </button>
              <p className="text-[11px] text-zinc-500 mt-3 text-center">
                Test mode: use Stripe test card 4242 4242 4242 4242
              </p>
            </div>

            {/* History */}
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
              <h2 className="font-semibold mb-4">Recent activity</h2>
              {loading ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-zinc-500">No transactions yet. Top up to get started.</p>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {transactions.map((tx) => {
                    const positive = Number(tx.amount_gbp) >= 0;
                    return (
                      <li key={tx.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{typeLabel(tx.type)}</p>
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
