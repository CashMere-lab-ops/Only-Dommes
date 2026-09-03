import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '../../../../lib/stripe';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

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
    .select('id')
    .eq('user_id', opts.userId)
    .eq('type', 'top_up')
    .eq('reference_id', opts.sessionId)
    .maybeSingle();

  if (existing) {
    return { already: true };
  }

  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('balance_gbp')
    .eq('id', opts.userId)
    .single();

  if (pErr || !profile) {
    throw new Error('Profile not found for top-up');
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

  const full = await admin.from('wallet_transactions').insert({
    user_id: opts.userId,
    type: 'top_up',
    amount_gbp: opts.amountGbp,
    balance_after: next,
    reference_type: 'stripe_checkout',
    reference_id: opts.sessionId,
    description: `Wallet top-up £${opts.amountGbp.toFixed(2)}`,
  });

  if (full.error) {
    const minimal = await admin.from('wallet_transactions').insert({
      user_id: opts.userId,
      type: 'top_up',
      amount_gbp: opts.amountGbp,
      reference_id: opts.sessionId,
    });
    if (minimal.error) {
      await admin
        .from('profiles')
        .update({ balance_gbp: current })
        .eq('id', opts.userId);
      throw new Error(minimal.error.message);
    }
  }

  return { already: false, balance: next };
}

export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Missing STRIPE_SECRET_KEY' }, { status: 500 });
    }

    const stripe = getStripe();
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');

    let event: Stripe.Event;

    try {
      if (whSecret && sig) {
        event = stripe.webhooks.constructEvent(body, sig, whSecret);
      } else {
        event = JSON.parse(body) as Stripe.Event;
      }
    } catch (err: any) {
      console.error('webhook signature', err?.message);
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      );
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === 'setup' || session.metadata?.type === 'save_card') {
        const userId = session.metadata?.user_id || session.client_reference_id;
        if (!userId || !session.setup_intent) {
          return NextResponse.json({ received: true, skipped: true });
        }
        const stripe = getStripe();
        const setup =
          typeof session.setup_intent === 'string'
            ? await stripe.setupIntents.retrieve(session.setup_intent)
            : session.setup_intent;
        const pmId =
          typeof setup.payment_method === 'string'
            ? setup.payment_method
            : setup.payment_method?.id;
        if (!pmId) return NextResponse.json({ received: true, skipped: true });

        const pm = await stripe.paymentMethods.retrieve(pmId);
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        await admin
          .from('profiles')
          .update({
            stripe_customer_id:
              typeof session.customer === 'string'
                ? session.customer
                : session.customer?.id || null,
            stripe_payment_method_id: pmId,
            card_brand: pm.card?.brand || null,
            card_last4: pm.card?.last4 || null,
          })
          .eq('id', userId);
        return NextResponse.json({ received: true, saved_card: true });
      }

      if (session.metadata?.type !== 'wallet_top_up') {
        return NextResponse.json({ received: true, skipped: true });
      }

      const userId = session.metadata?.user_id || session.client_reference_id;
      let amountGbp = Number(session.metadata?.amount_gbp);
      if (!Number.isFinite(amountGbp) || amountGbp <= 0) {
        amountGbp = Math.round(Number(session.amount_total || 0)) / 100;
      }

      if (!userId || !Number.isFinite(amountGbp) || amountGbp <= 0) {
        return NextResponse.json(
          { error: 'Invalid session metadata' },
          { status: 400 }
        );
      }

      const result = await creditTopUp({
        userId,
        amountGbp,
        sessionId: session.id,
      });

      return NextResponse.json({ received: true, ...result });
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('webhook handler', e);
    return NextResponse.json(
      { error: e?.message || 'Handler failed' },
      { status: 500 }
    );
  }
}
