import { data, Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/staff-detail";
import { requireAdmin } from "~/lib/session.server";
import { REASON_MAX } from "~/lib/staff-limits";
import {
  addTimeOff,
  addWorkingHours,
  deleteTimeOff,
  deleteWorkingHours,
  getStaffBasic,
  listTimeOff,
  listWorkingHours,
} from "~/lib/staff-schedule.server";

// dayOfWeek: 0 = Minggu ... 6 = Sabtu. Ditampilkan mulai Senin.
const DAYS = [
  { value: 1, label: "Senin" },
  { value: 2, label: "Selasa" },
  { value: 3, label: "Rabu" },
  { value: 4, label: "Kamis" },
  { value: 5, label: "Jumat" },
  { value: 6, label: "Sabtu" },
  { value: 0, label: "Minggu" },
];

function dayLabel(value: number): string {
  return DAYS.find((d) => d.value === value)?.label ?? "Hari";
}

function hhmm(value: string): string {
  return value.slice(0, 5);
}

const dateTimeFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});

export function meta() {
  return [{ title: "Jadwal Staf — Admin Belleza" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const member = await getStaffBasic(params.id);
  if (!member) throw data("Staf tidak ditemukan.", { status: 404 });

  const [hours, timeOff] = await Promise.all([
    listWorkingHours(member.id),
    listTimeOff(member.id),
  ]);
  return { member, hours, timeOff };
}

export async function action({ request, params }: Route.ActionArgs) {
  // Action harus cek login sendiri, loader layout tidak melindunginya.
  await requireAdmin(request);

  const staffId = params.id;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "addHours") {
    const days = form.getAll("days").map((value) => Number(value));
    const startTime = String(form.get("startTime") ?? "");
    const endTime = String(form.get("endTime") ?? "");

    if (days.length === 0) {
      return data({ error: "Pilih minimal satu hari.", message: null }, { status: 400 });
    }

    const added: string[] = [];
    const failed: string[] = [];
    for (const day of days) {
      const result = await addWorkingHours(staffId, {
        dayOfWeek: day,
        startTime,
        endTime,
      });
      if (result.ok) added.push(dayLabel(day));
      else failed.push(`${dayLabel(day)}: ${result.error}`);
    }

    if (added.length === 0) {
      return data({ error: failed.join(" "), message: null }, { status: 400 });
    }
    return {
      error: failed.length > 0 ? `Sebagian gagal. ${failed.join(" ")}` : null,
      message: `Jam kerja ditambahkan untuk ${added.join(", ")}.`,
    };
  }

  if (intent === "deleteHours") {
    const result = await deleteWorkingHours(staffId, String(form.get("rowId") ?? ""));
    if (!result.ok) return data({ error: result.error, message: null }, { status: 400 });
    return { error: null, message: "Jam kerja dihapus." };
  }

  if (intent === "addTimeOff") {
    const result = await addTimeOff(staffId, {
      startsAt: String(form.get("startsAt") ?? ""),
      endsAt: String(form.get("endsAt") ?? ""),
      reason: String(form.get("reason") ?? ""),
    });
    if (!result.ok) return data({ error: result.error, message: null }, { status: 400 });
    return {
      error: result.notice ?? null,
      message: "Cuti ditambahkan.",
    };
  }

  if (intent === "deleteTimeOff") {
    const result = await deleteTimeOff(staffId, String(form.get("rowId") ?? ""));
    if (!result.ok) return data({ error: result.error, message: null }, { status: 400 });
    return { error: null, message: "Cuti dihapus." };
  }

  return data({ error: "Aksi tidak dikenali.", message: null }, { status: 400 });
}

const inputClass =
  "mt-1 w-full rounded-lg border border-blush-200 bg-white px-3 py-2 text-sm";

const primaryButton =
  "rounded-full bg-plum-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-60";

const dangerButton =
  "rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-800 transition-colors hover:bg-red-50 disabled:opacity-60";

function DeleteForm({
  intent,
  rowId,
  confirmText,
  busy,
}: {
  intent: string;
  rowId: string;
  confirmText: string;
  busy: boolean;
}) {
  return (
    <Form
      method="post"
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="rowId" value={rowId} />
      <button type="submit" disabled={busy} className={dangerButton}>
        Hapus
      </button>
    </Form>
  );
}

export default function AdminStaffDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { member, hours, timeOff } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const error = actionData?.error ?? null;
  const message = actionData?.message ?? null;

  return (
    <div>
      <Link to="/admin/staf" className="text-sm text-plum-500 hover:text-plum-900">
        ← Kembali ke daftar staf
      </Link>

      <div className="mt-3">
        <h1 className="text-2xl md:text-3xl">Jadwal {member.name}</h1>
        <p className="mt-1 text-sm text-plum-500">
          Semua jam memakai waktu Jakarta (WIB). Hari tanpa jam kerja dianggap
          libur untuk staf ini.
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      )}

      <section className="mt-6 rounded-xl border border-blush-100 bg-white p-5">
        <h2 className="text-xl">Jam kerja mingguan</h2>

        <ul className="mt-4 divide-y divide-blush-100">
          {DAYS.map((day) => {
            const ranges = hours.filter((row) => row.dayOfWeek === day.value);
            return (
              <li
                key={day.value}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
              >
                <span className="w-20 text-sm font-medium">{day.label}</span>
                {ranges.length === 0 ? (
                  <span className="text-sm text-plum-500">Libur</span>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {ranges.map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center gap-2 rounded-full bg-blush-50 py-1 pl-3 pr-1 text-sm"
                      >
                        <span>
                          {hhmm(row.startTime)}–{hhmm(row.endTime)}
                        </span>
                        <DeleteForm
                          intent="deleteHours"
                          rowId={row.id}
                          confirmText={`Hapus jam kerja ${day.label} ${hhmm(row.startTime)}–${hhmm(row.endTime)}?`}
                          busy={busy}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <Form method="post" className="mt-6 space-y-4 border-t border-blush-100 pt-5">
          <input type="hidden" name="intent" value="addHours" />
          <h3 className="font-sans text-sm font-semibold">Tambah jam kerja</h3>

          <fieldset>
            <legend className="text-sm font-medium">Hari</legend>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {DAYS.map((day) => (
                <label key={day.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="days"
                    value={day.value}
                    className="h-4 w-4 rounded border-blush-200"
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
            <div>
              <label htmlFor="jam-mulai" className="text-sm font-medium">
                Jam mulai
              </label>
              <input
                id="jam-mulai"
                name="startTime"
                type="time"
                required
                defaultValue="09:00"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="jam-selesai" className="text-sm font-medium">
                Jam selesai
              </label>
              <input
                id="jam-selesai"
                name="endTime"
                type="time"
                required
                defaultValue="17:00"
                className={inputClass}
              />
            </div>
          </div>
          <p className="text-xs text-plum-500">
            Untuk jam istirahat, tambahkan dua rentang di hari yang sama, misalnya
            09:00–12:00 dan 13:00–17:00.
          </p>

          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Menyimpan..." : "Tambah jam kerja"}
          </button>
        </Form>
      </section>

      <section className="mt-8 rounded-xl border border-blush-100 bg-white p-5">
        <h2 className="text-xl">Cuti dan tidak masuk</h2>
        <p className="mt-1 text-sm text-plum-500">
          Hanya cuti yang belum berakhir yang ditampilkan.
        </p>

        {timeOff.length === 0 ? (
          <p className="mt-4 text-sm text-plum-500">Belum ada cuti terjadwal.</p>
        ) : (
          <ul className="mt-4 divide-y divide-blush-100">
            {timeOff.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {dateTimeFormat.format(new Date(row.startsAt))} sampai{" "}
                    {dateTimeFormat.format(new Date(row.endsAt))}
                  </p>
                  {row.reason && (
                    <p className="mt-0.5 text-sm text-plum-500">{row.reason}</p>
                  )}
                </div>
                <DeleteForm
                  intent="deleteTimeOff"
                  rowId={row.id}
                  confirmText="Hapus cuti ini?"
                  busy={busy}
                />
              </li>
            ))}
          </ul>
        )}

        <Form method="post" className="mt-6 space-y-4 border-t border-blush-100 pt-5">
          <input type="hidden" name="intent" value="addTimeOff" />
          <h3 className="font-sans text-sm font-semibold">Tambah cuti</h3>

          <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
            <div>
              <label htmlFor="cuti-mulai" className="text-sm font-medium">
                Mulai
              </label>
              <input
                id="cuti-mulai"
                name="startsAt"
                type="datetime-local"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cuti-selesai" className="text-sm font-medium">
                Selesai
              </label>
              <input
                id="cuti-selesai"
                name="endsAt"
                type="datetime-local"
                required
                className={inputClass}
              />
            </div>
          </div>
          <p className="text-xs text-plum-500">
            Untuk cuti seharian, isi dari 00:00 sampai 23:59 pada hari terakhir.
          </p>

          <div className="sm:max-w-xl">
            <label htmlFor="cuti-alasan" className="text-sm font-medium">
              Alasan (opsional)
            </label>
            <input
              id="cuti-alasan"
              name="reason"
              type="text"
              maxLength={REASON_MAX}
              className={inputClass}
            />
          </div>

          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Menyimpan..." : "Tambah cuti"}
          </button>
        </Form>
      </section>
    </div>
  );
}