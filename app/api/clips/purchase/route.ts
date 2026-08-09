import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Buy a clip from wallet:
 * 1. Debit buyer, credit creator (clip_sent / clip_received)
 * 2. Insert clip_purchases
 * 3. Increment sales_count
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
      return NextResponse.json(
        { error: 'You already own this clip' },
        { status: 400 }
      );
    }

    // Already purchased?
    const { data: existing } = await admin
      .from('clip_purchases')
      .select('id')
      .eq('clip_id', clipId)
      .eq('buyer_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        ok: true,
        already: true,
        message: 'Already purchased',
      });
    }

    const price = Math.round(Number(clip.price_gbp || 0) * 100) / 100;
    if (price < 0) {
      return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
    }

    // Free clip
    if (price === 0) {
      await admin.from('clip_purchases').insert({
        clip_id: clipId,
        buyer_id: user.id,
        creator_id: clip.creator_id,
        amount_gbp: 0,
      });
      await admin
        .from('clips')
        .update({ sales_count: (clip as any).sales_count + 1 })
        .eq('id', clipId);
      return NextResponse.json({ ok: true, amount: 0, free: true });
    }

    const { data: sender } = await admin
      .from('profiles')
      .select('balance_gbp, display_name, username')
      .eq('id', user.id)
      .single();

    if (!sender) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const bal = Number(sender.balance_gbp || 0);
    if (bal < price) {
      return NextResponse.json(
        {
          error: 'Insufficient balance',
          balance: bal,
          needed: price,
          code: 'INSUFFICIENT_BALANCE',
        },
        { status: 402 }
      );
    }

    const { data: recipient } = await admin
      .from('profiles')
      .select('balance_gbp')
      .eq('id', clip.creator_id)
      .single();

    if (!recipient) {
      return NextResponse.json(
        { error: 'Creator not found' },
        { status: 404 }
      );
    }

    const newSenderBal = Math.round((bal - price) * 100) / 100;
    const newRecipientBal =
      Math.round((Number(recipient.balance_gbp || 0) + price) * 100) / 100;

    await admin
      .from('profiles')
      .update({ balance_gbp: newSenderBal })
      .eq('id', user.id);
    await admin
      .from('profiles')
      .update({ balance_gbp: newRecipientBal })
      .eq('id', clip.creator_id);

    const desc = `Clip: ${clip.title}`;
    await admin.from('wallet_transactions').insert([
      {
        user_id: user.id,
        type: 'clip_sent',
        amount_gbp: -price,
        balance_after: newSenderBal,
        counterparty_id: clip.creator_id,
        reference_type: 'clip',
        reference_id: clipId,
        description: desc,
      },
      {
        user_id: clip.creator_id,
        type: 'clip_received',
        amount_gbp: price,
        balance_after: newRecipientBal,
        counterparty_id: user.id,
        reference_type: 'clip',
        reference_id: clipId,
        description: desc,
      },
    ]);

    await admin.from('clip_purchases').insert({
      clip_id: clipId,
      buyer_id: user.id,
      creator_id: clip.creator_id,
      amount_gbp: price,
    });

    // Increment sales (best-effort)
    const { data: fullClip } = await admin
      .from('clips')
      .select('sales_count')
      .eq('id', clipId)
      .single();
    await admin
      .from('clips')
      .update({
        sales_count: Number(fullClip?.sales_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clipId);

    // Notification to creator
    try {
      await admin.from('notifications').insert({
        user_id: clip.creator_id,
        type: 'clip_purchase',
        title: 'Clip sold',
        body: `${sender.display_name || sender.username || 'Someone'} bought “${clip.title}” · £${price.toFixed(2)}`,
        link: '/earnings',
        from_user_id: user.id,
      });
    } catch {
      /* optional */
    }

    return NextResponse.json({
      ok: true,
      amount: price,
      balance: newSenderBal,
    });
  } catch (e: any) {
    console.error('clip purchase', e);
    return NextResponse.json(
      { error: e.message || 'Purchase failed' },
      { status: 500 }
    );
  }
}
