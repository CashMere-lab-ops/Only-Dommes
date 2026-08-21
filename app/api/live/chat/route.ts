import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Send live chat — enforces mute/ban server-side.
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
    let content = String(body?.content || '').trim();

    if (!streamId) {
      return NextResponse.json({ error: 'stream_id required' }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: 'Empty message' }, { status: 400 });
    }
    if (content.length > 300) content = content.slice(0, 300);

    const { data: stream } = await admin
      .from('live_streams')
      .select('id, creator_id, status')
      .eq('id', streamId)
      .single();

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    if (stream.status === 'ended') {
      return NextResponse.json({ error: 'Live has ended' }, { status: 400 });
    }

    // Host can always chat
    if (stream.creator_id !== user.id) {
      const { data: mod } = await admin
        .from('live_stream_moderation')
        .select('action')
        .eq('stream_id', streamId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (mod?.action === 'ban') {
        return NextResponse.json(
          { error: 'You are banned from this live', code: 'BANNED' },
          { status: 403 }
        );
      }
      if (mod?.action === 'mute') {
        return NextResponse.json(
          { error: 'You are muted and cannot chat', code: 'MUTED' },
          { status: 403 }
        );
      }
    }

    const { data: row, error } = await admin
      .from('live_chat_messages')
      .insert({
        stream_id: streamId,
        user_id: user.id,
        content,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: row });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Chat failed' },
      { status: 500 }
    );
  }
}
