import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

/** Platform default gifts when creator has not customised */
export const DEFAULT_GIFTS = [
  { id: 'rose', label: 'Rose', emoji: '🌹', amount_gbp: 5 },
  { id: 'kiss', label: 'Kiss', emoji: '💋', amount_gbp: 10 },
  { id: 'crown', label: 'Crown', emoji: '👑', amount_gbp: 20 },
  { id: 'champagne', label: 'Champagne', emoji: '🥂', amount_gbp: 50 },
  { id: 'diamond', label: 'Diamond', emoji: '💎', amount_gbp: 100 },
] as const;

export type LiveGift = {
  id: string;
  label: string;
  emoji: string;
  amount_gbp: number;
};

export function normalizeGifts(raw: unknown): LiveGift[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_GIFTS.map((g) => ({ ...g }));
  }
  const out: LiveGift[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const id = String((item as any).id || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 24);
    if (!id) continue;
    let label = String((item as any).label || id)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24);
    if (!label) label = id;
    const emoji = String((item as any).emoji || '🎁').slice(0, 8) || '🎁';
    let amount = Number((item as any).amount_gbp);
    if (!Number.isFinite(amount) || amount < 1) continue;
    if (amount > 500) amount = 500;
    amount = Math.round(amount * 100) / 100;
    out.push({ id, label, emoji, amount_gbp: amount });
  }
  return out.length ? out : DEFAULT_GIFTS.map((g) => ({ ...g }));
}

/**
 * Send a fixed-price gift during a live stream.
 * Uses creator's custom list when set; otherwise platform defaults.
 */
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

/**
 * Send a fixed-price gift during a live stream.
 * Wallet transfer and live leaderboard totals are committed atomically.
 */
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
    const giftId = String(body?.gift_id || body?.giftId || '').toLowerCase();

    if (!streamId) {
      return NextResponse.json({ error: 'stream_id required' }, { status: 400 });
    }

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
      return NextResponse.json({ error: 'You cannot gift yourself' }, { status: 400 });
    }

    const { data: blocked, error: blockErr } = await admin
      .from('blocks')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${stream.creator_id}),and(blocker_id.eq.${stream.creator_id},blocked_id.eq.${user.id})`
      )
      .limit(1);

    if (blockErr) {
      console.error('live gift block check', blockErr);
      return NextResponse.json({ error: 'Could not validate this gift' }, { status: 500 });
    }
    if (blocked?.length) {
      return NextResponse.json(
        { error: 'You can’t gift this creator', code: 'BLOCKED' },
        { status: 403 }
      );
    }

    const { data: creator, error: creatorErr } = await admin
      .from('profiles')
      .select('live_gifts, live_gifts_enabled')
      .eq('id', stream.creator_id)
      .single();

    if (creatorErr || !creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }
    if (creator.live_gifts_enabled === false) {
      return NextResponse.json({ error: 'This creator has gifts turned off' }, { status: 400 });
    }

    const gift = normalizeGifts(creator.live_gifts).find((item) => item.id === giftId);
    if (!gift) {
      return NextResponse.json({ error: 'Invalid gift' }, { status: 400 });
    }

    const grossPence = Math.round(gift.amount_gbp * 100);
    if (grossPence <= 0 || grossPence > 500000) {
      return NextResponse.json({ error: 'Invalid gift amount' }, { status: 400 });
    }
    const rounded = grossPence / 100;
    const giftLabel = `${gift.emoji} ${gift.label}`;

    const suppliedKey = String(
      body?.idempotency_key || request.headers.get('idempotency-key') || ''
    ).trim();
    if (suppliedKey.length > 128) {
      return NextResponse.json({ error: 'Invalid idempotency key' }, { status: 400 });
    }
    const idempotencyKey = `live-gift:${user.id}:${streamId}:${suppliedKey || randomUUID()}`;

    const description = `Live gift · ${giftLabel} · ${stream.title || 'Live'}`;

    const { data, error: transferErr } = await admin.rpc('post_live_creator_payment', {
      p_sender_id: user.id,
      p_stream_id: streamId,
      p_gross_pence: grossPence,
      p_sent_type: 'gift_sent',
      p_received_type: 'gift_received',
      p_idempotency_key: idempotencyKey,
      p_description: description,
    });

    if (transferErr) {
      const message = transferErr.message || 'Gift failed';
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
          { error: 'Gift requires reconciliation', code: 'RECONCILIATION_REQUIRED' },
          { status: 409 }
        );
      }
      console.error('post_live_creator_payment (gift)', transferErr);
      return NextResponse.json({ error: 'Gift failed' }, { status: 500 });
    }

    const result = (data || {}) as LivePaymentResult;
    const fromName = result.from_name || 'A fan';

    if (!result.already) {
      const { error: notificationErr } = await admin.from('notifications').insert({
        user_id: stream.creator_id,
        type: 'tip',
        title: 'Live gift',
        body: `${fromName} sent ${giftLabel} (£${rounded.toFixed(2)})`,
        link: `/live/${streamId}`,
        meta: {
          amount: rounded,
          stream_id: streamId,
          from: user.id,
          gift_id: gift.id,
          gift_label: giftLabel,
        },
      });
      if (notificationErr) console.error('live gift notification', notificationErr);
    }

    return NextResponse.json({
      ok: true,
      already: Boolean(result.already),
      amount: Number(result.gross_gbp ?? rounded),
      fee_gbp: Number(result.fee_gbp ?? 0),
      net_gbp: Number(result.net_gbp ?? 0),
      gift_id: gift.id,
      gift_label: gift.label,
      gift_emoji: gift.emoji,
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
    console.error('live gift', error);
    return NextResponse.json({ error: 'Gift failed' }, { status: 500 });
  }
}
