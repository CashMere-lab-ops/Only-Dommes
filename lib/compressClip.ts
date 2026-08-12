/**
 * Fast browser compress for paid clips (ffmpeg.wasm).
 * Prioritises SPEED over perfect quality:
 * - big files → 720p + ultrafast
 * - medium files → 1080p + veryfast
 * Still looks good on phones / web players.
 */

export type CompressClipResult = {
  file: File;
  compressed: boolean;
  originalMB: number;
  finalMB: number;
};

export type CompressClipOptions = {
  /** Force max height (default auto by file size) */
  maxHeight?: number;
  /** CRF 18–28 (default auto: 26 fast / 24 medium) */
  crf?: number;
  /** Skip compress and return original */
  skip?: boolean;
  onProgress?: (pct: number) => void;
  onStatus?: (msg: string) => void;
};

let ffmpegInstance: any = null;
let ffmpegLoading: Promise<any> | null = null;

async function getFFmpeg(onStatus?: (msg: string) => void) {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    onStatus?.('Loading video engine (one-time)…');
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ffmpeg = new FFmpeg();

    const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoading;
  } catch (e) {
    ffmpegLoading = null;
    throw e;
  }
}

/**
 * Fast compress for the paid clip store.
 * Designed so a ~15 min phone video finishes in ~1–3 min on a normal PC
 * (not 8+ minutes).
 */
export async function compressClip(
  file: File,
  opts: CompressClipOptions = {}
): Promise<CompressClipResult> {
  const originalMB = file.size / (1024 * 1024);

  if (opts.skip) {
    return { file, compressed: false, originalMB, finalMB: originalMB };
  }

  // Already small enough — upload as-is
  if (file.size < 40 * 1024 * 1024) {
    return { file, compressed: false, originalMB, finalMB: originalMB };
  }

  if (typeof window === 'undefined') {
    return { file, compressed: false, originalMB, finalMB: originalMB };
  }

  // Auto profile by size (speed first)
  // >120MB → 720p ultrafast (big win on 15 min phone files)
  // else   → 1080p veryfast
  const big = file.size >= 120 * 1024 * 1024;
  const maxHeight = opts.maxHeight ?? (big ? 720 : 1080);
  const crf = opts.crf ?? (big ? 26 : 24);
  const preset = big ? 'ultrafast' : 'veryfast';
  const audioBitrate = big ? '128k' : '160k';

  try {
    const ffmpeg = await getFFmpeg(opts.onStatus);
    const { fetchFile } = await import('@ffmpeg/util');

    opts.onStatus?.('Reading video…');
    opts.onProgress?.(5);

    const inputName = 'input' + extOf(file);
    const outputName = 'output.mp4';

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    ffmpeg.on('progress', ({ progress }: { progress: number }) => {
      const pct = Math.min(95, Math.max(8, Math.round(progress * 100)));
      opts.onProgress?.(pct);
    });

    opts.onStatus?.(
      big
        ? 'Fast compress (720p)…'
        : 'Fast compress (1080p)…'
    );

    // -threads 0 = use all cores available in wasm
    // ultrafast/veryfast = much quicker encode
    // CRF 24–26 still looks solid on mobile
    await ffmpeg.exec([
      '-i',
      inputName,
      '-vf',
      `scale=-2:'min(${maxHeight},ih)'`,
      '-c:v',
      'libx264',
      '-preset',
      preset,
      '-crf',
      String(crf),
      '-threads',
      '0',
      '-c:a',
      'aac',
      '-b:a',
      audioBitrate,
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      '-y',
      outputName,
    ]);

    opts.onProgress?.(97);
    opts.onStatus?.('Finishing…');

    const data = await ffmpeg.readFile(outputName);
    const bytes =
      data instanceof Uint8Array
        ? data
        : new TextEncoder().encode(String(data));
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);

    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch {
      /* ignore */
    }

    const blob = new Blob([copy], { type: 'video/mp4' });
    const finalMB = blob.size / (1024 * 1024);

    if (blob.size >= file.size * 0.95) {
      opts.onProgress?.(100);
      return { file, compressed: false, originalMB, finalMB: originalMB };
    }

    const base = file.name.replace(/\.[^.]+$/, '') || 'clip';
    const label = maxHeight <= 720 ? '720p' : '1080p';
    const out = new File([blob], `${base}-${label}.mp4`, { type: 'video/mp4' });
    opts.onProgress?.(100);
    opts.onStatus?.('Done');
    return { file: out, compressed: true, originalMB, finalMB };
  } catch (err) {
    console.warn('Clip compress failed, using original', err);
    opts.onStatus?.('Compress skipped — uploading original');
    return { file, compressed: false, originalMB, finalMB: originalMB };
  }
}

function extOf(file: File) {
  const n = file.name.split('.').pop()?.toLowerCase();
  if (n === 'mov' || n === 'webm' || n === 'mkv' || n === 'm4v') return '.' + n;
  return '.mp4';
}
