import Mux from '@mux/mux-node';

let muxClient: Mux | null = null;

export function getMux() {
  if (muxClient) return muxClient;

  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set');
  }

  muxClient = new Mux({
    tokenId,
    tokenSecret,
  });

  return muxClient;
}

/** HLS playback URL from a Mux playback id */
export function muxPlaybackUrl(playbackId: string) {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

/** Thumbnail from Mux (time offset in seconds) */
export function muxThumbnailUrl(playbackId: string, time = 1) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${time}`;
}
