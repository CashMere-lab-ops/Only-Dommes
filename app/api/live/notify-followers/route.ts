import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyFollowersLive } from '../../../../lib/live-notify';

export const dynamic = 'force-dynamic';

/**
 * POST { streamId }
 * Creator-only. Notifies followers that this stream is live.
 * Returns full debug info so we can see why notifies fail.
 */
export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!hasServiceKey || !hasUrl) {
      return NextResponse.json(
        {
          error: 'Server missing Supabase env',
          hasServiceKey,
          hasUrl,
        },
        { status: 500 }
      );
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
    const streamId = body?.streamId as string | undefined;
    if (!streamId) {
      return NextResponse.json({ error: 'streamId required' }, { status: 400 });
    }

    const { data: stream, error: sErr } = await admin
      .from('live_streams')
      .select('id, creator_id, title, status')
      .eq('id', streamId)
      .single();

    if (sErr || !stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    if (stream.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the host can notify followers' },
        { status: 403 }
      );
    }

    // Followers count diagnostic
    const { data: fans, error: fansErr } = await admin
      .from('follows')
      .select('follower_id')
      .eq('following_id', user.id)
      .limit(20);

    const result = await notifyFollowersLive(
      admin,
      user.id,
      stream.id,
      stream.title || 'Live now'
    );

    return NextResponse.json({
      ok: result.ok,
      notify: result,
      debug: {
        streamId: stream.id,
        streamStatus: stream.status,
        creatorId: user.id,
        sampleFollowers: (fans || []).map((f: any) => f.follower_id),
        fansError: fansErr?.message || null,
        hasServiceKey,
      },
    });
  } catch (e: any) {
    console.error('notify-followers', e);
    return NextResponse.json(
      { error: e?.message || 'Notify failed' },
      { status: 500 }
    );
  }
}
