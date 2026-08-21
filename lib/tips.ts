/** Platform-wide minimum tip (GBP). Creators may set higher in Settings. */
export const PLATFORM_MIN_TIP_GBP = 2;

export function effectiveMinTip(creatorMin?: number | null): number {
  const c = Number(creatorMin);
  if (!Number.isFinite(c) || c < PLATFORM_MIN_TIP_GBP) {
    return PLATFORM_MIN_TIP_GBP;
  }
  return Math.min(500, Math.round(c * 100) / 100);
}
