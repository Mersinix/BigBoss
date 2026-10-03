import { storage } from "./server/storage";
import { db } from "./server/db";
import { users, baristaMarketplaceProfiles } from "./shared/schema";

const PASSWORD = "QaTest1234!";

async function makeUser(role: string, emailPrefix: string, extra: any = {}) {
  const email = `qa-${emailPrefix}-${Date.now()}@example.test`;
  const hashed = await storage.hashPassword(PASSWORD);
  const [row] = await db.insert(users).values({
    name: `QA ${emailPrefix}`,
    email,
    password: hashed,
    role: role as any,
    status: "approved" as any,
    locationAddress: "1 Rue Test, Tunis",
    ...extra,
  }).returning({ id: users.id, email: users.email });
  return row;
}

async function main() {
  const admin = await makeUser("ADMIN", "admin2");
  console.log("ADMIN", admin.id, admin.email);

  const barista = await makeUser("BARISTA_MARKETPLACE", "barista2");
  await db.insert(baristaMarketplaceProfiles).values({ userId: barista.id, bio: "QA barista bio" });
  console.log("BARISTA_MARKETPLACE", barista.id, barista.email);

  const owner = await makeUser("CAFE_OWNER", "owner2");
  console.log("CAFE_OWNER", owner.id, owner.email);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
