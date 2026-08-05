import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Auto-cancel shop orders past collection_deadline (locker hold time).
 * Statuses: shipped (dropped off, waiting for buyer collect)
 * Secure with CRON_SECRET when called from Vercel Cron / external cron.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: 'Missing Supabase env' },
      { status: 500 }
    );
  }

  const supabase = createClient(url, key);
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from('shop_orders')
    .select('*')
    .eq('status', 'shipped')
    .not('collection_deadline', 'is', null)
    .lte('collection_deadline', now)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'Nothing to cancel' });
  }

  const results: { id: string; ok?: boolean; error?: string }[] = [];

  for (const order of due) {
    try {
      const { error: upErr } = await supabase
        .from('shop_orders')
        .update({
          status: 'cancelled',
          // keep a note in buyer_note style field if needed — use status only
        })
        .eq('id', order.id)
        .eq('status', 'shipped');

      if (upErr) {
        results.push({ id: order.id, error: upErr.message });
        continue;
      }

      const body = `"${order.item_title}" was auto-cancelled — not collected before the ${
        order.shipping_carrier || 'carrier'
      } hold time ended.`;

      // Notify buyer
      if (order.buyer_id) {
        await supabase.from('notifications').insert({
          user_id: order.buyer_id,
          actor_id: order.creator_id,
          type: 'unlock',
          title: 'Order auto-cancelled',
          body,
          link: '/dashboard',
        });
      }

      // Notify creator
      if (order.creator_id) {
        await supabase.from('notifications').insert({
          user_id: order.creator_id,
          actor_id: order.buyer_id,
          type: 'unlock',
          title: 'Order auto-cancelled',
          body: `Buyer did not collect "${order.item_title}" in time.`,
          link: '/dashboard',
        });
      }

      // System message in chat if conversation exists
      if (order.buyer_id && order.creator_id) {
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .or(
            `and(participant_1.eq.${order.creator_id},participant_2.eq.${order.buyer_id}),and(participant_1.eq.${order.buyer_id},participant_2.eq.${order.creator_id})`
          )
          .maybeSingle();

        if (existing?.id) {
          await supabase.from('messages').insert({
            conversation_id: existing.id,
            sender_id: order.creator_id,
            content: `⏱ Order auto-cancelled: "${order.item_title}"\n\nNot collected before the carrier hold time ended. Locker / pick-up only — no home delivery.`,
            media_type: 'system',
          });
          await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
      }

      results.push({ id: order.id, ok: true });
    } catch (e: any) {
      results.push({ id: order.id, error: e?.message || 'failed' });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.filter((r) => r.ok).length,
    results,
  });
}
