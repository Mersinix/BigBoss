---
name: Workflow orphan process recovery
description: Recover a failed Start application workflow when an earlier dev server process remains alive and blocks its ports.
---

When Start application is marked failed but the preview still responds, check for an older `npm run dev` process listening on both port 5000 and the Vite websocket port before changing application code. The new managed run can fail with `EADDRINUSE` while the old process continues serving pages.

**Why:** The workflow status can become detached from an earlier process; restarting then creates a port collision rather than fixing the stale process.

**How to apply:** Verify workflow logs, process ownership, bound ports, and HTTP health. Terminate only the stale workflow process group, confirm the ports are free, then restart the configured workflow once.
