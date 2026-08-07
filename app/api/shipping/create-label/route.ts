import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  searchServicePoints,
  createParcel,
  matchServicePoint,
  extractLabelInfo,
  compatShippingOption,
  fetchParcelLabelUrl,
} from '../../../../lib/sendcloud';

export const dynamic = 'force-dynamic';

/** Known InPost method IDs on this Sendcloud account */
const INPOST_METHOD_IDS = [
  { id: 27221, name: 'InPost Locker to Locker 0-15kg - Small' },
  { id: 27222, name: 'InPost Locker to Locker 0-15kg - Medium' },
  { id: 27223, name: 'InPost Locker to Locker 0-15kg - Large' },
  { id: 3747, name: 'InPost Address to Locker Two Day 0-15kg' },
];

export async function POST(request: Request) {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const orderId = (body?.order_id || body?.orderId) as string;
    if (!orderId) {
      return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    }

    const { data: order, error: orderErr } = await admin
      .from('shop_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const ownerId = order.creator_id || order.seller_id;
    if (ownerId !== user.id) {
      return NextResponse.json({ error: 'Not your order' }, { status: 403 });
    }

    const postcode = String(
      order.shipping_point_postcode ||
        order.shipping_postcode ||
        order.collection_postcode ||
        ''
    )
      .replace(/\s/g, '')
      .toUpperCase();

    if (!postcode) {
      return NextResponse.json(
        {
          error:
            'Order missing locker postcode (shipping_point_postcode). Buyer must select a PUDO point when requesting the item.',
        },
        { status: 400 }
      );
    }

    // Match Sendcloud service point near buyer locker
    let points: any[] = [];
    try {
      const sp = await searchServicePoints({
        postcode,
        carrier: 'inpost',
        radius: 25000,
      });
      points = Array.isArray(sp) ? sp : sp?.service_points || sp?.data || [];
    } catch {
      try {
        const sp2 = await searchServicePoints({ postcode, radius: 25000 });
        points = Array.isArray(sp2) ? sp2 : sp2?.service_points || sp2?.data || [];
      } catch (e: any) {
        return NextResponse.json(
          { error: `Service point search failed: ${e?.message || e}` },
          { status: 400 }
        );
      }
    }

    const matched = matchServicePoint(points, {
      name: order.shipping_point_name || order.shipping_point_line,
      postcode,
      inpostId: order.shipping_point_id,
    });

    if (!matched) {
      return NextResponse.json(
        { error: 'Could not match InPost service point for this order' },
        { status: 400 }
      );
    }

    const servicePointId = Number(matched.id);
    const carrierSpId =
      order.shipping_point_id ||
      matched.code ||
      matched.carrier_service_point_id ||
      undefined;

    // Resolve shipping_option_code via compat for known InPost methods
    let shippingOptionCode: string | undefined;
    let contractId: number | undefined;
    let preferred = INPOST_METHOD_IDS[0];

    for (const method of INPOST_METHOD_IDS) {
      try {
        const compat = await compatShippingOption(method.id);
        const code = compat?.shipping_option_code || compat?.code;
        if (code && !/^\d+$/.test(String(code))) {
          shippingOptionCode = String(code);
          preferred = method;
          break;
        }
      } catch {
        /* try next */
      }
    }

    if (!shippingOptionCode) {
      // Last resort: still pass method id path via createParcel internal resolve
      preferred = INPOST_METHOD_IDS[0];
    }

    const recipientName =
      order.collection_name || order.shipping_name || 'Customer';
    const city =
      order.shipping_point_town || order.shipping_county || 'London';
    const addressLine =
      order.shipping_point_line ||
      order.shipping_point_name ||
      matched.street ||
      matched.address ||
      'Service Point';

    const created = await createParcel({
      name: recipientName,
      email: order.buyer_email || '',
      telephone: order.collection_phone || order.shipping_phone || '',
      address: String(addressLine).slice(0, 50),
      house_number: '1',
      city: String(city).slice(0, 50),
      postal_code: postcode,
      country: 'GB',
      to_service_point: servicePointId,
      carrier_service_point_id: carrierSpId ? String(carrierSpId) : undefined,
      shipment_method_id: preferred.id,
      shipping_option_code: shippingOptionCode,
      contract_id: contractId,
      weight_kg: '1.000',
      order_number: order.id.slice(0, 36),
      request_label: true,
    });

    let { tracking, labelUrl, parcelId } = extractLabelInfo(created);

    // If announce didn't include a label file, fetch it by parcel id
    if (!labelUrl && parcelId) {
      try {
        labelUrl = await fetchParcelLabelUrl(parcelId);
      } catch {
        /* ignore */
      }
    }

    // Label generated = ready for seller drop-off (not "shipped" to buyer yet)
    const nextStatus =
      order.status === 'accepted' ||
      order.status === 'paid' ||
      order.status === 'awaiting_payment'
        ? 'label_ready'
        : order.status;

    await admin
      .from('shop_orders')
      .update({
        tracking_number: tracking,
        label_url: labelUrl,
        sendcloud_parcel_id: parcelId,
        sendcloud_service_point_id: String(servicePointId),
        status: nextStatus,
        label_created_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    return NextResponse.json({
      ok: true,
      tracking_number: tracking,
      label_url: labelUrl,
      sendcloud_parcel_id: parcelId,
      service_point_id: servicePointId,
      shipping_method: preferred.name,
      shipping_option_code: shippingOptionCode,
      status: nextStatus,
      note: labelUrl
        ? 'Label ready — open PDF and drop at any InPost locker'
        : 'Shipment created in Sendcloud. Open the label from Sendcloud panel if PDF missing here.',
    });
  } catch (e: any) {
    console.error('create-label', e);
    return NextResponse.json(
      { error: e?.message || 'Failed to create label' },
      { status: 500 }
    );
  }
}
