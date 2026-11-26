import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '../../../../lib/stripe';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Missing STRIPE_SECRET_KEY' }, { status: 500 });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = request.headers.get('stripe-signature');
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET is not configured; refusing unsigned webhook');
      return NextResponse.json({ error: 'Webhook is not configured' }, { status: 500 });
    }
    if (!signature) {
      return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
    }

    const stripe = getStripe();
    const rawBody = await request.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid signature';
      console.error('Stripe webhook signature verification failed', message);
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
    }

    if (event.type !== 'checkout.session.completed') {
      return NextResponse.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    // Preserve the existing optional saved-card setup flow.
    if (session.mode === 'setup' || session.metadata?.type === 'save_card') {
      const userId = session.metadata?.user_id || session.client_reference_id;
      if (!userId || !session.setup_intent) {
        return NextResponse.json({ received: true, skipped: true });
      }

      const setup = typeof session.setup_intent === 'string'
        ? await stripe.setupIntents.retrieve(session.setup_intent)
        : session.setup_intent;
      const paymentMethodId = typeof setup.payment_method === 'string'
        ? setup.payment_method
        : setup.payment_method?.id;

      if (!paymentMethodId) {
        return NextResponse.json({ received: true, skipped: true });
      }

      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { error: profileErr } = await admin
        .from('profiles')
        .update({
          stripe_customer_id:
            typeof session.customer === 'string'
              ? session.customer
              : session.customer?.id || null,
          stripe_payment_method_id: paymentMethodId,
          card_brand: paymentMethod.card?.brand || null,
          card_last4: paymentMethod.card?.last4 || null,
        })
        .eq('id', userId);

      if (profileErr) {
        console.error('saved card profile update', profileErr);
        return NextResponse.json({ error: 'Could not save payment method' }, { status: 500 });
      }

      return NextResponse.json({ received: true, saved_card: true });
    }

    if (session.metadata?.type !== 'wallet_top_up') {
      return NextResponse.json({ received: true, skipped: true });
    }

    if (session.mode !== 'payment' || session.payment_status !== 'paid' || session.currency !== 'gbp') {
      return NextResponse.json({ error: 'Wallet top-up payment is not a paid GBP session' }, { status: 400 });
    }

    const userId = session.metadata?.user_id || session.client_reference_id;
    const amountPence = Number(session.amount_total);
    const metadataAmount = Number(session.metadata?.amount_gbp);

    if (
      !userId ||
      !Number.isInteger(amountPence) ||
      amountPence < 1000 ||
      amountPence > 500000 ||
      !Number.isFinite(metadataAmount) ||
      Math.round(metadataAmount * 100) !== amountPence
    ) {
      return NextResponse.json({ error: 'Invalid wallet top-up metadata' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error: creditErr } = await admin.rpc('credit_wallet_top_up', {
      p_user_id: userId,
      p_amount_pence: amountPence,
      p_payment_reference: session.id,
      p_description: `Wallet top-up £${(amountPence / 100).toFixed(2)}`,
    });

    if (creditErr) {
      console.error('wallet top-up webhook credit RPC', creditErr);
      return NextResponse.json({ error: 'Could not credit wallet' }, { status: 500 });
    }

    const result = (data || {}) as {
      already?: boolean;
      amount_gbp?: number;
      balance?: number;
    };

    return NextResponse.json({
      received: true,
      already: Boolean(result.already),
      amount: Number(result.amount_gbp ?? amountPence / 100),
      balance: Number(result.balance ?? 0),
    });
  } catch (error: unknown) {
    console.error('wallet webhook handler', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
