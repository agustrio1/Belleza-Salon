import { Link } from "react-router";
import { asc, eq } from "drizzle-orm";
import type { Route } from "./+types/layanan";
import { db, media, services } from "~/db/index.server";
import { serviceImageUrl } from "~/lib/service-image.server";
import { formatRupiah } from "~/lib/time";
import { ServiceImage } from "~/components/service-image";

export function meta() {
  return [{ title: "Layanan — Belleza Salon" }];
}

export async function loader() {
  const rows = await db
    .select({
      slug: services.slug,
      name: services.name,
      description: services.description,
      price: services.price,
      durationMinutes: services.durationMinutes,
      imageUrl: services.imageUrl,
      mediaKey: media.objectKey,
      mediaAlt: media.altText,
    })
    .from(services)
    .leftJoin(media, eq(services.imageMediaId, media.id))
    .where(eq(services.isActive, true))
    .orderBy(asc(services.sortOrder));

  const list = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    description: r.description,
    price: r.price,
    durationMinutes: r.durationMinutes,
    image: serviceImageUrl(r.mediaKey, r.imageUrl),
    imageAlt: r.mediaAlt || r.name,
  }));

  return { list };
}

export default function Layanan({ loaderData }: Route.ComponentProps) {
  const { list } = loaderData;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <h1 className="text-3xl md:text-4xl">Layanan</h1>
      <p className="mt-2 max-w-xl text-plum-500">
        Pilih perawatan yang kamu butuhkan, lalu atur jadwalnya sendiri.
      </p>

      {list.length === 0 ? (
        <p className="mt-10 rounded-xl border border-blush-100 bg-white p-6 text-plum-500">
          Belum ada layanan yang tersedia.
        </p>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <article
              key={s.slug}
              className="flex flex-col overflow-hidden rounded-2xl border border-blush-100 bg-white shadow-soft"
            >
              <ServiceImage
                src={s.image}
                alt={s.imageAlt}
                className="aspect-4/3 w-full"
              />
              <div className="flex flex-1 flex-col p-6">
                <h2 className="text-xl">{s.name}</h2>
                <p className="mt-2 flex-1 text-sm text-plum-500">{s.description}</p>
                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <p className="text-lg font-semibold">{formatRupiah(s.price)}</p>
                    <p className="text-xs text-plum-500">{s.durationMinutes} menit</p>
                  </div>
                  <Link
                    to={`/booking?layanan=${s.slug}`}
                    className="rounded-full bg-plum-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-plum-700"
                  >
                    Pesan
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}