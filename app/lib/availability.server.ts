import { and, eq, gt, lt, ne } from "drizzle-orm";
import {
  blockedSlots,
  bookings,
  businessHours,
  businessSettings,
  db,
} from "~/db/index.server";
import { dayOfWeek, jakartaToDate } from "~/lib/time";

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function toHHmm(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// Mengembalikan daftar jam mulai ("HH:mm") yang masih bisa dipesan pada tanggal tsb.
export async function getAvailableSlots(
  dateStr: string,
  durationMinutes: number
): Promise<string[]> {
  const [settings] = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);
  const [hours] = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.dayOfWeek, dayOfWeek(dateStr)))
    .limit(1);

  if (!settings || !hours || hours.isClosed) return [];

  const open = toMinutes(hours.openTime);
  const close = toMinutes(hours.closeTime);

  const dayStart = jakartaToDate(dateStr, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [booked, blocked] = await Promise.all([
    db
      .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
      .from(bookings)
      .where(
        and(
          ne(bookings.status, "cancelled"),
          lt(bookings.startsAt, dayEnd),
          gt(bookings.endsAt, dayStart)
        )
      ),
    db
      .select({ startsAt: blockedSlots.startsAt, endsAt: blockedSlots.endsAt })
      .from(blockedSlots)
      .where(
        and(lt(blockedSlots.startsAt, dayEnd), gt(blockedSlots.endsAt, dayStart))
      ),
  ]);

  const busy = [...booked, ...blocked].map((b) => ({
    start: b.startsAt.getTime(),
    end: b.endsAt.getTime(),
  }));

  const earliest = Date.now() + settings.minLeadMinutes * 60 * 1000;
  const slots: string[] = [];

  for (
    let t = open;
    t + durationMinutes <= close;
    t += settings.slotIntervalMinutes
  ) {
    const label = toHHmm(t);
    const start = jakartaToDate(dateStr, label).getTime();
    const end = start + durationMinutes * 60 * 1000;

    if (start < earliest) continue;
    // Interval setengah terbuka [start, end): booking beruntun tidak dianggap bentrok
    const clash = busy.some((b) => start < b.end && end > b.start);
    if (!clash) slots.push(label);
  }

  return slots;
}