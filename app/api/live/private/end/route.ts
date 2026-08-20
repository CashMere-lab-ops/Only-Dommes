import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** End private session and return stream to public */
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
      .select('*')
      .eq('id', streamId)
      .single();

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    const allowed =
      stream.creator_id === user.id || stream.private_user_id === user.id;
    if (!allowed) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }
    if (!stream.private_active) {
      return NextResponse.json({ ok: true, already: true });
    }

    if (stream.private_request_id) {
      await admin
        .from('live_private_requests')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', stream.private_request_id);
    }

    await admin
      .from('live_streams')
      .update({
        private_active: false,
        private_user_id: null,
        private_request_id: null,
        private_ends_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', streamId);

    return NextResponse.json({ ok: true, public_again: true });
  } catch (e: any) {
    console.error('private end', e);
    return NextResponse.json(
      { error: e?.message || 'Failed' },
      { status: 500 }
    );
  }
}
