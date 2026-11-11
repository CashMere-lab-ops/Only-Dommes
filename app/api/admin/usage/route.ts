import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AccessToken } from 'livekit-server-sdk';

export const dynamic = 'force-dynamic';

function day(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function requireAdmin(request: Request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return { error: NextResponse.json({ error: 'Login required' }, { status: 401 }) };
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const {
    data: { user },
  } = await admin.auth.getUser(token);
  if (!user) return { error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) };
  const { data: me } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!me?.is_admin) return { error: NextResponse.json({ error: 'Admin only' }, { status: 403 }) };
  return { admin };
}

async function livekitUsage() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const projectId = process.env.LIVEKIT_PROJECT_ID;
  if (!apiKey || !apiSecret || !projectId) {
    return { connected: false, note: 'Add LIVEKIT_PROJECT_ID in Vercel. It starts with p_ in the LiveKit project URL.' };
  }
  const at = new AccessToken(apiKey, apiSecret, { ttl: 60 * 10 });
  at.addGrant({ roomList: true });
  const token = await at.toJwt();
  const end = new Date();
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  let sessions = 0;
  let minutes = 0;
  let bytesOut = 0;
  for (let page = 0; page < 5; page++) {
    const url =
      `https://cloud-api.livekit.io/api/project/${projectId}/sessions` +
      `?limit=100&page=${page}&start=${day(start)}&end=${day(end)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) {
      return { connected: false, note: `LiveKit returned ${res.status}. Check LIVEKIT_PROJECT_ID.` };
    }
    const json = await res.json();
    const rows = json.sessions || json.data || [];
    if (!rows.length) break;
    for (const s of rows) {
      sessions += 1;
      minutes += Number(s.connectionMinutes || s.connection_minutes || 0);
      bytesOut += Number(s.bandwidthOut || s.bandwidth_out || 0);
      if (!s.connectionMinutes && s.numParticipants && s.createdAt) {
        const from = new Date(s.createdAt).getTime();
        const to = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
        minutes += Math.max(0, (to - from) / 60000) * Number(s.numParticipants || 1);
      }
    }
    if (rows.length < 100) break;
  }
  return {
    connected: true,
    window: 'Last 7 days',
    sessions,
    minutes: Math.round(minutes),
    data_gb: Math.round((bytesOut / (1024 * 1024 * 1024)) * 100) / 100,
  };
}

async function muxUsage() {
  const id = process.env.MUX_TOKEN_ID;
  const secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) return { connected: false, note: 'Mux keys are not set.' };
  const auth = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
  const end = Math.floor(Date.now() / 1000) - 13 * 60 * 60;
  const start = end - 30 * 24 * 60 * 60;
  const usageRes = await fetch(
    `https://api.mux.com/video/v1/delivery-usage?timeframe[]=${start}&timeframe[]=${end}&limit=100`,
    { headers: { Authorization: auth }, cache: 'no-store' }
  );
  if (!usageRes.ok) return { connected: false, note: `Mux returned ${usageRes.status}.` };
  const usage = await usageRes.json();
  const rows = usage.data || [];
  const seconds = rows.reduce((n: number, r: any) => n + Number(r.delivered_seconds || 0), 0);
  const assetsRes = await fetch('https://api.mux.com/video/v1/assets?limit=1', {
    headers: { Authorization: auth },
    cache: 'no-store',
  });
  const assets = assetsRes.ok ? await assetsRes.json() : {};
  return {
    connected: true,
    window: 'Last 30 days',
    delivered_minutes: Math.round(seconds / 60),
    assets: assets.total_row_count ?? null,
    note: 'Delivery minutes update hourly and can lag about 12 hours.',
  };
}

async function supabaseUsage(admin: any) {
  let bytes = 0;
  let files = 0;
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await admin
      .schema('storage')
      .from('objects')
      .select('metadata')
      .range(from, from + 999);
    if (error || !data?.length) break;
    files += data.length;
    for (const row of data) {
      const size = Number(row.metadata?.size || 0);
      if (Number.isFinite(size)) bytes += size;
    }
    if (data.length < 1000) break;
  }
  const gb = Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
  return {
    connected: true,
    storage_gb: gb,
    storage_quota_gb: 100,
    files,
    note: 'File storage used of the 100 GB Pro quota.',
  };
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const [livekit, mux, supabase] = await Promise.all([
    livekitUsage().catch((e) => ({ connected: false, note: e.message })),
    muxUsage().catch((e) => ({ connected: false, note: e.message })),
    supabaseUsage(gate.admin).catch((e) => ({ connected: false, note: e.message })),
  ]);
  return NextResponse.json({ ok: true, livekit, mux, supabase });
}
