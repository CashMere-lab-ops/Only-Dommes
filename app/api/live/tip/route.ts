import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Tip a creator during a live stream.
 * Debits tipper wallet, credits creator, bumps tip_raised_gbp.
 */
export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
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
    const streamId = String(body?.stream_id || '');
    const amount = Number(body?.amount);

    if (!streamId) {
      return NextResponse.json({ error: 'stream_id required' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount < 1) {
      return NextResponse.json(
        { error: 'Minimum tip is £1' },
        { status: 400 }
      );
    }
    if (amount > 5000) {
      return NextResponse.json({ error: 'Tip too large' }, { status: 400 });
    }

    const rounded = Math.round(amount * 100) / 100;

    const { data: stream, error: stErr } = await admin
      .from('live_streams')
      .select('*')
      .eq('id', streamId)
      .single();

    if (stErr || !stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    if (!['active', 'idle_ready', 'disconnected'].includes(stream.status)) {
      return NextResponse.json(
        { error: 'This live has ended' },
        { status: 400 }
      );
    }

    if (stream.creator_id === user.id) {
      return NextResponse.json(
        { error: 'You cannot tip yourself' },
        { status: 400 }
      );
    }

    const { data: sender } = await admin
      .from('profiles')
      .select('balance_gbp, display_name, username')
      .eq('id', user.id)
      .single();

    if (!sender) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const senderBal = Number(sender.balance_gbp || 0);
    if (senderBal < rounded) {
      return NextResponse.json(
        {
          error: 'Insufficient balance',
          code: 'INSUFFICIENT_BALANCE',
          balance: senderBal,
          needed: rounded,
        },
        { status: 402 }
      );
    }

    const { data: creator } = await admin
      .from('profiles')
      .select('balance_gbp, display_name, username')
      .eq('id', stream.creator_id)
      .single();

    if (!creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    const newSenderBal = Math.round((senderBal - rounded) * 100) / 100;
    const newCreatorBal =
      Math.round((Number(creator.balance_gbp || 0) + rounded) * 100) / 100;
    const newRaised =
      Math.round((Number(stream.tip_raised_gbp || 0) + rounded) * 100) / 100;

    const tipRef = randomUUID();
    const fromName =
      sender.display_name || sender.username || 'A fan';

    await admin
      .from('profiles')
      .update({ balance_gbp: newSenderBal })
      .eq('id', user.id);

    await admin
      .from('profiles')
      .update({ balance_gbp: newCreatorBal })
      .eq('id', stream.creator_id);

    await admin.from('wallet_transactions').insert([
      {
        user_id: user.id,
        type: 'tip_sent',
        amount_gbp: -rounded,
        balance_after: newSenderBal,
        counterparty_id: stream.creator_id,
        reference_type: 'live_stream',
        reference_id: tipRef,
        description: `Live tip · ${stream.title || 'Live'}`,
      },
      {
        user_id: stream.creator_id,
        type: 'tip_received',
        amount_gbp: rounded,
        balance_after: newCreatorBal,
        counterparty_id: user.id,
        reference_type: 'live_stream',
        reference_id: tipRef,
        description: `Live tip from ${fromName}`,
      },
    ]);

    await admin
      .from('live_streams')
      .update({
        tip_raised_gbp: newRaised,
        updated_at: new Date().toISOString(),
      })
      .eq('id', streamId);

    // Optional notification for creator
    try {
      await admin.from('notifications').insert({
        user_id: stream.creator_id,
        type: 'tip',
        title: 'Live tip',
        body: `${fromName} tipped £${rounded.toFixed(2)} on your live`,
        link: `/live/${streamId}`,
        meta: { amount: rounded, stream_id: streamId, from: user.id },
      });
    } catch {
      /* notifications table may differ — non-blocking */
    }

    return NextResponse.json({
      ok: true,
      amount: rounded,
      balance: newSenderBal,
      tip_raised_gbp: newRaised,
      tip_goal_gbp: Number(stream.tip_goal_gbp || 0),
      from_name: fromName,
    });
  } catch (e: any) {
    console.error('live tip', e);
    return NextResponse.json(
      { error: e?.message || 'Tip failed' },
      { status: 500 }
    );
  }
}
