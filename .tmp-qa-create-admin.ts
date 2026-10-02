import { storage } from "./server/storage";
import { db } from "./server/db";
import { users } from "./shared/schema";

const EMAIL = "qa-publication-admin@example.test";
const PASSWORD = "QaTest1234!";

async function main() {
  const existing = await storage.getUserByEmail(EMAIL);
  if (existing) {
    console.log("already exists, id=" + existing.id);
    return;
  }
  const hashed = await storage.hashPassword(PASSWORD);
  const [row] = await db.insert(users).values({
    name: "QA Publication Admin",
    email: EMAIL,
    password: hashed,
    role: "ADMIN" as any,
    status: "approved" as any,
  }).returning({ id: users.id });
  console.log("created admin id=" + row.id);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
