import "dotenv/config";
import {
  deleteMedia,
  listMedia,
  renameMedia,
  uploadMedia,
} from "../app/lib/media-library.server";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function png(name: string, type = "image/png") {
  return new File([Buffer.from(PNG_BASE64, "base64")], name, { type });
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);

  if (cmd === "delete") {
    if (!arg) throw new Error("Pakai: bun scripts/media-api-check.ts delete ID_DARI_OUTPUT");
    console.log("hapus:", await deleteMedia(arg));
    return;
  }

  console.log(
    "isi bukan gambar (harus gagal):",
    await uploadMedia(new File(["ini bukan gambar"], "palsu.png", { type: "image/png" }), null)
  );
  console.log(
    "terlalu besar (harus gagal):",
    await uploadMedia(
      new File([new Uint8Array(4 * 1024 * 1024 + 1)], "besar.png", { type: "image/png" }),
      null
    )
  );
  console.log(
    "format gif (harus gagal):",
    await uploadMedia(png("x.gif", "image/gif"), null)
  );

  const up = await uploadMedia(png("tes-belleza.png"), null);
  if (!up.ok) throw new Error("Upload valid gagal: " + up.error);
  console.log("upload:", up.item);

  console.log("rename:", await renameMedia(up.item.id, "Tes Belleza", "Gambar tes"));

  const found = await listMedia("belleza");
  console.log(
    "cari 'belleza':",
    found.map((i) => ({ id: i.id, name: i.name, alt: i.altText, url: i.url, usedBy: i.usedBy }))
  );
  console.log("ID untuk tes hapus:", up.item.id);
}

main().catch((err) => {
  console.error("GAGAL:", err);
  process.exit(1);
});