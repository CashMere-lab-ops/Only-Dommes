/**
 * Compress long paid clips in the browser with ffmpeg.wasm.
 * Target: max 1080p, high quality (CRF ~22), H.264 + AAC.
 */

export type CompressClipResult = {
  file: File;
  compressed: boolean;
  originalMB: number;
  finalMB: number;
};

export type CompressClipOptions = {
  maxHeight?: number;
  crf?: number;
  onProgress?: (pct: number) => void;
  onStatus?: (msg: string) => void;
};

let ffmpegInstance: any = null;
let ffmpegLoading: Promise<any> | null = null;

async function getFFmpeg(onStatus?: (msg: string) => void) {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    onStatus?.('Loading video engine…');
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

export async function compressClip(
  file: File,
  opts: CompressClipOptions = {}
): Promise<CompressClipResult> {
  const maxHeight = opts.maxHeight ?? 1080;
  const crf = opts.crf ?? 22;
  const originalMB = file.size / (1024 * 1024);

  if (file.size < 15 * 1024 * 1024) {
    return { file, compressed: false, originalMB, finalMB: originalMB };
  }

  if (typeof window === 'undefined') {
    return { file, compressed: false, originalMB, finalMB: originalMB };
  }

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

    opts.onStatus?.('Compressing (good quality 1080p)…');

    await ffmpeg.exec([
      '-i', inputName,
      '-vf', `scale=-2:'min(${maxHeight},ih)'`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', String(crf),
      '-c:a', 'aac',
      '-b:a', '160k',
      '-movflags', '+faststart',
      '-y', outputName,
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
    } catch { /* ignore */ }

    const blob = new Blob([copy], { type: 'video/mp4' });
    const finalMB = blob.size / (1024 * 1024);

    if (blob.size >= file.size * 0.92) {
      opts.onProgress?.(100);
      return { file, compressed: false, originalMB, finalMB: originalMB };
    }

    const base = file.name.replace(/\.[^.]+$/, '') || 'clip';
    const out = new File([blob], `${base}-1080p.mp4`, { type: 'video/mp4' });
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