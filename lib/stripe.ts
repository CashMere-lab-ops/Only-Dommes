import Stripe from 'stripe';

let stripe: Stripe | null = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }
  if (!stripe) {
    stripe = new Stripe(key, {
      apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion,
    });
  }
  return stripe;
}

export const TOP_UP_PRESETS = [10, 25, 50, 100] as const;

export function validateTopUpAmount(amount: number): string | null {
  if (!Number.isFinite(amount) || amount < 5) {
    return 'Minimum top-up is £5';
  }
  if (amount > 5000) {
    return 'Maximum top-up is £5,000';
  }
  if (Math.round(amount * 100) / 100 !== amount) {
    return 'Use up to 2 decimal places';
  }
  return null;
}