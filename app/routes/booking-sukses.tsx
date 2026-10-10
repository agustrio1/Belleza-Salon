import { Link, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/booking-sukses";
import { bookings, db } from "~/db/index.server";
import { StatusBadge } from "~/components/status-badge";
import { formatJam, formatRupiah, formatTanggal } from "~/lib/time";

export function meta() {
  return [{ title: "Booking Berhasil — Belleza Salon" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const code = (new URL(request.url).searchParams.get("kode") ?? "")
    .trim()
    .toUpperCase();
  if (!code) throw redirect("/booking");

  const [booking] = await db
    .select({
      code: bookings.code,
      serviceName: bookings.serviceName,
      price: bookings.price,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
    })
    .from(bookings)
    .where(eq(bookings.code, code))
    .limit(1);

  if (!booking) throw redirect("/booking");
  return { booking };
}

export default function BookingSukses({ loaderData }: Route.ComponentProps) {
  const { booking } = loaderData;

  return (
    <section className="mx-auto max-w-xl px-4 py-12 md:py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-blush-600">
        Reservasi terkirim
      </p>
      <h1 className="mt-2 text-3xl md:text-4xl">Terima kasih!</h1>
      <p className="mt-2 text-plum-500">
        Simpan kode booking di bawah ini. Kamu butuh kode ini dan nomor WhatsApp
        yang kamu isi untuk mengecek status reservasi.
      </p>

      <div className="mt-8 rounded-2xl border border-blush-100 bg-white p-6 shadow-soft">
        <p className="text-xs text-plum-500">Kode booking</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-widest">
          {booking.code}
        </p>

        <dl className="mt-6 space-y-2 text-sm">
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
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/cek-booking"
          className="rounded-full bg-plum-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-plum-700"
        >
          Cek Status Booking
        </Link>
        <Link
          to="/"
          className="rounded-full border border-blush-200 bg-white px-6 py-3 text-sm font-medium transition-colors hover:bg-blush-50"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </section>
  );
}