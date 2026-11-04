import { db } from "../../db";
import { eq } from "drizzle-orm";
import { authProviderSettings } from "@shared/schema";

// Stage 2 extraction — Auth Provider Settings domain (Google/Facebook
// sign-in on/off toggles). Moved verbatim out of server/storage.ts's
// DatabaseStorage class; see server/STORAGE_ARCHITECTURE.md ("Stage 2 —
// Batch 9") for the dependency analysis. Zero cross-domain `this.*` calls in
// or out, zero transactions, zero private helpers. server/oauth.ts depends
// on getAuthProviderSettings but only ever through the `storage` instance
// export (never DatabaseStorage/IStorage directly) and only from inside
// already-running request handlers, never at module load or startup, so
// this extraction does not affect authentication behavior or startup.
export class AuthProviderSettingsStorage {
  // Same getOrCreate-singleton pattern as getMessagingSettings/updateMessagingSettings.
  async getAuthProviderSettings() {
    const [row] = await db.select().from(authProviderSettings).limit(1);
    if (row) return { googleEnabled: row.googleEnabled, facebookEnabled: row.facebookEnabled };
    const [created] = await db.insert(authProviderSettings).values({}).returning();
    return { googleEnabled: created.googleEnabled, facebookEnabled: created.facebookEnabled };
  }

  async updateAuthProviderSettings(updates: Partial<{ googleEnabled: boolean; facebookEnabled: boolean }>) {
    const current = await this.getAuthProviderSettings();
    const next = { ...current, ...updates };
    const [row] = await db.select({ id: authProviderSettings.id }).from(authProviderSettings).limit(1);
    if (row) {
      await db.update(authProviderSettings).set({ ...next, updatedAt: new Date() }).where(eq(authProviderSettings.id, row.id));
    } else {
      await db.insert(authProviderSettings).values(next);
    }
    return next;
  }
}
