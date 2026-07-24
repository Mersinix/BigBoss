import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

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
  wss.on("connection", (ws) => {
    let registeredUserId: number | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "user_register" && typeof msg.userId === "number") {
          registeredUserId = msg.userId;
          registerUser(msg.userId, ws);
        }
      } catch {}
    });

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
