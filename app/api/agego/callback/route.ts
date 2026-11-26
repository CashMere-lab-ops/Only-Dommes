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
  const params = new URL(request.url).searchParams;
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

  const { data: attempt, error: attemptError } = await admin
    .from('agego_verification_attempts')
    .select('id, user_id, status, expires_at, agego_site')
    .eq('nonce_hash', hashAgegoNonce(nonce))
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
  const nonceValid = /^[a-f0-9]{64}$/i.test(nonce);
  const successFlag = (params.get('ag_verified') || '').toLowerCase() === 'yes';

  // The signed verified flag and AgeGO token validation are authoritative.
  // ag_error is signature-bound, but its success representation is not assumed here.
  if (!signatureValid || !siteValid || !nonceValid || !responseValid || !attemptValid || !successFlag || !token) {
    await admin.from('agego_verification_attempts').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      failure_code: 'response_not_valid',
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

  // The RPC updates the profile and consumes the attempt in one database transaction.
  const { data: completed, error: completionError } = await admin.rpc('complete_agego_verification', {
    p_attempt_id: attempt.id,
    p_user_id: attempt.user_id,
  });

  if (completionError || completed !== true) {
    console.error('AgeGO atomic completion failed', completionError);
    return resultRedirect(request, 'failed');
  }

  return resultRedirect(request, 'success');
}
