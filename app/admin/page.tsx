'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '../../components/Sidebar';
import { createClient } from '../../lib/supabase';

type Money = { gross: number; fee: number; net: number; count: number };

type Overview = {
  users: { total: number; creators: number; subscribers: number; online: number };
  signups: Record<string, number>;
  money: Record<string, Money>;
  lives: { id: string; title?: string | null; viewer_count: number; started_at?: string | null }[];
};

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '3m', label: '3 months' },
  { key: '6m', label: '6 months' },
  { key: '12m', label: '12 months' },
];

function gbp(n: number) {
  return `£${Number(n || 0).toFixed(2)}`;
}

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [usage, setUsage] = useState<any>(null);
  const [range, setRange] = useState('30d');

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        router.push('/login?next=/admin');
        return;
      }
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.status === 403 || res.status === 401) {
        setDenied(true);
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
      const usageRes = await fetch('/api/admin/usage', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (usageRes.ok) setUsage(await usageRes.json());
      setLoading(false);
    };
    void load();
  }, [router, supabase]);

  const money = data?.money?.[range];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 p-6 lg:p-10">
        <div className="max-w-5xl">
          <p className="text-xs uppercase tracking-widest text-pink-500 mb-2">Admin</p>
          <h1 className="text-3xl font-bold mb-1">World of Dommes</h1>
          <p className="text-zinc-400 mb-8">Platform overview. Staff tools come later.</p>

          {loading && <p className="text-zinc-500">Loading...</p>}
          {denied && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <p className="font-medium">You do not have admin access.</p>
              <Link href="/" className="text-pink-500 text-sm mt-3 inline-block">
                Back to home
              </Link>
            </div>
          )}

          {data && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                {[
                  ['Accounts', data.users.total],
                  ['Creators', data.users.creators],
                  ['Subscribers', data.users.subscribers],
                  ['Online now', data.users.online],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                    <p className="text-xs text-zinc-500">{label}</p>
                    <p className="text-2xl font-semibold mt-1">{value}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRange(r.key)}
                    className={`px-3 py-1.5 rounded-full text-sm border ${
                      range === r.key
                        ? 'bg-pink-500 border-pink-500 text-white'
                        : 'border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <p className="text-xs text-zinc-500">Platform fee</p>
                  <p className="text-2xl font-semibold text-pink-500 mt-1">{gbp(money?.fee || 0)}</p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <p className="text-xs text-zinc-500">Gross from fans</p>
                  <p className="text-2xl font-semibold mt-1">{gbp(money?.gross || 0)}</p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <p className="text-xs text-zinc-500">Paid to creators</p>
                  <p className="text-2xl font-semibold mt-1">{gbp(money?.net || 0)}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 mb-8">
                <p className="text-sm font-medium mb-3">New sign-ups</p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {RANGES.filter((r) => r.key !== 'today').map((r) => (
                    <div key={r.key}>
                      <p className="text-xs text-zinc-500">{r.label}</p>
                      <p className="text-lg font-semibold">{data.signups[r.key] || 0}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm font-medium mb-3">Live now</p>
                {data.lives.length === 0 ? (
                  <p className="text-sm text-zinc-500">No one is live.</p>
                ) : (
                  <div className="space-y-2">
                    {data.lives.map((l) => (
                      <Link
                        key={l.id}
                        href={`/live/${l.id}`}
                        className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
                      >
                        <span>{l.title || 'Live'}</span>
                        <span className="text-sm text-zinc-400">{l.viewer_count} watching</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <p className="text-sm font-medium">LiveKit</p>
                  <p className="text-xs text-zinc-500 mb-3">{usage?.livekit?.window || 'Lives and calls'}</p>
                  {usage?.livekit?.connected ? (
                    <>
                      <p className="text-2xl font-semibold">{usage.livekit.minutes}</p>
                      <p className="text-xs text-zinc-500">connection minutes</p>
                      <p className="mt-3 text-sm">{usage.livekit.rooms ?? 0} rooms open now</p>
                      {usage.livekit.data_gb != null && (
                        <p className="text-sm">{usage.livekit.data_gb} GB data out</p>
                      )}
                      {usage.livekit.note && (
                        <p className="text-xs text-zinc-500 mt-2">{usage.livekit.note}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-zinc-400">{usage?.livekit?.note || 'Loading...'}</p>
                  )}
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <p className="text-sm font-medium">Mux</p>
                  <p className="text-xs text-zinc-500 mb-3">{usage?.mux?.window || 'Paid clips'}</p>
                  {usage?.mux?.connected ? (
                    <>
                      <p className="text-2xl font-semibold">{usage.mux.delivered_minutes}</p>
                      <p className="text-xs text-zinc-500">minutes used</p>
                      <p className="mt-3 text-sm">
                        {usage.mux.remaining_minutes?.toLocaleString()} left of {usage.mux.free_minutes?.toLocaleString()}
                      </p>
                      {usage.mux.assets != null && (
                        <p className="text-sm">{usage.mux.assets} clips stored</p>
                      )}
                      <p className="text-xs text-zinc-500 mt-2">{usage.mux.note}</p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-400">{usage?.mux?.note || 'Loading...'}</p>
                  )}
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <p className="text-sm font-medium">Supabase</p>
                  <p className="text-xs text-zinc-500 mb-3">File storage</p>
                  {usage?.supabase?.connected ? (
                    <>
                      <p className="text-2xl font-semibold">{usage.supabase.storage_gb} GB</p>
                      <p className="text-xs text-zinc-500">of {usage.supabase.storage_quota_gb} GB</p>
                      <p className="mt-3 text-sm">{usage.supabase.files} files</p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-400">{usage?.supabase?.note || 'Loading...'}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
