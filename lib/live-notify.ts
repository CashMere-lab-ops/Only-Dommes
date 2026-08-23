/**
 * Notify followers that a creator went live.
 * Safe to call multiple times for the same stream — skips users already notified.
 * Returns detailed status for debugging.
 */
export async function notifyFollowersLive(
  admin: any,
  creatorId: string,
  streamId: string,
  title: string
): Promise<{
  ok: boolean;
  notified: number;
  followerCount: number;
  error?: string;
  insertError?: string;
}> {
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
      return {
        ok: false,
        notified: 0,
        followerCount: 0,
        error: `follows: ${fErr.message}`,
      };
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
      return {
        ok: true,
        notified: 0,
        followerCount: 0,
        error: 'no_followers',
      };
    }

    const link = `/live/${streamId}`;
    const notifTitle = `${creatorName} is live`;
    const notifBody = title || 'Live now';

    let already: Record<string, true> = {};
    try {
      const { data: existing } = await admin
        .from('notifications')
        .select('user_id')
        .eq('type', 'live')
        .eq('link', link)
        .in('user_id', ids.slice(0, 300));
      const existingRows: any[] = Array.isArray(existing) ? existing : [];
      for (let i = 0; i < existingRows.length; i++) {
        const uid = String(existingRows[i]?.user_id || '');
        if (uid) already[uid] = true;
      }
    } catch {
      already = {};
    }

    const targets: string[] = [];
    for (let i = 0; i < ids.length && targets.length < 500; i++) {
      if (!already[ids[i]]) targets.push(ids[i]);
    }

    if (targets.length === 0) {
      return {
        ok: true,
        notified: 0,
        followerCount: ids.length,
        error: 'already_notified',
      };
    }

    let notified = 0;
    let lastInsertError = '';

    for (let i = 0; i < targets.length; i++) {
      const row: any = {
        user_id: targets[i],
        actor_id: creatorId,
        type: 'live',
        title: notifTitle,
        body: notifBody,
        link,
      };

      const { error: insErr } = await admin.from('notifications').insert(row);

      if (insErr) {
        lastInsertError = insErr.message || String(insErr);
        console.error('live notify insert', insErr);

        const { error: e2 } = await admin.from('notifications').insert({
          user_id: targets[i],
          actor_id: creatorId,
          type: 'live',
          title: notifTitle,
          link,
        });
        if (!e2) {
          notified += 1;
          continue;
        }
        lastInsertError = e2.message || lastInsertError;

        // Fallback if CHECK constraint blocks type "live"
        const { error: e3 } = await admin.from('notifications').insert({
          user_id: targets[i],
          actor_id: creatorId,
          type: 'message',
          title: notifTitle,
          body: notifBody,
          link,
        });
        if (!e3) {
          notified += 1;
          continue;
        }
        lastInsertError = e3.message || lastInsertError;
      } else {
        notified += 1;
      }
    }

    return {
      ok: notified > 0,
      notified,
      followerCount: ids.length,
      error: notified === 0 ? 'insert_failed' : undefined,
      insertError: lastInsertError || undefined,
    };
  } catch (e: any) {
    console.error('notifyFollowersLive', e);
    return {
      ok: false,
      notified: 0,
      followerCount: 0,
      error: e?.message || 'notify failed',
    };
  }
}
