import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const RECEIVED = [
  'tip_received',
  'gift_received',
  'clip_received',
  'sub_received',
  'call_received',
  'shop_received',
  'private_received',
];

const WINDOWS = [
  { key: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '3m', ms: 90 * 24 * 60 * 60 * 1000 },
  { key: '6m', ms: 182 * 24 * 60 * 60 * 1000 },
  { key: '12m', ms: 365 * 24 * 60 * 60 * 1000 },
];

function money(n: number) {
  return Math.round(n * 100) / 100;
}

export async function GET(request: Request) {
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

  const { data: me } = await admin
    .from('profiles')
    .select('is_admin, username, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!me?.is_admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const now = Date.now();
  const since12m = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();

  const [profilesRes, txRes, liveRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, account_type, created_at, last_seen_at'),
    admin
      .from('wallet_transactions')
      .select('type, amount_gbp, fee_gbp, net_gbp, gross_gbp, created_at')
      .in('type', RECEIVED)
      .gte('created_at', since12m),
    admin
      .from('live_streams')
      .select('id, title, creator_id, status, viewer_count, started_at')
      .eq('status', 'active'),
  ]);

  const profiles = profilesRes.data || [];
  const txs = txRes.data || [];
  const lives = liveRes.data || [];

  const onlineCut = now - 5 * 60 * 1000;
  const users = {
    total: profiles.length,
    creators: profiles.filter((p) => p.account_type === 'creator').length,
    subscribers: profiles.filter((p) => p.account_type === 'sub').length,
    online: profiles.filter((p) => {
      const t = p.last_seen_at ? new Date(p.last_seen_at).getTime() : 0;
      return t >= onlineCut;
    }).length,
  };

  const signups: Record<string, number> = {};
  for (const w of WINDOWS) {
    const cut = now - w.ms;
    signups[w.key] = profiles.filter((p) => {
      const t = p.created_at ? new Date(p.created_at).getTime() : 0;
      return t >= cut;
    }).length;
  }

  const empty = () => ({ gross: 0, fee: 0, net: 0, count: 0 });
  const moneyWindows: Record<string, ReturnType<typeof empty>> = {};
  for (const w of WINDOWS) moneyWindows[w.key] = empty();
  moneyWindows.today = empty();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  for (const row of txs) {
    const at = new Date(row.created_at).getTime();
    const net = Number(row.net_gbp ?? row.amount_gbp ?? 0);
    const fee =
      row.fee_gbp != null
        ? Number(row.fee_gbp)
        : money(net * 0.25);
    const gross =
      row.gross_gbp != null ? Number(row.gross_gbp) : money(net + fee);

    const add = (bucket: ReturnType<typeof empty>) => {
      bucket.gross = money(bucket.gross + gross);
      bucket.fee = money(bucket.fee + fee);
      bucket.net = money(bucket.net + net);
      bucket.count += 1;
    };

    if (at >= startOfDay.getTime()) add(moneyWindows.today);
    for (const w of WINDOWS) {
      if (at >= now - w.ms) add(moneyWindows[w.key]);
    }
  }

  return NextResponse.json({
    ok: true,
    admin: {
      username: me.username,
      display_name: me.display_name,
    },
    users,
    signups,
    money: moneyWindows,
    lives: lives.map((l) => ({
      id: l.id,
      title: l.title,
      creator_id: l.creator_id,
      viewer_count: l.viewer_count || 0,
      started_at: l.started_at,
    })),
  });
}
