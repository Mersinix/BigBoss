import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { sessionMiddleware } from "./session";

let wss: WebSocketServer | null = null;

// userId → set of active WebSocket connections (multiple tabs / devices)
const userSockets = new Map<number, Set<WebSocket>>();

function registerUser(userId: number, ws: WebSocket) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId)!.add(ws);
}

function unregisterUser(userId: number, ws: WebSocket) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) userSockets.delete(userId);
}

export function setupWebSocket(httpServer: Server) {
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req: any) => {
    let registeredUserId: number | null = null;

    // Authenticate server-side from the session cookie — never trust client-supplied userId.
    // express-session parses the cookie and loads the store asynchronously; we provide a
    // minimal no-op response object since we have no HTTP response to write headers to.
    const fakeRes: any = {
      getHeader: () => undefined,
      setHeader: () => {},
      end: () => {},
    };
    sessionMiddleware(req, fakeRes, () => {
      const userId: unknown = req.session?.userId;
      if (typeof userId === "number") {
        registeredUserId = userId;
        registerUser(userId, ws);
      }
    });

    // Ignore client-provided user_register messages — registration is now server-side only.
    ws.on("message", () => {});

    ws.on("close", () => {
      if (registeredUserId !== null) unregisterUser(registeredUserId, ws);
    });

    ws.on("error", () => {});
  });
}

/** Broadcast an event to every connected client (existing behavior, unchanged). */
export function broadcast(event: string, data?: any) {
  if (!wss) return;
  const msg = JSON.stringify({ event, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

/** Send an event only to specific users (targeted messaging). */
export function broadcastToUsers(userIds: number[], event: string, data?: any) {
  if (!wss) return;
  const msg = JSON.stringify({ event, data });
  for (const userId of userIds) {
    const sockets = userSockets.get(userId);
    if (!sockets) continue;
    for (const ws of Array.from(sockets)) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }
}
