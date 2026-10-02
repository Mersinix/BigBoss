import { storage } from "./server/storage";
import { db } from "./server/db";
import { users, driverProfiles, deliveryCompanyProfiles } from "./shared/schema";

const PASSWORD = "QaTest1234!";

async function makeUser(role: string, emailPrefix: string) {
  const email = `qa-${emailPrefix}-${Date.now()}@example.test`;
  const hashed = await storage.hashPassword(PASSWORD);
  const [row] = await db.insert(users).values({
    name: `QA ${emailPrefix}`,
    email,
    password: hashed,
    role: role as any,
    status: "approved" as any,
    locationAddress: "1 Rue Test, Tunis",
  }).returning({ id: users.id, email: users.email });
  return row;
}

async function main() {
  const driver = await makeUser("DRIVER", "driver");
  await db.insert(driverProfiles).values({ userId: driver.id, bio: "" });
  console.log("DRIVER", driver.id, driver.email);

  const delivery = await makeUser("DELIVERY_COMPANY", "delivery");
  await db.insert(deliveryCompanyProfiles).values({ userId: delivery.id, description: "" });
  console.log("DELIVERY_COMPANY", delivery.id, delivery.email);

  const owner = await makeUser("CAFE_OWNER", "owner");
  console.log("CAFE_OWNER", owner.id, owner.email);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
