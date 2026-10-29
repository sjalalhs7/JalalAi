import test from "node:test";
import assert from "node:assert/strict";
import worker, { RateLimiter } from "../worker/index.js";

const origin = "https://jalalai-test.pages.dev";
function makeEnv(overrides = {}) {
  const buckets = new Map();
  const RATE_LIMITER = {
    idFromName(name) { return { name }; },
    get(id) {
      return { async fetch(_url, init) {
        const limit = Number(init.headers["X-Rate-Limit"] || 30);
        const now = Date.now();
        const b = buckets.get(id.name) || { start: now, count: 0 };
        if (now - b.start >= 60_000) { b.start = now; b.count = 0; }
        if (b.count >= limit) return Response.json({ allowed: false, retryAfter: 60 }, { status: 200 });
        b.count++; buckets.set(id.name, b);
        return Response.json({ allowed: true, remaining: limit - b.count });
      } };
    },
  };
  return { ALLOWED_ORIGINS: origin, ALLOWED_MODELS: "gemini-2.5-flash", JALALAI_ACCESS_TOKEN: "test-token-123", GEMINI_API_KEY: "provider-secret", RATE_LIMITER, ...overrides };
}
function req(path = "/v1/chat/completions", { method = "POST", token = "test-token-123", body, headers = {} } = {}) {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const payload = { model: "gemini-2.5-flash", messages: [{ role: "user", content: "Hello" }], temperature: 0.7, max_tokens: 100 };

test("preflight returns only the configured origin", async () => {
  const response = await worker.fetch(req("/v1/chat/completions", { method: "OPTIONS", token: null }), makeEnv());
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
});

test("rejects an untrusted browser origin", async () => {
  const response = await worker.fetch(new Request("https://worker.test/v1/chat/completions", { method: "POST", headers: { Origin: "https://evil.example" } }), makeEnv());
  assert.equal(response.status, 403);
});

test("rejects missing or invalid access token", async () => {
  const response = await worker.fetch(req("/v1/chat/completions", { token: "wrong" , body: payload }), makeEnv());
  assert.equal(response.status, 401);
});

test("rejects unsupported routes and methods", async () => {
  assert.equal((await worker.fetch(req("/not-found", { body: payload }), makeEnv())).status, 404);
  assert.equal((await worker.fetch(req("/v1/chat/completions", { method: "GET", body: undefined }), makeEnv())).status, 405);
});

test("rejects invalid JSON, disallowed models, and invalid message roles", async () => {
  const env = makeEnv();
  assert.equal((await worker.fetch(req(undefined, { body: "{" }), env)).status, 400);
  assert.equal((await worker.fetch(req(undefined, { body: { ...payload, model: "unknown-model" } }), env)).status, 400);
  assert.equal((await worker.fetch(req(undefined, { body: { ...payload, messages: [{ role: "tool", content: "x" }] } }), env)).status, 400);
});

test("proxies validated chat to provider using server-side secret, never browser token", async (t) => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({ choices: [{ message: { content: "Hello from provider" } }] });
  };
  const response = await worker.fetch(req(undefined, { body: payload }), makeEnv());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, "Hello from provider");
  assert.equal(captured.url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assert.equal(captured.init.headers.Authorization, "Bearer provider-secret");
  assert.equal(captured.init.body.includes("test-token-123"), false);
});

test("health endpoint reveals configuration booleans, not secrets", async () => {
  const response = await worker.fetch(req("/health", { method: "GET", token: null }), makeEnv());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.providerConfigured, true);
  assert.equal(JSON.stringify(body).includes("provider-secret"), false);
});

test("Durable Object rate limiter enforces a per-window count", async () => {
  const memory = new Map();
  const storage = {
    async get(k) { return memory.get(k); },
    async put(k, v) { memory.set(k, structuredClone(v)); },
    async transaction(callback) {
      const staged = new Map(memory);
      const result = await callback({
        async get(k) { return staged.get(k); },
        async put(k, v) { staged.set(k, structuredClone(v)); },
      });
      memory.clear(); for (const [k, v] of staged) memory.set(k, v);
      return result;
    },
  };
  const ctx = { storage };
  const limiter = new RateLimiter(ctx, {});
  const call = () => limiter.fetch(new Request("https://rate-limiter.internal/check", { method: "POST", headers: { "X-Rate-Limit": "1", "X-Rate-Window": "60" } }));
  assert.equal((await (await call()).json()).allowed, true);
  assert.equal((await (await call()).json()).allowed, false);
});

test("fails closed if Durable Object rate limiter binding is missing", async () => {
  const env = makeEnv({ RATE_LIMITER: undefined });
  const response = await worker.fetch(req(undefined, { body: payload }), env);
  assert.equal(response.status, 503);
});

test("rejects oversized request bodies", async () => {
  const env = makeEnv();
  const huge = { model: "gemini-2.5-flash", messages: [{ role: "user", content: "x".repeat(1_000_100) }] };
  const response = await worker.fetch(req(undefined, { body: huge }), env);
  assert.equal(response.status, 413);
});
