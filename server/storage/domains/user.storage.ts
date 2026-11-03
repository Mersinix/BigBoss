import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../../db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { users, maintenanceProfiles, passwordResetCodes, type InsertUser, type BillingInfo } from "@shared/schema";

// Stage 2 extraction — Batch 39: the complete generic User identity/
// account/profile/authentication-persistence domain (account CRUD,
// location/profile/billing updates, password hashing/verification, and
// the full password-reset code/token flow) moved verbatim out of
// server/storage.ts's DatabaseStorage class to
// server/storage/domains/user.storage.ts. These are thin delegates on
// DatabaseStorage preserving the exact original names/signatures — see
// server/STORAGE_ARCHITECTURE.md ("Batch 39") for the full ownership
// audit and dependency analysis.
//
// No facade constructor argument: every internal `this.*` call inside
// this cluster (verifyPassword -> hashPassword, createUser ->
// hashPassword, createPasswordResetCode/verifyPasswordResetCode/
// resetPasswordWithToken -> hashResetValue/getActivePasswordResetRow)
// targets another method that moved along with it — nothing here ever
// called back into DatabaseStorage.
//
// Domain-specific sub-account workflows that call these generic User
// methods (createDriverForOwner, createCafeForSupplier, getSupplierCafes,
// getDriversForOwner) remain resident in DatabaseStorage per the Batch 39
// ownership audit — they are Driver/Supplier-owner-scoped workflows, not
// generic User identity, and continue to call this.getUserByEmail(...)/
// this.createUser(...) exactly as before (now resolving through the thin
// facade delegates below). getAdminUserIds and
// filterUsersWithPreferenceEnabled were confirmed already resident in
// MessagesStorage/NotificationsStorage respectively (notification-
// fan-out-specific queries, not generic User identity) and were not
// moved here.
//
// resetPasswordWithToken's own db.transaction(...) is self-contained (it
// opens its own client and never receives one from outside), so it
// relocates safely per the established Batch-28 pattern — the
// project-wide transaction-site total is unaffected.
export class UserStorage {
  async getUser(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string) {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  // ── Password hashing ──────────────────────────────────────────────────────────
  // users.password used to be stored/compared as plaintext everywhere. hashPassword is
  // now the single write path (createUser, registration, password reset, Settings'
  // change-password) so every NEW/changed password is bcrypt from now on.
  // verifyPassword is the single read path: it accepts either a bcrypt hash (the normal
  // case going forward) or — for rows that predate this change — the legacy plaintext
  // value, and on a successful legacy match it transparently rehashes and saves it, so
  // every real account gets silently migrated to bcrypt on its next successful login/
  // password-change, with no forced reset and no disruption.
  private isBcryptHash(s: string): boolean {
    return /^\$2[aby]\$/.test(s);
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  async verifyPassword(userId: number, plain: string, stored: string): Promise<boolean> {
    if (this.isBcryptHash(stored)) return bcrypt.compare(plain, stored);
    if (plain !== stored) return false;
    await db.update(users).set({ password: await this.hashPassword(plain) }).where(eq(users.id, userId));
    return true;
  }

  async createUser(user: InsertUser) {
    const hashedUser = { ...user, password: await this.hashPassword((user as any).password) };
    const [created] = await db.insert(users).values(hashedUser as any).returning();
    // A Maintenance account gets its marketplace profile from the same
    // registration record. The profile remains private until the account is
    // approved, because marketplace queries filter by users.status.
    if (created.role === "MAINTENANCE") {
      await db.insert(maintenanceProfiles).values({
        userId: created.id,
        categories: created.maintenanceCategories ?? [],
      }).onConflictDoNothing({ target: maintenanceProfiles.userId });
    }
    return created;
  }

  async updateUserStatus(id: number, status: 'pending' | 'approved' | 'rejected') {
    const [updated] = await db.update(users).set({ status }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUser(id: number, data: Partial<any>) {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: number) {
    await db.delete(users).where(eq(users.id, id));
  }

  async updateUserLocation(id: number, loc: { address: string; lat: string; lng: string; placeId: string; details?: import("@shared/schema").AddressDetails }) {
    const [updated] = await db.update(users).set({
      locationAddress: loc.address,
      locationLat: loc.lat,
      locationLng: loc.lng,
      locationPlaceId: loc.placeId,
      locationDetails: loc.details ?? null,
    }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUserProfile(id: number, updates: { name?: string; phone?: string; email?: string; password?: string; isWhatsapp?: boolean; profileImageUrl?: string | null; coverImageUrl?: string | null; flashImageUrl?: string | null; locationDetails?: import("@shared/schema").AddressDetails | null }) {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return updated;
  }

  // ── Password reset ────────────────────────────────────────────────────────────
  // Two-phase: a 6-digit code is emailed and verified first, then a short-lived opaque
  // token authorizes the actual password change in a separate request (see
  // shared/schema.ts passwordResetCodes for the full rationale). Only hashes are ever
  // persisted; raw values exist only transiently in memory / in the outgoing email.

  private hashResetValue(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  /**
   * Creates a new reset code for this user, invalidating any still-usable prior codes first
   * (so requesting a new code always makes older ones dead, never leaving two valid codes at
   * once). Returns the RAW 6-digit code — the only caller allowed to see it is the route
   * handler, which passes it straight to sendPasswordResetEmail and never returns it in the
   * HTTP response.
   *
   * All expiry/cooldown timestamps here are computed and later compared using Postgres's own
   * now() (via sql`now() + interval ...`), never app-side `new Date()` arithmetic. These
   * columns are `timestamp without time zone`, and this database's session timezone is not
   * UTC — writing an app-computed Date through the driver and later comparing it against a
   * DB-computed defaultNow() value on the same column type produced a real, verified bug
   * (codeExpiresAt appearing to be over an hour before its own createdAt), which made the
   * resend cooldown permanently block every request. Keeping every write AND every comparison
   * on the database's clock avoids that entire class of mismatch.
   */
  async createPasswordResetCode(userId: number): Promise<string> {
    await db.update(passwordResetCodes)
      .set({ usedAt: sql`now()` })
      .where(and(eq(passwordResetCodes.userId, userId), isNull(passwordResetCodes.usedAt)));

    const code = String(crypto.randomInt(100000, 1000000));
    await db.insert(passwordResetCodes).values({
      userId,
      codeHash: this.hashResetValue(code),
      codeExpiresAt: sql`now() + interval '10 minutes'` as unknown as Date,
    });
    return code;
  }

  /** Most recent still-usable (not consumed) reset-code row for a user, if any — used both
   * to verify a code and to apply a short per-email cooldown on new requests. */
  private async getActivePasswordResetRow(userId: number) {
    const rows = await db.select().from(passwordResetCodes)
      .where(and(eq(passwordResetCodes.userId, userId), isNull(passwordResetCodes.usedAt)))
      .orderBy(desc(passwordResetCodes.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Cooldown check before issuing a new code, so "resend" can't be used to spam a user's
   * inbox or brute-force-probe email addresses at high volume. Computed entirely in SQL
   * (created_at vs now() - interval), never against an app-side Date — see
   * createPasswordResetCode's comment for why. */
  async canRequestNewPasswordResetCode(userId: number): Promise<boolean> {
    const [row] = await db.select({ tooSoon: sql<boolean>`${passwordResetCodes.createdAt} > now() - interval '60 seconds'` })
      .from(passwordResetCodes)
      .where(and(eq(passwordResetCodes.userId, userId), isNull(passwordResetCodes.usedAt)))
      .orderBy(desc(passwordResetCodes.createdAt))
      .limit(1);
    if (!row) return true;
    return !row.tooSoon;
  }

  private static readonly MAX_RESET_CODE_ATTEMPTS = 5;

  /**
   * Verifies a submitted code against this user's latest active reset request. On success,
   * consumes the code (so it can never be verified a second time) and issues a short-lived
   * opaque token (returned raw, stored only as a hash) that the final reset-password step
   * must present — the numeric code itself is never accepted again after this point.
   */
  async verifyPasswordResetCode(userId: number, code: string): Promise<
    { ok: true; resetToken: string } | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" }
  > {
    const row = await this.getActivePasswordResetRow(userId);
    if (!row) return { ok: false, reason: "invalid" };
    const [{ expired }] = await db.select({ expired: sql<boolean>`${passwordResetCodes.codeExpiresAt} < now()` })
      .from(passwordResetCodes).where(eq(passwordResetCodes.id, row.id));
    if (expired) return { ok: false, reason: "expired" };
    if (row.codeAttempts >= UserStorage.MAX_RESET_CODE_ATTEMPTS) {
      // Burn the row so a fresh "forgot password" request is required — caps total guesses
      // per emailed code at MAX_RESET_CODE_ATTEMPTS regardless of how this state was reached.
      await db.update(passwordResetCodes).set({ usedAt: sql`now()` }).where(eq(passwordResetCodes.id, row.id));
      return { ok: false, reason: "too_many_attempts" };
    }
    if (this.hashResetValue(code) !== row.codeHash) {
      await db.update(passwordResetCodes)
        .set({ codeAttempts: sql`${passwordResetCodes.codeAttempts} + 1` })
        .where(eq(passwordResetCodes.id, row.id));
      return { ok: false, reason: "invalid" };
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    await db.update(passwordResetCodes)
      .set({
        verifiedTokenHash: this.hashResetValue(resetToken),
        verifiedTokenExpiresAt: sql`now() + interval '10 minutes'` as unknown as Date,
      })
      .where(eq(passwordResetCodes.id, row.id));
    return { ok: true, resetToken };
  }

  /**
   * Applies the actual password change. Looks the row up strictly by the token's hash (never
   * trusts a client-supplied userId/email for this step) and requires usedAt still null and
   * the token not expired — so a token can authorize exactly one password change, for exactly
   * the account whose code was verified, and never after 10 minutes.
   */
  async resetPasswordWithToken(resetToken: string, newPassword: string): Promise<boolean> {
    const tokenHash = this.hashResetValue(resetToken);
    const [row] = await db.select().from(passwordResetCodes)
      .where(and(
        eq(passwordResetCodes.verifiedTokenHash, tokenHash),
        isNull(passwordResetCodes.usedAt),
        sql`${passwordResetCodes.verifiedTokenExpiresAt} > now()`,
      ));
    if (!row) return false;

    const hashed = await this.hashPassword(newPassword);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ password: hashed }).where(eq(users.id, row.userId));
      await tx.update(passwordResetCodes).set({ usedAt: sql`now()` }).where(eq(passwordResetCodes.id, row.id));
    });
    return true;
  }

  async updateUserBilling(id: number, billing: BillingInfo) {
    const [updated] = await db.update(users).set({ billingInfo: billing }).where(eq(users.id, id)).returning();
    return updated;
  }
}
