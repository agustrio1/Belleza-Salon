import { Form, Link, useNavigation } from "react-router";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Route } from "./+types/booking-detail";
import { bookings, bookingStatusHistory, db, users } from "~/db/index.server";
import { requireAdmin } from "~/lib/session.server";
import { StatusBadge, type BookingStatus } from "~/components/status-badge";
import { formatJam, formatRupiah, formatTanggal } from "~/lib/time";

export function meta() {
  return [{ title: "Detail Booking — Admin Belleza" }];
}

const idSchema = z.string().uuid();

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = idSchema.safeParse(params.id);
  if (!id.success) throw new Response("Booking tidak ditemukan", { status: 404 });

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id.data))
    .limit(1);
  if (!booking) throw new Response("Booking tidak ditemukan", { status: 404 });

  const history = await db
    .select({
      id: bookingStatusHistory.id,
      fromStatus: bookingStatusHistory.fromStatus,
      toStatus: bookingStatusHistory.toStatus,
      note: bookingStatusHistory.note,
      createdAt: bookingStatusHistory.createdAt,
      adminName: users.name,
    })
    .from(bookingStatusHistory)
    .leftJoin(users, eq(bookingStatusHistory.changedBy, users.id))
    .where(eq(bookingStatusHistory.bookingId, booking.id))
    .orderBy(asc(bookingStatusHistory.createdAt));

  return { booking, history };
}

const transitions = {
  confirm: { from: ["pending"], to: "confirmed", note: "Dikonfirmasi admin" },
  complete: { from: ["confirmed"], to: "completed", note: "Ditandai selesai oleh admin" },
  cancel: { from: ["pending", "confirmed"], to: "cancelled", note: "Dibatalkan admin" },
} as const satisfies Record<
  string,
  { from: readonly BookingStatus[]; to: BookingStatus; note: string }
>;

const intentSchema = z.enum(["confirm", "complete", "cancel"]);

const STALE = { error: "Status booking sudah berubah. Muat ulang halaman." };

export async function action({ request, params }: Route.ActionArgs) {
  const admin = await requireAdmin(request);

  const id = idSchema.safeParse(params.id);
  if (!id.success) throw new Response("Booking tidak ditemukan", { status: 404 });

  const form = await request.formData();
  const intent = intentSchema.safeParse(form.get("intent"));
  if (!intent.success) return { error: "Aksi tidak dikenal." };
  const rule = transitions[intent.data];

  const reasonRaw = String(form.get("alasan") ?? "").trim().slice(0, 300);
  const reason = intent.data === "cancel" && reasonRaw ? reasonRaw : null;

  const [current] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, id.data))
    .limit(1);
  if (!current) throw new Response("Booking tidak ditemukan", { status: 404 });

  if (!(rule.from as readonly BookingStatus[]).includes(current.status)) {
    return STALE;
  }

  const note = reason ? `${rule.note}: ${reason}` : rule.note;

  // Satu statement: update status (dengan guard status lama) dan catat riwayat.
  // Kalau guard gagal (status sudah berubah), tidak ada baris yang masuk ke riwayat.
  try {
    const res = await db.execute(sql`
      WITH upd AS (
        UPDATE bookings
        SET status = ${rule.to}::booking_status,
            cancel_reason = ${reason}::text,
            updated_at = now()
        WHERE id = ${id.data}::uuid
          AND status = ${current.status}::booking_status
        RETURNING id
      )
      INSERT INTO booking_status_history
        (booking_id, from_status, to_status, note, changed_by)
      SELECT id,
             ${current.status}::booking_status,
             ${rule.to}::booking_status,
             ${note}::text,
             ${admin.id}::uuid
      FROM upd
      RETURNING id
    `);

    const raw = res as unknown;
    const rows = Array.isArray(raw)
      ? raw
      : ((raw as { rows?: unknown[] }).rows ?? []);
    if (rows.length === 0) return STALE;
  } catch (err) {
    console.error("update status booking gagal:", err);
    return { error: "Terjadi kesalahan. Silakan coba lagi." };
  }

  return { error: null };
}

const statusLabel: Record<BookingStatus, string> = {
  pending: "Menunggu Konfirmasi",
  confirmed: "Dikonfirmasi",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-plum-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export default function AdminBookingDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { booking, history } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const canConfirm = booking.status === "pending";
  const canComplete = booking.status === "confirmed";
  const canCancel = booking.status === "pending" || booking.status === "confirmed";

  return (
    <div className="max-w-3xl">
      <Link to="/admin/booking" className="text-sm text-plum-500 hover:text-blush-600">
        ← Kembali ke daftar
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl tracking-widest md:text-3xl">{booking.code}</h1>
        <StatusBadge status={booking.status} />
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-blush-100 bg-white p-5">
          <h2 className="text-lg">Reservasi</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Layanan">{booking.serviceName}</Row>
            <Row label="Tanggal">{formatTanggal(booking.startsAt)}</Row>
            <Row label="Jam">
              {formatJam(booking.startsAt)} – {formatJam(booking.endsAt)}
            </Row>
            <Row label="Durasi">{booking.durationMinutes} menit</Row>
            <Row label="Harga">{formatRupiah(booking.price)}</Row>
          </dl>
        </section>

        <section className="rounded-2xl border border-blush-100 bg-white p-5">
          <h2 className="text-lg">Pelanggan</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Nama">{booking.customerName}</Row>
            <Row label="WhatsApp">
              <a
                href={`https://wa.me/${booking.customerPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blush-600 hover:underline"
              >
                +{booking.customerPhone}
              </a>
            </Row>
            <Row label="Catatan">{booking.notes || "-"}</Row>
            {booking.status === "cancelled" && (
              <Row label="Alasan batal">{booking.cancelReason || "-"}</Row>
            )}
          </dl>
        </section>
      </div>

      {actionData?.error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {actionData.error}
        </p>
      )}

      {(canConfirm || canComplete || canCancel) && (
        <section className="mt-5 rounded-2xl border border-blush-100 bg-white p-5">
          <h2 className="text-lg">Ubah status</h2>

          <div className="mt-4 flex flex-wrap gap-3">
            {canConfirm && (
              <Form method="post">
                <input type="hidden" name="intent" value="confirm" />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-plum-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-60"
                >
                  Konfirmasi
                </button>
              </Form>
            )}
            {canComplete && (
              <Form method="post">
                <input type="hidden" name="intent" value="complete" />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-plum-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-60"
                >
                  Tandai Selesai
                </button>
              </Form>
            )}
          </div>

          {canCancel && (
            <Form
              method="post"
              className="mt-5 border-t border-blush-100 pt-5"
              onSubmit={(e) => {
                if (!window.confirm("Batalkan booking ini? Tindakan ini tidak bisa diurungkan.")) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="cancel" />
              <label htmlFor="alasan" className="text-sm font-medium">
                Alasan pembatalan (opsional)
              </label>
              <textarea
                id="alasan"
                name="alasan"
                rows={2}
                maxLength={300}
                className="mt-1 w-full rounded-lg border border-blush-200 bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={busy}
                className="mt-3 rounded-full border border-red-300 px-5 py-2 text-sm font-medium text-red-800 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                Batalkan Booking
              </button>
            </Form>
          )}
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-blush-100 bg-white p-5">
        <h2 className="text-lg">Riwayat status</h2>
        <ol className="mt-4 space-y-3 text-sm">
          {history.map((h) => (
            <li key={h.id} className="border-l-2 border-blush-200 pl-4">
              <p className="font-medium">
                {h.fromStatus ? `${statusLabel[h.fromStatus]} → ` : ""}
                {statusLabel[h.toStatus]}
              </p>
              {h.note && <p className="text-plum-500">{h.note}</p>}
              <p className="text-xs text-plum-500">
                {formatTanggal(h.createdAt)}, {formatJam(h.createdAt)}
                {h.adminName ? ` · ${h.adminName}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}