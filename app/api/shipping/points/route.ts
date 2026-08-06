import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type ShippingPoint = {
  id: string;
  name: string;
  line: string;
  town: string;
  postcode: string;
  carrier: string;
  meta?: string;
};

function formatUkPostcode(raw: string): string {
  const clean = raw.replace(/\s+/g, '').toUpperCase();
  if (clean.length < 5) return clean;
  return `${clean.slice(0, -3)} ${clean.slice(-3)}`;
}

function mapInpostItem(item: any): ShippingPoint | null {
  try {
    const details = item?.address_details || {};
    const building = details.building_number || item?.address?.line1 || '';
    let name = 'InPost Locker';
    if (typeof building === 'string' && building.includes(' - ')) {
      name = building.split(' - ').slice(1).join(' - ').trim() || name;
    } else if (typeof building === 'string' && building.length > 3) {
      name = building.replace(/^InPost Locker\s*-?\s*/i, '').trim() || name;
    } else if (item?.display_name) {
      name = String(item.display_name);
    }

    const line =
      details.street ||
      (item?.address?.line1
        ? String(item.address.line1).split(' InPost')[0].trim()
        : '') ||
      item?.location_description ||
      '';

    const town = details.city || '';
    const pc = details.post_code || '';
    const id = String(item?.name || item?.id || '');
    if (!id) return null;

    const avail = item?.locker_availability?.details || {};
    const dist = item?.distance;
    let distLabel: string | null = null;
    if (dist != null && Number.isFinite(Number(dist))) {
      const miles = Number(dist) / 1609.344;
      distLabel =
        miles < 0.1
          ? `${Math.round(Number(dist))}m away`
          : `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
    }
    const metaParts = [
      distLabel,
      avail.A != null ? `Small: ${avail.A}` : null,
      avail.B != null ? `Med: ${avail.B}` : null,
      avail.C != null ? `Large: ${avail.C}` : null,
    ].filter(Boolean);

    return {
      id,
      name: String(name),
      line: String(line),
      town: String(town),
      postcode: String(pc),
      carrier: 'inpost',
      meta: metaParts.length ? metaParts.join(' · ') : undefined,
    };
  } catch {
    return null;
  }
}

/** Resolve UK postcode → lat/lng via postcodes.io (more accurate than InPost postcode param) */
async function geocodeUkPostcode(postcode: string) {
  const res = await fetch(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
    { cache: 'no-store' }
  );
  if (!res.ok) return null;
  const body = await res.json();
  const r = body?.result;
  if (!r || r.latitude == null || r.longitude == null) return null;
  return { latitude: Number(r.latitude), longitude: Number(r.longitude) };
}

async function fetchInpostByPoint(lat: number, lng: number) {
  const params = new URLSearchParams({
    relative_point: `${lat},${lng}`,
    limit: '20',
    max_distance: '30000',
    status: 'Operating',
    virtual: '0',
  });

  return fetch(
    `https://api-uk-global-points.easypack24.net/v1/points?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WorldOfDommes/1.0',
      },
      cache: 'no-store',
    }
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const carrier = (searchParams.get('carrier') || '').toLowerCase().trim();
    const postcodeRaw = (searchParams.get('postcode') || '').trim();

    if (!carrier || !postcodeRaw) {
      return NextResponse.json(
        { error: 'carrier and postcode are required', points: [] },
        { status: 400 }
      );
    }

    const postcode = formatUkPostcode(postcodeRaw);
    if (postcode.replace(/\s/g, '').length < 5) {
      return NextResponse.json(
        { error: 'Enter a full UK postcode', points: [] },
        { status: 400 }
      );
    }

    if (carrier === 'inpost') {
      const coords = await geocodeUkPostcode(postcode);
      if (!coords) {
        return NextResponse.json(
          {
            error: 'Could not recognise that postcode. Check it and try again.',
            points: [],
          },
          { status: 200 }
        );
      }

      const res = await fetchInpostByPoint(coords.latitude, coords.longitude);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('InPost HTTP', res.status, text.slice(0, 300));
        return NextResponse.json(
          {
            error: `InPost lookup failed (${res.status}). Try another postcode or enter manually.`,
            points: [],
          },
          { status: 200 }
        );
      }

      const body = await res.json();
      const items = Array.isArray(body?.items) ? body.items : [];

      const sorted = [...items].sort((a: any, b: any) => {
        const da = Number(a?.distance);
        const db = Number(b?.distance);
        if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
        if (Number.isFinite(da)) return -1;
        if (Number.isFinite(db)) return 1;
        return 0;
      });

      const points: ShippingPoint[] = [];
      for (const item of sorted) {
        const mapped = mapInpostItem(item);
        if (mapped) points.push(mapped);
      }

      return NextResponse.json({
        carrier: 'inpost',
        postcode,
        points,
        live: true,
        message:
          points.length === 0
            ? 'No InPost lockers found near that postcode'
            : undefined,
      });
    }

    return NextResponse.json({
      carrier,
      postcode,
      points: [],
      live: false,
      message:
        carrier === 'evri'
          ? 'Live Evri search needs a business API. Enter a shop name manually for now.'
          : carrier === 'royal_mail'
            ? 'Live Royal Mail search needs a business API. Enter a point manually for now.'
            : carrier === 'yodel'
              ? 'Live Yodel search needs a business API. Enter a point manually for now.'
              : 'Live search not available for this carrier yet.',
    });
  } catch (e: any) {
    console.error('shipping points error', e);
    return NextResponse.json(
      {
        error: e?.message || 'Failed to search points',
        points: [],
      },
      { status: 200 }
    );
  }
}
