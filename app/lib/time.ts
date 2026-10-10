const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export const MAX_DAYS_AHEAD = 60;

export function todayJakarta(now: Date = new Date()): string {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidDateStr(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// 0 = Minggu ... 6 = Sabtu, untuk tanggal kalender (YYYY-MM-DD)
export function dayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

// dateStr = YYYY-MM-DD, time = HH:mm (waktu Jakarta) -> Date (instan UTC)
export function jakartaToDate(dateStr: string, time: string): Date {
  return new Date(`${dateStr}T${time}:00+07:00`);
}

export function formatTanggal(value: Date | string): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function formatTanggalStr(dateStr: string): string {
  return formatTanggal(jakartaToDate(dateStr, "12:00"));
}

export function formatJam(value: Date | string): string {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  })
    .format(new Date(value))
    .replace(".", ":");
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}