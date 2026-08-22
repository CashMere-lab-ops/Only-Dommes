import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

async function notifyFollowersLive(
  admin: any,
  creatorId: string,
  creatorName: string,
  streamId: string,
  title: string
) {
  try {
    const { data: followers, error: fErr } = await admin
      .from('follows')
      .select('follower_id')
      .eq('following_id', creatorId)
      .limit(800);

    if (fErr) {
      console.error('live notify follows', fErr);
      return;
    }

    const ids: string[] = [
      ...new Set(
        (followers || [])
          .map((f: any) => String(f.follower_id || ''))
          .filter((id: string) => id.length > 0 && id !== creatorId)
      ),
    ];
    if (!ids.length) return;

    // Avoid spam: skip if we already notified this follower for this stream
    const { data: existing } = await admin
      .from('notifications')
      .select('user_id')
      .eq('actor_id', creatorId)
      .eq('type', 'live')
      .eq('link', `/live/${streamId}`)
      .in('user_id', ids.slice(0, 200));

    const already = new Set(
      (existing || []).map((r: any) => String(r.user_id || ''))
    );
    const targets = ids
      .filter((id: string) => !already.has(id))
      .slice(0, 500);
    if (!targets.length) return;

    const rows = targets.map((followerId) => ({
      user_id: followerId,
      actor_id: creatorId,
      type: 'live',
      title: `${creatorName} is live`,
      body: title,
      link: `/live/${streamId}`,
      is_read: false,
    }));

    for (let i = 0; i < rows.length; i += 80) {
      const chunk = rows.slice(i, i + 80);
      const { error: insErr } = await admin
        .from('notifications')
        .insert(chunk as any);
      if (insErr) {
        console.error('live notify insert', insErr);
        const slim = chunk.map(({ is_read: _r, ...rest }) => rest);
        await admin.from('notifications').insert(slim as any);
      }
    }
  } catch (e) {
    console.error('live notifyFollowersLive', e);
  }
}

/**
 * Creator starts an in-platform live (LiveKit room).
 * Thumbnail required. Notifies followers (new + resume if not yet notified for this stream).
 */
export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('account_type, display_name, username, avatar_url')
      .eq('id', user.id)
      .single();

    if (profile?.account_type !== 'creator') {
      return NextResponse.json(
        { error: 'Only creators can go live' },
        { status: 403 }
      );
    }

    const { data: existing } = await admin
      .from('live_streams')
      .select('*')
      .eq('creator_id', user.id)
      .in('status', ['idle_ready', 'active', 'disconnected'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const body = await request.json().catch(() => ({}));
    const title =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 80)
        : `${profile.display_name || profile.username || 'Creator'} is live`;

    const tipGoal = Math.max(0, Number(body.tip_goal_gbp) || 0);
    const thumbnailUrl =
      typeof body.thumbnail_url === 'string' && body.thumbnail_url.trim()
        ? body.thumbnail_url.trim().slice(0, 500)
        : null;

    const creatorName =
      profile.display_name || profile.username || 'A creator';

    if (existing) {
      const nextThumb = thumbnailUrl || existing.thumbnail_url || null;
      if (!nextThumb) {
        return NextResponse.json(
          {
            error: 'Add a cover image before going live',
            code: 'THUMBNAIL_REQUIRED',
          },
          { status: 400 }
        );
      }
      const patch: Record<string, any> = {
        title,
        tip_goal_gbp: tipGoal,
        updated_at: new Date().toISOString(),
        thumbnail_url: nextThumb,
      };
      await admin.from('live_streams').update(patch).eq('id', existing.id);
      const { data: updated } = await admin
        .from('live_streams')
        .select('*')
        .eq('id', existing.id)
        .single();

      // Still notify if this stream never pushed to followers yet
      await notifyFollowersLive(
        admin,
        user.id,
        creatorName,
        existing.id,
        title
      );

      return NextResponse.json({
        ok: true,
        resumed: true,
        stream: updated || { ...existing, ...patch },
        watchPath: `/live/${existing.id}`,
      });
    }

    if (!thumbnailUrl) {
      return NextResponse.json(
        {
          error: 'Add a cover image before going live',
          code: 'THUMBNAIL_REQUIRED',
        },
        { status: 400 }
      );
    }

    const { data: row, error: insErr } = await admin
      .from('live_streams')
      .insert({
        creator_id: user.id,
        title,
        status: 'idle_ready',
        tip_goal_gbp: tipGoal,
        tip_raised_gbp: 0,
        viewer_count: 0,
        thumbnail_url: thumbnailUrl,
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insErr || !row) {
      console.error('live insert', insErr);
      return NextResponse.json(
        { error: insErr?.message || 'Could not create live' },
        { status: 500 }
      );
    }

    const livekitRoom = `live-${row.id}`;
    await admin
      .from('live_streams')
      .update({
        livekit_room: livekitRoom,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    await notifyFollowersLive(admin, user.id, creatorName, row.id, title);

    return NextResponse.json({
      ok: true,
      resumed: false,
      stream: { ...row, livekit_room: livekitRoom },
      watchPath: `/live/${row.id}`,
    });
  } catch (e: any) {
    console.error('live create', e);
    return NextResponse.json(
      { error: e?.message || 'Could not create live stream' },
      { status: 500 }
    );
  }
}







