import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Public preview for a live link (no auth).
 * Used for the login gate — never returns tokens or private session details.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: stream, error } = await admin
      .from('live_streams')
      .select(
        'id, creator_id, title, status, thumbnail_url, viewer_count, tip_goal_gbp, tip_raised_gbp, started_at, ended_at, raid_target_stream_id, raid_target_creator_id, raid_viewer_count, raided_at'
      )
      .eq('id', id)
      .maybeSingle();

    if (error || !stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    const { data: creator } = await admin
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', stream.creator_id)
      .maybeSingle();

    return NextResponse.json({
      stream: {
        id: stream.id,
        title: stream.title,
        status: stream.status,
        thumbnail_url: stream.thumbnail_url,
        viewer_count: stream.viewer_count || 0,
        tip_goal_gbp: stream.tip_goal_gbp,
        tip_raised_gbp: stream.tip_raised_gbp,
        started_at: stream.started_at,
        ended_at: stream.ended_at,
        raid_target_stream_id: (stream as any).raid_target_stream_id || null,
        raid_target_creator_id: (stream as any).raid_target_creator_id || null,
        raid_viewer_count: Number((stream as any).raid_viewer_count || 0),
        raided_at: (stream as any).raided_at || null,
      },
      creator: creator
        ? {
            username: creator.username,
            display_name: creator.display_name,
            avatar_url: creator.avatar_url,
          }
        : null,
    });
  } catch (e: any) {
    console.error('live preview', e);
    return NextResponse.json(
      { error: e?.message || 'Preview failed' },
      { status: 500 }
    );
  }
}
