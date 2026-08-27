import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { splitCreatorEarn } from '../../../../lib/platform-fee';

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
    const giftId = String(body?.gift_id || body?.giftId || '').toLowerCase();

    if (!streamId) {
      return NextResponse.json({ error: 'stream_id required' }, { status: 400 });
    }

    const { data: stream, error: stErr } = await admin
      .from('live_streams')
      .select('*, tip_goals')
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
        { error: 'You cannot gift yourself' },
        { status: 400 }
      );
    }

    const { data: creator } = await admin
      .from('profiles')
      .select(
        'balance_gbp, display_name, username, live_gifts, live_gifts_enabled'
      )
      .eq('id', stream.creator_id)
      .single();

    if (!creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    if (creator.live_gifts_enabled === false) {
      return NextResponse.json(
        { error: 'This creator has gifts turned off' },
        { status: 400 }
      );
    }

    const catalog = normalizeGifts(creator.live_gifts);
    const gift = catalog.find((g) => g.id === giftId);
    if (!gift) {
      return NextResponse.json({ error: 'Invalid gift' }, { status: 400 });
    }

    const rounded = Math.round(gift.amount_gbp * 100) / 100;

    const { data: sender } = await admin
      .from('profiles')
      .select('balance_gbp, display_name, username, avatar_url')
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

    const { gross_gbp, fee_gbp, net_gbp } = splitCreatorEarn(rounded);
    const newSenderBal = Math.round((senderBal - gross_gbp) * 100) / 100;
    const newCreatorBal =
      Math.round((Number(creator.balance_gbp || 0) + net_gbp) * 100) / 100;
    const newRaised =
      Math.round((Number(stream.tip_raised_gbp || 0) + gross_gbp) * 100) / 100;

    const fromName = sender.display_name || sender.username || 'A fan';
    const giftLabel = `${gift.emoji} ${gift.label}`;

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
        type: 'gift_sent',
        amount_gbp: -gross_gbp,
        balance_after: newSenderBal,
        counterparty_id: stream.creator_id,
        reference_type: 'live_stream',
        reference_id: streamId,
        description: `Live gift · ${giftLabel} · ${stream.title || 'Live'}`,
      },
      {
        user_id: stream.creator_id,
        type: 'gift_received',
        amount_gbp: net_gbp,
        balance_after: newCreatorBal,
        gross_gbp,
        fee_gbp,
        net_gbp,
        counterparty_id: user.id,
        reference_type: 'live_stream',
        reference_id: streamId,
        description: `Live gift from ${fromName} · ${giftLabel}`,
      },
    ]);

    const { data: existingTip } = await admin
      .from('live_stream_tips')
      .select('total_gbp')
      .eq('stream_id', streamId)
      .eq('user_id', user.id)
      .maybeSingle();

    const userTotal =
      Math.round((Number(existingTip?.total_gbp || 0) + rounded) * 100) / 100;

    await admin.from('live_stream_tips').upsert(
      {
        stream_id: streamId,
        user_id: user.id,
        total_gbp: userTotal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'stream_id,user_id' }
    );

    const currentShowcase = Number(stream.showcase_amount_gbp || 0);
    let nextGoal = Number(stream.tip_goal_gbp || 0);
    const levels = Array.isArray((stream as any).tip_goals)
      ? ([...(stream as any).tip_goals] as { label: string; amount: number }[])
      : [];
    if (levels.length) {
      levels.sort((a, b) => Number(a.amount) - Number(b.amount));
      const active = levels.find((l) => newRaised < Number(l.amount));
      nextGoal = active
        ? Number(active.amount)
        : Number(levels[levels.length - 1].amount);
    }

    let showcasePayload: Record<string, any> = {
      tip_raised_gbp: newRaised,
      tip_goal_gbp: nextGoal,
      updated_at: new Date().toISOString(),
    };

    if (userTotal >= currentShowcase) {
      showcasePayload = {
        ...showcasePayload,
        showcase_user_id: user.id,
        showcase_amount_gbp: userTotal,
        showcase_name: fromName,
        showcase_avatar_url: sender.avatar_url || null,
      };
    }

    await admin.from('live_streams').update(showcasePayload).eq('id', streamId);

    try {
      await admin.from('notifications').insert({
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
    } catch {
      /* non-blocking */
    }

    const isShowcase =
      userTotal >= currentShowcase ||
      showcasePayload.showcase_user_id === user.id;

    return NextResponse.json({
      ok: true,
      amount: rounded,
      gift_id: gift.id,
      gift_label: gift.label,
      gift_emoji: gift.emoji,
      balance: newSenderBal,
      tip_raised_gbp: newRaised,
      tip_goal_gbp: nextGoal,
      tip_goals: levels.length ? levels : (stream as any).tip_goals || [],
      from_name: fromName,
      user_total: userTotal,
      is_showcase: isShowcase,
      showcase: {
        user_id: showcasePayload.showcase_user_id ?? stream.showcase_user_id,
        amount_gbp:
          showcasePayload.showcase_amount_gbp ??
          stream.showcase_amount_gbp ??
          0,
        name: showcasePayload.showcase_name ?? stream.showcase_name,
        avatar_url:
          showcasePayload.showcase_avatar_url ?? stream.showcase_avatar_url,
      },
    });
  } catch (e: any) {
    console.error('live gift', e);
    return NextResponse.json(
      { error: e?.message || 'Gift failed' },
      { status: 500 }
    );
  }
}
