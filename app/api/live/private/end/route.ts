import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * End private session.
 *
 * Rules:
 * - Timer expired (force_timer) → ends immediately
 * - Early end → BOTH creator and paid sub must request end
 * - When only one has requested → waits for the other
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
    const forceTimer = body?.force_timer === true;

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

    const isCreator = stream.creator_id === user.id;
    const isFan = stream.private_user_id === user.id;
    if (!isCreator && !isFan) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    if (!stream.private_active) {
      return NextResponse.json({ ok: true, already: true, ended: true });
    }

    // Timer finished → always allow end
    const endsAtMs = stream.private_ends_at
      ? new Date(stream.private_ends_at).getTime()
      : 0;
    const timerDone = endsAtMs > 0 && Date.now() >= endsAtMs - 500;

    if (forceTimer || timerDone) {
      return await finishPrivate(admin, stream);
    }

    // Early end: mutual consent
    const creatorFlag = isCreator
      ? true
      : !!stream.private_end_by_creator;
    const fanFlag = isFan ? true : !!stream.private_end_by_fan;

    await admin
      .from('live_streams')
      .update({
        private_end_by_creator: creatorFlag,
        private_end_by_fan: fanFlag,
        updated_at: new Date().toISOString(),
      })
      .eq('id', streamId);

    if (creatorFlag && fanFlag) {
      return await finishPrivate(admin, stream);
    }

    return NextResponse.json({
      ok: true,
      ended: false,
      waiting: true,
      private_end_by_creator: creatorFlag,
      private_end_by_fan: fanFlag,
      message: isCreator
        ? 'Waiting for the fan to also request end'
        : 'Waiting for the creator to also request end',
    });
  } catch (e: any) {
    console.error('private end', e);
    return NextResponse.json(
      { error: e?.message || 'Failed' },
      { status: 500 }
    );
  }
}

async function finishPrivate(admin: any, stream: any) {
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
      private_end_by_creator: false,
      private_end_by_fan: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stream.id);

  return NextResponse.json({
    ok: true,
    ended: true,
    public_again: true,
  });
}
