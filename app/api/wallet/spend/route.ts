import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type SpendType = 'tip' | 'unlock' | 'message_unlock' | 'call' | 'shop' | 'clip';

const TYPE_MAP: Record<SpendType, { sent: string; received: string; label: string }> = {
  tip: { sent: 'tip_sent', received: 'tip_received', label: 'Tip' },
  unlock: { sent: 'unlock_sent', received: 'unlock_received', label: 'Unlock' },
  message_unlock: { sent: 'unlock_sent', received: 'unlock_received', label: 'Message unlock' },
  call: { sent: 'call_sent', received: 'call_received', label: 'Voice call' },
  shop: { sent: 'shop_sent', received: 'shop_received', label: 'Shop purchase' },
  clip: { sent: 'clip_sent', received: 'clip_received', label: 'Clip purchase' },
};

export async function POST(request: Request) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const amount = Number(body?.amount);
    const toUserId = String(body?.to_user_id || '');
    const spendType = (body?.type || 'tip') as SpendType;
    const referenceType = body?.reference_type ? String(body.reference_type) : null;
    const referenceId = body?.reference_id ? String(body.reference_id) : null;
    const description = body?.description ? String(body.description) : undefined;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (amount > 10000) return NextResponse.json({ error: 'Amount too large' }, { status: 400 });
    if (!toUserId || toUserId === user.id) {
      return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 });
    }
    if (!TYPE_MAP[spendType]) return NextResponse.json({ error: 'Invalid spend type' }, { status: 400 });

    const roundedPence = Math.round(amount * 100);
    if (roundedPence <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });

    const { data: blk, error: blockErr } = await admin
      .from('blocks')
      .select('blocker_id')
      .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${toUserId}),and(blocker_id.eq.${toUserId},blocked_id.eq.${user.id})`)
      .limit(1);
    if (blockErr) return NextResponse.json({ error: 'Could not validate recipient' }, { status: 500 });
    if (blk?.length) {
      return NextResponse.json({ error: 'You can’t send this to that user', code: 'BLOCKED' }, { status: 403 });
    }

    const { data: recipient, error: recipientErr } = await admin
      .from('profiles')
      .select('min_tip_gbp, account_type')
      .eq('id', toUserId)
      .single();
    if (recipientErr || !recipient) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    if (recipient.account_type !== 'creator') {
      return NextResponse.json({ error: 'Recipient is not a creator account' }, { status: 400 });
    }

    if (spendType === 'tip') {
      const configuredMin = Number(recipient.min_tip_gbp);
      const minTip = Number.isFinite(configuredMin) && configuredMin > 2 ? configuredMin : 2;
      if (roundedPence < Math.round(minTip * 100)) {
        return NextResponse.json({
          error: `Minimum tip is £${minTip.toFixed(2)}`,
          code: 'TIP_TOO_LOW',
          min_tip_gbp: minTip,
        }, { status: 400 });
      }
    }

    const suppliedKey = body?.idempotency_key ? String(body.idempotency_key) : null;
    const idempotencyKey = suppliedKey ||
      (referenceId && referenceType
        ? `wallet-spend:${user.id}:${spendType}:${referenceType}:${referenceId}`
        : `wallet-spend:${user.id}:${spendType}:${randomUUID()}`);

    const { data, error } = await admin.rpc('post_creator_wallet_transfer', {
      p_sender_id: user.id,
      p_creator_id: toUserId,
      p_gross_pence: roundedPence,
      p_sent_type: TYPE_MAP[spendType].sent,
      p_received_type: TYPE_MAP[spendType].received,
      p_reference_type: referenceType,
      p_reference_id: referenceId,
      p_idempotency_key: idempotencyKey,
      p_description: description || `${TYPE_MAP[spendType].label} £${(roundedPence / 100).toFixed(2)}`,
    });

    if (error) {
      const message = error.message || 'Wallet transfer failed';
      if (message.includes('Insufficient wallet balance')) {
        return NextResponse.json({ error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' }, { status: 402 });
      }
      if (message.includes('not a creator')) {
        return NextResponse.json({ error: 'Recipient is not a creator account' }, { status: 400 });
      }
      if (message.includes('Incomplete prior transfer')) {
        return NextResponse.json({ error: 'Transfer requires reconciliation', code: 'RECONCILIATION_REQUIRED' }, { status: 409 });
      }
      console.error('wallet transfer RPC', error);
      return NextResponse.json({ error: 'Wallet transfer failed' }, { status: 500 });
    }

    const result = data as {
      ok?: boolean; already?: boolean; gross_gbp?: number; fee_gbp?: number;
      net_gbp?: number; sender_balance?: number; creator_balance?: number;
    };
    return NextResponse.json({
      ok: true,
      already: Boolean(result?.already),
      amount: result?.gross_gbp,
      fee_gbp: result?.fee_gbp,
      net_gbp: result?.net_gbp,
      balance: result?.sender_balance,
      recipient_balance: result?.creator_balance,
    });
  } catch (e: unknown) {
    console.error('wallet spend', e);
    return NextResponse.json({ error: 'Spend failed' }, { status: 500 });
  }
}
