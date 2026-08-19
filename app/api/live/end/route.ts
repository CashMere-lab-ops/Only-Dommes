import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Creator ends live. Stream is not saved (no VOD).
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

    await admin
      .from('live_streams')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        viewer_count: 0,
      })
      .eq('id', streamId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('live end', e);
    return NextResponse.json(
      { error: e?.message || 'Could not end stream' },
      { status: 500 }
    );
  }
}
