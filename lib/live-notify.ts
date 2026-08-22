/**
 * Notify followers that a creator went live.
 * Safe to call multiple times for the same stream — skips users already notified.
 */
export async function notifyFollowersLive(
  admin: any,
  creatorId: string,
  streamId: string,
  title: string
): Promise<{ ok: boolean; notified: number; error?: string }> {
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', creatorId)
      .maybeSingle();

    const creatorName =
      profile?.display_name || profile?.username || 'A creator';

    const { data: followers, error: fErr } = await admin
      .from('follows')
      .select('follower_id')
      .eq('following_id', creatorId)
      .limit(1000);

    if (fErr) {
      console.error('live notify follows', fErr);
      return { ok: false, notified: 0, error: fErr.message };
    }

    const raw: any[] = Array.isArray(followers) ? followers : [];
    const seen: Record<string, true> = {};
    const ids: string[] = [];
    for (let i = 0; i < raw.length; i++) {
      const id = String(raw[i]?.follower_id || '');
      if (!id || id === creatorId || seen[id]) continue;
      seen[id] = true;
      ids.push(id);
    }

    if (ids.length === 0) {
      return { ok: true, notified: 0, error: 'no_followers' };
    }

    const link = `/live/${streamId}`;

    // Skip users who already got a live notify for this stream
    const { data: existing } = await admin
      .from('notifications')
      .select('user_id')
      .eq('type', 'live')
      .eq('link', link)
      .in('user_id', ids.slice(0, 300));

    const already: Record<string, true> = {};
    const existingRows: any[] = Array.isArray(existing) ? existing : [];
    for (let i = 0; i < existingRows.length; i++) {
      const uid = String(existingRows[i]?.user_id || '');
      if (uid) already[uid] = true;
    }

    const targets: string[] = [];
    for (let i = 0; i < ids.length && targets.length < 500; i++) {
      if (!already[ids[i]]) targets.push(ids[i]);
    }

    if (targets.length === 0) {
      return { ok: true, notified: 0, error: 'already_notified' };
    }

    // Minimal columns — matches createNotification() client inserts
    const rows: any[] = [];
    for (let i = 0; i < targets.length; i++) {
      rows.push({
        user_id: targets[i],
        actor_id: creatorId,
        type: 'live',
        title: `${creatorName} is live`,
        body: title || 'Live now',
        link,
      });
    }

    let notified = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const { error: insErr } = await admin.from('notifications').insert(chunk);
      if (insErr) {
        console.error('live notify insert', insErr);
        // One-by-one fallback so one bad row does not block everyone
        for (let j = 0; j < chunk.length; j++) {
          const { error: oneErr } = await admin
            .from('notifications')
            .insert(chunk[j]);
          if (!oneErr) notified += 1;
          else console.error('live notify one', oneErr);
        }
      } else {
        notified += chunk.length;
      }
    }

    return { ok: true, notified };
  } catch (e: any) {
    console.error('notifyFollowersLive', e);
    return { ok: false, notified: 0, error: e?.message || 'notify failed' };
  }
}
