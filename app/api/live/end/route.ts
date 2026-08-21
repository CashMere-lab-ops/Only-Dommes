import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Creator ends live. Stream is not saved (no VOD).
 * Returns summary stats for the end screen.
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

    const body = await request.json().catch(() => ({}));
    const streamId = body.stream_id as string;
    if (!streamId) {
      return NextResponse.json({ error: 'stream_id required' }, { status: 400 });
    }

    const { data: stream } = await admin
      .from('live_streams')
      .select('*')
      .eq('id', streamId)
      .single();

    if (!stream || stream.creator_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

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

    await admin
      .from('live_streams')
      .update({
        status: 'ended',
        ended_at: endedAt,
        updated_at: endedAt,
        viewer_count: 0,
        // Persist so every viewer reads the same stats
        duration_seconds: durationSeconds,
        peak_viewers: peak,
        private_active: false,
        private_user_id: null,
        private_request_id: null,
        private_ends_at: null,
      })
      .eq('id', streamId);

    // Tipper count
    let tipperCount = 0;
    try {
      const { count } = await admin
        .from('live_stream_tips')
        .select('*', { count: 'exact', head: true })
        .eq('stream_id', streamId);
      tipperCount = count || 0;
    } catch {
      /* table may not exist on older deploys */
    }

    return NextResponse.json({
      ok: true,
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
      },
    });
  } catch (e: any) {
    console.error('live end', e);
    return NextResponse.json(
      { error: e?.message || 'Could not end stream' },
      { status: 500 }
    );
  }
}
