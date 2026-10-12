import { and, asc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import {
  blockedSlots,
  bookings,
  businessHours,
  businessSettings,
  db,
} from "~/db/index.server";
import {
  staff,
  staffServices,
  staffTimeOff,
  staffWorkingHours,
} from "~/db/schema";
import { dayOfWeek, jakartaToDate } from "~/lib/time";

export type SlotOptions = {
  // Isi agar slot dihitung per staf. Tanpa ini, perilakunya sama seperti dulu.
  serviceId?: string;
  // Isi untuk staf tertentu. Kosong atau null berarti "siapa saja".
  staffId?: string | null;
};

export type BookableStaff = { id: string; name: string };

type Interval = { start: number; end: number };

// Nilai tiap slot: staf yang kosong (urut dari yang paling sedikit booking hari itu),
// atau [null] pada mode lama (layanan tanpa staf terjadwal).
type Availability = {
  mode: "legacy" | "staff";
  slots: Map<string, (string | null)[]>;
};

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function toHHmm(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function toInterval(row: { startsAt: Date; endsAt: Date }): Interval {
  return { start: row.startsAt.getTime(), end: row.endsAt.getTime() };
}

// Interval setengah terbuka [start, end): booking beruntun tidak dianggap bentrok
function overlaps(list: Interval[], start: number, end: number): boolean {
  return list.some((b) => start < b.end && end > b.start);
}

function pushTo(map: Map<string, Interval[]>, key: string, value: Interval) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

// Staf yang bisa dipesan untuk sebuah layanan: aktif, mengerjakan layanan itu,
// dan sudah punya minimal satu jam kerja. Staf yang jadwalnya belum diisi diabaikan,
// supaya booking tidak macet selama jadwal belum lengkap.
export async function getBookableStaff(serviceId: string): Promise<BookableStaff[]> {
  return db
    .selectDistinct({ id: staff.id, name: staff.name })
    .from(staff)
    .innerJoin(staffServices, eq(staffServices.staffId, staff.id))
    .innerJoin(staffWorkingHours, eq(staffWorkingHours.staffId, staff.id))
    .where(and(eq(staffServices.serviceId, serviceId), eq(staff.isActive, true)))
    .orderBy(asc(staff.name));
}

async function loadStaffSchedule(
  staffIds: string[],
  weekday: number,
  dayStart: Date,
  dayEnd: Date
) {
  const work = new Map<string, Interval[]>(); // dalam menit sejak 00:00
  const off = new Map<string, Interval[]>(); // dalam epoch ms
  if (staffIds.length === 0) return { work, off };

  const [workRows, offRows] = await Promise.all([
    db
      .select({
        staffId: staffWorkingHours.staffId,
        startTime: staffWorkingHours.startTime,
        endTime: staffWorkingHours.endTime,
      })
      .from(staffWorkingHours)
      .where(
        and(
          inArray(staffWorkingHours.staffId, staffIds),
          eq(staffWorkingHours.dayOfWeek, weekday)
        )
      ),
    db
      .select({
        staffId: staffTimeOff.staffId,
        startsAt: staffTimeOff.startsAt,
        endsAt: staffTimeOff.endsAt,
      })
      .from(staffTimeOff)
      .where(
        and(
          inArray(staffTimeOff.staffId, staffIds),
          lt(staffTimeOff.startsAt, dayEnd),
          gt(staffTimeOff.endsAt, dayStart)
        )
      ),
  ]);

  for (const row of workRows) {
    pushTo(work, row.staffId, {
      start: toMinutes(row.startTime),
      end: toMinutes(row.endTime),
    });
  }
  for (const row of offRows) pushTo(off, row.staffId, toInterval(row));
  return { work, off };
}

async function computeAvailability(
  dateStr: string,
  durationMinutes: number,
  options: SlotOptions
): Promise<Availability> {
  const [settings] = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.id, 1))
    .limit(1);
  const weekday = dayOfWeek(dateStr);
  const [hours] = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.dayOfWeek, weekday))
    .limit(1);

  if (!settings || !hours || hours.isClosed) {
    return { mode: "legacy", slots: new Map() };
  }

  let pool: BookableStaff[] = [];
  if (options.serviceId) pool = await getBookableStaff(options.serviceId);
  const staffMode = pool.length > 0;

  if (options.staffId) {
    // Staf tertentu diminta tapi tidak bisa dipesan untuk layanan ini.
    pool = pool.filter((s) => s.id === options.staffId);
    if (pool.length === 0) return { mode: "staff", slots: new Map() };
  }

  const open = toMinutes(hours.openTime);
  const close = toMinutes(hours.closeTime);

  const dayStart = jakartaToDate(dateStr, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [booked, blocked, schedule] = await Promise.all([
    db
      .select({
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        staffId: bookings.staffId,
      })
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
    loadStaffSchedule(
      pool.map((s) => s.id),
      weekday,
      dayStart,
      dayEnd
    ),
  ]);

  const blockedBusy = blocked.map(toInterval);

  // Booking tanpa staf dan booking per staf adalah sumber daya terpisah,
  // sama seperti dua constraint di database.
  const unassignedBusy = booked.filter((b) => b.staffId === null).map(toInterval);
  const staffBusy = new Map<string, Interval[]>();
  for (const b of booked) {
    if (b.staffId) pushTo(staffBusy, b.staffId, toInterval(b));
  }

  // "Siapa saja": utamakan staf dengan booking paling sedikit hari itu.
  const ordered = [...pool].sort(
    (a, b) =>
      (staffBusy.get(a.id)?.length ?? 0) - (staffBusy.get(b.id)?.length ?? 0)
  );

  const earliest = Date.now() + settings.minLeadMinutes * 60 * 1000;
  const slots = new Map<string, (string | null)[]>();

  for (
    let t = open;
    t + durationMinutes <= close;
    t += settings.slotIntervalMinutes
  ) {
    const label = toHHmm(t);
    const start = jakartaToDate(dateStr, label).getTime();
    const end = start + durationMinutes * 60 * 1000;

    if (start < earliest) continue;
    if (overlaps(blockedBusy, start, end)) continue;

    if (!staffMode) {
      if (!overlaps(unassignedBusy, start, end)) slots.set(label, [null]);
      continue;
    }

    const free = ordered.filter((member) => {
      const inShift = (schedule.work.get(member.id) ?? []).some(
        (w) => t >= w.start && t + durationMinutes <= w.end
      );
      if (!inShift) return false;
      if (overlaps(schedule.off.get(member.id) ?? [], start, end)) return false;
      return !overlaps(staffBusy.get(member.id) ?? [], start, end);
    });

    if (free.length > 0) slots.set(label, free.map((member) => member.id));
  }

  return { mode: staffMode ? "staff" : "legacy", slots };
}

// Mengembalikan daftar jam mulai ("HH:mm") yang masih bisa dipesan pada tanggal tsb.
// Tanpa `options`, hasilnya sama seperti sebelum fitur staf.
export async function getAvailableSlots(
  dateStr: string,
  durationMinutes: number,
  options: SlotOptions = {}
): Promise<string[]> {
  const { slots } = await computeAvailability(dateStr, durationMinutes, options);
  return [...slots.keys()];
}

// Dipakai saat menyimpan booking: staf mana saja yang kosong di jam itu,
// berurutan dari yang paling diutamakan. [null] berarti booking tanpa staf.
export async function resolveSlot(
  dateStr: string,
  jam: string,
  durationMinutes: number,
  options: SlotOptions = {}
): Promise<{ ok: true; staffIds: (string | null)[] } | { ok: false }> {
  const { slots } = await computeAvailability(dateStr, durationMinutes, options);
  const staffIds = slots.get(jam);
  return staffIds ? { ok: true, staffIds } : { ok: false };
}