import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type {
  action as mediaApiAction,
  loader as mediaApiLoader,
} from "~/routes/admin/media-api";
import { ServiceImage } from "~/components/service-image";

export type PickedMedia = {
  id: string;
  url: string | null;
  name: string;
  altText: string;
};

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function PickerDialog({
  currentId,
  onSelect,
  onClose,
}: {
  currentId: string | null;
  onSelect: (m: PickedMedia) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const listFetcher = useFetcher<typeof mediaApiLoader>();

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
    listFetcher.load("/admin/media-api");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = listFetcher.data?.items;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="picker-title"
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-blush-100 bg-white p-0 text-plum-900 shadow-soft backdrop:bg-plum-900/40"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="picker-title" className="text-xl">Pilih dari Media</h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-lg border border-blush-200 px-3 py-1 text-sm hover:bg-blush-50"
          >
            Tutup
          </button>
        </div>

        <div className="mt-4">
          {!items ? (
            <p className="text-sm text-plum-500">Memuat gambar...</p>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-blush-100 p-5 text-sm text-plum-500">
              Belum ada gambar di Media. Tutup dialog ini lalu klik Upload Gambar.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={currentId === item.id}
                    onClick={() => {
                      onSelect({
                        id: item.id,
                        url: item.url,
                        name: item.name,
                        altText: item.altText,
                      });
                      ref.current?.close();
                    }}
                    className={`block w-full overflow-hidden rounded-xl border bg-white text-left transition-shadow hover:shadow-soft ${
                      currentId === item.id
                        ? "border-plum-900 ring-2 ring-plum-900"
                        : "border-blush-100"
                    }`}
                  >
                    <ServiceImage
                      src={item.url}
                      alt={item.altText || item.name}
                      className="aspect-square w-full"
                    />
                    <span className="block truncate px-2 py-2 text-xs font-medium">
                      {item.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}

export function MediaPicker({
  initial,
  legacyUrl,
  error,
}: {
  initial: PickedMedia | null;
  legacyUrl: string | null;
  error?: string;
}) {
  const [selected, setSelected] = useState<PickedMedia | null>(initial);
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const uploadFetcher = useFetcher<typeof mediaApiAction>();
  const inputRef = useRef<HTMLInputElement>(null);
  const handled = useRef<string | null>(null);
  const uploading = uploadFetcher.state !== "idle";

  useEffect(() => {
    if (uploadFetcher.state !== "idle" || !uploadFetcher.data) return;
    if (inputRef.current) inputRef.current.value = "";
    const item = uploadFetcher.data.item;
    if (item && handled.current !== item.id) {
      handled.current = item.id;
      setSelected({
        id: item.id,
        url: item.url,
        name: item.name,
        altText: item.altText,
      });
    }
  }, [uploadFetcher.state, uploadFetcher.data]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
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

    const fd = new FormData();
    fd.set("intent", "upload");
    fd.set("file", file);
    uploadFetcher.submit(fd, {
      method: "post",
      action: "/admin/media-api",
      encType: "multipart/form-data",
    });
  }

  const previewSrc = selected ? selected.url : legacyUrl;
  const previewAlt = selected?.altText || selected?.name || "Gambar layanan";
  const shownError = localError ?? uploadFetcher.data?.error ?? error ?? null;

  return (
    <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start">
      <input type="hidden" name="gambarMediaId" value={selected?.id ?? ""} />

      <ServiceImage
        src={previewSrc}
        alt={previewAlt}
        className="aspect-4/3 w-full shrink-0 rounded-xl border border-blush-100 sm:w-48"
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm text-plum-500">
          {selected
            ? selected.name
            : legacyUrl
              ? "Gambar lama (dari URL). Pilih gambar dari Media untuk menggantinya."
              : "Belum ada gambar."}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-full bg-plum-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-plum-700 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blush-600">
            {uploading ? "Mengunggah..." : "Upload Gambar"}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={onFileChange}
              className="sr-only"
            />
          </label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full border border-blush-200 px-4 py-2 text-sm font-medium transition-colors hover:bg-blush-50"
          >
            {selected ? "Ganti dari Media" : "Pilih dari Media"}
          </button>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-full border border-blush-200 px-4 py-2 text-sm font-medium text-plum-500 transition-colors hover:bg-blush-50"
            >
              Hapus Pilihan
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-plum-500">
          Hapus pilihan hanya melepas gambar dari layanan, file di Media tidak ikut terhapus.
          Perubahan baru tersimpan setelah kamu menekan tombol simpan.
        </p>

        {shownError && (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {shownError}
          </p>
        )}
      </div>

      {open && (
        <PickerDialog
          currentId={selected?.id ?? null}
          onSelect={setSelected}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}