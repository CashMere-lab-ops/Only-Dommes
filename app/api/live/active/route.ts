import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** Public-ish list of streams that are live or ready (max 10 for homepage) */
export async function GET() {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: rows, error } = await admin
      .from('live_streams')
      .select(
        'id, creator_id, title, status, mux_playback_id, thumbnail_url, tip_goal_gbp, tip_raised_gbp, viewer_count, started_at'
      )
      .in('status', ['active', 'idle_ready', 'disconnected'])
      .order('started_at', { ascending: false, nullsFirst: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = rows || [];
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

    return NextResponse.json({
      ok: true,
      streams: list.map((r) => ({
        ...r,
        creator: map[r.creator_id] || null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed' },
      { status: 500 }
    );
  }
}
