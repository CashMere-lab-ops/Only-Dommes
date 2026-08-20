import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** Fan requests a private 1:1 during a live */
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
    const minutes = Math.floor(Number(body?.minutes || 0));

    if (!streamId) {
      return NextResponse.json({ error: 'stream_id required' }, { status: 400 });
    }
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) {
      return NextResponse.json(
        { error: 'Minutes must be between 1 and 60' },
        { status: 400 }
      );
    }

    const { data: stream, error: stErr } = await admin
      .from('live_streams')
      .select('*')
      .eq('id', streamId)
      .single();

    if (stErr || !stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    if (stream.status === 'ended') {
      return NextResponse.json({ error: 'Stream has ended' }, { status: 400 });
    }
    if (stream.creator_id === user.id) {
      return NextResponse.json(
        { error: 'You cannot request private on your own live' },
        { status: 400 }
      );
    }
    if (stream.private_active) {
      return NextResponse.json(
        { error: 'Creator is already in a private session' },
        { status: 400 }
      );
    }

    // One pending request per fan per stream
    const { data: existing } = await admin
      .from('live_private_requests')
      .select('id')
      .eq('stream_id', streamId)
      .eq('requester_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'You already have a pending private request' },
        { status: 400 }
      );
    }

    const { data: creator } = await admin
      .from('profiles')
      .select(
        'live_private_enabled, live_private_rate_per_minute, live_private_min_minutes, voice_rate_per_minute, voice_min_minutes, display_name, username, balance_gbp'
      )
      .eq('id', stream.creator_id)
      .single();

    // Prefer dedicated live-private settings; fall back to voice rates
    const privateEnabled = creator?.live_private_enabled !== false;
    if (!privateEnabled) {
      return NextResponse.json(
        { error: 'This creator is not accepting private requests right now' },
        { status: 400 }
      );
    }

    const rate = Number(
      creator?.live_private_rate_per_minute ??
        creator?.voice_rate_per_minute ??
        8
    );
    const minMins = Math.max(
      1,
      Number(
        creator?.live_private_min_minutes ?? creator?.voice_min_minutes ?? 5
      )
    );
    if (minutes < minMins) {
      return NextResponse.json(
        { error: `Minimum private is ${minMins} minutes` },
        { status: 400 }
      );
    }

    const amount = Math.round(rate * minutes * 100) / 100;

    const { data: fan } = await admin
      .from('profiles')
      .select('balance_gbp, display_name, username')
      .eq('id', user.id)
      .single();

    const bal = Number(fan?.balance_gbp || 0);
    if (bal < amount) {
      return NextResponse.json(
        {
          error: 'Insufficient balance',
          code: 'INSUFFICIENT_BALANCE',
          balance: bal,
          needed: amount,
        },
        { status: 402 }
      );
    }

    const { data: row, error: insErr } = await admin
      .from('live_private_requests')
      .insert({
        stream_id: streamId,
        creator_id: stream.creator_id,
        requester_id: user.id,
        minutes,
        rate_per_minute: rate,
        amount_gbp: amount,
        status: 'pending',
      })
      .select('*')
      .single();

    if (insErr || !row) {
      return NextResponse.json(
        { error: insErr?.message || 'Could not create request' },
        { status: 500 }
      );
    }

    try {
      await admin.from('notifications').insert({
        user_id: stream.creator_id,
        type: 'private_request',
        title: 'Private request',
        body: `${fan?.display_name || fan?.username || 'A fan'} wants ${minutes} min private (£${amount.toFixed(2)})`,
        link: `/live/${streamId}`,
        meta: { request_id: row.id, stream_id: streamId },
      });
    } catch {
      /* optional */
    }

    return NextResponse.json({
      ok: true,
      request: row,
      amount,
      rate,
      minutes,
    });
  } catch (e: any) {
    console.error('private request', e);
    return NextResponse.json(
      { error: e?.message || 'Failed' },
      { status: 500 }
    );
  }
}

