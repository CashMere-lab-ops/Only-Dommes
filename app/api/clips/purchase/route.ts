import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type ClipPurchaseResult = {
  ok?: boolean;
  already?: boolean;
  free?: boolean;
  amount_gbp?: number;
  gross_gbp?: number;
  fee_gbp?: number;
  net_gbp?: number;
  purchase_id?: string;
};

export async function POST(request: Request) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(token);

    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const clipId = String(body?.clip_id || '');
    if (!clipId) {
      return NextResponse.json({ error: 'clip_id required' }, { status: 400 });
    }

    const { data: clip, error: clipErr } = await admin
      .from('clips')
      .select('id, creator_id, title, price_gbp, is_published')
      .eq('id', clipId)
      .single();

    if (clipErr || !clip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }
    if (!clip.is_published) {
      return NextResponse.json({ error: 'Clip not available' }, { status: 400 });
    }
    if (clip.creator_id === user.id) {
      return NextResponse.json({ error: 'You already own this clip' }, { status: 400 });
    }

    const { data: blocked, error: blockErr } = await admin
      .from('blocks')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${clip.creator_id}),and(blocker_id.eq.${clip.creator_id},blocked_id.eq.${user.id})`
      )
      .limit(1);

    if (blockErr) {
      console.error('clip purchase block check', blockErr);
      return NextResponse.json({ error: 'Could not validate this purchase' }, { status: 500 });
    }
    if (blocked?.length) {
      return NextResponse.json(
        { error: 'You can’t buy this clip', code: 'BLOCKED' },
        { status: 403 }
      );
    }

    const { data: buyerProfile, error: buyerProfileErr } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .single();

    if (buyerProfileErr || !buyerProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // One stable key per buyer/clip means retries cannot charge twice.
    // It is namespaced to this operation and is not accepted from the client.
    const idempotencyKey = `clip-purchase:${user.id}:${clipId}`;

    const { data, error: purchaseErr } = await admin.rpc('purchase_creator_clip', {
      p_buyer_id: user.id,
      p_clip_id: clipId,
      p_idempotency_key: idempotencyKey,
    });

    if (purchaseErr) {
      const message = purchaseErr.message || 'Clip purchase failed';
      if (message.includes('Insufficient wallet balance')) {
        return NextResponse.json(
          { error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' },
          { status: 402 }
        );
      }
      if (message.includes('Clip not available')) {
        return NextResponse.json({ error: 'Clip not available' }, { status: 400 });
      }
      if (message.includes('cannot purchase your own clip')) {
        return NextResponse.json({ error: 'You already own this clip' }, { status: 400 });
      }
      if (message.includes('Incomplete prior transfer')) {
        return NextResponse.json(
          { error: 'Purchase requires reconciliation', code: 'RECONCILIATION_REQUIRED' },
          { status: 409 }
        );
      }
      console.error('purchase_creator_clip RPC', purchaseErr);
      return NextResponse.json({ error: 'Clip purchase failed' }, { status: 500 });
    }

    const result = (data || {}) as ClipPurchaseResult;

    if (result.already) {
      return NextResponse.json({
        ok: true,
        already: true,
        message: 'Already purchased',
      });
    }

    const { data: balances, error: balancesErr } = await admin
      .from('profiles')
      .select('id, balance_gbp')
      .in('id', [user.id, clip.creator_id]);

    if (balancesErr) {
      // The purchase has committed. Do not imply it failed or invite a retry charge.
      console.error('clip purchase balance lookup', balancesErr);
    }

    const buyerBalance = balances?.find((profile) => profile.id === user.id)?.balance_gbp;
    const creatorBalance = balances?.find((profile) => profile.id === clip.creator_id)?.balance_gbp;

    const buyerName =
      buyerProfile.display_name ||
      (buyerProfile.username ? `@${buyerProfile.username}` : 'Someone');
    const amount = Number(result.amount_gbp ?? clip.price_gbp ?? 0);
    const net = Number(result.net_gbp ?? 0);
    const notificationBody = result.free
      ? `${buyerName} unlocked your free clip “${clip.title}”`
      : `${buyerName} bought “${clip.title}” · £${amount.toFixed(2)} (you keep £${net.toFixed(2)})`;

    const { error: notificationErr } = await admin.from('notifications').insert({
      user_id: clip.creator_id,
      actor_id: user.id,
      type: result.free ? 'unlock' : 'unlock',
      title: result.free ? 'Clip unlocked' : 'Clip sold 💰',
      body: notificationBody,
      link: '/earnings',
    });

    if (notificationErr) {
      console.error('clip purchase notification', notificationErr);
    }

    return NextResponse.json({
      ok: true,
      already: false,
      amount,
      free: Boolean(result.free),
      fee_gbp: Number(result.fee_gbp ?? 0),
      net_gbp: Number(result.net_gbp ?? 0),
      balance: buyerBalance == null ? undefined : Number(buyerBalance),
      creator_balance: creatorBalance == null ? undefined : Number(creatorBalance),
    });
  } catch (error: unknown) {
    console.error('clip purchase', error);
    return NextResponse.json({ error: 'Purchase failed' }, { status: 500 });
  }
}
