import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { splitCreatorEarn } from '../../../../lib/platform-fee';

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
    const creatorId = String(body?.creator_id || '');
    if (!creatorId || creatorId === user.id) {
      return NextResponse.json(
        { error: 'You can’t subscribe to yourself' },
        { status: 400 }
      );
    }

    const { data: creator, error: cErr } = await admin
      .from('profiles')
      .select(
        'id, username, display_name, account_type, subscriptions_enabled, subscription_price, balance_gbp'
      )
      .eq('id', creatorId)
      .single();

    if (cErr || !creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    if (creator.account_type !== 'creator') {
      return NextResponse.json(
        { error: 'That account is not a creator' },
        { status: 400 }
      );
    }

    if (creator.subscriptions_enabled === false) {
      return NextResponse.json(
        {
          error:
            'This creator has subscriptions turned off. They can enable it in Dashboard → Pricing.',
        },
        { status: 400 }
      );
    }

    const price = Math.round(Number(creator.subscription_price ?? 9.99) * 100) / 100;
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json(
        { error: 'This creator has not set a subscription price' },
        { status: 400 }
      );
    }

    const { data: existing } = await admin
      .from('subscriptions')
      .select('*')
      .eq('subscriber_id', user.id)
      .eq('creator_id', creatorId)
      .maybeSingle();

    if (existing?.status === 'active') {
      if (existing.cancel_at_period_end) {
        await admin
          .from('subscriptions')
          .update({ cancel_at_period_end: false })
          .eq('id', existing.id);
        return NextResponse.json({
          ok: true,
          resumed: true,
          period_end: existing.current_period_end,
        });
      }
      return NextResponse.json({ ok: true, already: true });
    }

    const { data: sender } = await admin
      .from('profiles')
      .select('balance_gbp, display_name, username')
      .eq('id', user.id)
      .single();

    let senderBal = Number(sender?.balance_gbp || 0);

    if (senderBal < price) {
      return NextResponse.json(
        {
          error: `Not enough wallet balance (£${senderBal.toFixed(2)}). Need £${price.toFixed(2)}. Top up or add a backup card.`,
          code: 'INSUFFICIENT_BALANCE',
          needed: price,
          balance: senderBal,
          needs_card: true,
        },
        { status: 402 }
      );
    }

    if (senderBal < price) {
      return NextResponse.json(
        {
          error: `Not enough balance. Need £${price.toFixed(2)}, you have £${senderBal.toFixed(2)}.`,
          code: 'INSUFFICIENT_BALANCE',
          needed: price,
          balance: senderBal,
        },
        { status: 402 }
      );
    }

    const { gross_gbp, net_gbp } = splitCreatorEarn(price);
    const senderNext = Math.round((senderBal - gross_gbp) * 100) / 100;
    const creatorNext =
      Math.round((Number(creator.balance_gbp || 0) + net_gbp) * 100) / 100;

    const { error: debitErr } = await admin
      .from('profiles')
      .update({ balance_gbp: senderNext })
      .eq('id', user.id);
    if (debitErr) {
      return NextResponse.json({ error: debitErr.message }, { status: 500 });
    }

    const { error: creditErr } = await admin
      .from('profiles')
      .update({ balance_gbp: creatorNext })
      .eq('id', creatorId);
    if (creditErr) {
      await admin.from('profiles').update({ balance_gbp: senderBal }).eq('id', user.id);
      return NextResponse.json({ error: creditErr.message }, { status: 500 });
    }

    await admin.from('wallet_transactions').insert([
      {
        user_id: user.id,
        type: 'sub_sent',
        amount_gbp: -gross_gbp,
        balance_after: senderNext,
        counterparty_id: creatorId,
        reference_type: 'subscription',
        description: `Subscription @${creator.username} £${gross_gbp.toFixed(2)}`,
      },
      {
        user_id: creatorId,
        type: 'sub_received',
        amount_gbp: net_gbp,
        balance_after: creatorNext,
        counterparty_id: user.id,
        reference_type: 'subscription',
        description: `Subscription £${gross_gbp.toFixed(2)}`,
      },
    ]);

    const now = new Date();
    const periodEnd = addDays(now, 30).toISOString();
    const fullRow: Record<string, any> = {
      subscriber_id: user.id,
      creator_id: creatorId,
      price,
      status: 'active',
      started_at: existing?.started_at || now.toISOString(),
      last_billed_at: now.toISOString(),
      current_period_end: periodEnd,
      cancel_at_period_end: false,
    };

    let saveErr;
    if (existing?.id) {
      const { error } = await admin.from('subscriptions').update(fullRow).eq('id', existing.id);
      saveErr = error;
    } else {
      const { error } = await admin.from('subscriptions').insert(fullRow);
      saveErr = error;
    }

    if (saveErr) {
      const basic = {
        subscriber_id: user.id,
        creator_id: creatorId,
        price,
        status: 'active',
        started_at: existing?.started_at || now.toISOString(),
      };
      if (existing?.id) {
        const { error } = await admin.from('subscriptions').update(basic).eq('id', existing.id);
        saveErr = error;
      } else {
        const { error } = await admin.from('subscriptions').insert(basic);
        saveErr = error;
      }
    }

    if (saveErr) {
      return NextResponse.json(
        { error: `Payment taken but subscription row failed: ${saveErr.message}` },
        { status: 500 }
      );
    }

    try {
      const name = sender?.display_name || sender?.username || 'Someone';
      await admin.from('notifications').insert({
        user_id: creatorId,
        actor_id: user.id,
        type: 'subscribe',
        title: `${name} subscribed to you`,
        body: `£${price.toFixed(2)}/mo`,
        link: `/${sender?.username || ''}`,
      });
    } catch {
      /* optional */
    }

    return NextResponse.json({
      ok: true,
      price,
      period_end: periodEnd,
      balance: senderNext,
    });
  } catch (e: any) {
    console.error('subscribe', e);
    return NextResponse.json(
      { error: e?.message || 'Subscribe failed' },
      { status: 500 }
    );
  }
}
