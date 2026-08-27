import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const MIN_PAYOUT = 100;
/** Fee already taken on each earn. Payout sends the full available amount. */
const FEE_PERCENT = 0;

function nextMondayDate(from = new Date()): string {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const add = day === 1 ? 7 : (8 - day) % 7 || 7;
  // If today is Monday before payout window, still schedule next Monday for simplicity
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST — request a payout (creator only)
 * Body: { amount?: number }  // defaults to full available balance
 *
 * GET — list own payout requests
 */
export async function GET(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const admin = adminClient();
    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { data, error } = await admin
      .from('payout_requests')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      requests: data || [],
      min_payout: MIN_PAYOUT,
      fee_percent: FEE_PERCENT,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const admin = adminClient();
    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedRaw = body.amount;

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id, account_type, balance_gbp, display_name, username')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.account_type !== 'creator') {
      return NextResponse.json(
        { error: 'Only creators can request payouts' },
        { status: 403 }
      );
    }

    const balance = Math.round(Number(profile.balance_gbp || 0) * 100) / 100;

    if (balance < MIN_PAYOUT) {
      return NextResponse.json(
        {
          error: `Minimum payout is £${MIN_PAYOUT}. Your balance is £${balance.toFixed(2)}.`,
          code: 'BELOW_MINIMUM',
          balance,
          min: MIN_PAYOUT,
        },
        { status: 400 }
      );
    }

    // Optional: block if there is already a pending request
    const { data: pending } = await admin
      .from('payout_requests')
      .select('id')
      .eq('creator_id', user.id)
      .in('status', ['pending', 'processing'])
      .limit(1);

    if (pending && pending.length > 0) {
      return NextResponse.json(
        {
          error:
            'You already have a payout in progress. Wait until it completes.',
          code: 'PENDING_EXISTS',
        },
        { status: 400 }
      );
    }

    let amount =
      requestedRaw != null && requestedRaw !== ''
        ? Math.round(Number(requestedRaw) * 100) / 100
        : balance;

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (amount < MIN_PAYOUT) {
      return NextResponse.json(
        {
          error: `Minimum payout is £${MIN_PAYOUT}`,
          code: 'BELOW_MINIMUM',
          min: MIN_PAYOUT,
        },
        { status: 400 }
      );
    }

    if (amount > balance) {
      return NextResponse.json(
        {
          error: `Amount exceeds balance (£${balance.toFixed(2)})`,
          code: 'INSUFFICIENT',
          balance,
        },
        { status: 400 }
      );
    }

    const fee =
      Math.round(((amount * FEE_PERCENT) / 100) * 100) / 100;
    const net = Math.round((amount - fee) * 100) / 100;
    const scheduledFor = nextMondayDate();

    // Debit full gross amount from wallet
    const { data: afterDebit, error: debitErr } = await admin
      .from('profiles')
      .update({ balance_gbp: Math.round((balance - amount) * 100) / 100 })
      .eq('id', user.id)
      .gte('balance_gbp', amount)
      .select('balance_gbp')
      .maybeSingle();

    if (debitErr || !afterDebit) {
      return NextResponse.json(
        {
          error: 'Could not reserve funds. Balance may have changed — try again.',
          code: 'DEBIT_FAILED',
        },
        { status: 409 }
      );
    }

    const newBalance = Number(afterDebit.balance_gbp);

    const { data: payout, error: payoutErr } = await admin
      .from('payout_requests')
      .insert({
        creator_id: user.id,
        amount_gbp: amount,
        fee_gbp: fee,
        net_gbp: net,
        status: 'pending',
        scheduled_for: scheduledFor,
        notes: 'Requested via dashboard',
      })
      .select('*')
      .single();

    if (payoutErr || !payout) {
      // rollback balance
      await admin
        .from('profiles')
        .update({ balance_gbp: balance })
        .eq('id', user.id);
      return NextResponse.json(
        { error: payoutErr?.message || 'Could not create payout request' },
        { status: 500 }
      );
    }

    await admin.from('wallet_transactions').insert({
      user_id: user.id,
      amount_gbp: -amount,
      type: 'payout_requested',
      balance_after: newBalance,
      reference_type: 'payout_request',
      reference_id: payout.id,
      description: `Payout request · £${amount.toFixed(2)} · scheduled ${scheduledFor}`,
    });

    return NextResponse.json({
      ok: true,
      payout,
      balance: newBalance,
      fee_percent: FEE_PERCENT,
      message: `Payout of £${net.toFixed(2)} scheduled for ${scheduledFor} (after ${FEE_PERCENT}% fee).`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Payout failed' },
      { status: 500 }
    );
  }
}
