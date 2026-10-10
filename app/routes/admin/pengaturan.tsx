import { Form, useNavigation } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/pengaturan";
import { businessSettings, db } from "~/db/index.server";
import { requireAdmin } from "~/lib/session.server";

export function meta() {
  return [{ title: "Pengaturan — Admin Belleza" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const [row] = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);

  return {
    settings: {
      name: row?.name ?? "Belleza Salon",
      tagline: row?.tagline ?? "",
      address: row?.address ?? "",
      phone: row?.phone ?? "",
      slotIntervalMinutes: row?.slotIntervalMinutes ?? 30,
      minLeadMinutes: row?.minLeadMinutes ?? 60,
    },
  };
}

const settingsInput = z.object({
  nama: z
    .string()
    .trim()
    .min(2, "Nama minimal 2 karakter")
    .max(80, "Nama maksimal 80 karakter"),
  tagline: z.string().trim().max(160, "Tagline maksimal 160 karakter"),
  alamat: z.string().trim().max(200, "Alamat maksimal 200 karakter"),
  telepon: z
    .string()
    .trim()
    .max(30, "Nomor telepon terlalu panjang")
    .regex(/^[0-9+\-\s()]*$/, "Nomor telepon hanya boleh angka, spasi, +, -, ( )"),
  interval: z.coerce
    .number()
    .refine((v) => [15, 30, 60].includes(v), "Pilih 15, 30, atau 60 menit"),
  lead: z.coerce
    .number()
    .int("Harus bilangan bulat")
    .min(0, "Minimal 0 menit")
    .max(1440, "Maksimal 1440 menit (24 jam)"),
});

function result(
  error: string | null,
  saved: boolean,
  fieldErrors: Record<string, string> = {}
) {
  return { error, saved, fieldErrors };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);

  const form = await request.formData();
  const parsed = settingsInput.safeParse({
    nama: form.get("nama") ?? "",
    tagline: form.get("tagline") ?? "",
    alamat: form.get("alamat") ?? "",
    telepon: form.get("telepon") ?? "",
    interval: form.get("interval") ?? "",
    lead: form.get("lead") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return result("Periksa kembali isian kamu.", false, fieldErrors);
  }

  const d = parsed.data;
  const values = {
    name: d.nama,
    tagline: d.tagline,
    address: d.alamat,
    phone: d.telepon,
    slotIntervalMinutes: d.interval,
    minLeadMinutes: d.lead,
  };

  try {
    await db
      .insert(businessSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: businessSettings.id, set: values });
  } catch (err) {
    console.error("simpan pengaturan gagal:", err);
    return result("Terjadi kesalahan saat menyimpan. Silakan coba lagi.", false);
  }

  return result(null, true);
}

const inputClass =
  "mt-1 w-full rounded-lg border border-blush-200 bg-white px-3 py-2 text-sm";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-700">{message}</p>;
}

export default function AdminPengaturan({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { settings } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const fe = actionData?.fieldErrors ?? {};

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl md:text-3xl">Pengaturan</h1>
      <p className="mt-1 text-sm text-plum-500">Profil salon dan aturan slot booking.</p>

      <Form
        method="post"
        className="mt-6 space-y-4 rounded-2xl border border-blush-100 bg-white p-5"
      >
        <div>
          <label htmlFor="nama" className="text-sm font-medium">Nama salon</label>
          <input
            id="nama"
            name="nama"
            type="text"
            required
            maxLength={80}
            defaultValue={settings.name}
            className={inputClass}
          />
          <FieldError message={fe.nama} />
        </div>

        <div>
          <label htmlFor="tagline" className="text-sm font-medium">Tagline</label>
          <input
            id="tagline"
            name="tagline"
            type="text"
            maxLength={160}
            defaultValue={settings.tagline}
            className={inputClass}
          />
          <FieldError message={fe.tagline} />
        </div>

        <div>
          <label htmlFor="alamat" className="text-sm font-medium">Alamat</label>
          <input
            id="alamat"
            name="alamat"
            type="text"
            maxLength={200}
            defaultValue={settings.address}
            className={inputClass}
          />
          <FieldError message={fe.alamat} />
        </div>

        <div>
          <label htmlFor="telepon" className="text-sm font-medium">Telepon / WhatsApp salon</label>
          <input
            id="telepon"
            name="telepon"
            type="tel"
            maxLength={30}
            defaultValue={settings.phone}
            className={inputClass}
          />
          <FieldError message={fe.telepon} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="interval" className="text-sm font-medium">Interval slot</label>
            <select
              id="interval"
              name="interval"
              defaultValue={String(settings.slotIntervalMinutes)}
              className={inputClass}
            >
              <option value="15">Setiap 15 menit</option>
              <option value="30">Setiap 30 menit</option>
              <option value="60">Setiap 60 menit</option>
            </select>
            <FieldError message={fe.interval} />
          </div>

          <div>
            <label htmlFor="lead" className="text-sm font-medium">Batas pesan minimal (menit)</label>
            <input
              id="lead"
              name="lead"
              type="number"
              inputMode="numeric"
              required
              min={0}
              max={1440}
              step={15}
              defaultValue={settings.minLeadMinutes}
              className={inputClass}
            />
            <FieldError message={fe.lead} />
          </div>
        </div>
        <p className="text-xs text-plum-500">
          Batas pesan minimal: pelanggan tidak bisa memesan slot yang mulainya
          kurang dari sekian menit dari sekarang. Perubahan hanya berlaku untuk
          booking baru.
        </p>

        {actionData?.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Pengaturan disimpan.
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-plum-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-60"
        >
          {busy ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
      </Form>
    </div>
  );
}