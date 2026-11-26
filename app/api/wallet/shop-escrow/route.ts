import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type Action = 'hold' | 'accept' | 'release' | 'refund';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function authUser(request: Request, admin: ReturnType<typeof adminClient>) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return null;
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  return error ? null : user || null;
}

/**
 * Shop escrow state machine.
 * All wallet, pending-balance, ledger and order-state changes are committed
 * together by the database function.
 */
export async function POST(request: Request) {
  const admin = adminClient();

  try {
    const user = await authUser(request, admin);
    if (!user) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '') as Action;
    const orderId = String(body?.order_id || '');

    if (!orderId || !['hold', 'accept', 'release', 'refund'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Keep the existing buyer/seller block policy, but fail closed on lookup errors.
    if (action === 'hold') {
      const { data: order, error: orderErr } = await admin
        .from('shop_orders')
        .select('id,buyer_id,creator_id')
        .eq('id', orderId)
        .single();

      if (orderErr || !order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if (order.buyer_id !== user.id) {
        return NextResponse.json({ error: 'Not your order' }, { status: 403 });
      }

      const { data: blocked, error: blockErr } = await admin
        .from('blocks')
        .select('blocker_id')
        .or(
          `and(blocker_id.eq.${user.id},blocked_id.eq.${order.creator_id}),and(blocker_id.eq.${order.creator_id},blocked_id.eq.${user.id})`
        )
        .limit(1);

      if (blockErr) {
        console.error('shop escrow block check', blockErr);
        return NextResponse.json({ error: 'Could not validate this purchase' }, { status: 500 });
      }
      if (blocked?.length) {
        return NextResponse.json(
          { error: 'You can’t buy from this creator', code: 'BLOCKED' },
          { status: 403 }
        );
      }
    }

    const { data, error: actionErr } = await admin.rpc('process_shop_escrow_action', {
      p_actor_id: user.id,
      p_order_id: orderId,
      p_action: action,
    });

    if (actionErr) {
      const message = actionErr.message || 'Escrow action failed';
      if (message.includes('Insufficient wallet balance')) {
        // Preserve existing behavior: an unpaid draft request is removed.
        if (action === 'hold') {
          await admin
            .from('shop_orders')
            .delete()
            .eq('id', orderId)
            .eq('buyer_id', user.id)
            .eq('funds_status', 'none');
        }
        return NextResponse.json(
          { error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' },
          { status: 402 }
        );
      }
      if (message.includes('Pending creator balance requires reconciliation')) {
        return NextResponse.json(
          { error: 'Order funds require reconciliation', code: 'RECONCILIATION_REQUIRED' },
          { status: 409 }
        );
      }
      if (
        message.includes('Not your order') ||
        message.includes('Not your sale') ||
        message.includes('Not allowed')
      ) {
        return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
      }
      if (message.includes('Order not found')) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if (
        message.includes('current state') ||
        message.includes('No funds on hold') ||
        message.includes('Funds are not in pending state')
      ) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      console.error('process_shop_escrow_action RPC', actionErr);
      return NextResponse.json({ error: 'Escrow action failed' }, { status: 500 });
    }

    const result = (data || {}) as {
      ok?: boolean;
      already?: boolean;
      funds_status?: string;
      balance?: number;
      pending?: number;
      creator_balance?: number;
      buyer_balance?: number;
      amount?: number;
      fee_gbp?: number;
      net_gbp?: number;
    };

    return NextResponse.json({
      ok: true,
      already: Boolean(result.already),
      funds_status: result.funds_status,
      balance: result.balance == null ? undefined : Number(result.balance),
      pending: result.pending == null ? undefined : Number(result.pending),
      creator_balance: result.creator_balance == null ? undefined : Number(result.creator_balance),
      buyer_balance: result.buyer_balance == null ? undefined : Number(result.buyer_balance),
      amount: result.amount == null ? undefined : Number(result.amount),
      fee_gbp: result.fee_gbp == null ? undefined : Number(result.fee_gbp),
      net_gbp: result.net_gbp == null ? undefined : Number(result.net_gbp),
    });
  } catch (error: unknown) {
    console.error('shop-escrow', error);
    return NextResponse.json({ error: 'Escrow action failed' }, { status: 500 });
  }
}
