'use client';

import Link from 'next/link';
import { Wallet } from 'lucide-react';

type Props = {
  balance: number | null;
  /** Where the user returns from wallet */
  from?: 'dashboard' | 'account' | 'sidebar';
  /** Compact chip for mobile header */
  compact?: boolean;
  /** Sub accounts can show a soft top-up hint when low. Creators never see it. */
  showTopUpHint?: boolean;
  /** When 'creator', never show Top up */
  accountType?: string;
  className?: string;
};

export function formatGbp(n: number) {
  return `£${Number(n || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Always-visible wallet balance.
 * Click → /wallet
 */
export default function WalletBalance({
  balance,
  from = 'sidebar',
  compact = false,
  showTopUpHint = false,
  accountType,
  className = '',
}: Props) {
  const href =
    from === 'dashboard'
      ? '/wallet?from=dashboard'
      : from === 'account'
        ? '/wallet?from=account'
        : '/wallet?from=account';

  if (balance === null) {
    return (
      <div
        className={`animate-pulse rounded-full bg-zinc-800 ${
          compact ? 'h-7 w-16' : 'h-9 w-24'
        } ${className}`}
      />
    );
  }

  const low = accountType === 'sub' && balance < 10;

  if (compact) {
    return (
      <Link
        href={href}
        className={`inline-flex items-center gap-1.5 h-9 rounded-full border px-3 text-sm font-semibold leading-none whitespace-nowrap transition ${
          low
            ? 'border-pink-500/40 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20'
            : 'border-zinc-700 bg-zinc-900 text-pink-400 hover:border-pink-500/50 hover:bg-zinc-800'
        } ${className}`}
        title="Wallet"
      >
        <Wallet size={12} className="opacity-80" />
        {formatGbp(balance)}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3.5 py-2.5 transition hover:border-pink-500/40 hover:bg-zinc-900 ${className}`}
      title="Open wallet"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-500/15 text-pink-400 flex-shrink-0">
        <Wallet size={16} />
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 leading-none">
          Balance
        </p>
        <p className="text-sm font-semibold text-pink-400 tabular-nums leading-none">
          {formatGbp(balance)}
        </p>
      </div>
      {low && (
        <span className="text-[10px] font-medium text-pink-400/90 flex-shrink-0">
          Top up
        </span>
      )}
    </Link>
  );
}
