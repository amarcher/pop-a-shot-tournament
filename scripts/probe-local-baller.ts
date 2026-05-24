// One-shot probe: confirm IMAGE_GEN_PROVIDER=local end-to-end can produce
// a single baller portrait from a sample selfie. No DB writes, no Blob —
// writes the result to .tmp/probe-baller.jpg so you can eyeball it.
//
// Usage:
//   IMAGE_GEN_PROVIDER=local npx tsx scripts/probe-local-baller.ts <path-to-selfie.jpg>

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

process.env.IMAGE_GEN_PROVIDER = "local"; // force, regardless of .env.local

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildBallerPrompt } from "../src/lib/baller-types";
import { getImageEditor } from "../src/lib/image-gen";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: tsx scripts/probe-local-baller.ts <selfie.jpg>");
    process.exit(1);
  }
  const { readFile } = await import("node:fs/promises");
  const selfie = await readFile(resolve(path));
  console.log(`read ${selfie.length} bytes from ${path}`);

  const prompt = buildBallerPrompt("allstar", undefined, "victory");
  console.log("prompt:", prompt.slice(0, 100), "…");

  const start = Date.now();
  const edit = getImageEditor();
  const out = await edit(
    Buffer.from(selfie),
    prompt,
    AbortSignal.timeout(120_000)
  );
  console.log(`got ${out.length} bytes in ${Date.now() - start}ms`);

  await writeFile(".tmp/probe-baller.jpg", out);
  console.log("wrote .tmp/probe-baller.jpg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
