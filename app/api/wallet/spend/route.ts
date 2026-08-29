import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { splitCreatorEarn } from '../../../../lib/platform-fee';

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

    {
      const { data: blk } = await admin
        .from('blocks')
        .select('blocker_id')
        .or(
          `and(blocker_id.eq.${user.id},blocked_id.eq.${toUserId}),and(blocker_id.eq.${toUserId},blocked_id.eq.${user.id})`
        )
        .limit(1);
      if (blk && blk.length) {
        return NextResponse.json(
          { error: 'You can’t send this to that user', code: 'BLOCKED' },
          { status: 403 }
        );
      }
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
      .select('balance_gbp, min_tip_gbp')
      .eq('id', toUserId)
      .single();

    if (rErr || !recipient) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    if (spendType === 'tip') {
      const platformMin = 2;
      const cMin = Number(recipient.min_tip_gbp);
      const minTip =
        Number.isFinite(cMin) && cMin > platformMin ? cMin : platformMin;
      if (rounded < minTip) {
        return NextResponse.json(
          {
            error: `Minimum tip is £${minTip.toFixed(2)}`,
            code: 'TIP_TOO_LOW',
            min_tip_gbp: minTip,
          },
          { status: 400 }
        );
      }
    }

    const recipientBal = Number(recipient.balance_gbp || 0);
    const { gross_gbp, fee_gbp, net_gbp } = splitCreatorEarn(rounded);
    const senderNext = Math.round((senderBal - gross_gbp) * 100) / 100;
    const recipientNext = Math.round((recipientBal + net_gbp) * 100) / 100;

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
      `${map.label} £${gross_gbp.toFixed(2)}`;

    await admin.from('wallet_transactions').insert([
      {
        user_id: user.id,
        type: map.sent,
        amount_gbp: -gross_gbp,
        balance_after: senderNext,
        counterparty_id: toUserId,
        reference_type: referenceType,
        reference_id: referenceId,
        description: desc,
      },
      {
        user_id: toUserId,
        type: map.received,
        amount_gbp: net_gbp,
        balance_after: recipientNext,
        counterparty_id: user.id,
        reference_type: referenceType,
        reference_id: referenceId,
        description: `${desc} · kept £${net_gbp.toFixed(2)} after 20% fee`,
        gross_gbp,
        fee_gbp,
        net_gbp,
      },
    ]);

    return NextResponse.json({
      ok: true,
      amount: gross_gbp,
      fee_gbp,
      net_gbp,
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
