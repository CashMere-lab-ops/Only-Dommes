import Mux from '@mux/mux-node';

let muxClient: Mux | null = null;

/** Clean Vercel-pasted private keys (quotes, newlines, accidental PEM wrapper) */
function cleanPrivateKey(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let k = String(raw).trim();
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1);
  }
  if (k.includes('BEGIN')) {
    k = k
      .replace(/-----BEGIN [^-]+-----/g, '')
      .replace(/-----END [^-]+-----/g, '')
      .replace(/\s+/g, '');
  } else {
    k = k.replace(/\s+/g, '');
  }
  return k || undefined;
}

export function getMux() {
  if (muxClient) return muxClient;

  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set');
  }

  const jwtSigningKey = process.env.MUX_SIGNING_KEY_ID?.trim();
  const jwtPrivateKey = cleanPrivateKey(process.env.MUX_PRIVATE_KEY);

  muxClient = new Mux({
    tokenId: tokenId.trim(),
    tokenSecret: tokenSecret.trim(),
    ...(jwtSigningKey && jwtPrivateKey
      ? {
          jwtSigningKey,
          jwtPrivateKey,
        }
      : {}),
  });

  return muxClient;
}

export function normalizePlaybackId(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const fromUrl = s.match(/stream\.mux\.com\/([A-Za-z0-9]+)/);
  if (fromUrl?.[1]) return fromUrl[1];
  if (s.includes('://')) return null;
  return s.split('?')[0].replace(/\.m3u8$/i, '');
}

export function muxPlaybackUrl(playbackId: string, token?: string) {
  if (token) {
    return `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
  }
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

export function muxThumbnailUrl(playbackId: string, time = 1) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${time}`;
}

export function muxSigningConfigured() {
  return !!(
    process.env.MUX_SIGNING_KEY_ID?.trim() &&
    cleanPrivateKey(process.env.MUX_PRIVATE_KEY)
  );
}

export async function signFullPlayback(playbackId: string) {
  const mux = getMux();
  return mux.jwt.signPlaybackId(playbackId, {
    expiration: '6h',
    type: 'video',
  });
}

/** 15s teaser only — window is inside the JWT claims */
export async function signPreviewPlayback(playbackId: string) {
  const mux = getMux();
  return mux.jwt.signPlaybackId(playbackId, {
    expiration: '2h',
    type: 'video',
    params: {
      asset_start_time: 0,
      asset_end_time: 15,
    },
  } as any);
}

export async function signThumbnail(playbackId: string, time = 1) {
  const mux = getMux();
  return mux.jwt.signPlaybackId(playbackId, {
    expiration: '6h',
    type: 'thumbnail',
    params: { time },
  } as any);
}

export async function getPlaybackPolicy(
  playbackId: string,
  assetId?: string | null
): Promise<'signed' | 'public'> {
  try {
    const mux = getMux();
    if (assetId) {
      const asset = await mux.video.assets.retrieve(assetId);
      const match =
        asset.playback_ids?.find((p) => p.id === playbackId) ||
        asset.playback_ids?.[0];
      if (match?.policy === 'signed') return 'signed';
      return 'public';
    }
  } catch {
    /* fall through */
  }
  return 'public';
}
