import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type AllowedMime = keyof typeof EXT_BY_MIME;

export type ImageInfo = {
  mime: AllowedMime;
  ext: string;
  width: number;
  height: number;
};

const MAX_DIMENSION = 10000;

function validDims(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_DIMENSION &&
    height <= MAX_DIMENSION
  );
}

function ascii(b: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...b.slice(start, end));
}

function readPng(b: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((v, i) => b[i] === v)) return null;
  if (ascii(b, 12, 16) !== "IHDR") return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpeg(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Marker tanpa panjang
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (b[i + 2] << 8) | b[i + 3];
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      return { width, height };
    }
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

function readWebp(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null;
  if (ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 12) !== "WEBP") return null;
  const chunk = ascii(b, 12, 16);

  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return {
      width: (b[26] | (b[27] << 8)) & 0x3fff,
      height: (b[28] | (b[29] << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    return {
      width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
      height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
    };
  }
  if (chunk === "VP8X") {
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  return null;
}

// Mengenali jenis gambar dari ISI file (bukan Content-Type dari browser).
export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  const candidates: [AllowedMime, { width: number; height: number } | null][] = [
    ["image/png", readPng(bytes)],
    ["image/jpeg", readJpeg(bytes)],
    ["image/webp", readWebp(bytes)],
  ];

  for (const [mime, dims] of candidates) {
    if (dims && validDims(dims.width, dims.height)) {
      return { mime, ext: EXT_BY_MIME[mime], width: dims.width, height: dims.height };
    }
  }
  return null;
}

type Config = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

function readConfig(): Config | null {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.MEDIA_BUCKET;
  if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { endpoint: endpoint.replace(/\/+$/, ""), region, accessKeyId, secretAccessKey, bucket };
}

let cached: { client: S3Client; config: Config } | null = null;

function getStorage() {
  if (cached) return cached;
  const config = readConfig();
  if (!config) {
    throw new Error(
      "Storage belum dikonfigurasi: isi AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, dan MEDIA_BUCKET."
    );
  }
  try {
    new URL(config.endpoint);
  } catch {
    throw new Error(
      `AWS_ENDPOINT_URL_S3 tidak valid (diawali "${config.endpoint.slice(0, 12)}", panjang ${config.endpoint.length} karakter).`
    );
  }
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    maxAttempts: 4, // retry otomatis, termasuk saat 503 SlowDown
  });
  cached = { client, config };
  return cached;
}

// Key unik per upload. Ganti gambar = key baru, jangan menimpa yang lama.
export function newObjectKey(ext: string): string {
  return `media/${randomUUID()}.${ext}`;
}

export async function uploadObject(
  key: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  const { client, config } = getStorage();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

export async function deleteObject(key: string): Promise<void> {
  const { client, config } = getStorage();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

// URL publik (bucket public_read). Null kalau storage belum dikonfigurasi,
// supaya halaman publik jatuh ke placeholder alih-alih error.
export function mediaUrl(key: string): string | null {
  const config = readConfig();
  if (!config) return null;
  return `${config.endpoint}/${config.bucket}/${key}`;
}