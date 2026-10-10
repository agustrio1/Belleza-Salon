import { Link } from "react-router";
import { asc, eq } from "drizzle-orm";
import type { Route } from "./+types/home";
import {
  businessHours,
  businessSettings,
  db,
  services,
} from "~/db/index.server";
import { formatRupiah, MAX_DAYS_AHEAD } from "~/lib/time";

export function meta() {
  return [
    { title: "Belleza Salon — Perawatan Kecantikan & Reservasi Online" },
    {
      name: "description",
      content:
        "Booking facial, hair treatment, manicure, pedicure, dan makeup di Belleza Salon. Pilih jadwal sendiri, tanpa antre.",
    },
  ];
}

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export async function loader() {
  const [featured, hoursRows, settingsRows] = await Promise.all([
    db
      .select({
        slug: services.slug,
        name: services.name,
        description: services.description,
        price: services.price,
        durationMinutes: services.durationMinutes,
      })
      .from(services)
      .where(eq(services.isActive, true))
      .orderBy(asc(services.sortOrder))
      .limit(4),
    db.select().from(businessHours),
    db
      .select()
      .from(businessSettings)
      .where(eq(businessSettings.id, 1))
      .limit(1),
  ]);

  const hours = DISPLAY_ORDER.map((day) => {
    const row = hoursRows.find((h) => h.dayOfWeek === day);
    return {
      day,
      name: DAY_NAMES[day],
      closed: !row || row.isClosed,
      open: row ? row.openTime.slice(0, 5) : "",
      close: row ? row.closeTime.slice(0, 5) : "",
    };
  });

  const settings = settingsRows[0];
  return {
    featured,
    hours,
    address: settings?.address ?? "",
    phone: settings?.phone ?? "",
    minLeadMinutes: settings?.minLeadMinutes ?? 60,
  };
}

const steps = [
  { title: "Pilih layanan", text: "Tentukan perawatan yang kamu inginkan." },
  { title: "Pilih jadwal", text: "Pilih tanggal dan jam yang masih tersedia." },
  { title: "Isi data", text: "Cukup nama dan nomor WhatsApp." },
  { title: "Terima kode", text: "Simpan kode booking untuk cek status kapan saja." },
];

function leadText(minutes: number): string {
  if (minutes <= 0) return "kapan saja selama slot masih tersedia";
  if (minutes % 60 === 0) return `minimal ${minutes / 60} jam sebelum jadwal`;
  return `minimal ${minutes} menit sebelum jadwal`;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { featured, hours, address, phone, minLeadMinutes } = loaderData;

  const faqs = [
    {
      q: "Bagaimana cara booking?",
      a: "Pilih layanan, tanggal, dan jam di halaman Booking, lalu isi nama dan nomor WhatsApp. Setelah terkirim, kamu mendapat kode booking.",
    },
    {
      q: "Apakah booking langsung dikonfirmasi?",
      a: "Belum. Reservasi berstatus menunggu konfirmasi sampai admin salon mengonfirmasinya. Kamu bisa memantau statusnya di halaman Cek Booking.",
    },
    {
      q: "Bagaimana cara mengecek status booking?",
      a: "Buka halaman Cek Booking, lalu isi kode booking dan nomor WhatsApp yang kamu pakai saat reservasi.",
    },
    {
      q: "Kapan saya bisa memesan?",
      a: `Slot bisa dipesan ${leadText(minLeadMinutes)}, dan sampai ${MAX_DAYS_AHEAD} hari ke depan.`,
    },
    {
      q: "Bagaimana kalau ingin membatalkan?",
      a: "Pembatalan dilakukan oleh admin salon. Hubungi salon dan sebutkan kode booking kamu, lalu kamu bisa membuat booking baru di jadwal lain.",
    },
  ];

  return (
    <>
      <section className="bg-blush-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-28">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-blush-600">
              Salon kecantikan
            </p>
            <h1 className="mt-4 text-4xl leading-tight md:text-6xl">
              Waktunya merawat diri, tanpa repot antre.
            </h1>
            <p className="mt-5 text-lg text-plum-500">
              Facial, perawatan rambut, kuku, alis, hingga makeup. Pilih layanan,
              tentukan jadwal sendiri, dan reservasi dalam hitungan menit.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/booking"
                className="rounded-full bg-plum-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-plum-700"
              >
                Booking Sekarang
              </Link>
              <Link
                to="/layanan"
                className="rounded-full border border-blush-200 bg-white px-6 py-3 text-sm font-medium transition-colors hover:bg-blush-50"
              >
                Lihat Semua Layanan
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl">Layanan unggulan</h2>
            <p className="mt-2 text-plum-500">Beberapa perawatan yang paling sering dipilih.</p>
          </div>
          <Link to="/layanan" className="hidden text-sm font-medium text-blush-600 hover:underline sm:block">
            Semua layanan →
          </Link>
        </div>

        {featured.length === 0 ? (
          <p className="mt-8 rounded-xl border border-blush-100 bg-white p-6 text-sm text-plum-500">
            Belum ada layanan yang tersedia.
          </p>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((s) => (
              <article
                key={s.slug}
                className="flex flex-col rounded-2xl border border-blush-100 bg-white p-5 shadow-soft"
              >
                <h3 className="text-lg">{s.name}</h3>
                <p className="mt-2 flex-1 text-sm text-plum-500">{s.description}</p>
                <div className="mt-4">
                  <p className="font-semibold">{formatRupiah(s.price)}</p>
                  <p className="text-xs text-plum-500">{s.durationMinutes} menit</p>
                </div>
                <Link
                  to={`/booking?layanan=${s.slug}`}
                  className="mt-4 rounded-full border border-blush-200 py-2 text-center text-sm font-medium transition-colors hover:bg-blush-50"
                >
                  Pesan
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bg-ivory-dark">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl md:text-3xl">Alur reservasi</h2>
          <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl bg-white p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush-100 text-sm font-semibold text-blush-600">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-sans text-base font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-plum-500">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl md:text-3xl">Jam operasional</h2>
            <dl className="mt-6 divide-y divide-blush-100 rounded-2xl border border-blush-100 bg-white">
              {hours.map((h) => (
                <div key={h.day} className="flex justify-between gap-4 px-5 py-3 text-sm">
                  <dt className="font-medium">{h.name}</dt>
                  <dd className={h.closed ? "text-plum-500" : ""}>
                    {h.closed ? "Tutup" : `${h.open} – ${h.close}`}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-plum-500">Waktu Indonesia Barat (WIB).</p>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl">Lokasi</h2>
            <div className="mt-6 rounded-2xl border border-blush-100 bg-white p-5 text-sm">
              <p>{address || "Alamat belum diatur."}</p>
              {phone && <p className="mt-2 text-plum-500">{phone}</p>}
              <p className="mt-4 rounded-lg bg-blush-50 px-3 py-2 text-xs text-plum-500">
                Data simulasi untuk demo, bukan alamat bisnis nyata.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-ivory-dark">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-2xl md:text-3xl">Pertanyaan umum</h2>
          <div className="mt-8 divide-y divide-blush-100 rounded-2xl border border-blush-100 bg-white">
            {faqs.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
                  {f.q}
                </summary>
                <p className="mt-2 text-sm text-plum-500">{f.a}</p>
              </details>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              to="/booking"
              className="inline-block rounded-full bg-plum-900 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-plum-700"
            >
              Booking Sekarang
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}