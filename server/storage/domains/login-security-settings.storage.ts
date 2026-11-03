import { db } from "../../db";
import { eq } from "drizzle-orm";
import { loginSecuritySettings } from "@shared/schema";

// Stage 2 extraction — Login Security Settings domain (lockout / rate-limit /
// password-length / session-timeout admin configuration). Moved verbatim
// out of server/storage.ts's DatabaseStorage class; see
// server/STORAGE_ARCHITECTURE.md ("Stage 2 — Batch 10") for the dependency
// analysis. Zero cross-domain `this.*` calls in or out, zero transactions.
// Consumed from 10 call sites across 4 files, including the global
// session-inactivity-timeout middleware in server/routes.ts — all verified
// to go through the `storage` instance only, and all from inside
// already-running request handlers, never at module load/startup, so this
// extraction does not affect middleware behavior or application startup.
export class LoginSecuritySettingsStorage {
  // Same getOrCreate-singleton pattern as getAuthProviderSettings/updateAuthProviderSettings.
  private toLoginSecuritySettingsShape(row: typeof loginSecuritySettings.$inferSelect) {
    return {
      lockoutEnabled: row.lockoutEnabled,
      maxFailedAttempts: row.maxFailedAttempts,
      cooldownSeconds: row.cooldownSeconds,
      rateLimitEnabled: row.rateLimitEnabled,
      rateLimitMaxRequests: row.rateLimitMaxRequests,
      rateLimitWindowSeconds: row.rateLimitWindowSeconds,
      passwordMinLength: row.passwordMinLength,
      sessionInactivityTimeoutSeconds: row.sessionInactivityTimeoutSeconds ?? null,
    };
  }

  async getLoginSecuritySettings() {
    const [row] = await db.select().from(loginSecuritySettings).limit(1);
    if (row) return this.toLoginSecuritySettingsShape(row);
    const [created] = await db.insert(loginSecuritySettings).values({}).returning();
    return this.toLoginSecuritySettingsShape(created);
  }

  async updateLoginSecuritySettings(updates: Partial<{
    lockoutEnabled: boolean; maxFailedAttempts: number; cooldownSeconds: number;
    rateLimitEnabled: boolean; rateLimitMaxRequests: number; rateLimitWindowSeconds: number;
    passwordMinLength: number; sessionInactivityTimeoutSeconds: number | null;
  }>) {
    const current = await this.getLoginSecuritySettings();
    const next = { ...current, ...updates };
    const [row] = await db.select({ id: loginSecuritySettings.id }).from(loginSecuritySettings).limit(1);
    if (row) {
      await db.update(loginSecuritySettings).set({ ...next, updatedAt: new Date() }).where(eq(loginSecuritySettings.id, row.id));
    } else {
      await db.insert(loginSecuritySettings).values(next);
    }
    return next;
  }
}
