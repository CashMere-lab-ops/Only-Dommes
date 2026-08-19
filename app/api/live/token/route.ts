import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * LiveKit token for a live stream room.
 * Creator → can publish camera/mic
 * Viewer → subscribe only
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const jwt = authHeader.slice(7);

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(jwt);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const streamId = body?.streamId as string | undefined;
    if (!streamId) {
      return NextResponse.json({ error: 'streamId required' }, { status: 400 });
    }

    const { data: stream, error: streamErr } = await admin
      .from('live_streams')
      .select('*')
      .eq('id', streamId)
      .single();

    if (streamErr || !stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    if (stream.status === 'ended') {
      return NextResponse.json({ error: 'Stream has ended' }, { status: 400 });
    }

    const isCreator = stream.creator_id === user.id;
    // Viewers can join when ready or active
    if (
      !isCreator &&
      !['idle_ready', 'active', 'disconnected'].includes(stream.status)
    ) {
      return NextResponse.json({ error: 'Stream not available' }, { status: 400 });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl =
      process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return NextResponse.json(
        { error: 'LiveKit not configured' },
        { status: 500 }
      );
    }

    const roomName = stream.livekit_room || `live-${stream.id}`;

    // Load display name for LiveKit participant
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .single();

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name:
        profile?.display_name ||
        profile?.username ||
        (isCreator ? 'Creator' : 'Viewer'),
      ttl: '4h',
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: isCreator,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    // Creator opening room → mark active
    if (isCreator && stream.status !== 'active') {
      await admin
        .from('live_streams')
        .update({
          status: 'active',
          started_at: stream.started_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', stream.id);
    }

    return NextResponse.json({
      token,
      url: livekitUrl,
      roomName,
      isCreator,
      streamId: stream.id,
    });
  } catch (err: any) {
    console.error('live token error', err);
    return NextResponse.json(
      { error: err.message || 'Token failed' },
      { status: 500 }
    );
  }
}
