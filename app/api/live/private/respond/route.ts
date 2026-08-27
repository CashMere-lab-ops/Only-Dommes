import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { splitCreatorEarn } from '../../../../../lib/platform-fee';

export const dynamic = 'force-dynamic';

/** Creator accepts or declines a private request */
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
    const requestId = String(body?.request_id || '');
    const action = String(body?.action || ''); // accept | decline

    if (!requestId || !['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { data: req, error: rErr } = await admin
      .from('live_private_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (rErr || !req) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (req.creator_id !== user.id) {
      return NextResponse.json({ error: 'Not your request' }, { status: 403 });
    }
    if (req.status !== 'pending') {
      return NextResponse.json(
        { error: 'Request already handled' },
        { status: 400 }
      );
    }

    if (action === 'decline') {
      await admin
        .from('live_private_requests')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      try {
        await admin.from('notifications').insert({
          user_id: req.requester_id,
          type: 'private_declined',
          title: 'Private declined',
          body: 'The creator declined your private request',
          link: `/live/${req.stream_id}`,
        });
      } catch {
        /* optional */
      }

      return NextResponse.json({ ok: true, status: 'declined' });
    }

    // ACCEPT
    const { data: stream } = await admin
      .from('live_streams')
      .select('*')
      .eq('id', req.stream_id)
      .single();

    if (!stream || stream.status === 'ended') {
      return NextResponse.json({ error: 'Stream not available' }, { status: 400 });
    }
    if (stream.private_active) {
      return NextResponse.json(
        { error: 'Already in a private session' },
        { status: 400 }
      );
    }

    const amount = Number(req.amount_gbp);
    const { data: fan } = await admin
      .from('profiles')
      .select('balance_gbp, display_name, username')
      .eq('id', req.requester_id)
      .single();

    const fanBal = Number(fan?.balance_gbp || 0);
    if (fanBal < amount) {
      await admin
        .from('live_private_requests')
        .update({
          status: 'expired',
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId);
      return NextResponse.json(
        {
          error: 'Fan no longer has enough balance',
          code: 'INSUFFICIENT_BALANCE',
        },
        { status: 402 }
      );
    }

    const { data: creator } = await admin
      .from('profiles')
      .select('balance_gbp')
      .eq('id', req.creator_id)
      .single();

    const { gross_gbp, fee_gbp, net_gbp } = splitCreatorEarn(amount);
    const newFanBal = Math.round((fanBal - gross_gbp) * 100) / 100;
    const newCreatorBal =
      Math.round((Number(creator?.balance_gbp || 0) + net_gbp) * 100) / 100;
    const ref = randomUUID();
    const endsAt = new Date(
      Date.now() + Number(req.minutes) * 60 * 1000
    ).toISOString();

    await admin
      .from('profiles')
      .update({ balance_gbp: newFanBal })
      .eq('id', req.requester_id);
    await admin
      .from('profiles')
      .update({ balance_gbp: newCreatorBal })
      .eq('id', req.creator_id);

    await admin.from('wallet_transactions').insert([
      {
        user_id: req.requester_id,
        type: 'private_sent',
        amount_gbp: -gross_gbp,
        balance_after: newFanBal,
        counterparty_id: req.creator_id,
        reference_type: 'live_private',
        reference_id: ref,
        description: `Private live · ${req.minutes} min`,
      },
      {
        user_id: req.creator_id,
        type: 'private_received',
        amount_gbp: net_gbp,
        balance_after: newCreatorBal,
        counterparty_id: req.requester_id,
        reference_type: 'live_private',
        reference_id: ref,
        description: `Private live · ${req.minutes} min · kept £${net_gbp.toFixed(2)} after 20% fee`,
        gross_gbp,
        fee_gbp,
        net_gbp,
      },
    ]);

    await admin
      .from('live_private_requests')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    // Decline other pending on this stream
    await admin
      .from('live_private_requests')
      .update({
        status: 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('stream_id', req.stream_id)
      .eq('status', 'pending')
      .neq('id', requestId);

    await admin
      .from('live_streams')
      .update({
        private_active: true,
        private_user_id: req.requester_id,
        private_request_id: requestId,
        private_ends_at: endsAt,
        private_end_by_creator: false,
        private_end_by_fan: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.stream_id);

    try {
      await admin.from('notifications').insert({
        user_id: req.requester_id,
        type: 'private_accepted',
        title: 'Private accepted',
        body: `Your ${req.minutes} min private session has started`,
        link: `/live/${req.stream_id}`,
      });
    } catch {
      /* optional */
    }

    return NextResponse.json({
      ok: true,
      status: 'accepted',
      private_ends_at: endsAt,
      amount,
      minutes: req.minutes,
    });
  } catch (e: any) {
    console.error('private respond', e);
    return NextResponse.json(
      { error: e?.message || 'Failed' },
      { status: 500 }
    );
  }
}
