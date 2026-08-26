import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe, validateTopUpAmount } from '../../../../lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        {
          error:
            'Stripe is not configured. Add STRIPE_SECRET_KEY in Vercel → Settings → Environment Variables, then redeploy.',
        },
        { status: 500 }
      );
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          error:
            'Missing SUPABASE_SERVICE_ROLE_KEY on Vercel. Add it and redeploy.',
        },
        { status: 500 }
      );
    }

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
      return NextResponse.json({ error: 'Invalid session — log in again' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const amount = Number(body?.amount);
    const amountError = validateTopUpAmount(amount);
    if (amountError) {
      return NextResponse.json({ error: amountError }, { status: 400 });
    }

    const fromRaw = String(body?.from || 'account').toLowerCase();
    const from =
      fromRaw === 'dashboard'
        ? 'dashboard'
        : fromRaw === 'live'
          ? 'live'
          : 'account';

    const amountPence = Math.round(amount * 100);
    const origin = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      request.headers.get('origin') ||
      'https://www.worldofdommes.com'
    ).replace(/\/$/, '');

    // Mid-live top-up: return to the same live after Stripe
    let liveReturn = '';
    const rawReturn = String(body?.return_to || '');
    if (
      from === 'live' &&
      rawReturn.startsWith('/live/') &&
      !rawReturn.includes('//') &&
      !rawReturn.includes('\\')
    ) {
      liveReturn = rawReturn.split('?')[0].split('#')[0].slice(0, 180);
    }

    const stripe = getStripe();

    const successUrl = liveReturn
      ? `${origin}${liveReturn}?topup=success&session_id={CHECKOUT_SESSION_ID}`
      : `${origin}/wallet?topup=success&session_id={CHECKOUT_SESSION_ID}&from=${from}`;
    const cancelUrl = liveReturn
      ? `${origin}${liveReturn}?topup=cancelled`
      : `${origin}/wallet?topup=cancelled&from=${from}`;

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
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      customer_email: user.email || undefined,
      metadata: {
        user_id: user.id,
        type: 'wallet_top_up',
        amount_gbp: String(amount),
      },
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          type: 'wallet_top_up',
          amount_gbp: String(amount),
        },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Stripe did not return a checkout URL' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      url: session.url,
      session_id: session.id,
    });
  } catch (e: any) {
    console.error('wallet top-up', e);
    const msg = e?.message || 'Could not start top-up';
    // Common Stripe errors made clearer
    if (msg.includes('Invalid API Key') || msg.includes('api_key')) {
      return NextResponse.json(
        {
          error:
            'Invalid Stripe secret key. Use the sk_test_… key from Stripe Dashboard → Developers → API keys (same mode as your publishable key).',
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
