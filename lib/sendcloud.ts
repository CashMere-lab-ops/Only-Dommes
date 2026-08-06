/**
 * Sendcloud API helpers
 * Uses OAuth2 client_credentials (required when integration enforces OAuth2)
 * Falls back to Basic auth if token endpoint is not needed.
 */

function getKeys() {
  const key = (process.env.SENDCLOUD_PUBLIC_KEY || '').trim();
  const secret = (process.env.SENDCLOUD_SECRET_KEY || '').trim();
  if (!key || !secret) {
    throw new Error(
      'Missing SENDCLOUD_PUBLIC_KEY or SENDCLOUD_SECRET_KEY on the server. Check Vercel env vars and redeploy.'
    );
  }
  return { key, secret };
}

function basicHeader() {
  const { key, secret } = getKeys();
  return `Basic ${Buffer.from(`${key}:${secret}`, 'utf8').toString('base64')}`;
}

/** OAuth2 access token (client_credentials) */
async function getAccessToken(): Promise<string> {
  const res = await fetch('https://account.sendcloud.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: basicHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials&scope=api',
    cache: 'no-store',
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!res.ok || !body?.access_token) {
    const msg =
      body?.error_description ||
      body?.error ||
      body?.message ||
      text?.slice(0, 300) ||
      `OAuth2 token failed HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  return body.access_token as string;
}

async function scFetch(url: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    const msg =
      body?.error?.message ||
      body?.message ||
      body?.error ||
      body?.errors?.[0] ||
      text?.slice(0, 300) ||
      `Sendcloud HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return body;
}

/** Search service points near a UK postcode */
export async function searchServicePoints(opts: {
  postcode: string;
  carrier?: string;
  radius?: number;
}) {
  const params = new URLSearchParams({
    country: 'GB',
    address: opts.postcode,
    radius: String(opts.radius ?? 20000),
  });
  if (opts.carrier) {
    params.set('carrier', opts.carrier);
  }
  return scFetch(
    `https://servicepoints.sendcloud.sc/api/v2/service-points?${params.toString()}`
  );
}

/** Shipping methods that support a given service point */
export async function getShippingMethodsForServicePoint(servicePointId: number | string) {
  return scFetch(
    `https://panel.sendcloud.sc/api/v2/shipping_methods?service_point_id=${servicePointId}`
  );
}

export type CreateParcelInput = {
  name: string;
  email?: string;
  telephone?: string;
  address: string;
  house_number?: string;
  city: string;
  postal_code: string;
  country?: string;
  to_service_point: number;
  shipment_method_id: number;
  weight_kg?: string;
  order_number?: string;
  request_label?: boolean;
};

/** Create parcel + optional label */
export async function createParcel(input: CreateParcelInput) {
  const parcel: any = {
    name: input.name,
    email: input.email || '',
    telephone: input.telephone || '',
    address: input.address,
    house_number: input.house_number || '1',
    city: input.city,
    postal_code: input.postal_code,
    country: input.country || 'GB',
    to_service_point: input.to_service_point,
    shipment: { id: input.shipment_method_id },
    weight: input.weight_kg || '1.000',
    order_number: input.order_number || '',
    request_label: input.request_label !== false,
  };

  return scFetch('https://panel.sendcloud.sc/api/v2/parcels', {
    method: 'POST',
    body: JSON.stringify({ parcel }),
  });
}

/** Pick best matching Sendcloud service point for our stored locker choice */
export function matchServicePoint(
  points: any[],
  opts: { name?: string; postcode?: string; inpostId?: string }
) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const name = (opts.name || '').toLowerCase();
  const pc = (opts.postcode || '').replace(/\s/g, '').toUpperCase();
  const inpostId = (opts.inpostId || '').toUpperCase();

  const scored = points.map((p) => {
    let score = 0;
    const pName = String(p.name || p.code || '').toLowerCase();
    const pPc = String(p.postal_code || p.postalCode || '')
      .replace(/\s/g, '')
      .toUpperCase();
    const pCode = String(p.code || p.extra_data?.code || '').toUpperCase();

    if (pc && pPc === pc) score += 5;
    if (name && pName.includes(name.slice(0, 12))) score += 3;
    if (name && name.includes(pName.slice(0, 12))) score += 2;
    if (inpostId && (pCode === inpostId || String(p.id) === inpostId)) score += 10;
    return { p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score > 0) return scored[0].p;
  return points[0];
}
