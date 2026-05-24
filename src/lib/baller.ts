import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { put } from "@vercel/blob";
import sharp from "sharp";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const heicConvert = require("heic-convert") as (args: {
  buffer: ArrayBufferLike | Uint8Array;
  format: "JPEG" | "PNG";
  quality?: number;
}) => Promise<ArrayBufferLike>;

import {
  buildBallerPrompt,
  type BallerArchetype,
  type BallerState,
} from "./baller-types";
import { getImageEditor, probeImageGen } from "./image-gen";

export { buildBallerPrompt };

// ---------------- Selfie normalization ----------------

/**
 * Detect HEIC/HEIF by ISO BMFF box magic. iOS strips the MIME type from
 * direct camera uploads, so we sniff bytes 4-7 == "ftyp" + brand 8-11.
 */
function isHeic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12);
  return [
    "heic",
    "heix",
    "hevc",
    "hevx",
    "mif1",
    "msf1",
    "heim",
    "heis",
  ].includes(brand);
}

/**
 * Normalize any phone-friendly input (HEIC, HEIF, JPEG, PNG, WebP) into a
 * 1024×1024 letterboxed JPEG. Sharp's bundled libheif can't decode HEVC on
 * Apple Silicon, so HEIC inputs go through heic-convert first.
 *
 * `fit: contain` keeps the whole frame so we never chop a face out of an
 * off-center selfie.
 */
async function selfieToSquareJpeg(input: Buffer): Promise<Buffer> {
  let decoded = input;
  if (isHeic(input)) {
    const out = await heicConvert({
      buffer: input,
      format: "JPEG",
      quality: 0.95,
    });
    decoded = Buffer.from(out as ArrayBuffer);
  }
  return sharp(decoded, { failOn: "none" })
    .rotate() // honor EXIF orientation
    .resize({
      width: 1024,
      height: 1024,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

// ---------------- Blob upload ----------------

/**
 * Persist a generated JPEG and return the DB-bound URL.
 *
 * In prod (BLOB_READ_WRITE_TOKEN set): writes to Vercel Blob with the stable
 * key + allowOverwrite so a regen reuses the same Blob object. Cache-buster
 * suffix pushes new bytes through the browser cache.
 *
 * In dev (no Blob token): writes to `.local/avatars/<key>` on disk and
 * returns a `/avatars/<key>?v=…` URL that the matching route handler serves.
 * Stays out of `public/` so Next's build manifest doesn't snapshot it.
 */
async function uploadPortrait(
  blobKey: string,
  buf: Buffer
): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const result = await put(blobKey, buf, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/jpeg",
    });
    return `${result.url}?v=${Date.now()}`;
  }

  // Local-disk fallback. Keep the same `avatars/<id>/<state>.jpg` key shape
  // so swapping providers later doesn't change DB rows.
  const fsRoot = join(process.cwd(), ".local");
  const target = join(fsRoot, blobKey);
  const dir = target.slice(0, target.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await writeFile(target, buf);
  // The route handler at /avatars/[playerId]/[state] reads from .local/avatars.
  return `/${blobKey.replace(/\.jpg$/, "")}?v=${Date.now()}`;
}

// ---------------- Pipeline ----------------

export type BallerVariantResult = {
  selfieUrl: string;
  avatarNeutralUrl: string;
  avatarVictoryUrl: string;
  avatarDefeatedUrl: string;
};

export async function generateBallerVariantsFromSelfie(args: {
  playerId: string;
  selfie: File;
  archetype: BallerArchetype;
  freeform?: string;
  signal?: AbortSignal;
}): Promise<BallerVariantResult> {
  const { playerId, selfie, archetype, freeform, signal } = args;

  const rawBuf = Buffer.from(await selfie.arrayBuffer());
  const selfieBuf = await selfieToSquareJpeg(rawBuf);

  await probeImageGen(signal);

  // Three sequential /edit calls, same input buffer, three state-specific
  // prompts. ~6s total on fal.ai or ~90s on local mflux.
  const states: BallerState[] = ["neutral", "victory", "defeated"];
  const buffers: Record<BallerState, Buffer> = {} as Record<
    BallerState,
    Buffer
  >;
  const edit = getImageEditor();
  for (const state of states) {
    const prompt = buildBallerPrompt(archetype, freeform, state);
    buffers[state] = await edit(selfieBuf, prompt, signal);
  }

  // Stable per-player blob keys. Regen overwrites in place; the ?v= suffix
  // pushes new bytes through the browser cache.
  const [selfieUrl, neutralUrl, victoryUrl, defeatedUrl] = await Promise.all([
    uploadPortrait(`avatars/${playerId}/selfie.jpg`, selfieBuf),
    uploadPortrait(`avatars/${playerId}/neutral.jpg`, buffers.neutral),
    uploadPortrait(`avatars/${playerId}/victory.jpg`, buffers.victory),
    uploadPortrait(`avatars/${playerId}/defeated.jpg`, buffers.defeated),
  ]);

  return {
    selfieUrl,
    avatarNeutralUrl: neutralUrl,
    avatarVictoryUrl: victoryUrl,
    avatarDefeatedUrl: defeatedUrl,
  };
}
