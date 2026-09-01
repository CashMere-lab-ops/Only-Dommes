import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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
    } = await admin.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const creatorId = String(body?.creator_id || '');
    if (!creatorId) {
      return NextResponse.json({ error: 'creator_id required' }, { status: 400 });
    }

    const { data: sub, error } = await admin
      .from('subscriptions')
      .select('id, status')
      .eq('subscriber_id', user.id)
      .eq('creator_id', creatorId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!sub) {
      return NextResponse.json(
        { error: 'No active subscription to cancel' },
        { status: 400 }
      );
    }

    const { error: upErr } = await admin
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', sub.id);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ended: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Cancel failed' },
      { status: 500 }
    );
  }
}
