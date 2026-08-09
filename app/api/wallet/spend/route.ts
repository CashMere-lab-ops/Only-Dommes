import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type SpendType =
  | 'tip'
  | 'unlock'
  | 'message_unlock'
  | 'call'
  | 'shop'
  | 'clip';

const TYPE_MAP: Record<
  SpendType,
  { sent: string; received: string; label: string }
> = {
  tip: { sent: 'tip_sent', received: 'tip_received', label: 'Tip' },
  unlock: { sent: 'unlock_sent', received: 'unlock_received', label: 'Unlock' },
  message_unlock: {
    sent: 'unlock_sent',
    received: 'unlock_received',
    label: 'Message unlock',
  },
  call: { sent: 'call_sent', received: 'call_received', label: 'Voice call' },
  shop: { sent: 'shop_sent', received: 'shop_received', label: 'Shop purchase' },
  clip: { sent: 'clip_sent', received: 'clip_received', label: 'Clip purchase' },
};

/**
 * Atomic-ish wallet transfer (service role).
 * Debits sender, credits recipient, writes two ledger rows.
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
    const amount = Number(body?.amount);
    const toUserId = String(body?.to_user_id || '');
    const spendType = (body?.type || 'tip') as SpendType;
    const referenceType = body?.reference_type
      ? String(body.reference_type)
      : null;
    const referenceId = body?.reference_id ? String(body.reference_id) : null;
    const description = body?.description
      ? String(body.description)
      : undefined;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (amount > 10000) {
      return NextResponse.json({ error: 'Amount too large' }, { status: 400 });
    }
    if (!toUserId || toUserId === user.id) {
      return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 });
    }
    if (!TYPE_MAP[spendType]) {
      return NextResponse.json({ error: 'Invalid spend type' }, { status: 400 });
    }

    const rounded = Math.round(amount * 100) / 100;
    const map = TYPE_MAP[spendType];

    // Idempotency: same sender + type + reference already spent
    if (referenceId && referenceType) {
      const { data: existing } = await admin
        .from('wallet_transactions')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', map.sent)
        .eq('reference_id', referenceId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({
          ok: true,
          already: true,
          message: 'Already processed',
        });
      }
    }

    const { data: sender, error: sErr } = await admin
      .from('profiles')
      .select('balance_gbp, display_name, username')
      .eq('id', user.id)
      .single();

    if (sErr || !sender) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const senderBal = Number(sender.balance_gbp || 0);
    if (senderBal < rounded) {
      return NextResponse.json(
        {
          error: 'Insufficient balance',
          balance: senderBal,
          needed: rounded,
          code: 'INSUFFICIENT_BALANCE',
        },
        { status: 402 }
      );
    }

    const { data: recipient, error: rErr } = await admin
      .from('profiles')
      .select('balance_gbp')
      .eq('id', toUserId)
      .single();

    if (rErr || !recipient) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    const recipientBal = Number(recipient.balance_gbp || 0);
    const senderNext = Math.round((senderBal - rounded) * 100) / 100;
    const recipientNext = Math.round((recipientBal + rounded) * 100) / 100;

    const { error: debitErr } = await admin
      .from('profiles')
      .update({ balance_gbp: senderNext })
      .eq('id', user.id)
      .gte('balance_gbp', rounded);

    if (debitErr) {
      return NextResponse.json(
        { error: debitErr.message || 'Debit failed' },
        { status: 500 }
      );
    }

    // Re-check in case of race (optimistic)
    const { data: afterDebit } = await admin
      .from('profiles')
      .select('balance_gbp')
      .eq('id', user.id)
      .single();
    if (Number(afterDebit?.balance_gbp) < 0) {
      await admin
        .from('profiles')
        .update({ balance_gbp: senderBal })
        .eq('id', user.id);
      return NextResponse.json(
        { error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' },
        { status: 402 }
      );
    }

    const { error: creditErr } = await admin
      .from('profiles')
      .update({ balance_gbp: recipientNext })
      .eq('id', toUserId);

    if (creditErr) {
      // Rollback sender
      await admin
        .from('profiles')
        .update({ balance_gbp: senderBal })
        .eq('id', user.id);
      return NextResponse.json(
        { error: creditErr.message || 'Credit failed' },
        { status: 500 }
      );
    }

    const desc =
      description ||
      `${map.label} £${rounded.toFixed(2)}`;

    await admin.from('wallet_transactions').insert([
      {
        user_id: user.id,
        type: map.sent,
        amount_gbp: -rounded,
        balance_after: senderNext,
        counterparty_id: toUserId,
        reference_type: referenceType,
        reference_id: referenceId,
        description: desc,
      },
      {
        user_id: toUserId,
        type: map.received,
        amount_gbp: rounded,
        balance_after: recipientNext,
        counterparty_id: user.id,
        reference_type: referenceType,
        reference_id: referenceId,
        description: desc,
      },
    ]);

    return NextResponse.json({
      ok: true,
      amount: rounded,
      balance: senderNext,
      recipient_balance: recipientNext,
    });
  } catch (e: any) {
    console.error('wallet spend', e);
    return NextResponse.json(
      { error: e?.message || 'Spend failed' },
      { status: 500 }
    );
  }
}

