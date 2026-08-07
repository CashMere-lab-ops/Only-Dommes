import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Charge a completed voice call from the subscriber's wallet to the creator.
 * Called by either party after hang-up; idempotent via reference_id = call id.
 */
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
      error: userErr,
    } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const callId = String(body?.call_id || '');
    if (!callId) {
      return NextResponse.json({ error: 'Missing call_id' }, { status: 400 });
    }

    const { data: call, error: cErr } = await admin
      .from('voice_calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (cErr || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (
      user.id !== call.subscriber_id &&
      user.id !== call.creator_id
    ) {
      return NextResponse.json({ error: 'Not your call' }, { status: 403 });
    }

    const amount = Number(call.amount_charged || 0);
    if (amount <= 0 || call.status === 'failed' || call.status === 'cancelled') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_charge' });
    }

    // Already charged?
    const { data: existing } = await admin
      .from('wallet_transactions')
      .select('id')
      .eq('type', 'call_sent')
      .eq('reference_id', callId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, already: true });
    }

    const subId = call.subscriber_id;
    const creatorId = call.creator_id;

    const { data: sender } = await admin
      .from('profiles')
      .select('balance_gbp')
      .eq('id', subId)
      .single();

    const senderBal = Number(sender?.balance_gbp || 0);
    const rounded = Math.round(amount * 100) / 100;

    if (senderBal < rounded) {
      // Still record a partial note — platform may chase later
      return NextResponse.json(
        {
          ok: false,
          error: 'Insufficient balance',
          code: 'INSUFFICIENT_BALANCE',
          balance: senderBal,
          needed: rounded,
        },
        { status: 402 }
      );
    }

    const { data: recipient } = await admin
      .from('profiles')
      .select('balance_gbp')
      .eq('id', creatorId)
      .single();

    const recipientBal = Number(recipient?.balance_gbp || 0);
    const senderNext = Math.round((senderBal - rounded) * 100) / 100;
    const recipientNext = Math.round((recipientBal + rounded) * 100) / 100;

    await admin
      .from('profiles')
      .update({ balance_gbp: senderNext })
      .eq('id', subId);

    await admin
      .from('profiles')
      .update({ balance_gbp: recipientNext })
      .eq('id', creatorId);

    const desc = `Voice call £${rounded.toFixed(2)}`;

    await admin.from('wallet_transactions').insert([
      {
        user_id: subId,
        type: 'call_sent',
        amount_gbp: -rounded,
        balance_after: senderNext,
        counterparty_id: creatorId,
        reference_type: 'voice_call',
        reference_id: callId,
        description: desc,
      },
      {
        user_id: creatorId,
        type: 'call_received',
        amount_gbp: rounded,
        balance_after: recipientNext,
        counterparty_id: subId,
        reference_type: 'voice_call',
        reference_id: callId,
        description: desc,
      },
    ]);

    return NextResponse.json({ ok: true, amount: rounded });
  } catch (e: any) {
    console.error('charge-call', e);
    return NextResponse.json(
      { error: e?.message || 'Charge failed' },
      { status: 500 }
    );
  }
}
