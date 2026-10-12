import { mediaUrl } from "./media.server";

// Urutan: gambar dari Media Library, lalu URL lama (fallback), lalu null.
export function serviceImageUrl(
  mediaKey: string | null,
  legacyUrl: string | null
): string | null {
  if (mediaKey) {
    const url = mediaUrl(mediaKey);
    if (url) return url;
  }
  return legacyUrl || null;
}