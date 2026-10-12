import { and, asc, eq, gt, gte, lt, ne, sql } from "drizzle-orm";
import { db } from "~/db/index.server";
import {
  bookings,
  staff,
  staffTimeOff,
  staffWorkingHours,
} from "~/db/schema";
import { REASON_MAX } from "~/lib/staff-limits";
import { isUuid } from "~/lib/staff.server";

export type ScheduleResult =
  | { ok: true; notice?: string }
  | { ok: false; error: string };

const NOT_FOUND: ScheduleResult = { ok: false, error: "Data tidak ditemukan." };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// Semua jam di aplikasi memakai waktu lokal Asia/Jakarta (UTC+7, tanpa DST).
function parseJakarta(value: string): Date | null {
  if (!LOCAL_DATETIME_RE.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hhmm(value: string): string {
  return value.slice(0, 5);
}

export async function getStaffBasic(staffId: string) {
  if (!isUuid(staffId)) return null;
  const [row] = await db
    .select({ id: staff.id, name: staff.name, isActive: staff.isActive })
    .from(staff)
    .where(eq(staff.id, staffId))
    .limit(1);
  return row ?? null;
}

export async function listWorkingHours(staffId: string) {
  return db
    .select({
      id: staffWorkingHours.id,
      dayOfWeek: staffWorkingHours.dayOfWeek,
      startTime: staffWorkingHours.startTime,
      endTime: staffWorkingHours.endTime,
    })
    .from(staffWorkingHours)
    .where(eq(staffWorkingHours.staffId, staffId))
    .orderBy(asc(staffWorkingHours.dayOfWeek), asc(staffWorkingHours.startTime));
}

export async function addWorkingHours(
  staffId: string,
  input: { dayOfWeek: number; startTime: string; endTime: string }
): Promise<ScheduleResult> {
  const { dayOfWeek, startTime, endTime } = input;

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { ok: false, error: "Hari tidak valid." };
  }
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return { ok: false, error: "Format jam harus HH:MM." };
  }
  if (endTime <= startTime) {
    return { ok: false, error: "Jam selesai harus setelah jam mulai." };
  }
  if (!(await getStaffBasic(staffId))) return NOT_FOUND;

  // Rentang di hari yang sama tidak boleh saling tumpang tindih.
  const sameDay = await db
    .select({
      startTime: staffWorkingHours.startTime,
      endTime: staffWorkingHours.endTime,
    })
    .from(staffWorkingHours)
    .where(
      and(
        eq(staffWorkingHours.staffId, staffId),
        eq(staffWorkingHours.dayOfWeek, dayOfWeek)
      )
    );

  const clash = sameDay.find(
    (row) => startTime < hhmm(row.endTime) && endTime > hhmm(row.startTime)
  );
  if (clash) {
    return {
      ok: false,
      error: `bentrok dengan rentang ${hhmm(clash.startTime)}–${hhmm(clash.endTime)}.`,
    };
  }

  await db
    .insert(staffWorkingHours)
    .values({ staffId, dayOfWeek, startTime, endTime });
  return { ok: true };
}

export async function deleteWorkingHours(
  staffId: string,
  rowId: string
): Promise<ScheduleResult> {
  if (!isUuid(staffId) || !isUuid(rowId)) return NOT_FOUND;
  const deleted = await db
    .delete(staffWorkingHours)
    .where(
      and(eq(staffWorkingHours.id, rowId), eq(staffWorkingHours.staffId, staffId))
    )
    .returning({ id: staffWorkingHours.id });
  return deleted.length > 0 ? { ok: true } : NOT_FOUND;
}

// Hanya cuti yang belum berakhir.
export async function listTimeOff(staffId: string) {
  return db
    .select({
      id: staffTimeOff.id,
      startsAt: staffTimeOff.startsAt,
      endsAt: staffTimeOff.endsAt,
      reason: staffTimeOff.reason,
    })
    .from(staffTimeOff)
    .where(
      and(eq(staffTimeOff.staffId, staffId), gte(staffTimeOff.endsAt, new Date()))
    )
    .orderBy(asc(staffTimeOff.startsAt));
}

export async function addTimeOff(
  staffId: string,
  input: { startsAt: string; endsAt: string; reason: string }
): Promise<ScheduleResult> {
  const startsAt = parseJakarta(input.startsAt);
  const endsAt = parseJakarta(input.endsAt);
  const reason = input.reason.trim();

  if (!startsAt || !endsAt) {
    return { ok: false, error: "Tanggal dan jam cuti wajib diisi." };
  }
  if (endsAt <= startsAt) {
    return { ok: false, error: "Waktu selesai harus setelah waktu mulai." };
  }
  if (reason.length > REASON_MAX) {
    return { ok: false, error: `Alasan maksimal ${REASON_MAX} karakter.` };
  }
  if (!(await getStaffBasic(staffId))) return NOT_FOUND;

  await db.insert(staffTimeOff).values({ staffId, startsAt, endsAt, reason });

  // Cuti tidak membatalkan booking yang sudah ada, jadi admin diberi tahu.
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        eq(bookings.staffId, staffId),
        ne(bookings.status, "cancelled"),
        lt(bookings.startsAt, endsAt),
        gt(bookings.endsAt, startsAt)
      )
    );

  const total = row?.total ?? 0;
  if (total > 0) {
    return {
      ok: true,
      notice: `Perhatian: ada ${total} booking aktif staf ini pada rentang cuti tersebut. Booking itu tidak otomatis dibatalkan, jadi atur ulang atau batalkan manual lewat menu Booking.`,
    };
  }
  return { ok: true };
}

export async function deleteTimeOff(
  staffId: string,
  rowId: string
): Promise<ScheduleResult> {
  if (!isUuid(staffId) || !isUuid(rowId)) return NOT_FOUND;
  const deleted = await db
    .delete(staffTimeOff)
    .where(and(eq(staffTimeOff.id, rowId), eq(staffTimeOff.staffId, staffId)))
    .returning({ id: staffTimeOff.id });
  return deleted.length > 0 ? { ok: true } : NOT_FOUND;
}