/**
 * Sendcloud API helpers — Basic auth + API v3 shipments
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

function getAuthHeader() {
  const { key, secret } = getKeys();
  return `Basic ${Buffer.from(`${key}:${secret}`, 'utf8').toString('base64')}`;
}

async function scFetch(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: getAuthHeader(),
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
      body?.detail ||
      body?.message ||
      body?.error ||
      body?.errors?.[0]?.detail ||
      body?.errors?.[0]?.title ||
      body?.errors?.[0] ||
      text?.slice(0, 500) ||
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

  try {
    return await scFetch(
      `https://servicepoints.sendcloud.sc/api/v2/service-points?${params.toString()}`
    );
  } catch (e1: any) {
    try {
      return await scFetch(
        `https://panel.sendcloud.sc/api/v2/service-points?${params.toString()}`
      );
    } catch {
      throw e1;
    }
  }
}

/** Shipping methods that support a given service point (v2 list still works for many accounts) */
export async function getShippingMethodsForServicePoint(servicePointId: number | string) {
  return scFetch(
    `https://panel.sendcloud.sc/api/v2/shipping_methods?service_point_id=${servicePointId}`
  );
}


/** Seller / platform sender address for v3 (required) */
function getFromAddress() {
  return {
    name: (process.env.SENDCLOUD_FROM_NAME || 'World of Dommes').trim(),
    company_name: (process.env.SENDCLOUD_FROM_COMPANY || 'World of Dommes').trim(),
    address_line_1: (process.env.SENDCLOUD_FROM_ADDRESS || '1 High Street').trim(),
    house_number: (process.env.SENDCLOUD_FROM_HOUSE || '1').trim(),
    city: (process.env.SENDCLOUD_FROM_CITY || 'London').trim(),
    postal_code: (process.env.SENDCLOUD_FROM_POSTCODE || 'SW1A 1AA').trim(),
    country_code: (process.env.SENDCLOUD_FROM_COUNTRY || 'GB').trim(),
    phone_number: (process.env.SENDCLOUD_FROM_PHONE || '+447700000000').trim(),
    email: (process.env.SENDCLOUD_FROM_EMAIL || 'shipping@worldofdommes.com').trim(),
  };
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
  /** InPost / carrier locker code e.g. UK00109434 */
  carrier_service_point_id?: string;
  shipment_method_id: number;
  weight_kg?: string;
  order_number?: string;
  request_label?: boolean;
};

/**
 * Create + announce shipment via API v3 (required for new accounts)
 * POST /api/v3/shipments/announce
 */
export async function createParcel(input: CreateParcelInput) {
  const toAddress = {
    name: input.name,
    address_line_1: input.address,
    house_number: input.house_number || '1',
    city: input.city,
    postal_code: input.postal_code,
    country_code: input.country || 'GB',
    phone_number: input.telephone || '',
    email: input.email || '',
  };

  const parcels = [
    {
      weight: {
        value: input.weight_kg || '1.000',
        unit: 'kg',
      },
    },
  ];

  // v3 expects service point as object: { id } or { carrier_service_point_id }
  const servicePoint =
    input.carrier_service_point_id
      ? { carrier_service_point_id: String(input.carrier_service_point_id) }
      : { id: Number(input.to_service_point) };

  // Attempt 1: shipping_method_id (maps from v2 methods list)
  const fromAddress = getFromAddress();

  const bodyMethodId = {
    from_address: fromAddress,
    to_address: toAddress,
    to_service_point: servicePoint,
    ship_with: {
      type: 'shipping_method_id',
      properties: {
        shipping_method_id: input.shipment_method_id,
      },
    },
    parcels,
    order_number: input.order_number || undefined,
  };

  try {
    return await scFetch('https://panel.sendcloud.sc/api/v3/shipments/announce', {
      method: 'POST',
      body: JSON.stringify(bodyMethodId),
    });
  } catch (e1: any) {
    // Attempt 2: apply shipping rules / defaults (no explicit method)
    const bodyRules = {
      from_address: fromAddress,
      to_address: toAddress,
      to_service_point: servicePoint,
      parcels,
      order_number: input.order_number || undefined,
      apply_shipping_rules: true,
      apply_shipping_defaults: true,
    };
    try {
      return await scFetch(
        'https://panel.sendcloud.sc/api/v3/shipments/announce-with-shipping-rules',
        {
          method: 'POST',
          body: JSON.stringify(bodyRules),
        }
      );
    } catch (e2: any) {
      // Attempt 3: carrier_service_point_id only (InPost machine code style)
      if (input.carrier_service_point_id) {
        const bodyCarrier = {
          from_address: fromAddress,
          to_address: toAddress,
          to_service_point: {
            carrier_service_point_id: String(input.carrier_service_point_id),
          },
          ship_with: {
            type: 'shipping_method_id',
            properties: {
              shipping_method_id: input.shipment_method_id,
            },
          },
          parcels,
          order_number: input.order_number || undefined,
        };
        try {
          return await scFetch('https://panel.sendcloud.sc/api/v3/shipments/announce', {
            method: 'POST',
            body: JSON.stringify(bodyCarrier),
          });
        } catch (e3: any) {
          throw new Error(
            `v3 announce failed. Method: ${e1?.message || e1}. Rules: ${e2?.message || e2}. CarrierSP: ${e3?.message || e3}`
          );
        }
      }
      throw new Error(
        `v3 announce failed. Method: ${e1?.message || e1}. Rules: ${e2?.message || e2}`
      );
    }
  }
}

/** Extract tracking + label URL from v3 or v2-shaped responses */
export function extractLabelInfo(created: any) {
  const shipment = created?.data || created?.shipment || created;
  const parcels = shipment?.parcels || created?.parcels || [];
  const parcel = Array.isArray(parcels) ? parcels[0] : parcels;

  const tracking =
    parcel?.tracking_number ||
    parcel?.carrier_tracking_number ||
    shipment?.tracking_number ||
    null;

  let labelUrl: string | null =
    parcel?.label?.normal_printer?.[0] ||
    parcel?.label?.label_printer ||
    parcel?.documents?.find((d: any) => d.type === 'label')?.link ||
    parcel?.documents?.[0]?.link ||
    null;

  // v3 may return base64 label_file
  const labelFile = parcel?.label_file || shipment?.label_file;
  if (!labelUrl && labelFile?.contents && labelFile?.mime_type === 'application/pdf') {
    // Data URL so the seller can open/download immediately
    labelUrl = `data:application/pdf;base64,${labelFile.contents}`;
  }

  const parcelId =
    parcel?.id != null
      ? String(parcel.id)
      : shipment?.id != null
        ? String(shipment.id)
        : null;

  return { tracking, labelUrl, parcelId, raw: created };
}

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
