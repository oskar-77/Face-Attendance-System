---
name: admin-panel Vite port detection timing
description: The admin-panel workflow on port 20130 sometimes fails restart detection even though Vite is running fine.
---

**Rule:** If `restart_workflow` returns DIDNT_OPEN_A_PORT for admin-panel, retry with `workflow_timeout=90`. Vite IS starting correctly (confirmed: curl returns HTTP 200 on port 20130).

**Why:** The Replit workflow port-detection health check races against Vite's ~300ms startup. Under load or on cold start, the check fires before Vite binds. The process keeps running fine; only the restart detection fails.

**How to apply:** Always use `workflow_timeout=90` for admin-panel restarts. If it still fails, start a background Vite process to warm the port, then retry.
