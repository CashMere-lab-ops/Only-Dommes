import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { splitCreatorEarn } from '../../../../lib/platform-fee';

export const dynamic = 'force-dynamic';

function addDays(from: Date, days: number) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

async function creatorLabel(admin: any, creatorId: string) {
  const { data } = await admin
    .from('profiles')
    .select('username, display_name')
    .eq('id', creatorId)
    .single();
  return data?.display_name || (data?.username ? `@${data.username}` : 'a creator');
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const nowIso = now.toISOString();
  const in3d = addDays(now, 3).toISOString();
  const in1d = addDays(now, 1).toISOString();
  const results: any[] = [];

  // --- Reminders ---
  const { data: upcoming } = await admin
    .from('subscriptions')
    .select('id, subscriber_id, creator_id, price, current_period_end, remind_3d_sent_at, remind_1d_sent_at, cancel_at_period_end')
    .eq('status', 'active')
    .gt('current_period_end', nowIso)
    .lte('current_period_end', in3d)
    .limit(200);

  for (const sub of upcoming || []) {
    if (sub.cancel_at_period_end) continue;
    const ends = new Date(sub.current_period_end);
    const label = await creatorLabel(admin, sub.creator_id);
    const price = Number(sub.price || 0).toFixed(2);
    const endStr = ends.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });

    if (!sub.remind_3d_sent_at) {
      try {
        await admin.from('notifications').insert({
          user_id: sub.subscriber_id,
          type: 'subscription',
          title: `Renews ${endStr}`,
          body: `Your subscription to ${label} renews for £${price}.`,
          link: '/subscriptions',
        });
        await admin
          .from('subscriptions')
          .update({ remind_3d_sent_at: nowIso })
          .eq('id', sub.id);
        results.push({ id: sub.id, action: 'remind_3d' });
      } catch {
        /* skip */
      }
    }

    if (ends.getTime() <= new Date(in1d).getTime() && !sub.remind_1d_sent_at) {
      const { data: sender } = await admin
        .from('profiles')
        .select('balance_gbp')
        .eq('id', sub.subscriber_id)
        .single();
      const bal = Number(sender?.balance_gbp || 0);
      if (bal < Number(sub.price || 0)) {
        try {
          await admin.from('notifications').insert({
            user_id: sub.subscriber_id,
            type: 'subscription',
            title: 'Wallet low — renews tomorrow',
            body: `Need £${price} for ${label}. Top up or we’ll use your backup card.`,
            link: '/wallet',
          });
          await admin
            .from('subscriptions')
            .update({ remind_1d_sent_at: nowIso })
            .eq('id', sub.id);
          results.push({ id: sub.id, action: 'remind_1d' });
        } catch {
          /* skip */
        }
      }
    }
  }

  // --- Renew / end ---
  const { data: due, error } = await admin
    .from('subscriptions')
    .select('*')
    .eq('status', 'active')
    .lte('current_period_end', nowIso)
    .limit(80);

  if (error) {
    return NextResponse.json({ error: error.message, results }, { status: 500 });
  }

  for (const sub of due || []) {
    try {
      if (sub.cancel_at_period_end || sub.status === 'ending') {
        await admin
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('id', sub.id);
        results.push({ id: sub.id, action: 'ended' });
        continue;
      }

      const price = Math.round(Number(sub.price || 0) * 100) / 100;
      if (price <= 0) {
        await admin
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('id', sub.id);
        results.push({ id: sub.id, action: 'invalid_price' });
        continue;
      }

      const { data: sender } = await admin
        .from('profiles')
        .select('balance_gbp')
        .eq('id', sub.subscriber_id)
        .single();
      let bal = Number(sender?.balance_gbp || 0);
      if (bal < price) {
        try {
          const { chargeSavedCardToWallet } = await import('../../../../lib/billing');
          const charged = await chargeSavedCardToWallet({
            userId: sub.subscriber_id,
            amountGbp: Math.max(price - bal, 0.5),
            reason: `Subscription auto-renew card £${price.toFixed(2)}`,
          });
          if (charged.ok) bal = charged.balance;
        } catch {
          /* no card helper */
        }
      }
      if (bal < price) {
        await admin
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('id', sub.id);
        const label = await creatorLabel(admin, sub.creator_id);
        try {
          await admin.from('notifications').insert({
            user_id: sub.subscriber_id,
            type: 'subscription',
            title: 'Subscription payment failed',
            body: `Couldn’t renew ${label}. Top up or add a backup card.`,
            link: '/wallet',
          });
        } catch {
          /* optional */
        }
        results.push({ id: sub.id, action: 'past_due' });
        continue;
      }

      const { data: creator } = await admin
        .from('profiles')
        .select('balance_gbp')
        .eq('id', sub.creator_id)
        .single();
      const { gross_gbp, net_gbp } = splitCreatorEarn(price);
      const senderNext = Math.round((bal - gross_gbp) * 100) / 100;
      const creatorNext =
        Math.round((Number(creator?.balance_gbp || 0) + net_gbp) * 100) / 100;

      await admin
        .from('profiles')
        .update({ balance_gbp: senderNext })
        .eq('id', sub.subscriber_id);
      await admin
        .from('profiles')
        .update({ balance_gbp: creatorNext })
        .eq('id', sub.creator_id);

      await admin.from('wallet_transactions').insert([
        {
          user_id: sub.subscriber_id,
          type: 'sub_sent',
          amount_gbp: -gross_gbp,
          balance_after: senderNext,
          counterparty_id: sub.creator_id,
          reference_type: 'subscription',
          reference_id: sub.id,
          description: `Subscription renewal £${gross_gbp.toFixed(2)}`,
        },
        {
          user_id: sub.creator_id,
          type: 'sub_received',
          amount_gbp: net_gbp,
          balance_after: creatorNext,
          counterparty_id: sub.subscriber_id,
          reference_type: 'subscription',
          reference_id: sub.id,
          description: `Subscription £${gross_gbp.toFixed(2)}`,
        },
      ]);

      const periodEnd = addDays(new Date(), 30).toISOString();
      await admin
        .from('subscriptions')
        .update({
          last_billed_at: nowIso,
          current_period_end: periodEnd,
          status: 'active',
          remind_3d_sent_at: null,
          remind_1d_sent_at: null,
        })
        .eq('id', sub.id);

      results.push({ id: sub.id, action: 'renewed' });
    } catch (err: any) {
      results.push({ id: sub.id, error: err.message });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
