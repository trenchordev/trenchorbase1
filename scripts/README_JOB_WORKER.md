Job worker

This worker polls the Redis list `job-queue` and processes queued jobs.

Requirements:
- UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in environment.
- Run with Node 18+ in a long-running environment (not serverless).

Run:

```bash
node scripts/job-worker.js
```

Notes:
- The worker uses handler registry in `src/lib/agentHandlers.js`. Register additional handlers there or via `registerHandler(name, fn)`.
- For production, run this as a persistent service (systemd, PM2, Docker, etc.).
