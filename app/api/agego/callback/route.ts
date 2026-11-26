import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { AGEGO_ASI, hashAgegoNonce, validateAgegoToken, verifyAgegoSignature } from '../../../../lib/agego';

export const dynamic = 'force-dynamic';

function resultRedirect(request: Request, status: 'success' | 'failed') {
  const url = new URL('/age-verification/result', request.url);
  url.searchParams.set('status', status);
  return NextResponse.redirect(url, 303);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const nonce = params.get('ag_nonce') || '';
  const verifiedSite = params.get('ag_verified_site') || '';
  const token = params.get('ag_user_token') || '';
  const expires = Number(params.get('ag_expires') || '0');
  const siteSecret = process.env.AGEGO_SITE_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!siteSecret || !supabaseUrl || !serviceKey || !nonce || !verifiedSite) {
    return resultRedirect(request, 'failed');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const nonceHash = hashAgegoNonce(nonce);
  const { data: attempt, error: attemptError } = await admin
    .from('agego_verification_attempts')
    .select('id, user_id, status, expires_at, agego_site')
    .eq('nonce_hash', nonceHash)
    .maybeSingle();

  if (attemptError || !attempt || attempt.status !== 'pending') {
    return resultRedirect(request, 'failed');
  }

  const now = Date.now();
  const attemptExpiry = new Date(attempt.expires_at).getTime();
  const responseValid = Number.isFinite(expires) && expires > now;
  const attemptValid = Number.isFinite(attemptExpiry) && attemptExpiry > now;
  const signatureValid = verifyAgegoSignature(params, siteSecret);
  const siteValid = verifiedSite === AGEGO_ASI && attempt.agego_site === AGEGO_ASI;
  const nonceValid = nonce.length <= 64;
  const successFlag = (params.get('ag_verified') || '').toLowerCase() === 'yes';
  const noError = params.get('ag_error') === 'none';

  if (!signatureValid || !siteValid || !nonceValid || !responseValid || !attemptValid || !successFlag || !noError || !token) {
    await admin.from('agego_verification_attempts').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      failure_code: params.get('ag_error') || 'response_not_valid',
    }).eq('id', attempt.id).eq('status', 'pending');
    return resultRedirect(request, 'failed');
  }

  let tokenValid = false;
  try {
    tokenValid = await validateAgegoToken(token, nonce, verifiedSite);
  } catch (error) {
    console.error('AgeGO token validation request failed', error);
  }
  if (!tokenValid) {
    await admin.from('agego_verification_attempts').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      failure_code: 'token_validation_failed',
    }).eq('id', attempt.id).eq('status', 'pending');
    return resultRedirect(request, 'failed');
  }

  // Consume the attempt once. Only the server-role client can update this private table.
  const { data: consumed, error: consumeError } = await admin
    .from('agego_verification_attempts')
    .update({ status: 'verified', completed_at: new Date().toISOString() })
    .eq('id', attempt.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (consumeError || !consumed) return resultRedirect(request, 'failed');

  const { error: profileUpdateError } = await admin
    .from('profiles')
    .update({ age_verified_at: new Date().toISOString() })
    .eq('id', attempt.user_id);
  if (profileUpdateError) {
    console.error('AgeGO profile update failed', profileUpdateError);
    // Fail closed: the attempt is consumed but the account remains unverified.
    return resultRedirect(request, 'failed');
  }

  return resultRedirect(request, 'success');
}
