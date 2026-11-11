import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

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

async function livekitUsage(admin: any) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const projectId = process.env.LIVEKIT_PROJECT_ID;

  let rooms = 0;
  let roomNote = '';
  if (apiKey && apiSecret && url) {
    try {
      const host = url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
      const roomsClient = new RoomServiceClient(host, apiKey, apiSecret);
      const list = await roomsClient.listRooms();
      rooms = list.length;
    } catch (e: any) {
      roomNote = e?.message || 'Could not list rooms';
    }
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: streams } = await admin
    .from('live_streams')
    .select('started_at, ended_at, peak_viewers, viewer_count')
    .gte('started_at', since);
  let siteMinutes = 0;
  for (const s of streams || []) {
    const from = new Date(s.started_at).getTime();
    const to = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
    const mins = Math.max(0, (to - from) / 60000);
    const people = Math.max(1, Number(s.peak_viewers || s.viewer_count || 1));
    siteMinutes += mins * people;
  }

  if (!apiKey || !apiSecret || !projectId) {
    return {
      connected: true,
      window: 'Last 7 days',
      rooms,
      minutes: Math.round(siteMinutes),
      source: 'Site records',
      note: roomNote || 'Add LIVEKIT_PROJECT_ID for LiveKit Cloud totals. Showing minutes from your own lives.',
    };
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: 'wod-admin',
    ttl: 60 * 10,
  });
  at.addGrant({ roomList: true });
  const token = await at.toJwt();
  const end = new Date();
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  const apiUrl =
    `https://cloud-api.livekit.io/api/project/${projectId}/sessions` +
    `?limit=100&page=0&start=${day(start)}&end=${day(end)}`;
  const res = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (res.status === 401 || res.status === 403) {
    return {
      connected: true,
      window: 'Last 7 days',
      rooms,
      minutes: Math.round(siteMinutes),
      source: 'Site records',
      note: 'LiveKit Cloud analytics needs the Scale plan. Showing minutes from your own lives and calls rooms.',
    };
  }
  if (!res.ok) {
    return {
      connected: true,
      window: 'Last 7 days',
      rooms,
      minutes: Math.round(siteMinutes),
      source: 'Site records',
      note: `LiveKit Cloud returned ${res.status}. Showing site records instead.`,
    };
  }

  const json = await res.json();
  const rows = json.sessions || [];
  let minutes = 0;
  let bytesOut = 0;
  for (const s of rows) {
    minutes += Number(s.connectionMinutes || 0);
    bytesOut += Number(s.bandwidthOut || 0);
  }
  return {
    connected: true,
    window: 'Last 7 days',
    rooms,
    sessions: rows.length,
    minutes: Math.round(minutes),
    data_gb: Math.round((bytesOut / (1024 * 1024 * 1024)) * 100) / 100,
    source: 'LiveKit Cloud',
  };
}

async function muxUsage() {
  const id = process.env.MUX_TOKEN_ID?.trim();
  const secret = process.env.MUX_TOKEN_SECRET?.trim();
  if (!id || !secret) return { connected: false, note: 'Mux keys are not set.' };

  const auth = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
  const hour = 60 * 60;
  const end = Math.floor(Date.now() / 1000 / hour) * hour - 13 * hour;
  const start = end - 30 * 24 * hour;

  const params = new URLSearchParams();
  params.append('timeframe[]', String(start));
  params.append('timeframe[]', String(end));
  params.set('limit', '100');

  const usageRes = await fetch(
    `https://api.mux.com/video/v1/delivery-usage?${params.toString()}`,
    { headers: { Authorization: auth }, cache: 'no-store' }
  );
  const usageText = await usageRes.text();
  if (!usageRes.ok) {
    return { connected: false, note: `Mux ${usageRes.status}: ${usageText.slice(0, 180)}` };
  }

  const usage = JSON.parse(usageText);
  const rows = usage.data || [];
  const seconds = rows.reduce(
    (n: number, r: any) => n + Number(r.delivered_seconds || 0),
    0
  );
  const used = Math.round(seconds / 60);
  const free = 100000;

  const assetsRes = await fetch('https://api.mux.com/video/v1/assets?limit=1', {
    headers: { Authorization: auth },
    cache: 'no-store',
  });
  const assets = assetsRes.ok ? await assetsRes.json() : {};

  return {
    connected: true,
    window: 'Last 30 days',
    delivered_minutes: used,
    free_minutes: free,
    remaining_minutes: Math.max(0, free - used),
    assets: assets.total_row_count ?? null,
    note: 'Ends 13 hours ago. First 100,000 minutes each month are free.',
  };
}

async function supabaseUsage(admin: any) {
  let bytes = 0;
  let files = 0;
  let note = 'File storage used of the 100 GB Pro quota.';
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await admin
      .schema('storage')
      .from('objects')
      .select('metadata')
      .range(from, from + 999);
    if (error) {
      note = error.message;
      break;
    }
    if (!data?.length) break;
    files += data.length;
    for (const row of data) {
      const size = Number(row.metadata?.size || 0);
      if (Number.isFinite(size)) bytes += size;
    }
    if (data.length < 1000) break;
  }
  return {
    connected: true,
    storage_gb: Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100,
    storage_quota_gb: 100,
    files,
    note,
  };
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;
  const [livekit, mux, supabase] = await Promise.all([
    livekitUsage(gate.admin).catch((e) => ({ connected: false, note: e.message })),
    muxUsage().catch((e) => ({ connected: false, note: e.message })),
    supabaseUsage(gate.admin).catch((e) => ({ connected: false, note: e.message })),
  ]);
  return NextResponse.json({ ok: true, livekit, mux, supabase });
}
