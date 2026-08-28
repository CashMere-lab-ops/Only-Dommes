'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronDown,
  HelpCircle,
  Mail,
  MessageCircle,
  Shield,
  Wallet,
  Film,
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import AuthGuard from '../../components/AuthGuard';
import { createClient } from '../../lib/supabase';

const TOPICS = [
  'Account',
  'Wallet & payouts',
  'Live',
  'Clips',
  'Shop & shipping',
  'Messages & calls',
  'Report a user',
  'Other',
];

const FAQS = [
  {
    q: 'How do payouts work?',
    a: 'Creators can request a payout when their available wallet is £100 or more. Payouts are processed on Mondays. World of Dommes takes 20% on creator earnings. Fans always see the full amount they send.',
  },
  {
    q: 'Why can’t I tip or buy something?',
    a: 'Your wallet balance has to cover the full amount first. Open Wallet from My Account or the header chip, top up (minimum £10), then try again.',
  },
  {
    q: 'Where do physical items ship?',
    a: 'Shop items only go to lockers and pick-up points (InPost first). Home addresses are never used, and creators never see a buyer’s full address.',
  },
  {
    q: 'Do lives get saved?',
    a: 'No. When a live ends, the stream is gone. There is no replay on profiles.',
  },
  {
    q: 'How do private lives work?',
    a: 'A subscriber requests minutes at the creator’s per-minute price. If accepted, only those two can watch until the time ends or both agree to finish early.',
  },
  {
    q: 'I bought a clip — where is it?',
    a: 'Open My Library. Owned clips stay there so you can watch them again.',
  },
  {
    q: 'How do I change my username?',
    a: 'Settings → username. Usernames can change once every 30 days. Your public URL updates with it.',
  },
  {
    q: 'How do I report someone?',
    a: 'Use the form on this page and choose “Report a user”. Include their @username and what happened. For a post, you can also use the ••• menu on Discover.',
  },
];

export default function SupportPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('Account');
  const [message, setMessage] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email || '');
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, account_type, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      setProfile(data);
    })();
  }, []);

  const quickLinks = useMemo(
    () => [
      { href: '/wallet', label: 'Wallet', icon: Wallet },
      { href: '/earnings', label: 'Earnings', icon: Shield },
      { href: '/library', label: 'Library', icon: Film },
      { href: '/messages', label: 'Messages', icon: MessageCircle },
    ],
    []
  );

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          topic,
          message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send');
      setDone(true);
      setMessage('');
    } catch (err: any) {
      setError(err.message || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthGuard>
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="lg:hidden sticky top-0 z-40 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
          <Link href="/account" className="text-zinc-400">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-semibold">Support</h1>
        </div>

        <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8 pb-28 lg:pb-12">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
                <HelpCircle className="text-pink-400" size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Support</h1>
                <p className="text-sm text-zinc-500">
                  We reply within 24 hours · support@worldofdommes.com
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-10">
            {quickLinks.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:border-zinc-600 transition"
                >
                  <Icon size={16} className="text-pink-400" />
                  {l.label}
                </Link>
              );
            })}
          </div>

          <section className="mb-10">
            <h2 className="text-sm font-medium text-zinc-400 mb-3">Common questions</h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800 overflow-hidden">
              {FAQS.map((item, i) => (
                <button
                  key={item.q}
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-5 py-4 hover:bg-zinc-800/40 transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{item.q}</p>
                    <ChevronDown
                      size={16}
                      className={`text-zinc-500 flex-shrink-0 transition ${
                        openFaq === i ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                  {openFaq === i && (
                    <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                      {item.a}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-5">
              <Mail size={18} className="text-pink-400 mt-0.5" />
              <div>
                <h2 className="font-semibold">Write to us</h2>
                <p className="text-sm text-zinc-500">
                  Sending as @{profile?.username || 'you'} · we reply to your account email
                </p>
              </div>
            </div>

            {done ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4">
                <p className="font-medium text-emerald-300">Message sent</p>
                <p className="text-sm text-zinc-400 mt-1">
                  We’ll reply to {email || 'your email'} within 24 hours.
                </p>
                <button
                  type="button"
                  onClick={() => setDone(false)}
                  className="mt-3 text-sm text-pink-400"
                >
                  Send another
                </button>
              </div>
            ) : (
              <form onSubmit={send} className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Topic</label>
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm outline-none focus:border-pink-500"
                  >
                    {TOPICS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Message</label>
                  <textarea
                    required
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What happened? Include @usernames or order numbers if you can."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm outline-none focus:border-pink-500 resize-y min-h-[120px]"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 font-medium text-sm disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Send message'}
                </button>
              </form>
            )}
          </section>

          <p className="text-center text-xs text-zinc-600 mt-8">
            Abuse or legal: abuse@worldofdommes.com · privacy@worldofdommes.com
          </p>
        </div>
      </main>
    </div>
    </AuthGuard>
  );
}
