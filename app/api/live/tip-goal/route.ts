import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Host updates tip goal during an active live.
 * Rules:
 * - tip_raised never changes here
 * - tip_goal 0 = clear goal (allowed)
 * - tip_goal > 0 must be >= tip_raised (fair to fans)
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
    const streamId = String(body?.stream_id || '');
    const tipGoal = Number(body?.tip_goal_gbp);

    if (!streamId) {
      return NextResponse.json({ error: 'stream_id required' }, { status: 400 });
    }
    if (!Number.isFinite(tipGoal) || tipGoal < 0) {
      return NextResponse.json({ error: 'Invalid goal' }, { status: 400 });
    }
    if (tipGoal > 100000) {
      return NextResponse.json({ error: 'Goal too large' }, { status: 400 });
    }

    const rounded = Math.round(tipGoal * 100) / 100;

    const { data: stream } = await admin
      .from('live_streams')
      .select('id, creator_id, status, tip_raised_gbp, tip_goal_gbp')
      .eq('id', streamId)
      .single();

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    if (stream.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the host can change the goal' },
        { status: 403 }
      );
    }
    if (stream.status === 'ended') {
      return NextResponse.json({ error: 'Live has ended' }, { status: 400 });
    }

    const raised = Math.round(Number(stream.tip_raised_gbp || 0) * 100) / 100;

    // Clear goal always allowed; raised total is unchanged
    if (rounded > 0 && rounded < raised) {
      return NextResponse.json(
        {
          error: `Goal must be at least £${raised.toFixed(2)} (already raised). You can clear the goal or set a higher target.`,
          code: 'GOAL_BELOW_RAISED',
          tip_raised_gbp: raised,
          min_goal_gbp: raised,
        },
        { status: 400 }
      );
    }

    const { error } = await admin
      .from('live_streams')
      .update({
        tip_goal_gbp: rounded,
        // tip_raised_gbp intentionally NOT touched
        updated_at: new Date().toISOString(),
      })
      .eq('id', streamId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      tip_goal_gbp: rounded,
      tip_raised_gbp: raised,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to update goal' },
      { status: 500 }
    );
  }
}
