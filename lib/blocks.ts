/** True if either user has blocked the other. */
export async function pairBlocked(
  db: any,
  a?: string | null,
  b?: string | null
): Promise<boolean> {
  if (!a || !b || a === b) return false;
  const { data } = await db
    .from('blocks')
    .select('blocker_id')
    .or(
      `and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`
    )
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}
