import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { del, put } from "@vercel/blob";
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
export async function normalizeSelfieToSquareJpeg(
  input: Buffer
): Promise<Buffer> {
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
 * In prod (BLOB_READ_WRITE_TOKEN set): writes immutable per-generation Blob
 * keys. We do not overwrite existing portrait blobs because CDN propagation
 * can otherwise leave one state showing old bytes while another shows new.
 *
 * In dev (no Blob token): writes to `.local/avatars/<key>` on disk and
 * returns a `/avatars/<key>` URL that the matching route handler serves.
 * Stays out of `public/` so Next's build manifest doesn't snapshot it.
 */
async function uploadPortrait(blobKey: string, buf: Buffer): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const result = await put(blobKey, buf, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "image/jpeg",
    });
    return result.url;
  }

  const fsRoot = join(process.cwd(), ".local");
  const target = join(fsRoot, blobKey);
  const dir = target.slice(0, target.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await writeFile(target, buf);
  // The route handler at /avatars/[playerId]/[state] reads from .local/avatars.
  return `/${blobKey.replace(/\.jpg$/, "")}`;
}

export async function uploadBallerSelfie(
  playerId: string,
  selfieBuf: Buffer
): Promise<string> {
  return uploadPortrait(
    `avatars/${playerId}/selfie-${randomUUID()}.jpg`,
    selfieBuf
  );
}

export async function loadBallerSelfieFromUrl(
  playerId: string,
  selfieUrl: string,
  signal?: AbortSignal
): Promise<Buffer> {
  if (selfieUrl.startsWith("/avatars/")) {
    const pathname = new URL(selfieUrl, "http://local").pathname;
    const filename = pathname.split("/").pop() ?? "selfie.jpg";
    return readFile(
      join(process.cwd(), ".local", "avatars", playerId, `${filename}.jpg`)
    );
  }

  const response = await fetch(selfieUrl, { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(`Could not load saved seed image (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteBallerAssets(urls: Array<string | null | undefined>) {
  const uniqueUrls = [...new Set(urls.filter((url): url is string => !!url))];
  const results = await Promise.allSettled(
    uniqueUrls.map(async (url) => {
      if (url.startsWith("/avatars/")) {
        const pathname = new URL(url, "http://local").pathname;
        const [, , playerId, state] = pathname.split("/");
        if (!playerId || !state) return;
        try {
          await unlink(
            join(process.cwd(), ".local", "avatars", playerId, `${state}.jpg`)
          );
        } catch (err) {
          if (
            !(err instanceof Error) ||
            !("code" in err) ||
            err.code !== "ENOENT"
          ) {
            throw err;
          }
        }
        return;
      }

      const blobUrl = new URL(url);
      blobUrl.search = "";
      await del(blobUrl.toString());
    })
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(
        "[baller-gen] failed to delete superseded asset:",
        result.reason
      );
    }
  }
}

// ---------------- Pipeline ----------------

export type BallerVariantResult = {
  selfieUrl: string;
  avatarNeutralUrl: string;
  avatarVictoryUrl: string;
  avatarDefeatedUrl: string;
};

export async function generateBallerAvatarVariants(args: {
  playerId: string;
  selfieBuf: Buffer;
  archetype: BallerArchetype;
  freeform?: string;
  signal?: AbortSignal;
}): Promise<Omit<BallerVariantResult, "selfieUrl">> {
  const { playerId, selfieBuf, archetype, freeform, signal } = args;
  await probeImageGen(signal);

  // Three sequential /edit calls, same input buffer, three state-specific
  // prompts. ~6s total on fal.ai or ~90s on local mflux.
  const states: BallerState[] = ["neutral", "victory", "defeated"];
  const buffers: Record<BallerState, Buffer> = {} as Record<
    BallerState,
    Buffer
  >;
  const edit = getImageEditor();
  const generationId = randomUUID();
  for (const state of states) {
    const prompt = buildBallerPrompt(archetype, freeform, state, playerId);
    buffers[state] = await edit(selfieBuf, prompt, signal);
  }

  // Upload every new state under immutable keys, then the caller swaps DB URLs
  // in one update only after all three assets are confirmed written.
  const [neutralUrl, victoryUrl, defeatedUrl] = await Promise.all([
    uploadPortrait(
      `avatars/${playerId}/neutral-${generationId}.jpg`,
      buffers.neutral
    ),
    uploadPortrait(
      `avatars/${playerId}/victory-${generationId}.jpg`,
      buffers.victory
    ),
    uploadPortrait(
      `avatars/${playerId}/defeated-${generationId}.jpg`,
      buffers.defeated
    ),
  ]);

  return {
    avatarNeutralUrl: neutralUrl,
    avatarVictoryUrl: victoryUrl,
    avatarDefeatedUrl: defeatedUrl,
  };
}

export async function generateBallerVariantsFromSelfie(args: {
  playerId: string;
  selfie: File;
  archetype: BallerArchetype;
  freeform?: string;
  signal?: AbortSignal;
}): Promise<BallerVariantResult> {
  const { playerId, selfie, archetype, freeform, signal } = args;
  const rawBuf = Buffer.from(await selfie.arrayBuffer());
  const selfieBuf = await normalizeSelfieToSquareJpeg(rawBuf);
  const [selfieUrl, avatars] = await Promise.all([
    uploadBallerSelfie(playerId, selfieBuf),
    generateBallerAvatarVariants({
      playerId,
      selfieBuf,
      archetype,
      freeform,
      signal,
    }),
  ]);

  return { selfieUrl, ...avatars };
}
