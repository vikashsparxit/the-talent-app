const AVATAR_MAX_DIMENSION = 512;
const AVATAR_MAX_BYTES = 500 * 1024;
const AVATAR_OUTPUT_TYPE = 'image/jpeg';

const ALLOWED_INPUT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
const ALLOWED_INPUT_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export function isAllowedAvatarInput(file: File): boolean {
  if (file.type && ALLOWED_INPUT_TYPES.has(file.type)) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return !!ext && ALLOWED_INPUT_EXTS.has(ext);
}

export async function prepareAvatarImage(file: File): Promise<Blob> {
  if (!isAllowedAvatarInput(file)) {
    throw new Error('Please upload a JPEG, PNG, or WebP image');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > AVATAR_MAX_DIMENSION ? AVATAR_MAX_DIMENSION / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process image');

    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.85;
    let blob: Blob | null = null;
    while (quality >= 0.4) {
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, AVATAR_OUTPUT_TYPE, quality);
      });
      if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
      quality -= 0.1;
    }

    throw new Error('Image is too large even after compression. Try a smaller photo.');
  } finally {
    bitmap.close();
  }
}

export function avatarUploadErrorMessage(err: Error & { statusCode?: string | number }): string {
  const msg = (err.message ?? '').toLowerCase();
  const status = String(err.statusCode ?? '');

  if (
    status === '413' ||
    msg.includes('413') ||
    msg.includes('entity too large') ||
    msg.includes('payload too large')
  ) {
    return 'Photo exceeds the server upload limit. Try a smaller image, or ask an admin to raise client_max_body_size on the Supabase nginx gateway.';
  }
  if (msg.includes('cors') || msg.includes('failed to fetch') || msg.includes('networkerror')) {
    return 'Upload blocked by CORS on the Supabase storage host. An admin must allow ' + window.location.origin + ' in Kong/nginx CORS headers for /storage/v1/.';
  }
  if (msg.includes('row-level security') || status === '403' || msg.includes('unauthorized')) {
    return 'Permission denied. Ensure the avatars bucket migration ran and you are signed in.';
  }
  if (msg.includes('mime') || msg.includes('not allowed') || msg.includes('invalid')) {
    return 'Image format not allowed. Use JPEG, PNG, or WebP.';
  }
  if (/bucket not found/i.test(err.message)) {
    return 'Avatar storage is not set up yet. Ask an admin to run the avatars migration on the database.';
  }
  return err.message || 'Upload failed';
}
