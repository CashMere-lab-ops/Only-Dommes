import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type Level = { label: string; amount: number };

function normalizeLevels(raw: unknown, raised: number): {
  levels: Level[];
  tip_goal_gbp: number;
  error?: string;
} {
  if (!Array.isArray(raw)) {
    return { levels: [], tip_goal_gbp: 0, error: 'Invalid goals' };
  }

  const levels: Level[] = [];
  for (const item of raw.slice(0, 3)) {
    if (!item || typeof item !== 'object') continue;
    const label = String((item as any).label || '')
      .trim()
      .slice(0, 40);
    const amount = Math.round(Number((item as any).amount) * 100) / 100;
    if (!label || !Number.isFinite(amount) || amount <= 0) continue;
    if (amount > 100000) {
      return {
        levels: [],
        tip_goal_gbp: 0,
        error: 'Goal amount too large',
      };
    }
    levels.push({ label, amount });
  }

  // Sort by amount ascending (cumulative totals)
  levels.sort((a, b) => a.amount - b.amount);

  for (let i = 1; i < levels.length; i++) {
    if (levels[i].amount <= levels[i - 1].amount) {
      return {
        levels: [],
        tip_goal_gbp: 0,
        error: 'Each level must be a higher total than the one before',
      };
    }
  }

  // Active target = first level not yet reached, else last, else 0
  let tip_goal_gbp = 0;
  if (levels.length) {
    const next = levels.find((l) => raised < l.amount);
    tip_goal_gbp = next ? next.amount : levels[levels.length - 1].amount;
  }

  // Fairness: if setting goals while money is raised, highest-or-active must not
  // sit below raised unless clearing everything
  if (levels.length && tip_goal_gbp > 0 && tip_goal_gbp < raised) {
    // Allow only if every level is already passed (all complete) — then tip_goal stays last
    const allDone = levels.every((l) => raised >= l.amount);
    if (!allDone) {
      return {
        levels: [],
        tip_goal_gbp: 0,
        error: `Active goal must be at least £${raised.toFixed(2)} (already raised)`,
      };
    }
  }

  return { levels, tip_goal_gbp };
}

/**
 * Host sets multi-level tip goals (up to 3) with labels.
 * tip_raised never changes. tip_goal_gbp = active level target.
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

    if (!streamId) {
      return NextResponse.json({ error: 'stream_id required' }, { status: 400 });
    }

    const { data: stream } = await admin
      .from('live_streams')
      .select('id, creator_id, status, tip_raised_gbp')
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

    // New format: levels array. Legacy: single tip_goal_gbp
    let rawLevels = body?.levels;
    if (!Array.isArray(rawLevels) && body?.tip_goal_gbp != null) {
      const n = Number(body.tip_goal_gbp);
      if (Number.isFinite(n) && n > 0) {
        rawLevels = [{ label: 'Tip goal', amount: n }];
      } else {
        rawLevels = [];
      }
    }

    const { levels, tip_goal_gbp, error } = normalizeLevels(rawLevels, raised);
    if (error) {
      return NextResponse.json(
        { error, code: 'INVALID_GOALS', tip_raised_gbp: raised },
        { status: 400 }
      );
    }

    const { error: upErr } = await admin
      .from('live_streams')
      .update({
        tip_goals: levels,
        tip_goal_gbp,
        updated_at: new Date().toISOString(),
      })
      .eq('id', streamId);

    if (upErr) {
      // tip_goals column may not exist yet
      if (/tip_goals/i.test(upErr.message)) {
        return NextResponse.json(
          {
            error:
              'Run SQL: ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS tip_goals jsonb DEFAULT \'[]\'::jsonb;',
            code: 'MISSING_COLUMN',
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      tip_goals: levels,
      tip_goal_gbp,
      tip_raised_gbp: raised,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to update goal' },
      { status: 500 }
    );
  }
}

