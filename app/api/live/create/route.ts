import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Creator starts an in-platform live (LiveKit room).
 * Thumbnail required. Notifies followers once per new stream.
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

    try {
      const { data: followers } = await admin
        .from('follows')
        .select('follower_id')
        .eq('following_id', user.id)
        .limit(800);

      const ids = (followers || [])
        .map((f: any) => f.follower_id)
        .filter((id: string) => id && id !== user.id);

      if (ids.length) {
        const { data: prefsRows } = await admin
          .from('profiles')
          .select('id, notification_prefs')
          .in('id', ids);

        const allow = new Set<string>();
        for (const id of ids) {
          const p = prefsRows?.find((r: any) => r.id === id);
          const livePref = (p as any)?.notification_prefs?.live;
          if (livePref?.enabled === false) continue;
          allow.add(id);
        }

        const rows = [...allow].slice(0, 500).map((followerId) => ({
          user_id: followerId,
          actor_id: user.id,
          type: 'live',
          title: `${creatorName} is live`,
          body: title,
          link: `/live/${row.id}`,
        }));

        for (let i = 0; i < rows.length; i += 100) {
          await admin.from('notifications').insert(rows.slice(i, i + 100));
        }
      }
    } catch (notifyErr) {
      console.error('live follower notify', notifyErr);
    }

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



