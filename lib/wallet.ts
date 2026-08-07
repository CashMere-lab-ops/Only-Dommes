import { createClient } from './supabase';

export type SpendType =
  | 'tip'
  | 'unlock'
  | 'message_unlock'
  | 'call'
  | 'shop';

export type SpendResult =
  | { ok: true; amount: number; balance: number; already?: boolean }
  | {
      ok: false;
      error: string;
      code?: string;
      balance?: number;
      needed?: number;
    };

/**
 * Spend from the logged-in user's wallet balance.
 * Credits the recipient and writes ledger rows.
 */
export async function spendFromWallet(opts: {
  amount: number;
  toUserId: string;
  type: SpendType;
  referenceType?: string;
  referenceId?: string;
  description?: string;
}): Promise<SpendResult> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, error: 'Please log in again' };
  }

  const res = await fetch('/api/wallet/spend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      amount: opts.amount,
      to_user_id: opts.toUserId,
      type: opts.type,
      reference_type: opts.referenceType,
      reference_id: opts.referenceId,
      description: opts.description,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      ok: false,
      error: data.error || 'Payment failed',
      code: data.code,
      balance: data.balance,
      needed: data.needed,
    };
  }

  return {
    ok: true,
    amount: data.amount,
    balance: data.balance,
    already: data.already,
  };
}

export function insufficientFundsMessage(needed?: number, balance?: number) {
  const n = needed != null ? `£${Number(needed).toFixed(2)}` : 'this amount';
  const b =
    balance != null ? ` Your balance is £${Number(balance).toFixed(2)}.` : '';
  return `Not enough wallet balance for ${n}.${b} Top up your wallet first.`;
}
