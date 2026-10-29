# JalalAI — Professional Completion Pack

This pack preserves the existing single-file application and adds a safer, optional Cloudflare Worker proxy for Gemini-compatible chat. It is a deployment-ready source bundle, **not a claim that a live Cloudflare deployment already exists**.

## Included

- `jalalai-agent.html` — original source, preserved unchanged.
- `jalalai-agent-audited.html` — previous audit patch, preserved unchanged.
- `jalalai-agent-ui-v2.html` — previous UI refinement, preserved unchanged.
- `jalalai-agent-ui-v3.html` — updated settings guidance for Worker usage.
- `worker/index.js` — Cloudflare Worker API proxy, request validation, exact-origin CORS, server-side Gemini key, access-token gate, and Durable Object rate limiter.
- `worker/wrangler.toml` — Worker and Durable Object deployment configuration.
- `tests/worker.test.js` — automated Worker tests.
- `docs/DEPLOYMENT.md` — account-side deployment steps.
- `docs/SECURITY.md` — security boundaries and production limitations.

## Local checks

Requires Node.js 20+ (Node 22 was used for the recorded checks).

```sh
npm run check
npm test
```

## Important limitation

The browser's API key field still persists its value in `localStorage`. With the Worker architecture, enter the **JalalAI access token**, not the Gemini provider key. The Gemini provider key must exist only as a Cloudflare Worker secret. Anyone who can run same-origin JavaScript or access the browser profile can still steal the browser-side access token. For multi-user/public production, add Cloudflare Access or a real per-user authentication system, usage/billing controls, monitoring, and abuse response before opening the service broadly.
