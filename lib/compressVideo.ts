/**
 * Browser-side video compress for Discover posts.
 * Caps resolution at 720p and re-encodes with MediaRecorder.
 * Best for short clips (≤15s). Falls back to original if compress fails.
 */

const MAX_WIDTH = 1280;
const MAX_HEIGHT = 720;
const TARGET_FPS = 30;

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return 'video/webm';
}

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      // seek to start so first frame is ready
      video.currentTime = 0;
    };
    video.onseeked = () => {
      resolve(video);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video'));
    };
    // some browsers fire loadeddata without seek
    video.onloadeddata = () => {
      if (video.readyState >= 2) resolve(video);
    };
    video.src = url;
  });
}

/**
 * Compress a video File to max 720p.
 * Returns a new File (usually webm). If browser can't encode, returns original.
 */
export async function compressVideoTo720p(
  file: File,
  opts?: { maxSeconds?: number; onProgress?: (pct: number) => void }
): Promise<{ file: File; compressed: boolean; width: number; height: number }> {
  const maxSeconds = opts?.maxSeconds ?? 15;

  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return { file, compressed: false, width: 0, height: 0 };
  }

  let video: HTMLVideoElement;
  try {
    video = await loadVideo(file);
  } catch {
    return { file, compressed: false, width: 0, height: 0 };
  }

  const duration = Math.min(video.duration || maxSeconds, maxSeconds);
  const srcW = video.videoWidth || 1280;
  const srcH = video.videoHeight || 720;

  // Already small enough? keep original to save time/quality
  const alreadySmall =
    srcW <= MAX_WIDTH &&
    srcH <= MAX_HEIGHT &&
    file.size <= 12 * 1024 * 1024; // under ~12MB
  if (alreadySmall) {
    URL.revokeObjectURL(video.src);
    return { file, compressed: false, width: srcW, height: srcH };
  }

  const scale = Math.min(1, MAX_WIDTH / srcW, MAX_HEIGHT / srcH);
  const w = Math.max(2, Math.round((srcW * scale) / 2) * 2);
  const h = Math.max(2, Math.round((srcH * scale) / 2) * 2);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(video.src);
    return { file, compressed: false, width: srcW, height: srcH };
  }

  const mimeType = pickMimeType();
  const stream = canvas.captureStream(TARGET_FPS);

  // try to include audio if present
  try {
    const anyVideo = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };
    const vStream =
      anyVideo.captureStream?.() || anyVideo.mozCaptureStream?.();
    const audioTracks = vStream?.getAudioTracks?.() || [];
    audioTracks.forEach((t) => stream.addTrack(t));
  } catch {
    // no audio — fine for many phone clips
  }

  const chunks: BlobPart[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000, // ~2.5 Mbps — solid 720p
    });
  } catch {
    URL.revokeObjectURL(video.src);
    return { file, compressed: false, width: srcW, height: srcH };
  }

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<File>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const base = file.name.replace(/\.[^.]+$/, '') || 'video';
      resolve(new File([blob], `${base}-720p.${ext}`, { type: blob.type }));
    };
    recorder.onerror = () => reject(new Error('Compress failed'));
  });

  recorder.start(200);

  // Draw frames while playing
  video.currentTime = 0;
  try {
    await video.play();
  } catch {
    // autoplay policies — still try stepping
  }

  const start = performance.now();
  const endMs = duration * 1000;

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (video.ended || video.currentTime >= duration - 0.05) {
        resolve();
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const elapsed = performance.now() - start;
      opts?.onProgress?.(Math.min(99, Math.round((elapsed / endMs) * 100)));
      requestAnimationFrame(tick);
    };
    // also stop on timer in case ended doesn't fire
    const safety = window.setTimeout(() => resolve(), endMs + 800);
    video.onended = () => {
      window.clearTimeout(safety);
      resolve();
    };
    tick();
  });

  ctx.drawImage(video, 0, 0, w, h);
  video.pause();
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  URL.revokeObjectURL(video.src);

  try {
    const out = await done;
    opts?.onProgress?.(100);
    // if compress made it bigger, keep original
    if (out.size >= file.size * 0.95) {
      return { file, compressed: false, width: srcW, height: srcH };
    }
    return { file: out, compressed: true, width: w, height: h };
  } catch {
    return { file, compressed: false, width: srcW, height: srcH };
  }
}
