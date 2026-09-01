import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function addDays(from: Date, days: number) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const {
      data: { user },
    } = await admin.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const subscriberId = String(body?.subscriber_id || '');
    if (!subscriberId) {
      return NextResponse.json({ error: 'subscriber_id required' }, { status: 400 });
    }

    const { data: sub, error } = await admin
      .from('subscriptions')
      .select('id, status, started_at, current_period_end, subscriber_id')
      .eq('creator_id', user.id)
      .eq('subscriber_id', subscriberId)
      .eq('status', 'active')
      .maybeSingle();

    if (error && /current_period_end/.test(error.message || '')) {
      const fallback = await admin
        .from('subscriptions')
        .select('id, status, started_at, subscriber_id')
        .eq('creator_id', user.id)
        .eq('subscriber_id', subscriberId)
        .eq('status', 'active')
        .maybeSingle();
      if (!fallback.data) {
        return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
      }
      const ends = addDays(new Date(fallback.data.started_at || Date.now()), 30);
      const { error: upErr } = await admin
        .from('subscriptions')
        .update({ status: 'ending' })
        .eq('id', fallback.data.id);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      try {
        await admin.from('notifications').insert({
          user_id: subscriberId,
          actor_id: user.id,
          type: 'subscription',
          title: 'Subscription ending',
          body: `Your subscription stays active until ${ends.toLocaleDateString('en-GB')}.`,
          link: '/subscriptions',
        });
      } catch {
        /* optional */
      }
      return NextResponse.json({ ok: true, period_end: ends.toISOString() });
    }

    if (!sub) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    const ends = sub.current_period_end
      ? new Date(sub.current_period_end)
      : addDays(new Date(sub.started_at || Date.now()), 30);

    let { error: upErr } = await admin
      .from('subscriptions')
      .update({
        cancel_at_period_end: true,
        current_period_end: ends.toISOString(),
      })
      .eq('id', sub.id);

    if (upErr) {
      const second = await admin
        .from('subscriptions')
        .update({ status: 'ending' })
        .eq('id', sub.id);
      upErr = second.error;
    }

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    try {
      await admin.from('notifications').insert({
        user_id: subscriberId,
        actor_id: user.id,
        type: 'subscription',
        title: 'Subscription ending',
        body: `Access stays until ${ends.toLocaleDateString('en-GB')}. It will not renew.`,
        link: '/subscriptions',
      });
    } catch {
      /* optional */
    }

    return NextResponse.json({ ok: true, period_end: ends.toISOString() });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Could not end subscription' },
      { status: 500 }
    );
  }
}
