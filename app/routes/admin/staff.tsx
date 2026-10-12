import { data, Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/staff";
import { requireAdmin } from "~/lib/session.server";
import { BIO_MAX, NAME_MAX } from "~/lib/staff-limits";
import {
  createStaff,
  listServiceOptions,
  listStaff,
  setStaffActive,
  updateStaff,
  type ServiceOption,
  type StaffWithServices,
} from "~/lib/staff.server";

export function meta() {
  return [{ title: "Staf — Admin Belleza" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [staffList, serviceOptions] = await Promise.all([
    listStaff(),
    listServiceOptions(),
  ]);
  return { staffList, serviceOptions };
}

export async function action({ request }: Route.ActionArgs) {
  // Action harus cek login sendiri, loader layout tidak melindunginya.
  await requireAdmin(request);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const staffId = String(form.get("staffId") ?? "");
  const name = String(form.get("name") ?? "");
  const bio = String(form.get("bio") ?? "");
  const serviceIds = form.getAll("serviceIds").map(String);

  if (intent === "create") {
    const result = await createStaff({ name, bio, serviceIds });
    if (!result.ok) {
      return data({ error: result.error, message: null }, { status: 400 });
    }
    return { error: null, message: "Staf berhasil ditambahkan." };
  }

  if (intent === "update") {
    const result = await updateStaff(staffId, { name, bio, serviceIds });
    if (!result.ok) {
      return data({ error: result.error, message: null }, { status: 400 });
    }
    return { error: null, message: "Perubahan staf disimpan." };
  }

  if (intent === "activate" || intent === "deactivate") {
    const result = await setStaffActive(staffId, intent === "activate");
    if (!result.ok) {
      return data({ error: result.error, message: null }, { status: 400 });
    }
    return {
      error: null,
      message: intent === "activate" ? "Staf diaktifkan." : "Staf dinonaktifkan.",
    };
  }

  return data({ error: "Aksi tidak dikenali.", message: null }, { status: 400 });
}

const inputClass =
  "mt-1 w-full rounded-lg border border-blush-200 bg-white px-3 py-2 text-sm";

const primaryButton =
  "rounded-full bg-plum-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-60";

const secondaryButton =
  "rounded-full border border-blush-200 px-5 py-2 text-sm font-medium transition-colors hover:bg-blush-50 disabled:opacity-60";

function StaffFields({
  idPrefix,
  options,
  member,
}: {
  idPrefix: string;
  options: ServiceOption[];
  member?: StaffWithServices;
}) {
  const selected = member?.serviceIds ?? [];

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-nama`} className="text-sm font-medium">
          Nama
        </label>
        <input
          id={`${idPrefix}-nama`}
          name="name"
          type="text"
          required
          maxLength={NAME_MAX}
          defaultValue={member?.name ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-bio`} className="text-sm font-medium">
          Bio singkat
        </label>
        <textarea
          id={`${idPrefix}-bio`}
          name="bio"
          rows={3}
          maxLength={BIO_MAX}
          defaultValue={member?.bio ?? ""}
          className={inputClass}
        />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Layanan yang bisa dikerjakan</legend>
        {options.length === 0 ? (
          <p className="mt-2 text-sm text-plum-500">
            Belum ada layanan. Tambahkan layanan dulu di menu Layanan.
          </p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {options.map((option) => (
              <label key={option.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="serviceIds"
                  value={option.id}
                  defaultChecked={selected.includes(option.id)}
                  className="h-4 w-4 rounded border-blush-200"
                />
                <span>
                  {option.name}
                  {option.isActive ? "" : " (nonaktif)"}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}

function StaffCard({
  member,
  options,
  busy,
}: {
  member: StaffWithServices;
  options: ServiceOption[];
  busy: boolean;
}) {
  const serviceNames = options
    .filter((option) => member.serviceIds.includes(option.id))
    .map((option) => option.name);

  return (
    <li className="rounded-xl border border-blush-100 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-sans text-base font-semibold">
            {member.name}
            {!member.isActive && (
              <span className="ml-2 rounded-full bg-plum-500/15 px-2 py-0.5 text-xs font-medium text-plum-700">
                Nonaktif
              </span>
            )}
          </h3>
          <p className="mt-1 text-sm text-plum-500">
            {serviceNames.length > 0
              ? serviceNames.join(", ")
              : "Belum ada layanan yang dipilih."}
          </p>
        </div>

        <Form method="post">
          <input type="hidden" name="staffId" value={member.id} />
          <input
            type="hidden"
            name="intent"
            value={member.isActive ? "deactivate" : "activate"}
          />
          <button type="submit" disabled={busy} className={secondaryButton}>
            {member.isActive ? "Nonaktifkan" : "Aktifkan"}
          </button>
        </Form>
      </div>

      <Link
        to={`/admin/staf/${member.id}`}
        className="mt-3 inline-block text-sm font-medium underline underline-offset-2 hover:text-plum-700"
      >
        Atur jadwal kerja dan cuti
      </Link>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium">
          Ubah data staf
        </summary>
        <Form method="post" className="mt-4 space-y-4">
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="staffId" value={member.id} />
          <StaffFields idPrefix={`staf-${member.id}`} options={options} member={member} />
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Menyimpan..." : "Simpan perubahan"}
          </button>
        </Form>
      </details>
    </li>
  );
}

export default function AdminStaf({ loaderData, actionData }: Route.ComponentProps) {
  const { staffList, serviceOptions } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const error = actionData?.error ?? null;
  const message = actionData?.message ?? null;

  return (
    <div>
      <div>
        <h1 className="text-2xl md:text-3xl">Staf</h1>
        <p className="mt-1 text-sm text-plum-500">
          Kelola terapis dan layanan yang bisa mereka kerjakan. Staf tidak
          dihapus, hanya dinonaktifkan, supaya riwayat booking tetap utuh.
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
        <h2 className="text-xl">Tambah staf</h2>
        <Form method="post" className="mt-4 space-y-4">
          <input type="hidden" name="intent" value="create" />
          <StaffFields idPrefix="staf-baru" options={serviceOptions} />
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Menyimpan..." : "Tambah staf"}
          </button>
        </Form>
      </section>

      <section className="mt-8">
        <h2 className="text-xl">Daftar staf</h2>
        {staffList.length === 0 ? (
          <p className="mt-3 rounded-xl border border-blush-100 bg-white p-6 text-sm text-plum-500">
            Belum ada staf. Tambahkan staf pertama lewat form di atas.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {staffList.map((member) => (
              <StaffCard
                key={member.id}
                member={member}
                options={serviceOptions}
                busy={busy}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}