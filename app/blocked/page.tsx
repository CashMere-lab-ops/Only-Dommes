'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, Search } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

export default function BlockedPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: blocks } = await supabase
      .from('blocks')
      .select('blocked_id, created_at')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });

    const ids = (blocks || []).map((b) => b.blocked_id);
    if (!ids.length) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', ids);
    const map = new Map((profiles || []).map((p: any) => [p.id, p]));
    setRows(
      (blocks || []).map((b) => ({
        ...b,
        profile: map.get(b.blocked_id) || null,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const unblock = async (id: string, username?: string) => {
    if (
      !confirm(
        `Unblock ${username ? '@' + username : 'this user'}? They will be able to message and follow you again.`
      )
    ) {
      return;
    }
    setBusyId(id);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', id);
    setBusyId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.blocked_id !== id));
  };

  const q = search.trim().toLowerCase().replace(/^@/, '');
  const shown = rows.filter((r) => {
    if (!q) return true;
    const u = (r.profile?.username || '').toLowerCase();
    const n = (r.profile?.display_name || '').toLowerCase();
    return u.includes(q) || n.includes(q);
  });

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="lg:hidden sticky top-0 z-40 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
            <Link href="/account" className="text-zinc-400">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="font-semibold">Blocked</h1>
          </div>

          <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8 pb-28 lg:pb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
                <Ban className="text-pink-400" size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold hidden lg:block">Blocked</h1>
                <p className="text-sm text-zinc-500">
                  They can’t message, follow, tip, or call you.
                </p>
              </div>
            </div>

            <div className="relative mb-5">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search blocked users"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 pl-9 pr-4 text-sm outline-none focus:border-pink-500"
              />
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              {loading ? (
                <p className="text-sm text-zinc-500 px-5 py-8 text-center">Loading…</p>
              ) : shown.length === 0 ? (
                <p className="text-sm text-zinc-500 px-5 py-10 text-center">
                  {rows.length === 0
                    ? 'You haven’t blocked anyone.'
                    : 'No matches.'}
                </p>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {shown.map((r) => {
                    const name =
                      r.profile?.display_name || r.profile?.username || 'User';
                    const un = r.profile?.username;
                    return (
                      <div
                        key={r.blocked_id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <Link
                          href={un ? `/${un}` : '/account'}
                          className="w-11 h-11 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-sm font-semibold flex-shrink-0"
                        >
                          {r.profile?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.profile.avatar_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            name.charAt(0).toUpperCase()
                          )}
                        </Link>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{name}</p>
                          <p className="text-xs text-zinc-500 truncate">
                            {un ? `@${un}` : ''}
                            {r.created_at
                              ? ` · ${new Date(r.created_at).toLocaleDateString('en-GB')}`
                              : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busyId === r.blocked_id}
                          onClick={() => unblock(r.blocked_id, un)}
                          className="text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-50"
                        >
                          Unblock
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
