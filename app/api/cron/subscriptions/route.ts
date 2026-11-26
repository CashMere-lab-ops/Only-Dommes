import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

async function creatorLabel(admin: any, creatorId: string) {
  const { data } = await admin.from('profiles').select('username, display_name').eq('id', creatorId).single();
  return data?.display_name || (data?.username ? `@${data.username}` : 'a creator');
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const now = new Date();
  const nowIso = now.toISOString();
  const in3d = new Date(now.getTime() + 3 * 86400000).toISOString();
  const in1d = new Date(now.getTime() + 86400000).toISOString();
  const results: any[] = [];

  const { data: upcoming, error: upcomingError } = await admin
    .from('subscriptions')
    .select('id, subscriber_id, creator_id, price, current_period_end, remind_3d_sent_at, remind_1d_sent_at, cancel_at_period_end')
    .eq('status', 'active')
    .gt('current_period_end', nowIso)
    .lte('current_period_end', in3d)
    .limit(200);
  if (upcomingError) return NextResponse.json({ error: upcomingError.message }, { status: 500 });

  for (const sub of upcoming || []) {
    if (sub.cancel_at_period_end) continue;
    const label = await creatorLabel(admin, sub.creator_id);
    const price = Number(sub.price || 0).toFixed(2);
    const endStr = new Date(sub.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    if (!sub.remind_3d_sent_at) {
      const { error } = await admin.from('notifications').insert({
        user_id: sub.subscriber_id, type: 'subscription',
        title: `Renews ${endStr}`,
        body: `Your subscription to ${label} renews for £${price}. Make sure your wallet has enough funds.`,
        link: '/subscriptions',
      });
      if (!error) {
        await admin.from('subscriptions').update({ remind_3d_sent_at: nowIso }).eq('id', sub.id);
        results.push({ id: sub.id, action: 'remind_3d' });
      }
    }

    if (new Date(sub.current_period_end).getTime() <= new Date(in1d).getTime() && !sub.remind_1d_sent_at) {
      const { data: sender } = await admin.from('profiles').select('balance_gbp').eq('id', sub.subscriber_id).single();
      if (Number(sender?.balance_gbp || 0) < Number(sub.price || 0)) {
        const { error } = await admin.from('notifications').insert({
          user_id: sub.subscriber_id, type: 'subscription',
          title: 'Wallet low — subscription renews tomorrow',
          body: `Your wallet needs £${price} for your subscription to ${label}. Top up to avoid interruption.`,
          link: '/wallet',
        });
        if (!error) {
          await admin.from('subscriptions').update({ remind_1d_sent_at: nowIso }).eq('id', sub.id);
          results.push({ id: sub.id, action: 'remind_1d' });
        }
      }
    }
  }

  const { data: due, error: dueError } = await admin
    .from('subscriptions')
    .select('id')
    .in('status', ['active', 'past_due'])
    .lte('current_period_end', nowIso)
    .order('current_period_end', { ascending: true })
    .limit(80);
  if (dueError) return NextResponse.json({ error: dueError.message, results }, { status: 500 });

  for (const sub of due || []) {
    const { data, error } = await admin.rpc('renew_creator_subscription', { p_subscription_id: sub.id });
    if (error) results.push({ id: sub.id, error: error.message });
    else results.push({ id: sub.id, ...data });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
