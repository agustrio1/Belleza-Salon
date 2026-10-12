import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "~/db/index.server";
import { services, staff, staffServices } from "~/db/schema";
import { BIO_MAX, NAME_MAX } from "~/lib/staff-limits";


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StaffWithServices = typeof staff.$inferSelect & {
  serviceIds: string[];
};

export type ServiceOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export type StaffResult = { ok: true } | { ok: false; error: string };

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function listStaff(): Promise<StaffWithServices[]> {
  const [staffRows, linkRows] = await Promise.all([
    db.select().from(staff).orderBy(desc(staff.isActive), asc(staff.name)),
    db.select().from(staffServices),
  ]);

  const byStaff = new Map<string, string[]>();
  for (const link of linkRows) {
    const list = byStaff.get(link.staffId) ?? [];
    list.push(link.serviceId);
    byStaff.set(link.staffId, list);
  }

  return staffRows.map((row) => ({
    ...row,
    serviceIds: byStaff.get(row.id) ?? [],
  }));
}

export async function listServiceOptions(): Promise<ServiceOption[]> {
  return db
    .select({
      id: services.id,
      name: services.name,
      isActive: services.isActive,
    })
    .from(services)
    .orderBy(asc(services.sortOrder), asc(services.name));
}

function validateFields(name: string, bio: string): string | null {
  if (name.length === 0) return "Nama staf wajib diisi.";
  if (name.length > NAME_MAX) {
    return `Nama staf maksimal ${NAME_MAX} karakter.`;
  }
  if (bio.length > BIO_MAX) {
    return `Bio maksimal ${BIO_MAX} karakter.`;
  }
  return null;
}

// Hanya ID layanan yang benar-benar ada di database yang lolos.
async function filterExistingServiceIds(ids: string[]): Promise<string[]> {
  const candidates = [...new Set(ids.filter(isUuid))];
  if (candidates.length === 0) return [];
  const rows = await db
    .select({ id: services.id })
    .from(services)
    .where(inArray(services.id, candidates));
  return rows.map((row) => row.id);
}

// Sinkronkan layanan staf: hapus yang dilepas, tambah yang baru.
// Tanpa transaksi (driver Neon HTTP tidak mendukungnya), jadi dibuat idempoten.
async function syncStaffServices(staffId: string, serviceIds: string[]) {
  if (serviceIds.length === 0) {
    await db.delete(staffServices).where(eq(staffServices.staffId, staffId));
    return;
  }

  await db
    .delete(staffServices)
    .where(
      and(
        eq(staffServices.staffId, staffId),
        notInArray(staffServices.serviceId, serviceIds)
      )
    );

  await db
    .insert(staffServices)
    .values(serviceIds.map((serviceId) => ({ staffId, serviceId })))
    .onConflictDoNothing();
}

export async function createStaff(input: {
  name: string;
  bio: string;
  serviceIds: string[];
}): Promise<StaffResult> {
  const name = input.name.trim();
  const bio = input.bio.trim();
  const invalid = validateFields(name, bio);
  if (invalid) return { ok: false, error: invalid };

  const serviceIds = await filterExistingServiceIds(input.serviceIds);

  const [created] = await db
    .insert(staff)
    .values({ name, bio })
    .returning({ id: staff.id });

  await syncStaffServices(created.id, serviceIds);
  return { ok: true };
}

export async function updateStaff(
  staffId: string,
  input: { name: string; bio: string; serviceIds: string[] }
): Promise<StaffResult> {
  if (!isUuid(staffId)) return { ok: false, error: "Staf tidak ditemukan." };

  const name = input.name.trim();
  const bio = input.bio.trim();
  const invalid = validateFields(name, bio);
  if (invalid) return { ok: false, error: invalid };

  const serviceIds = await filterExistingServiceIds(input.serviceIds);

  const updated = await db
    .update(staff)
    .set({ name, bio, updatedAt: new Date() })
    .where(eq(staff.id, staffId))
    .returning({ id: staff.id });

  if (updated.length === 0) {
    return { ok: false, error: "Staf tidak ditemukan." };
  }

  await syncStaffServices(staffId, serviceIds);
  return { ok: true };
}

// Staf tidak pernah dihapus, hanya dinonaktifkan agar riwayat booking tetap utuh.
export async function setStaffActive(
  staffId: string,
  isActive: boolean
): Promise<StaffResult> {
  if (!isUuid(staffId)) return { ok: false, error: "Staf tidak ditemukan." };

  const updated = await db
    .update(staff)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(staff.id, staffId))
    .returning({ id: staff.id });

  if (updated.length === 0) {
    return { ok: false, error: "Staf tidak ditemukan." };
  }
  return { ok: true };
}