import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** Public list of lives (max 10). Hides private sessions from homepage. */
export async function GET() {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: rows, error } = await admin
      .from('live_streams')
      .select(
        'id, creator_id, title, status, mux_playback_id, thumbnail_url, tip_goal_gbp, tip_raised_gbp, viewer_count, started_at, private_active'
      )
      .in('status', ['active', 'idle_ready', 'disconnected'])
      .eq('private_active', false)
      .order('started_at', { ascending: false, nullsFirst: false })
      .limit(10);

    if (error) {
      // Fallback if column missing before migration
      const { data: rows2, error: e2 } = await admin
        .from('live_streams')
        .select(
          'id, creator_id, title, status, mux_playback_id, thumbnail_url, tip_goal_gbp, tip_raised_gbp, viewer_count, started_at'
        )
        .in('status', ['active', 'idle_ready', 'disconnected'])
        .order('started_at', { ascending: false, nullsFirst: false })
        .limit(10);
      if (e2) {
        return NextResponse.json({ error: e2.message }, { status: 500 });
      }
      const list = rows2 || [];
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
