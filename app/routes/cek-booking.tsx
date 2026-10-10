import { Form, useNavigation } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/cek-booking";
import { bookings, businessSettings, db } from "~/db/index.server";
import { normalizePhone } from "~/lib/booking.server";
import {
  isLookupBlocked,
  lookupKeys,
  recordLookupFailure,
} from "~/lib/rate-limit.server";
import { StatusBadge, type BookingStatus } from "~/components/status-badge";
import { formatJam, formatRupiah, formatTanggal } from "~/lib/time";

export function meta() {
  return [{ title: "Cek Booking — Belleza Salon" }];
}

const NOT_MATCH = "Kode booking atau nomor WhatsApp tidak cocok.";

function fail(error: string) {
  return { error, salonName: null, booking: null };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const code = String(form.get("kode") ?? "").trim().toUpperCase();
  const phone = normalizePhone(String(form.get("whatsapp") ?? ""));

  if (code.length < 4 || code.length > 20 || !phone) {
    return fail("Isi kode booking dan nomor WhatsApp dengan benar.");
  }

  const keys = lookupKeys(request, code);
  if (await isLookupBlocked(keys)) {
    return fail("Terlalu banyak percobaan. Coba lagi dalam 15 menit.");
  }

  const [booking] = await db
    .select({
      code: bookings.code,
      serviceName: bookings.serviceName,
      price: bookings.price,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
      customerPhone: bookings.customerPhone,
    })
    .from(bookings)
    .where(eq(bookings.code, code))
    .limit(1);

  if (!booking || booking.customerPhone !== phone) {
    await recordLookupFailure(keys);
    return fail(NOT_MATCH);
  }

  const [settings] = await db
    .select({ name: businessSettings.name })
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);

  return {
    error: null,
    salonName: settings?.name ?? "Belleza Salon",
    booking: {
      code: booking.code,
      serviceName: booking.serviceName,
      price: booking.price,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
    },
  };
}

const nextStep: Record<BookingStatus, string> = {
  pending:
    "Reservasi kamu sedang menunggu konfirmasi dari admin salon. Cek halaman ini lagi nanti.",
  confirmed:
    "Reservasi sudah dikonfirmasi. Datang 10 menit sebelum jadwal dan tunjukkan kode booking ini.",
  completed: "Perawatan sudah selesai. Terima kasih sudah berkunjung!",
  cancelled:
    "Reservasi ini dibatalkan. Kamu bisa membuat booking baru kapan saja.",
};

const inputClass =
  "mt-1 w-full rounded-lg border border-blush-200 bg-white px-3 py-2 text-sm";

export default function CekBooking({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const error = actionData?.error ?? null;
  const booking = actionData?.booking ?? null;
  const salonName = actionData?.salonName ?? "Belleza Salon";

  return (
    <section className="mx-auto max-w-xl px-4 py-12 md:py-16">
      <h1 className="text-3xl md:text-4xl">Cek Booking</h1>
      <p className="mt-2 text-plum-500">
        Masukkan kode booking dan nomor WhatsApp yang kamu pakai saat reservasi.
      </p>

      <Form method="post" className="mt-8 space-y-4">
        <div>
          <label htmlFor="kode" className="text-sm font-medium">Kode booking</label>
          <input
            id="kode"
            name="kode"
            type="text"
            required
            maxLength={20}
            autoComplete="off"
            autoCapitalize="characters"
            className={inputClass + " font-mono uppercase tracking-widest"}
          />
        </div>
        <div>
          <label htmlFor="whatsapp" className="text-sm font-medium">Nomor WhatsApp</label>
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
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-plum-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-60"
        >
          {submitting ? "Memeriksa..." : "Cek Status"}
        </button>
      </Form>

      {booking && (
        <div className="mt-8 rounded-2xl border border-blush-100 bg-white p-6 shadow-soft">
          <p className="text-xs text-plum-500">{salonName}</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-widest">
            {booking.code}
          </p>

          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-plum-500">Layanan</dt>
              <dd className="text-right">{booking.serviceName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-plum-500">Tanggal</dt>
              <dd className="text-right">{formatTanggal(booking.startsAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-plum-500">Jam</dt>
              <dd className="text-right">
                {formatJam(booking.startsAt)} – {formatJam(booking.endsAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-plum-500">Harga</dt>
              <dd className="text-right">{formatRupiah(booking.price)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-plum-500">Status</dt>
              <dd>
                <StatusBadge status={booking.status} />
              </dd>
            </div>
          </dl>

          <p className="mt-5 rounded-lg bg-blush-50 px-4 py-3 text-sm text-plum-700">
            {nextStep[booking.status]}
          </p>
        </div>
      )}
    </section>
  );
}