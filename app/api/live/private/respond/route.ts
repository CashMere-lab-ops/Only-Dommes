import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** Creator accepts or declines a private request. Acceptance and payment are atomic. */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
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
    const action = String(body?.action || '');

    if (!requestId || !['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { data: privateRequest, error: requestErr } = await admin
      .from('live_private_requests')
      .select('id, stream_id, creator_id, requester_id, minutes, amount_gbp, status')
      .eq('id', requestId)
      .single();

    if (requestErr || !privateRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (privateRequest.creator_id !== user.id) {
      return NextResponse.json({ error: 'Not your request' }, { status: 403 });
    }

    if (action === 'decline') {
      if (privateRequest.status !== 'pending') {
        return NextResponse.json({ error: 'Request already handled' }, { status: 400 });
      }

      const { data: updated, error: updateErr } = await admin
        .from('live_private_requests')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (updateErr || !updated) {
        return NextResponse.json({ error: 'Request already handled' }, { status: 409 });
      }

      const { error: notificationErr } = await admin.from('notifications').insert({
        user_id: privateRequest.requester_id,
        type: 'private_declined',
        title: 'Private declined',
        body: 'The creator declined your private request',
        link: `/live/${privateRequest.stream_id}`,
      });
      if (notificationErr) console.error('private decline notification', notificationErr);

      return NextResponse.json({ ok: true, status: 'declined' });
    }

    const { data, error: acceptErr } = await admin.rpc('accept_live_private_request', {
      p_request_id: requestId,
      p_creator_id: user.id,
    });

    if (acceptErr) {
      const message = acceptErr.message || 'Could not accept private request';
      if (message.includes('Insufficient wallet balance')) {
        return NextResponse.json(
          {
            error: 'Fan no longer has enough balance',
            code: 'INSUFFICIENT_BALANCE',
          },
          { status: 402 }
        );
      }
      if (message.includes('Already in a private session')) {
        return NextResponse.json({ error: 'Already in a private session' }, { status: 400 });
      }
      if (message.includes('Stream not available')) {
        return NextResponse.json({ error: 'Stream not available' }, { status: 400 });
      }
      if (message.includes('Request already handled')) {
        return NextResponse.json({ error: 'Request already handled' }, { status: 409 });
      }
      if (message.includes('Incomplete prior transfer')) {
        return NextResponse.json(
          { error: 'Private payment requires reconciliation', code: 'RECONCILIATION_REQUIRED' },
          { status: 409 }
        );
      }
      console.error('accept_live_private_request RPC', acceptErr);
      return NextResponse.json({ error: 'Could not accept private request' }, { status: 500 });
    }

    const result = (data || {}) as {
      already?: boolean;
      status?: string;
      private_ends_at?: string | null;
      amount?: number;
      minutes?: number;
    };

    if (!result.already) {
      const { error: notificationErr } = await admin.from('notifications').insert({
        user_id: privateRequest.requester_id,
        type: 'private_accepted',
        title: 'Private accepted',
        body: `Your ${Number(result.minutes ?? privateRequest.minutes)} min private session has started`,
        link: `/live/${privateRequest.stream_id}`,
      });
      if (notificationErr) console.error('private accepted notification', notificationErr);
    }

    return NextResponse.json({
      ok: true,
      already: Boolean(result.already),
      status: 'accepted',
      private_ends_at: result.private_ends_at,
      amount: Number(result.amount ?? privateRequest.amount_gbp),
      minutes: Number(result.minutes ?? privateRequest.minutes),
    });
  } catch (error: unknown) {
    console.error('private respond', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
