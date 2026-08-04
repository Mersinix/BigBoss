/**
 * Shared session middleware — imported by both routes.ts and ws.ts so that
 * WebSocket connections can be authenticated from the same session store as HTTP.
 */
import session from "express-session";
import MemoryStore from "memorystore";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const SessionStore = MemoryStore(session);

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  store: new SessionStore({ checkPeriod: 86400000 }),
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
});
