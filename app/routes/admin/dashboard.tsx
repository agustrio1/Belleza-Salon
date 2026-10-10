import { Link } from "react-router";
import { and, asc, count, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import type { Route } from "./+types/dashboard";
import { bookings, db } from "~/db/index.server";
import { requireAdmin } from "~/lib/session.server";
import { StatusBadge } from "~/components/status-badge";
import { formatJam, formatTanggal, jakartaToDate, todayJakarta } from "~/lib/time";

export function meta() {
  return [{ title: "Dashboard — Admin Belleza" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const today = todayJakarta();
  const start = jakartaToDate(today, "00:00");
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();

  const [todayCount, pendingCount, upcomingCount, todayList, latest] =
    await Promise.all([
      db
        .select({ total: count() })
        .from(bookings)
        .where(
          and(
            gte(bookings.startsAt, start),
            lt(bookings.startsAt, end),
            ne(bookings.status, "cancelled")
          )
        ),
      db
        .select({ total: count() })
        .from(bookings)
        .where(eq(bookings.status, "pending")),
      db
        .select({ total: count() })
        .from(bookings)
        .where(
          and(
            gte(bookings.startsAt, now),
            inArray(bookings.status, ["pending", "confirmed"])
          )
        ),
      db
        .select({
          id: bookings.id,
          code: bookings.code,
          serviceName: bookings.serviceName,
          customerName: bookings.customerName,
          startsAt: bookings.startsAt,
          endsAt: bookings.endsAt,
          status: bookings.status,
        })
        .from(bookings)
        .where(
          and(
            gte(bookings.startsAt, start),
            lt(bookings.startsAt, end),
            ne(bookings.status, "cancelled")
          )
        )
        .orderBy(asc(bookings.startsAt)),
      db
        .select({
          id: bookings.id,
          code: bookings.code,
          serviceName: bookings.serviceName,
          customerName: bookings.customerName,
          startsAt: bookings.startsAt,
          status: bookings.status,
        })
        .from(bookings)
        .orderBy(desc(bookings.createdAt))
        .limit(5),
    ]);

  return {
    today,
    todayTotal: todayCount[0]?.total ?? 0,
    pendingTotal: pendingCount[0]?.total ?? 0,
    upcomingTotal: upcomingCount[0]?.total ?? 0,
    todayList,
    latest,
  };
}

function StatCard({
  label,
  value,
  to,
}: {
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="block rounded-2xl border border-blush-100 bg-white p-5 transition-colors hover:bg-blush-50"
    >
      <p className="text-sm text-plum-500">{label}</p>
      <p className="mt-2 font-serif text-4xl">{value}</p>
    </Link>
  );
}

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { today, todayTotal, pendingTotal, upcomingTotal, todayList, latest } =
    loaderData;

  return (
    <div>
      <h1 className="text-2xl md:text-3xl">Dashboard</h1>
      <p className="mt-1 text-sm text-plum-500">
        {formatTanggal(jakartaToDate(today, "12:00"))}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Booking hari ini"
          value={todayTotal}
          to={`/admin/booking?tanggal=${today}`}
        />
        <StatCard
          label="Menunggu konfirmasi"
          value={pendingTotal}
          to="/admin/booking?status=pending"
        />
        <StatCard
          label="Akan datang"
          value={upcomingTotal}
          to="/admin/kalender"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-blush-100 bg-white p-5">
          <h2 className="text-lg">Jadwal hari ini</h2>
          {todayList.length === 0 ? (
            <p className="mt-4 text-sm text-plum-500">
              Tidak ada booking hari ini.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-blush-100">
              {todayList.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {formatJam(b.startsAt)} – {formatJam(b.endsAt)} · {b.serviceName}
                    </p>
                    <Link
                      to={`/admin/booking/${b.id}`}
                      className="text-xs text-plum-500 hover:text-blush-600"
                    >
                      {b.customerName} · <span className="font-mono">{b.code}</span>
                    </Link>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-blush-100 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Booking terbaru</h2>
            <Link
              to="/admin/booking"
              className="text-sm text-blush-600 hover:underline"
            >
              Lihat semua
            </Link>
          </div>
          {latest.length === 0 ? (
            <p className="mt-4 text-sm text-plum-500">Belum ada booking.</p>
          ) : (
            <ul className="mt-4 divide-y divide-blush-100">
              {latest.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      to={`/admin/booking/${b.id}`}
                      className="font-mono text-sm font-semibold tracking-wider text-blush-600 hover:underline"
                    >
                      {b.code}
                    </Link>
                    <p className="truncate text-xs text-plum-500">
                      {b.customerName} · {b.serviceName}
                    </p>
                    <p className="text-xs text-plum-500">
                      {formatTanggal(b.startsAt)}, {formatJam(b.startsAt)}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}