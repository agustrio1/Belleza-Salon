import { desc, eq, ilike, inArray } from "drizzle-orm";
import { db, media, services } from "../db/index.server";
import {
  deleteObject,
  inspectImage,
  MAX_UPLOAD_BYTES,
  mediaUrl,
  newObjectKey,
  uploadObject,
} from "./media.server";

export type MediaItem = {
  id: string;
  name: string;
  altText: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  url: string | null;
  createdAt: Date;
  usedBy: string[]; // nama layanan yang memakai gambar ini
};

type Result = { ok: true } | { ok: false; error: string };
type UploadResult = { ok: true; item: MediaItem } | { ok: false; error: string };

const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"];
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

function toItem(row: typeof media.$inferSelect, usedBy: string[] = []): MediaItem {
  return {
    id: row.id,
    name: row.name,
    altText: row.altText,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    url: mediaUrl(row.objectKey),
    createdAt: row.createdAt,
    usedBy,
  };
}

function errText(err: unknown): string {
  if (!(err instanceof Error)) return "unknown error";
  return `${err.name}: ${err.message}\n${err.stack ?? ""}`;
}

export async function listMedia(q = ""): Promise<MediaItem[]> {
  const term = q.trim().slice(0, 50);
  const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`;

  const rows = await db
    .select()
    .from(media)
    .where(term ? ilike(media.name, like) : undefined)
    .orderBy(desc(media.createdAt))
    .limit(200);
  if (rows.length === 0) return [];

  const used = await db
    .select({ mediaId: services.imageMediaId, name: services.name })
    .from(services)
    .where(
      inArray(
        services.imageMediaId,
        rows.map((r) => r.id)
      )
    );

  const usedMap = new Map<string, string[]>();
  for (const u of used) {
    if (!u.mediaId) continue;
    const list = usedMap.get(u.mediaId) ?? [];
    list.push(u.name);
    usedMap.set(u.mediaId, list);
  }

  return rows.map((r) => toItem(r, usedMap.get(r.id) ?? []));
}

export async function uploadMedia(
  file: File,
  adminId: string | null
): Promise<UploadResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.includes(ext) || !ALLOWED_MIME.includes(file.type)) {
    return { ok: false, error: "Format file harus JPEG, PNG, atau WebP." };
  }
  if (file.size === 0) {
    return { ok: false, error: "File kosong." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `Ukuran file maksimal ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectImage(bytes);
  if (!info) {
    return {
      ok: false,
      error: "Isi file bukan gambar JPEG, PNG, atau WebP yang valid.",
    };
  }

  const key = newObjectKey(info.ext);
  try {
    await uploadObject(key, bytes, info.mime);
  } catch (err) {
    console.error("upload ke storage gagal:", errText(err));
    return {
      ok: false,
      error: "Gagal menyimpan gambar ke penyimpanan. Silakan coba lagi.",
    };
  }

  const baseName =
    file.name.replace(/\.[^.]+$/, "").trim().slice(0, 80) || "gambar";

  try {
    const [row] = await db
      .insert(media)
      .values({
        name: baseName,
        objectKey: key,
        mimeType: info.mime,
        sizeBytes: bytes.byteLength,
        width: info.width,
        height: info.height,
        uploadedBy: adminId,
      })
      .returning();
    return { ok: true, item: toItem(row) };
  } catch (err) {
    console.error("simpan metadata media gagal:", errText(err));
    // Hindari object tanpa metadata
    await deleteObject(key).catch((e) =>
      console.error("bersihkan object gagal:", errText(e))
    );
    return { ok: false, error: "Terjadi kesalahan saat menyimpan. Silakan coba lagi." };
  }
}

export async function renameMedia(
  id: string,
  name: string,
  altText: string
): Promise<Result> {
  const updated = await db
    .update(media)
    .set({ name, altText, updatedAt: new Date() })
    .where(eq(media.id, id))
    .returning({ id: media.id });
  if (updated.length === 0) return { ok: false, error: "Gambar tidak ditemukan." };
  return { ok: true };
}

export async function deleteMedia(id: string): Promise<Result> {
  const [used] = await db
    .select({ name: services.name })
    .from(services)
    .where(eq(services.imageMediaId, id))
    .limit(1);
  if (used) {
    return {
      ok: false,
      error: `Gambar masih dipakai layanan "${used.name}". Lepaskan dulu dari layanan itu.`,
    };
  }

  let key: string;
  try {
    // Foreign key menolak penghapusan kalau ada layanan yang memakai (race condition)
    const deleted = await db
      .delete(media)
      .where(eq(media.id, id))
      .returning({ key: media.objectKey });
    if (deleted.length === 0) return { ok: false, error: "Gambar tidak ditemukan." };
    key = deleted[0].key;
  } catch (err) {
    console.error("hapus media gagal:", errText(err));
    return {
      ok: false,
      error: "Gambar tidak bisa dihapus. Mungkin masih dipakai layanan.",
    };
  }

  // Kalau gagal di sini, yang tersisa hanya file yatim di bucket (tidak terlihat dan tidak berbahaya).
  await deleteObject(key).catch((err) =>
    console.error("hapus object gagal:", errText(err))
  );
  return { ok: true };
}