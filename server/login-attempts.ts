/**
 * Per-account failed-login tracking — deliberately separate from the existing
 * IP-scoped `loginRateLimiter` (express-rate-limit) in routes.ts, which stays exactly
 * as it was: a much looser, longer-window backstop against distributed abuse (many
 * accounts guessed from one IP). This module is the tight, short, per-ACCOUNT layer:
 * 3 consecutive failures for the SAME account trigger a short, admin-configurable
 * cooldown for THAT account only — an unrelated account's attempts never touch this
 * one's counter (task's core complaint: attempts were previously only tracked at the
 * IP level, so different accounts "shared" the same budget).
 *
 * In-memory (a Map, same tradeoff already accepted for sessions — see
 * server/session.ts's MemoryStore): ephemeral, resets on server restart. That's fine
 * for a short security cooldown; the CONFIGURED duration itself is the only part that
 * needs to survive a restart, and that lives in the DB (shared/schema.ts
 * loginSecuritySettings), read fresh from storage every time a cooldown is triggered.
 */

const MAX_CONSECUTIVE_ATTEMPTS = 3;

type AttemptState = { count: number; cooldownUntil: number | null };

const attempts = new Map<string, AttemptState>();

export function normalizeLoginIdentifier(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Seconds remaining in an active cooldown for this identifier, or 0 if none/expired.
 *  Also clears an expired entry so it never lingers as stale state that could
 *  unexpectedly block a legitimate user later. */
export function getCooldownRemainingSeconds(identifier: string): number {
  const key = normalizeLoginIdentifier(identifier);
  const state = attempts.get(key);
  if (!state?.cooldownUntil) return 0;
  const remainingMs = state.cooldownUntil - Date.now();
  if (remainingMs <= 0) {
    attempts.delete(key);
    return 0;
  }
  return Math.ceil(remainingMs / 1000);
}

/** Records one failed attempt for this identifier. If this is the 3rd consecutive
 *  failure, starts a new cooldown of `cooldownSeconds` (the admin's CURRENTLY
 *  configured duration, read by the caller right before this call) and resets the
 *  counter for the next cycle. Returns the resulting cooldown (0 if not yet
 *  triggered) so the route can decide whether to respond 429 or a normal 401. */
export function recordFailedAttempt(identifier: string, cooldownSeconds: number): { cooldownRemainingSeconds: number } {
  const key = normalizeLoginIdentifier(identifier);
  const existing = attempts.get(key) ?? { count: 0, cooldownUntil: null };
  // A previous cooldown already ran out — this failure starts a fresh cycle rather
  // than piling onto a stale count.
  if (existing.cooldownUntil && existing.cooldownUntil <= Date.now()) {
    existing.count = 0;
    existing.cooldownUntil = null;
  }
  existing.count += 1;
  if (existing.count >= MAX_CONSECUTIVE_ATTEMPTS) {
    existing.cooldownUntil = Date.now() + cooldownSeconds * 1000;
    existing.count = 0;
  }
  attempts.set(key, existing);
  return { cooldownRemainingSeconds: existing.cooldownUntil ? Math.ceil((existing.cooldownUntil - Date.now()) / 1000) : 0 };
}

/** Successful login for this identifier — clears its counter/cooldown entirely, per
 *  the existing security policy ("successful authentication resets the counter"). */
export function resetLoginAttempts(identifier: string): void {
  attempts.delete(normalizeLoginIdentifier(identifier));
}
