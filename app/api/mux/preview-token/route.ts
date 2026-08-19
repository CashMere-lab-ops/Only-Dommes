import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getPlaybackPolicy,
  muxSigningConfigured,
  normalizePlaybackId,
  signPreviewPlayback,
  signThumbnail,
} from '../../../../lib/mux';

export const dynamic = 'force-dynamic';

/**
 * 15s preview for the clips store.
 * - public playback ids → no JWT, use extraSourceParams for 15s
 * - signed playback ids → JWT with asset_start/end in claims
 */
export async function GET(request: Request) {
  try {
    const clipId = new URL(request.url).searchParams.get('clipId');
    if (!clipId) {
      return NextResponse.json({ error: 'clipId required' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: clip } = await admin
      .from('clips')
      .select('id, mux_playback_id, mux_asset_id, is_published')
      .eq('id', clipId)
      .single();

    const playbackId = normalizePlaybackId(clip?.mux_playback_id);
    if (!clip || !playbackId || clip.is_published === false) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    const policy = await getPlaybackPolicy(
      playbackId,
      (clip as any).mux_asset_id
    );

    // Public clip (most older uploads): no token
    if (policy === 'public' || !muxSigningConfigured()) {
      return NextResponse.json({
        ok: true,
        playbackId,
        token: null,
        thumbnailToken: null,
        public: true,
        extraSourceParams: {
          asset_start_time: 0,
          asset_end_time: 15,
        },
      });
    }

    // Signed clip: JWT required, clip window inside the token
    const token = await signPreviewPlayback(playbackId);
    let thumbnailToken: string | null = null;
    try {
      thumbnailToken = await signThumbnail(playbackId, 1);
    } catch {
      thumbnailToken = null;
    }

    return NextResponse.json({
      ok: true,
      playbackId,
      token,
      thumbnailToken,
      public: false,
    });
  } catch (e: any) {
    console.error('preview-token', e);
    return NextResponse.json(
      { error: e?.message || 'Could not sign preview' },
      { status: 500 }
    );
  }
}
