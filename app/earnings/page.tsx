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
  Download,
  Package,
  Target,
  Sparkles,
  Pencil,
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
  'clip_received',
  'sub_received',
  'subscription_received',
];

const PAYOUT_TYPES = ['payout', 'payout_requested', 'payout_sent'];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GOAL_PRESETS = [100, 250, 500, 1000, 2500];

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

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function labelForType(type: string) {
  switch (type) {
    case 'tip_received':
      return 'Tip';
    case 'shop_pending':
      return 'Shop sale (pending)';
    case 'shop_received':
      return 'Shop sale released';
    case 'call_received':
      return 'Voice call';
    case 'unlock_received':
      return 'Unlock';
    case 'clip_received':
      return 'Clip sale';
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

function csvEscape(v: string) {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function isCountableEarning(type: string) {
  return EARNING_TYPES.includes(type) && type !== 'shop_received';
}

export default function EarningsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [available, setAvailable] = useState(0);
  const [pending, setPending] = useState(0);
  const [txs, setTxs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [range, setRange] = useState<RangeKey>('30d');
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState('');
  const [payoutErr, setPayoutErr] = useState('');
  const [showPayout, setShowPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');

  // Phase 3 — monthly goal
  const [goalGbp, setGoalGbp] = useState(0);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalMsg, setGoalMsg] = useState('');

  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setUserId(user.id);

    const { data: profile } = await supabase
      .from('profiles')
      .select('balance_gbp, pending_gbp, account_type, earnings_goal_gbp')
      .eq('id', user.id)
      .single();

    const creator = profile?.account_type === 'creator';
    setIsCreator(creator);
    setAvailable(Number(profile?.balance_gbp || 0));
    setPending(Number(profile?.pending_gbp || 0));

    // Goal from DB, fallback localStorage
    let g = Number(profile?.earnings_goal_gbp || 0);
    if (!g && typeof window !== 'undefined') {
      const ls = localStorage.getItem(`wod_earnings_goal_${user.id}`);
      if (ls) g = Number(ls) || 0;
    }
    setGoalGbp(g);

    if (!creator) {
      setLoading(false);
      return;
    }

    const { data: rows } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300);

    setTxs(rows || []);

    const ids = Array.from(
      new Set(
        (rows || [])
          .map((r: any) => r.counterparty_id)
          .filter(Boolean) as string[]
      )
    );

    const { data: orders } = await supabase
      .from('shop_orders')
      .select(
        'id, item_title, item_price, funds_status, status, buyer_id, created_at, paid_at'
      )
      .eq('creator_id', user.id)
      .eq('funds_status', 'pending_creator')
      .order('paid_at', { ascending: false })
      .limit(20);

    setPendingOrders(orders || []);

    const buyerIds = (orders || [])
      .map((o: any) => o.buyer_id)
      .filter(Boolean) as string[];
    const allIds = Array.from(new Set([...ids, ...buyerIds]));

    if (allIds.length) {
      const { data: people } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', allIds);
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
      if (!isCountableEarning(t.type)) continue;
      const amt = Number(t.amount_gbp || 0);
      if (amt <= 0) continue;
      all += amt;
      const ts = new Date(t.created_at).getTime();
      if (ts >= weekStart) week += amt;
      if (ts >= monthStart) month += amt;
    }
    return { week, month, all };
  }, [txs, weekStart, monthStart]);

  const goalProgress = useMemo(() => {
    if (goalGbp <= 0) return 0;
    return Math.min(100, Math.round((totals.month / goalGbp) * 100));
  }, [goalGbp, totals.month]);

  const goalReached = goalGbp > 0 && totals.month >= goalGbp;

  const breakdown = useMemo(() => {
    const buckets: Record<
      string,
      { key: string; label: string; amount: number; count: number }
    > = {
      tips: { key: 'tips', label: 'Tips', amount: 0, count: 0 },
      shop: { key: 'shop', label: 'Shop sales', amount: 0, count: 0 },
      calls: { key: 'calls', label: 'Voice calls', amount: 0, count: 0 },
      unlocks: { key: 'unlocks', label: 'Unlocks', amount: 0, count: 0 },
      subs: { key: 'subs', label: 'Subscriptions', amount: 0, count: 0 },
    };

    for (const t of txs) {
      if (t.type === 'shop_received') continue;
      const amt = Number(t.amount_gbp || 0);
      if (amt <= 0) continue;
      if (t.type === 'tip_received') {
        buckets.tips.amount += amt;
        buckets.tips.count += 1;
      } else if (t.type === 'shop_pending') {
        buckets.shop.amount += amt;
        buckets.shop.count += 1;
      } else if (t.type === 'call_received') {
        buckets.calls.amount += amt;
        buckets.calls.count += 1;
      } else if (t.type === 'unlock_received') {
        buckets.unlocks.amount += amt;
        buckets.unlocks.count += 1;
      } else if (
        t.type === 'sub_received' ||
        t.type === 'subscription_received'
      ) {
        buckets.subs.amount += amt;
        buckets.subs.count += 1;
      }
    }

    const list = Object.values(buckets).filter(
      (b) => b.count > 0 || b.amount > 0
    );
    const total = list.reduce((s, b) => s + b.amount, 0) || 1;
    return list
      .map((b) => ({
        ...b,
        pct: Math.round((b.amount / total) * 100),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [txs]);

  const chartDays = useMemo(() => {
    const days: { key: string; label: string; amount: number }[] = [];
    const map: Record<string, number> = {};
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = dayKey(d);
      map[key] = 0;
      days.push({
        key,
        label: d.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        }),
        amount: 0,
      });
    }

    for (const t of txs) {
      if (!isCountableEarning(t.type)) continue;
      const amt = Number(t.amount_gbp || 0);
      if (amt <= 0) continue;
      const key = dayKey(new Date(t.created_at));
      if (key in map) map[key] += amt;
    }

    return days.map((d) => ({ ...d, amount: map[d.key] || 0 }));
  }, [txs]);

  const chartMax = useMemo(
    () => Math.max(1, ...chartDays.map((d) => d.amount)),
    [chartDays]
  );

  /** Best day of week + best hour (all-time countable earnings) */
  const insights = useMemo(() => {
    const byDay = Array(7).fill(0) as number[];
    const byHour = Array(24).fill(0) as number[];

    for (const t of txs) {
      if (!isCountableEarning(t.type)) continue;
      const amt = Number(t.amount_gbp || 0);
      if (amt <= 0) continue;
      const d = new Date(t.created_at);
      byDay[d.getDay()] += amt;
      byHour[d.getHours()] += amt;
    }

    let bestDayIdx = 0;
    let bestHourIdx = 0;
    for (let i = 1; i < 7; i++) if (byDay[i] > byDay[bestDayIdx]) bestDayIdx = i;
    for (let i = 1; i < 24; i++)
      if (byHour[i] > byHour[bestHourIdx]) bestHourIdx = i;

    const dayMax = Math.max(...byDay, 1);
    const hourMax = Math.max(...byHour, 1);
    const hasData = byDay.some((v) => v > 0);

    const hourLabel = (h: number) => {
      const ampm = h >= 12 ? 'pm' : 'am';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}${ampm}`;
    };

    return {
      hasData,
      bestDay: DAY_NAMES[bestDayIdx],
      bestDayAmount: byDay[bestDayIdx],
      bestHour: hourLabel(bestHourIdx),
      bestHourAmount: byHour[bestHourIdx],
      byDay: DAY_NAMES.map((name, i) => ({
        name,
        amount: byDay[i],
        pct: Math.round((byDay[i] / dayMax) * 100),
      })),
      byHourTop: [0, 1, 2, 3, 4, 5]
        .map(() => 0)
        .map((_, rank) => {
          const sorted = byHour
            .map((amount, hour) => ({ hour, amount }))
            .sort((a, b) => b.amount - a.amount);
          return sorted[rank];
        })
        .filter((x) => x && x.amount > 0)
        .slice(0, 5)
        .map((x) => ({
          label: hourLabel(x.hour),
          amount: x.amount,
          pct: Math.round((x.amount / hourMax) * 100),
        })),
    };
  }, [txs]);

  const filtered = useMemo(() => {
    return txs.filter((t) => {
      if (!matchesFilter(t.type, filter)) return false;
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

  const saveGoal = async () => {
    const n = Math.max(0, Math.round(Number(goalDraft) * 100) / 100);
    if (Number.isNaN(n) || n < 0) {
      setGoalMsg('Enter a valid amount');
      return;
    }
    setGoalSaving(true);
    setGoalMsg('');
    try {
      if (userId) {
        localStorage.setItem(`wod_earnings_goal_${userId}`, String(n));
        const { error } = await supabase
          .from('profiles')
          .update({ earnings_goal_gbp: n })
          .eq('id', userId);
        // Column may not exist yet — localStorage still works
        if (error && !String(error.message || '').includes('earnings_goal')) {
          console.warn(error.message);
        }
      }
      setGoalGbp(n);
      setShowGoalModal(false);
      setGoalMsg(n > 0 ? 'Goal saved' : 'Goal cleared');
      setTimeout(() => setGoalMsg(''), 2500);
    } catch (e: any) {
      setGoalMsg(e.message || 'Could not save goal');
    } finally {
      setGoalSaving(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Date', 'Type', 'Description', 'From', 'Amount GBP'].join(','),
    ];
    for (const t of txs) {
      if (!EARNING_TYPES.includes(t.type) && !PAYOUT_TYPES.includes(t.type))
        continue;
      if (t.type === 'shop_received') continue;
      const person = t.counterparty_id ? profiles[t.counterparty_id] : null;
      const from =
        person?.display_name ||
        (person?.username ? `@${person.username}` : '');
      rows.push(
        [
          csvEscape(new Date(t.created_at).toISOString()),
          csvEscape(labelForType(t.type)),
          csvEscape(String(t.description || '')),
          csvEscape(from),
          Number(t.amount_gbp || 0).toFixed(2),
        ].join(',')
      );
    }
    const blob = new Blob([rows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `world-of-dommes-earnings-${dayKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const monthName = new Date().toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

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
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  className="px-4 py-2.5 rounded-xl border border-zinc-700 text-sm font-medium hover:bg-zinc-800 transition inline-flex items-center gap-2"
                >
                  <Download size={16} /> Export CSV
                </button>
                <button
                  type="button"
                  disabled={available < 150}
                  onClick={() => {
                    setPayoutErr('');
                    setPayoutMsg('');
                    setPayoutAmount(
                      available >= 150 ? available.toFixed(2) : ''
                    );
                    setShowPayout(true);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95 transition"
                >
                  Request payout
                </button>
              </div>
            </div>

            {(payoutMsg || goalMsg) && (
              <div className="mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm px-4 py-3">
                {payoutMsg || goalMsg}
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
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
                <p className="text-xl lg:text-2xl font-bold">
                  {money(totals.week)}
                </p>
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

            {/* Monthly goal */}
            <div
              className={`rounded-2xl p-5 mb-6 border ${
                goalReached
                  ? 'bg-gradient-to-br from-pink-600/20 to-rose-600/10 border-pink-500/40'
                  : 'bg-zinc-900 border-zinc-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Target
                    size={18}
                    className={goalReached ? 'text-pink-300' : 'text-pink-400'}
                  />
                  <div>
                    <h2 className="font-semibold">
                      {monthName} goal
                      {goalReached && (
                        <span className="ml-2 text-xs font-medium text-pink-300">
                          Reached ✨
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {goalGbp > 0
                        ? `${money(totals.month)} of ${money(goalGbp)}`
                        : 'Set a target to track this month'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setGoalDraft(goalGbp > 0 ? String(goalGbp) : '500');
                    setShowGoalModal(true);
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 inline-flex items-center gap-1.5"
                >
                  <Pencil size={12} />
                  {goalGbp > 0 ? 'Edit' : 'Set goal'}
                </button>
              </div>
              {goalGbp > 0 ? (
                <>
                  <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        goalReached
                          ? 'bg-gradient-to-r from-pink-400 to-rose-400'
                          : 'bg-gradient-to-r from-pink-600 to-rose-500'
                      }`}
                      style={{ width: `${goalProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-zinc-500">
                    <span>{goalProgress}%</span>
                    <span>
                      {goalReached
                        ? `${money(totals.month - goalGbp)} over goal`
                        : `${money(Math.max(0, goalGbp - totals.month))} to go`}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-zinc-500">
                  Creators who set a monthly goal earn more on average — pick a
                  number that stretches you a little.
                </p>
              )}
            </div>

            <p className="text-xs text-zinc-500 mb-6">
              You keep 100% until payout. Platform fee is 20% on withdrawal only.
              Min payout £150 · processed Mondays.
            </p>

            {/* Insights: best day / hour */}
            {insights.hasData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={16} className="text-pink-400" />
                    <h2 className="font-semibold text-sm">Best day of week</h2>
                  </div>
                  <p className="text-2xl font-bold mb-1">{insights.bestDay}</p>
                  <p className="text-xs text-zinc-500 mb-4">
                    {money(insights.bestDayAmount)} all-time on this day
                  </p>
                  <div className="flex items-end gap-1.5 h-20">
                    {insights.byDay.map((d) => (
                      <div
                        key={d.name}
                        className="flex-1 flex flex-col items-center gap-1"
                      >
                        <div
                          className={`w-full rounded-t-sm ${
                            d.name === insights.bestDay
                              ? 'bg-pink-500'
                              : 'bg-zinc-700'
                          }`}
                          style={{
                            height: `${Math.max(d.pct, d.amount > 0 ? 8 : 4)}%`,
                            minHeight: d.amount > 0 ? 6 : 3,
                          }}
                          title={`${d.name}: ${money(d.amount)}`}
                        />
                        <span className="text-[9px] text-zinc-600">{d.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock size={16} className="text-pink-400" />
                    <h2 className="font-semibold text-sm">Best hours</h2>
                  </div>
                  <p className="text-2xl font-bold mb-1">{insights.bestHour}</p>
                  <p className="text-xs text-zinc-500 mb-4">
                    Peak earning hour · {money(insights.bestHourAmount)} all-time
                  </p>
                  {insights.byHourTop.length === 0 ? (
                    <p className="text-sm text-zinc-500">Not enough data yet</p>
                  ) : (
                    <div className="space-y-2">
                      {insights.byHourTop.map((h) => (
                        <div key={h.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-zinc-300">{h.label}</span>
                            <span className="text-zinc-400">
                              {money(h.amount)}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-pink-600"
                              style={{ width: `${Math.max(h.pct, 6)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 30-day chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Last 30 days</h2>
                <span className="text-xs text-zinc-500">
                  Peak{' '}
                  {money(
                    chartMax === 1 && chartDays.every((d) => d.amount === 0)
                      ? 0
                      : chartMax
                  )}
                </span>
              </div>
              <div className="flex items-end gap-[3px] sm:gap-1 h-32">
                {chartDays.map((d) => {
                  const h =
                    d.amount <= 0
                      ? 4
                      : Math.max(8, Math.round((d.amount / chartMax) * 100));
                  return (
                    <div
                      key={d.key}
                      className="flex-1 flex flex-col items-center justify-end h-full group relative"
                    >
                      <div
                        className="w-full rounded-t-sm bg-gradient-to-t from-pink-700 to-pink-400 opacity-90 group-hover:opacity-100 transition-all"
                        style={{ height: `${h}%` }}
                        title={`${d.label}: ${money(d.amount)}`}
                      />
                      <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-zinc-800 text-[10px] text-white px-2 py-1 rounded-md whitespace-nowrap z-10 border border-zinc-700">
                        {d.label}: {money(d.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-zinc-600">
                <span>{chartDays[0]?.label}</span>
                <span>{chartDays[chartDays.length - 1]?.label}</span>
              </div>
            </div>

            {/* Breakdown by type */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
              <h2 className="font-semibold mb-4">Breakdown by type</h2>
              {breakdown.length === 0 ? (
                <p className="text-sm text-zinc-500 py-4 text-center">
                  No earnings to break down yet
                </p>
              ) : (
                <div className="space-y-4">
                  {breakdown.map((b) => (
                    <div key={b.key}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-zinc-200 font-medium">
                          {b.label}
                          <span className="text-zinc-500 font-normal ml-2">
                            {b.count}×
                          </span>
                        </span>
                        <span className="text-zinc-100 font-semibold">
                          {money(b.amount)}
                          <span className="text-zinc-500 font-normal ml-2 text-xs">
                            {b.pct}%
                          </span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-pink-600 to-rose-500"
                          style={{
                            width: `${Math.max(b.pct, b.amount > 0 ? 4 : 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Shop pending escrow */}
            {pendingOrders.length > 0 && (
              <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl overflow-hidden mb-6">
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
                  <Package size={18} className="text-amber-400" />
                  <h2 className="font-semibold">Shop escrow pending</h2>
                  <span className="text-xs text-amber-400/80 ml-auto">
                    Released when buyer confirms receipt
                  </span>
                </div>
                <ul className="divide-y divide-zinc-800/80">
                  {pendingOrders.map((o) => {
                    const buyer = o.buyer_id ? profiles[o.buyer_id] : null;
                    const name =
                      buyer?.display_name ||
                      (buyer?.username ? `@${buyer.username}` : 'Buyer');
                    return (
                      <li
                        key={o.id}
                        className="px-5 py-3.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {o.item_title}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {name} · waiting for confirmation
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-amber-300 flex-shrink-0">
                          {money(Number(o.item_price || 0))}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

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

        {/* Goal modal */}
        {showGoalModal && (
          <div className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
              <h3 className="text-lg font-semibold mb-1">Monthly earnings goal</h3>
              <p className="text-sm text-zinc-400 mb-4">
                Track progress for {monthName}. You can change this anytime.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {GOAL_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setGoalDraft(String(p))}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                      goalDraft === String(p)
                        ? 'bg-pink-600 border-pink-500 text-white'
                        : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                    }`}
                  >
                    £{p.toLocaleString()}
                  </button>
                ))}
              </div>
              <label className="text-xs text-zinc-500 block mb-1.5">
                Custom amount (GBP)
              </label>
              <input
                type="number"
                min={0}
                step="1"
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 outline-none focus:border-pink-500 mb-4"
                placeholder="e.g. 500"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setGoalDraft('0');
                    setTimeout(() => saveGoal(), 0);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-700 text-sm text-zinc-400 hover:bg-zinc-800"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setShowGoalModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={goalSaving}
                  onClick={saveGoal}
                  className="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 font-medium disabled:opacity-50"
                >
                  {goalSaving ? 'Saving…' : 'Save goal'}
                </button>
              </div>
            </div>
          </div>
        )}

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
