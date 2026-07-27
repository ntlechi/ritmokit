/** Max data-URL length (~120 KB) — keeps roster payloads light. */
export const MAX_AVATAR_DATA_URL_LENGTH = 160_000;
export const AVATAR_OUTPUT_SIZE = 256;
export const AVATAR_JPEG_QUALITY = 0.82;

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function isValidAvatarDataUrl(value: string): boolean {
  if (!value.startsWith("data:image/")) return false;
  if (value.length > MAX_AVATAR_DATA_URL_LENGTH) return false;
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value);
}

/**
 * Center-crop to square + resize to AVATAR_OUTPUT_SIZE, export as JPEG data URL.
 * Runs in the browser only.
 */
export async function compressAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("invalid_type");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("file_too_large");
  }

  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.floor((bitmap.width - side) / 2);
  const sy = Math.floor((bitmap.height - side) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("canvas_unavailable");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY);
  if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
    const tighter = canvas.toDataURL("image/jpeg", 0.65);
    if (tighter.length > MAX_AVATAR_DATA_URL_LENGTH) {
      throw new Error("image_too_large");
    }
    return tighter;
  }
  return dataUrl;
}
