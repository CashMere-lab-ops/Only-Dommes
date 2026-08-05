import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export type ShippingPoint = {
  id: string;
  name: string;
  line: string;
  town: string;
  postcode: string;
  carrier: string;
  distance?: string;
  meta?: string;
};

/**
 * GET /api/shipping/points?carrier=inpost&postcode=SW1A1AA
 *
 * Live search:
 * - inpost → real UK lockers (via inpost package)
 * - evri | royal_mail | yodel → empty list + hint (need business API later)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const carrier = (searchParams.get('carrier') || '').toLowerCase().trim();
  const postcode = (searchParams.get('postcode') || '').trim().toUpperCase();

  if (!carrier || !postcode) {
    return NextResponse.json(
      { error: 'carrier and postcode are required' },
      { status: 400 }
    );
  }

  const cleanPostcode = postcode.replace(/\s+/g, '');
  if (cleanPostcode.length < 5) {
    return NextResponse.json(
      { error: 'Enter a full UK postcode' },
      { status: 400 }
    );
  }

  try {
    if (carrier === 'inpost') {
      const { findLocationsByPostcode } = await import('inpost');
      const locations = await findLocationsByPostcode(postcode);

      const points: ShippingPoint[] = (locations || []).slice(0, 15).map((loc: any) => {
        const addr = loc.address || {};
        const line = [addr.street, addr.building]
          .filter(Boolean)
          .join(', ') || loc.description || '';
        const town = addr.city || addr.town || '';
        const pc = addr.postcode || addr.postCode || postcode;
        const avail = [
          loc.smallLockerAvailability != null
            ? `S:${loc.smallLockerAvailability}`
            : null,
          loc.mediumLockerAvailability != null
            ? `M:${loc.mediumLockerAvailability}`
            : null,
          loc.largeLockerAvailability != null
            ? `L:${loc.largeLockerAvailability}`
            : null,
        ]
          .filter(Boolean)
          .join(' ');

        return {
          id: String(loc.id || loc.name),
          name: loc.name || 'InPost Locker',
          line,
          town,
          postcode: pc,
          carrier: 'inpost',
          meta: avail || undefined,
        };
      });

      return NextResponse.json({
        carrier: 'inpost',
        postcode,
        points,
        live: true,
      });
    }

    // Evri / Royal Mail / Yodel — structured for later business APIs
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
