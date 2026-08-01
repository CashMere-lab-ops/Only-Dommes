'use c'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Send,
  Users,
  Heart,
  Clock,
  CheckCircle2,
  XCircle,
  Megaphone,
  Calendar,
} from 'lucide-react';
import Sidebar from '../../../components/Sidebar';
import { createClient } from '../../../lib/supabase';

type Audience = 'followers' | 'subscribers' | 'both';
type HistoryTab = 'scheduled' | 'sent';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toLocalDateValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalTimeValue(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combineLocal(dateStr: string, timeStr: string) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, day, hh, mm, 0, 0);
}

function formatNice(d: Date) {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MassMessagePage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [content, setContent] = useState('');
  const [audience, setAudience] = useState<Audience>('followers');
  const [mode, setMode] = useState<'now' | 'schedule'>('now');

  const defaultLater = new Date(Date.now() + 60 * 60 * 1000);
  const [scheduleDate, setScheduleDate] = useState(toLocalDateValue(defaultLater));
  const [scheduleTime, setScheduleTime] = useState(toLocalTimeValue(defaultLater));

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [historyTab, setHistoryTab] = useState<HistoryTab>('scheduled');
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = async (uid: string) => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('mass_messages')
      .select('*')
      .eq('creator_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);

    setHistory(data || []);
    setHistoryLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('account_type')
        .eq('id', user.id)
        .single();

      if (profile?.account_type !== 'creator') {
        router.push('/messages');
        return;
      }

      setUserId(user.id);
      await loadHistory(user.id);
      setLoading(false);
    };

    init();
  }, []);

  const getRecipientIds = async (uid: string, aud: Audience) => {
    const ids = new Set<string>();

    if (aud === 'followers' || aud === 'both') {
      const { data: fans } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', uid);
      (fans || []).forEach((f: any) => ids.add(f.follower_id));
    }

    if (aud === 'subscribers' || aud === 'both') {
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('subscriber_id')
        .eq('creator_id', uid)
        .eq('status', 'active');
      (subs || []).forEach((s: any) => ids.add(s.subscriber_id));
    }

    return Array.from(ids);
  };

  const ensureConversation = async (me: string, other: string) => {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(participant_1.eq.${me},participant_2.eq.${other}),and(participant_1.eq.${other},participant_2.eq.${me})`
      )
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        participant_1: me,
        participant_2: other,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !created) return null;
    return created.id;
  };

  const sendNow = async (uid: string, text: string, aud: Audience) => {
    const recipientIds = await getRecipientIds(uid, aud);
    let sent = 0;

    for (const otherId of recipientIds) {
      const convoId = await ensureConversation(uid, otherId);
      if (!convoId) continue;

      const { error: msgErr } = await supabase.from('messages').insert({
        conversation_id: convoId,
        sender_id: uid,
        content: text,
      });

      if (!msgErr) {
        sent += 1;
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', convoId);
      }
    }

    await supabase.from('mass_messages').insert({
      creator_id: uid,
      content: text,
      audience: aud,
      status: 'sent',
      sent_at: new Date().toISOString(),
      recipient_count: sent,
      scheduled_for: null,
    });

    return sent;
  };

  const scheduleMessage = async (uid: string, text: string, aud: Audience, when: Date) => {
    const { error } = await supabase.from('mass_messages').insert({
      creator_id: uid,
      content: text,
      audience: aud,
      status: 'scheduled',
      scheduled_for: when.toISOString(),
      recipient_count: 0,
    });

    if (error) throw error;
  };

  const applyQuick = (minutesFromNow: number) => {
    const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
    setScheduleDate(toLocalDateValue(d));
    setScheduleTime(toLocalTimeValue(d));
  };

  const scheduledPreview = (() => {
    if (!scheduleDate || !scheduleTime) return null;
    const d = combineLocal(scheduleDate, scheduleTime);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  })();

  const handleSubmit = async () => {
    if (!userId || !content.trim()) return;
    setSending(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'schedule') {
        if (!scheduleDate || !scheduleTime) {
          setError('Choose a date and time');
          setSending(false);
          return;
        }
        const when = combineLocal(scheduleDate, scheduleTime);
        if (Number.isNaN(when.getTime())) {
          setError('Invalid date or time');
          setSending(false);
          return;
        }
        if (when.getTime() <= Date.now() + 30 * 1000) {
          setError('Pick a time at least 1 minute in the future');
          setSending(false);
          return;
        }
        await scheduleMessage(userId, content.trim(), audience, when);
        setMessage(`Scheduled for ${formatNice(when)}`);
      } else {
        const count = await sendNow(userId, content.trim(), audience);
        setMessage(`Sent to ${count} recipient${count === 1 ? '' : 's'}`);
      }

      setContent('');
      setMode('now');
      const later = new Date(Date.now() + 60 * 60 * 1000);
      setScheduleDate(toLocalDateValue(later));
      setScheduleTime(toLocalTimeValue(later));
      await loadHistory(userId);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
    }

    setSending(false);
  };

  const cancelScheduled = async (id: string) => {
    if (!userId) return;
    await supabase
      .from('mass_messages')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('creator_id', userId)
      .eq('status', 'scheduled');

    await loadHistory(userId);
  };

  const audienceLabel = (a: string) => {
    if (a === 'subscribers') return 'Subscribers';
    if (a === 'both') return 'Followers + Subscribers';
    return 'Followers';
  };

  const formatWhen = (iso: string | null) => {
    if (!iso) return '—';
    return formatNice(new Date(iso));
  };

  const scheduledItems = history.filter((h) => h.status === 'scheduled');
  const sentItems = history.filter((h) => h.status === 'sent' || h.status === 'failed');
  const minDate = toLocalDateValue(new Date());

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center text-zinc-500">
          Loading...
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/messages" className="text-zinc-400 hover:text-white transition">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Megaphone className="text-pink-500" size={22} />
              Mass message
            </h1>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-8">
            <label className="text-sm text-zinc-400 mb-2 block">Message</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your mass message..."
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-pink-500 resize-none mb-4"
            />

            <label className="text-sm text-zinc-400 mb-2 block">Audience</label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(
                [
                  { id: 'followers' as Audience, label: 'Followers', icon: Users },
                  { id: 'subscribers' as Audience, label: 'Subscribers', icon: Heart },
                  { id: 'both' as Audience, label: 'Both', icon: Users },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAudience(opt.id)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-sm transition ${
                      audience === opt.id
                        ? 'border-pink-500 bg-pink-500/10 text-pink-400'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <Icon size={18} />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <label className="text-sm text-zinc-400 mb-2 block">When</label>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setMode('now')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${
                  mode === 'now'
                    ? 'border-pink-500 bg-pink-500/10 text-pink-400'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                }`}
              >
                Send now
              </button>
              <button
                type="button"
                onClick={() => setMode('schedule')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${
                  mode === 'schedule'
                    ? 'border-pink-500 bg-pink-500/10 text-pink-400'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                }`}
              >
                Schedule
              </button>
            </div>

            {mode === 'schedule' && (
              <div className="mb-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'In 1 hour', mins: 60 },
                    { label: 'In 3 hours', mins: 180 },
                    { label: 'Tomorrow 9am', mins: -1 },
                  ].map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => {
                        if (q.mins === -1) {
                          const d = new Date();
                          d.setDate(d.getDate() + 1);
                          d.setHours(9, 0, 0, 0);
                          setScheduleDate(toLocalDateValue(d));
                          setScheduleTime(toLocalTimeValue(d));
                        } else {
                          applyQuick(q.mins);
                        }
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-pink-500 hover:text-pink-400 transition"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1">
                      <Calendar size={12} /> Date
                    </label>
                    <input
                      type="date"
                      value={scheduleDate}
                      min={minDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm outline-none focus:border-pink-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1">
                      <Clock size={12} /> Time
                    </label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm outline-none focus:border-pink-500"
                    />
                  </div>
                </div>

                {scheduledPreview && (
                  <p className="text-xs text-zinc-400 bg-zinc-800/80 border border-zinc-700 rounded-xl px-3 py-2">
                    Will send:{' '}
                    <span className="text-pink-400 font-medium">
                      {formatNice(scheduledPreview)}
                    </span>{' '}
                    <span className="text-zinc-500">(your local time)</span>
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-400 mb-3 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
            {message && (
              <p className="text-sm text-emerald-400 mb-3 bg-emerald-400/10 border border-emerald-400/20 rounded-xl px-3 py-2">
                {message}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={sending || !content.trim()}
              className="w-full flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 py-3 rounded-xl font-medium transition"
            >
              {sending ? (
                'Working...'
              ) : mode === 'schedule' ? (
                <>
                  <Clock size={18} /> Schedule message
                </>
              ) : (
                <>
                  <Send size={18} /> Send now
                </>
              )}
            </button>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">History</h2>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setHistoryTab('scheduled')}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
                  historyTab === 'scheduled'
                    ? 'bg-pink-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                Scheduled ({scheduledItems.length})
              </button>
              <button
                onClick={() => setHistoryTab('sent')}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
                  historyTab === 'sent'
                    ? 'bg-pink-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                Delivered ({sentItems.length})
              </button>
            </div>

            {historyLoading ? (
              <p className="text-zinc-500 text-sm py-8 text-center">Loading history...</p>
            ) : (historyTab === 'scheduled' ? scheduledItems : sentItems).length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl py-12 text-center text-zinc-500 text-sm">
                {historyTab === 'scheduled'
                  ? 'No scheduled mass messages'
                  : 'No delivered mass messages yet'}
              </div>
            ) : (
              <div className="space-y-3">
                {(historyTab === 'scheduled' ? scheduledItems : sentItems).map((item) => (
                  <div
                    key={item.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-sm text-zinc-100 whitespace-pre-wrap break-words flex-1">
                        {item.content || '(no text)'}
                      </p>
                      {item.status === 'scheduled' && (
                        <button
                          onClick={() => cancelScheduled(item.id)}
                          className="text-xs text-red-400 hover:text-red-300 flex-shrink-0"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        {item.status === 'sent' ? (
                          <CheckCircle2 size={12} className="text-emerald-500" />
                        ) : item.status === 'failed' ? (
                          <XCircle size={12} className="text-red-400" />
                        ) : (
                          <Clock size={12} className="text-pink-400" />
                        )}
                        {item.status === 'sent'
                          ? 'Delivered'
                          : item.status === 'failed'
                          ? 'Failed'
                          : 'Scheduled'}
                      </span>
                      <span>{audienceLabel(item.audience)}</span>
                      {item.status === 'scheduled' && (
                        <span>Sends {formatWhen(item.scheduled_for)}</span>
                      )}
                      {item.status === 'sent' && (
                        <>
                          <span>{formatWhen(item.sent_at)}</span>
                          <span>
                            {item.recipient_count} recipient
                            {item.recipient_count === 1 ? '' : 's'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}