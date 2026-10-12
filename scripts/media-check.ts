import "dotenv/config";
import {
  deleteObject,
  inspectImage,
  mediaUrl,
  newObjectKey,
  uploadObject,
} from "../app/lib/media.server";

// PNG 1x1
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  const bytes = new Uint8Array(Buffer.from(PNG_BASE64, "base64"));

  const info = inspectImage(bytes);
  console.log("inspectImage:", info);
  if (!info) throw new Error("inspectImage gagal mengenali PNG tes.");

  const key = newObjectKey(info.ext);
  await uploadObject(key, bytes, info.mime);
  console.log("upload OK:", key);

  const url = mediaUrl(key);
  console.log("URL publik:", url);
  if (!url) throw new Error("mediaUrl null: cek env.");

  const res = await fetch(url);
  console.log("GET anonim:", res.status, res.headers.get("content-type"));
  console.log("cache-control:", res.headers.get("cache-control"));

  await deleteObject(key);
  console.log("hapus OK");

  const after = await fetch(url);
  console.log("GET setelah hapus:", after.status);
}

main().catch((err) => {
  console.error("GAGAL:", err);
  process.exit(1);
});