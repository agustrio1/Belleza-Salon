import { z } from "zod";
import type { Route } from "./+types/media-api";
import { requireAdmin } from "~/lib/session.server";
import {
  deleteMedia,
  listMedia,
  renameMedia,
  uploadMedia,
  type MediaItem,
} from "~/lib/media-library.server";

const idSchema = z.string().uuid();

const renameInput = z.object({
  id: z.string().uuid(),
  nama: z.string().trim().min(1, "Nama wajib diisi").max(80, "Nama maksimal 80 karakter"),
  alt: z.string().trim().max(200, "Teks alternatif maksimal 200 karakter"),
});

function fail(error: string) {
  return { error, item: null as MediaItem | null };
}

function done(item: MediaItem | null = null) {
  return { error: null as string | null, item };
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return { items: await listMedia(q) };
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "upload") {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return fail("Pilih file gambar terlebih dulu.");
    }
    const result = await uploadMedia(file, admin.id);
    return result.ok ? done(result.item) : fail(result.error);
  }

  if (intent === "rename") {
    const parsed = renameInput.safeParse({
      id: form.get("id"),
      nama: form.get("nama") ?? "",
      alt: form.get("alt") ?? "",
    });
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Isian tidak valid.");
    }
    const result = await renameMedia(parsed.data.id, parsed.data.nama, parsed.data.alt);
    return result.ok ? done() : fail(result.error);
  }

  if (intent === "delete") {
    const id = idSchema.safeParse(form.get("id"));
    if (!id.success) return fail("Gambar tidak ditemukan.");
    const result = await deleteMedia(id.data);
    return result.ok ? done() : fail(result.error);
  }

  return fail("Aksi tidak dikenal.");
}