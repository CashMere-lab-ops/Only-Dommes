import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  muxSigningConfigured,
  signPreviewPlayback,
  signThumbnail,
} from '../../../../lib/mux';

export const dynamic = 'force-dynamic';

/**
 * 15s preview token for any logged-in browser (store teaser).
 * GET ?clipId=...
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
      .select('id, mux_playback_id, is_published')
      .eq('id', clipId)
      .single();

    if (!clip?.mux_playback_id || clip.is_published === false) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    // Public assets (older clips) — no token needed
    if (!muxSigningConfigured()) {
      return NextResponse.json({
        ok: true,
        playbackId: clip.mux_playback_id,
        token: null,
        public: true,
        extraSourceParams: {
          asset_start_time: 0,
          asset_end_time: 15,
        },
      });
    }

    const token = await signPreviewPlayback(clip.mux_playback_id);
    let thumbnailToken: string | null = null;
    try {
      thumbnailToken = await signThumbnail(clip.mux_playback_id, 1);
    } catch {
      thumbnailToken = null;
    }

    return NextResponse.json({
      ok: true,
      playbackId: clip.mux_playback_id,
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
