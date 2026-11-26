import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const MIN_PAYOUT = 100;
const FEE_PERCENT = 0;

function nextMondayDate(from = new Date()): string {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const add = day === 1 ? 7 : (8 - day) % 7 || 7;
  date.setDate(date.getDate() + add);
  return date.toISOString().slice(0, 10);
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getUser(request: Request, admin: ReturnType<typeof adminClient>) {
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

/** GET: list own payout requests. POST: reserve funds and request next Monday payout. */
export async function GET(request: Request) {
  try {
    const admin = adminClient();
    const user = await getUser(request, admin);
    if (!user) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const { data, error } = await admin
      .from('payout_requests')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: 'Could not load payout history' }, { status: 500 });
    }

    return NextResponse.json({
      requests: data || [],
      min_payout: MIN_PAYOUT,
      fee_percent: FEE_PERCENT,
    });
  } catch (error: unknown) {
    console.error('payout history', error);
    return NextResponse.json({ error: 'Could not load payout history' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = adminClient();
    const user = await getUser(request, admin);
    if (!user) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    let amountPence: number | null = null;

    if (body?.amount != null && body.amount !== '') {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
        return NextResponse.json({ error: 'Enter a valid amount with up to 2 decimal places' }, { status: 400 });
      }
      amountPence = Math.round(amount * 100);
      if (amountPence < MIN_PAYOUT * 100) {
        return NextResponse.json(
          { error: `Minimum payout is £${MIN_PAYOUT}`, code: 'BELOW_MINIMUM', min: MIN_PAYOUT },
          { status: 400 }
        );
      }
    }

    const scheduledFor = nextMondayDate();
    const { data, error: payoutErr } = await admin.rpc('reserve_creator_payout', {
      p_creator_id: user.id,
      p_amount_pence: amountPence,
      p_scheduled_for: scheduledFor,
    });

    if (payoutErr) {
      const message = payoutErr.message || 'Could not request payout';
      if (message.includes('Minimum payout')) {
        return NextResponse.json(
          { error: `Minimum payout is £${MIN_PAYOUT}`, code: 'BELOW_MINIMUM', min: MIN_PAYOUT },
          { status: 400 }
        );
      }
      if (message.includes('Payout already in progress')) {
        return NextResponse.json(
          { error: 'You already have a payout in progress. Wait until it completes.', code: 'PENDING_EXISTS' },
          { status: 409 }
        );
      }
      if (message.includes('exceeds available balance')) {
        return NextResponse.json(
          { error: 'Amount exceeds available balance', code: 'INSUFFICIENT' },
          { status: 400 }
        );
      }
      if (message.includes('Creator profile not found')) {
        return NextResponse.json({ error: 'Creator account required' }, { status: 403 });
      }
      console.error('reserve_creator_payout RPC', payoutErr);
      return NextResponse.json({ error: 'Could not request payout' }, { status: 500 });
    }

    const result = (data || {}) as {
      payout?: Record<string, unknown>;
      balance?: number;
      amount?: number;
      fee_gbp?: number;
      net_gbp?: number;
      scheduled_for?: string;
    };

    const amount = Number(result.amount ?? result.payout?.amount_gbp ?? 0);
    const net = Number(result.net_gbp ?? result.payout?.net_gbp ?? amount);

    return NextResponse.json({
      ok: true,
      payout: result.payout,
      balance: Number(result.balance ?? 0),
      fee_percent: FEE_PERCENT,
      message: `Payout of £${net.toFixed(2)} reserved for ${result.scheduled_for || scheduledFor}. No additional payout fee is charged.`,
    });
  } catch (error: unknown) {
    console.error('payout request', error);
    return NextResponse.json({ error: 'Payout request failed' }, { status: 500 });
  }
}
