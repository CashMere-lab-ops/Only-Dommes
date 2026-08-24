import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { splitCreatorEarn } from '../../../../lib/platform-fee';

export const dynamic = 'force-dynamic';

/**
 * Tip a creator during a live stream.
 * Debits tipper (full amount), credits creator (80% net after platform fee),
 * updates tip goal + highest tipper showcase using gross tip amounts.
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

    let tipNote = String(body?.message || body?.note || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50);
    if (/https?:\/\/|www\.|\.[a-z]{2,}\//i.test(tipNote)) {
      tipNote = '';
    }
    tipNote = tipNote.replace(/[\u0000-\u001F\u007F]/g, '');

    if (!streamId) {
      return NextResponse.json({ error: 'stream_id required' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid tip amount' }, { status: 400 });
    }
    if (amount > 5000) {
      return NextResponse.json({ error: 'Tip too large' }, { status: 400 });
    }

    const rounded = Math.round(amount * 100) / 100;
    const { gross_gbp, fee_gbp, net_gbp } = splitCreatorEarn(rounded);

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
        { error: 'You cannot tip yourself' },
        { status: 400 }
      );
    }

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

    const { data: creator } = await admin
      .from('profiles')
      .select('balance_gbp, display_name, username, min_tip_gbp')
      .eq('id', stream.creator_id)
      .single();

    if (!creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    const platformMin = 2;
    const creatorMin = Number(creator.min_tip_gbp);
    const minTip =
      Number.isFinite(creatorMin) && creatorMin > platformMin
        ? creatorMin
        : platformMin;

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

    const newSenderBal = Math.round((senderBal - rounded) * 100) / 100;
    const newCreatorBal =
      Math.round((Number(creator.balance_gbp || 0) + net_gbp) * 100) / 100;
    const newRaised =
      Math.round((Number(stream.tip_raised_gbp || 0) + rounded) * 100) / 100;

    const fromName = sender.display_name || sender.username || 'A fan';

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
        reference_id: streamId,
        description: tipNote
          ? `Live tip · ${stream.title || 'Live'} · “${tipNote}”`
          : `Live tip · ${stream.title || 'Live'}`,
        gross_gbp: gross_gbp,
        fee_gbp: 0,
        net_gbp: -rounded,
      },
      {
        user_id: stream.creator_id,
        type: 'tip_received',
        amount_gbp: net_gbp,
        balance_after: newCreatorBal,
        counterparty_id: user.id,
        reference_type: 'live_stream',
        reference_id: streamId,
        description: tipNote
          ? `Live tip from ${fromName} · “${tipNote}” · £${gross_gbp.toFixed(2)} (you +£${net_gbp.toFixed(2)})`
          : `Live tip from ${fromName} · £${gross_gbp.toFixed(2)} (you +£${net_gbp.toFixed(2)})`,
        gross_gbp: gross_gbp,
        fee_gbp: fee_gbp,
        net_gbp: net_gbp,
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
        title: 'Live tip',
        body: tipNote
          ? `${fromName} tipped £${rounded.toFixed(2)} · “${tipNote}” · +£${net_gbp.toFixed(2)} to you`
          : `${fromName} tipped £${rounded.toFixed(2)} · +£${net_gbp.toFixed(2)} to your wallet`,
        link: `/live/${streamId}`,
        meta: {
          amount: rounded,
          gross_gbp,
          fee_gbp,
          net_gbp,
          stream_id: streamId,
          from: user.id,
          message: tipNote || null,
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
      gross_gbp,
      fee_gbp,
      net_gbp,
      message: tipNote || null,
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
    console.error('live tip', e);
    return NextResponse.json(
      { error: e?.message || 'Tip failed' },
      { status: 500 }
    );
  }
}



