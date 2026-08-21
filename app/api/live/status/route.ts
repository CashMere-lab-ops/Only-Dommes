import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Any logged-in user can poll stream status (bypasses RLS).
 * Returns the same end summary for host + viewers (shared duration).
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const streamId = searchParams.get('id');
    if (!streamId) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const { data: stream } = await admin
      .from('live_streams')
      .select(
        'id, creator_id, title, status, tip_raised_gbp, tip_goal_gbp, viewer_count, peak_viewers, duration_seconds, started_at, ended_at, created_at, showcase_user_id, showcase_amount_gbp, showcase_name, showcase_avatar_url, show_join_messages, slow_mode_seconds'
      )
      .eq('id', streamId)
      .single();

    if (!stream) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    let my_tip_gbp = 0;
    let tipper_count = 0;
    try {
      const { data: mine } = await admin
        .from('live_stream_tips')
        .select('total_gbp')
        .eq('stream_id', streamId)
        .eq('user_id', user.id)
        .maybeSingle();
      my_tip_gbp = Number(mine?.total_gbp || 0);

      const { count } = await admin
        .from('live_stream_tips')
        .select('*', { count: 'exact', head: true })
        .eq('stream_id', streamId);
      tipper_count = count || 0;
    } catch {
      /* ignore */
    }

    // Prefer stored duration (set when host ends) so host + viewers match
    let duration_seconds = Number((stream as any).duration_seconds || 0);
    if (!duration_seconds || duration_seconds <= 0) {
      const startSrc = stream.started_at || stream.created_at;
      const started = startSrc ? new Date(startSrc).getTime() : NaN;
      const endedTs = stream.ended_at
        ? new Date(stream.ended_at).getTime()
        : Date.now();
      if (!Number.isNaN(started) && endedTs >= started) {
        duration_seconds = Math.max(
          0,
          Math.floor((endedTs - started) / 1000)
        );
      }
    }

    const peak = Number(
      (stream as any).peak_viewers || stream.viewer_count || 0
    );
    const is_host = stream.creator_id === user.id;

    const summaryBase = {
      title: stream.title,
      duration_seconds,
      tip_raised_gbp: Number(stream.tip_raised_gbp || 0),
      tip_goal_gbp: Number(stream.tip_goal_gbp || 0),
      peak_viewers: peak,
      tipper_count,
      showcase_name: stream.showcase_name,
      showcase_amount_gbp: Number(stream.showcase_amount_gbp || 0),
      showcase_avatar_url: stream.showcase_avatar_url,
      my_tip_gbp,
      is_host,
    };

    return NextResponse.json({
      status: stream.status,
      stream,
      is_host,
      my_tip_gbp,
      tipper_count,
      duration_seconds,
      summary: stream.status === 'ended' ? summaryBase : null,
      // Always expose duration so client can use it even mid-stream / race
      preview_summary: summaryBase,
    });
  } catch (e: any) {
    console.error('live status', e);
    return NextResponse.json(
      { error: e?.message || 'Failed' },
      { status: 500 }
    );
  }
}
