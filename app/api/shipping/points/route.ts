import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export type ShippingPoint = {
  id: string;
  name: string;
  line: string;
  town: string;
  postcode: string;
  carrier: string;
  meta?: string;
};

/** UK postcode: DE742YF → DE74 2YF */
function formatUkPostcode(raw: string): string {
  const clean = raw.replace(/\s+/g, '').toUpperCase();
  if (clean.length < 5) return clean;
  return `${clean.slice(0, -3)} ${clean.slice(-3)}`;
}

function mapInpostItem(item: any): ShippingPoint | null {
  try {
    const details = item?.address_details || {};
    const building = details.building_number || item?.address?.line1 || '';
    let name = item?.display_name || 'InPost Locker';
    if (typeof building === 'string' && building.includes(' - ')) {
      name = building.split(' - ').slice(1).join(' - ').trim() || name;
    } else if (typeof building === 'string' && building.startsWith('InPost')) {
      name = building.replace(/^InPost Locker\s*-?\s*/i, '').trim() || name;
    }

    const line =
      details.street ||
      (item?.address?.line1 ? String(item.address.line1).split(' InPost')[0] : '') ||
      item?.location_description ||
      '';

    const town = details.city || '';
    const postcode = details.post_code || '';
    const id = String(item?.name || item?.id || '');
    if (!id) return null;

    const avail = item?.locker_availability?.details || {};
    const metaParts = [
      item?.distance != null ? `${Math.round(Number(item.distance))}m` : null,
      avail.A != null ? `S:${avail.A}` : null,
      avail.B != null ? `M:${avail.B}` : null,
      avail.C != null ? `L:${avail.C}` : null,
    ].filter(Boolean);

    return {
      id,
      name: String(name),
      line: String(line),
      town: String(town),
      postcode: String(postcode),
      carrier: 'inpost',
      meta: metaParts.length ? metaParts.join(' · ') : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * GET /api/shipping/points?carrier=inpost&postcode=DE74%202YF
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const carrier = (searchParams.get('carrier') || '').toLowerCase().trim();
  const postcodeRaw = (searchParams.get('postcode') || '').trim();

  if (!carrier || !postcodeRaw) {
    return NextResponse.json(
      { error: 'carrier and postcode are required' },
      { status: 400 }
    );
  }

  const postcode = formatUkPostcode(postcodeRaw);
  if (postcode.replace(/\s/g, '').length < 5) {
    return NextResponse.json(
      { error: 'Enter a full UK postcode' },
      { status: 400 }
    );
  }

  try {
    if (carrier === 'inpost') {
      const params = new URLSearchParams({
        relative_post_code: postcode,
        limit: '15',
        max_distance: '25000',
        status: 'Operating',
        virtual: '0',
      });

      const res = await fetch(
        `https://api-uk-global-points.easypack24.net/v1/points?${params.toString()}`,
        { headers: { Accept: 'application/json' } }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('InPost points HTTP', res.status, text);
        return NextResponse.json(
          {
            error:
              'Could not find lockers for that postcode. Check it and try again, or enter a point manually.',
            points: [],
          },
          { status: 502 }
        );
      }

      const body = await res.json();
      const items = Array.isArray(body?.items) ? body.items : [];
      const points = items
        .map(mapInpostItem)
        .filter(Boolean) as ShippingPoint[];

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
      points: [] as ShippingPoint[],
      live: false,
      message:
        carrier === 'evri'
          ? 'Live Evri ParcelShop search needs an Evri business API. Enter a shop name manually for now.'
          : carrier === 'royal_mail'
            ? 'Live Royal Mail Collect points need a business API. Enter a point manually for now.'
            : carrier === 'yodel'
              ? 'Live Yodel points need a business API. Enter a point manually for now.'
              : 'Live search not available for this carrier yet.',
    });
  } catch (e: any) {
    console.error('shipping points error', e);
    return NextResponse.json(
      {
        error: e?.message || 'Failed to search points',
        points: [],
      },
      { status: 500 }
    );
  }
}
