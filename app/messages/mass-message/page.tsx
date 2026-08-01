'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Users, Heart, Clock, Trash2, Calendar } from 'lucide-react';
import Sidebar from '../../../components/Sidebar';
import { createClient } from '../../../lib/supabase';

type Audience = 'followers' | 'subscribers' | 'both';

export default function MassMessagePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState<Audience>('followers');
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [subCount, setSubCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
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

      const { count: fCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id);
      setFollowerCount(fCount || 0);

      const { count: sCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .eq('status', 'active');
      setSubCount(sCount || 0);

      const { data: pending } = await supabase
        .from('scheduled_mass_messages')
        .select('*')
        .eq('creator_id', user.id)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true });

      setScheduled(pending || []);
      setLoading(false);
    };

    load();
  }, []);

  const getRecipientIds = async (creatorId: string, aud: Audience) => {
    const ids = new Set<string>();

    if (aud === 'followers' || aud === 'both') {
      const { data } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', creatorId);
      (data || []).forEach((r) => ids.add(r.follower_id));
    }

    if (aud === 'subscribers' || aud === 'both') {
      const { data } = await supabase
        .from('subscriptions')
        .select('subscriber_id')
        .eq('creator_id', creatorId)
        .eq('status', 'active');
      (data || []).forEach((r) => ids.add(r.subscriber_id));
    }

    return Array.from(ids);
  };

  const ensureConversation = async (creatorId: string, fanId: string) => {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(participant_1.eq.${creatorId},participant_2.eq.${fanId}),and(participant_1.eq.${fanId},participant_2.eq.${creatorId})`
      )
      .maybeSingle();

    if (existing) return existing.id;

    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        participant_1: creatorId,
        participant_2: fanId,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return created.id;
  };

  const sendToRecipients = async (creatorId: string, text: string, aud: Audience) => {
    const recipientIds = await getRecipientIds(creatorId, aud);
    let sent = 0;

    for (const fanId of recipientIds) {
      try {
        const convoId = await ensureConversation(creatorId, fanId);
        await supabase.from('messages').insert({
          conversation_id: convoId,
          sender_id: creatorId,
          content: text,
        });
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', convoId);
        sent += 1;
      } catch (err) {
        console.error('Mass send failed for', fanId, err);
      }
    }

    return sent;
  };

  const handleSendNow = async () => {
    if (!userId || !content.trim()) return;
    setSending(true);
    setError('');
    setMessage('');

    try {
      const count = await sendToRecipients(userId, content.trim(), audience);
      setMessage(`Sent to ${count} people`);
      setContent('');
    } catch (err: any) {
      setError(err.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleSchedule = async () => {
    if (!userId || !content.trim() || !scheduledAt) return;
    setSending(true);
    setError('');
    setMessage('');

    const when = new Date(scheduledAt);
    if (isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setError('Pick a future date and time');
      setSending(false);
      return;
    }

    try {
      const { data, error: insertError } = await supabase
        .from('scheduled_mass_messages')
        .insert({
          creator_id: userId,
          content: content.trim(),
          audience,
          scheduled_at: when.toISOString(),
          status: 'pending',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setScheduled((prev) =>
        [...prev, data].sort(
          (a, b) =>
            new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        )
      );
      setContent('');
      setScheduledAt('');
      setMode('now');
      setMessage('Message scheduled');
    } catch (err: any) {
      setError(err.message || 'Failed to schedule');
    } finally {
      setSending(false);
    }
  };

  const cancelScheduled = async (id: string) => {
    const { error: updateError } = await supabase
      .from('scheduled_mass_messages')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (!updateError) {
      setScheduled((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const estimatedCount =
    audience === 'followers'
      ? followerCount
      : audience === 'subscribers'
      ? subCount
      : followerCount + subCount;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
          <Link href="/messages" className="text-zinc-400 hover:text-white">
            <ArrowLeft size={22} />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Mass Message</h1>
            <p className="text-xs text-zinc-500">Send one message to many people at once</p>
          </div>
        </div>

        <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
          {(message || error) && (
            <div
              className={`rounded-xl px-4 py-3 text-sm ${
                error
                  ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                  : 'bg-pink-500/10 border border-pink-500/30 text-pink-400'
              }`}
            >
              {error || message}
            </div>
          )}

          {/* Audience */}
          <div className="space-y-2">
            <p className="text-sm text-zinc-400">Send to</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAudience('subscribers')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  audience === 'subscribers'
                    ? 'bg-pink-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                }`}
              >
                ♥ Subscribers ({subCount})
              </button>
              <button
                type="button"
                onClick={() => setAudience('followers')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  audience === 'followers'
                    ? 'bg-pink-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                }`}
              >
                👥 Followers ({followerCount})
              </button>
              <button
                type="button"
                onClick={() => setAudience('both')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  audience === 'both'
                    ? 'bg-pink-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                }`}
              >
                Both
              </button>
            </div>
            <p className="text-xs text-zinc-500">About {estimatedCount} recipients</p>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <p className="text-sm text-zinc-400">Message</p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              maxLength={1000}
              placeholder="Write your mass message..."
              className="w-full bg-zinc-900 border border-pink-500/50 rounded-2xl px-4 py-3 outline-none focus:border-pink-500 resize-none"
            />
            <p className="text-xs text-zinc-500 text-right">{content.length}/1000</p>
          </div>

          {/* Send now / Schedule */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('now')}
                className={`rounded-xl border py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${
                  mode === 'now'
                    ? 'border-pink-500 bg-pink-600/20 text-pink-300'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                }`}
              >
                <Send size={16} /> Send now
              </button>
              <button
                type="button"
                onClick={() => setMode('schedule')}
                className={`rounded-xl border py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${
                  mode === 'schedule'
                    ? 'border-pink-500 bg-pink-600/20 text-pink-300'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                }`}
              >
                <Calendar size={16} /> Schedule
              </button>
            </div>

            {mode === 'schedule' && (
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Send at</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-pink-500"
                />
              </div>
            )}

            <button
              type="button"
              onClick={mode === 'now' ? handleSendNow : handleSchedule}
              disabled={
                sending ||
                !content.trim() ||
                (mode === 'schedule' && !scheduledAt)
              }
              className="w-full bg-pink-600 hover:bg-pink-700 disabled:opacity-50 py-3.5 rounded-2xl font-semibold transition flex items-center justify-center gap-2"
            >
              {sending
                ? mode === 'now'
                  ? 'Sending...'
                  : 'Scheduling...'
                : mode === 'now'
                ? '✈ Send Mass Message'
                : '📅 Schedule Message'}
            </button>
            <p className="text-center text-xs text-zinc-500">
              Each person gets this in their normal chat with you.
            </p>
          </div>

          {/* Pending scheduled */}
          {scheduled.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <p className="font-medium flex items-center gap-2">
                <Clock size={18} className="text-pink-500" /> Scheduled
              </p>
              <div className="space-y-2">
                {scheduled.map((item) => (
                  <div
                    key={item.id}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">{item.content}</p>
                      <p className="text-xs text-zinc-400 mt-1">
                        {new Date(item.scheduled_at).toLocaleString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {item.audience}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => cancelScheduled(item.id)}
                      className="text-zinc-400 hover:text-red-400 p-1"
                      title="Cancel"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}