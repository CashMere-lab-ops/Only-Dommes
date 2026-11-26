import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { AGEGO_ASI, AGEGO_ATTEMPT_TTL_MS, AGEGO_START_URL, createAgegoNonce, hashAgegoNonce } from '../../../../lib/agego';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey || !process.env.AGEGO_SITE_SECRET) {
      return NextResponse.json({ error: 'Age verification is not configured' }, { status: 503 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error } = await admin.auth.getUser(match[1]);
    if (error || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('age_verified_at')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: 'Could not load account' }, { status: 500 });
    if (profile?.age_verified_at) return NextResponse.json({ alreadyVerified: true, redirect: '/' });

    const nonce = createAgegoNonce();
    const expiresAt = new Date(Date.now() + AGEGO_ATTEMPT_TTL_MS).toISOString();
    const { error: insertError } = await admin.from('agego_verification_attempts').insert({
      user_id: user.id,
      nonce_hash: hashAgegoNonce(nonce),
      status: 'pending',
      expires_at: expiresAt,
      agego_site: AGEGO_ASI,
    });
    if (insertError) {
      console.error('AgeGO attempt insert failed', insertError);
      return NextResponse.json({ error: 'Could not start age verification' }, { status: 500 });
    }

    const returnUrl = new URL('/api/agego/callback', request.url).toString();
    const redirect = new URL(AGEGO_START_URL);
    redirect.searchParams.set('asi', AGEGO_ASI);
    redirect.searchParams.set('returnto', returnUrl);
    redirect.searchParams.set('nonce', nonce);
    // AgeGO documents this placeholder on the site's callback URL for Modal integrations.
    // Preserve it as supplied in the dashboard URL; it is not an S2S verification credential.
    redirect.searchParams.set('callbacktoken', '{callbacktoken}');

    return NextResponse.json({ redirect: redirect.toString() });
  } catch (error) {
    console.error('AgeGO start error', error);
    return NextResponse.json({ error: 'Could not start age verification' }, { status: 500 });
  }
}
