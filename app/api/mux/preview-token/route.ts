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
 * 15s preview for anyone browsing the store.
 * Signed clips → JWT with asset_start_time=0, asset_end_time=15
 * Public clips → no JWT + extraSourceParams for 15s
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

    const publicResponse = {
      ok: true,
      playbackId,
      token: null as string | null,
      thumbnailToken: null as string | null,
      public: true,
      extraSourceParams: {
        asset_start_time: 0,
        asset_end_time: 15,
      },
    };

    let policy: 'signed' | 'public' = 'public';
    try {
      policy = await getPlaybackPolicy(playbackId, (clip as any).mux_asset_id);
    } catch {
      policy = 'public';
    }

    // Older public clips
    if (policy === 'public' || !muxSigningConfigured()) {
      return NextResponse.json(publicResponse);
    }

    // New signed clips — 15s only, inside the JWT
    try {
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
    } catch (signErr: any) {
      console.error('preview sign failed', signErr?.message || signErr);
      return NextResponse.json(
        {
          error:
            'Preview signing failed — check MUX_PRIVATE_KEY / MUX_SIGNING_KEY_ID',
        },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error('preview-token', e);
    return NextResponse.json(
      { error: e?.message || 'Could not load preview' },
      { status: 500 }
    );
  }
}
