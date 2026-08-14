'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Loader2,
  RefreshCw,
  Crown,
  Medal,
  Users,
  TrendingUp,
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { createClient } from '../../lib/supabase';

type Period = '24h' | '7d' | '30d';

type RankRow = {
  userId: string;
  total: number;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  followers: number;
  rank: number;
};

const PERIODS: { key: Period; label: string }[] = [
  { key: '24h', label: '24 Hours' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
];

/** Creator income types — same spirit as Earnings (no top-ups / payouts) */
const EARNING_TYPES = [
  'tip_received',
  'clip_received',
  'unlock_received',
  'call_received',
  'shop_pending',
  'sub_received',
  'subscription_received',
];

function money(n: number) {
  return `£${Number(n || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function periodStart(period: Period): Date {
  const d = new Date();
  if (period === '24h') d.setTime(d.getTime() - 24 * 60 * 60 * 1000);
  else if (period === '7d') d.setTime(d.getTime() - 7 * 24 * 60 * 60 * 1000);
  else d.setTime(d.getTime() - 30 * 24 * 60 * 60 * 1000);
  return d;
}

function initialOf(name: string) {
  return (name || '?').charAt(0).toUpperCase();
}

export default function LeaderboardPage() {
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>('24h');
  const [rows, setRows] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myIsCreator, setMyIsCreator] = useState(false);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (opts?.soft) setRefreshing(true);
      else setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setMyUserId(user?.id || null);

        if (user) {
          const { data: me } = await supabase
            .from('profiles')
            .select('account_type')
            .eq('id', user.id)
            .single();
          setMyIsCreator(me?.account_type === 'creator');
        } else {
          setMyIsCreator(false);
        }

        const since = periodStart(period).toISOString();

        // Pull earning rows in window (cap for safety — enough for top 30)
        const { data: txs, error } = await supabase
          .from('wallet_transactions')
          .select('user_id, amount_gbp, type, created_at')
          .in('type', EARNING_TYPES)
          .gte('created_at', since)
          .gt('amount_gbp', 0)
          .limit(5000);

        if (error) {
          console.error('leaderboard txs', error);
          setRows([]);
          return;
        }

        const totals = new Map<string, number>();
        for (const t of txs || []) {
          const id = t.user_id as string;
          if (!id) continue;
          const amt = Number(t.amount_gbp || 0);
          if (amt <= 0) continue;
          totals.set(id, (totals.get(id) || 0) + amt);
        }

        const sortedIds = [...totals.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([id]) => id);

        if (sortedIds.length === 0) {
          setRows([]);
          setLastUpdated(new Date());
          return;
        }

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, account_type')
          .in('id', sortedIds);

        const profileMap = new Map(
          (profiles || []).map((p: any) => [p.id, p])
        );

        // Follower counts for ranked creators
        const followerMap = new Map<string, number>();
        await Promise.all(
          sortedIds.map(async (id) => {
            const { count } = await supabase
              .from('follows')
              .select('*', { count: 'exact', head: true })
              .eq('following_id', id);
            followerMap.set(id, count || 0);
          })
        );

        const ranked: RankRow[] = sortedIds.map((id, i) => {
          const p = profileMap.get(id);
          const name =
            p?.display_name ||
            (p?.username ? `@${p.username}` : 'Creator');
          return {
            userId: id,
            total: Math.round((totals.get(id) || 0) * 100) / 100,
            username: p?.username || null,
            displayName: name,
            avatarUrl: p?.avatar_url || null,
            followers: followerMap.get(id) || 0,
            rank: i + 1,
          };
        });

        setRows(ranked);
        setLastUpdated(new Date());
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [period, supabase]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Soft auto-refresh every 45s
  useEffect(() => {
    const t = setInterval(() => load({ soft: true }), 45_000);
    return () => clearInterval(t);
  }, [load]);

  const top3 = useMemo(() => rows.slice(0, 3), [rows]);
  const rest = useMemo(() => rows.slice(3), [rows]);

  // Podium order visual: 2 | 1 | 3
  const podium = useMemo(() => {
    const first = top3[0] || null;
    const second = top3[1] || null;
    const third = top3[2] || null;
    return [
      { place: 2 as const, row: second },
      { place: 1 as const, row: first },
      { place: 3 as const, row: third },
    ];
  }, [top3]);

  const myRank = useMemo(() => {
    if (!myUserId || !myIsCreator) return null;
    const found = rows.find((r) => r.userId === myUserId);
    if (found) return found;
    return null;
  }, [myUserId, myIsCreator, rows]);

  const periodLabel =
    PERIODS.find((p) => p.key === period)?.label || period;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-24 lg:pb-10">
        <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/20">
                  <Trophy size={22} className="text-white" />
                </span>
                Leaderboard
              </h1>
              <p className="text-zinc-500 text-sm mt-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Updates live
                </span>
                <span className="text-zinc-700">·</span>
                Top creators by earnings
                {lastUpdated && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-600">
                      {lastUpdated.toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => load({ soft: true })}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 hover:border-pink-500/40 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshing ? 'animate-spin text-pink-400' : ''}
              />
              Refresh
            </button>
          </div>

          {/* Period tabs */}
          <div className="flex flex-wrap gap-2 mb-8">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition ${
                  period === p.key
                    ? 'bg-gradient-to-r from-pink-600 to-rose-500 text-white shadow-lg shadow-pink-500/25'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Your rank (creators) */}
          {myIsCreator && myUserId && (
            <div className="mb-8 rounded-2xl border border-pink-500/25 bg-gradient-to-r from-pink-600/10 via-zinc-900 to-zinc-900 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center">
                  <TrendingUp size={18} className="text-pink-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Your rank</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {periodLabel} · all creator income
                  </p>
                </div>
              </div>
              {loading ? (
                <Loader2 size={18} className="animate-spin text-pink-400" />
              ) : myRank ? (
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">
                      #{myRank.rank}
                    </p>
                    <p className="text-xs text-zinc-500">of top 30</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-pink-400 tabular-nums">
                      {money(myRank.total)}
                    </p>
                    <p className="text-xs text-zinc-500">earned</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">
                  Not in top 30 yet — keep earning to climb
                </p>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
              <Loader2 size={32} className="animate-spin text-pink-500 mb-4" />
              <p className="text-sm">Loading rankings…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <Trophy size={28} className="text-zinc-600" />
              </div>
              <h2 className="text-lg font-semibold mb-2">No earnings yet</h2>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                When creators earn tips, clip sales, unlocks, calls or shop
                sales in this period, they’ll appear here ranked by total.
              </p>
            </div>
          ) : (
            <>
              {/* Podium — visual order 2 | 1 | 3 */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end mb-10">
                {podium.map(({ place, row }) => {
                  if (!row) {
                    return (
                      <div
                        key={place}
                        className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4 min-h-[140px] opacity-40"
                      />
                    );
                  }
                  const isFirst = place === 1;
                  const medal =
                    place === 1
                      ? 'bg-amber-400 text-zinc-950'
                      : place === 2
                        ? 'bg-zinc-300 text-zinc-900'
                        : 'bg-orange-500 text-white';
                  const ring =
                    place === 1
                      ? 'ring-2 ring-amber-400/60'
                      : place === 2
                        ? 'ring-1 ring-zinc-400/40'
                        : 'ring-1 ring-orange-500/40';

                  return (
                    <Link
                      key={row.userId}
                      href={row.username ? `/${row.username}` : '/leaderboard'}
                      className={`relative rounded-2xl border text-center transition hover:border-pink-500/40 ${
                        isFirst
                          ? 'border-pink-500/30 bg-gradient-to-b from-pink-600/15 to-zinc-900 p-5 sm:p-6 -mb-1 shadow-xl shadow-pink-500/10'
                          : 'border-zinc-800 bg-zinc-900 p-4 sm:p-5'
                      }`}
                    >
                      {isFirst && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <Crown
                            size={20}
                            className="text-amber-400 drop-shadow"
                          />
                        </div>
                      )}
                      <div
                        className={`mx-auto mb-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${medal}`}
                      >
                        {place}
                      </div>
                      <div
                        className={`mx-auto mb-3 rounded-full overflow-hidden bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center font-bold ${ring} ${
                          isFirst ? 'w-16 h-16 sm:w-20 sm:h-20 text-xl' : 'w-12 h-12 sm:w-14 sm:h-14 text-base'
                        }`}
                      >
                        {row.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.avatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          initialOf(row.displayName)
                        )}
                      </div>
                      <p
                        className={`font-semibold truncate px-1 ${
                          isFirst ? 'text-base sm:text-lg' : 'text-sm'
                        }`}
                      >
                        {row.displayName}
                      </p>
                      {row.username && (
                        <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                          @{row.username}
                        </p>
                      )}
                      <p
                        className={`font-bold text-pink-400 tabular-nums mt-2 ${
                          isFirst ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'
                        }`}
                      >
                        {money(row.total)}
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-1 flex items-center justify-center gap-1">
                        <Users size={10} />
                        {formatFollowers(row.followers)} followers
                      </p>
                    </Link>
                  );
                })}
              </div>

              {/* Ranks 4–30 */}
              {rest.length > 0 && (
                <div className="space-y-2">
                  {rest.map((row) => {
                    const isMe = myUserId === row.userId;
                    return (
                      <Link
                        key={row.userId}
                        href={
                          row.username ? `/${row.username}` : '/leaderboard'
                        }
                        className={`flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 rounded-2xl border transition ${
                          isMe
                            ? 'border-pink-500/40 bg-pink-500/10'
                            : 'border-zinc-800/80 bg-zinc-900/80 hover:border-zinc-700 hover:bg-zinc-900'
                        }`}
                      >
                        <span className="w-7 text-center text-sm font-semibold text-zinc-500 tabular-nums">
                          {row.rank}
                        </span>
                        <div className="w-11 h-11 rounded-full overflow-hidden bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {row.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.avatarUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            initialOf(row.displayName)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-sm sm:text-base">
                            {row.displayName}
                            {isMe && (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-pink-400">
                                You
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-zinc-500 truncate mt-0.5 flex items-center gap-1.5">
                            {row.username ? `@${row.username}` : 'Creator'}
                            <span className="text-zinc-700">·</span>
                            <Users size={11} className="inline opacity-70" />
                            {formatFollowers(row.followers)} followers
                          </p>
                        </div>
                        <span className="text-sm sm:text-base font-semibold text-pink-400 tabular-nums flex-shrink-0">
                          {money(row.total)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}

              <p className="text-center text-[11px] text-zinc-600 mt-8">
                Ranked by tips, clips, unlocks, calls, shop & subscriptions ·{' '}
                {periodLabel.toLowerCase()} · top 30
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
