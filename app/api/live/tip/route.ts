import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

type LivePaymentResult = {
  ok?: boolean;
  already?: boolean;
  gross_gbp?: number;
  fee_gbp?: number;
  net_gbp?: number;
  sender_balance?: number;
  tip_raised_gbp?: number;
  tip_goal_gbp?: number;
  tip_goals?: Array<{ label?: string; amount?: number }>;
  from_name?: string;
  user_total?: number;
  is_showcase?: boolean;
  showcase?: {
    user_id?: string | null;
    amount_gbp?: number;
    name?: string | null;
    avatar_url?: string | null;
  };
};

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
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

    let tipNote = String(body?.message || body?.note || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50);
    if (/https?:|www[.]|[.][a-z]{2,}/i.test(tipNote)) {
      tipNote = '';
    }
    tipNote = tipNote.replace(/[\\u0000-\\u001F\\u007F]/g, '');

    if (!streamId) {
      return NextResponse.json({ error: 'stream_id required' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) {
      return NextResponse.json({ error: 'Invalid tip amount' }, { status: 400 });
    }

    const grossPence = Math.round(amount * 100);
    if (grossPence <= 0) {
      return NextResponse.json({ error: 'Invalid tip amount' }, { status: 400 });
    }
    const rounded = grossPence / 100;

    const { data: stream, error: streamErr } = await admin
      .from('live_streams')
      .select('id, creator_id, title, status')
      .eq('id', streamId)
      .single();

    if (streamErr || !stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    if (!['active', 'idle_ready', 'disconnected'].includes(stream.status)) {
      return NextResponse.json({ error: 'This live has ended' }, { status: 400 });
    }
    if (stream.creator_id === user.id) {
      return NextResponse.json({ error: 'You cannot tip yourself' }, { status: 400 });
    }

    const { data: blocked, error: blockErr } = await admin
      .from('blocks')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${stream.creator_id}),and(blocker_id.eq.${stream.creator_id},blocked_id.eq.${user.id})`
      )
      .limit(1);

    if (blockErr) {
      console.error('live tip block check', blockErr);
      return NextResponse.json({ error: 'Could not validate this tip' }, { status: 500 });
    }
    if (blocked?.length) {
      return NextResponse.json(
        { error: 'You can’t tip this creator', code: 'BLOCKED' },
        { status: 403 }
      );
    }

    const { data: creator, error: creatorErr } = await admin
      .from('profiles')
      .select('min_tip_gbp')
      .eq('id', stream.creator_id)
      .single();

    if (creatorErr || !creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    const configuredMin = Number(creator.min_tip_gbp);
    const minTip = Number.isFinite(configuredMin) && configuredMin > 2 ? configuredMin : 2;
    if (rounded < minTip) {
      return NextResponse.json(
        {
          error: `Minimum tip is £${minTip.toFixed(2)}`,
          code: 'TIP_TOO_LOW',
          min_tip_gbp: minTip,
        },
        { status: 400 }
      );
    }

    const suppliedKey = String(
      body?.idempotency_key || request.headers.get('idempotency-key') || ''
    ).trim();
    if (suppliedKey.length > 128) {
      return NextResponse.json({ error: 'Invalid idempotency key' }, { status: 400 });
    }
    const idempotencyKey = `live-tip:${user.id}:${streamId}:${suppliedKey || randomUUID()}`;

    const description = tipNote
      ? `Live tip · ${stream.title || 'Live'} · “${tipNote}”`
      : `Live tip · ${stream.title || 'Live'}`;

    const { data, error: transferErr } = await admin.rpc('post_live_creator_payment', {
      p_sender_id: user.id,
      p_stream_id: streamId,
      p_gross_pence: grossPence,
      p_sent_type: 'tip_sent',
      p_received_type: 'tip_received',
      p_idempotency_key: idempotencyKey,
      p_description: description,
    });

    if (transferErr) {
      const message = transferErr.message || 'Tip failed';
      if (message.includes('Insufficient wallet balance')) {
        return NextResponse.json(
          { error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE', needed: rounded },
          { status: 402 }
        );
      }
      if (message.includes('This live has ended')) {
        return NextResponse.json({ error: 'This live has ended' }, { status: 400 });
      }
      if (message.includes('Incomplete prior transfer')) {
        return NextResponse.json(
          { error: 'Tip requires reconciliation', code: 'RECONCILIATION_REQUIRED' },
          { status: 409 }
        );
      }
      console.error('post_live_creator_payment (tip)', transferErr);
      return NextResponse.json({ error: 'Tip failed' }, { status: 500 });
    }

    const result = (data || {}) as LivePaymentResult;
    const fromName = result.from_name || 'A fan';

    if (!result.already) {
      const { error: notificationErr } = await admin.from('notifications').insert({
        user_id: stream.creator_id,
        type: 'tip',
        title: 'Live tip',
        body: tipNote
          ? `${fromName} tipped £${rounded.toFixed(2)} · “${tipNote}”`
          : `${fromName} tipped £${rounded.toFixed(2)} on your live`,
        link: `/live/${streamId}`,
        meta: {
          amount: rounded,
          stream_id: streamId,
          from: user.id,
          message: tipNote || null,
        },
      });
      if (notificationErr) console.error('live tip notification', notificationErr);
    }

    return NextResponse.json({
      ok: true,
      already: Boolean(result.already),
      amount: Number(result.gross_gbp ?? rounded),
      fee_gbp: Number(result.fee_gbp ?? 0),
      net_gbp: Number(result.net_gbp ?? 0),
      message: tipNote || null,
      balance: result.sender_balance == null ? undefined : Number(result.sender_balance),
      tip_raised_gbp: Number(result.tip_raised_gbp ?? 0),
      tip_goal_gbp: Number(result.tip_goal_gbp ?? 0),
      tip_goals: Array.isArray(result.tip_goals) ? result.tip_goals : [],
      from_name: fromName,
      user_total: Number(result.user_total ?? 0),
      is_showcase: Boolean(result.is_showcase),
      showcase: result.showcase || null,
    });
  } catch (error: unknown) {
    console.error('live tip', error);
    return NextResponse.json({ error: 'Tip failed' }, { status: 500 });
  }
}
