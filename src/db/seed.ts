import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { db } from "./client";
import { leagues } from "./schema";
import { eq } from "drizzle-orm";

async function main() {
  const slug = "demo";
  const existing = await db.select().from(leagues).where(eq(leagues.slug, slug)).limit(1);
  if (existing[0]) {
    console.log(`league "${slug}" already exists: ${existing[0].id}`);
    return;
  }
  const [row] = await db
    .insert(leagues)
    .values({ slug, name: "Demo Pop-a-Shot League" })
    .returning();
  console.log(`created league "${slug}": ${row.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
