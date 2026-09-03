import { createClient } from '@supabase/supabase-js';
import { getStripe } from './stripe';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getOrCreateStripeCustomer(userId: string, email?: string) {
  const db = admin();
  const { data: profile } = await db
    .from('profiles')
    .select('stripe_customer_id, username')
    .eq('id', userId)
    .single();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { user_id: userId },
    name: profile?.username || undefined,
  });

  await db
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId);

  return customer.id;
}

/** Charge saved card and credit the user's wallet. */
export async function chargeSavedCardToWallet(opts: {
  userId: string;
  amountGbp: number;
  reason: string;
}): Promise<
  | { ok: true; balance: number }
  | { ok: false; error: string; code?: string }
> {
  const amount = Math.round(Number(opts.amountGbp) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0.5) {
    return { ok: false, error: 'Amount too small to charge card', code: 'TOO_SMALL' };
  }

  const db = admin();
  const { data: profile } = await db
    .from('profiles')
    .select('stripe_customer_id, stripe_payment_method_id, balance_gbp')
    .eq('id', opts.userId)
    .single();

  if (!profile?.stripe_customer_id || !profile?.stripe_payment_method_id) {
    return { ok: false, error: 'No card on file', code: 'NO_CARD' };
  }

  const stripe = getStripe();
  try {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'gbp',
      customer: profile.stripe_customer_id,
      payment_method: profile.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      description: opts.reason,
      metadata: { user_id: opts.userId, type: 'wallet_backup' },
    });

    if (intent.status !== 'succeeded') {
      return { ok: false, error: 'Card payment needs authentication', code: 'AUTH_REQUIRED' };
    }

    const current = Number(profile.balance_gbp || 0);
    const next = Math.round((current + amount) * 100) / 100;
    await db.from('profiles').update({ balance_gbp: next }).eq('id', opts.userId);
    await db.from('wallet_transactions').insert({
      user_id: opts.userId,
      type: 'top_up',
      amount_gbp: amount,
      balance_after: next,
      reference_type: 'stripe_card',
      reference_id: intent.id,
      description: opts.reason,
    });
    return { ok: true, balance: next };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message || 'Card charge failed',
      code: 'CARD_FAILED',
    };
  }
}
