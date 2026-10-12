import { useState } from "react";
import { Form, redirect, useNavigation } from "react-router";
import { asc, eq } from "drizzle-orm";
import type { Route } from "./+types/booking";
import { db, services } from "~/db/index.server";
import { getAvailableSlots, getBookableStaff } from "~/lib/availability.server";
import { bookingInput, createBooking } from "~/lib/booking.server";
import {
  addDays,
  formatRupiah,
  formatTanggalStr,
  isValidDateStr,
  MAX_DAYS_AHEAD,
  todayJakarta,
} from "~/lib/time";

export function meta() {
  return [{ title: "Booking — Belleza Salon" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("layanan") ?? "";
  const tanggalParam = url.searchParams.get("tanggal") ?? "";
  const stafParam = url.searchParams.get("staf") ?? "";

  const daftar = await db
    .select({
      id: services.id,
      slug: services.slug,
      name: services.name,
      description: services.description,
      price: services.price,
      durationMinutes: services.durationMinutes,
    })
    .from(services)
    .where(eq(services.isActive, true))
    .orderBy(asc(services.sortOrder));

  const selected = daftar.find((s) => s.slug === slug) ?? null;

  const today = todayJakarta();
  const maxDate = addDays(today, MAX_DAYS_AHEAD);
  const dateOk =
    isValidDateStr(tanggalParam) && tanggalParam >= today && tanggalParam <= maxDate;
  const tanggal = dateOk ? tanggalParam : "";

  // Terapis yang bisa dipilih untuk layanan ini. Kosong kalau belum ada staf terjadwal,
  // dan pada kasus itu halaman berperilaku seperti sebelum fitur staf.
  const staffOptions = selected ? await getBookableStaff(selected.id) : [];

  // Pilihan staf dari layanan lain atau yang tidak valid dianggap "siapa saja".
  const staf = staffOptions.some((s) => s.id === stafParam) ? stafParam : "any";

  const slots =
    selected && tanggal
      ? await getAvailableSlots(tanggal, selected.durationMinutes, {
          serviceId: selected.id,
          staffId: staf === "any" ? null : staf,
        })
      : null;

  return { daftar, selected, tanggal, today, maxDate, slots, staffOptions, staf };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const get = (k: string) => String(form.get(k) ?? "");

  const parsed = bookingInput.safeParse({
    layanan: get("layanan"),
    tanggal: get("tanggal"),
    jam: get("jam"),
    staf: get("staf"),
    nama: get("nama"),
    whatsapp: get("whatsapp"),
    catatan: get("catatan"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Periksa kembali isian kamu.", fieldErrors };
  }

  const result = await createBooking(parsed.data);
  if (!result.ok) {
    return { error: result.error, fieldErrors: {} as Record<string, string> };
  }

  return redirect(`/booking/sukses?kode=${encodeURIComponent(result.code)}`);
}

type ServiceInfo = {
  slug: string;
  name: string;
  price: number;
  durationMinutes: number;
};

type StaffOption = { id: string; name: string };

const inputClass =
  "mt-1 w-full rounded-lg border border-blush-200 bg-white px-3 py-2 text-sm";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-700">{message}</p>;
}

function BookingForm({
  service,
  tanggal,
  slots,
  staf,
  staffName,
  stepOffset,
  submitting,
  error,
  fieldErrors,
}: {
  service: ServiceInfo;
  tanggal: string;
  slots: string[];
  staf: string;
  // Nama terapis untuk ringkasan. Null kalau layanan ini tidak memakai pilihan terapis.
  staffName: string | null;
  // 1 kalau ada langkah "Pilih terapis", 0 kalau tidak ada.
  stepOffset: number;
  submitting: boolean;
  error?: string;
  fieldErrors: Record<string, string>;
}) {
  const [jamDipilih, setJamDipilih] = useState("");
  const jam = slots.includes(jamDipilih) ? jamDipilih : "";

  return (
    <Form method="post" className="space-y-6">
      <input type="hidden" name="layanan" value={service.slug} />
      <input type="hidden" name="tanggal" value={tanggal} />
      <input type="hidden" name="staf" value={staf} />

      <fieldset>
        <legend className="text-sm font-medium">{3 + stepOffset}. Pilih jam</legend>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {slots.map((s) => (
            <label key={s} className="block cursor-pointer">
              <input
                type="radio"
                name="jam"
                value={s}
                checked={jam === s}
                onChange={() => setJamDipilih(s)}
                className="peer sr-only"
              />
              <span className="block rounded-lg border border-blush-200 bg-white py-2 text-center text-sm transition-colors peer-checked:border-plum-900 peer-checked:bg-plum-900 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-blush-600">
                {s}
              </span>
            </label>
          ))}
        </div>
        <FieldError message={fieldErrors.jam} />
      </fieldset>

      <div className="space-y-4">
        <p className="text-sm font-medium">{4 + stepOffset}. Data kamu</p>
        <div>
          <label htmlFor="nama" className="text-sm">Nama</label>
          <input
            id="nama"
            name="nama"
            type="text"
            required
            maxLength={80}
            autoComplete="name"
            className={inputClass}
          />
          <FieldError message={fieldErrors.nama} />
        </div>
        <div>
          <label htmlFor="whatsapp" className="text-sm">Nomor WhatsApp</label>
          <input
            id="whatsapp"
            name="whatsapp"
            type="tel"
            inputMode="tel"
            required
            autoComplete="tel"
            placeholder="08123456789"
            className={inputClass}
          />
          <FieldError message={fieldErrors.whatsapp} />
        </div>
        <div>
          <label htmlFor="catatan" className="text-sm">Catatan (opsional)</label>
          <textarea
            id="catatan"
            name="catatan"
            rows={3}
            maxLength={300}
            className={inputClass}
          />
          <FieldError message={fieldErrors.catatan} />
        </div>
      </div>

      <div className="rounded-xl border border-blush-100 bg-white p-5">
        <p className="text-sm font-medium">{5 + stepOffset}. Ringkasan</p>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-plum-500">Layanan</dt>
            <dd className="text-right">{service.name}</dd>
          </div>
          {staffName && (
            <div className="flex justify-between gap-4">
              <dt className="text-plum-500">Terapis</dt>
              <dd className="text-right">{staffName}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-plum-500">Tanggal</dt>
            <dd className="text-right">{formatTanggalStr(tanggal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-plum-500">Jam</dt>
            <dd className="text-right">{jam || "Belum dipilih"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-plum-500">Durasi</dt>
            <dd className="text-right">{service.durationMinutes} menit</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-blush-100 pt-2 font-semibold">
            <dt>Harga</dt>
            <dd>{formatRupiah(service.price)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-plum-500">
          Reservasi akan berstatus menunggu konfirmasi dari admin salon.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !jam}
        className="w-full rounded-full bg-plum-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-50"
      >
        {submitting ? "Memproses..." : "Kirim Reservasi"}
      </button>
    </Form>
  );
}

function StaffPicker({
  serviceSlug,
  staffOptions,
  staf,
}: {
  serviceSlug: string;
  staffOptions: StaffOption[];
  staf: string;
}) {
  const choices = [{ id: "any", name: "Siapa saja" }, ...staffOptions];

  return (
    // key: pilihan di-reset setiap ganti layanan
    <fieldset key={serviceSlug}>
      <legend className="text-sm font-medium">3. Pilih terapis</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {choices.map((c) => (
          <label key={c.id} className="block cursor-pointer">
            <input
              type="radio"
              name="staf"
              value={c.id}
              defaultChecked={staf === c.id}
              className="peer sr-only"
            />
            <span className="block rounded-xl border border-blush-200 bg-white p-4 text-sm transition-colors peer-checked:border-plum-900 peer-checked:bg-blush-50 peer-focus-visible:outline-2 peer-focus-visible:outline-blush-600">
              <span className="block font-medium">{c.name}</span>
              {c.id === "any" && (
                <span className="mt-1 block text-xs text-plum-500">
                  Salon yang pilihkan terapis yang kosong
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function Booking({ loaderData, actionData }: Route.ComponentProps) {
  const { daftar, selected, tanggal, today, maxDate, slots, staffOptions, staf } =
    loaderData;
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const hasStaff = staffOptions.length > 0;
  const staffName = hasStaff
    ? staf === "any"
      ? "Siapa saja"
      : (staffOptions.find((s) => s.id === staf)?.name ?? "Siapa saja")
    : null;

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="text-3xl md:text-4xl">Booking</h1>
      <p className="mt-2 text-plum-500">
        Pilih layanan dan tanggal, lalu pilih jam yang tersedia.
      </p>

      <Form
        method="get"
        preventScrollReset
        replace
        onChange={(e) => e.currentTarget.requestSubmit()}
        className="mt-8 space-y-6"
      >
        <fieldset>
          <legend className="text-sm font-medium">1. Pilih layanan</legend>
          {daftar.length === 0 ? (
            <p className="mt-3 text-sm text-plum-500">Belum ada layanan yang tersedia.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {daftar.map((s) => (
                <label key={s.slug} className="block cursor-pointer">
                  <input
                    type="radio"
                    name="layanan"
                    value={s.slug}
                    defaultChecked={selected?.slug === s.slug}
                    className="peer sr-only"
                  />
                  <span className="block rounded-xl border border-blush-200 bg-white p-4 transition-colors peer-checked:border-plum-900 peer-checked:bg-blush-50 peer-focus-visible:outline-2 peer-focus-visible:outline-blush-600">
                    <span className="block font-medium">{s.name}</span>
                    <span className="mt-1 block text-xs text-plum-500">
                      {formatRupiah(s.price)} · {s.durationMinutes} menit
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor="tanggal" className="text-sm font-medium">2. Pilih tanggal</label>
          <input
            id="tanggal"
            name="tanggal"
            type="date"
            min={today}
            max={maxDate}
            defaultValue={tanggal}
            className={inputClass + " sm:max-w-xs"}
          />
        </div>

        {selected && hasStaff && (
          <StaffPicker
            serviceSlug={selected.slug}
            staffOptions={staffOptions}
            staf={staf}
          />
        )}
      </Form>

      <div className="mt-8">
        {!selected ? (
          <p className="text-sm text-plum-500">Pilih layanan dulu untuk melihat jam tersedia.</p>
        ) : !tanggal ? (
          <p className="text-sm text-plum-500">Pilih tanggal untuk melihat jam tersedia.</p>
        ) : slots && slots.length === 0 ? (
          <p className="rounded-xl border border-blush-100 bg-white p-5 text-sm text-plum-500">
            Tidak ada jam tersedia di tanggal ini (salon tutup atau jadwal penuh).{" "}
            {hasStaff && staf !== "any"
              ? "Coba tanggal lain atau pilih \"Siapa saja\"."
              : "Coba tanggal lain."}
          </p>
        ) : slots ? (
          <BookingForm
            key={`${selected.slug}-${tanggal}-${staf}`}
            service={selected}
            tanggal={tanggal}
            slots={slots}
            staf={staf}
            staffName={staffName}
            stepOffset={hasStaff ? 1 : 0}
            submitting={submitting}
            error={actionData?.error}
            fieldErrors={actionData?.fieldErrors ?? {}}
          />
        ) : null}
      </div>
    </section>
  );
}