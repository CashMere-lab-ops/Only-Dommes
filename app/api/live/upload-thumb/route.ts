import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** Upload a live cover image (service role — avoids storage RLS issues) */
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
        { error: 'Only creators can upload live covers' },
        { status: 403 }
      );
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file' }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'Max 8MB' }, { status: 400 });
    }

    const type = (file as File).type || 'image/jpeg';
    if (!type.startsWith('image/')) {
      return NextResponse.json({ error: 'Image only' }, { status: 400 });
    }

    const ext =
      type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const path = `${user.id}/live-thumb-${Date.now()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Prefer dedicated bucket; fall back to avatars
    let bucket = 'live-thumbnails';
    let { error: upErr } = await admin.storage
      .from(bucket)
      .upload(path, buffer, { contentType: type, upsert: true });

    if (upErr) {
      bucket = 'avatars';
      const retry = await admin.storage
        .from(bucket)
        .upload(path, buffer, { contentType: type, upsert: true });
      upErr = retry.error;
    }

    if (upErr) {
      console.error('thumb upload', upErr);
      return NextResponse.json(
        { error: upErr.message || 'Upload failed' },
        { status: 500 }
      );
    }

    const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`;

    return NextResponse.json({ ok: true, url, bucket, path });
  } catch (e: any) {
    console.error('upload-thumb', e);
    return NextResponse.json(
      { error: e?.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
