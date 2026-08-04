/**
 * Create a smaller JPEG thumbnail from an image File in the browser.
 * maxWidth default 800px, quality ~0.72 — good for feeds, saves egress.
 */
export async function createImageThumbnail(
  file: File,
  maxWidth = 800,
  quality = 0.72
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Could not create thumbnail');
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Thumbnail encode failed'))),
      'image/jpeg',
      quality
    );
  });

  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}-thumb.jpg`, { type: 'image/jpeg' });
}
