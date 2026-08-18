import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  muxSigningConfigured,
  signFullPlayback,
  signThumbnail,
} from '../../../../lib/mux';

export const dynamic = 'force-dynamic';

/**
 * Full-video token — only creator or buyer of the clip.
 * GET ?clipId=...
 */
export async function GET(request: Request) {
  try {
    if (!muxSigningConfigured()) {
      return NextResponse.json(
        { error: 'Signed playback not configured', public: true },
        { status: 200 }
      );
    }

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

    const clipId = new URL(request.url).searchParams.get('clipId');
    if (!clipId) {
      return NextResponse.json({ error: 'clipId required' }, { status: 400 });
    }

    const { data: clip } = await admin
      .from('clips')
      .select('id, creator_id, mux_playback_id, price_gbp')
      .eq('id', clipId)
      .single();

    if (!clip?.mux_playback_id) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    const isCreator = clip.creator_id === user.id;
    const isFree = Number(clip.price_gbp) === 0;
    let isBuyer = false;
    if (!isCreator && !isFree) {
      const { data: buy } = await admin
        .from('clip_purchases')
        .select('id')
        .eq('clip_id', clipId)
        .eq('buyer_id', user.id)
        .maybeSingle();
      isBuyer = !!buy;
    }

    if (!isCreator && !isFree && !isBuyer) {
      return NextResponse.json({ error: 'Purchase required' }, { status: 403 });
    }

    const playbackToken = await signFullPlayback(clip.mux_playback_id);
    let thumbnailToken: string | null = null;
    try {
      thumbnailToken = await signThumbnail(clip.mux_playback_id, 1);
    } catch {
      thumbnailToken = null;
    }

    return NextResponse.json({
      ok: true,
      playbackId: clip.mux_playback_id,
      token: playbackToken,
      thumbnailToken,
    });
  } catch (e: any) {
    console.error('playback-token', e);
    return NextResponse.json(
      { error: e?.message || 'Could not sign playback' },
      { status: 500 }
    );
  }
}
