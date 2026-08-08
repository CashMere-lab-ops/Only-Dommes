'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  TrendingUp,
  Wallet,
  Clock,
  Calendar,
  Filter,
  DollarSign,
  Heart,
  Phone,
  ShoppingBag,
  Lock,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

type FilterKey =
  | 'all'
  | 'tips'
  | 'shop'
  | 'calls'
  | 'unlocks'
  | 'subs'
  | 'payouts';

type RangeKey = '7d' | '30d' | 'month' | 'all';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'tips', label: 'Tips' },
  { key: 'shop', label: 'Shop' },
  { key: 'calls', label: 'Calls' },
  { key: 'unlocks', label: 'Unlocks' },
  { key: 'subs', label: 'Subs' },
  { key: 'payouts', label: 'Payouts' },
];

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
];

const EARNING_TYPES = [
  'tip_received',
  'shop_pending',
  'shop_received',
  'call_received',
  'unlock_received',
  'sub_received',
  'subscription_received',
];

const PAYOUT_TYPES = ['payout', 'payout_requested', 'payout_sent'];

function money(n: number) {
  return `£${Number(n || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function startOfWeekMonday(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function labelForType(type: string) {
  switch (type) {
    case 'tip_received':
      return 'Tip';
    case 'shop_pending':
      return 'Shop sale (pending)';
    case 'shop_received':
      return 'Shop sale';
    case 'call_received':
      return 'Voice call';
    case 'unlock_received':
      return 'Unlock';
    case 'sub_received':
    case 'subscription_received':
      return 'Subscription';
    case 'payout':
    case 'payout_requested':
      return 'Payout request';
    case 'payout_sent':
      return 'Payout sent';
    default:
      return type.replace(/_/g, ' ');
  }
}

function iconForType(type: string) {
  if (type.startsWith('tip')) return Heart;
  if (type.startsWith('shop')) return ShoppingBag;
  if (type.startsWith('call')) return Phone;
  if (type.startsWith('unlock')) return Lock;
  if (type.includes('sub')) return Heart;
  if (type.startsWith('payout')) return Wallet;
  return DollarSign;
}

function matchesFilter(type: string, filter: FilterKey) {
  if (filter === 'all') return true;
  if (filter === 'tips') return type === 'tip_received';
  if (filter === 'shop')
    return type === 'shop_pending' || type === 'shop_received';
  if (filter === 'calls') return type === 'call_received';
  if (filter === 'unlocks') return type === 'unlock_received';
  if (filter === 'subs')
    return type === 'sub_received' || type === 'subscription_received';
  if (filter === 'payouts') return PAYOUT_TYPES.includes(type);
  return true;
}

function inRange(iso: string, range: RangeKey) {
  if (range === 'all') return true;
  const t = new Date(iso).getTime();
  const now = Date.now();
  if (range === '7d') return t >= now - 7 * 24 * 60 * 60 * 1000;
  if (range === '30d') return t >= now - 30 * 24 * 60 * 60 * 1000;
  if (range === 'month') return t >= startOfMonth().getTime();
  return true;
}

export default function EarningsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [available, setAvailable] = useState(0);
  const [pending, setPending] = useState(0);
  const [txs, setTxs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [filter, setFilter] = useState<FilterKey>('all');
  const [range, setRange] = useState<RangeKey>('30d');
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState('');
  const [payoutErr, setPayoutErr] = useState('');
  const [showPayout, setShowPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');

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
      .select('balance_gbp, pending_gbp, account_type')
      .eq('id', user.id)
      .single();

    const creator = profile?.account_type === 'creator';
    setIsCreator(creator);
    setAvailable(Number(profile?.balance_gbp || 0));
    setPending(Number(profile?.pending_gbp || 0));

    if (!creator) {
      setLoading(false);
      return;
    }

    const { data: rows } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    setTxs(rows || []);

    const ids = Array.from(
      new Set(
        (rows || [])
          .map((r: any) => r.counterparty_id)
          .filter(Boolean) as string[]
      )
    );
    if (ids.length) {
      const { data: people } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', ids);
      const map: Record<string, any> = {};
      (people || []).forEach((p: any) => {
        map[p.id] = p;
      });
      setProfiles(map);
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await fetch('/api/wallet/payout', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setPayoutHistory(data.requests || []);
      }
    } catch {
      /* ignore */
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const weekStart = startOfWeekMonday().getTime();
  const monthStart = startOfMonth().getTime();

  const totals = useMemo(() => {
    let week = 0;
    let month = 0;
    let all = 0;
    for (const t of txs) {
      if (!EARNING_TYPES.includes(t.type)) continue;
      // Don't double-count shop: pending then received is same sale
      // Count shop_pending as earned for month/week/all; shop_received is release (no extra)
      if (t.type === 'shop_received') continue;
      const amt = Number(t.amount_gbp || 0);
      if (amt <= 0) continue;
      all += amt;
      const ts = new Date(t.created_at).getTime();
      if (ts >= weekStart) week += amt;
      if (ts >= monthStart) month += amt;
    }
    return { week, month, all };
  }, [txs, weekStart, monthStart]);

  const filtered = useMemo(() => {
    return txs.filter((t) => {
      if (!matchesFilter(t.type, filter)) return false;
      // Activity: show earnings + payouts, skip pure hold/spend types for creator
      const showTypes = [
        ...EARNING_TYPES,
        ...PAYOUT_TYPES,
        'shop_pending_reverse',
      ];
      if (filter === 'all' && !showTypes.includes(t.type)) return false;
      if (!inRange(t.created_at, range)) return false;
      return true;
    });
  }, [txs, filter, range]);

  const requestPayout = async () => {
    setPayoutLoading(true);
    setPayoutErr('');
    setPayoutMsg('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in again');

      const body: any = {};
      const n = Number(payoutAmount);
      if (payoutAmount && !Number.isNaN(n) && n > 0) body.amount = n;

      const res = await fetch('/api/wallet/payout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Payout failed');

      setPayoutMsg(data.message || 'Payout requested');
      if (typeof data.balance === 'number') setAvailable(data.balance);
      if (data.payout) {
        setPayoutHistory((prev) => [data.payout, ...prev]);
      }
      setShowPayout(false);
      setPayoutAmount('');
    } catch (e: any) {
      setPayoutErr(e.message || 'Payout failed');
    } finally {
      setPayoutLoading(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-pink-500" size={28} />
          </main>
        </div>
      </AuthGuard>
    );
  }

  if (!isCreator) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-950 text-white flex">
          <Sidebar />
          <main className="flex-1 p-6 max-w-2xl mx-auto">
            <Link
              href="/account"
              className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6"
            >
              <ArrowLeft size={18} /> Back
            </Link>
            <h1 className="text-2xl font-bold mb-2">Earnings</h1>
            <p className="text-zinc-400">
              Earnings are for creator accounts. Switch to a creator account to
              track tips, sales and payouts.
            </p>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-10">
          <div className="p-4 lg:p-8 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <Link
                  href="/account"
                  className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-3"
                >
                  <ArrowLeft size={16} /> My Account
                </Link>
                <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-3">
                  <TrendingUp className="text-pink-500" size={28} />
                  Earnings
                </h1>
                <p className="text-zinc-500 text-sm mt-1">
                  Tips, sales, calls and payouts — all in one place
                </p>
              </div>
              <button
                type="button"
                disabled={available < 150}
                onClick={() => {
                  setPayoutErr('');
                  setPayoutMsg('');
                  setPayoutAmount(available >= 150 ? available.toFixed(2) : '');
                  setShowPayout(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95 transition"
              >
                Request payout
              </button>
            </div>

            {payoutMsg && (
              <div className="mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm px-4 py-3">
                {payoutMsg}
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 lg:p-5">
                <p className="text-xs text-zinc-500 flex items-center gap-1.5 mb-2">
                  <Wallet size={14} className="text-pink-400" /> Available
                </p>
                <p className="text-xl lg:text-2xl font-bold text-white">
                  {money(available)}
                </p>
                <p className="text-[11px] text-zinc-600 mt-1">Can withdraw</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 lg:p-5">
                <p className="text-xs text-zinc-500 flex items-center gap-1.5 mb-2">
                  <Clock size={14} className="text-amber-400" /> Pending
                </p>
                <p className="text-xl lg:text-2xl font-bold text-amber-300">
                  {money(pending)}
                </p>
                <p className="text-[11px] text-zinc-600 mt-1">Shop escrow</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 lg:p-5">
                <p className="text-xs text-zinc-500 flex items-center gap-1.5 mb-2">
                  <Calendar size={14} /> This week
                </p>
                <p className="text-xl lg:text-2xl font-bold">{money(totals.week)}</p>
                <p className="text-[11px] text-zinc-600 mt-1">Mon – today</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 lg:p-5">
                <p className="text-xs text-zinc-500 flex items-center gap-1.5 mb-2">
                  <TrendingUp size={14} className="text-pink-400" /> This month
                </p>
                <p className="text-xl lg:text-2xl font-bold">
                  {money(totals.month)}
                </p>
                <p className="text-[11px] text-zinc-600 mt-1">Calendar month</p>
              </div>
              <div className="bg-zinc-900 border border-pink-500/20 rounded-2xl p-4 lg:p-5 col-span-2 lg:col-span-1">
                <p className="text-xs text-zinc-500 flex items-center gap-1.5 mb-2">
                  <DollarSign size={14} className="text-pink-400" /> All time
                </p>
                <p className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
                  {money(totals.all)}
                </p>
                <p className="text-[11px] text-zinc-600 mt-1">Lifetime earnings</p>
              </div>
            </div>

            <p className="text-xs text-zinc-500 mb-6">
              You keep 100% until payout. Platform fee is 20% on withdrawal only.
              Min payout £150 · processed Mondays.
            </p>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <Filter size={16} className="text-zinc-500 flex-shrink-0" />
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                      filter === f.key
                        ? 'bg-pink-600 text-white'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value as RangeKey)}
                  className="appearance-none bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 pl-3 pr-9 py-2 outline-none focus:border-pink-500"
                >
                  {RANGES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                />
              </div>
            </div>

            {/* Activity */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-8">
              <div className="px-5 py-4 border-b border-zinc-800">
                <h2 className="font-semibold">Activity</h2>
              </div>
              {filtered.length === 0 ? (
                <div className="px-5 py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="text-zinc-600" size={24} />
                  </div>
                  <p className="text-zinc-300 font-medium">No earnings yet</p>
                  <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">
                    Tips, shop sales, unlocks and calls will show here as fans
                    pay you.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mt-5">
                    <Link
                      href="/discover/create"
                      className="text-sm px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                    >
                      Create a post
                    </Link>
                    <Link
                      href="/dashboard"
                      className="text-sm px-4 py-2 rounded-xl bg-pink-600/20 text-pink-300 hover:bg-pink-600/30"
                    >
                      Open dashboard
                    </Link>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-zinc-800/80">
                  {filtered.map((t) => {
                    const Icon = iconForType(t.type);
                    const person = t.counterparty_id
                      ? profiles[t.counterparty_id]
                      : null;
                    const name =
                      person?.display_name ||
                      (person?.username ? `@${person.username}` : null);
                    const amt = Number(t.amount_gbp || 0);
                    const positive = amt > 0;
                    return (
                      <li
                        key={t.id}
                        className="px-4 sm:px-5 py-3.5 flex items-center gap-3 hover:bg-zinc-800/40 transition"
                      >
                        <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {person?.avatar_url ? (
                            <img
                              src={person.avatar_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Icon size={18} className="text-pink-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-100 truncate">
                            {labelForType(t.type)}
                            {name ? (
                              <span className="text-zinc-400 font-normal">
                                {' '}
                                · {name}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">
                            {t.description ||
                              new Date(t.created_at).toLocaleString(undefined, {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p
                            className={`text-sm font-semibold ${
                              positive ? 'text-emerald-400' : 'text-zinc-300'
                            }`}
                          >
                            {positive ? '+' : ''}
                            {money(amt)}
                          </p>
                          <p className="text-[11px] text-zinc-600">
                            {new Date(t.created_at).toLocaleDateString(
                              undefined,
                              { day: 'numeric', month: 'short' }
                            )}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Payout history */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="font-semibold">Payout history</h2>
                <span className="text-xs text-zinc-500">Min £150 · Mondays</span>
              </div>
              {payoutHistory.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-zinc-500">
                  No payout requests yet
                </div>
              ) : (
                <ul className="divide-y divide-zinc-800/80">
                  {payoutHistory.map((p: any) => (
                    <li
                      key={p.id}
                      className="px-5 py-3.5 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {money(Number(p.amount_gbp || p.amount || 0))}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {p.scheduled_for || p.created_at
                            ? new Date(
                                p.scheduled_for || p.created_at
                              ).toLocaleDateString(undefined, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
                          p.status === 'paid' || p.status === 'completed'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : p.status === 'failed'
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {p.status || 'pending'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </main>

        {/* Payout modal */}
        {showPayout && (
          <div className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h3 className="text-lg font-semibold mb-1">Request payout</h3>
              <p className="text-sm text-zinc-400 mb-4">
                Available {money(available)}. Min £150. 20% platform fee on
                withdrawal. Paid on Mondays.
              </p>
              <label className="text-xs text-zinc-500 block mb-1.5">
                Amount (GBP)
              </label>
              <input
                type="number"
                min={150}
                step="0.01"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:border-pink-500 mb-4"
              />
              {payoutErr && (
                <p className="text-sm text-red-400 mb-3">{payoutErr}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPayout(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={payoutLoading}
                  onClick={requestPayout}
                  className="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 font-medium disabled:opacity-50"
                >
                  {payoutLoading ? 'Requesting…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
