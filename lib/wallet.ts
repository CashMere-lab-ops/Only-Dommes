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

/** Update sidebar / mobile balance chip after a successful spend or top-up */
export function notifyBalanceUpdated(balance: number) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('wod-balance-updated', { detail: balance })
  );
}

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

  if (typeof data.balance === 'number') {
    notifyBalanceUpdated(data.balance);
  }

  return {
    ok: true,
    amount: data.amount,
    balance: data.balance,
    already: data.already,
  };
}

/**
 * Friendly message when balance is too low.
 * Use with handleInsufficientBalance() for Top up redirect.
 */
export function insufficientFundsMessage(needed?: number, balance?: number) {
  const need =
    needed != null
      ? `£${Number(needed).toLocaleString('en-GB', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : 'this';
  const have =
    balance != null
      ? ` You have £${Number(balance).toLocaleString('en-GB', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}.`
      : '';
  return `Not enough balance for ${need}.${have}\n\nTop up your wallet to continue.`;
}

/**
 * Show low-balance alert and offer to open wallet.
 * Returns true if user chose to go to wallet.
 */
export function handleInsufficientBalance(opts: {
  needed?: number;
  balance?: number;
  from?: 'account' | 'dashboard';
}): boolean {
  const msg = insufficientFundsMessage(opts.needed, opts.balance);
  const go = window.confirm(`${msg}\n\nOpen wallet to top up?`);
  if (go) {
    const q =
      opts.from === 'dashboard' ? '?from=dashboard' : '?from=account';
    window.location.href = `/wallet${q}`;
  }
  return go;
}
