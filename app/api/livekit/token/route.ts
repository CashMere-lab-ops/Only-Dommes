import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const jwt = authHeader.slice(7);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const callId = body?.callId as string | undefined;
    if (!callId) {
      return NextResponse.json({ error: 'callId required' }, { status: 400 });
    }

    // Service role to read call securely
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: call, error: callError } = await admin
      .from('voice_calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (call.creator_id !== user.id && call.subscriber_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (call.status !== 'active' && call.status !== 'ringing') {
      return NextResponse.json({ error: 'Call not active' }, { status: 400 });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return NextResponse.json(
        { error: 'LiveKit not configured' },
        { status: 500 }
      );
    }

    const roomName = call.livekit_room || `call-${call.id}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: user.id,
      ttl: '2h',
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url: livekitUrl,
      roomName,
      call,
    });
  } catch (err: any) {
    console.error('livekit token error', err);
    return NextResponse.json(
      { error: err.message || 'Token failed' },
      { status: 500 }
    );
  }
}
