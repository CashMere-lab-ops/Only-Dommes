import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMux, muxPlaybackUrl, muxThumbnailUrl } from '../../../../lib/mux';

export const dynamic = 'force-dynamic';

/**
 * Poll Mux upload → asset until ready.
 * Query: ?uploadId=...
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

    const { searchParams } = new URL(request.url);
    const uploadId = searchParams.get('uploadId');
    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId required' }, { status: 400 });
    }

    const mux = getMux();
    const upload = await mux.video.uploads.retrieve(uploadId);

    // waiting | asset_created | errored | cancelled | timed_out
    const status = upload.status;

    if (status !== 'asset_created' || !upload.asset_id) {
      return NextResponse.json({
        ok: true,
        status,
        ready: false,
        assetId: upload.asset_id || null,
      });
    }

    const asset = await mux.video.assets.retrieve(upload.asset_id);
    const playbackId = asset.playback_ids?.[0]?.id || null;
    const duration = asset.duration != null ? Math.round(asset.duration) : null;

    if (!playbackId || asset.status !== 'ready') {
      return NextResponse.json({
        ok: true,
        status: asset.status || status,
        ready: false,
        assetId: asset.id,
        playbackId,
        duration,
      });
    }

    return NextResponse.json({
      ok: true,
      status: 'ready',
      ready: true,
      assetId: asset.id,
      playbackId,
      duration,
      videoUrl: muxPlaybackUrl(playbackId),
      thumbnailUrl: muxThumbnailUrl(playbackId, 1),
    });
  } catch (e: any) {
    console.error('mux asset-status', e);
    return NextResponse.json(
      { error: e?.message || 'Status check failed' },
      { status: 500 }
    );
  }
}
