import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Optional: protect with a secret so only your cron can call this
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from('scheduled_mass_messages')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: any[] = [];

  for (const job of due || []) {
    try {
      const ids = new Set<string>();

      if (job.audience === 'followers' || job.audience === 'both') {
        const { data } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('following_id', job.creator_id);
        (data || []).forEach((r: any) => ids.add(r.follower_id));
      }

      if (job.audience === 'subscribers' || job.audience === 'both') {
        const { data } = await supabase
          .from('subscriptions')
          .select('subscriber_id')
          .eq('creator_id', job.creator_id)
          .eq('status', 'active');
        (data || []).forEach((r: any) => ids.add(r.subscriber_id));
      }

      let sent = 0;

      for (const fanId of ids) {
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .or(
            `and(participant_1.eq.${job.creator_id},participant_2.eq.${fanId}),and(participant_1.eq.${fanId},participant_2.eq.${job.creator_id})`
          )
          .maybeSingle();

        let convoId = existing?.id;

        if (!convoId) {
          const { data: created } = await supabase
            .from('conversations')
            .insert({
              participant_1: job.creator_id,
              participant_2: fanId,
              last_message_at: new Date().toISOString(),
            })
            .select('id')
            .single();
          convoId = created?.id;
        }

        if (!convoId) continue;

        await supabase.from('messages').insert({
          conversation_id: convoId,
          sender_id: job.creator_id,
          content: job.content,
        });

        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', convoId);

        sent += 1;
      }

      await supabase
        .from('scheduled_mass_messages')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          recipient_count: sent,
        })
        .eq('id', job.id);

      results.push({ id: job.id, sent });
    } catch (err: any) {
      await supabase
        .from('scheduled_mass_messages')
        .update({
          status: 'failed',
          error_message: err.message || 'Failed',
        })
        .eq('id', job.id);

      results.push({ id: job.id, error: err.message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}