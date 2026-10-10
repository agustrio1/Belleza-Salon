import { Form, Link, useNavigation } from "react-router";
import { and, desc, gte, ilike, lt, or, eq } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/booking";
import { bookings, db } from "~/db/index.server";
import { requireAdmin } from "~/lib/session.server";
import { StatusBadge } from "~/components/status-badge";
import { formatJam, formatRupiah, formatTanggal, isValidDateStr, jakartaToDate } from "~/lib/time";

export function meta() {
  return [{ title: "Booking — Admin Belleza" }];
}

const statusSchema = z.enum(["pending", "confirmed", "completed", "cancelled"]);

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 50);
  const statusParsed = statusSchema.safeParse(url.searchParams.get("status"));
  const status = statusParsed.success ? statusParsed.data : "";
  const tanggalParam = url.searchParams.get("tanggal") ?? "";
  const tanggal = isValidDateStr(tanggalParam) ? tanggalParam : "";

  const conditions = [];
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(ilike(bookings.code, like), ilike(bookings.customerName, like)));
  }
  if (status) conditions.push(eq(bookings.status, status));
  if (tanggal) {
    const start = jakartaToDate(tanggal, "00:00");
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    conditions.push(gte(bookings.startsAt, start), lt(bookings.startsAt, end));
  }

  const list = await db
    .select({
      id: bookings.id,
      code: bookings.code,
      serviceName: bookings.serviceName,
      price: bookings.price,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      customerName: bookings.customerName,
      status: bookings.status,
    })
    .from(bookings)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookings.startsAt))
    .limit(100);

  return { list, q, status, tanggal };
}

const inputClass =
  "mt-1 w-full rounded-lg border border-blush-200 bg-white px-3 py-2 text-sm";

export default function AdminBooking({ loaderData }: Route.ComponentProps) {
  const { list, q, status, tanggal } = loaderData;
  const navigation = useNavigation();
  const loading = navigation.state === "loading";
  const hasFilter = Boolean(q || status || tanggal);

  return (
    <div>
      <h1 className="text-2xl md:text-3xl">Daftar Booking</h1>

      <Form
        method="get"
        className="mt-6 grid gap-3 rounded-2xl border border-blush-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <label htmlFor="q" className="text-sm font-medium">Cari</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Kode atau nama"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="status" className="text-sm font-medium">Status</label>
          <select id="status" name="status" defaultValue={status} className={inputClass}>
            <option value="">Semua</option>
            <option value="pending">Menunggu Konfirmasi</option>
            <option value="confirmed">Dikonfirmasi</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
          </select>
        </div>
        <div>
          <label htmlFor="tanggal" className="text-sm font-medium">Tanggal</label>
          <input
            id="tanggal"
            name="tanggal"
            type="date"
            defaultValue={tanggal}
            className={inputClass}
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-full bg-plum-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-plum-700"
          >
            Terapkan
          </button>
          {hasFilter && (
            <Link
              to="/admin/booking"
              className="rounded-full border border-blush-200 px-5 py-2 text-sm font-medium transition-colors hover:bg-blush-50"
            >
              Reset
            </Link>
          )}
        </div>
      </Form>

      <div className={`mt-6 ${loading ? "opacity-60" : ""}`}>
        {list.length === 0 ? (
          <p className="rounded-xl border border-blush-100 bg-white p-6 text-sm text-plum-500">
            {hasFilter
              ? "Tidak ada booking yang cocok dengan filter."
              : "Belum ada booking."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-blush-100 bg-white">
            <table className="w-full min-w-180 text-left text-sm">
              <thead className="border-b border-blush-100 text-xs uppercase tracking-wide text-plum-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Kode</th>
                  <th className="px-4 py-3 font-medium">Pelanggan</th>
                  <th className="px-4 py-3 font-medium">Layanan</th>
                  <th className="px-4 py-3 font-medium">Jadwal</th>
                  <th className="px-4 py-3 font-medium">Harga</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blush-100">
                {list.map((b) => (
                  <tr key={b.id} className="hover:bg-blush-50/50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/booking/${b.id}`}
                        className="font-mono font-semibold tracking-wider text-blush-600 hover:underline"
                      >
                        {b.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{b.customerName}</td>
                    <td className="px-4 py-3">{b.serviceName}</td>
                    <td className="px-4 py-3">
                      <span className="block">{formatTanggal(b.startsAt)}</span>
                      <span className="text-xs text-plum-500">
                        {formatJam(b.startsAt)} – {formatJam(b.endsAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatRupiah(b.price)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.length === 100 && (
          <p className="mt-3 text-xs text-plum-500">
            Menampilkan 100 booking terbaru. Persempit dengan filter untuk melihat yang lain.
          </p>
        )}
      </div>
    </div>
  );
}