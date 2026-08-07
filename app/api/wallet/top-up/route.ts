import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe, validateTopUpAmount } from '../../../../lib/stripe';

export const dynamic = 'force-dynamic';

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
    const amountError = validateTopUpAmount(amount);
    if (amountError) {
      return NextResponse.json({ error: amountError }, { status: 400 });
    }

    const amountPence = Math.round(amount * 100);
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      request.headers.get('origin') ||
      'https://www.worldofdommes.com';

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: amountPence,
            product_data: {
              name: 'Wallet top-up',
              description: `Add £${amount.toFixed(2)} to your World of Dommes balance`,
            },
          },
        },
      ],
      success_url: `${origin}/wallet?topup=success`,
      cancel_url: `${origin}/wallet?topup=cancelled`,
      client_reference_id: user.id,
      customer_email: user.email || undefined,
      metadata: {
        user_id: user.id,
        type: 'wallet_top_up',
        amount_gbp: amount.toFixed(2),
      },
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          type: 'wallet_top_up',
          amount_gbp: amount.toFixed(2),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
      session_id: session.id,
    });
  } catch (e: any) {
    console.error('wallet top-up', e);
    return NextResponse.json(
      { error: e?.message || 'Could not start top-up' },
      { status: 500 }
    );
  }
}