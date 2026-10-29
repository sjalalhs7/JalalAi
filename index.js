const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_BODY_BYTES = 1_000_000;
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 24_000;
const DEFAULT_RATE_LIMIT = 30;
const DEFAULT_RATE_WINDOW_SECONDS = 60;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",").map((x) => x.trim()).filter(Boolean);
}

function corsHeaders(origin, env) {
  const allowed = allowedOrigins(env);
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
  };
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i % a.length) || 0) ^ (b.charCodeAt(i % b.length) || 0);
  return diff === 0;
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function checkRateLimit(request, env, accessToken) {
  if (!env.RATE_LIMITER) return { ok: false, reason: "Rate limiter binding is missing" };
  const key = await digest(accessToken);
  const id = env.RATE_LIMITER.idFromName(key);
  const stub = env.RATE_LIMITER.get(id);
  const response = await stub.fetch("https://rate-limiter.internal/check", {
    method: "POST",
    headers: {
      "X-Rate-Limit": String(Number(env.RATE_LIMIT || DEFAULT_RATE_LIMIT)),
      "X-Rate-Window": String(Number(env.RATE_WINDOW_SECONDS || DEFAULT_RATE_WINDOW_SECONDS)),
    },
  });
  if (!response.ok) return { ok: false, reason: "Rate limiter unavailable" };
  const result = await response.json();
  return { ok: result.allowed === true, retryAfter: result.retryAfter || 0 };
}

async function readBodyWithLimit(request, maxBytes) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch (_) {}
        throw new RangeError("body-too-large");
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

function validateChatPayload(payload, env) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "Request body must be a JSON object.";
  const model = String(payload.model || DEFAULT_MODEL);
  const models = String(env.ALLOWED_MODELS || DEFAULT_MODEL).split(",").map((x) => x.trim()).filter(Boolean);
  if (!models.includes(model)) return `Model not allowed. Allowed model(s): ${models.join(", ")}.`;
  if (!Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > MAX_MESSAGES) {
    return `messages must contain between 1 and ${MAX_MESSAGES} entries.`;
  }
  let total = 0;
  for (const message of payload.messages) {
    if (!message || typeof message !== "object" || !["system", "user", "assistant"].includes(message.role)) return "Each message must have a supported role.";
    if (typeof message.content !== "string") return "Message content must be plain text.";
    total += message.content.length;
    if (message.content.length > 12_000) return "A message is too long.";
  }
  if (total > MAX_MESSAGE_CHARS) return "Combined message content is too large.";
  const temperature = payload.temperature === undefined ? 0.7 : Number(payload.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) return "temperature must be between 0 and 2.";
  const maxTokens = payload.max_tokens === undefined ? 700 : Number(payload.max_tokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) return "max_tokens must be an integer between 1 and 4096.";
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowed = allowedOrigins(env);
    const headers = corsHeaders(origin, env);

    if (origin && !allowed.includes(origin)) return json({ error: { message: "Origin not allowed." } }, 403, { "Vary": "Origin" });
    if (request.method === "OPTIONS") {
      if (!origin || !allowed.includes(origin)) return new Response(null, { status: 403, headers: { "Vary": "Origin" } });
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "jalalai-worker", providerConfigured: Boolean(env.GEMINI_API_KEY), authConfigured: Boolean(env.JALALAI_ACCESS_TOKEN), rateLimiterConfigured: Boolean(env.RATE_LIMITER) }, 200, headers);
    }

    if (url.pathname !== "/v1/chat/completions") return json({ error: { message: "Not found." } }, 404, headers);
    if (request.method !== "POST") return json({ error: { message: "Method not allowed." } }, 405, { ...headers, Allow: "POST, OPTIONS" });

    if (!env.JALALAI_ACCESS_TOKEN || !env.GEMINI_API_KEY) {
      return json({ error: { message: "Server is not configured. Set required Worker secrets." } }, 503, headers);
    }
    const auth = request.headers.get("Authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    if (!match || !constantTimeEqual(match[1], env.JALALAI_ACCESS_TOKEN)) {
      return json({ error: { message: "Unauthorized." } }, 401, headers);
    }

    const limiter = await checkRateLimit(request, env, match[1]);
    if (!limiter.ok) {
      if (limiter.retryAfter) headers["Retry-After"] = String(limiter.retryAfter);
      const status = limiter.reason ? 503 : 429;
      return json({ error: { message: status === 429 ? "Rate limit exceeded. Please retry later." : "Rate limiter unavailable; request denied." } }, status, headers);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: { message: "Request body is too large." } }, 413, headers);
    let raw;
    try { raw = await readBodyWithLimit(request, MAX_BODY_BYTES); }
    catch (error) {
      if (error instanceof RangeError && error.message === "body-too-large") return json({ error: { message: "Request body is too large." } }, 413, headers);
      return json({ error: { message: "Could not read request body." } }, 400, headers);
    }
    let payload;
    try { payload = JSON.parse(raw); } catch { return json({ error: { message: "Request body must be valid JSON." } }, 400, headers); }
    const validationError = validateChatPayload(payload, env);
    if (validationError) return json({ error: { message: validationError } }, 400, headers);

    const model = String(payload.model || DEFAULT_MODEL);
    const upstreamPayload = {
      model,
      messages: payload.messages,
      temperature: payload.temperature === undefined ? 0.7 : Number(payload.temperature),
      max_tokens: payload.max_tokens === undefined ? 700 : Number(payload.max_tokens),
      stream: false,
    };
    let upstream;
    try {
      upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.GEMINI_API_KEY}`,
        },
        body: JSON.stringify(upstreamPayload),
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      return json({ error: { message: "AI provider request failed or timed out." } }, 502, headers);
    }
    const body = await upstream.text();
    const responseHeaders = { ...headers, "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8", "Cache-Control": "no-store" };
    return new Response(body, { status: upstream.status, headers: responseHeaders });
  },
};

export class RateLimiter {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const limit = Math.max(1, Math.min(1000, Number(request.headers.get("X-Rate-Limit") || DEFAULT_RATE_LIMIT)));
    const windowSeconds = Math.max(10, Math.min(3600, Number(request.headers.get("X-Rate-Window") || DEFAULT_RATE_WINDOW_SECONDS)));
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const result = await this.ctx.storage.transaction(async (txn) => {
      const data = await txn.get("rate") || { start: now, count: 0 };
      let next = data;
      if (now - data.start >= windowMs || now < data.start) next = { start: now, count: 0 };
      if (next.count >= limit) {
        const retryAfter = Math.max(1, Math.ceil((next.start + windowMs - now) / 1000));
        await txn.put("rate", next);
        return { allowed: false, retryAfter };
      }
      next.count += 1;
      await txn.put("rate", next);
      return { allowed: true, remaining: limit - next.count };
    });
    return json(result);
  }
}
