'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Phone, Star } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

type CallRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  status: string;
  rate_per_minute: number;
  min_minutes: number;
  max_minutes?: number;
  amount_held?: number;
  amount_charged?: number;
  duration_seconds?: number;
  rating?: number | null;
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
};

export default function CallHistoryPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);

  useEffect(() => {
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
        .select('account_type')
        .eq('id', user.id)
        .single();
      const creator = profile?.account_type === 'creator';
      setIsCreator(creator);

      const { data: rows, error } = await supabase
        .from('voice_calls')
        .select('*')
        .or(`creator_id.eq.${user.id},subscriber_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error || !rows) {
        setCalls([]);
        setLoading(false);
        return;
      }

      const otherIds = Array.from(
        new Set(
          rows.map((c: CallRow) =>
            c.creator_id === user.id ? c.subscriber_id : c.creator_id
          )
        )
      );

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', otherIds);

      const map: Record<string, any> = {};
      (profiles || []).forEach((p) => {
        map[p.id] = p;
      });

      let earned = 0;
      let spent = 0;
      const enriched = rows.map((c: CallRow) => {
        const otherId = c.creator_id === user.id ? c.subscriber_id : c.creator_id;
        const charged = Number(c.amount_charged || 0);
        if (c.creator_id === user.id && charged > 0) earned += charged;
        if (c.subscriber_id === user.id && charged > 0) spent += charged;
        return {
          ...c,
          other: map[otherId] || null,
        };
      });

      setTotalEarned(Math.round(earned * 100) / 100);
      setTotalSpent(Math.round(spent * 100) / 100);
      setCalls(enriched);
      setLoading(false);
    };
    load();
  }, []);

  const formatDuration = (secs?: number) => {
    if (!secs || secs < 1) return '—';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'ended':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'declined':
        return 'Declined';
      case 'cancelled':
        return 'Cancelled';
      case 'active':
        return 'In progress';
      case 'requested':
      case 'ringing':
        return 'Missed';
      default:
        return status;
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="lg:hidden sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
            <Link href="/dashboard" className="text-zinc-400">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-xl font-semibold">Call history</h1>
          </div>

          <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8">
            <div className="hidden lg:block mb-8">
              <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
                <Phone className="text-pink-500" size={28} />
                Call history
              </h1>
              <p className="text-zinc-400">
                {isCreator
                  ? 'Past voice calls, earnings and ratings'
                  : 'Your voice calls and spend'}
              </p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 mb-8">
              {isCreator ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                  <p className="text-xs text-zinc-500 mb-1">Total earned</p>
                  <p className="text-2xl font-semibold text-pink-400">
                    £{totalEarned.toFixed(2)}
                  </p>
                </div>
              ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                  <p className="text-xs text-zinc-500 mb-1">Total spent</p>
                  <p className="text-2xl font-semibold text-pink-400">
                    £{totalSpent.toFixed(2)}
                  </p>
                </div>
              )}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <p className="text-xs text-zinc-500 mb-1">Calls</p>
                <p className="text-2xl font-semibold">{calls.length}</p>
              </div>
            </div>

            {loading ? (
              <p className="text-zinc-500 text-center py-12">Loading…</p>
            ) : calls.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
                <Phone className="mx-auto text-zinc-600 mb-3" size={32} />
                <p className="text-zinc-400">No calls yet</p>
                <p className="text-sm text-zinc-600 mt-1">
                  {isCreator
                    ? 'When subs call you, they will show up here'
                    : 'Request a voice call from a creator’s chat'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {calls.map((c) => {
                  const name =
                    c.other?.display_name ||
                    c.other?.username ||
                    'User';
                  const charged = Number(c.amount_charged || 0);
                  const isMineCreator = c.creator_id === userId;
                  return (
                    <div
                      key={c.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-start gap-3"
                    >
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 overflow-hidden flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {c.other?.avatar_url ? (
                          <img
                            src={c.other.avatar_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold truncate">{name}</p>
                          <span className="text-xs text-zinc-500 flex-shrink-0">
                            {formatDate(c.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400 mt-0.5">
                          {statusLabel(c.status)}
                          {' · '}
                          {formatDuration(c.duration_seconds)}
                          {charged > 0 && (
                            <span className="text-pink-400 font-medium">
                              {' · '}
                              {isMineCreator ? '+' : '−'}£{charged.toFixed(2)}
                            </span>
                          )}
                        </p>
                        {isMineCreator && c.rating ? (
                          <div className="flex items-center gap-0.5 mt-1.5 text-pink-400">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={12}
                                className={i < c.rating ? 'fill-pink-400' : 'text-zinc-700'}
                              />
                            ))}
                          </div>
                        ) : null}
                        {isMineCreator && c.caller_quality ? (
                          <p className="text-[11px] text-zinc-500 mt-1">
                            Your private score · {c.caller_quality}/5
                          </p>
                        ) : null}
                        {Number(c.after_call_tip_gbp || 0) > 0 && (
                          <p className="text-[11px] text-pink-400 mt-1">
                            Thank-you tip £{Number(c.after_call_tip_gbp).toFixed(2)}
                          </p>
                        )}
                        {c.other?.username && (
                          <Link
                            href={`/${c.other.username}`}
                            className="text-xs text-zinc-500 hover:text-pink-400 mt-1 inline-block"
                          >
                            @{c.other.username}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}