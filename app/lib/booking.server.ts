import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  bookings,
  bookingStatusHistory,
  db,
  services,
} from "~/db/index.server";
import { resolveSlot } from "~/lib/availability.server";
import { isUuid } from "~/lib/staff.server";
import {
  addDays,
  isValidDateStr,
  jakartaToDate,
  MAX_DAYS_AHEAD,
  todayJakarta,
} from "~/lib/time";

// Normalisasi ke format 62812xxxx. Mengembalikan null kalau tidak valid.
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (digits.startsWith("8")) digits = "62" + digits;
  return /^628\d{8,11}$/.test(digits) ? digits : null;
}

export const bookingInput = z.object({
  layanan: z.string().min(1, "Pilih layanan"),
  tanggal: z.string().refine(isValidDateStr, "Pilih tanggal"),
  jam: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pilih jam"),
  // Kosong atau "any" = siapa saja. Selain itu harus ID staf.
  staf: z.string().trim().max(40).optional(),
  nama: z
    .string()
    .trim()
    .min(2, "Nama minimal 2 karakter")
    .max(80, "Nama maksimal 80 karakter"),
  whatsapp: z
    .string()
    .trim()
    .refine((v) => normalizePhone(v) !== null, "Nomor WhatsApp tidak valid"),
  catatan: z.string().trim().max(300, "Catatan maksimal 300 karakter"),
});

export type BookingInput = z.infer<typeof bookingInput>;

type Result =
  | { ok: true; code: string }
  | { ok: false; error: string };

const SLOT_TAKEN: Result = {
  ok: false,
  error: "Maaf, slot itu baru saja diambil. Silakan pilih jam lain.",
};

const GENERIC_ERROR: Result = {
  ok: false,
  error: "Terjadi kesalahan. Silakan coba lagi.",
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function pgCode(err: unknown): string | undefined {
  let e = err as { code?: unknown; cause?: unknown } | undefined;
  for (let i = 0; i < 3 && e; i++) {
    if (typeof e.code === "string") return e.code;
    e = e.cause as { code?: unknown; cause?: unknown } | undefined;
  }
  return undefined;
}

type InsertOutcome =
  | { kind: "ok"; code: string }
  | { kind: "taken" }
  | { kind: "error" };

type InsertParams = {
  serviceId: string;
  serviceName: string;
  price: number;
  durationMinutes: number;
  staffId: string | null;
  startsAt: Date;
  endsAt: Date;
  customerName: string;
  customerPhone: string;
  notes: string | null;
};

async function insertBooking(params: InsertParams): Promise<InsertOutcome> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = randomUUID();
    const code = generateCode();
    try {
      await db.batch([
        db.insert(bookings).values({
          id,
          code,
          serviceId: params.serviceId,
          staffId: params.staffId,
          serviceName: params.serviceName,
          price: params.price,
          durationMinutes: params.durationMinutes,
          startsAt: params.startsAt,
          endsAt: params.endsAt,
          customerName: params.customerName,
          customerPhone: params.customerPhone,
          notes: params.notes,
        }),
        db.insert(bookingStatusHistory).values({
          bookingId: id,
          fromStatus: null,
          toStatus: "pending",
          note: "Booking dibuat pelanggan",
        }),
      ]);
      return { kind: "ok", code };
    } catch (err) {
      const pg = pgCode(err);
      if (pg === "23P01") return { kind: "taken" }; // bentrok (exclusion constraint)
      if (pg === "23505") continue; // kode bentrok, coba kode lain
      console.error("createBooking gagal:", err);
      return { kind: "error" };
    }
  }
  return { kind: "error" };
}

export async function createBooking(input: BookingInput): Promise<Result> {
  const today = todayJakarta();
  if (input.tanggal < today || input.tanggal > addDays(today, MAX_DAYS_AHEAD)) {
    return { ok: false, error: "Tanggal di luar rentang yang bisa dipesan." };
  }

  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.slug, input.layanan), eq(services.isActive, true)))
    .limit(1);
  if (!service) return { ok: false, error: "Layanan tidak tersedia." };

  // Pilihan staf: kosong atau "any" = siapa saja.
  const chosen = input.staf ?? "";
  let preferredStaffId: string | null = null;
  if (chosen !== "" && chosen !== "any") {
    if (!isUuid(chosen)) return { ok: false, error: "Staf tidak valid." };
    preferredStaffId = chosen;
  }

  const slot = await resolveSlot(
    input.tanggal,
    input.jam,
    service.durationMinutes,
    { serviceId: service.id, staffId: preferredStaffId }
  );
  if (!slot.ok) return SLOT_TAKEN;

  const startsAt = jakartaToDate(input.tanggal, input.jam);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60 * 1000);
  const phone = normalizePhone(input.whatsapp);
  if (!phone) return { ok: false, error: "Nomor WhatsApp tidak valid." };

  // Coba staf berurutan. Kalau satu staf keburu diambil orang lain
  // (ditolak constraint), lanjut ke staf kosong berikutnya.
  for (const staffId of slot.staffIds) {
    const outcome = await insertBooking({
      serviceId: service.id,
      serviceName: service.name,
      price: service.price,
      durationMinutes: service.durationMinutes,
      staffId,
      startsAt,
      endsAt,
      customerName: input.nama,
      customerPhone: phone,
      notes: input.catatan || null,
    });

    if (outcome.kind === "ok") return { ok: true, code: outcome.code };
    if (outcome.kind === "error") return GENERIC_ERROR;
    // "taken": coba staf berikutnya
  }

  return SLOT_TAKEN;
}