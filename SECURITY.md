# Security model and production limitations

## Implemented in the Worker source

- Provider key is read from Cloudflare secret `GEMINI_API_KEY`, never from browser payload.
- Separate bearer access token is required for chat requests.
- Exact allow-list for browser `Origin`; wildcard CORS is not used.
- Only `/v1/chat/completions` and `/health` are exposed; chat route is POST-only.
- Model allow-list, supported role validation, text-only messages, message-count and size limits, temperature/token bounds, JSON parsing checks.
- Durable Object-backed rate limit, default 30 requests per token per 60 seconds.
- Upstream timeout, no-store responses, no deliberate logging of prompts or secrets.
- Rate limiter failure is fail-closed (503).

## Not solved by this pack

- The browser access token is stored in `localStorage` by the existing frontend. This is acceptable only for a trusted personal browser profile; it is not strong user authentication.
- A shared token is not per-user identity. All users sharing it share a quota bucket.
- CORS is a browser policy, not authentication. The bearer token and rate limit are still required.
- No account system, per-user billing, admin dashboard, audit log, abuse-report flow, or formal privacy/data-retention policy is included.
- The Worker forwards the request to Google's OpenAI-compatible endpoint; model availability and upstream behavior must be tested with the user's account.
- The browser's direct-provider mode still exists. It can keep provider keys in localStorage, so prefer the Worker path and never paste the Gemini key into the browser.
- No penetration test, external security audit, or live production deployment has been performed.

## Public deployment rule

Do not expose this as an unrestricted public AI service. For public or multi-user use, put the app behind Cloudflare Access or implement real per-user authentication, enforce user-level quotas and billing, monitor abuse, define retention/privacy behavior, and test the full deployment before launch.
