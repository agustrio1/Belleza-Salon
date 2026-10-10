import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { and, asc, count, gt, lt, ne, eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/jam-operasional";
import { blockedSlots, bookings, businessHours, db } from "~/db/index.server";
import { requireAdmin } from "~/lib/session.server";
import {
  addDays,
  formatJam,
  formatTanggal,
  isValidDateStr,
  jakartaToDate,
  todayJakarta,
} from "~/lib/time";

export function meta() {
  return [{ title: "Jam Operasional — Admin Belleza" }];
}

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_MS = 24 * 60 * 60 * 1000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const idSchema = z.string().uuid();

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const [hoursRows, blockedRows] = await Promise.all([
    db.select().from(businessHours),
    db
      .select()
      .from(blockedSlots)
      .where(gt(blockedSlots.endsAt, new Date()))
      .orderBy(asc(blockedSlots.startsAt)),
  ]);

  const hours = DISPLAY_ORDER.map((day) => {
    const row = hoursRows.find((h) => h.dayOfWeek === day);
    return {
      day,
      name: DAY_NAMES[day],
      open: row ? row.openTime.slice(0, 5) : "09:00",
      close: row ? row.closeTime.slice(0, 5) : "19:00",
      closed: row ? row.isClosed : false,
    };
  });

  const blocked = blockedRows.map((b) => ({
    id: b.id,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    reason: b.reason,
    allDay:
      b.endsAt.getTime() - b.startsAt.getTime() === DAY_MS &&
      (b.startsAt.getTime() + WIB_OFFSET_MS) % DAY_MS === 0,
  }));

  return { hours, blocked, today: todayJakarta() };
}

function fail(error: string) {
  return { error, notice: null as string | null };
}

function ok(notice: string) {
  return { error: null as string | null, notice };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "hours") {
    const rows: {
      dayOfWeek: number;
      openTime: string;
      closeTime: string;
      isClosed: boolean;
    }[] = [];

    for (let d = 0; d <= 6; d++) {
      const open = String(form.get(`open_${d}`) ?? "");
      const close = String(form.get(`close_${d}`) ?? "");
      const closed = form.get(`closed_${d}`) === "on";

      if (!TIME_RE.test(open) || !TIME_RE.test(close)) {
        return fail(`Jam hari ${DAY_NAMES[d]} tidak valid.`);
      }
      if (!closed && open >= close) {
        return fail(`${DAY_NAMES[d]}: jam tutup harus setelah jam buka.`);
      }
      rows.push({ dayOfWeek: d, openTime: open, closeTime: close, isClosed: closed });
    }

    try {
      await Promise.all(
        rows.map((r) =>
          db
            .insert(businessHours)
            .values(r)
            .onConflictDoUpdate({
              target: businessHours.dayOfWeek,
              set: {
                openTime: r.openTime,
                closeTime: r.closeTime,
                isClosed: r.isClosed,
              },
            })
        )
      );
    } catch (err) {
      console.error("simpan jam operasional gagal:", err);
      return fail("Terjadi kesalahan saat menyimpan. Silakan coba lagi.");
    }
    return ok("Jam operasional disimpan.");
  }

  if (intent === "block") {
    const tanggal = String(form.get("tanggal") ?? "");
    const seharian = form.get("seharian") === "on";
    const mulai = String(form.get("mulai") ?? "");
    const selesai = String(form.get("selesai") ?? "");
    const alasan = String(form.get("alasan") ?? "").trim().slice(0, 200);

    if (!isValidDateStr(tanggal) || tanggal < todayJakarta()) {
      return fail("Pilih tanggal yang valid (tidak boleh di masa lalu).");
    }

    let startsAt: Date;
    let endsAt: Date;
    if (seharian) {
      startsAt = jakartaToDate(tanggal, "00:00");
      endsAt = jakartaToDate(addDays(tanggal, 1), "00:00");
    } else {
      if (!TIME_RE.test(mulai) || !TIME_RE.test(selesai)) {
        return fail("Isi jam mulai dan jam selesai dengan benar.");
      }
      if (mulai >= selesai) return fail("Jam selesai harus setelah jam mulai.");
      startsAt = jakartaToDate(tanggal, mulai);
      endsAt = jakartaToDate(tanggal, selesai);
    }

    try {
      await db.insert(blockedSlots).values({ startsAt, endsAt, reason: alasan });

      const [overlap] = await db
        .select({ total: count() })
        .from(bookings)
        .where(
          and(
            ne(bookings.status, "cancelled"),
            lt(bookings.startsAt, endsAt),
            gt(bookings.endsAt, startsAt)
          )
        );
      const n = overlap?.total ?? 0;

      return ok(
        n > 0
          ? `Blokir disimpan. Perhatian: ada ${n} booking aktif di rentang ini. Booking itu tidak otomatis dibatalkan, tangani manual di halaman booking.`
          : "Blokir disimpan."
      );
    } catch (err) {
      console.error("simpan blokir gagal:", err);
      return fail("Terjadi kesalahan saat menyimpan. Silakan coba lagi.");
    }
  }

  if (intent === "unblock") {
    const id = idSchema.safeParse(form.get("id"));
    if (!id.success) return fail("Data tidak ditemukan.");

    await db.delete(blockedSlots).where(eq(blockedSlots.id, id.data));
    return ok("Blokir dihapus.");
  }

  return fail("Aksi tidak dikenal.");
}

const inputClass =
  "mt-1 w-full rounded-lg border border-blush-200 bg-white px-3 py-2 text-sm disabled:opacity-50";

export default function AdminJamOperasional({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { hours, blocked, today } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [seharian, setSeharian] = useState(true);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl md:text-3xl">Jam Operasional</h1>

      {actionData?.error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {actionData.error}
        </p>
      )}
      {actionData?.notice && (
        <p role="status" className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {actionData.notice}
        </p>
      )}

      <section className="mt-6 rounded-2xl border border-blush-100 bg-white p-5">
        <h2 className="text-lg">Jam buka per hari</h2>
        <p className="mt-1 text-xs text-plum-500">
          Perubahan hanya memengaruhi ketersediaan slot baru. Booking yang sudah
          ada tidak berubah.
        </p>

        <Form method="post" className="mt-4">
          <input type="hidden" name="intent" value="hours" />
          <div className="space-y-3">
            {hours.map((h) => (
              <div
                key={h.day}
                className="grid grid-cols-[5rem_1fr_1fr] items-end gap-3 sm:grid-cols-[6rem_1fr_1fr_auto]"
              >
                <p className="pb-2 text-sm font-medium">{h.name}</p>
                <div>
                  <label htmlFor={`open_${h.day}`} className="text-xs text-plum-500">
                    Buka
                  </label>
                  <input
                    id={`open_${h.day}`}
                    name={`open_${h.day}`}
                    type="time"
                    required
                    defaultValue={h.open}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`close_${h.day}`} className="text-xs text-plum-500">
                    Tutup
                  </label>
                  <input
                    id={`close_${h.day}`}
                    name={`close_${h.day}`}
                    type="time"
                    required
                    defaultValue={h.close}
                    className={inputClass}
                  />
                </div>
                <label className="col-span-3 flex items-center gap-2 pb-2 text-sm sm:col-span-1">
                  <input
                    type="checkbox"
                    name={`closed_${h.day}`}
                    defaultChecked={h.closed}
                  />
                  Libur
                </label>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-5 rounded-full bg-plum-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-60"
          >
            {busy ? "Menyimpan..." : "Simpan Jam Operasional"}
          </button>
        </Form>
      </section>

      <section className="mt-6 rounded-2xl border border-blush-100 bg-white p-5">
        <h2 className="text-lg">Hari libur dan slot diblokir</h2>

        <Form method="post" className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="intent" value="block" />

          <div>
            <label htmlFor="tanggal" className="text-sm font-medium">Tanggal</label>
            <input
              id="tanggal"
              name="tanggal"
              type="date"
              required
              min={today}
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-2 text-sm sm:pt-7">
            <input
              type="checkbox"
              name="seharian"
              checked={seharian}
              onChange={(e) => setSeharian(e.target.checked)}
            />
            Seharian (hari libur)
          </label>

          <div>
            <label htmlFor="mulai" className="text-sm font-medium">Jam mulai</label>
            <input
              id="mulai"
              name="mulai"
              type="time"
              disabled={seharian}
              required={!seharian}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="selesai" className="text-sm font-medium">Jam selesai</label>
            <input
              id="selesai"
              name="selesai"
              type="time"
              disabled={seharian}
              required={!seharian}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="alasan" className="text-sm font-medium">Alasan (opsional)</label>
            <input
              id="alasan"
              name="alasan"
              type="text"
              maxLength={200}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-plum-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-60"
            >
              {busy ? "Menyimpan..." : "Tambah Blokir"}
            </button>
          </div>
        </Form>

        <div className="mt-6 border-t border-blush-100 pt-5">
          <h3 className="font-sans text-sm font-semibold">Blokir yang akan datang</h3>
          {blocked.length === 0 ? (
            <p className="mt-3 text-sm text-plum-500">Belum ada blokir.</p>
          ) : (
            <ul className="mt-3 divide-y divide-blush-100">
              {blocked.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{formatTanggal(b.startsAt)}</p>
                    <p className="text-xs text-plum-500">
                      {b.allDay
                        ? "Seharian"
                        : `${formatJam(b.startsAt)} – ${formatJam(b.endsAt)}`}
                      {b.reason ? ` · ${b.reason}` : ""}
                    </p>
                  </div>
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (!window.confirm("Hapus blokir ini?")) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="unblock" />
                    <input type="hidden" name="id" value={b.id} />
                    <button
                      type="submit"
                      disabled={busy}
                      className="text-sm text-red-800 hover:underline disabled:opacity-60"
                    >
                      Hapus
                    </button>
                  </Form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}