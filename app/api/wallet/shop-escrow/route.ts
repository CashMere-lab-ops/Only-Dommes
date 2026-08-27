import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { splitCreatorEarn } from '../../../../lib/platform-fee';

export const dynamic = 'force-dynamic';

type Action = 'hold' | 'accept' | 'release' | 'refund';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function authUser(request: Request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const admin = adminClient();
  const {
    data: { user },
  } = await admin.auth.getUser(token);
  return user || null;
}

/**
 * Shop escrow
 * hold    — buyer: debit balance, funds held on order (on request)
 * accept  — seller: move hold → creator pending_gbp
 * release — buyer confirms received: pending_gbp → creator balance_gbp
 * refund  — seller declines / cancel while held: return money to buyer
 */
export async function POST(request: Request) {
  try {
    const user = await authUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '') as Action;
    const orderId = String(body.order_id || '');

    if (!orderId || !['hold', 'accept', 'release', 'refund'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const admin = adminClient();
    const { data: order, error: oErr } = await admin
      .from('shop_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (oErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const amount = Math.round(Number(order.item_price || order.amount_held || 0) * 100) / 100;
    if (amount <= 0) {
      return NextResponse.json({ error: 'Invalid order amount' }, { status: 400 });
    }

    // ── HOLD (buyer on request) ──
    if (action === 'hold') {
      if (order.buyer_id !== user.id) {
        return NextResponse.json({ error: 'Not your order' }, { status: 403 });
      }
      if (order.funds_status === 'held' || order.funds_status === 'pending_creator' || order.funds_status === 'released') {
        return NextResponse.json({ ok: true, already: true, funds_status: order.funds_status });
      }

      const { data: buyer } = await admin
        .from('profiles')
        .select('balance_gbp')
        .eq('id', user.id)
        .single();

      const bal = Number(buyer?.balance_gbp || 0);
      if (bal < amount) {
        // Remove the draft order so creator never sees unpaid requests
        await admin.from('shop_orders').delete().eq('id', orderId);
        return NextResponse.json(
          {
            error: 'Insufficient balance',
            code: 'INSUFFICIENT_BALANCE',
            balance: bal,
            needed: amount,
          },
          { status: 402 }
        );
      }

      const next = Math.round((bal - amount) * 100) / 100;
      const { error: debitErr } = await admin
        .from('profiles')
        .update({ balance_gbp: next })
        .eq('id', user.id)
        .gte('balance_gbp', amount);

      if (debitErr) {
        return NextResponse.json({ error: debitErr.message }, { status: 500 });
      }

      await admin.from('wallet_transactions').insert({
        user_id: user.id,
        type: 'shop_hold',
        amount_gbp: -amount,
        balance_after: next,
        counterparty_id: order.creator_id,
        reference_type: 'shop_order',
        reference_id: orderId,
        description: `Hold for shop order: ${order.item_title || 'item'}`,
      });

      await admin
        .from('shop_orders')
        .update({
          funds_status: 'held',
          amount_held: amount,
          status: order.status === 'requested' ? 'requested' : order.status,
        })
        .eq('id', orderId);

      return NextResponse.json({
        ok: true,
        funds_status: 'held',
        balance: next,
        amount,
      });
    }

    // ── ACCEPT (seller) → creator pending ──
    if (action === 'accept') {
      if (order.creator_id !== user.id) {
        return NextResponse.json({ error: 'Not your sale' }, { status: 403 });
      }
      if (order.funds_status === 'pending_creator' || order.funds_status === 'released') {
        return NextResponse.json({ ok: true, already: true, funds_status: order.funds_status });
      }
      if (order.funds_status !== 'held') {
        return NextResponse.json(
          { error: 'No funds on hold for this order' },
          { status: 400 }
        );
      }

      const { data: creator } = await admin
        .from('profiles')
        .select('pending_gbp, balance_gbp')
        .eq('id', user.id)
        .single();

      const pending = Number(creator?.pending_gbp || 0);
      const pendingNext = Math.round((pending + amount) * 100) / 100;

      await admin
        .from('profiles')
        .update({ pending_gbp: pendingNext })
        .eq('id', user.id);

      await admin.from('wallet_transactions').insert({
        user_id: user.id,
        type: 'shop_pending',
        amount_gbp: amount,
        balance_after: Number(creator?.balance_gbp || 0),
        counterparty_id: order.buyer_id,
        reference_type: 'shop_order',
        reference_id: orderId,
        description: `Pending shop sale: ${order.item_title || 'item'} (awaiting delivery)`,
      });

      await admin
        .from('shop_orders')
        .update({
          funds_status: 'pending_creator',
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (order.item_id) {
        await admin
          .from('shop_items')
          .update({
            status: 'sold',
            reserved_for_id: null,
            reserved_for_username: null,
          })
          .eq('id', order.item_id);
      }

      return NextResponse.json({
        ok: true,
        funds_status: 'pending_creator',
        pending: pendingNext,
        amount,
      });
    }

    // ── RELEASE (buyer confirms received) → creator available balance ──
    if (action === 'release') {
      if (order.buyer_id !== user.id) {
        return NextResponse.json({ error: 'Not your order' }, { status: 403 });
      }
      if (order.funds_status === 'released') {
        return NextResponse.json({ ok: true, already: true });
      }
      if (order.funds_status !== 'pending_creator') {
        return NextResponse.json(
          { error: 'Funds are not in pending state' },
          { status: 400 }
        );
      }

      const { data: creator } = await admin
        .from('profiles')
        .select('pending_gbp, balance_gbp')
        .eq('id', order.creator_id)
        .single();

      const pending = Number(creator?.pending_gbp || 0);
      const bal = Number(creator?.balance_gbp || 0);
      const { net_gbp, fee_gbp, gross_gbp } = splitCreatorEarn(amount);
      const pendingNext = Math.max(0, Math.round((pending - amount) * 100) / 100);
      const balNext = Math.round((bal + net_gbp) * 100) / 100;

      await admin
        .from('profiles')
        .update({ pending_gbp: pendingNext, balance_gbp: balNext })
        .eq('id', order.creator_id);

      await admin.from('wallet_transactions').insert({
        user_id: order.creator_id,
        type: 'shop_received',
        amount_gbp: net_gbp,
        balance_after: balNext,
        counterparty_id: order.buyer_id,
        reference_type: 'shop_order',
        reference_id: orderId,
        description: `Released shop sale: ${order.item_title || 'item'} · kept £${net_gbp.toFixed(2)} after 20% fee`,
        gross_gbp,
        fee_gbp,
        net_gbp,
      });

      await admin
        .from('shop_orders')
        .update({
          funds_status: 'released',
          status: 'completed',
        })
        .eq('id', orderId);

      return NextResponse.json({
        ok: true,
        funds_status: 'released',
        creator_balance: balNext,
        amount,
      });
    }

    // ── REFUND (decline / cancel while held) ──
    if (action === 'refund') {
      const isSeller = order.creator_id === user.id;
      const isBuyer = order.buyer_id === user.id;
      if (!isSeller && !isBuyer) {
        return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
      }

      if (order.funds_status === 'refunded' || order.funds_status === 'none') {
        return NextResponse.json({ ok: true, already: true });
      }

      // Only refund from held (before accept). After accept, handle separately if needed.
      if (order.funds_status === 'held') {
        const { data: buyer } = await admin
          .from('profiles')
          .select('balance_gbp')
          .eq('id', order.buyer_id)
          .single();

        const bal = Number(buyer?.balance_gbp || 0);
        const next = Math.round((bal + amount) * 100) / 100;

        await admin
          .from('profiles')
          .update({ balance_gbp: next })
          .eq('id', order.buyer_id);

        await admin.from('wallet_transactions').insert({
          user_id: order.buyer_id,
          type: 'shop_refund',
          amount_gbp: amount,
          balance_after: next,
          counterparty_id: order.creator_id,
          reference_type: 'shop_order',
          reference_id: orderId,
          description: `Refund shop hold: ${order.item_title || 'item'}`,
        });

        await admin
          .from('shop_orders')
          .update({
            funds_status: 'refunded',
            status: 'cancelled',
          })
          .eq('id', orderId);

        if (order.item_id) {
          await admin
            .from('shop_items')
            .update({
              status: 'available',
              reserved_for_id: null,
              reserved_for_username: null,
            })
            .eq('id', order.item_id);
        }

        return NextResponse.json({
          ok: true,
          funds_status: 'refunded',
          buyer_balance: next,
          amount,
        });
      }

      // Decline after accept: money was in creator pending → refund buyer, clear pending
      if (order.funds_status === 'pending_creator' && isSeller) {
        const { data: creator } = await admin
          .from('profiles')
          .select('pending_gbp')
          .eq('id', order.creator_id)
          .single();
        const { data: buyer } = await admin
          .from('profiles')
          .select('balance_gbp')
          .eq('id', order.buyer_id)
          .single();

        const pending = Number(creator?.pending_gbp || 0);
        const buyerBal = Number(buyer?.balance_gbp || 0);
        const pendingNext = Math.max(0, Math.round((pending - amount) * 100) / 100);
        const buyerNext = Math.round((buyerBal + amount) * 100) / 100;

        await admin
          .from('profiles')
          .update({ pending_gbp: pendingNext })
          .eq('id', order.creator_id);
        await admin
          .from('profiles')
          .update({ balance_gbp: buyerNext })
          .eq('id', order.buyer_id);

        await admin.from('wallet_transactions').insert([
          {
            user_id: order.creator_id,
            type: 'shop_pending_reverse',
            amount_gbp: -amount,
            reference_type: 'shop_order',
            reference_id: orderId,
            description: `Pending reversed: ${order.item_title || 'item'}`,
          },
          {
            user_id: order.buyer_id,
            type: 'shop_refund',
            amount_gbp: amount,
            balance_after: buyerNext,
            reference_type: 'shop_order',
            reference_id: orderId,
            description: `Refund after cancel: ${order.item_title || 'item'}`,
          },
        ]);

        await admin
          .from('shop_orders')
          .update({ funds_status: 'refunded', status: 'cancelled' })
          .eq('id', orderId);

        if (order.item_id) {
          await admin
            .from('shop_items')
            .update({
              status: 'available',
              reserved_for_id: null,
              reserved_for_username: null,
            })
            .eq('id', order.item_id);
        }

        return NextResponse.json({
          ok: true,
          funds_status: 'refunded',
          buyer_balance: buyerNext,
          amount,
        });
      }

      return NextResponse.json(
        { error: 'Cannot refund in current state' },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    console.error('shop-escrow', e);
    return NextResponse.json(
      { error: e?.message || 'Escrow failed' },
      { status: 500 }
    );
  }
}
