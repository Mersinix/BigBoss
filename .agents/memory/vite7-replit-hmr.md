---
name: Vite 7 HMR on Replit
description: Vite 7 HMR WebSocket fails on Replit; fix is hmr:false in Replit env.
---

# Vite 7 HMR on Replit

**Rule:** In `server/vite.ts`, set `hmr: false` (not a custom hmr config) when `REPL_ID` is set.

**Why:** Vite 7 uses the `sec-websocket-protocol: vite-hmr` HTTP header to identify HMR WebSocket connections in middleware mode. Replit's reverse proxy strips this header. Without it, Vite's `hmrServerWsListener` never calls `handleUpgrade`, so the socket hangs and closes — producing the "WebSocket closed without opened" error. Older approaches (clientPort, host, protocol in hmrConfig) no longer work. The `legacy.skipWebSocketTokenCheck` option bypasses token validation but not the protocol-header check.

**How to apply:** In `server/vite.ts`:
```ts
const hmrConfig = process.env.REPL_ID ? false : { server };
```
With `hmr: false`, Vite doesn't attempt a WebSocket HMR connection at all (no console error). The app still reloads on manual refresh. This only affects the Replit dev environment.
