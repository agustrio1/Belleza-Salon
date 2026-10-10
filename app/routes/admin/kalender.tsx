import { Link } from "react-router";
import { and, asc, gte, lt, ne } from "drizzle-orm";
import type { Route } from "./+types/kalender";
import { bookings, db } from "~/db/index.server";
import { requireAdmin } from "~/lib/session.server";
import { StatusBadge } from "~/components/status-badge";
import {
  addDays,
  dayOfWeek,
  formatJam,
  isValidDateStr,
  jakartaToDate,
  todayJakarta,
} from "~/lib/time";

export function meta() {
  return [{ title: "Kalender — Admin Belleza" }];
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

// Senin sebagai awal minggu
function weekStartOf(dateStr: string): string {
  return addDays(dateStr, -((dayOfWeek(dateStr) + 6) % 7));
}

function dateKey(d: Date): string {
  return new Date(d.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const param = new URL(request.url).searchParams.get("minggu") ?? "";
  const today = todayJakarta();
  const base = isValidDateStr(param) ? param : today;
  const start = weekStartOf(base);

  const rangeStart = jakartaToDate(start, "00:00");
  const rangeEnd = jakartaToDate(addDays(start, 7), "00:00");

  const rows = await db
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
        gte(bookings.startsAt, rangeStart),
        lt(bookings.startsAt, rangeEnd),
        ne(bookings.status, "cancelled")
      )
    )
    .orderBy(asc(bookings.startsAt));

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, items: rows.filter((r) => dateKey(r.startsAt) === date) };
  });

  return {
    today,
    days,
    start,
    end: addDays(start, 6),
    prev: addDays(start, -7),
    next: addDays(start, 7),
    thisWeek: weekStartOf(today),
  };
}

const longDay = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Jakarta",
});
const shortDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

const navClass =
  "rounded-full border border-blush-200 bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-blush-50";

export default function AdminKalender({ loaderData }: Route.ComponentProps) {
  const { today, days, start, end, prev, next, thisWeek } = loaderData;
  const total = days.reduce((n, d) => n + d.items.length, 0);

  return (
    <div>
      <h1 className="text-2xl md:text-3xl">Kalender</h1>
      <p className="mt-1 text-sm text-plum-500">
        {shortDate.format(jakartaToDate(start, "12:00"))} –{" "}
        {shortDate.format(jakartaToDate(end, "12:00"))} · {total} booking aktif
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link to={`/admin/kalender?minggu=${prev}`} className={navClass}>
          ← Minggu lalu
        </Link>
        {start !== thisWeek && (
          <Link to="/admin/kalender" className={navClass}>
            Minggu ini
          </Link>
        )}
        <Link to={`/admin/kalender?minggu=${next}`} className={navClass}>
          Minggu depan →
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {days.map((d) => {
          const isToday = d.date === today;
          return (
            <section
              key={d.date}
              className={`rounded-2xl border bg-white p-4 ${
                isToday ? "border-blush-400" : "border-blush-100"
              }`}
            >
              <h2 className="flex items-center gap-2 font-sans text-sm font-semibold">
                {longDay.format(jakartaToDate(d.date, "12:00"))}
                {isToday && (
                  <span className="rounded-full bg-blush-100 px-2 py-0.5 text-xs font-medium text-blush-600">
                    Hari ini
                  </span>
                )}
              </h2>

              {d.items.length === 0 ? (
                <p className="mt-3 text-sm text-plum-500">Tidak ada booking.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {d.items.map((b) => (
                    <li key={b.id}>
                      <Link
                        to={`/admin/booking/${b.id}`}
                        className="block rounded-lg border border-blush-100 p-3 transition-colors hover:bg-blush-50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">
                            {formatJam(b.startsAt)} – {formatJam(b.endsAt)}
                          </p>
                          <StatusBadge status={b.status} />
                        </div>
                        <p className="mt-1 text-sm">{b.serviceName}</p>
                        <p className="text-xs text-plum-500">
                          {b.customerName} ·{" "}
                          <span className="font-mono">{b.code}</span>
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}