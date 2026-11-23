// src/core/mediaUploadHelper.ts
import { downloadBlob } from './downloadHelper';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'));
    reader.readAsDataURL(blob);
  });
}

async function convertImageToWebpIfNeeded(file: File, targetSrc: string): Promise<Blob> {
  if (!targetSrc.toLowerCase().endsWith('.webp')) return file;
  if (file.type === 'image/webp') return file;
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') return file;
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const webpBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.86),
    );
    if (webpBlob && webpBlob.type === 'image/webp') {
      return webpBlob;
    }
    return file;
  } catch {
    return file;
  }
}

export async function processAndUploadMediaFile(
  file: File,
  targetSrc: string,
  localUploadSupported: boolean,
): Promise<
  | { ok: true; mode: 'saved_local'; src: string; existingMediaPaths: string[] }
  | { ok: true; mode: 'downloaded_fallback'; filename: string }
  | { ok: false; error: string }
> {
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: 'File vượt quá giới hạn 10MB.' };
  }

  const preparedBlob = await convertImageToWebpIfNeeded(file, targetSrc);
  const filename = targetSrc.split('/').pop() || file.name;

  if (!localUploadSupported || !import.meta.env.DEV) {
    downloadBlob(filename, preparedBlob);
    return { ok: true, mode: 'downloaded_fallback', filename };
  }

  try {
    const dataBase64 = await blobToBase64(preparedBlob);
    const resp = await fetch('/__vbot-dev/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSrc,
        dataBase64,
        mimeType: preparedBlob.type || file.type,
      }),
    });
    const data = (await resp.json()) as {
      ok?: boolean;
      src?: string;
      existingMediaPaths?: string[];
      error?: string;
    };
    if (!resp.ok || !data.ok) {
      return { ok: false, error: data.error ?? 'Lưu media lên server local thất bại.' };
    }
    return {
      ok: true,
      mode: 'saved_local',
      src: data.src ?? targetSrc,
      existingMediaPaths: data.existingMediaPaths ?? [],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Lỗi kết nối upload local.',
    };
  }
}
