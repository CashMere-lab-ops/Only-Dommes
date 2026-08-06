import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  searchServicePoints,
  getShippingMethodsForServicePoint,
  createParcel,
  matchServicePoint,
  extractLabelInfo,
} from '../../../../lib/sendcloud';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST { orderId: string }
 * Creates Sendcloud/InPost service-point shipment + label for a shop order.
 * Seller can then open label_url / tracking from dashboard.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orderId = body?.orderId as string;
    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    // Auth: require logged-in user (bearer from client optional — use anon + user header pattern)
    // For creators we verify via service role after checking order.creator_id against auth
    const authHeader = request.headers.get('authorization');
    const anon = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || serviceKey,
      {
        global: authHeader
          ? { headers: { Authorization: authHeader } }
          : undefined,
      }
    );

    const {
      data: { user },
    } = await anon.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const admin = createClient(url, serviceKey);

    const { data: order, error: oErr } = await admin
      .from('shop_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (oErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.creator_id !== user.id) {
      return NextResponse.json({ error: 'Not your order' }, { status: 403 });
    }

    if (order.shipping_carrier !== 'inpost') {
      return NextResponse.json(
        {
          error:
            'Label API is wired for InPost first. Evri / Royal Mail / Yodel next.',
        },
        { status: 400 }
      );
    }

    if (order.label_url || order.sendcloud_parcel_id) {
      return NextResponse.json({
        ok: true,
        already: true,
        tracking_number: order.tracking_number,
        label_url: order.label_url,
        sendcloud_parcel_id: order.sendcloud_parcel_id,
      });
    }

    const postcode = order.shipping_point_postcode || order.shipping_postcode;
    if (!postcode) {
      return NextResponse.json(
        { error: 'Order has no collect postcode' },
        { status: 400 }
      );
    }

    // 1) Find Sendcloud service points near buyer locker postcode
    let spList: any[] = [];
    try {
      const spRes = await searchServicePoints({
        postcode,
        carrier: 'inpost',
        radius: 25000,
      });
      spList = Array.isArray(spRes) ? spRes : spRes?.data || spRes?.service_points || [];
    } catch (e: any) {
      // retry without carrier filter
      const spRes = await searchServicePoints({ postcode, radius: 25000 });
      spList = Array.isArray(spRes) ? spRes : spRes?.data || spRes?.service_points || [];
    }

    if (!spList.length) {
      return NextResponse.json(
        {
          error:
            'No Sendcloud/InPost service points found near that postcode. Check InPost is enabled under Couriers + Service Points.',
        },
        { status: 400 }
      );
    }

    const matched = matchServicePoint(spList, {
      name: order.shipping_point_name,
      postcode,
      inpostId: order.shipping_point_id,
    });

    if (!matched?.id) {
      return NextResponse.json(
        { error: 'Could not match a Sendcloud service point to this locker' },
        { status: 400 }
      );
    }

    const servicePointId = Number(matched.id);

    // 2) Shipping method for that service point
    const methodsRes = await getShippingMethodsForServicePoint(servicePointId);
    const methods = methodsRes?.shipping_methods || methodsRes || [];
    const methodList = Array.isArray(methods) ? methods : [];
    if (!methodList.length) {
      return NextResponse.json(
        {
          error:
            'No shipping methods for this service point. Enable InPost contract in Sendcloud → Shipping → Couriers.',
        },
        { status: 400 }
      );
    }

    // Prefer method name containing inpost / locker / service
    const preferred =
      methodList.find((m: any) =>
        /inpost|locker|service.?point/i.test(String(m.name || ''))
      ) || methodList[0];

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

    // 3) Create parcel + label
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
      shipment_method_id: Number(preferred.id),
      weight_kg: '1.000',
      order_number: order.id.slice(0, 36),
      request_label: true,
    });

    const { tracking, labelUrl, parcelId } = extractLabelInfo(created);

    await admin
      .from('shop_orders')
      .update({
        tracking_number: tracking,
        label_url: labelUrl,
        sendcloud_parcel_id: parcelId,
        sendcloud_service_point_id: String(servicePointId),
        status: order.status === 'accepted' || order.status === 'paid' ? 'shipped' : order.status,
        shipped_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    return NextResponse.json({
      ok: true,
      tracking_number: tracking,
      label_url: labelUrl,
      sendcloud_parcel_id: parcelId,
      service_point_id: servicePointId,
      shipping_method: preferred.name,
    });
  } catch (e: any) {
    console.error('create-label', e);
    return NextResponse.json(
      { error: e?.message || 'Failed to create label' },
      { status: 500 }
    );
  }
}
