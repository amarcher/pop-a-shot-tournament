import { fal } from "@fal-ai/client";

const IMAGE_GEN_URL = process.env.IMAGE_GEN_URL ?? "http://127.0.0.1:8000";

/**
 * Single-shot identity-preserving image edit: take a normalized selfie buffer
 * and a prompt, return generated JPEG bytes. The baller pipeline calls this
 * once per outcome state with the same selfie buffer, so re-encoding is avoided.
 */
export type ImageEditor = (
  selfie: Buffer,
  prompt: string,
  signal?: AbortSignal
) => Promise<Buffer>;

// Local mflux server (Mac-hosted FLUX.2 Klein). ~30s per portrait.
const localFluxEditor: ImageEditor = async (selfieBuf, prompt, signal) => {
  const fd = new FormData();
  fd.set("prompt", prompt);
  fd.set("width", "1024");
  fd.set("height", "1024");
  fd.set("steps", "4");
  fd.set("guidance", "1.0");
  fd.set(
    "images",
    new Blob([new Uint8Array(selfieBuf)], { type: "image/jpeg" }),
    "selfie.jpg"
  );

  const res = await fetch(`${IMAGE_GEN_URL}/edit`, {
    method: "POST",
    body: fd,
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`/edit returned ${res.status}: ${text.slice(0, 500)}`);
  }
  const out = Buffer.from(await res.arrayBuffer());
  if (out.length < 1024) {
    throw new Error(
      `/edit returned only ${out.length} bytes — likely an error JSON.`
    );
  }
  return out;
};

// Hosted fal.ai FLUX.2 Klein edit. ~2s per portrait, ~$0.01 each.
const falFluxEditor: ImageEditor = async (selfieBuf, prompt, signal) => {
  if (!process.env.FAL_KEY) {
    throw new Error("IMAGE_GEN_PROVIDER=fal but FAL_KEY is not set");
  }
  const selfieBlob = new File(
    [new Uint8Array(selfieBuf)],
    "selfie.jpg",
    { type: "image/jpeg" }
  );
  const imageUrl = await fal.storage.upload(selfieBlob);
  let result;
  try {
    result = await fal.subscribe("fal-ai/flux-2/klein/4b/edit", {
      input: {
        prompt,
        image_urls: [imageUrl],
      },
      logs: false,
    });
  } catch (err) {
    // Expand fal's nested error body so logs aren't just "[Object]".
    const e = err as { status?: number; body?: unknown; message?: string };
    const bodyJson =
      e.body !== undefined ? JSON.stringify(e.body, null, 2) : "(no body)";
    throw new Error(
      `fal.subscribe failed (status=${e.status ?? "?"}): ${e.message ?? "(no msg)"}\n` +
        `prompt(${prompt.length} chars): ${prompt.slice(0, 200)}…\n` +
        `body: ${bodyJson}`
    );
  }
  const outUrl = (
    result.data as { images?: Array<{ url: string }> } | undefined
  )?.images?.[0]?.url;
  if (!outUrl) {
    throw new Error("fal.ai returned no image URL");
  }
  const res = await fetch(outUrl, { signal });
  if (!res.ok) {
    throw new Error(`fetching fal output failed: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
};

export function getImageEditor(): ImageEditor {
  const provider = process.env.IMAGE_GEN_PROVIDER ?? "fal";
  switch (provider) {
    case "local":
      return localFluxEditor;
    case "fal":
      return falFluxEditor;
    default:
      throw new Error(
        `Unknown IMAGE_GEN_PROVIDER: ${provider} (expected "local" or "fal")`
      );
  }
}

// Pre-flight check for the local provider — fail fast with a friendly message
// before kicking off three sequential ~30s edits.
export async function probeImageGen(signal?: AbortSignal): Promise<void> {
  const provider = process.env.IMAGE_GEN_PROVIDER ?? "fal";
  if (provider !== "local") return;
  try {
    const health = await fetch(`${IMAGE_GEN_URL}/health`, {
      cache: "no-store",
      signal,
    });
    if (!health.ok) throw new Error(`status ${health.status}`);
  } catch (err) {
    throw new Error(
      `Local image-gen server not reachable at ${IMAGE_GEN_URL}. ` +
        `Start it on the Mac, or set IMAGE_GEN_PROVIDER=fal. ` +
        `(${(err as Error).message})`
    );
  }
}
