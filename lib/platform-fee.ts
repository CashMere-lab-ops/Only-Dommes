/** World of Dommes — 20% platform fee on creator earns (LoyalFans-style) */

export const PLATFORM_FEE_PERCENT = 20;

/**
 * Split a gross amount (what the fan paid) into fee + creator net.
 * £10.00 → fee £2.00, net £8.00
 */
export function splitCreatorEarn(grossGbp: number): {
  gross_gbp: number;
  fee_gbp: number;
  net_gbp: number;
} {
  const grossPence = Math.round(Number(grossGbp) * 100);
  if (!Number.isFinite(grossPence) || grossPence <= 0) {
    return { gross_gbp: 0, fee_gbp: 0, net_gbp: 0 };
  }
  const feePence = Math.round((grossPence * PLATFORM_FEE_PERCENT) / 100);
  const netPence = grossPence - feePence;
  return {
    gross_gbp: grossPence / 100,
    fee_gbp: feePence / 100,
    net_gbp: netPence / 100,
  };
}