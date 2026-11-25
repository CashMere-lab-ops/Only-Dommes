import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Charge a completed voice call from the subscriber wallet.
 * Either participant can trigger this endpoint; the call ID is the idempotency key.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
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

    const { data: call, error: callErr } = await admin
      .from('voice_calls')
      .select('id, subscriber_id, creator_id, amount_charged, status')
      .eq('id', callId)
      .single();

    if (callErr || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (user.id !== call.subscriber_id && user.id !== call.creator_id) {
      return NextResponse.json({ error: 'Not your call' }, { status: 403 });
    }

    const amount = Number(call.amount_charged || 0);
    if (!Number.isFinite(amount) || amount <= 0 || ['failed', 'cancelled'].includes(call.status)) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_charge' });
    }

    const grossPence = Math.round(amount * 100);
    if (grossPence <= 0 || grossPence > 1000000) {
      return NextResponse.json({ error: 'Invalid call charge' }, { status: 400 });
    }
    const gross = grossPence / 100;

    // Preserve idempotency for calls charged before this migration.
    const { data: existing, error: existingErr } = await admin
      .from('wallet_transactions')
      .select('id')
      .eq('type', 'call_sent')
      .eq('reference_id', callId)
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      console.error('call charge duplicate check', existingErr);
      return NextResponse.json({ error: 'Could not verify call charge' }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({ ok: true, already: true });
    }

    const { data, error: transferErr } = await admin.rpc('post_creator_wallet_transfer', {
      p_sender_id: call.subscriber_id,
      p_creator_id: call.creator_id,
      p_gross_pence: grossPence,
      p_sent_type: 'call_sent',
      p_received_type: 'call_received',
      p_reference_type: 'voice_call',
      p_reference_id: callId,
      p_idempotency_key: `voice-call:${callId}`,
      p_description: `Voice call £${gross.toFixed(2)}`,
    });

    if (transferErr) {
      const message = transferErr.message || 'Call charge failed';
      if (message.includes('Insufficient wallet balance')) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Insufficient balance',
            code: 'INSUFFICIENT_BALANCE',
            needed: gross,
          },
          { status: 402 }
        );
      }
      if (message.includes('Incomplete prior transfer')) {
        return NextResponse.json(
          { error: 'Call charge requires reconciliation', code: 'RECONCILIATION_REQUIRED' },
          { status: 409 }
        );
      }
      console.error('call charge RPC', transferErr);
      return NextResponse.json({ error: 'Call charge failed' }, { status: 500 });
    }

    const result = data as {
      already?: boolean;
      gross_gbp?: number;
      fee_gbp?: number;
      net_gbp?: number;
    } | null;

    return NextResponse.json({
      ok: true,
      already: Boolean(result?.already),
      amount: Number(result?.gross_gbp ?? gross),
      fee_gbp: Number(result?.fee_gbp ?? 0),
      net_gbp: Number(result?.net_gbp ?? 0),
    });
  } catch (error: unknown) {
    console.error('charge-call', error);
    return NextResponse.json({ error: 'Call charge failed' }, { status: 500 });
  }
}
