import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMux, muxSigningConfigured } from '../../../../lib/mux';

export const dynamic = 'force-dynamic';

/**
 * Direct upload for creators.
 * When MUX_SIGNING_* is set → signed playback (full video needs JWT).
 * Preview still works via 15s signed preview tokens.
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

    const { data: profile } = await admin
      .from('profiles')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (profile?.account_type !== 'creator') {
      return NextResponse.json(
        { error: 'Only creators can upload clips' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const corsOrigin =
      typeof body?.cors_origin === 'string' && body.cors_origin
        ? body.cors_origin
        : '*';

    const mux = getMux();
    const useSigned = muxSigningConfigured();

    const upload = await mux.video.uploads.create({
      cors_origin: corsOrigin,
      new_asset_settings: {
        playback_policy: [useSigned ? 'signed' : 'public'],
      },
      timeout: 3600,
    });

    return NextResponse.json({
      ok: true,
      uploadId: upload.id,
      uploadUrl: upload.url,
      signed: useSigned,
    });
  } catch (e: any) {
    console.error('mux create-upload', e);
    return NextResponse.json(
      { error: e?.message || 'Could not create upload' },
      { status: 500 }
    );
  }
}
