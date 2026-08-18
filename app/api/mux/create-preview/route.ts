import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMux, muxPlaybackUrl, muxThumbnailUrl } from '../../../../lib/mux';

export const dynamic = 'force-dynamic';

const PREVIEW_SECONDS = 15;

/**
 * Creates a separate ~15s Mux asset from a full clip asset.
 * Only the preview playback id is safe to expose publicly for non-buyers.
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
    const assetId = body?.assetId as string | undefined;
    const clipId = body?.clipId as string | undefined;
    const endTime = Math.min(
      60,
      Math.max(5, Number(body?.seconds) || PREVIEW_SECONDS)
    );

    if (!assetId) {
      return NextResponse.json({ error: 'assetId required' }, { status: 400 });
    }

    // If clipId given, ensure caller owns it
    if (clipId) {
      const { data: clip } = await admin
        .from('clips')
        .select('id, creator_id')
        .eq('id', clipId)
        .single();
      if (!clip || clip.creator_id !== user.id) {
        return NextResponse.json({ error: 'Not your clip' }, { status: 403 });
      }
    }

    const mux = getMux();

    const previewAsset = await mux.video.assets.create({
      input: [
        {
          url: `mux://${assetId}`,
          start_time: 0,
          end_time: endTime,
        },
      ],
      playback_policy: ['public'],
    });

    // Poll until ready (max ~2 min)
    let ready = previewAsset;
    for (let i = 0; i < 60; i++) {
      if (ready.status === 'ready' && ready.playback_ids?.[0]?.id) break;
      if (ready.status === 'errored') {
        return NextResponse.json(
          { error: 'Preview processing failed' },
          { status: 500 }
        );
      }
      await new Promise((r) => setTimeout(r, 2000));
      ready = await mux.video.assets.retrieve(previewAsset.id);
    }

    const playbackId = ready.playback_ids?.[0]?.id;
    if (!playbackId || ready.status !== 'ready') {
      return NextResponse.json(
        { error: 'Preview still processing — try again shortly' },
        { status: 202 }
      );
    }

    const previewUrl = muxPlaybackUrl(playbackId);
    const thumbnailUrl = muxThumbnailUrl(playbackId, 1);

    if (clipId) {
      await admin
        .from('clips')
        .update({
          preview_url: previewUrl,
          mux_preview_playback_id: playbackId,
          mux_preview_asset_id: ready.id,
          // Keep existing custom thumb if set; only fill if empty
          thumbnail_url: thumbnailUrl,
        })
        .eq('id', clipId)
        .is('thumbnail_url', null);
      // Always set preview fields
      await admin
        .from('clips')
        .update({
          preview_url: previewUrl,
          mux_preview_playback_id: playbackId,
          mux_preview_asset_id: ready.id,
        })
        .eq('id', clipId);
    }

    return NextResponse.json({
      ok: true,
      previewUrl,
      playbackId,
      assetId: ready.id,
      thumbnailUrl,
    });
  } catch (e: any) {
    console.error('mux create-preview', e);
    return NextResponse.json(
      { error: e?.message || 'Could not create preview' },
      { status: 500 }
    );
  }
}
