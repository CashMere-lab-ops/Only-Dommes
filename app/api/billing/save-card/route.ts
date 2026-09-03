import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStripe } from '../../../../lib/stripe';
import { getOrCreateStripeCustomer } from '../../../../lib/billing';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const {
      data: { user },
    } = await admin.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const customerId = await getOrCreateStripeCustomer(user.id, user.email);
    const origin = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      request.headers.get('origin') ||
      'https://www.worldofdommes.com'
    ).replace(/\/$/, '');

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      currency: 'gbp',
      success_url: `${origin}/wallet?card=saved`,
      cancel_url: `${origin}/wallet?card=cancel`,
      metadata: { user_id: user.id, type: 'save_card' },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not start card setup' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Login required' }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const {
    data: { user },
  } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { data } = await admin
    .from('profiles')
    .select('card_brand, card_last4, stripe_payment_method_id')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    saved: !!data?.stripe_payment_method_id,
    brand: data?.card_brand || null,
    last4: data?.card_last4 || null,
  });
}

export async function DELETE(request: Request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Login required' }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const {
    data: { user },
  } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  await admin
    .from('profiles')
    .update({
      stripe_payment_method_id: null,
      card_brand: null,
      card_last4: null,
    })
    .eq('id', user.id);

  return NextResponse.json({ ok: true });
}
