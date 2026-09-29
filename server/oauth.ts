import type { Express } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { storage } from "./storage";

/**
 * Google/Facebook sign-in — for an EXISTING BigBossCoffee account only, matched by the
 * provider's own verified email. There is no "sign up with Google/Facebook": an email
 * with no matching account is sent back with a clear error rather than silently creating
 * one — registration (role selection, address, approval workflow) stays exclusively the
 * existing multi-step Inscription flow.
 *
 * Passport is used here purely for the OAuth handshake (authorization redirect + code
 * exchange + profile fetch) via `{ session: false }` — it never owns the app's session.
 * The callback routes below set `req.session.userId` themselves, exactly like the
 * existing email/password POST /api/auth/login, so there is only ever one session
 * mechanism in the app. `state: true` still works with `session: false`: express-session
 * itself (registered globally, independent of passport's own `session` option) is what
 * passport-oauth2 uses to stash/verify the anti-forgery state nonce.
 *
 * Both strategies are only registered when their env vars are actually present, so an
 * unconfigured provider never throws at startup — isGoogleConfigured()/
 * isFacebookConfigured() are the source of truth callers check before ever invoking
 * `passport.authenticate(...)`.
 */

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL);
}

export function isFacebookConfigured(): boolean {
  return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET && process.env.FACEBOOK_CALLBACK_URL);
}

if (isGoogleConfigured()) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    },
    // Hands the verified profile straight through — account lookup/session assignment
    // happens in the callback ROUTE below, not here, since passport session integration
    // is deliberately never used.
    (_accessToken, _refreshToken, profile, done) => done(null, profile),
  ));
}

if (isFacebookConfigured()) {
  passport.use(new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID!,
      clientSecret: process.env.FACEBOOK_APP_SECRET!,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL!,
      profileFields: ["id", "displayName", "emails"],
    },
    (_accessToken, _refreshToken, profile, done) => done(null, profile),
  ));
}

function extractEmail(profile: any): string | null {
  return profile?.emails?.[0]?.value ?? null;
}

export function registerOAuthRoutes(app: Express) {
  app.use(passport.initialize());

  // ── Google ──────────────────────────────────────────────────────────────────
  app.get("/api/auth/google", async (req, res, next) => {
    const settings = await storage.getAuthProviderSettings();
    if (!settings.googleEnabled || !isGoogleConfigured()) {
      return res.redirect("/?authError=google_unavailable");
    }
    // @types/passport-google-oauth20's AuthenticateOptionsGoogle narrows `state` to
    // `string` only, but passport-oauth2 (which this strategy is built on) accepts the
    // boolean form at runtime to auto-generate/verify a session-backed nonce — this is a
    // type-defs gap, not a real mismatch, hence the cast.
    passport.authenticate("google", { scope: ["profile", "email"], session: false, state: true } as any)(req, res, next);
  });

  app.get("/api/auth/google/callback", async (req, res, next) => {
    const settings = await storage.getAuthProviderSettings();
    if (!settings.googleEnabled || !isGoogleConfigured()) {
      return res.redirect("/?authError=google_unavailable");
    }
    passport.authenticate("google", { session: false }, async (err: any, profile: any) => {
      // No failureRedirect here on purpose — supplying this custom callback makes passport
      // hand control fully to us instead of auto-redirecting, so denied consent, a state
      // mismatch, and a genuine provider error all land here alike (never a stack trace or
      // provider error detail forwarded to the client).
      if (err || !profile) return res.redirect("/?authError=google_failed");
      const email = extractEmail(profile);
      if (!email) return res.redirect("/?authError=no_email_from_provider");
      const user = await storage.getUserByEmail(email);
      if (!user) return res.redirect("/?authError=no_account_google");
      req.session.userId = user.id;
      res.redirect("/");
    })(req, res, next);
  });

  // ── Facebook ────────────────────────────────────────────────────────────────
  app.get("/api/auth/facebook", async (req, res, next) => {
    const settings = await storage.getAuthProviderSettings();
    if (!settings.facebookEnabled || !isFacebookConfigured()) {
      return res.redirect("/?authError=facebook_unavailable");
    }
    // Same type-defs gap as the Google route above — `state: true` is valid at runtime.
    passport.authenticate("facebook", { scope: ["email"], session: false, state: true } as any)(req, res, next);
  });

  app.get("/api/auth/facebook/callback", async (req, res, next) => {
    const settings = await storage.getAuthProviderSettings();
    if (!settings.facebookEnabled || !isFacebookConfigured()) {
      return res.redirect("/?authError=facebook_unavailable");
    }
    passport.authenticate("facebook", { session: false }, async (err: any, profile: any) => {
      if (err || !profile) return res.redirect("/?authError=facebook_failed");
      const email = extractEmail(profile);
      if (!email) return res.redirect("/?authError=no_email_from_provider");
      const user = await storage.getUserByEmail(email);
      if (!user) return res.redirect("/?authError=no_account_facebook");
      req.session.userId = user.id;
      res.redirect("/");
    })(req, res, next);
  });
}
