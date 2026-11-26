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
  // AgeGO returns the numeric Site ID in ag_verified_site (e.g. "1821").
  // The ASI UUID is a separate identifier used in the S2S start request.
  const expectedSiteId = process.env.AGEGO_SITE_ID || '1821';
  const siteValid = verifiedSite === expectedSiteId && attempt.agego_site === AGEGO_ASI;
  const nonceValid = /^[a-f0-9]{64}$/i.test(nonce);
  const successFlag = (params.get('ag_verified') || '').toLowerCase() === 'yes';

  // Record only non-sensitive validation outcomes. Never log the signature, token,
  // nonce, callback query string, or site secret.
  const failedChecks = [
    !signatureValid && 'signature_invalid',
    !siteValid && 'site_mismatch',
    !nonceValid && 'nonce_invalid',
    !responseValid && 'response_expired_or_invalid',
    !attemptValid && 'attempt_expired',
    !successFlag && 'provider_not_verified',
    !token && 'token_missing',
  ].filter((value): value is string => Boolean(value));

  if (failedChecks.length > 0) {
    console.warn('AgeGO callback rejected', {
      attemptId: attempt.id,
      failedChecks,
      signatureAlgorithm: params.get('ag_signature_algo') || 'missing',
      hasSignature: Boolean(params.get('ag_signature')),
      hasToken: Boolean(token),
      verifiedFlag: params.get('ag_verified') || 'missing',
      responseExpiryIsNumeric: Number.isFinite(expires),
      responseExpiryInFuture: responseValid,
      attemptExpiryInFuture: attemptValid,
      // Site ID and ASI are distinct identifiers; neither is a credential.
      returnedVerifiedSiteId: verifiedSite,
      configuredSiteId: expectedSiteId,
      configuredAsi: AGEGO_ASI,
      attemptSite: attempt.agego_site,
      verifiedSiteMatchesConfiguredSiteId: verifiedSite === expectedSiteId,
      attemptSiteMatchesConfiguredAsi: attempt.agego_site === AGEGO_ASI,
      nonceHasExpectedFormat: nonceValid,
    });
    await admin.from('agego_verification_attempts').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      failure_code: failedChecks.join(',').slice(0, 200),
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
