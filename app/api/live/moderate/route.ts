import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Host mute / ban a viewer for this live only.
 * action: mute | ban | clear
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
    const targetUserId = String(body?.user_id || '');
    const action = String(body?.action || '');

    if (!streamId || !targetUserId) {
      return NextResponse.json(
        { error: 'stream_id and user_id required' },
        { status: 400 }
      );
    }
    if (!['mute', 'ban', 'clear'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const { data: stream } = await admin
      .from('live_streams')
      .select('id, creator_id, status')
      .eq('id', streamId)
      .single();

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    if (stream.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the host can moderate' },
        { status: 403 }
      );
    }
    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: 'Cannot moderate yourself' },
        { status: 400 }
      );
    }
    if (stream.status === 'ended') {
      return NextResponse.json({ error: 'Live has ended' }, { status: 400 });
    }

    if (action === 'clear') {
      const { error } = await admin
        .from('live_stream_moderation')
        .delete()
        .eq('stream_id', streamId)
        .eq('user_id', targetUserId);
      if (error) {
        return NextResponse.json(
          {
            error:
              error.message +
              (error.message.includes('does not exist')
                ? ' — run the live_moderation SQL in Supabase first'
                : ''),
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, action: 'clear' });
    }

    // Delete then insert (avoids onConflict edge cases)
    await admin
      .from('live_stream_moderation')
      .delete()
      .eq('stream_id', streamId)
      .eq('user_id', targetUserId);

    const { error } = await admin.from('live_stream_moderation').insert({
      stream_id: streamId,
      user_id: targetUserId,
      action,
      created_by: user.id,
    });

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message +
            (error.message.includes('does not exist')
              ? ' — run the live_moderation SQL in Supabase first'
              : ''),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, action, user_id: targetUserId });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Moderation failed' },
      { status: 500 }
    );
  }
}

