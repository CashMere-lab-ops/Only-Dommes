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

/** Insert block, drop follows both ways, ban them from your current lives. */
export async function applyUserBlock(
  db: any,
  blockerId: string,
  blockedId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!blockerId || !blockedId || blockerId === blockedId) {
    return { ok: false, error: 'Invalid' };
  }

  const { error } = await db.from('blocks').insert({
    blocker_id: blockerId,
    blocked_id: blockedId,
  });
  if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
    return { ok: false, error: error.message };
  }

  await db
    .from('follows')
    .delete()
    .or(
      `and(follower_id.eq.${blockerId},following_id.eq.${blockedId}),and(follower_id.eq.${blockedId},following_id.eq.${blockerId})`
    );

  const { data: streams } = await db
    .from('live_streams')
    .select('id')
    .eq('creator_id', blockerId)
    .in('status', ['active', 'idle_ready', 'disconnected']);

  for (const s of streams || []) {
    await db
      .from('live_stream_moderation')
      .delete()
      .eq('stream_id', s.id)
      .eq('user_id', blockedId);
    await db.from('live_stream_moderation').insert({
      stream_id: s.id,
      user_id: blockedId,
      action: 'ban',
      created_by: blockerId,
    });
  }

  return { ok: true };
}
