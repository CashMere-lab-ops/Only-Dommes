import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getPlaybackPolicy,
  muxSigningConfigured,
  normalizePlaybackId,
  signFullPlayback,
  signThumbnail,
} from '../../../../lib/mux';

export const dynamic = 'force-dynamic';

/**
 * Full video — creator or buyer only.
 * Signed clips need JWT; public clips play without.
 */
export async function GET(request: Request) {
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

    const clipId = new URL(request.url).searchParams.get('clipId');
    if (!clipId) {
      return NextResponse.json({ error: 'clipId required' }, { status: 400 });
    }

    const { data: clip } = await admin
      .from('clips')
      .select('id, creator_id, mux_playback_id, mux_asset_id, price_gbp')
      .eq('id', clipId)
      .single();

    const playbackId = normalizePlaybackId(clip?.mux_playback_id);
    if (!clip || !playbackId) {
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

    const publicResponse = {
      ok: true,
      playbackId,
      token: null as string | null,
      thumbnailToken: null as string | null,
      public: true,
    };

    let policy: 'signed' | 'public' = 'public';
    try {
      policy = await getPlaybackPolicy(playbackId, (clip as any).mux_asset_id);
    } catch {
      policy = 'public';
    }

    if (policy === 'public' || !muxSigningConfigured()) {
      return NextResponse.json(publicResponse);
    }

    try {
      const playbackToken = await signFullPlayback(playbackId);
      let thumbnailToken: string | null = null;
      try {
        thumbnailToken = await signThumbnail(playbackId, 1);
      } catch {
        thumbnailToken = null;
      }
      return NextResponse.json({
        ok: true,
        playbackId,
        token: playbackToken,
        thumbnailToken,
        public: false,
      });
    } catch (signErr: any) {
      console.error('full sign failed', signErr?.message || signErr);
      return NextResponse.json(
        {
          error:
            'Playback signing failed — check MUX_PRIVATE_KEY / MUX_SIGNING_KEY_ID',
        },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error('playback-token', e);
    return NextResponse.json(
      { error: e?.message || 'Could not load video' },
      { status: 500 }
    );
  }
}
