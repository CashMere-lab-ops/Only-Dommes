import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isPublicLive(row: any) {
  if (!row) return false;
  if (row.private_active) return false;
  return ['active', 'idle_ready', 'disconnected'].includes(String(row.status));
}

function creatorCard(p: any) {
  if (!p) return null;
  return {
    id: p.id,
    username: p.username || null,
    display_name: p.display_name || null,
    avatar_url: p.avatar_url || null,
  };
}

/** Other public lives this host can raid into. */
export async function GET(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const admin = adminClient();
    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const excludeId = String(searchParams.get('exclude') || '');

    const { data: rows, error } = await admin
      .from('live_streams')
      .select(
        'id, creator_id, title, status, thumbnail_url, viewer_count, started_at, private_active'
      )
      .in('status', ['active', 'idle_ready', 'disconnected'])
      .neq('creator_id', user.id)
      .order('viewer_count', { ascending: false })
      .limit(40);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = (rows || []).filter((r) => {
      if (excludeId && r.id === excludeId) return false;
      return isPublicLive(r);
    });

    const creatorIds = [...new Set(list.map((r) => r.creator_id))];
    let map: Record<string, any> = {};
    if (creatorIds.length) {
      const { data: people } = await admin
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', creatorIds);
      (people || []).forEach((p: any) => {
        map[p.id] = p;
      });
    }

    let blocked = new Set<string>();
    try {
      const { data: blocks } = await admin
        .from('blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
      (blocks || []).forEach((b: any) => {
        if (b.blocker_id === user.id) blocked.add(b.blocked_id);
        if (b.blocked_id === user.id) blocked.add(b.blocker_id);
      });
    } catch {
      /* blocks table optional */
    }

    const streams = list
      .filter((r) => !blocked.has(r.creator_id))
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        title: r.title,
        viewer_count: Number(r.viewer_count || 0),
        thumbnail_url: r.thumbnail_url || null,
        creator: creatorCard(map[r.creator_id]),
      }));

    return NextResponse.json({ ok: true, streams });
  } catch (e: any) {
    console.error('live raid GET', e);
    return NextResponse.json(
      { error: e?.message || 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * Host ends their live and sends viewers to another public live.
 */
export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const admin = adminClient();
    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const streamId = String(body.stream_id || '');
    const targetStreamId = String(body.target_stream_id || '');
    if (!streamId || !targetStreamId) {
      return NextResponse.json(
        { error: 'stream_id and target_stream_id required' },
        { status: 400 }
      );
    }
    if (streamId === targetStreamId) {
      return NextResponse.json(
        { error: 'Pick a different live' },
        { status: 400 }
      );
    }

    const { data: stream } = await admin
      .from('live_streams')
      .select('*')
      .eq('id', streamId)
      .single();

    if (!stream || stream.creator_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (stream.status === 'ended') {
      return NextResponse.json(
        { error: 'This live already ended' },
        { status: 400 }
      );
    }

    const { data: target } = await admin
      .from('live_streams')
      .select('*')
      .eq('id', targetStreamId)
      .single();

    if (!target || !isPublicLive(target)) {
      return NextResponse.json(
        { error: 'That live just ended or is in a private' },
        { status: 409 }
      );
    }
    if (target.creator_id === user.id) {
      return NextResponse.json(
        { error: 'You cannot raid yourself' },
        { status: 400 }
      );
    }

    const { data: fromProf } = await admin
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    const { data: toProf } = await admin
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', target.creator_id)
      .maybeSingle();

    const endedAt = new Date().toISOString();
    const started =
      stream.started_at || stream.created_at
        ? new Date(stream.started_at || stream.created_at).getTime()
        : Date.now();
    const durationSeconds = Math.max(
      0,
      Math.floor((Date.now() - started) / 1000)
    );
    const peak = Number(body.peak_viewers || stream.viewer_count || 0);
    const raidViewers = Math.max(
      0,
      Number(body.viewer_count || stream.viewer_count || 0)
    );

    const endFields: Record<string, any> = {
      status: 'ended',
      ended_at: endedAt,
      updated_at: endedAt,
      viewer_count: 0,
      duration_seconds: durationSeconds,
      peak_viewers: peak,
      private_active: false,
      private_user_id: null,
      private_request_id: null,
      private_ends_at: null,
    };
    const raidFields = {
      raid_target_stream_id: target.id,
      raid_target_creator_id: target.creator_id,
      raid_viewer_count: raidViewers,
      raided_at: endedAt,
    };

    let { error: endErr } = await admin
      .from('live_streams')
      .update({ ...endFields, ...raidFields })
      .eq('id', streamId);

    if (endErr && /column|raid_/i.test(endErr.message || '')) {
      const retry = await admin
        .from('live_streams')
        .update(endFields)
        .eq('id', streamId);
      endErr = retry.error;
    }
    if (endErr) {
      return NextResponse.json({ error: endErr.message }, { status: 500 });
    }

    const incoming = {
      last_raid_from_stream_id: streamId,
      last_raid_from_creator_id: user.id,
      last_raid_viewers: raidViewers,
      last_raid_at: endedAt,
      updated_at: endedAt,
    };
    const incomingRes = await admin
      .from('live_streams')
      .update(incoming)
      .eq('id', target.id);
    if (incomingRes.error && !/column|raid_/i.test(incomingRes.error.message || '')) {
      console.error('raid target stamp', incomingRes.error);
    }

    const fromName =
      fromProf?.display_name ||
      (fromProf?.username ? `@${fromProf.username}` : 'A creator');
    const toName =
      toProf?.display_name ||
      (toProf?.username ? `@${toProf.username}` : 'another creator');

    try {
      await admin.from('live_chat_messages').insert({
        stream_id: target.id,
        user_id: user.id,
        content: `__RAID__:${fromName}|${raidViewers}|${fromProf?.username || ''}`.slice(
          0,
          300
        ),
      });
    } catch (chatErr) {
      console.error('raid chat', chatErr);
    }

    try {
      await admin.from('notifications').insert({
        user_id: target.creator_id,
        actor_id: user.id,
        type: 'live',
        title: `${fromName} raided your live`,
        body:
          raidViewers > 0
            ? `${raidViewers} viewer${raidViewers === 1 ? '' : 's'} incoming`
            : 'Viewers are on the way',
        link: `/live/${target.id}`,
      });
    } catch {
      /* notification optional */
    }

    let tipperCount = 0;
    try {
      const { count } = await admin
        .from('live_stream_tips')
        .select('*', { count: 'exact', head: true })
        .eq('stream_id', streamId);
      tipperCount = count || 0;
    } catch {
      /* ignore */
    }

    const raid = {
      target_stream_id: target.id,
      target_title: target.title,
      target_creator: creatorCard(toProf),
      viewer_count: raidViewers,
      from_creator: creatorCard(fromProf),
    };

    return NextResponse.json({
      ok: true,
      raid,
      summary: {
        title: stream.title,
        duration_seconds: durationSeconds,
        tip_raised_gbp: Number(stream.tip_raised_gbp || 0),
        tip_goal_gbp: Number(stream.tip_goal_gbp || 0),
        peak_viewers: peak,
        tipper_count: tipperCount,
        showcase_name: stream.showcase_name || null,
        showcase_amount_gbp: Number(stream.showcase_amount_gbp || 0),
        showcase_avatar_url: stream.showcase_avatar_url || null,
        raided_to_name: toName,
      },
    });
  } catch (e: any) {
    console.error('live raid POST', e);
    return NextResponse.json(
      { error: e?.message || 'Could not raid' },
      { status: 500 }
    );
  }
}
