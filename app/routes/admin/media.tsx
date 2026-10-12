import { useEffect, useRef, useState } from "react";
import { Form, Link, useFetcher, useNavigation } from "react-router";
import type { Route } from "./+types/media";
import type { action as mediaApiAction } from "./media-api";
import { requireAdmin } from "~/lib/session.server";
import { listMedia } from "~/lib/media-library.server";
import { mediaUrl } from "~/lib/media.server";
import { formatTanggal } from "~/lib/time";

export function meta() {
  return [{ title: "Media — Admin Belleza" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 50);
  const items = await listMedia(q);

  return { items, q, storageReady: mediaUrl("cek") !== null };
}

type Item = Route.ComponentProps["loaderData"]["items"][number];

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-blush-200 bg-white px-3 py-2 text-sm";

function UploadForm() {
  const fetcher = useFetcher<typeof mediaApiAction>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const uploading = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [fetcher.state, fetcher.data]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setLocalError("Format file harus JPEG, PNG, atau WebP.");
      input.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("Ukuran file maksimal 4 MB.");
      input.value = "";
      return;
    }
    setLocalError(null);
    input.form?.requestSubmit();
  }

  const error = localError ?? fetcher.data?.error ?? null;
  const success = !localError && !error && fetcher.data?.item && !uploading;

  return (
    <div>
      <fetcher.Form
        method="post"
        action="/admin/media-api"
        encType="multipart/form-data"
      >
        <input type="hidden" name="intent" value="upload" />
        <label className="inline-flex cursor-pointer items-center rounded-full bg-plum-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-plum-700 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blush-600">
          {uploading ? "Mengunggah..." : "Upload Gambar"}
          <input
            ref={inputRef}
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={onChange}
            className="sr-only"
          />
        </label>
      </fetcher.Form>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Gambar berhasil diunggah.
        </p>
      )}
    </div>
  );
}

function MediaDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const renameFetcher = useFetcher<typeof mediaApiAction>();
  const deleteFetcher = useFetcher<typeof mediaApiAction>();

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  const inUse = item.usedBy.length > 0;
  const renaming = renameFetcher.state !== "idle";
  const deleting = deleteFetcher.state !== "idle";
  const renamed =
    renameFetcher.state === "idle" && renameFetcher.data && !renameFetcher.data.error;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="media-dialog-title"
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-blush-100 bg-white p-0 text-plum-900 shadow-soft backdrop:bg-plum-900/40"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="media-dialog-title" className="text-xl">Detail gambar</h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-lg border border-blush-200 px-3 py-1 text-sm hover:bg-blush-50"
          >
            Tutup
          </button>
        </div>

        <div className="mt-4 flex min-h-40 items-center justify-center rounded-lg bg-ivory-dark">
          {item.url ? (
            <img
              src={item.url}
              alt={item.altText || item.name}
              className="max-h-72 w-full rounded-lg object-contain"
            />
          ) : (
            <p className="p-6 text-sm text-plum-500">
              Pratinjau tidak tersedia (penyimpanan belum dikonfigurasi).
            </p>
          )}
        </div>

        <p className="mt-3 text-xs text-plum-500">
          {item.width} × {item.height} px · {formatBytes(item.sizeBytes)} · diunggah{" "}
          {formatTanggal(item.createdAt)}
        </p>

        <renameFetcher.Form method="post" action="/admin/media-api" className="mt-5 space-y-4">
          <input type="hidden" name="intent" value="rename" />
          <input type="hidden" name="id" value={item.id} />
          <div>
            <label htmlFor="media-nama" className="text-sm font-medium">Nama</label>
            <input
              id="media-nama"
              name="nama"
              type="text"
              required
              maxLength={80}
              defaultValue={item.name}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="media-alt" className="text-sm font-medium">
              Teks alternatif
            </label>
            <input
              id="media-alt"
              name="alt"
              type="text"
              maxLength={200}
              defaultValue={item.altText}
              placeholder="Deskripsi singkat isi gambar"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-plum-500">
              Dibacakan oleh pembaca layar dan tampil jika gambar gagal dimuat.
            </p>
          </div>

          {renameFetcher.data?.error && (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
              {renameFetcher.data.error}
            </p>
          )}
          {renamed && (
            <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Perubahan disimpan.
            </p>
          )}

          <button
            type="submit"
            disabled={renaming || deleting}
            className="rounded-full bg-plum-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-plum-700 disabled:opacity-60"
          >
            {renaming ? "Menyimpan..." : "Simpan"}
          </button>
        </renameFetcher.Form>

        <div className="mt-6 border-t border-blush-100 pt-5">
          <h3 className="font-sans text-sm font-semibold">Penggunaan</h3>
          {inUse ? (
            <p className="mt-2 text-sm text-plum-500">
              Dipakai oleh: {item.usedBy.join(", ")}. Lepaskan dulu dari layanan
              untuk bisa menghapusnya.
            </p>
          ) : (
            <p className="mt-2 text-sm text-plum-500">Belum dipakai layanan mana pun.</p>
          )}

          {deleteFetcher.data?.error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
              {deleteFetcher.data.error}
            </p>
          )}

          <deleteFetcher.Form
            method="post"
            action="/admin/media-api"
            onSubmit={(e) => {
              if (!window.confirm("Hapus gambar ini? Tindakan ini tidak bisa diurungkan.")) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              disabled={inUse || deleting || renaming}
              className="mt-3 rounded-full border border-red-300 px-5 py-2 text-sm font-medium text-red-800 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Menghapus..." : "Hapus Gambar"}
            </button>
          </deleteFetcher.Form>
        </div>
      </div>
    </dialog>
  );
}

export default function AdminMedia({ loaderData }: Route.ComponentProps) {
  const { items, q, storageReady } = loaderData;
  const navigation = useNavigation();
  const loading = navigation.state === "loading";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl">Media</h1>
          <p className="mt-1 text-sm text-plum-500">
            Gambar yang bisa dipakai untuk layanan salon. Format JPEG, PNG, atau
            WebP, maksimal 4 MB.
          </p>
        </div>
        <UploadForm />
      </div>

      {!storageReady && (
        <p role="alert" className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Penyimpanan gambar belum dikonfigurasi di environment ini, jadi upload
          tidak akan berhasil dan pratinjau tidak tampil.
        </p>
      )}

      <Form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label htmlFor="q" className="text-sm font-medium">Cari nama</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          className="rounded-full bg-plum-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-plum-700"
        >
          Cari
        </button>
        {q && (
          <Link
            to="/admin/media"
            className="rounded-full border border-blush-200 px-5 py-2 text-sm font-medium transition-colors hover:bg-blush-50"
          >
            Reset
          </Link>
        )}
      </Form>

      <div className={`mt-6 ${loading ? "opacity-60" : ""}`}>
        {items.length === 0 ? (
          <p className="rounded-xl border border-blush-100 bg-white p-6 text-sm text-plum-500">
            {q
              ? "Tidak ada gambar dengan nama itu."
              : "Belum ada gambar. Klik Upload Gambar untuk mengunggah gambar pertama."}
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-plum-500">{items.length} gambar</p>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="block w-full overflow-hidden rounded-xl border border-blush-100 bg-white text-left transition-shadow hover:shadow-soft"
                  >
                    <span className="flex aspect-square items-center justify-center bg-ivory-dark">
                      {item.url ? (
                        <img
                          src={item.url}
                          alt={item.altText || item.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="px-2 text-center text-xs text-plum-500">
                          Tanpa pratinjau
                        </span>
                      )}
                    </span>
                    <span className="block p-3">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="mt-0.5 block text-xs text-plum-500">
                        {item.width} × {item.height} · {formatBytes(item.sizeBytes)}
                      </span>
                      <span
                        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.usedBy.length > 0
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-plum-500/15 text-plum-700"
                        }`}
                      >
                        {item.usedBy.length > 0 ? "Dipakai" : "Belum dipakai"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {selected && (
        <MediaDialog
          key={selected.id}
          item={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}