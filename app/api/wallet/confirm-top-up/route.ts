import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '../../../../lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * Browser return verification. Stripe is only the current sandbox adapter;
 * production wallet funding must use the approved production processor.
 * The database function makes this safe to race with the signed webhook.
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
    const sessionId = String(body?.session_id || '').trim();
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
    if (session.mode !== 'payment' || session.currency !== 'gbp') {
      return NextResponse.json({ error: 'Not a GBP wallet payment' }, { status: 400 });
    }

    const metaUser = session.metadata?.user_id || session.client_reference_id || '';
    if (metaUser !== user.id) {
      return NextResponse.json({ error: 'Session does not match user' }, { status: 403 });
    }
    if (session.metadata?.type !== 'wallet_top_up') {
      return NextResponse.json({ error: 'Not a wallet top-up' }, { status: 400 });
    }

    const amountPence = Number(session.amount_total);
    const metadataAmount = Number(session.metadata?.amount_gbp);
    if (
      !Number.isInteger(amountPence) ||
      amountPence < 1000 ||
      amountPence > 500000 ||
      !Number.isFinite(metadataAmount) ||
      Math.round(metadataAmount * 100) !== amountPence
    ) {
      return NextResponse.json({ error: 'Invalid amount on payment session' }, { status: 400 });
    }

    const { data, error: creditErr } = await admin.rpc('credit_wallet_top_up', {
      p_user_id: user.id,
      p_amount_pence: amountPence,
      p_payment_reference: session.id,
      p_description: `Wallet top-up £${(amountPence / 100).toFixed(2)}`,
    });

    if (creditErr) {
      console.error('wallet top-up credit RPC', creditErr);
      return NextResponse.json({ error: 'Could not credit wallet' }, { status: 500 });
    }

    const result = (data || {}) as {
      already?: boolean;
      amount_gbp?: number;
      balance?: number;
    };

    return NextResponse.json({
      ok: true,
      already: Boolean(result.already),
      amount: Number(result.amount_gbp ?? amountPence / 100),
      balance: Number(result.balance ?? 0),
    });
  } catch (error: unknown) {
    console.error('confirm-top-up', error);
    return NextResponse.json({ error: 'Could not confirm top-up' }, { status: 500 });
  }
}
