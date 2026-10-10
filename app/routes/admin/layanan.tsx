import { Form, Link, redirect, useNavigation } from "react-router";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/layanan";
import { db, services } from "~/db/index.server";
import { requireAdmin } from "~/lib/session.server";
import { formatRupiah } from "~/lib/time";

export function meta() {
  return [{ title: "Layanan — Admin Belleza" }];
}

const idSchema = z.string().uuid();

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const editParam = new URL(request.url).searchParams.get("edit") ?? "";
  const list = await db
    .select()
    .from(services)
    .orderBy(asc(services.sortOrder), asc(services.name));

  const editId = idSchema.safeParse(editParam);
  const editing = editId.success
    ? (list.find((s) => s.id === editId.data) ?? null)
    : null;

  return { list, editing };
}

const serviceInput = z.object({
  nama: z
    .string()
    .trim()
    .min(2, "Nama minimal 2 karakter")
    .max(80, "Nama maksimal 80 karakter"),
  deskripsi: z.string().trim().max(500, "Deskripsi maksimal 500 karakter"),
  harga: z.coerce
    .number()
    .int("Harga harus bilangan bulat")
    .min(1000, "Harga minimal Rp1.000")
    .max(100_000_000, "Harga terlalu besar"),
  durasi: z.coerce
    .number()
    .int("Durasi harus bilangan bulat")
    .min(5, "Durasi minimal 5 menit")
    .max(480, "Durasi maksimal 480 menit"),
  urutan: z.coerce
    .number()
    .int("Urutan harus bilangan bulat")
    .min(0, "Urutan minimal 0")
    .max(9999, "Urutan maksimal 9999"),
  gambar: z
    .string()
    .trim()
    .max(500, "URL gambar terlalu panjang")
    .refine(
      (v) => v === "" || /^https?:\/\//i.test(v),
      "URL gambar harus diawali http:// atau https://"
    ),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function fail(error: string, fieldErrors: Record<string, string> = {}) {
  return { error, fieldErrors };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "toggle") {
    const id = idSchema.safeParse(form.get("id"));
    if (!id.success) return fail("Layanan tidak ditemukan.");
    const aktif = form.get("aktif") === "1";

    await db
      .update(services)
      .set({ isActive: aktif, updatedAt: new Date() })
      .where(eq(services.id, id.data));
    return redirect("/admin/layanan");
  }

  if (intent !== "save") return fail("Aksi tidak dikenal.");

  const parsed = serviceInput.safeParse({
    nama: form.get("nama") ?? "",
    deskripsi: form.get("deskripsi") ?? "",
    harga: form.get("harga") ?? "",
    durasi: form.get("durasi") ?? "",
    urutan: form.get("urutan") ?? "",
    gambar: form.get("gambar") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return fail("Periksa kembali isian kamu.", fieldErrors);
  }

  const d = parsed.data;
  const values = {
    name: d.nama,
    description: d.deskripsi,
    price: d.harga,
    durationMinutes: d.durasi,
    sortOrder: d.urutan,
    imageUrl: d.gambar || null,
    updatedAt: new Date(),
  };

  try {
    const idRaw = String(form.get("id") ?? "");

    if (idRaw) {
      const id = idSchema.safeParse(idRaw);
      if (!id.success) return fail("Layanan tidak ditemukan.");

      const updated = await db
        .update(services)
        .set(values)
        .where(eq(services.id, id.data))
        .returning({ id: services.id });
      if (updated.length === 0) return fail("Layanan tidak ditemukan.");
    } else {
      const slug = slugify(d.nama);
      if (!slug) {
        return fail("Periksa kembali isian kamu.", {
          nama: "Nama harus mengandung huruf atau angka",
        });
      }

      const [exists] = await db
        .select({ id: services.id })
        .from(services)
        .where(eq(services.slug, slug))
        .limit(1);
      if (exists) {
        return fail("Periksa kembali isian kamu.", {
          nama: "Sudah ada layanan dengan nama yang mirip",
        });
      }

      await db.insert(services).values({ ...values, slug });
    }
  } catch (err) {
    console.error("simpan layanan gagal:", err);
    return fail("Terjadi kesalahan saat menyimpan. Silakan coba lagi.");
  }

  return redirect("/admin/layanan");
}

const inputClass =
  "mt-1 w-full rounded-lg border border-blush-200 bg-white px-3 py-2 text-sm";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-700">{message}</p>;
}

export default function AdminLayanan({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { list, editing } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const fe = actionData?.fieldErrors ?? {};

  return (
    <div>
      <h1 className="text-2xl md:text-3xl">Kelola Layanan</h1>

      <section className="mt-6 rounded-2xl border border-blush-100 bg-white p-5">
        <h2 className="text-lg">{editing ? "Edit layanan" : "Tambah layanan"}</h2>
        {editing && (
          <p className="mt-1 text-xs text-plum-500">
            Perubahan harga dan durasi hanya berlaku untuk booking baru. Booking
            yang sudah ada tidak berubah.
          </p>
        )}

        <Form
          method="post"
          key={editing?.id ?? "baru"}
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <input type="hidden" name="intent" value="save" />
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <div className="md:col-span-2">
            <label htmlFor="nama" className="text-sm font-medium">Nama layanan</label>
            <input
              id="nama"
              name="nama"
              type="text"
              required
              maxLength={80}
              defaultValue={editing?.name ?? ""}
              className={inputClass}
            />
            <FieldError message={fe.nama} />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="deskripsi" className="text-sm font-medium">Deskripsi</label>
            <textarea
              id="deskripsi"
              name="deskripsi"
              rows={3}
              maxLength={500}
              defaultValue={editing?.description ?? ""}
              className={inputClass}
            />
            <FieldError message={fe.deskripsi} />
          </div>

          <div>
            <label htmlFor="harga" className="text-sm font-medium">Harga (Rupiah)</label>
            <input
              id="harga"
              name="harga"
              type="number"
              inputMode="numeric"
              required
              min={1000}
              step={1000}
              defaultValue={editing?.price ?? ""}
              className={inputClass}
            />
            <FieldError message={fe.harga} />
          </div>

          <div>
            <label htmlFor="durasi" className="text-sm font-medium">Durasi (menit)</label>
            <input
              id="durasi"
              name="durasi"
              type="number"
              inputMode="numeric"
              required
              min={5}
              max={480}
              step={5}
              defaultValue={editing?.durationMinutes ?? ""}
              className={inputClass}
            />
            <FieldError message={fe.durasi} />
          </div>

          <div>
            <label htmlFor="urutan" className="text-sm font-medium">Urutan tampil</label>
            <input
              id="urutan"
              name="urutan"
              type="number"
              inputMode="numeric"
              required
              min={0}
              max={9999}
              defaultValue={editing?.sortOrder ?? list.length + 1}
              className={inputClass}
            />
            <FieldError message={fe.urutan} />
          </div>

          <div>
            <label htmlFor="gambar" className="text-sm font-medium">URL gambar (opsional)</label>
            <input
              id="gambar"
              name="gambar"
              type="url"
              defaultValue={editing?.imageUrl ?? ""}
              className={inputClass}
            />
            <FieldError message={fe.gambar} />
          </div>

          {actionData?.error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 md:col-span-2"
            >
              {actionData.error}
            </p>
          )}

          <div className="flex gap-3 md:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-plum-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-60"
            >
              {busy ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Layanan"}
            </button>
            {editing && (
              <Link
                to="/admin/layanan"
                className="rounded-full border border-blush-200 px-6 py-2.5 text-sm font-medium transition-colors hover:bg-blush-50"
              >
                Batal
              </Link>
            )}
          </div>
        </Form>
      </section>

      <div className="mt-6">
        {list.length === 0 ? (
          <p className="rounded-xl border border-blush-100 bg-white p-6 text-sm text-plum-500">
            Belum ada layanan.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-blush-100 bg-white">
            <table className="w-full min-w-170 text-left text-sm">
              <thead className="border-b border-blush-100 text-xs uppercase tracking-wide text-plum-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Urutan</th>
                  <th className="px-4 py-3 font-medium">Layanan</th>
                  <th className="px-4 py-3 font-medium">Harga</th>
                  <th className="px-4 py-3 font-medium">Durasi</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blush-100">
                {list.map((s) => (
                  <tr key={s.id} className={s.isActive ? "" : "opacity-60"}>
                    <td className="px-4 py-3">{s.sortOrder}</td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{s.name}</span>
                      <span className="font-mono text-xs text-plum-500">{s.slug}</span>
                    </td>
                    <td className="px-4 py-3">{formatRupiah(s.price)}</td>
                    <td className="px-4 py-3">{s.durationMinutes} menit</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          s.isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-plum-500/15 text-plum-700"
                        }`}
                      >
                        {s.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/admin/layanan?edit=${s.id}`}
                          className="text-blush-600 hover:underline"
                        >
                          Edit
                        </Link>
                        <Form method="post">
                          <input type="hidden" name="intent" value="toggle" />
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="aktif" value={s.isActive ? "0" : "1"} />
                          <button
                            type="submit"
                            disabled={busy}
                            className="text-plum-500 hover:text-plum-900 disabled:opacity-60"
                          >
                            {s.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}