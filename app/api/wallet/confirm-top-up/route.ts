import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '../../../../lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * After Stripe Checkout success, client calls this with session_id.
 * Verifies payment with Stripe and credits the wallet (idempotent).
 * Works even if the webhook is delayed or misconfigured.
 */
async function creditTopUp(opts: {
  userId: string;
  amountGbp: number;
  sessionId: string;
}) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: existing } = await admin
    .from('wallet_transactions')
    .select('id, balance_after')
    .eq('user_id', opts.userId)
    .eq('type', 'top_up')
    .eq('reference_id', opts.sessionId)
    .maybeSingle();

  if (existing) {
    const { data: profile } = await admin
      .from('profiles')
      .select('balance_gbp')
      .eq('id', opts.userId)
      .single();
    return {
      already: true,
      balance: Number(profile?.balance_gbp ?? existing.balance_after ?? 0),
    };
  }

  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('balance_gbp')
    .eq('id', opts.userId)
    .single();

  if (pErr || !profile) {
    throw new Error('Profile not found');
  }

  const current = Number(profile.balance_gbp || 0);
  const next = Math.round((current + opts.amountGbp) * 100) / 100;

  const { error: upErr } = await admin
    .from('profiles')
    .update({ balance_gbp: next })
    .eq('id', opts.userId);

  if (upErr) {
    throw new Error(upErr.message);
  }

  const { error: txErr } = await admin.from('wallet_transactions').insert({
    user_id: opts.userId,
    type: 'top_up',
    amount_gbp: opts.amountGbp,
    balance_after: next,
    reference_type: 'stripe_checkout',
    reference_id: opts.sessionId,
    description: `Wallet top-up £${opts.amountGbp.toFixed(2)}`,
  });

  if (txErr) {
    // Rollback balance if ledger insert fails
    await admin
      .from('profiles')
      .update({ balance_gbp: current })
      .eq('id', opts.userId);
    throw new Error(txErr.message);
  }

  return { already: false, balance: next };
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
      error: userErr,
    } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const sessionId = String(body.session_id || '').trim();
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Payment not completed yet', status: session.payment_status },
        { status: 400 }
      );
    }

    const metaUser =
      session.metadata?.user_id || session.client_reference_id || '';
    if (metaUser !== user.id) {
      return NextResponse.json({ error: 'Session does not match user' }, { status: 403 });
    }

    if (session.metadata?.type && session.metadata.type !== 'wallet_top_up') {
      return NextResponse.json({ error: 'Not a wallet top-up' }, { status: 400 });
    }

    let amountGbp = Number(session.metadata?.amount_gbp);
    if (!Number.isFinite(amountGbp) || amountGbp <= 0) {
      // Fallback: Stripe amount_total is in pence
      amountGbp = Math.round(Number(session.amount_total || 0)) / 100;
    }

    if (!Number.isFinite(amountGbp) || amountGbp <= 0) {
      return NextResponse.json({ error: 'Invalid amount on session' }, { status: 400 });
    }

    const result = await creditTopUp({
      userId: user.id,
      amountGbp,
      sessionId: session.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('confirm-top-up', e);
    return NextResponse.json(
      { error: e?.message || 'Could not confirm top-up' },
      { status: 500 }
    );
  }
}
