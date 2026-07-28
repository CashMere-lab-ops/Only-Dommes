'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Users, Heart } from 'lucide-react';
import Sidebar from '../../../components/Sidebar';
import { createClient } from '../../../lib/supabase';

type Audience = 'followers' | 'subscribers' | 'both';

export default function MassMessagePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>('subscribers');
  const [message, setMessage] = useState('');
  const [followerCount, setFollowerCount] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const init = async () => {
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

      const { count: sCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .eq('status', 'active');

      setFollowerCount(fCount || 0);
      setSubscriberCount(sCount || 0);
      setLoading(false);
    };

    init();
  }, []);

  const getRecipientIds = async (): Promise<string[]> => {
    if (!userId) return [];

    const ids = new Set<string>();

    if (audience === 'followers' || audience === 'both') {
      const { data } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', userId);
      (data || []).forEach((r) => ids.add(r.follower_id));
    }

    if (audience === 'subscribers' || audience === 'both') {
      const { data } = await supabase
        .from('subscriptions')
        .select('subscriber_id')
        .eq('creator_id', userId)
        .eq('status', 'active');
      (data || []).forEach((r) => ids.add(r.subscriber_id));
    }

    return Array.from(ids);
  };

  const getOrCreateConversation = async (otherId: string) => {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(participant_1.eq.${userId},participant_2.eq.${otherId}),and(participant_1.eq.${otherId},participant_2.eq.${userId})`
      )
      .maybeSingle();

    if (existing) return existing.id;

    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        participant_1: userId,
        participant_2: otherId,
      })
      .select('id')
      .single();

    if (error) throw error;
    return created.id;
  };

  const handleSend = async () => {
    if (!userId || !message.trim() || sending) return;

    setSending(true);
    setError('');
    setResult(null);

    try {
      const recipients = await getRecipientIds();

      if (recipients.length === 0) {
        setError('No recipients found for this audience.');
        setSending(false);
        return;
      }

      let sent = 0;

      for (const otherId of recipients) {
        try {
          const convoId = await getOrCreateConversation(otherId);

          await supabase.from('messages').insert({
            conversation_id: convoId,
            sender_id: userId,
            content: message.trim(),
          });

          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', convoId);

          sent += 1;
        } catch (err) {
          console.error('Failed for', otherId, err);
        }
      }

      setResult(`Message sent to ${sent} ${sent === 1 ? 'person' : 'people'}.`);
      setMessage('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to send mass message');
    } finally {
      setSending(false);
    }
  };

  const audienceSize =
    audience === 'followers'
      ? followerCount
      : audience === 'subscribers'
      ? subscriberCount
      : followerCount + subscriberCount;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
        <div className="lg:hidden sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
          <Link href="/messages" className="text-zinc-400">
            <ArrowLeft size={22} />
          </Link>
          <h1 className="text-xl font-semibold">Mass Message</h1>
        </div>

        <div className="max-w-xl mx-auto px-4 py-6 lg:py-8">
          <div className="hidden lg:flex items-center gap-3 mb-2">
            <Link href="/messages" className="text-zinc-400 hover:text-white">
              <ArrowLeft size={22} />
            </Link>
            <h1 className="text-3xl font-bold">Mass Message</h1>
          </div>
          <p className="text-zinc-400 mb-8 hidden lg:block">
            Send one message to many people at once
          </p>

          <div className="mb-6">
            <p className="text-sm text-zinc-400 mb-3">Send to</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAudience('subscribers')}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition ${
                  audience === 'subscribers'
                    ? 'bg-pink-600 border-pink-500 text-white'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                <Heart size={16} />
                Subscribers ({subscriberCount})
              </button>
              <button
                type="button"
                onClick={() => setAudience('followers')}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition ${
                  audience === 'followers'
                    ? 'bg-pink-600 border-pink-500 text-white'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                <Users size={16} />
                Followers ({followerCount})
              </button>
              <button
                type="button"
                onClick={() => setAudience('both')}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition ${
                  audience === 'both'
                    ? 'bg-pink-600 border-pink-500 text-white'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                Both
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              About {audienceSize} recipient{audienceSize === 1 ? '' : 's'}
              {audience === 'both' ? ' (duplicates removed)' : ''}
            </p>
          </div>

          <div className="mb-6">
            <label className="text-sm text-zinc-400 mb-1.5 block">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Write your mass message..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl py-3 px-4 outline-none focus:border-pink-500 resize-none"
            />
          </div>

          {error && (
            <div className="mb-4 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {result && (
            <div className="mb-4 text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-3">
              {result}
            </div>
          )}

          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="w-full flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 py-3.5 rounded-xl font-semibold transition"
          >
            <Send size={18} />
            {sending ? 'Sending...' : 'Send Mass Message'}
          </button>

          <p className="text-xs text-zinc-500 text-center mt-4">
            Each person gets this in their normal chat with you.
          </p>
        </div>
      </main>
    </div>
  );
}