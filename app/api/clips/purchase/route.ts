import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { splitCreatorEarn } from '../../../../lib/platform-fee';

export const dynamic = 'force-dynamic';

/**
 * Buy a clip from wallet:
 * 1. Debit buyer, credit creator (clip_sent / clip_received)
 * 2. Insert clip_purchases
 * 3. Increment sales_count
 * 4. Notify creator (clip sold + amount)
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
      .select('id, creator_id, title, price_gbp, is_published, sales_count')
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

    const { data: sender } = await admin
      .from('profiles')
      .select('balance_gbp, display_name, username')
      .eq('id', user.id)
      .single();

    if (!sender) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const buyerName =
      sender.display_name ||
      (sender.username ? `@${sender.username}` : 'Someone');

    // Free clip — still notify creator
    if (price === 0) {
      await admin.from('clip_purchases').insert({
        clip_id: clipId,
        buyer_id: user.id,
        creator_id: clip.creator_id,
        amount_gbp: 0,
      });
      await admin
        .from('clips')
        .update({
          sales_count: Number(clip.sales_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', clipId);

      await admin.from('notifications').insert({
        user_id: clip.creator_id,
        actor_id: user.id,
        type: 'unlock',
        title: 'Clip unlocked',
        body: `${buyerName} unlocked your free clip “${clip.title}”`,
        link: '/earnings',
      });

      return NextResponse.json({ ok: true, amount: 0, free: true });
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

    const { gross_gbp, fee_gbp, net_gbp } = splitCreatorEarn(price);
    const newSenderBal = Math.round((bal - gross_gbp) * 100) / 100;
    const newRecipientBal =
      Math.round((Number(recipient.balance_gbp || 0) + net_gbp) * 100) / 100;

    // Wallet: debit buyer, credit creator
    const { error: debitErr } = await admin
      .from('profiles')
      .update({ balance_gbp: newSenderBal })
      .eq('id', user.id);
    if (debitErr) {
      return NextResponse.json(
        { error: debitErr.message || 'Could not debit wallet' },
        { status: 500 }
      );
    }

    const { error: creditErr } = await admin
      .from('profiles')
      .update({ balance_gbp: newRecipientBal })
      .eq('id', clip.creator_id);
    if (creditErr) {
      // best-effort rollback buyer
      await admin
        .from('profiles')
        .update({ balance_gbp: bal })
        .eq('id', user.id);
      return NextResponse.json(
        { error: creditErr.message || 'Could not credit creator' },
        { status: 500 }
      );
    }

    const desc = `Clip: ${clip.title}`;
    const ledgerRows = [
      {
        user_id: user.id,
        type: 'clip_sent',
        amount_gbp: -gross_gbp,
        balance_after: newSenderBal,
        reference_type: 'clip',
        reference_id: clipId,
        description: desc,
      },
      {
        user_id: clip.creator_id,
        type: 'clip_received',
        amount_gbp: net_gbp,
        balance_after: newRecipientBal,
        reference_type: 'clip',
        reference_id: clipId,
        description: desc,
      },
    ];

    // Prefer with counterparty if column exists; fall back without
    const { error: ledgerErr } = await admin.from('wallet_transactions').insert(
      ledgerRows.map((r) => ({
        ...r,
        counterparty_id:
          r.user_id === user.id ? clip.creator_id : user.id,
      }))
    );

    if (ledgerErr) {
      // Retry without counterparty_id (older schema)
      const { error: ledgerErr2 } = await admin
        .from('wallet_transactions')
        .insert(ledgerRows);
      if (ledgerErr2) {
        console.error('wallet_transactions insert', ledgerErr2);
      }
    }

    const { error: purchaseErr } = await admin.from('clip_purchases').insert({
      clip_id: clipId,
      buyer_id: user.id,
      creator_id: clip.creator_id,
      amount_gbp: price,
    });
    if (purchaseErr) {
      return NextResponse.json(
        { error: purchaseErr.message || 'Purchase record failed' },
        { status: 500 }
      );
    }

    await admin
      .from('clips')
      .update({
        sales_count: Number(clip.sales_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clipId);

    // Notify creator — use actor_id (matches notifications schema)
    const notifBody = `${buyerName} bought “${clip.title}” · £${price.toFixed(2)} (you keep £${net_gbp.toFixed(2)})`;
    const { error: notifErr } = await admin.from('notifications').insert({
      user_id: clip.creator_id,
      actor_id: user.id,
      type: 'unlock',
      title: 'Clip sold 💰',
      body: notifBody,
      link: '/earnings',
    });
    if (notifErr) {
      console.error('clip sale notification', notifErr);
      // Try minimal fields
      await admin.from('notifications').insert({
        user_id: clip.creator_id,
        actor_id: user.id,
        type: 'tip',
        title: 'Clip sold',
        body: notifBody,
      });
    }

    return NextResponse.json({
      ok: true,
      amount: price,
      balance: newSenderBal,
      creator_balance: newRecipientBal,
    });
  } catch (e: any) {
    console.error('clip purchase', e);
    return NextResponse.json(
      { error: e.message || 'Purchase failed' },
      { status: 500 }
    );
  }
}
