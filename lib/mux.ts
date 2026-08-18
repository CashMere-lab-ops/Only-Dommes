import Mux from '@mux/mux-node';

let muxClient: Mux | null = null;

export function getMux() {
  if (muxClient) return muxClient;

  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set');
  }

  const jwtSigningKey = process.env.MUX_SIGNING_KEY_ID;
  const jwtPrivateKey = process.env.MUX_PRIVATE_KEY;

  muxClient = new Mux({
    tokenId,
    tokenSecret,
    ...(jwtSigningKey && jwtPrivateKey
      ? {
          jwtSigningKey,
          jwtPrivateKey,
        }
      : {}),
  });

  return muxClient;
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
  return !!(process.env.MUX_SIGNING_KEY_ID && process.env.MUX_PRIVATE_KEY);
}

export async function signFullPlayback(playbackId: string) {
  const mux = getMux();
  return mux.jwt.signPlaybackId(playbackId, {
    expiration: '6h',
    type: 'video',
  });
}

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
