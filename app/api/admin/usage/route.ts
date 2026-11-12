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

async function listFolder(admin: any, bucket: string, prefix: string) {
  const { data, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw new Error(error.message);
  return data || [];
}

async function supabaseUsage(admin: any) {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) return { connected: false, note: error.message };

  let bytes = 0;
  let files = 0;
  const byBucket: { name: string; files: number; gb: number }[] = [];

  for (const bucket of buckets || []) {
    let bucketBytes = 0;
    let bucketFiles = 0;
    const queue = [''];
    const seen = new Set<string>();

    while (queue.length && seen.size < 200) {
      const prefix = queue.shift() || '';
      if (seen.has(prefix)) continue;
      seen.add(prefix);
      const rows = await listFolder(admin, bucket.name, prefix);
      for (const row of rows) {
        const isFolder = !row.metadata && !row.id;
        const path = prefix ? `${prefix}/${row.name}` : row.name;
        if (isFolder) {
          queue.push(path);
          continue;
        }
        bucketFiles += 1;
        const size = Number(row.metadata?.size || 0);
        if (Number.isFinite(size)) bucketBytes += size;
      }
    }

    files += bucketFiles;
    bytes += bucketBytes;
    byBucket.push({
      name: bucket.name,
      files: bucketFiles,
      gb: Math.round((bucketBytes / (1024 * 1024 * 1024)) * 100) / 100,
    });
  }

  const gb = Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
  const extra = await supabasePlatform();
  return {
    connected: true,
    storage_gb: gb,
    storage_quota_gb: 100,
    remaining_gb: Math.round((100 - gb) * 100) / 100,
    files,
    buckets: byBucket,
    note: 'File storage used of the 100 GB Pro quota.',
    ...extra,
  };
}

async function supabasePlatform() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref = process.env.SUPABASE_PROJECT_REF?.trim();
  if (!token || !ref) {
    return {
      platform_note: 'Add SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in Vercel for database disk and egress.',
    };
  }

  const headers = { Authorization: `Bearer ${token}` };
  const diskRes = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/config/disk/util`,
    { headers, cache: 'no-store' }
  );
  const diskText = await diskRes.text();
  let disk: any = null;
  if (diskRes.ok) {
    const json = JSON.parse(diskText);
    const used = Number(json.metrics?.fs_used_bytes || 0);
    disk = {
      used_gb: Math.round((used / 1024 ** 3) * 100) / 100,
      included_gb: 8,
    };
  }

  return {
    disk,
    platform_note: diskRes.ok ? null : `Disk ${diskRes.status}: ${diskText.slice(0, 140)}`,
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
