import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\\s+/i, '');
    if (!token) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const creatorId = String(body?.creator_id || '');
    if (!creatorId || creatorId === user.id) {
      return NextResponse.json({ error: 'You can’t subscribe to yourself' }, { status: 400 });
    }

    const { data: creator, error: creatorError } = await admin
      .from('profiles')
      .select('id, username, display_name, account_type, subscriptions_enabled, subscription_price')
      .eq('id', creatorId)
      .single();
    if (creatorError || !creator) return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    if (creator.account_type !== 'creator') {
      return NextResponse.json({ error: 'That account is not a creator' }, { status: 400 });
    }
    if (creator.subscriptions_enabled === false) {
      return NextResponse.json({ error: 'This creator has subscriptions turned off.' }, { status: 400 });
    }

    const price = Math.round(Number(creator.subscription_price ?? 9.99) * 100);
    if (!Number.isSafeInteger(price) || price <= 0) {
      return NextResponse.json({ error: 'This creator has not set a valid subscription price' }, { status: 400 });
    }

    const requestKey = String(request.headers.get('idempotency-key') || body?.idempotency_key || randomUUID()).slice(0, 180);
    const { data, error } = await admin.rpc('start_creator_subscription', {
      p_subscriber_id: user.id,
      p_creator_id: creatorId,
      p_price_pence: price,
      p_idempotency_key: requestKey,
    });
    if (error) {
      const insufficient = /insufficient wallet balance/i.test(error.message);
      return NextResponse.json({
        error: insufficient ? 'Insufficient wallet balance. Please top up your wallet to subscribe.' : error.message,
        code: insufficient ? 'INSUFFICIENT_BALANCE' : 'SUBSCRIPTION_FAILED',
        needed: price / 100,
      }, { status: insufficient ? 402 : 500 });
    }

    if (data?.ok && !data?.already && !data?.resumed) {
      const { data: sender } = await admin.from('profiles').select('username, display_name').eq('id', user.id).maybeSingle();
      await admin.from('notifications').insert({
        user_id: creatorId,
        actor_id: user.id,
        type: 'subscribe',
        title: `${sender?.display_name || sender?.username || 'Someone'} subscribed to you`,
        body: `£${(price / 100).toFixed(2)}/mo`,
        link: `/${sender?.username || ''}`,
      });
    }

    return NextResponse.json({ ...data, price: price / 100 });
  } catch (e: any) {
    console.error('subscribe', e);
    return NextResponse.json({ error: e?.message || 'Subscribe failed' }, { status: 500 });
  }
}
