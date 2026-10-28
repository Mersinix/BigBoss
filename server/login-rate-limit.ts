/**
 * Admin-configurable login rate limiting — IP-scoped, in-memory (same
 * ephemeral-on-restart/per-process tradeoff already accepted for
 * login-attempts.ts and the session MemoryStore). Deliberately separate from
 * the existing hardcoded `loginRateLimiter` (express-rate-limit, routes.ts),
 * which stays exactly as-is as a mandatory baseline that never depends on
 * this module or the admin-configurable settings.
 *
 * Why a second, hand-rolled layer instead of reconfiguring express-rate-limit
 * itself: that middleware instance is built once at module load with fixed
 * options and doesn't support changing its threshold/window at runtime. This
 * module re-reads the admin's current configuration on every request instead,
 * which is what makes the new settings take effect without a server restart
 * (task: "Expand Global Authentication & Security Settings").
 *
 * Fixed-window counter — simple and consistent in sophistication with
 * login-attempts.ts's own tracker; not a sliding-window algorithm.
 */

type WindowState = { count: number; windowStart: number };

const ipWindows = new Map<string, WindowState>();

/** Records one request for this IP and reports whether it exceeds the
 *  configured threshold within the current window. */
export function checkAndRecordLoginRateLimit(
  ip: string,
  maxRequests: number,
  windowSeconds: number,
): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const state = ipWindows.get(ip);

  if (!state || now - state.windowStart >= windowMs) {
    ipWindows.set(ip, { count: 1, windowStart: now });
    return { limited: false, retryAfterSeconds: 0 };
  }

  state.count += 1;
  if (state.count > maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((state.windowStart + windowMs - now) / 1000));
    return { limited: true, retryAfterSeconds };
  }
  return { limited: false, retryAfterSeconds: 0 };
}
