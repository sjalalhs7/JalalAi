# Cloudflare Pages + Workers deployment guide

These steps require the project owner's Cloudflare account. No account credentials or deployment token were supplied in this task, so the project has **not** been deployed from this environment.

## 1. Deploy the frontend to Pages

1. Open Cloudflare Dashboard → Workers & Pages → Create → Pages.
2. Choose direct upload / upload assets (the label may vary by dashboard version).
3. Upload `jalalai-agent-ui-v3.html` as the site's `index.html` (rename a copy to `index.html`; keep the versioned source file unchanged in your project archive).
4. Deploy and record the exact HTTPS origin, for example `https://your-project.pages.dev`.
5. Do not publish secrets in the HTML or repository.

If you already have a Pages project, deploy the `index.html` copy to that project instead of creating a second one.

## 2. Configure Worker origin and model

In `worker/wrangler.toml`, replace `https://YOUR-PROJECT.pages.dev` with the exact Pages origin. Keep origins comma-separated if you have multiple approved domains. Do not use `*`.

`ALLOWED_MODELS` must match the model identifier that your Google AI Studio / Gemini API account currently supports. The default is `gemini-2.5-flash`; verify availability for your account before relying on it.

## 3. Install Wrangler and deploy the Worker

From this pack's root:

```sh
npm install --global wrangler
wrangler login
cd worker
wrangler deploy
```

The Durable Object migration in `wrangler.toml` creates the rate-limiter namespace. If Cloudflare reports a migration/configuration error, stop and resolve it before opening the endpoint.

## 4. Add secrets (never paste them into source files)

From the `worker` directory:

```sh
wrangler secret put GEMINI_API_KEY
wrangler secret put JALALAI_ACCESS_TOKEN
```

- `GEMINI_API_KEY`: the private provider key from Google AI Studio.
- `JALALAI_ACCESS_TOKEN`: a long, random, separate token for the JalalAI frontend. Do not reuse the Gemini key. Generate it locally using a password manager or a cryptographically secure generator; do not send it in chat.

The Worker returns a 503 until both secrets are set. `ALLOWED_ORIGINS` and `ALLOWED_MODELS` are ordinary non-secret variables in `wrangler.toml`.

## 5. Configure JalalAI Settings

In the deployed frontend, open Settings and set:

- API Key / JalalAI Worker Access Token: the `JALALAI_ACCESS_TOKEN` value.
- API Base URL: `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/v1` (replace with the URL Wrangler reports).
- Model name: the exact model allowed by `ALLOWED_MODELS`, normally `gemini-2.5-flash` for the provided default configuration.

Save, then send a short chat message. This is a live integration test and may consume provider quota. Do not share the access token or deploy it into an untrusted shared browser profile.

## 6. Smoke checks

Open `https://YOUR-WORKER...workers.dev/health`. It should report booleans such as `providerConfigured`, `authConfigured`, and `rateLimiterConfigured`; it never returns secret values. Then test chat from the approved Pages origin. A health response only verifies Worker configuration, not successful provider inference.

## Rollback

Keep previous versioned HTML files. If the new frontend misbehaves, redeploy the prior known-good HTML. If a provider key or access token is exposed, rotate the corresponding Cloudflare secret immediately and redeploy if needed.
