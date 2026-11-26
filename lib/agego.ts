import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const AGEGO_ASI = process.env.AGEGO_ASI || '52dd0d84-ebe4-430c-8f86-da5bd05d28af';
export const AGEGO_START_URL = process.env.AGEGO_START_URL || 'https://myapi.agego.com/s2s/start/';
export const AGEGO_TOKEN_URL = 'https://myapi.agego.com/authorization/user/validate-token';
export const AGEGO_ATTEMPT_TTL_MS = 15 * 60 * 1000;

export function createAgegoNonce(): string {
  return randomBytes(32).toString('hex');
}

export function hashAgegoNonce(nonce: string): string {
  return createHash('sha256').update(nonce, 'utf8').digest('hex');
}

export function verifyAgegoSignature(params: URLSearchParams, siteSecret: string): boolean {
  const algorithm = params.get('ag_signature_algo');
  const signature = params.get('ag_signature') || '';
  if (algorithm !== 'sha256' || !/^[a-f0-9]{64}$/i.test(signature)) return false;

  const data = [
    params.get('ag_error') ?? 'none',
    params.get('ag_expires') ?? 'none',
    params.get('ag_nonce') ?? 'none',
    params.get('ag_verified') ?? 'none',
    params.get('ag_verified_site') ?? 'none',
  ].join('|');

  const expected = createHmac('sha256', siteSecret).update(data, 'utf8').digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function validateAgegoToken(token: string, nonce: string, siteId: string): Promise<boolean> {
  const response = await fetch(AGEGO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, nonce, site_id: siteId }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return false;
  const result: unknown = await response.json();
  return Boolean(
    result &&
    typeof result === 'object' &&
    'status' in result &&
    (result as { status?: unknown }).status === true
  );
}
